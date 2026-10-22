import { describe, expect, it } from 'vitest'
import { NO_TASK } from '../../src/dailytask.ts'
import { STARTING_INVENTORY, toInventory } from '../../src/inventory.ts'
import { isKeyItem } from '../../src/items.ts'
import { FRESH_RESEARCH } from '../../src/recycling.ts'
import { NO_PROGRESS } from '../../src/season.ts'
import { FRESH_STAND } from '../../src/stand.ts'
import { D1PackStore } from '../../worker/d1packs.ts'
import { MemoryPackStore, STARTING_CASH } from '../../worker/packs.ts'
import { testD1 } from './stubs/d1.ts'
import type { Inventory } from '../../src/interfaces.ts'
import type { PackStore } from '../../worker/packs.ts'

// An item the account starts with, and one it does not.
const [STARTER] = Object.entries(STARTING_INVENTORY).find(([, n]) => n > 0)!
const OTHER = Object.entries(STARTING_INVENTORY).find(([, n]) => n === 0)![0]
const EMPTY = toInventory({})

// The kinds a pack holds at least one of.
function pickHeld(pack: Record<string, number>): Record<string, number> {
  return Object.fromEntries(Object.entries(pack).filter(([, n]) => n > 0))
}

// What a strike takes of a pack: everything held but the key items (the
// kit every raider carries among them), which stay.
function strippable(pack: Record<string, number>): Record<string, number> {
  return pickHeld(
    Object.fromEntries(
      Object.entries(pack).filter(([kind]) => !isKeyItem(kind))
    )
  )
}

