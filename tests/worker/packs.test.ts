import { describe, expect, it } from 'vitest'
import { STARTING_INVENTORY } from '../../src/inventory.ts'
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
    expect(opened).toEqual({ pack: STARTING_INVENTORY, cash: STARTING_CASH })
    expect(
      await store.change('a1', STARTER, -STARTING_INVENTORY[STARTER])
    ).toBe(true)
    expect(await store.spend('a1', STARTING_CASH)).toBe(true)
    // Used down to nothing and spent out, it is never refilled.
    expect(await store.open('a1')).toEqual({
      pack: { ...STARTING_INVENTORY, [STARTER]: 0 },
      cash: 0,
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

  it('spends only what the wallet covers', async () => {
    const store = makeStore()
    await store.open('a1')
    expect(await store.spend('a1', STARTING_CASH + 1)).toBe(false)
    expect((await store.get('a1')).cash).toBe(STARTING_CASH)
    expect(await store.spend('a1', 150)).toBe(true)
    expect((await store.get('a1')).cash).toBe(STARTING_CASH - 150)
  })

  it('spends nothing from a wallet never opened', async () => {
    const store = makeStore()
    expect(await store.spend('a1', 1)).toBe(false)
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

  it('keeps no pack or wallet for an account that does not exist', async () => {
    const store = new D1PackStore(testD1().db)
    await expect(store.open('nobody')).rejects.toThrow(/FOREIGN KEY/)
  })
})
