// The pack grid, pure: which items fill the Tab grid, in what order. No
// three.js, no DOM. hud.ts draws the cells; itemthumbs.ts draws the items.

import { copy } from './copy.ts'
import { getItem, isUsable, itemById, ITEMS } from './items.ts'
import { carryLimit } from './raid.ts'
import type { Inventory, PackItem, Raid } from './interfaces.ts'

// Fixed grid order: counted items in ITEMS order. Cargo and gear come last.
const ORDER = ITEMS.filter((item) => item.category !== 'gear')

// inv: the inventory; raid: the raid state. A kind is in the grid when the
// player carries it. Each entry: { kind, label, blurb, stock, canUse }.
export function packItems(inv: Inventory, raid: Raid): PackItem[] {
  const items: PackItem[] = []
  for (const { id: kind, label, blurb } of ORDER) {
    const stock = inv[kind] || 0
    if (stock < 1) continue
    items.push({ kind, label, blurb, stock, canUse: isUsable(kind) })
  }
  if (raid.carrying > 0) items.push(cabbageItem(raid))
  if (raid.sack) items.push(sackItem(1))
  return items
}

function cabbageItem(raid: Raid): PackItem {
  return {
    kind: 'cabbage',
    label: copy('inventory.cabbages_label'),
    blurb: copy('inventory.cabbages_blurb', { limit: carryLimit(raid) }),
    stock: raid.carrying,
    canUse: false,
  }
}

function sackItem(stock: number): PackItem {
  const sack = getItem('sack')
  return {
    kind: 'sack',
    label: sack.label,
    blurb: sack.blurb,
    stock,
    canUse: false,
  }
}

// A kind as the hotbar shows it, carried or not: an item the pack has run
// out of keeps its slot at 0. Null for a kind the game does not know.
export function packItemOf(
  kind: string,
  inv: Inventory,
  raid: Raid
): PackItem | null {
  if (kind === 'cabbage') return cabbageItem(raid)
  if (kind === 'sack') return sackItem(raid.sack ? 1 : 0)
  const item = itemById(kind)
  if (!item) return null
  const { label, blurb } = item
  return { kind, label, blurb, stock: inv[kind] || 0, canUse: isUsable(kind) }
}
