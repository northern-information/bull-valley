// The account store on D1 (migrations/*.sql). Thin: every rule lives in
// the SQL (the unique username index, the foreign key) or in auth.ts.
// tests/worker/accounts.test.ts runs it against the migrations on SQLite.

import { isSelectable } from '../src/characters.ts'
import { isFinish } from '../src/finishes.ts'
import { askOutcome, FRIENDS_MAX } from '../src/friends.ts'
import { toHotbar } from '../src/hotbar.ts'
import { toSettings } from '../src/settings.ts'
import type {
  HotbarWire,
  LookWire,
  Provider,
  SettingsWire,
} from '../src/account.ts'
import type { AskResult, FriendRow, FriendState } from '../src/friends.ts'
import type {
  Account,
  AccountStore,
  LinkedProvider,
  LinkResult,
  RenameResult,
  SetUsernameResult,
  UnlinkResult,
} from './accounts.ts'

interface AccountRow {
  account_id: string
  username: string | null
  role: string
  primary_provider: string
  created_at: number
  last_login_at: number
}

interface ProviderRow {
  provider_key: string
  account_id: string
  provider: string
  provider_id: string
  display_name: string
  avatar_url: string | null
  linked_at: number
}

const toAccount = (row: AccountRow): Account => ({
  accountId: row.account_id,
  username: row.username,
  role: row.role,
  primaryProvider: row.primary_provider,
  createdAt: row.created_at,
  lastLoginAt: row.last_login_at,
})

const toProvider = (row: ProviderRow): LinkedProvider => ({
  providerKey: row.provider_key,
  accountId: row.account_id,
  provider: row.provider as Provider,
  providerId: row.provider_id,
  displayName: row.display_name,
  avatarUrl: row.avatar_url,
  linkedAt: row.linked_at,
})

const isUniqueViolation = (err: unknown): boolean =>
  /UNIQUE constraint failed/i.test(String(err))

export class D1AccountStore implements AccountStore {
  private readonly db: D1Database

  constructor(db: D1Database) {
    this.db = db
  }

  async findByProvider(providerKey: string): Promise<LinkedProvider | null> {
    const row = await this.db
      .prepare('SELECT * FROM providers WHERE provider_key = ?')
      .bind(providerKey)
      .first<ProviderRow>()
    return row ? toProvider(row) : null
  }

  async get(accountId: string): Promise<Account | null> {
    const row = await this.db
      .prepare('SELECT * FROM accounts WHERE account_id = ?')
      .bind(accountId)
      .first<AccountRow>()
    return row ? toAccount(row) : null
  }

  async create(account: Account, provider: LinkedProvider): Promise<boolean> {
    try {
      await this.db.batch([
        this.db
          .prepare(
            'INSERT INTO accounts (account_id, username, role, primary_provider, created_at, last_login_at) VALUES (?, ?, ?, ?, ?, ?)'
          )
          .bind(
            account.accountId,
            account.username,
            account.role,
            account.primaryProvider,
            account.createdAt,
            account.lastLoginAt
          ),
        this.insertProvider(provider),
      ])
    } catch (err) {
      // Linked by another request since the caller looked; the batch is one
      // transaction, so the account row went too.
      if (isUniqueViolation(err)) return false
      throw err
    }
    return true
  }

  async touchLogin(accountId: string, now: number): Promise<void> {
    await this.db
      .prepare('UPDATE accounts SET last_login_at = ? WHERE account_id = ?')
      .bind(now, accountId)
      .run()
  }

  async updateProfile(
    providerKey: string,
    displayName: string,
    avatarUrl: string | null
  ): Promise<void> {
    await this.db
      .prepare(
        'UPDATE providers SET display_name = ?, avatar_url = ? WHERE provider_key = ?'
      )
      .bind(displayName, avatarUrl, providerKey)
      .run()
  }

  async providersOf(accountId: string): Promise<LinkedProvider[]> {
    const { results } = await this.db
      .prepare(
        'SELECT * FROM providers WHERE account_id = ? ORDER BY linked_at, provider_key'
      )
      .bind(accountId)
      .all<ProviderRow>()
    return results.map(toProvider)
  }

  async setUsername(
    accountId: string,
    username: string
  ): Promise<SetUsernameResult> {
    const account = await this.get(accountId)
    if (!account) return 'missing'
    if (account.username !== null) return 'already-set'
    try {
      const result = await this.db
        .prepare(
          'UPDATE accounts SET username = ? WHERE account_id = ? AND username IS NULL'
        )
        .bind(username, accountId)
        .run()
      return result.meta.changes === 1 ? 'ok' : 'already-set'
    } catch (err) {
      if (isUniqueViolation(err)) return 'taken'
      throw err
    }
  }

