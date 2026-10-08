import { describe, expect, it } from 'vitest'
import { NO_TASK } from '../../src/dailytask.ts'
import { STARTING_INVENTORY } from '../../src/inventory.ts'
import { NO_PROGRESS } from '../../src/season.ts'
import { D1PackStore } from '../../worker/d1packs.ts'
import { MemoryPackStore, STARTING_CASH } from '../../worker/packs.ts'
import { testD1 } from './stubs/d1.ts'
import type { PackStore } from '../../worker/packs.ts'

// An item the account starts with, and one it does not.
const [STARTER] = Object.entries(STARTING_INVENTORY).find(([, n]) => n > 0)!
const OTHER = Object.entries(STARTING_INVENTORY).find(([, n]) => n === 0)![0]

// The contract every pack store keeps. Each store is handed an account
// that exists (D1 checks the foreign key).
function packContract(makeStore: () => PackStore): void {
  it('gives the starting pack and wallet once', async () => {
    const store = makeStore()
    const opened = await store.open('a1')
    expect(opened).toEqual({
      pack: STARTING_INVENTORY,
      cash: STARTING_CASH,
      cosmetics: [],
    })
    expect(
      await store.change('a1', STARTER, -STARTING_INVENTORY[STARTER])
    ).toBe(true)
    expect(await store.purchase('a1', STARTING_CASH, null)).toBe(true)
    // Used down to nothing and spent out, it is never refilled.
    expect(await store.open('a1')).toEqual({
      pack: { ...STARTING_INVENTORY, [STARTER]: 0 },
      cash: 0,
      cosmetics: [],
    })
  })

  it('holds nothing for an account never opened', async () => {
    const store = makeStore()
    const { pack, cash } = await store.get('a1')
    expect(cash).toBe(0)
    expect(Object.values(pack).every((n) => n === 0)).toBe(true)
  })

  it('adds any kind and takes only what the pack holds', async () => {
    const store = makeStore()
    await store.open('a1')
    expect(await store.change('a1', OTHER, 2)).toBe(true)
    expect(await store.change('a1', OTHER, 1)).toBe(true)
    expect((await store.get('a1')).pack[OTHER]).toBe(3)
    expect(await store.change('a1', OTHER, -4)).toBe(false)
    expect((await store.get('a1')).pack[OTHER]).toBe(3)
    expect(await store.change('a1', OTHER, -3)).toBe(true)
    expect((await store.get('a1')).pack[OTHER]).toBe(0)
  })

  it('takes nothing of a kind never held', async () => {
    const store = makeStore()
    await store.open('a1')
    expect(await store.change('a1', OTHER, -1)).toBe(false)
    expect((await store.get('a1')).pack[OTHER]).toBe(0)
  })

  it('sells only what the wallet covers, the item and the charge together', async () => {
    const store = makeStore()
    await store.open('a1')
    const item = { kind: OTHER, delta: 2 }
    expect(await store.purchase('a1', STARTING_CASH + 1, item)).toBe(false)
    expect(await store.get('a1')).toMatchObject({ cash: STARTING_CASH })
    expect((await store.get('a1')).pack[OTHER]).toBe(0)
    expect(await store.purchase('a1', 150, item)).toBe(true)
    expect(await store.purchase('a1', 50, item)).toBe(true)
    expect((await store.get('a1')).cash).toBe(STARTING_CASH - 200)
    expect((await store.get('a1')).pack[OTHER]).toBe(4)
    expect(await store.purchase('a1', STARTING_CASH - 200, null)).toBe(true)
    expect((await store.get('a1')).cash).toBe(0)
  })

  it('pays into the wallet, from the starting cash for one never opened', async () => {
    const store = makeStore()
    await store.open('a1')
    await store.earn('a1', 70)
    await store.earn('a1', 30)
    expect((await store.get('a1')).cash).toBe(STARTING_CASH + 100)
    const fresh = makeStore()
    await fresh.earn('a1', 50)
    expect((await fresh.get('a1')).cash).toBe(STARTING_CASH + 50)
  })

  it('trades only what the pack covers, the price and the cosmetic together', async () => {
    const store = makeStore()
    await store.open('a1')
    const price = { kind: 'gold-bullion', count: 1 }
    expect(await store.trade('a1', price, 'flaming-halo')).toBe(false)
    expect((await store.get('a1')).cosmetics).toEqual([])
    expect(await store.change('a1', 'gold-bullion', 2)).toBe(true)
    expect(await store.trade('a1', price, 'flaming-halo')).toBe(true)
    expect(await store.get('a1')).toMatchObject({
      pack: { 'gold-bullion': 1 },
      cosmetics: ['flaming-halo'],
    })
    // Had for good: never sold twice, and never paid for twice.
    expect(await store.trade('a1', price, 'flaming-halo')).toBe(false)
    expect((await store.get('a1')).pack['gold-bullion']).toBe(1)
  })

  it('keeps season progress, paying a reward with it', async () => {
    const store = makeStore()
    await store.open('a1')
    expect(await store.season('a1', 's')).toEqual(NO_PROGRESS)
    await store.score('a1', 's', { kills: 1, claimed: false }, null)
    expect(await store.season('a1', 's')).toEqual({ kills: 1, claimed: false })
    expect(await store.season('a1', 'other')).toEqual(NO_PROGRESS)
    const before = await store.get('a1')
    await store.score(
      'a1',
      's',
      { kills: 2, claimed: true },
      { cash: 100_00, kind: OTHER, count: 200 }
    )
    expect(await store.season('a1', 's')).toEqual({ kills: 2, claimed: true })
    const after = await store.get('a1')
    expect(after.cash).toBe(before.cash + 100_00)
    expect(after.pack[OTHER]).toBe(before.pack[OTHER] + 200)
  })

  it('writes each Book of Shadows entry once, in the order found', async () => {
    const store = makeStore()
    await store.open('a1')
    expect(await store.book('a1')).toEqual([])
    expect(
      await store.discover('a1', ['citgo', 'nowhere', 'citgo'], 1)
    ).toEqual(['citgo'])
    expect(await store.discover('a1', ['marx', 'citgo', 'gron'], 2)).toEqual([
      'marx',
      'gron',
    ])
    expect(await store.discover('a1', ['marx'], 3)).toEqual([])
    expect(await store.book('a1')).toEqual(['citgo', 'marx', 'gron'])
    expect(await store.book('a2')).toEqual([])
  })

  it('keeps daily task progress, paying its reward with it', async () => {
    const store = makeStore()
    await store.open('a1')
    expect(await store.task('a1', 't')).toEqual(NO_TASK)
    const day = '2026-10-07'
    await store.scoreTask('a1', 't', { day, count: 4, claimed: false }, null)
    expect(await store.task('a1', 't')).toEqual({
      day,
      count: 4,
      claimed: false,
    })
    expect(await store.task('a1', 'other')).toEqual(NO_TASK)
    const before = await store.get('a1')
    await store.scoreTask('a1', 't', { day, count: 5, claimed: true }, 5_00)
    expect(await store.task('a1', 't')).toEqual({
      day,
      count: 5,
      claimed: true,
    })
    expect((await store.get('a1')).cash).toBe(before.cash + 5_00)
    // A new day overwrites the old one's row.
    const next = { day: '2026-10-08', count: 1, claimed: false }
    await store.scoreTask('a1', 't', next, null)
    expect(await store.task('a1', 't')).toEqual(next)
  })

  it('sells nothing from a wallet never opened', async () => {
    const store = makeStore()
    expect(await store.purchase('a1', 1, { kind: OTHER, delta: 1 })).toBe(false)
    expect((await store.get('a1')).pack[OTHER]).toBe(0)
  })
}

describe('MemoryPackStore', () => {
  packContract(() => new MemoryPackStore())
})

describe('D1PackStore', () => {
  packContract(() => {
    const { db, sqlite } = testD1()
    sqlite.exec(
      "INSERT INTO accounts (account_id, primary_provider, created_at, last_login_at) VALUES ('a1', 'dev:1', 0, 0)"
    )
    return new D1PackStore(db)
  })

  it('charges nothing when the item cannot go in', async () => {
    const { db, sqlite } = testD1()
    sqlite.exec(
      "INSERT INTO accounts (account_id, primary_provider, created_at, last_login_at) VALUES ('a1', 'dev:1', 0, 0)"
    )
    const store = new D1PackStore(db)
    await store.open('a1')
    // A negative count breaks the pack's CHECK, so the batch rolls back.
    await expect(
      store.purchase('a1', 100, { kind: OTHER, delta: -1 })
    ).rejects.toThrow(/CHECK/)
    expect((await store.get('a1')).cash).toBe(STARTING_CASH)
  })

  it('keeps no pack or wallet for an account that does not exist', async () => {
    const store = new D1PackStore(testD1().db)
    await expect(store.open('nobody')).rejects.toThrow(/FOREIGN KEY/)
  })
})
