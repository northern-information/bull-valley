import { describe, expect, it } from 'vitest'
import { FRIENDS_MAX } from '../../src/friends.ts'
import { assign, EMPTY_HOTBAR } from '../../src/hotbar.ts'
import { DEFAULT_SETTINGS } from '../../src/settings.ts'
import { MemoryAccountStore } from '../../worker/accounts.ts'
import { D1AccountStore } from '../../worker/d1accounts.ts'
import { testD1 } from './stubs/d1.ts'
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

// Three accounts with usernames, for the friends list.
async function friendly(store: AccountStore) {
  for (const [id, name] of [
    ['a1', 'Able'],
    ['a2', 'Baker'],
    ['a3', 'Charlie'],
  ]) {
    await store.create(account(id, `github:${id}`), linked(id, 'github', id))
    await store.setUsername(id, name)
  }
}

// The contract every store keeps, run here against the in-memory store.
export function storeContract(makeStore: () => AccountStore): void {
  it('finds an account by its username in any case', async () => {
    const store = makeStore()
    await friendly(store)
    expect(await store.accountByUsername('baker')).toEqual({
      accountId: 'a2',
      username: 'Baker',
    })
    expect(await store.accountByUsername('nobody')).toBeNull()
  })

  it('asks, accepts and unfriends, by username', async () => {
    const store = makeStore()
    await friendly(store)
    expect(await store.friendsOf('a1')).toEqual([])
    expect(await store.askFriend('a1', 'a2', 5)).toBe('requested')
    expect(await store.askFriend('a1', 'a2', 6)).toBe('already-asked')
    expect(await store.askFriend('a1', 'a1', 6)).toBe('self')
    expect(await store.friendsOf('a1')).toEqual([
      { accountId: 'a2', username: 'Baker', state: 'asked' },
    ])
    expect(await store.friendsOf('a2')).toEqual([
      { accountId: 'a1', username: 'Able', state: 'asking' },
    ])
    // Baker asks back: friends, both ways.
    expect(await store.askFriend('a2', 'a1', 7)).toBe('accepted')
    expect(await store.askFriend('a2', 'a1', 8)).toBe('already-friends')
    expect(await store.friendsOf('a1')).toEqual([
      { accountId: 'a2', username: 'Baker', state: 'friend' },
    ])
    expect(await store.friendsOf('a2')).toEqual([
      { accountId: 'a1', username: 'Able', state: 'friend' },
    ])
    // Charlie had no part in it.
    expect(await store.friendsOf('a3')).toEqual([])
    // Either side ends it, and then there is nothing to end.
    expect(await store.unfriend('a2', 'a1')).toBe(true)
    expect(await store.friendsOf('a1')).toEqual([])
    expect(await store.friendsOf('a2')).toEqual([])
    expect(await store.unfriend('a1', 'a2')).toBe(false)
  })

  it('asks no more once the list is full', async () => {
    const store = makeStore()
    await friendly(store)
    for (let i = 0; i < FRIENDS_MAX; i++) {
      const id = `x${i}`
      await store.create(account(id, `github:${id}`), linked(id, 'github', id))
      await store.setUsername(id, `x_${i}`)
      expect(await store.askFriend('a1', id, i)).toBe('requested')
    }
    expect(await store.askFriend('a1', 'a2', 0)).toBe('full')
    // Accepting a request already made needs no room.
    await store.askFriend('a3', 'a1', 0)
    expect(await store.askFriend('a1', 'a3', 0)).toBe('accepted')
  })

  it('takes back a request either way', async () => {
    const store = makeStore()
    await friendly(store)
    await store.askFriend('a1', 'a3', 5)
    expect(await store.unfriend('a3', 'a1')).toBe(true)
    expect(await store.friendsOf('a1')).toEqual([])
    expect(await store.friendsOf('a3')).toEqual([])
  })

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

  it('creates nothing when the first provider is already linked', async () => {
    const store = makeStore()
    expect(
      await store.create(account('a1', 'github:1'), linked('a1', 'github', '1'))
    ).toBe(true)
    expect(
      await store.create(account('a2', 'github:1'), linked('a2', 'github', '1'))
    ).toBe(false)
    expect(await store.get('a2')).toBeNull()
    expect((await store.findByProvider('github:1'))?.accountId).toBe('a1')
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

  it('keeps the look, unchosen until the first choice', async () => {
    const store = makeStore()
    await store.create(account('a1', 'github:1'), linked('a1', 'github', '1'))
    expect(await store.lookOf('a1')).toEqual({ outfit: null, finish: null })
    const look = { outfit: 'coleman', finish: 'olympic-white' } as const
    expect(await store.setLook('a1', look)).toBe(true)
    expect(await store.lookOf('a1')).toEqual(look)
    expect(await store.setLook('nobody', look)).toBe(false)
    expect(await store.lookOf('nobody')).toEqual({
      outfit: null,
      finish: null,
    })
  })

  it('keeps the hotbar, empty until the first assignment', async () => {
    const store = makeStore()
    await store.create(account('a1', 'github:1'), linked('a1', 'github', '1'))
    expect(await store.hotbarOf('a1')).toEqual(EMPTY_HOTBAR)
    const bar = assign(EMPTY_HOTBAR, 2, 'cabbage')
    expect(await store.setHotbar('a1', bar)).toBe(true)
    expect(await store.hotbarOf('a1')).toEqual(bar)
    expect(await store.setHotbar('nobody', bar)).toBe(false)
    expect(await store.hotbarOf('nobody')).toEqual(EMPTY_HOTBAR)
  })

  it('keeps the settings, the defaults until first changed', async () => {
    const store = makeStore()
    await store.create(account('a1', 'github:1'), linked('a1', 'github', '1'))
    expect(await store.settingsOf('a1')).toEqual(DEFAULT_SETTINGS)
    expect(await store.setSettings('a1', { music: 75, sfx: 20 })).toBe(true)
    expect(await store.settingsOf('a1')).toEqual({ music: 75, sfx: 20 })
    expect(await store.setSettings('nobody', { music: 75, sfx: 20 })).toBe(
      false
    )
    expect(await store.settingsOf('nobody')).toEqual(DEFAULT_SETTINGS)
  })
}

describe('MemoryAccountStore', () => {
  storeContract(() => new MemoryAccountStore())
})

describe('D1AccountStore', () => {
  storeContract(() => new D1AccountStore(testD1().db))

  const seeded = async () => {
    const d1 = testD1()
    const store = new D1AccountStore(d1.db)
    await store.create(account('a1', 'github:1'), linked('a1', 'github', '1'))
    return { ...d1, store }
  }

  it('reads a pick since dropped from the roster or the table as unchosen', async () => {
    const { sqlite, store } = await seeded()
    sqlite.exec(
      "UPDATE accounts SET outfit = 'retired', finish = 'chrome' WHERE account_id = 'a1'"
    )
    expect(await store.lookOf('a1')).toEqual({ outfit: null, finish: null })
  })

  it('reads an unreadable hotbar as empty and clears a dropped item', async () => {
    const { sqlite, store } = await seeded()
    sqlite.exec(
      "UPDATE accounts SET hotbar = '[not json' WHERE account_id = 'a1'"
    )
    expect(await store.hotbarOf('a1')).toEqual(EMPTY_HOTBAR)
    const stored = JSON.stringify(['retired', ...EMPTY_HOTBAR.slice(1)])
    sqlite
      .prepare("UPDATE accounts SET hotbar = ? WHERE account_id = 'a1'")
      .run(stored)
    expect(await store.hotbarOf('a1')).toEqual(EMPTY_HOTBAR)
  })

  it('reads unreadable settings as the defaults', async () => {
    const { sqlite, store } = await seeded()
    sqlite.exec(
      "UPDATE accounts SET settings = '{not json' WHERE account_id = 'a1'"
    )
    expect(await store.settingsOf('a1')).toEqual(DEFAULT_SETTINGS)
    sqlite.exec(
      `UPDATE accounts SET settings = '{"music":"loud"}' WHERE account_id = 'a1'`
    )
    expect(await store.settingsOf('a1')).toEqual(DEFAULT_SETTINGS)
  })

  it('answers linked-elsewhere when a link loses the race to the insert', async () => {
    const { store } = await seeded()
    await store.create(account('a2', 'google:2'), linked('a2', 'google', '2'))
    // Another request links it between this one's lookup and its insert.
    const racing = Object.create(store) as D1AccountStore
    racing.findByProvider = () => Promise.resolve(null)
    await store.linkProvider(linked('a2', 'discord', '3'))
    expect(await racing.linkProvider(linked('a1', 'discord', '3'))).toBe(
      'linked-elsewhere'
    )
  })

  it('never unlinks the last provider, even two unlinks at once', async () => {
    const { store } = await seeded()
    await store.linkProvider(linked('a1', 'discord', '3', 2000))
    const [first, second] = await Promise.all([
      store.unlinkProvider('a1', 'github'),
      store.unlinkProvider('a1', 'discord'),
    ])
    expect([first, second].sort()).toEqual(['last-provider', 'ok'])
    const left = await store.providersOf('a1')
    expect(left).toHaveLength(1)
    expect((await store.get('a1'))?.primaryProvider).toBe(left[0].providerKey)
  })

  it('rethrows a database error that is not a taken name', async () => {
    const { sqlite, store } = await seeded()
    sqlite.exec('DROP TABLE providers')
    await expect(
      store.linkProvider(linked('a1', 'discord', '3'))
    ).rejects.toThrow(/no such table/)
  })
})