  async renameUsername(
    accountId: string,
    username: string
  ): Promise<RenameResult> {
    try {
      // The unique index compares against the other rows, so the account
      // may change only the case of its own name.
      const result = await this.db
        .prepare('UPDATE accounts SET username = ? WHERE account_id = ?')
        .bind(username, accountId)
        .run()
      return result.meta.changes === 1 ? 'ok' : 'missing'
    } catch (err) {
      if (isUniqueViolation(err)) return 'taken'
      throw err
    }
  }

  async usernameAvailable(username: string): Promise<boolean> {
    const row = await this.db
      .prepare(
        'SELECT account_id FROM accounts WHERE username = ? COLLATE NOCASE'
      )
      .bind(username)
      .first<{ account_id: string }>()
    return row === null
  }

  async linkProvider(provider: LinkedProvider): Promise<LinkResult> {
    const existing = await this.findByProvider(provider.providerKey)
    if (existing) {
      return existing.accountId === provider.accountId
        ? 'already-linked'
        : 'linked-elsewhere'
    }
    try {
      await this.insertProvider(provider).run()
    } catch (err) {
      // Linked by another request between the lookup and the insert.
      if (isUniqueViolation(err)) return 'linked-elsewhere'
      throw err
    }
    return 'ok'
  }

  async unlinkProvider(
    accountId: string,
    provider: Provider
  ): Promise<UnlinkResult> {
    const linked = await this.providersOf(accountId)
    if (linked.length <= 1) return 'last-provider'
    const target = linked.find((p) => p.provider === provider)
    if (!target) return 'not-linked'
    // The delete counts the providers itself, so two unlinks at once can
    // never take the last one; the primary then moves to the oldest left.
    const [removed] = await this.db.batch([
      this.db
        .prepare(
          'DELETE FROM providers WHERE provider_key = ? AND ' +
            '(SELECT COUNT(*) FROM providers WHERE account_id = ?) > 1'
        )
        .bind(target.providerKey, accountId),
      this.db
        .prepare(
          'UPDATE accounts SET primary_provider = (' +
            'SELECT provider_key FROM providers WHERE account_id = ?1 ' +
            'ORDER BY linked_at, provider_key LIMIT 1' +
            ') WHERE account_id = ?1 AND primary_provider NOT IN (' +
            'SELECT provider_key FROM providers WHERE account_id = ?1)'
        )
        .bind(accountId),
    ])
    return (removed?.meta.changes ?? 0) > 0 ? 'ok' : 'last-provider'
  }

  async lookOf(accountId: string): Promise<LookWire> {
    const row = await this.db
      .prepare('SELECT outfit, finish FROM accounts WHERE account_id = ?')
      .bind(accountId)
      .first<{ outfit: string | null; finish: string | null }>()
    // A pick since dropped from the roster or the table reads as unchosen.
    const outfit = row?.outfit
    const finish = row?.finish
    return {
      outfit: isSelectable(outfit) ? outfit : null,
      finish: isFinish(finish) ? finish : null,
    }
  }

  async setLook(accountId: string, look: LookWire): Promise<boolean> {
    const result = await this.db
      .prepare(
        'UPDATE accounts SET outfit = ?, finish = ? WHERE account_id = ?'
      )
      .bind(look.outfit, look.finish, accountId)
      .run()
    return result.meta.changes === 1
  }

  async hotbarOf(accountId: string): Promise<HotbarWire> {
    const row = await this.db
      .prepare('SELECT hotbar FROM accounts WHERE account_id = ?')
      .bind(accountId)
      .first<{ hotbar: string | null }>()
    // Unset, unreadable, or naming an item since dropped: an empty bar.
    if (!row?.hotbar) return toHotbar(null)
    try {
      return toHotbar(JSON.parse(row.hotbar))
    } catch {
      return toHotbar(null)
    }
  }

  async setHotbar(accountId: string, hotbar: HotbarWire): Promise<boolean> {
    const result = await this.db
      .prepare('UPDATE accounts SET hotbar = ? WHERE account_id = ?')
      .bind(JSON.stringify(hotbar), accountId)
      .run()
    return result.meta.changes === 1
  }

