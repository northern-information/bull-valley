// Pure: one purchase off a Citgo shelf. Like raid.ts and inventory.ts, it
// returns new state and never changes its input. main.ts finds the facing
// the player is looking at (store.ts), saves the inventory, and shows the
// toast.

import { addItem } from './inventory.ts'
import { getItem, itemById } from './items.ts'
import { advance, EVENTS } from './raid.ts'
import { formatCash } from './store.ts'
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

// One unit of `kind` off station `station`'s shelves, paid for in cash.
// The sack is gear: buying it changes the raid (a bigger carry limit), not
// the inventory. Every other kind goes into the inventory.
export function buy(
  state: ShopState,
  station: number,
  kind: string,
  now: number
): Purchase {
  const { raid, stock, inventory, cash } = state
  const shelf = stock[station] as ShopStock | undefined
  const item = itemById(kind)
  if (!shelf || !item) return { next: null, toast: null }
  if (!(shelf[kind] > 0)) return { next: null, toast: 'Sold out.' }
  if (kind === 'sack' && raid.sack) {
    return { next: null, toast: 'You already have a sack.' }
  }
  if (cash < item.price) {
    return {
      next: null,
      toast: `You're ${formatCash(item.price - cash)} short.`,
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
  const nextStock = stock.map((s, i) =>
    i === station ? { ...s, [kind]: s[kind] - 1 } : s
  )
  return {
    next: {
      raid: nextRaid,
      stock: nextStock,
      inventory: nextInventory,
      cash: cash - item.price,
    },
    toast: kind === 'sack' ? getItem('sack').bought : item.bought,
  }
}
