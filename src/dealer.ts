// Pure: the squatter who sleeps in the Golden Wok in Bull Valley Plaza,
// and deals out of it (sharedworld.ts rule 24). He sells what the Citgo
// will not (the mushrooms, the Video Vault's back-room key) and the joint
// for less, a few of each a day for the whole valley: what one raider
// buys is gone for everyone until the day turns at midnight Central, like
// a unit off a Citgo shelf (rule 7). Cash out of the wallet, the goods
// into the pack, both the account's, kept by the valley. He keeps no
// account of who bought what, but he will not sell a key to a raider who
// carries one already. No three.js, no DOM.

import { CONFIG } from './config.ts'
import { copy } from './copy.ts'
import { contentsOf, itemById } from './items.ts'
import type { Inventory, XZ } from './interfaces.ts'
import type { ItemId } from './items.ts'

export interface DealerGood {
  kind: ItemId
  // In cents.
  price: number
  // How many he has to sell each Central day, for the whole valley.
  perDay: number
}

// What he sells, in the order his dialog lists it.
export const DEALER_GOODS: readonly DealerGood[] = [
  { kind: 'mushrooms', price: 1500, perDay: 3 },
  { kind: 'joints', price: 600, perDay: 5 },
  { kind: 'vault-key', price: 2000, perDay: 2 },
]

// Good -> how many he has left today.
export type DealerStock = Record<string, number>

export function goodOf(kind: string): DealerGood | null {
  return DEALER_GOODS.find((good) => good.kind === kind) ?? null
}

// A new day's stock: every good, perDay of it.
export function freshDealerStock(): DealerStock {
  const stock: DealerStock = {}
  for (const good of DEALER_GOODS) stock[good.kind] = good.perDay
  return stock
}

// How many of `kind` he has left today.
export function leftOf(stock: DealerStock, kind: string): number {
  return Math.max(0, stock[kind] ?? 0)
}

// Whether a raider stands at him for the valley to deal: their last state
// frame (`at`) within CONFIG.dealer.dealReach of where he sits.
export function atDealer(
  at: XZ | null,
  dealer: XZ | null,
  cfg = CONFIG
): boolean {
  if (!at || !dealer) return false
  return Math.hypot(at.x - dealer.x, at.z - dealer.z) <= cfg.dealer.dealReach
}

export type DealRefusal =
  'no-such-good' | 'sold-out' | 'short' | 'have-one' | 'too-far'

export type DealOutcome =
  | {
      ok: true
      // What it costs, in cents, how many go into the pack, and his stock
      // after.
      price: number
      units: number
      stock: DealerStock
    }
  | { ok: false; reason: DealRefusal }

// One sale of `kind` out of `stock` to a raider with `cash` cents and
// `pack`: refused for a good he does not sell, one sold out today, a key
// the raider carries already, or a wallet that does not cover it.
export function deal(
  stock: DealerStock,
  kind: string,
  cash: number,
  pack: Inventory
): DealOutcome {
  const good = goodOf(kind)
  if (!good) return { ok: false, reason: 'no-such-good' }
  if (leftOf(stock, kind) < 1) return { ok: false, reason: 'sold-out' }
  if (itemById(kind)?.category === 'key' && (pack[kind] ?? 0) > 0) {
    return { ok: false, reason: 'have-one' }
  }
  if (cash < good.price) return { ok: false, reason: 'short' }
  return {
    ok: true,
    price: good.price,
    units: contentsOf(kind),
    stock: { ...stock, [kind]: leftOf(stock, kind) - 1 },
  }
}

// What he says to a deal the valley refused.
export function dealRefusal(reason: string): string {
  switch (reason) {
    case 'sold-out':
      return copy('dealer.sold_out')
    case 'short':
      return copy('dealer.short')
    case 'have-one':
      return copy('dealer.have_one')
    case 'too-far':
      return copy('dealer.too_far')
    default:
      return copy('dealer.refused')
  }
}