  async settingsOf(accountId: string): Promise<SettingsWire> {
    const row = await this.db
      .prepare('SELECT settings FROM accounts WHERE account_id = ?')
      .bind(accountId)
      .first<{ settings: string | null }>()
    // Unset or unreadable: the defaults.
    if (!row?.settings) return toSettings(null)
    try {
      return toSettings(JSON.parse(row.settings))
    } catch {
      return toSettings(null)
    }
  }

  async setSettings(
    accountId: string,
    settings: SettingsWire
  ): Promise<boolean> {
    const result = await this.db
      .prepare('UPDATE accounts SET settings = ? WHERE account_id = ?')
      .bind(JSON.stringify(settings), accountId)
      .run()
    return result.meta.changes === 1
  }

  async accountByUsername(
    username: string
  ): Promise<{ accountId: string; username: string } | null> {
    const row = await this.db
      .prepare(
        'SELECT account_id, username FROM accounts WHERE username = ? COLLATE NOCASE'
      )
      .bind(username)
      .first<{ account_id: string; username: string }>()
    return row ? { accountId: row.account_id, username: row.username } : null
  }

  // This account's own rows (friends, and those it asked), then those
  // asking it that it has not asked back.
  async friendsOf(accountId: string): Promise<FriendRow[]> {
    const { results } = await this.db
      .prepare(
        'SELECT a.account_id AS id, a.username AS username, ' +
          "CASE WHEN f.accepted = 1 THEN 'friend' ELSE 'asked' END AS state " +
          'FROM friends f JOIN accounts a ON a.account_id = f.friend_id ' +
          'WHERE f.account_id = ?1 AND a.username IS NOT NULL ' +
          'UNION ALL ' +
          "SELECT a.account_id, a.username, 'asking' " +
          'FROM friends f JOIN accounts a ON a.account_id = f.account_id ' +
          'WHERE f.friend_id = ?1 AND f.accepted = 0 AND a.username IS NOT NULL ' +
          'AND NOT EXISTS (SELECT 1 FROM friends g WHERE g.account_id = ?1 AND g.friend_id = f.account_id)'
      )
      .bind(accountId)
      .all<{ id: string; username: string; state: FriendState }>()
    return results.map((r) => ({
      accountId: r.id,
      username: r.username,
      state: r.state,
    }))
  }

  // The asker's list is read first; a request is one row, an acceptance
  // two in one batch, so a pair is never left half friends.
  async askFriend(from: string, to: string, now: number): Promise<AskResult> {
    const rows = await this.friendsOf(from)
    const state = rows.find((r) => r.accountId === to)?.state ?? null
    const outcome = askOutcome(state, from === to)
    if (outcome !== 'requested' && outcome !== 'accepted') return outcome
    if (outcome === 'requested' && rows.length >= FRIENDS_MAX) return 'full'
    // The ask is one row, the other side's a second: both are accepted by
    // whichever ask finds the other's row there, so two asking each other
    // at once are friends whatever the order, never each waiting on the
    // other. The rows say what came of it, not the read above.
    await this.db
      .prepare(
        'INSERT OR IGNORE INTO friends (account_id, friend_id, accepted, since) VALUES (?, ?, 0, ?)'
      )
      .bind(from, to, now)
      .run()
    const { meta } = await this.db
      .prepare(
        'UPDATE friends SET accepted = 1, since = ?3 ' +
          'WHERE ((account_id = ?1 AND friend_id = ?2) OR (account_id = ?2 AND friend_id = ?1)) ' +
          'AND EXISTS (SELECT 1 FROM friends WHERE account_id = ?2 AND friend_id = ?1)'
      )
      .bind(from, to, now)
      .run()
    return meta.changes > 0 ? 'accepted' : 'requested'
  }

  async unfriend(a: string, b: string): Promise<boolean> {
    const result = await this.db
      .prepare(
        'DELETE FROM friends WHERE (account_id = ?1 AND friend_id = ?2) OR (account_id = ?2 AND friend_id = ?1)'
      )
      .bind(a, b)
      .run()
    return result.meta.changes > 0
  }

  private insertProvider(provider: LinkedProvider): D1PreparedStatement {
    return this.db
      .prepare(
        'INSERT INTO providers (provider_key, account_id, provider, provider_id, display_name, avatar_url, linked_at) VALUES (?, ?, ?, ?, ?, ?, ?)'
      )
      .bind(
        provider.providerKey,
        provider.accountId,
        provider.provider,
        provider.providerId,
        provider.displayName,
        provider.avatarUrl,
        provider.linkedAt
      )
  }
}
