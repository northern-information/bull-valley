import { describe, expect, it } from 'vitest'
import { MemoryCrewStore } from '../../worker/crews.ts'
import { D1CrewStore } from '../../worker/d1crews.ts'
import { testD1 } from './stubs/d1.ts'
import type { CrewStore } from '../../worker/crews.ts'

const NAMES: Record<string, string> = { a: 'Able', b: 'Baker', c: 'Charlie' }

// A store with accounts a, b and c, each with `cash` cents in the wallet,
// and a way to read a wallet back.
interface Harness {
  store: CrewStore
  cash: (account: string) => Promise<number>
}

function contract(make: (cash: number) => Harness): void {
  it('starts a crew for its price, its starter leading it', async () => {
    const { store, cash } = make(150_00)
    expect(
      await store.create('a', 'c1', 'Bull Valley Crew', 'BVC', 100_00, 5)
    ).toBe('ok')
    expect(await cash('a')).toBe(50_00)
    const crew = await store.crewOf('a')
    expect(crew).toEqual({
      id: 'c1',
      name: 'Bull Valley Crew',
      tag: 'BVC',
      leader: 'a',
      members: [{ account: 'a', username: 'Able', joined: 5 }],
    })
    expect(await store.tagOf('a')).toBe('BVC')
    expect(await store.tagOf('b')).toBeNull()
    expect((await store.crewByTag('bvc'))?.id).toBe('c1')
    expect(await store.crewByTag('zz')).toBeNull()
  })

  it('refuses a tag or a name taken in any case, and a short wallet, taking nothing', async () => {
    const { store, cash } = make(150_00)
    await store.create('a', 'c1', 'Bull Valley Crew', 'BVC', 100_00, 5)
    expect(await store.create('b', 'c2', 'Other', 'bvc', 100_00, 6)).toBe(
      'tag-taken'
    )
    expect(
      await store.create('b', 'c2', 'bull valley crew', 'ZZ', 100_00, 6)
    ).toBe('name-taken')
    expect(await store.create('b', 'c2', 'Other', 'ZZ', 200_00, 6)).toBe(
      'short'
    )
    expect(await cash('b')).toBe(150_00)
    expect(await store.crewOf('b')).toBeNull()
  })

  it('invites, lets the invited join, and lets an invite run out', async () => {
    const { store } = make(150_00)
    await store.create('a', 'c1', 'Bull Valley Crew', 'BVC', 100_00, 5)
    await store.invite('c1', 'b', 10)
    await store.invite('c1', 'c', 10)
    await store.invite('c1', 'c', 20)
    expect(await store.invitesOf('b', 0)).toEqual([
      { id: 'c1', tag: 'BVC', name: 'Bull Valley Crew' },
    ])
    expect(await store.invitesOf('b', 11)).toEqual([])
    expect(await store.invitesOf('c', 11)).toHaveLength(1)
    await store.join('c1', 'b', 30)
    expect(await store.invitesOf('b', 0)).toEqual([])
    expect((await store.crewOf('b'))?.members.map((m) => m.username)).toEqual([
      'Able',
      'Baker',
    ])
  })

  it('hands the lead on to the longest in, and ends with the last one out', async () => {
    const { store } = make(150_00)
    await store.create('a', 'c1', 'Bull Valley Crew', 'BVC', 100_00, 5)
    await store.join('c1', 'c', 7)
    await store.join('c1', 'b', 9)
    await store.invite('c1', 'b', 10)
    const first = await store.leave('a')
    expect(first?.leader).toBe('c')
    expect(first?.crew.members).toHaveLength(3)
    expect((await store.crewOf('b'))?.leader).toBe('c')
    expect((await store.leave('b'))?.leader).toBe('c')
    expect((await store.leave('c'))?.leader).toBeNull()
    expect(await store.crewByTag('BVC')).toBeNull()
    expect(await store.leave('c')).toBeNull()
    // The tag is free again.
    expect(await store.create('b', 'c2', 'Again', 'BVC', 100_00, 50)).toBe('ok')
  })
}

describe('MemoryCrewStore', () => {
  contract((cash) => {
    const wallets = new Map(Object.keys(NAMES).map((a) => [a, cash]))
    return {
      store: new MemoryCrewStore(wallets, (a) => NAMES[a]),
      cash: (a) => Promise.resolve(wallets.get(a) ?? 0),
    }
  })
})

describe('D1CrewStore', () => {
  contract((cash) => {
    const { db, sqlite } = testD1()
    for (const [id, name] of Object.entries(NAMES)) {
      sqlite
        .prepare(
          `INSERT INTO accounts (account_id, username, role, primary_provider, created_at, last_login_at)
           VALUES (?, ?, 'user', ?, 0, 0)`
        )
        .run(id, name, `dev:${id}`)
      sqlite
        .prepare('INSERT INTO wallets (account_id, cash) VALUES (?, ?)')
        .run(id, cash)
    }
    return {
      store: new D1CrewStore(db),
      cash: (a) =>
        Promise.resolve(
          (
            sqlite
              .prepare('SELECT cash FROM wallets WHERE account_id = ?')
              .get(a) as { cash: number }
          ).cash
        ),
    }
  })

  it('takes nothing from an account with no wallet yet', async () => {
    const { db, sqlite } = testD1()
    sqlite
      .prepare(
        `INSERT INTO accounts (account_id, username, role, primary_provider, created_at, last_login_at)
         VALUES ('a', 'Able', 'user', 'dev:a', 0, 0)`
      )
      .run()
    const store = new D1CrewStore(db)
    expect(await store.create('a', 'c1', 'Crew', 'BVC', 100_00, 5)).toBe(
      'short'
    )
    expect(await store.crewOf('a')).toBeNull()
  })
})
