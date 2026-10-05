// The account store: what the valley remembers about who signs in. One
// account per person, any number of linked providers, one username. The
// interface is here with an in-memory store for the tests and dev tools;
// production is the D1 store in d1accounts.ts.

import type { Provider } from '../src/account.ts'

export interface Account {
  accountId: string
  // Null until chosen; set once.
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
export type LinkResult = 'ok' | 'already-linked' | 'linked-elsewhere'
export type UnlinkResult = 'ok' | 'last-provider' | 'not-linked'

export interface AccountStore {
  findByProvider(providerKey: string): Promise<LinkedProvider | null>
  get(accountId: string): Promise<Account | null>
  // A new account and its first provider, together.
  create(account: Account, provider: LinkedProvider): Promise<void>
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
  usernameAvailable(username: string): Promise<boolean>
  linkProvider(provider: LinkedProvider): Promise<LinkResult>
  // Refuses to leave an account with no way to sign in. Unlinking the
  // primary provider promotes another.
  unlinkProvider(accountId: string, provider: Provider): Promise<UnlinkResult>
}

export class MemoryAccountStore implements AccountStore {
  readonly accounts = new Map<string, Account>()
  readonly providers = new Map<string, LinkedProvider>()

  findByProvider(providerKey: string): Promise<LinkedProvider | null> {
    return Promise.resolve(this.providers.get(providerKey) ?? null)
  }

  get(accountId: string): Promise<Account | null> {
    return Promise.resolve(this.accounts.get(accountId) ?? null)
  }

  create(account: Account, provider: LinkedProvider): Promise<void> {
    this.accounts.set(account.accountId, { ...account })
    this.providers.set(provider.providerKey, { ...provider })
    return Promise.resolve()
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

  private taken(username: string): boolean {
    const want = username.toLowerCase()
    for (const account of this.accounts.values()) {
      if (account.username?.toLowerCase() === want) return true
    }
    return false
  }
}
