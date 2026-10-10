// The pack grid, pure: which items fill each of the Tab grid's tabs, in
// what order. No three.js, no DOM. hud.ts draws the tabs and the cells;
// itemthumbs.ts draws the items.

import { containersOf, isUsable, itemById, ITEMS, leftInOpen } from './items.ts'
import type { Inventory, ItemCategory, PackItem } from './interfaces.ts'

// The pack's tabs, left to right; it opens on the first.
export const PACK_TABS = [
  'consumables',
  'loot',
  'key-items',
  'materials',
] as const
export type PackTab = (typeof PACK_TABS)[number]

// The tabs the pack shows: its own, and at the locker the Locker tab after
// them (stash.ts), which holds the account's stash.
export const LOCKER_TAB = 'locker'
export type BagTab = PackTab | typeof LOCKER_TAB

// The tabs open now, left to right: the pack's, and the Locker tab at the
// locker.
export function bagTabs(atLocker: boolean): BagTab[] {
  return atLocker ? [...PACK_TABS, LOCKER_TAB] : [...PACK_TABS]
}

// Which tab each item category sits in: forage (the cabbages and the
// berries) and valuables (the gold bullion) are loot; the keys and what a
// quest asks for are key items. Nothing is a material yet.
const TAB_OF: Record<ItemCategory, PackTab> = {
  cigarette: 'consumables',
  joint: 'consumables',
  psychedelic: 'consumables',
  stimulant: 'consumables',
  drink: 'consumables',
  medicine: 'consumables',
  forage: 'loot',
  valuable: 'loot',
  'key-item': 'key-items',
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

// Everything the locker holds, every category together, in ITEMS order,
// counted like the pack's.
export function stashItems(stash: Inventory): PackItem[] {
  const items: PackItem[] = []
  for (const { id: kind, label, blurb } of ITEMS) {
    if ((stash[kind] || 0) < 1) continue
    items.push(counted(kind, label, blurb, stash))
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
