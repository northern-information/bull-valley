// The account store on D1 (migrations/*.sql). Thin: every rule lives in
// the SQL (the unique username index, the foreign key) or in auth.ts. The
// Worker tests use the in-memory store; this one is exercised end to end.

import { isSelectable } from '../src/characters.ts'
import { isFinish } from '../src/finishes.ts'
import { toHotbar } from '../src/hotbar.ts'
import type { HotbarWire, LookWire, Provider } from '../src/account.ts'
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

  async create(account: Account, provider: LinkedProvider): Promise<void> {
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
    const next = linked.find((p) => p.providerKey !== target.providerKey)
    await this.db.batch([
      this.db
        .prepare('DELETE FROM providers WHERE provider_key = ?')
        .bind(target.providerKey),
      this.db
        .prepare(
          'UPDATE accounts SET primary_provider = ? WHERE account_id = ? AND primary_provider = ?'
        )
        .bind(next?.providerKey ?? null, accountId, target.providerKey),
    ])
    return 'ok'
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
