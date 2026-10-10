// Every item's words, from COPY.toml ([items.<id>]): its label (the name
// in the pack, and floating over a pickup or shelf unit), its blurb (the
// pack's item card) and its log lines. They live apart from items.ts so
// the item table, and every pure module that reads it, stays free of the
// copy book (an e2e spec can import those; it cannot load COPY.toml).
//
// Which lines an item has follows the table: anything usable says used and
// empty, anything with a price says bought, and the berries alone say
// collected, off the bush.

import { copy } from './copy.ts'
import { isItemId, isUsable, itemById, ITEMS } from './items.ts'
import type { ItemId } from './items.ts'

export type ItemLine = 'used' | 'bought' | 'collected' | 'empty'

export const ITEM_LINES: readonly ItemLine[] = [
  'used',
  'bought',
  'collected',
  'empty',
]

// Whether `id` has a `line` to say.
export function hasItemLine(id: ItemId, line: ItemLine): boolean {
  switch (line) {
    case 'used':
    case 'empty':
      return isUsable(id)
    case 'bought':
      return itemById(id)?.price !== undefined
    case 'collected':
      return id === 'berries'
  }
}

// The item's name, or the id itself for one the table does not know.
export function itemLabel(id: string): string {
  return isItemId(id) ? copy(`items.${id}.label`) : id
}

// The item card's description; nothing for an id the table does not know.
export function itemBlurb(id: string): string {
  return isItemId(id) ? copy(`items.${id}.blurb`) : ''
}

// The chat line for `line`, or null when the item has none to say.
export function itemLine(id: string, line: ItemLine): string | null {
  return isItemId(id) && hasItemLine(id, line)
    ? copy(`items.${id}.${line}`)
    : null
}

// Every key this module asks COPY.toml for (tests/unit/copy.test.ts counts
// them among the keys the code uses).
export const ITEM_COPY_KEYS: readonly string[] = ITEMS.flatMap(({ id }) => [
  `items.${id}.label`,
  `items.${id}.blurb`,
  ...ITEM_LINES.filter((line) => hasItemLine(id, line)).map(
    (line) => `items.${id}.${line}`
  ),
])
