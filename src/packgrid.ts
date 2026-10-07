// The pack grid, pure: which items fill each of the Tab grid's tabs, in
// what order. No three.js, no DOM. hud.ts draws the tabs and the cells;
// itemthumbs.ts draws the items.

import { containersOf, isUsable, itemById, ITEMS, leftInOpen } from './items.ts'
import type { Inventory, ItemCategory, PackItem } from './interfaces.ts'

// The pack's tabs, left to right; it opens on the first.
export const PACK_TABS = ['consumables', 'loot', 'materials'] as const
export type PackTab = (typeof PACK_TABS)[number]

// Which tab each item category sits in: forage (the cabbages and the
// berries) is loot, and the gold bullion is a material.
const TAB_OF: Record<ItemCategory, PackTab> = {
  cigarette: 'consumables',
  joint: 'consumables',
  drink: 'consumables',
  medicine: 'consumables',
  forage: 'loot',
  material: 'materials',
}

// A kind is in its tab when the player carries it, in ITEMS order. Each
// entry: { kind, label, blurb, stock, left, canUse }: stock counts packs
// and bottles, not what is in them, and left is what the open one holds.
export function packItems(inv: Inventory, tab: PackTab): PackItem[] {
  const items: PackItem[] = []
  for (const { id: kind, label, blurb, category } of ITEMS) {
    if (TAB_OF[category] !== tab) continue
    if ((inv[kind] || 0) < 1) continue
    items.push(counted(kind, label, blurb, inv))
  }
  return items
}

// A kind as the hotbar shows it, carried or not: an item the pack has run
// out of keeps its slot at 0. Null for a kind the game does not know.
export function packItemOf(kind: string, inv: Inventory): PackItem | null {
  const item = itemById(kind)
  if (!item) return null
  return counted(kind, item.label, item.blurb, inv)
}

function counted(
  kind: string,
  label: string,
  blurb: string,
  inv: Inventory
): PackItem {
  const units = inv[kind] || 0
  return {
    kind,
    label,
    blurb,
    stock: containersOf(kind, units),
    left: leftInOpen(kind, units),
    canUse: isUsable(kind),
  }
}
