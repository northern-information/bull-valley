// The Recycling Center at the wreck (#127), pure: what using an item leaves
// behind in the pack. A drink leaves its can or its bottle; the last
// cigarette out of a pack leaves the pack. The valley puts the empty in
// (sharedworld.ts rule 32). No three.js, no DOM.

import { isCan } from './drinks.ts'
import { contentsOf, itemById } from './items.ts'
import type { ItemId } from './items.ts'

// The empty one use of `kind` leaves, with `left` units of it still in the
// pack after the use; null when it leaves nothing.
export function emptyOf(kind: string, left: number): ItemId | null {
  const item = itemById(kind)
  if (!item) return null
  switch (item.category) {
    case 'drink':
      return isCan(item.container) ? 'empty-can' : 'empty-bottle'
    case 'cigarette':
      return left >= 0 && left % contentsOf(kind) === 0 ? 'empty-pack' : null
    default:
      return null
  }
}
