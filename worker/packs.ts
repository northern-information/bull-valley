// The pack store: what each account carries, kept by the valley so it
// follows the raider to any browser. The interface is here with an
// in-memory store for the tests; production is the D1 store in d1packs.ts.
// The rules of what goes in and out are src/sharedraid.ts's (rule 11).

import { STARTING_INVENTORY, toInventory } from '../src/inventory.ts'
import type { Inventory } from '../src/interfaces.ts'

export interface PackStore {
  // The account's pack, with the starting items given the first time.
  open(accountId: string): Promise<Inventory>
  get(accountId: string): Promise<Inventory>
  // Adds `delta` of `kind`. A negative delta is taken only when the pack
  // holds that many; false when it does not.
  change(accountId: string, kind: string, delta: number): Promise<boolean>
}

export class MemoryPackStore implements PackStore {
  readonly packs = new Map<string, Map<string, number>>()

  open(accountId: string): Promise<Inventory> {
    if (!this.packs.has(accountId)) {
      const rows = new Map<string, number>()
      for (const [kind, count] of Object.entries(STARTING_INVENTORY)) {
        if (count > 0) rows.set(kind, count)
      }
      this.packs.set(accountId, rows)
    }
    return this.get(accountId)
  }

  get(accountId: string): Promise<Inventory> {
    const rows = this.packs.get(accountId) ?? new Map<string, number>()
    return Promise.resolve(toInventory(Object.fromEntries(rows)))
  }

  change(accountId: string, kind: string, delta: number): Promise<boolean> {
    const rows = this.packs.get(accountId) ?? new Map<string, number>()
    const next = (rows.get(kind) ?? 0) + delta
    if (next < 0) return Promise.resolve(false)
    rows.set(kind, next)
    this.packs.set(accountId, rows)
    return Promise.resolve(true)
  }
}