// The key items of a pack, which a strike leaves in it.
function kept(pack: Record<string, number>): Record<string, number> {
  return Object.fromEntries(
    Object.entries(pack).filter(([kind]) => isKeyItem(kind))
  )
}

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
      stash: EMPTY,
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
      stash: EMPTY,
    })
  })

  it('reads everything the welcome carries at once, opening the account', async () => {
    const store = makeStore()
    const first = await store.welcome('a1', 'one', 'burn')
    expect(first).toEqual({
      holdings: {
        pack: STARTING_INVENTORY,
        cash: STARTING_CASH,
        cosmetics: [],
        stash: EMPTY,
      },
      season: NO_PROGRESS,
      book: [],
      task: NO_TASK,
      xp: 0,
      stand: FRESH_STAND,
      quests: { rose: 'none' },
      expedition: null,
    })
    await store.change('a1', OTHER, 2)
    await store.discover('a1', ['citgo'], 5)
    await store.gainXp('a1', 7)
    const again = await store.welcome('a1', 'one', 'burn')
    expect(again.holdings.pack[OTHER]).toBe(2)
    expect(again.book).toEqual(['citgo'])
    expect(again.xp).toBe(7)
    // Reading never makes a stand row: the first tend does.
    expect((await store.stand('a1')).rev).toBe(0)
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

  it('barters only what the pack holds, every side together', async () => {
    const store = makeStore()
    await store.open('a1')
    await store.change(
      'a1',
      'marlboro',
      40 - (STARTING_INVENTORY.marlboro ?? 0)
    )
    await store.change('a1', 'pbr', 2 - (STARTING_INVENTORY.pbr ?? 0))
    const lsd = { kind: 'lsd', count: 1 }
    expect(await store.barter('a1', { marlboro: 41 }, lsd)).toBe(false)
    // One kind short holds back the whole offer, the kind it holds too.
    expect(await store.barter('a1', { marlboro: 30, pbr: 3 }, lsd)).toBe(false)
    expect((await store.get('a1')).pack).toMatchObject({
      marlboro: 40,
      pbr: 2,
      lsd: 0,
    })
    expect(await store.barter('a1', { marlboro: 30, pbr: 2 }, lsd)).toBe(true)
    expect((await store.get('a1')).pack).toMatchObject({
      marlboro: 10,
      pbr: 0,
      lsd: 1,
    })
    expect(await store.barter('a1', { marlboro: 7 }, lsd)).toBe(true)
    expect((await store.get('a1')).pack).toMatchObject({ marlboro: 3, lsd: 2 })
  })

  it('steps a quest only from where it stands, with its pack change', async () => {
    const store = makeStore()
    await store.open('a1')
    expect((await store.quests('a1')).rose).toBe('none')
    const give = { kind: 'rose', delta: 1 }
    // Not from a stage it is not at.
    expect(await store.quest('a1', 'rose', 'given', 'laid', give)).toBe(false)
    expect(await store.quest('a1', 'rose', 'none', 'given', give)).toBe(true)
    expect((await store.quests('a1')).rose).toBe('given')
    expect((await store.get('a1')).pack.rose).toBe(1)
    // Taken out only while the pack holds it, the stage with it.
    const lay = { kind: 'rose', delta: -1 }
    expect(await store.quest('a1', 'rose', 'given', 'laid', lay)).toBe(true)
    expect(await store.quest('a1', 'rose', 'laid', 'laid', lay)).toBe(false)
    expect((await store.quests('a1')).rose).toBe('laid')
    expect((await store.get('a1')).pack.rose).toBe(0)
    expect(
      await store.quest('a1', 'rose', 'laid', 'done', {
        kind: 'vault-key',
        delta: 1,
      })
    ).toBe(true)
    expect((await store.quests('a1')).rose).toBe('done')
    expect((await store.get('a1')).pack['vault-key']).toBe(1)
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

  it('pays what the finds are worth with them, and never again', async () => {
    const store = makeStore()
    await store.open('a1')
    const before = (await store.get('a1')).cash
    const asked: string[][] = []
    const pays = (found: readonly string[]) => {
      asked.push([...found])
      return found.includes('keep') ? 2500 : 0
    }
    expect(await store.discover('a1', ['keep', 'marx'], 1, pays)).toEqual([
      'keep',
      'marx',
    ])
    expect((await store.get('a1')).cash).toBe(before + 2500)
    expect(await store.discover('a1', ['keep'], 2, pays)).toEqual([])
    expect((await store.get('a1')).cash).toBe(before + 2500)
    // Only what was new is ever priced.
    expect(asked).toEqual([['keep', 'marx']])
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

  it('adds XP to the account’s, none before the first', async () => {
    const store = makeStore()
    await store.open('a1')
    expect(await store.xp('a1')).toBe(0)
    expect(await store.gainXp('a1', 10)).toBe(10)
    const [one, two] = await Promise.all([
      store.gainXp('a1', 5),
      store.gainXp('a1', 25),
    ])
    expect(Math.max(one, two)).toBe(40)
    expect(await store.xp('a1')).toBe(40)
  })

  it('empties the whole pack onto a body, and gives it back', async () => {
    const store = makeStore()
    await store.open('a1')
    await store.change('a1', OTHER, 2)
    const taken = await store.strip('a1')
    expect(taken).toEqual({ ...strippable(STARTING_INVENTORY), [OTHER]: 2 })
    const { pack, cash } = await store.get('a1')
    expect(
      Object.entries(pack).every(([kind, n]) => isKeyItem(kind) || n === 0)
    ).toBe(true)
    expect(cash).toBe(STARTING_CASH)
    // Emptied is not never opened: the starting pack is not given again.
    expect((await store.open('a1')).pack).toEqual({
      ...EMPTY,
      ...kept(STARTING_INVENTORY),
    })
    expect(await store.strip('a1')).toEqual({})
    await store.give('a1', taken)
    await store.give('a1', {})
    expect((await store.get('a1')).pack).toEqual({
      ...STARTING_INVENTORY,
      [OTHER]: 2,
    })
  })

  it('leaves the key items in the pack when it is emptied', async () => {
    const store = makeStore()
    await store.open('a1')
    await store.change('a1', 'rose', 1)
    await store.change('a1', 'vault-key', 1)
    const taken = await store.strip('a1')
    expect(taken).not.toHaveProperty('rose')
    expect(taken).not.toHaveProperty('vault-key')
    expect(taken).toEqual(strippable(STARTING_INVENTORY))
    const { pack } = await store.get('a1')
    expect(pack.rose).toBe(1)
    expect(pack['vault-key']).toBe(1)
  })

  it('moves units into the locker and back, only what the side holds', async () => {
    const store = makeStore()
    await store.open('a1')
    const held = STARTING_INVENTORY[STARTER]
    expect(await store.stow('a1', STARTER, held + 1)).toBe(false)
    expect(await store.stow('a1', STARTER, 0)).toBe(false)
    expect(await store.stow('a1', STARTER, 1)).toBe(true)
    let after = await store.get('a1')
    expect(after.pack[STARTER]).toBe(held - 1)
    expect(after.stash[STARTER]).toBe(1)
    expect(await store.stow('a1', STARTER, -2)).toBe(false)
    expect(await store.stow('a1', OTHER, -1)).toBe(false)
    expect(await store.stow('a1', STARTER, -1)).toBe(true)
    after = await store.get('a1')
    expect(after.pack[STARTER]).toBe(held)
    expect(after.stash[STARTER]).toBe(0)
    // A strike never reaches the locker.
    await store.stow('a1', STARTER, held)
    expect(await store.strip('a1')).not.toHaveProperty(STARTER)
    expect((await store.get('a1')).stash[STARTER]).toBe(held)
  })

  it('keeps the stand, writing it with the pack and the wallet, all or none', async () => {
    const store = makeStore()
    await store.open('a1')
    await store.change('a1', 'cabbage', 5)
    expect(await store.stand('a1')).toEqual({ ledger: FRESH_STAND, rev: 0 })
    const stocked = { ...FRESH_STAND, stock: { cabbage: 3 }, since: 1000 }
    expect(
      await store.tend('a1', 0, {
        ledger: stocked,
        items: { cabbage: 3 },
        cash: 0,
      })
    ).toBe(true)
    expect(await store.stand('a1')).toEqual({ ledger: stocked, rev: 1 })
    expect((await store.get('a1')).pack.cabbage).toBe(2)
    // A write from a stale read, or one the pack or the wallet cannot
    // cover, leaves all three as they were.
    const more = { ...stocked, stock: { cabbage: 4 } }
    const tend = (rev: number, items: Inventory, cash: number) =>
      store.tend('a1', rev, { ledger: more, items, cash })
    expect(await tend(0, { cabbage: 1 }, 0)).toBe(false)
    expect(await tend(1, { cabbage: 3 }, 0)).toBe(false)
    expect(await tend(1, { berries: 1 }, 0)).toBe(false)
    expect(await tend(1, {}, -STARTING_CASH - 1)).toBe(false)
    expect(await store.stand('a1')).toEqual({ ledger: stocked, rev: 1 })
    expect(await store.get('a1')).toMatchObject({
      cash: STARTING_CASH,
      pack: { cabbage: 2 },
    })
    // Collected cents go into the wallet; an upgrade's come out of it.
    expect(await tend(1, {}, 250)).toBe(true)
    expect(await tend(2, { cabbage: 2 }, -STARTING_CASH - 250)).toBe(true)
    expect(await store.get('a1')).toMatchObject({
      cash: 0,
      pack: { cabbage: 0 },
    })
    expect((await store.stand('a1')).rev).toBe(3)
  })

  it('keeps research, writing a level with its empties, all or none', async () => {
    const store = makeStore()
    await store.open('a1')
    expect(await store.research('a1')).toEqual(FRESH_RESEARCH)
    const price = { 'empty-can': 6, 'empty-pack': 2 }
    // Short of empties: nothing moves.
    await store.change('a1', 'empty-can', 6)
    expect(await store.recycle('a1', 'dimes', 0, price)).toBe(false)
    expect(await store.research('a1')).toEqual(FRESH_RESEARCH)
    expect((await store.get('a1')).pack['empty-can']).toBe(6)
    await store.change('a1', 'empty-pack', 2)
    // Not at the level it was read at: nothing moves.
    expect(await store.recycle('a1', 'dimes', 1, price)).toBe(false)
    expect(await store.recycle('a1', 'dimes', 0, price)).toBe(true)
    expect(await store.research('a1')).toEqual({ dimes: 1 })
    const { pack } = await store.get('a1')
    expect(pack['empty-can']).toBe(0)
    expect(pack['empty-pack']).toBe(0)
  })

  it('keeps a run out, and brings its haul home with it, all or none', async () => {
    const store = makeStore()
    await store.open('a1')
    expect(await store.expedition('a1')).toEqual({ run: null, rev: 0 })
    const run = {
      id: 'corn' as const,
      startedAt: 1000,
      endsAt: 2000,
      seed: 4_000_000_000,
      ward: 0.5,
    }
    expect(await store.embark('a1', 1, run)).toBe(false)
    expect(await store.embark('a1', 0, run)).toBe(true)
    expect(await store.expedition('a1')).toEqual({ run, rev: 1 })
    expect((await store.welcome('a1', 'one', 'burn')).expedition).toEqual(run)
    // A stale claim brings nothing home.
    const haul = { items: { cabbage: 2, [OTHER]: 1 }, cents: 150 }
    expect(await store.homecoming('a1', 0, haul)).toBe(false)
    expect((await store.get('a1')).cash).toBe(STARTING_CASH)
    expect(await store.homecoming('a1', 1, haul)).toBe(true)
    expect(await store.expedition('a1')).toEqual({ run: null, rev: 2 })
    expect(await store.get('a1')).toMatchObject({
      cash: STARTING_CASH + 150,
      pack: { cabbage: 2, [OTHER]: 1 },
    })
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

  it('writes no find when its bounty cannot go into the wallet', async () => {
    const { db, sqlite } = testD1()
    sqlite.exec(
      "INSERT INTO accounts (account_id, primary_provider, created_at, last_login_at) VALUES ('a1', 'dev:1', 0, 0)"
    )
    const store = new D1PackStore(db)
    await store.open('a1')
    // No wallet to write: the batch rolls back, the book row with it.
    sqlite.exec('DROP TABLE wallets')
    await expect(
      store.discover('a1', ['keep'], 1, () => 2500)
    ).rejects.toThrow()
    expect(await store.book('a1')).toEqual([])
  })

  it('reads a stand row no build wrote as a fresh stand', async () => {
    const { db, sqlite } = testD1()
    sqlite.exec(
      "INSERT INTO accounts (account_id, primary_provider, created_at, last_login_at) VALUES ('a1', 'dev:1', 0, 0)"
    )
    const store = new D1PackStore(db)
    sqlite.exec(
      "INSERT INTO stands (account_id, level, stock, rev) VALUES ('a1', 2, 'not json', 4)"
    )
    expect(await store.stand('a1')).toEqual({ ledger: FRESH_STAND, rev: 4 })
    sqlite.exec(
      "UPDATE stands SET stock = '{\"joints\":1}' WHERE account_id = 'a1'"
    )
    expect((await store.stand('a1')).ledger).toEqual(FRESH_STAND)
  })

  it('lets a broken write through as an error, not a refusal', async () => {
    const { db } = testD1()
    const store = new D1PackStore(db)
    // No account, so the stand row breaks its foreign key.
    await expect(
      store.tend('nobody', 0, { ledger: FRESH_STAND, items: {}, cash: 0 })
    ).rejects.toThrow(/FOREIGN KEY/)
    const broken = {
      ...db,
      batch: () => Promise.reject(new Error('D1 is down')),
    } as unknown as D1Database
    await expect(
      new D1PackStore(broken).tend('a1', 0, {
        ledger: FRESH_STAND,
        items: {},
        cash: 0,
      })
    ).rejects.toThrow(/down/)
  })

  it('keeps no pack or wallet for an account that does not exist', async () => {
    const store = new D1PackStore(testD1().db)
    await expect(store.open('nobody')).rejects.toThrow(/FOREIGN KEY/)
  })
})
