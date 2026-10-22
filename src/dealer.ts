// Pure: Erwin von Dutch, the squatter who sleeps in the Golden Wok in Bull
// Valley Plaza, and deals out of it (sharedworld.ts rule 25). He does not
// recognize the wallet's money: he barters. A raider offers units out of
// their pack, any mix of kinds, for one of his goods, each unit counted at
// a little under what a Citgo shelf asks for it (CONFIG.dealer.rate); the
// offer must cover the good, and he makes no change, so it may not hold a
// unit it could do without. He has a few of each a day for the whole valley: what
// one raider takes is gone for everyone until the day turns at midnight
// Central, like a unit off a Citgo shelf (rule 7). The goods and what
// pays for them are both the account's pack, kept by the valley. No
// three.js, no DOM.

import { CONFIG } from './config.ts'
import { copy } from './copy.ts'
import { itemLabel } from './itemcopy.ts'
import { contentsOf, itemById } from './items.ts'
import type { Inventory, XZ } from './interfaces.ts'
import type { ItemId } from './items.ts'

interface DealerGood {
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
  // The jar a slurm goes into alive (fishing.ts, sharedworld.ts rule 36).
  { kind: 'slurm-jar', worth: 2500, perDay: 2 },
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
// with him, in cents: its share of the shelf price, at his rate, or a
// fish's worth at the same rate (the Golden Wok takes fish off the pond).
// Zero for anything else, which he will not take.
export function unitWorth(kind: string, cfg = CONFIG): number {
  const item = itemById(kind)
  if (item?.category === 'fish') return item.worth * cfg.dealer.rate
  const price = item?.price
  if (price === undefined) return 0
  return (price / contentsOf(kind)) * cfg.dealer.rate
}

// How many units of `pay` one of `good` costs on its own, or null when
// he will not take `pay`.
export function costIn(
  good: DealerGood,
  pay: string,
  cfg = CONFIG
): number | null {
  const worth = unitWorth(pay, cfg)
  if (worth <= 0) return null
  return Math.ceil(good.worth / worth - 1e-9)
}

// What an offer (kind -> units) counts for with him, in cents.
export function offerWorth(offer: Inventory, cfg = CONFIG): number {
  let worth = 0
  for (const [kind, count] of Object.entries(offer)) {
    worth += unitWorth(kind, cfg) * count
  }
  return worth
}

// Whether an offer worth `worth` covers `need` (cents, with a hair for
// the float sums).
function covers(worth: number, need: number): boolean {
  return worth >= need - 1e-6
}

// The kinds in an offer he could hand one unit of back and still be
// covered for `good`: the change he will not make.
export function spareIn(
  good: DealerGood,
  offer: Inventory,
  cfg = CONFIG
): string[] {
  const worth = offerWorth(offer, cfg)
  return Object.keys(offer).filter(
    (kind) =>
      (offer[kind] ?? 0) > 0 && covers(worth - unitWorth(kind, cfg), good.worth)
  )
}

// The offer topped up out of the pack until it covers `good`, the
// cheapest units first, then trimmed of any unit it can do without, the
// dearest first; null when the whole of what the pack could pay cannot
// cover it. What the offer already holds stays where it can.
export function evenUp(
  good: DealerGood,
  pack: Inventory,
  offer: Inventory,
  cfg = CONFIG
): Inventory | null {
  const kinds = payable(pack, cfg)
  const next: Inventory = {}
  for (const kind of kinds) {
    const count = Math.min(offer[kind] ?? 0, pack[kind] ?? 0)
    if (count > 0) next[kind] = count
  }
  const cheapest = [...kinds].sort(
    (a, b) => unitWorth(a, cfg) - unitWorth(b, cfg)
  )
  for (const kind of cheapest) {
    const short = good.worth - offerWorth(next, cfg)
    if (covers(-short, 0)) break
    const room = (pack[kind] ?? 0) - (next[kind] ?? 0)
    const want = Math.ceil(short / unitWorth(kind, cfg) - 1e-9)
    const add = Math.min(room, want)
    if (add > 0) next[kind] = (next[kind] ?? 0) + add
  }
  if (!covers(offerWorth(next, cfg), good.worth)) return null
  for (const kind of [...cheapest].reverse()) {
    while ((next[kind] ?? 0) > 0 && spareIn(good, next, cfg).includes(kind)) {
      next[kind] -= 1
    }
    if (next[kind] === 0) delete next[kind]
  }
  return next
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

type DealRefusal =
  'no-such-good' | 'sold-out' | 'worthless' | 'short' | 'over' | 'too-far'

type DealOutcome =
  | {
      ok: true
      // What comes out of the pack for it, how many of the good go in,
      // and his stock after.
      give: Inventory
      units: number
      stock: DealerStock
    }
  | { ok: false; reason: DealRefusal }

// One of `kind` out of `stock` for `offer` out of `pack`: refused for a
// good he does not deal, one gone today, an offer empty or holding
// anything he will not take, a pack that does not hold the offer or an
// offer that does not cover the good, or one with a unit to spare.
export function deal(
  stock: DealerStock,
  kind: string,
  offer: Inventory,
  pack: Inventory,
  cfg = CONFIG
): DealOutcome {
  const good = goodOf(kind)
  if (!good) return { ok: false, reason: 'no-such-good' }
  if (leftOf(stock, kind) < 1) return { ok: false, reason: 'sold-out' }
  const give: Inventory = {}
  for (const [pay, count] of Object.entries(offer)) {
    if (count < 1) continue
    if (unitWorth(pay, cfg) <= 0) return { ok: false, reason: 'worthless' }
    if ((pack[pay] ?? 0) < count) return { ok: false, reason: 'short' }
    give[pay] = count
  }
  if (Object.keys(give).length === 0) return { ok: false, reason: 'worthless' }
  if (!covers(offerWorth(give, cfg), good.worth)) {
    return { ok: false, reason: 'short' }
  }
  if (spareIn(good, give, cfg).length > 0) return { ok: false, reason: 'over' }
  return {
    ok: true,
    give,
    units: contentsOf(kind),
    stock: { ...stock, [kind]: leftOf(stock, kind) - 1 },
  }
}

// What a pack could pay him with: every kind it holds that a shelf
// prices, in ITEMS order.
export function payable(pack: Inventory, cfg = CONFIG): string[] {
  return Object.keys(pack).filter(
    (kind) => (pack[kind] ?? 0) > 0 && unitWorth(kind, cfg) > 0
  )
}

// What he says to a deal the valley refused.
export function dealRefusal(reason: string): string {
  switch (reason) {
    case 'sold-out':
      return copy('dealer.sold_out')
    case 'short':
      return copy('dealer.short')
    case 'over':
      return copy('dealer.over')
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

// A deal of the raider's own, done, as the log says it.
export function boughtLine(item: string): string {
  return copy('dealer.bought', { item: itemLabel(item) })
}
