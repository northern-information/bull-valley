// The inventory carousel, pure: which items ride the ring, in what order,
// and how the selection moves. No three.js, no DOM. inventoryview.ts turns
// the ring into models; hud.ts turns the selected item into text.

import { getItem, isUsable, ITEM_LIST } from './items.ts'
import { carryLimit } from './raid.ts'
import type { Inventory, Raid, RingItem } from './interfaces.ts'

// Fixed ring order: counted items in ITEMS order. Cargo and gear ride at
// the end.
const ORDER = ITEM_LIST.filter((item) => item.category !== 'gear')

// inv: the inventory; raid: the raid state. A kind rides the ring when the
// player carries it. Each entry: { kind, label, blurb, stock, canUse }.
export function ringItems(inv: Inventory, raid: Raid): RingItem[] {
  const items: RingItem[] = []
  for (const { id: kind, label, blurb } of ORDER) {
    const stock = inv[kind] || 0
    if (stock < 1) continue
    items.push({ kind, label, blurb, stock, canUse: isUsable(kind) })
  }
  if (raid.carrying > 0) {
    items.push({
      kind: 'cabbage',
      label: 'Cabbages',
      blurb: `Cold and heavy. The stand wants them. Room for ${carryLimit(raid)}.`,
      stock: raid.carrying,
      canUse: false,
    })
  }
  if (raid.sack) {
    const sack = getItem('sack')
    items.push({
      kind: 'sack',
      label: sack.label,
      blurb: sack.blurb,
      stock: 1,
      canUse: false,
    })
  }
  return items
}

// One step left (-1) or right (+1), wrapping. An empty ring stays at 0.
export function stepIndex(index: number, count: number, dir: number): number {
  if (count < 1) return 0
  return (((index + dir) % count) + count) % count
}

// After the ring changes (an item used up, bought, picked up), keep the
// selection on the same kind; when that kind left the ring, stay at the
// same slot, clamped to the new end.
export function syncIndex(
  items: readonly RingItem[],
  kind: string | null,
  index: number
): number {
  if (items.length < 1) return 0
  const found = items.findIndex((item) => item.kind === kind)
  if (found >= 0) return found
  return Math.min(Math.max(0, index), items.length - 1)
}

// The shortest signed distance, in slots, from ring position `from` to slot
// `to` on a ring of `count` slots. Range: (-count / 2, count / 2].
export function wrapDelta(from: number, to: number, count: number): number {
  if (count < 1) return 0
  let d = (to - from) % count
  if (d > count / 2) d -= count
  if (d <= -count / 2) d += count
  return d
}
