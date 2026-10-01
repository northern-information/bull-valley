// Pure: one purchase at Matthew Marx's tailgate. Like raid.ts and
// inventory.ts, it returns new state and never changes its input. main.ts
// checks that the shop is open, saves the inventory, and shows the toast.

import { addItem } from './inventory.ts'
import { getItem, itemById } from './items.ts'
import { advance, EVENTS } from './raid.ts'
import type { Inventory, Raid, ShopStock } from './interfaces.ts'

export interface ShopState {
  raid: Raid
  stock: ShopStock
  inventory: Inventory
}

export interface Purchase {
  // The new state, or null when nothing was sold.
  next: ShopState | null
  toast: string | null
}

// The sack is gear: buying it changes the raid (a bigger carry limit), not
// the inventory. Every other kind goes into the inventory.
export function buy(state: ShopState, kind: string, now: number): Purchase {
  const { raid, stock, inventory } = state
  if (kind === 'sack') {
    const next = advance(raid, EVENTS.BUY_SACK, now)
    if (next === raid || stock.sack < 1) return { next: null, toast: null }
    return {
      next: { raid: next, stock: { ...stock, sack: 0 }, inventory },
      toast: getItem('sack').bought,
    }
  }
  if (!(stock[kind] > 0)) {
    return { next: null, toast: 'The tailgate is bare.' }
  }
  return {
    next: {
      raid,
      stock: { ...stock, [kind]: stock[kind] - 1 },
      inventory: addItem(inventory, kind, 1),
    },
    toast: itemById(kind)?.bought ?? null,
  }
}
