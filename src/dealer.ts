// Pure: Erwin von Dutch, the squatter who sleeps in the Golden Wok in Bull
// Valley Plaza, and deals out of it (sharedworld.ts rule 24). He does not
// recognize the wallet's money: he barters. A raider pays for one of his
// goods with one kind out of their pack, each unit counted at a little
// under what a Citgo shelf asks for it (CONFIG.dealer.rate), however many
// units it takes. He has a few of each a day for the whole valley: what
// one raider takes is gone for everyone until the day turns at midnight
// Central, like a unit off a Citgo shelf (rule 7). The goods and what
// pays for them are both the account's pack, kept by the valley. No
// three.js, no DOM.

import { CONFIG } from './config.ts'
import { copy } from './copy.ts'
import { contentsOf, itemById } from './items.ts'
import type { Inventory, XZ } from './interfaces.ts'
import type { ItemId } from './items.ts'

export interface DealerGood {
  kind: ItemId
  // What one is worth to him, in cents of shelf value.
  worth: number
  // How many he has to deal each Central day, for the whole valley.
  perDay: number
}

// What he deals, in the order his dialog lists it.
export const DEALER_GOODS: readonly DealerGood[] = [
  { kind: 'lsd', worth: 1000, perDay: 4 },
  { kind: 'adderall', worth: 1200, perDay: 3 },
  { kind: 'mushrooms', worth: 1500, perDay: 3 },
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

// What one unit of `kind` (one cigarette, one can, one joint) counts for
// with him, in cents: its share of the shelf price, at his rate. Zero for
// anything no Citgo shelf prices, which he will not take.
export function unitWorth(kind: string, cfg = CONFIG): number {
  const price = itemById(kind)?.price
  if (price === undefined) return 0
  return (price / contentsOf(kind)) * cfg.dealer.rate
}

// How many units of `pay` one of `good` costs, or null when he will not
// take `pay`.
export function costIn(
  good: DealerGood,
  pay: string,
  cfg = CONFIG
): number | null {
  const worth = unitWorth(pay, cfg)
  if (worth <= 0) return null
  return Math.ceil(good.worth / worth - 1e-9)
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
  'no-such-good' | 'sold-out' | 'worthless' | 'short' | 'too-far'

export type DealOutcome =
  | {
      ok: true
      // What comes out of the pack for it, how many of the good go in,
      // and his stock after.
      give: { kind: string; count: number }
      units: number
      stock: DealerStock
    }
  | { ok: false; reason: DealRefusal }

// One of `kind` out of `stock` for units of `pay` out of `pack`: refused
// for a good he does not deal, one gone today, payment he will not take,
// or a pack that does not hold enough of it.
export function deal(
  stock: DealerStock,
  kind: string,
  pay: string,
  pack: Inventory,
  cfg = CONFIG
): DealOutcome {
  const good = goodOf(kind)
  if (!good) return { ok: false, reason: 'no-such-good' }
  if (leftOf(stock, kind) < 1) return { ok: false, reason: 'sold-out' }
  const count = costIn(good, pay, cfg)
  if (count === null) return { ok: false, reason: 'worthless' }
  if ((pack[pay] ?? 0) < count) return { ok: false, reason: 'short' }
  return {
    ok: true,
    give: { kind: pay, count },
    units: contentsOf(kind),
    stock: { ...stock, [kind]: leftOf(stock, kind) - 1 },
  }
}

// What a pack could pay him with: every kind it holds that a shelf
// prices, in ITEMS order.
export function payable(pack: Inventory): string[] {
  return Object.keys(pack).filter(
    (kind) => (pack[kind] ?? 0) > 0 && unitWorth(kind) > 0
  )
}

// What he says to a deal the valley refused.
export function dealRefusal(reason: string): string {
  switch (reason) {
    case 'sold-out':
      return copy('dealer.sold_out')
    case 'short':
      return copy('dealer.short')
    case 'worthless':
      return copy('dealer.worthless')
    case 'too-far':
      return copy('dealer.too_far')
    default:
      return copy('dealer.refused')
  }
}

// His ramble when the dialog opens: the `said`th, round again past the
// last.
const RAMBLES = [
  copy('dealer.ramble_1'),
  copy('dealer.ramble_2'),
  copy('dealer.ramble_3'),
  copy('dealer.ramble_4'),
]

export function ramble(said: number): string {
  return RAMBLES[said % RAMBLES.length]
}
