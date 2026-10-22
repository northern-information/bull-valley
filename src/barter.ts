// Pure: the arithmetic of every trade window (tradewindow.ts), whoever
// keeps it: an offer is units out of the pack (kind -> count), each unit
// worth what the trader counts it for (`worthOf`, zero for a kind he will
// not take), against what he asks for a good (`need`, in the same
// measure). No trader makes change, so an even offer holds no unit it
// could do without. Erwin von Dutch counts in cents of shelf value
// (dealer.ts), Moab Coldë in ounces of gold (cosmetics.ts). No three.js,
// no DOM.

import type { Inventory } from './interfaces.ts'

// What one unit of a kind counts for with the trader.
export type WorthOf = (kind: string) => number

// What an offer counts for.
export function offerWorth(offer: Inventory, worthOf: WorthOf): number {
  let worth = 0
  for (const [kind, count] of Object.entries(offer)) {
    worth += worthOf(kind) * count
  }
  return worth
}

// Whether `worth` covers `need`, with a hair for the float sums.
export function covers(worth: number, need: number): boolean {
  return worth >= need - 1e-6
}

// The kinds in an offer the trader could hand one unit of back and still
// be covered for `need`: the change he will not make.
export function spareIn(
  need: number,
  offer: Inventory,
  worthOf: WorthOf
): string[] {
  const worth = offerWorth(offer, worthOf)
  return Object.keys(offer).filter(
    (kind) => (offer[kind] ?? 0) > 0 && covers(worth - worthOf(kind), need)
  )
}

// What a pack could pay the trader with: every kind it holds that he
// counts for something, in the pack's order.
export function payable(pack: Inventory, worthOf: WorthOf): string[] {
  return Object.keys(pack).filter(
    (kind) => (pack[kind] ?? 0) > 0 && worthOf(kind) > 0
  )
}

// The offer topped up out of the pack until it covers `need`, the
// cheapest units first, then trimmed of any unit it can do without, the
// dearest first; null when the whole of what the pack could pay cannot
// cover it. What the offer already holds stays where it can.
export function evenUp(
  need: number,
  pack: Inventory,
  offer: Inventory,
  worthOf: WorthOf
): Inventory | null {
  const kinds = payable(pack, worthOf)
  const next: Inventory = {}
  for (const kind of kinds) {
    const count = Math.min(offer[kind] ?? 0, pack[kind] ?? 0)
    if (count > 0) next[kind] = count
  }
  const cheapest = [...kinds].sort((a, b) => worthOf(a) - worthOf(b))
  for (const kind of cheapest) {
    const short = need - offerWorth(next, worthOf)
    if (covers(-short, 0)) break
    const room = (pack[kind] ?? 0) - (next[kind] ?? 0)
    const want = Math.ceil(short / worthOf(kind) - 1e-9)
    const add = Math.min(room, want)
    if (add > 0) next[kind] = (next[kind] ?? 0) + add
  }
  if (!covers(offerWorth(next, worthOf), need)) return null
  for (const kind of [...cheapest].reverse()) {
    while (
      (next[kind] ?? 0) > 0 &&
      spareIn(need, next, worthOf).includes(kind)
    ) {
      next[kind] -= 1
    }
    if (next[kind] === 0) delete next[kind]
  }
  return next
}
