// Pure: one purchase off a Citgo shelf. Like raid.ts and inventory.ts, it
// returns new state and never changes its input. main.ts finds the shelf
// unit the player is looking at (store.ts) and tells the player in the
// chat log. In the shared
// valley the shelf, the wallet and the sack belong to the server
// (sharedraid.ts rules 8 and 12): buy() still judges the sale here (stock,
// cash and the sack as last heard), settle() applies it once the valley
// confirms it, and the valley's next word replaces both guesses.

import { copy } from './copy.ts'
import { addItem } from './inventory.ts'
import { getItem, itemById } from './items.ts'
import { advance, EVENTS } from './raid.ts'
import { formatCash, onShelf, takeUnit } from './store.ts'
import type { Inventory, Raid, ShopStock } from './interfaces.ts'

export interface ShopState {
  raid: Raid
  // One entry per station, indexed like world.fuelPoints.
  stock: readonly ShopStock[]
  inventory: Inventory
  // In cents.
  cash: number
}

export interface Purchase {
  // The new state, or null when nothing was sold.
  next: ShopState | null
  toast: string | null
}

// The buyer's side of a sale: the cash, and the raid (for the sack) or the
// inventory (for everything else). Nothing about the shelf.
export type Purse = Pick<ShopState, 'raid' | 'inventory' | 'cash'>

export interface Settled {
  next: Purse | null
  toast: string | null
}

// Pays for one unit of `kind` and puts it away. The sack is gear: buying
// it changes the raid (a bigger carry limit), not the inventory. Every
// other kind goes into the inventory. Refuses a second sack or short cash.
export function settle(purse: Purse, kind: string, now: number): Settled {
  const { raid, inventory, cash } = purse
  const item = itemById(kind)
  // Nothing without a price is on a shelf: forage is the bush's to give.
  if (!item || item.price === undefined) return { next: null, toast: null }
  if (kind === 'sack' && raid.sack) {
    return { next: null, toast: copy('toasts.have_sack') }
  }
  if (cash < item.price) {
    return {
      next: null,
      toast: copy('toasts.short', { amount: formatCash(item.price - cash) }),
    }
  }
  let nextRaid = raid
  let nextInventory = inventory
  if (kind === 'sack') {
    nextRaid = advance(raid, EVENTS.BUY_SACK, now)
    if (nextRaid === raid) return { next: null, toast: null }
  } else {
    nextInventory = addItem(inventory, kind, 1)
  }
  return {
    next: { raid: nextRaid, inventory: nextInventory, cash: cash - item.price },
    toast: kind === 'sack' ? getItem('sack').bought : (item.bought ?? null),
  }
}

// Unit `unit` of `kind` off station `station`'s shelves, paid for in cash.
export function buy(
  state: ShopState,
  station: number,
  kind: string,
  unit: number,
  now: number
): Purchase {
  const { stock } = state
  const shelf = stock[station] as ShopStock | undefined
  const item = itemById(kind)
  if (!shelf || !item || item.price === undefined) {
    return { next: null, toast: null }
  }
  if (!onShelf(shelf, kind, unit)) {
    return { next: null, toast: copy('toasts.sold_out') }
  }
  const { next, toast } = settle(state, kind, now)
  if (!next) return { next: null, toast }
  const nextStock = stock.map((s, i) =>
    i === station ? takeUnit(s, kind, unit) : s
  )
  return { next: { ...next, stock: nextStock }, toast }
}
