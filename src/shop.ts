// Pure: one purchase off a Citgo shelf. Like marx.ts and inventory.ts, it
// returns new state and never changes its input. targets.ts finds the shelf
// unit the player is looking at (store.ts) and tells the player in the
// chat log. In the shared valley the shelf and the wallet belong to the
// server (sharedworld.ts rule 7): buy() still judges the sale here (stock
// and cash as last heard), settle() applies it once the valley confirms
// it, and the valley's next word replaces both guesses.

import { copy } from './copy.ts'
import { addItem } from './inventory.ts'
import { itemLine } from './itemcopy.ts'
import { contentsOf } from './items.ts'
import { formatCash, onShelf, shelfPrice, takeUnit } from './store.ts'
import type { Inventory, ShopStock } from './interfaces.ts'

export interface ShopState {
  // One entry per station, indexed like world.fuelPoints.
  stock: readonly ShopStock[]
  inventory: Inventory
  // In cents.
  cash: number
}

interface Purchase {
  // The new state, or null when nothing was sold.
  next: ShopState | null
  line: string | null
}

// The buyer's side of a sale: the cash and the inventory. Nothing about
// the shelf.
type Purse = Pick<ShopState, 'inventory' | 'cash'>

export interface Settled {
  next: Purse | null
  line: string | null
}

// Pays `price` for one unit of `kind` and puts it, full, in the
// inventory. Refuses short cash.
export function settle(purse: Purse, kind: string, price: number): Settled {
  const { inventory, cash } = purse
  if (cash < price) {
    return {
      next: null,
      line: copy('log.short', { amount: formatCash(price - cash) }),
    }
  }
  return {
    next: {
      inventory: addItem(inventory, kind, contentsOf(kind)),
      cash: cash - price,
    },
    line: itemLine(kind, 'bought'),
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
  // Nothing without a price is on a shelf: forage is the bush's to give.
  const price = shelf ? shelfPrice(kind, shelf[kind]) : undefined
  if (!shelf || price === undefined) return { next: null, line: null }
  if (!onShelf(shelf, kind, unit)) {
    return { next: null, line: copy('log.sold_out') }
  }
  const { next, line } = settle(state, kind, price)
  if (!next) return { next: null, line }
  const nextStock = stock.map((s, i) =>
    i === station ? takeUnit(s, kind, unit) : s
  )
  return { next: { ...next, stock: nextStock }, line }
}

// Why the valley would not sell `item` off `shelf`, to a raider with
// `cash` cents: sold out, short (by how much, at the shelf's price now), a
// Citgo the account has not stood at or no world to buy in (Bull Valley
// Dial-Up's, sharedworld.ts rule 29), or refused.
export function buyRefusal(
  reason: string,
  item: string | undefined,
  cash: number,
  shelf?: ShopStock
): string {
  const price = item ? shelfPrice(item, shelf?.[item]) : undefined
  switch (reason) {
    case 'sold-out':
      return copy('log.sold_out')
    case 'short':
      return price === undefined
        ? copy('log.refused')
        : copy('log.short', { amount: formatCash(Math.max(0, price - cash)) })
    case 'not-visited':
      return copy('dialup.citgo.not_visited')
    case 'not-in-valley':
      return copy('dialup.citgo.no_world')
    default:
      return copy('log.refused')
  }
}
