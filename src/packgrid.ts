// The pack grid, pure: which items fill each of the Tab grid's tabs, in
// what order. No three.js, no DOM. hud.ts draws the tabs and the cells;
// itemthumbs.ts draws the items.

import { CONFIG } from './config.ts'
import { copy } from './copy.ts'
import { isUsable, itemById, ITEMS } from './items.ts'
import type { Inventory, ItemCategory, PackItem, Raid } from './interfaces.ts'

// The pack's tabs, left to right; it opens on the first.
export const PACK_TABS = ['consumables', 'loot', 'materials'] as const
export type PackTab = (typeof PACK_TABS)[number]

// Which tab each item category sits in; the cabbages are loot. Nothing is
// a material yet.
const TAB_OF: Record<ItemCategory, PackTab> = {
  cigarette: 'consumables',
  joint: 'consumables',
  drink: 'consumables',
  medicine: 'consumables',
  forage: 'loot',
}

// inv: the inventory; raid: the raid state. A kind is in its tab when the
// player carries it: counted items in ITEMS order, then the cabbages.
// Each entry: { kind, label, blurb, stock, canUse }.
export function packItems(
  inv: Inventory,
  raid: Raid,
  tab: PackTab
): PackItem[] {
  const items: PackItem[] = []
  for (const { id: kind, label, blurb, category } of ITEMS) {
    if (TAB_OF[category] !== tab) continue
    const stock = inv[kind] || 0
    if (stock < 1) continue
    items.push({ kind, label, blurb, stock, canUse: isUsable(kind) })
  }
  if (tab === 'loot' && raid.carrying > 0) items.push(cabbageItem(raid))
  return items
}

function cabbageItem(raid: Raid): PackItem {
  return {
    kind: 'cabbage',
    label: copy('inventory.cabbages_label'),
    blurb: copy('inventory.cabbages_blurb', {
      limit: CONFIG.cabbage.carryLimit,
    }),
    stock: raid.carrying,
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
  const item = itemById(kind)
  if (!item) return null
  const { label, blurb } = item
  return { kind, label, blurb, stock: inv[kind] || 0, canUse: isUsable(kind) }
}
