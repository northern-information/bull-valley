// The Book of Shadows: everything in the valley a raider can come across,
// in four chapters (the places, the shadows, the folk, the items), each
// entry dark until the account first meets it. A place is met by walking
// within its reach, a shadow by coming within sight of one, one of the
// folk by talking to them, an item by its first coming into the pack.
//
// Pure, no Three. What the account has found is the account's, kept in D1
// by the valley (sharedworld.ts rule 18, worker/packs.ts); this says what
// the entries are and what an ask adds. The words are COPY.toml's [book]
// (an item's are its own, [items.<id>]); the portraits are bookthumbs.ts's.

import { copy } from './copy.ts'
import { ITEMS } from './items.ts'
import type { XZ } from './interfaces.ts'

export type Chapter = 'places' | 'shadows' | 'folk' | 'items'

// In the order the book's tabs read.
export const CHAPTERS: readonly Chapter[] = [
  'places',
  'shadows',
  'folk',
  'items',
]

export interface BookEntry {
  // Kept in D1 and sent on the wire; an item's is its item id.
  id: string
  chapter: Chapter
  name: string
  lore: string
}

// Everything but the items, in the order each chapter lists them.
const NAMED: readonly BookEntry[] = [
  {
    id: 'citgo',
    chapter: 'places',
    name: copy('book.citgo.name'),
    lore: copy('book.citgo.lore'),
  },
  {
    id: 'cabbage-stand',
    chapter: 'places',
    name: copy('book.cabbage-stand.name'),
    lore: copy('book.cabbage-stand.lore'),
  },
  {
    id: 'dishes',
    chapter: 'places',
    name: copy('book.dishes.name'),
    lore: copy('book.dishes.lore'),
  },
  {
    id: 'wreck',
    chapter: 'places',
    name: copy('book.wreck.name'),
    lore: copy('book.wreck.lore'),
  },
  {
    id: 'donut-field',
    chapter: 'places',
    name: copy('book.donut-field.name'),
    lore: copy('book.donut-field.lore'),
  },
  {
    id: 'corn-maze',
    chapter: 'places',
    name: copy('book.corn-maze.name'),
    lore: copy('book.corn-maze.lore'),
  },
  {
    id: 'maze-heart',
    chapter: 'places',
    name: copy('book.maze-heart.name'),
    lore: copy('book.maze-heart.lore'),
  },
  {
    id: 'keep',
    chapter: 'places',
    name: copy('places.keep'),
    lore: copy('book.keep.lore'),
  },
  {
    id: 'shadowman',
    chapter: 'shadows',
    name: copy('outfits.shadow'),
    lore: copy('book.shadowman.lore'),
  },
  {
    id: 'caretaker',
    chapter: 'shadows',
    name: copy('book.caretaker.name'),
    lore: copy('book.caretaker.lore'),
  },
  {
    id: 'marx',
    chapter: 'folk',
    name: copy('outfits.marx'),
    lore: copy('book.marx.lore'),
  },
  {
    id: 'carlsten',
    chapter: 'folk',
    name: copy('outfits.carlsten'),
    lore: copy('book.carlsten.lore'),
  },
  {
    id: 'gron',
    chapter: 'folk',
    name: copy('outfits.gron'),
    lore: copy('book.gron.lore'),
  },
  {
    id: 'moab',
    chapter: 'folk',
    name: copy('outfits.moab'),
    lore: copy('book.moab.lore'),
  },
]

// Every entry, chapter by chapter; the items in items.ts's order, each
// with its own name and blurb.
export const BOOK: readonly BookEntry[] = [
  ...NAMED,
  ...ITEMS.map((item) => ({
    id: item.id,
    chapter: 'items' as const,
    name: item.label,
    lore: item.blurb,
  })),
]

const BY_ID = new Map(BOOK.map((entry) => [entry.id, entry]))

// The most one discover frame may name: every entry at once.
export const DISCOVER_MAX = BOOK.length

export function isEntry(id: unknown): id is string {
  return typeof id === 'string' && BY_ID.has(id)
}

export function entryOf(id: string): BookEntry | null {
  return BY_ID.get(id) ?? null
}

// A chapter's entries, in the book's order.
export function entriesOf(chapter: Chapter): BookEntry[] {
  return BOOK.filter((entry) => entry.chapter === chapter)
}

// How many of a chapter's entries `found` holds, of how many.
export function tallyOf(
  found: ReadonlySet<string>,
  chapter: Chapter
): { found: number; of: number } {
  const all = entriesOf(chapter)
  return {
    found: all.filter((entry) => found.has(entry.id)).length,
    of: all.length,
  }
}

// What an ask adds to what is known: each named entry that is real and
// not known yet, once, in the order asked. The valley writes these, and
// they alone are news (sharedworld.ts rule 18).
export function newlyFound(
  known: ReadonlySet<string>,
  asked: readonly unknown[]
): string[] {
  const out: string[] = []
  for (const id of asked) {
    if (!isEntry(id) || known.has(id) || out.includes(id)) continue
    out.push(id)
  }
  return out
}

// The ids the valley keeps, as the client holds them: real entries only,
// once each.
export function toFound(ids: readonly unknown[]): Set<string> {
  return new Set(newlyFound(new Set(), ids))
}

// A place to be found by walking near it (world.ts places them).
export interface Sight extends XZ {
  id: string
  // Within this many metres of it, it is found.
  reach: number
}

// The places within reach of a raider standing at `at`.
export function sightsInReach(sights: readonly Sight[], at: XZ): string[] {
  return sights
    .filter(
      (sight) => Math.hypot(sight.x - at.x, sight.z - at.z) <= sight.reach
    )
    .map((sight) => sight.id)
}

// The items a pack holds any of, as entries.
export function itemsHeld(pack: Readonly<Record<string, number>>): string[] {
  return Object.entries(pack)
    .filter(([kind, count]) => count > 0 && BY_ID.has(kind))
    .map(([kind]) => kind)
}
