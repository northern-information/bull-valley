// The account store: what the valley remembers about who signs in. One
// account per person, any number of linked providers, one username. The
// interface is here with an in-memory store for the tests and dev tools;
// production is the D1 store in d1accounts.ts.

import { askOutcome, FRIENDS_MAX } from '../src/friends.ts'
import { EMPTY_HOTBAR } from '../src/hotbar.ts'
import { DEFAULT_SETTINGS } from '../src/settings.ts'
import type {
  HotbarWire,
  LookWire,
  Provider,
  SettingsWire,
} from '../src/account.ts'
import type { AskResult, FriendRow, FriendState } from '../src/friends.ts'

export interface Account {
  accountId: string
  // Null until chosen; changed only at Gron.
  username: string | null
  role: string
  // The providerKey whose display name and avatar stand for the account.
  primaryProvider: string
  createdAt: number
  lastLoginAt: number
}

export interface LinkedProvider {
  // `provider:id` (oauth.ts providerKey).
  providerKey: string
  accountId: string
  provider: Provider
  providerId: string
  displayName: string
  avatarUrl: string | null
  linkedAt: number
}

export type SetUsernameResult = 'ok' | 'taken' | 'already-set' | 'missing'
export type RenameResult = 'ok' | 'taken' | 'missing'
export type LinkResult = 'ok' | 'already-linked' | 'linked-elsewhere'
export type UnlinkResult = 'ok' | 'last-provider' | 'not-linked'

export interface AccountStore {
  findByProvider(providerKey: string): Promise<LinkedProvider | null>
  get(accountId: string): Promise<Account | null>
  // A new account and its first provider, together; false, and nothing
  // created, when another account has linked the provider meanwhile.
  create(account: Account, provider: LinkedProvider): Promise<boolean>
  touchLogin(accountId: string, now: number): Promise<void>
  // The provider's display name and avatar as of this sign-in.
  updateProfile(
    providerKey: string,
    displayName: string,
    avatarUrl: string | null
  ): Promise<void>
  providersOf(accountId: string): Promise<LinkedProvider[]>
  // Set once; `taken` is case-insensitive.
  setUsername(accountId: string, username: string): Promise<SetUsernameResult>
  // A new username for an account that has one (Gron). `taken` is
  // case-insensitive and never the account's own name, so a raider can
  // change only the case of theirs.
  renameUsername(accountId: string, username: string): Promise<RenameResult>
  usernameAvailable(username: string): Promise<boolean>
  linkProvider(provider: LinkedProvider): Promise<LinkResult>
  // Refuses to leave an account with no way to sign in. Unlinking the
  // primary provider promotes another.
  unlinkProvider(accountId: string, provider: Provider): Promise<UnlinkResult>
  // The character and guitar finish; both null until first chosen.
  lookOf(accountId: string): Promise<LookWire>
  // False when there is no such account.
  setLook(accountId: string, look: LookWire): Promise<boolean>
  // The number keys' items; all null until first assigned.
  hotbarOf(accountId: string): Promise<HotbarWire>
  // False when there is no such account.
  setHotbar(accountId: string, hotbar: HotbarWire): Promise<boolean>
  // The raider's settings; the defaults until first changed.
  settingsOf(accountId: string): Promise<SettingsWire>
  // False when there is no such account.
  setSettings(accountId: string, settings: SettingsWire): Promise<boolean>
  // The account signed in as `username`, in any case, or null.
  accountByUsername(
    username: string
  ): Promise<{ accountId: string; username: string } | null>
  // Every friendship and request the account is part of, by username
  // (friends.ts FriendRow).
  friendsOf(accountId: string): Promise<FriendRow[]>
  // `from` asks `to` (friends.ts askOutcome): a request kept, or `to`'s
  // own request accepted and the two made friends, all at once.
  askFriend(from: string, to: string, now: number): Promise<AskResult>
  // No longer friends, and no request either way; false when there was
  // nothing between them.
  unfriend(a: string, b: string): Promise<boolean>
}

export class MemoryAccountStore implements AccountStore {
  readonly accounts = new Map<string, Account>()
  readonly providers = new Map<string, LinkedProvider>()
  readonly looks = new Map<string, LookWire>()
  readonly hotbars = new Map<string, HotbarWire>()
  readonly settings = new Map<string, SettingsWire>()
  // `${account}/${friend}` -> accepted: one account's side, as in D1.
  readonly friends = new Map<string, boolean>()

  findByProvider(providerKey: string): Promise<LinkedProvider | null> {
    return Promise.resolve(this.providers.get(providerKey) ?? null)
  }

  get(accountId: string): Promise<Account | null> {
    return Promise.resolve(this.accounts.get(accountId) ?? null)
  }

  create(account: Account, provider: LinkedProvider): Promise<boolean> {
    if (this.providers.has(provider.providerKey)) return Promise.resolve(false)
    this.accounts.set(account.accountId, { ...account })
    this.providers.set(provider.providerKey, { ...provider })
    return Promise.resolve(true)
  }

  touchLogin(accountId: string, now: number): Promise<void> {
    const account = this.accounts.get(accountId)
    if (account) account.lastLoginAt = now
    return Promise.resolve()
  }

  updateProfile(
    providerKey: string,
    displayName: string,
    avatarUrl: string | null
  ): Promise<void> {
    const provider = this.providers.get(providerKey)
    if (provider) {
      provider.displayName = displayName
      provider.avatarUrl = avatarUrl
    }
    return Promise.resolve()
  }

