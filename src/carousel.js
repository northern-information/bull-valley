// The inventory carousel, pure: which items ride the ring, in what order,
// and how the selection moves. No three.js, no DOM. inventoryview.js turns
// the ring into models; hud.js turns the selected item into text.

import { BRANDS } from './brands.js'
import { carryLimit } from './raid.js'

const JOINTS = {
  label: 'Joints',
  blurb: 'You will see them. You will feel less.',
}

// Fixed ring order. Cargo rides at the end.
const ORDER = [
  ...BRANDS.map((b) => ({ kind: b.id, label: b.label, blurb: b.blurb })),
  { kind: 'joints', ...JOINTS },
]

// inv: the inventory; raid: the raid state; shop: the tailgate stock
// ({ cigarettes, joints, sack }) while the tailgate is open, else null.
// A kind rides the ring when the player carries it, or when the tailgate
// has it for sale. Each entry: { kind, label, blurb, stock, tailgate,
// canUse, canBuy }; tailgate is null away from the tailgate.
export function ringItems(inv, raid, shop) {
  const items = []
  for (const { kind, label, blurb } of ORDER) {
    const stock = inv[kind] || 0
    const tailgate = shop
      ? (kind === 'joints' ? shop.joints : shop.cigarettes[kind]) || 0
      : null
    if (stock < 1 && !(tailgate > 0)) continue
    items.push({
      kind,
      label,
      blurb,
      stock,
      tailgate,
      canUse: stock > 0,
      canBuy: tailgate > 0,
    })
  }
  if (raid.carrying > 0) {
    items.push({
      kind: 'cabbage',
      label: 'Cabbages',
      blurb: `Cold and heavy. The stand wants them. Room for ${carryLimit(raid)}.`,
      stock: raid.carrying,
      tailgate: null,
      canUse: false,
      canBuy: false,
    })
  }
  const sackForSale = !raid.sack && shop && shop.sack > 0
  if (raid.sack || sackForSale) {
    items.push({
      kind: 'sack',
      label: 'Burlap Sack',
      blurb: 'Carries five cabbages instead of three.',
      stock: raid.sack ? 1 : 0,
      tailgate: shop ? shop.sack : null,
      canUse: false,
      canBuy: !!sackForSale,
    })
  }
  return items
}

// One step left (-1) or right (+1), wrapping. An empty ring stays at 0.
export function stepIndex(index, count, dir) {
  if (count < 1) return 0
  return (((index + dir) % count) + count) % count
}

// After the ring changes (an item used up, bought, picked up), keep the
// selection on the same kind; when that kind left the ring, stay at the
// same slot, clamped to the new end.
export function syncIndex(items, kind, index) {
  if (items.length < 1) return 0
  const found = items.findIndex((item) => item.kind === kind)
  if (found >= 0) return found
  return Math.min(Math.max(0, index), items.length - 1)
}

// The shortest signed distance, in slots, from ring position `from` to slot
// `to` on a ring of `count` slots. Range: (-count / 2, count / 2].
export function wrapDelta(from, to, count) {
  if (count < 1) return 0
  let d = (to - from) % count
  if (d > count / 2) d -= count
  if (d <= -count / 2) d += count
  return d
}
