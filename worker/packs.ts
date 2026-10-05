// The pack store: what each account carries and the cash in its wallet,
// kept by the valley so they follow the raider to any browser. The
// interface is here with an in-memory store for the tests; production is
// the D1 store in d1packs.ts. The rules of what goes in and out are
// src/sharedraid.ts's (rules 8 and 11).

import { CONFIG } from '../src/config.ts'
import { STARTING_INVENTORY, toInventory } from '../src/inventory.ts'
import type { Inventory } from '../src/interfaces.ts'

// A new account's wallet, in cents.
export const STARTING_CASH = CONFIG.store.startingCash

export interface Holdings {
  pack: Inventory
  // In cents.
  cash: number
}

export interface PackStore {
  // The account's holdings, with the starting pack and wallet given the
  // first time.
  open(accountId: string): Promise<Holdings>
  get(accountId: string): Promise<Holdings>
  // Adds `delta` of `kind`. A negative delta is taken only when the pack
  // holds that many; false when it does not.
  change(accountId: string, kind: string, delta: number): Promise<boolean>
  // Takes `amount` cents out of the wallet; false when it does not cover
  // it.
  spend(accountId: string, amount: number): Promise<boolean>
}

export class MemoryPackStore implements PackStore {
  readonly packs = new Map<string, Map<string, number>>()
  readonly wallets = new Map<string, number>()

  open(accountId: string): Promise<Holdings> {
    if (!this.packs.has(accountId)) {
      const rows = new Map<string, number>()
      for (const [kind, count] of Object.entries(STARTING_INVENTORY)) {
        if (count > 0) rows.set(kind, count)
      }
      this.packs.set(accountId, rows)
    }
    if (!this.wallets.has(accountId)) {
      this.wallets.set(accountId, STARTING_CASH)
    }
    return this.get(accountId)
  }

  get(accountId: string): Promise<Holdings> {
    const rows = this.packs.get(accountId) ?? new Map<string, number>()
    return Promise.resolve({
      pack: toInventory(Object.fromEntries(rows)),
      cash: this.wallets.get(accountId) ?? 0,
    })
  }

  change(accountId: string, kind: string, delta: number): Promise<boolean> {
    const rows = this.packs.get(accountId) ?? new Map<string, number>()
    const next = (rows.get(kind) ?? 0) + delta
    if (next < 0) return Promise.resolve(false)
    rows.set(kind, next)
    this.packs.set(accountId, rows)
    return Promise.resolve(true)
  }

  spend(accountId: string, amount: number): Promise<boolean> {
    const cash = this.wallets.get(accountId) ?? 0
    if (cash < amount) return Promise.resolve(false)
    this.wallets.set(accountId, cash - amount)
    return Promise.resolve(true)
  }
}
