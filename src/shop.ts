// Pure: one purchase off a Citgo shelf. Like marx.ts and inventory.ts, it
// returns new state and never changes its input. targets.ts finds the shelf
// unit the player is looking at (store.ts) and tells the player in the
// chat log. In the shared
// valley the shelf and the wallet belong to the server (sharedworld.ts rule
// 7): buy() still judges the sale here (stock and cash as last heard),
// settle() applies it once the valley confirms it, and the valley's next
// word replaces both guesses.

import { copy } from './copy.ts'
import { addItem } from './inventory.ts'
import { contentsOf, itemById } from './items.ts'
import { formatCash, onShelf, takeUnit } from './store.ts'
import type { Inventory, ShopStock } from './interfaces.ts'

export interface ShopState {
  // One entry per station, indexed like world.fuelPoints.
  stock: readonly ShopStock[]
  inventory: Inventory
  // In cents.
  cash: number
}

export interface Purchase {
  // The new state, or null when nothing was sold.
  next: ShopState | null
  line: string | null
}

// The buyer's side of a sale: the cash and the inventory. Nothing about
// the shelf.
export type Purse = Pick<ShopState, 'inventory' | 'cash'>

export interface Settled {
  next: Purse | null
  line: string | null
}

// Pays for one unit of `kind` and puts it, full, in the inventory. Refuses short
// cash.
export function settle(purse: Purse, kind: string): Settled {
  const { inventory, cash } = purse
  const item = itemById(kind)
  // Nothing without a price is on a shelf: forage is the bush's to give.
  if (!item || item.price === undefined) return { next: null, line: null }
  if (cash < item.price) {
    return {
      next: null,
      line: copy('log.short', { amount: formatCash(item.price - cash) }),
    }
  }
  return {
    next: {
      inventory: addItem(inventory, kind, contentsOf(kind)),
      cash: cash - item.price,
    },
    line: item.bought ?? null,
  }
}

// Unit `unit` of `kind` off station `station`'s shelves, paid for in cash.
export function buy(
  state: ShopState,
  station: number,
  kind: string,
  unit: number
): Purchase {
  const { stock } = state
  const shelf = stock[station] as ShopStock | undefined
  const item = itemById(kind)
  if (!shelf || !item || item.price === undefined) {
    return { next: null, line: null }
  }
  if (!onShelf(shelf, kind, unit)) {
    return { next: null, line: copy('log.sold_out') }
  }
  const { next, line } = settle(state, kind)
  if (!next) return { next: null, line }
  const nextStock = stock.map((s, i) =>
    i === station ? takeUnit(s, kind, unit) : s
  )
  return { next: { ...next, stock: nextStock }, line }
}
