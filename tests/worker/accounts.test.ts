import { describe, expect, it } from 'vitest'
import { MemoryAccountStore } from '../../worker/accounts.ts'
import type {
  Account,
  AccountStore,
  LinkedProvider,
} from '../../worker/accounts.ts'

const account = (id: string, primary: string): Account => ({
  accountId: id,
  username: null,
  role: 'user',
  primaryProvider: primary,
  createdAt: 1000,
  lastLoginAt: 1000,
})

const linked = (
  accountId: string,
  provider: 'google' | 'discord' | 'github' | 'dev',
  providerId: string,
  linkedAt = 1000
): LinkedProvider => ({
  providerKey: `${provider}:${providerId}`,
  accountId,
  provider,
  providerId,
  displayName: `${provider} ${providerId}`,
  avatarUrl: null,
  linkedAt,
})

// The contract every store keeps. The D1 store runs it end to end; the
// in-memory store runs it here.
export function storeContract(makeStore: () => AccountStore): void {
  it('creates an account with its first provider and finds it again', async () => {
    const store = makeStore()
    await store.create(account('a1', 'github:1'), linked('a1', 'github', '1'))
    expect(await store.get('a1')).toMatchObject({
      accountId: 'a1',
      username: null,
      primaryProvider: 'github:1',
    })
    expect(await store.findByProvider('github:1')).toMatchObject({
      accountId: 'a1',
      provider: 'github',
      providerId: '1',
    })
    expect(await store.get('nobody')).toBeNull()
    expect(await store.findByProvider('github:9')).toBeNull()
  })

  it('records the latest login and profile', async () => {
    const store = makeStore()
    await store.create(account('a1', 'github:1'), linked('a1', 'github', '1'))
    await store.touchLogin('a1', 5000)
    await store.updateProfile('github:1', 'New Name', 'https://a/b.png')
    expect((await store.get('a1'))?.lastLoginAt).toBe(5000)
    expect(await store.findByProvider('github:1')).toMatchObject({
      displayName: 'New Name',
      avatarUrl: 'https://a/b.png',
    })
  })

  it('renames to any free name, its own in another case included', async () => {
    const store = makeStore()
    await store.create(account('a1', 'github:1'), linked('a1', 'github', '1'))
    await store.create(account('a2', 'github:2'), linked('a2', 'github', '2'))
    await store.setUsername('a1', 'Dave')
    await store.setUsername('a2', 'Other')
    expect(await store.renameUsername('a1', 'OTHER')).toBe('taken')
    expect(await store.renameUsername('a1', 'DAVE')).toBe('ok')
    expect((await store.get('a1'))?.username).toBe('DAVE')
    expect(await store.renameUsername('a1', 'Gron_Made')).toBe('ok')
    expect(await store.usernameAvailable('dave')).toBe(true)
    expect(await store.renameUsername('nobody', 'Who')).toBe('missing')
  })

  it('sets a username once, unique whatever the case', async () => {
    const store = makeStore()
    await store.create(account('a1', 'github:1'), linked('a1', 'github', '1'))
    await store.create(account('a2', 'github:2'), linked('a2', 'github', '2'))
    expect(await store.usernameAvailable('Dave')).toBe(true)
    expect(await store.setUsername('a1', 'Dave')).toBe('ok')
    expect((await store.get('a1'))?.username).toBe('Dave')
    expect(await store.usernameAvailable('dave')).toBe(false)
    expect(await store.setUsername('a2', 'DAVE')).toBe('taken')
    expect(await store.setUsername('a1', 'Other')).toBe('already-set')
    expect(await store.setUsername('nobody', 'Who')).toBe('missing')
    expect((await store.get('a2'))?.username).toBeNull()
  })

  it('links providers, each to one account', async () => {
    const store = makeStore()
    await store.create(account('a1', 'github:1'), linked('a1', 'github', '1'))
    await store.create(account('a2', 'google:2'), linked('a2', 'google', '2'))
    expect(await store.linkProvider(linked('a1', 'discord', '3', 2000))).toBe(
      'ok'
    )
    expect(await store.linkProvider(linked('a1', 'discord', '3', 3000))).toBe(
      'already-linked'
    )
    expect(await store.linkProvider(linked('a2', 'discord', '3', 3000))).toBe(
      'linked-elsewhere'
    )
    expect((await store.providersOf('a1')).map((p) => p.providerKey)).toEqual([
      'github:1',
      'discord:3',
    ])
    expect((await store.providersOf('a2')).map((p) => p.providerKey)).toEqual([
      'google:2',
    ])
  })

  it('unlinks any provider but the last, promoting a new primary', async () => {
    const store = makeStore()
    await store.create(account('a1', 'github:1'), linked('a1', 'github', '1'))
    expect(await store.unlinkProvider('a1', 'github')).toBe('last-provider')
    await store.linkProvider(linked('a1', 'discord', '3', 2000))
    expect(await store.unlinkProvider('a1', 'google')).toBe('not-linked')
    expect(await store.unlinkProvider('a1', 'github')).toBe('ok')
    expect(await store.findByProvider('github:1')).toBeNull()
    expect((await store.get('a1'))?.primaryProvider).toBe('discord:3')
    expect(await store.unlinkProvider('a1', 'discord')).toBe('last-provider')
  })
}

describe('MemoryAccountStore', () => {
  storeContract(() => new MemoryAccountStore())
})