  providersOf(accountId: string): Promise<LinkedProvider[]> {
    return Promise.resolve(
      [...this.providers.values()]
        .filter((p) => p.accountId === accountId)
        .sort((a, b) => a.linkedAt - b.linkedAt)
        .map((p) => ({ ...p }))
    )
  }

  setUsername(accountId: string, username: string): Promise<SetUsernameResult> {
    const account = this.accounts.get(accountId)
    if (!account) return Promise.resolve('missing')
    if (account.username !== null) return Promise.resolve('already-set')
    if (this.taken(username)) return Promise.resolve('taken')
    account.username = username
    return Promise.resolve('ok')
  }

  renameUsername(accountId: string, username: string): Promise<RenameResult> {
    const account = this.accounts.get(accountId)
    if (!account) return Promise.resolve('missing')
    if (this.taken(username, accountId)) return Promise.resolve('taken')
    account.username = username
    return Promise.resolve('ok')
  }

  usernameAvailable(username: string): Promise<boolean> {
    return Promise.resolve(!this.taken(username))
  }

  linkProvider(provider: LinkedProvider): Promise<LinkResult> {
    const existing = this.providers.get(provider.providerKey)
    if (existing) {
      return Promise.resolve(
        existing.accountId === provider.accountId
          ? 'already-linked'
          : 'linked-elsewhere'
      )
    }
    this.providers.set(provider.providerKey, { ...provider })
    return Promise.resolve('ok')
  }

  async unlinkProvider(
    accountId: string,
    provider: Provider
  ): Promise<UnlinkResult> {
    const linked = await this.providersOf(accountId)
    if (linked.length <= 1) return 'last-provider'
    const target = linked.find((p) => p.provider === provider)
    if (!target) return 'not-linked'
    this.providers.delete(target.providerKey)
    const account = this.accounts.get(accountId)
    if (account && account.primaryProvider === target.providerKey) {
      const next = linked.find((p) => p.providerKey !== target.providerKey)
      if (next) account.primaryProvider = next.providerKey
    }
    return 'ok'
  }

  lookOf(accountId: string): Promise<LookWire> {
    return Promise.resolve(
      this.looks.get(accountId) ?? { outfit: null, finish: null }
    )
  }

  setLook(accountId: string, look: LookWire): Promise<boolean> {
    if (!this.accounts.has(accountId)) return Promise.resolve(false)
    this.looks.set(accountId, { ...look })
    return Promise.resolve(true)
  }

  hotbarOf(accountId: string): Promise<HotbarWire> {
    return Promise.resolve(this.hotbars.get(accountId) ?? EMPTY_HOTBAR)
  }

  setHotbar(accountId: string, hotbar: HotbarWire): Promise<boolean> {
    if (!this.accounts.has(accountId)) return Promise.resolve(false)
    this.hotbars.set(accountId, [...hotbar])
    return Promise.resolve(true)
  }

  settingsOf(accountId: string): Promise<SettingsWire> {
    return Promise.resolve(this.settings.get(accountId) ?? DEFAULT_SETTINGS)
  }

  setSettings(accountId: string, settings: SettingsWire): Promise<boolean> {
    if (!this.accounts.has(accountId)) return Promise.resolve(false)
    this.settings.set(accountId, { ...settings })
    return Promise.resolve(true)
  }

  // Whether another account holds the name; `except` is never counted.
  accountByUsername(
    username: string
  ): Promise<{ accountId: string; username: string } | null> {
    for (const account of this.accounts.values()) {
      if (
        account.username !== null &&
        account.username.toLowerCase() === username.toLowerCase()
      ) {
        return Promise.resolve({
          accountId: account.accountId,
          username: account.username,
        })
      }
    }
    return Promise.resolve(null)
  }

  friendsOf(accountId: string): Promise<FriendRow[]> {
    const rows: FriendRow[] = []
    const add = (other: string, state: FriendState) => {
      const username = this.accounts.get(other)?.username
      if (username) rows.push({ accountId: other, username, state })
    }
    for (const [key, accepted] of this.friends) {
      const [a, b] = key.split('/')
      if (a === accountId) add(b, accepted ? 'friend' : 'asked')
      else if (b === accountId && !accepted && !this.friends.has(`${b}/${a}`)) {
        add(a, 'asking')
      }
    }
    return Promise.resolve(rows)
  }

  async askFriend(from: string, to: string, _now: number): Promise<AskResult> {
    const rows = await this.friendsOf(from)
    const state = rows.find((r) => r.accountId === to)?.state ?? null
    const outcome = askOutcome(state, from === to)
    if (outcome === 'requested' && rows.length >= FRIENDS_MAX) return 'full'
    if (outcome === 'requested') this.friends.set(`${from}/${to}`, false)
    if (outcome === 'accepted') {
      this.friends.set(`${to}/${from}`, true)
      this.friends.set(`${from}/${to}`, true)
    }
    return outcome
  }

  unfriend(a: string, b: string): Promise<boolean> {
    const one = this.friends.delete(`${a}/${b}`)
    const other = this.friends.delete(`${b}/${a}`)
    return Promise.resolve(one || other)
  }

  private taken(username: string, except?: string): boolean {
    const want = username.toLowerCase()
    for (const account of this.accounts.values()) {
      if (account.accountId === except) continue
      if (account.username?.toLowerCase() === want) return true
    }
    return false
  }
}
