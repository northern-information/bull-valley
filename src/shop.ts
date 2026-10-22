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

// Why the valley would not sell `item`, to a raider with `cash` cents: sold
// out, short (by how much), a Citgo the account has not stood at or no
// world to buy in (Bull Valley Dial-Up's, sharedworld.ts rule 29), or
// refused.
export function buyRefusal(
  reason: string,
  item: string | undefined,
  cash: number
): string {
  const price = item ? itemById(item)?.price : undefined
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

// One kind on a Citgo's shelves as a trade window lists it: its price, how
// many are left, and the unit a buy takes (the first still on the shelf),
// or null when none are.
export interface ShelfRow {
  kind: string
  price: number
  left: number
  unit: number | null
}

// A Citgo's shelves, in the store's own order; none for a station with no
// shelf, and nothing without a price.
export function shelfRows(shelf: ShopStock | undefined): ShelfRow[] {
  if (!shelf) return []
  return Object.entries(shelf).flatMap(([kind, units]) => {
    const price = itemById(kind)?.price
    if (price === undefined) return []
    const unit = units.indexOf(true)
    return [
      {
        kind,
        price,
        left: units.filter(Boolean).length,
        unit: unit < 0 ? null : unit,
      },
    ]
  })
}
