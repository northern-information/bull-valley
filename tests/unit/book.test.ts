import { describe, expect, it } from 'vitest'
import {
  BOOK,
  CHAPTERS,
  entriesOf,
  entryOf,
  isEntry,
  itemsHeld,
  newlyFound,
  sightsInReach,
  tallyOf,
  toFound,
} from '../../src/book.ts'
import { ITEMS } from '../../src/items.ts'
import { DISCOVER_MAX } from '../../src/protocol.ts'
import type { Sight } from '../../src/book.ts'

describe('BOOK', () => {
  it('names each entry once, with words for every page', () => {
    const ids = BOOK.map((entry) => entry.id)
    expect(new Set(ids).size).toBe(ids.length)
    for (const entry of BOOK) {
      expect(entry.name, entry.id).not.toBe('')
      expect(entry.lore, entry.id).not.toBe('')
    }
  })

  it('fills every chapter, in the order the tabs read', () => {
    for (const chapter of CHAPTERS) {
      expect(entriesOf(chapter).length, chapter).toBeGreaterThan(0)
    }
    expect(BOOK.map((entry) => entry.chapter)).toEqual(
      CHAPTERS.flatMap((chapter) => entriesOf(chapter).map(() => chapter))
    )
  })

  it('has a page for every item, under its own name', () => {
    expect(entriesOf('items').map((entry) => entry.id)).toEqual(
      ITEMS.map((item) => item.id)
    )
    for (const item of ITEMS) expect(entryOf(item.id)?.name).toBe(item.label)
  })

  it('has a page for each of the folk the raider can talk to', () => {
    expect(entriesOf('folk').map((entry) => entry.id)).toEqual([
      'marx',
      'carlsten',
      'gron',
      'moab',
    ])
  })

  it('fits in one discover frame', () => {
    expect(BOOK.length).toBeLessThanOrEqual(DISCOVER_MAX)
  })
})

describe('isEntry', () => {
  it('knows the entries and nothing else', () => {
    expect(isEntry('citgo')).toBe(true)
    expect(isEntry('marlboro')).toBe(true)
    expect(isEntry('nowhere')).toBe(false)
    expect(isEntry(3)).toBe(false)
    expect(entryOf('nowhere')).toBeNull()
  })
})

describe('newlyFound', () => {
  it('adds what is real and not known, once each, in the order asked', () => {
    expect(
      newlyFound(new Set(['citgo']), [
        'marx',
        'citgo',
        'nowhere',
        'marx',
        7,
        'gron',
      ])
    ).toEqual(['marx', 'gron'])
  })

  it('adds nothing when everything asked is known', () => {
    expect(newlyFound(new Set(['citgo', 'marx']), ['marx', 'citgo'])).toEqual(
      []
    )
  })
})

describe('toFound', () => {
  it('keeps the real entries the valley sent', () => {
    expect([...toFound(['gron', 'gone', 'gron', 'citgo'])]).toEqual([
      'gron',
      'citgo',
    ])
  })
})

describe('tallyOf', () => {
  it('counts what is found of a chapter', () => {
    const found = new Set(['marx', 'gron', 'citgo'])
    expect(tallyOf(found, 'folk')).toEqual({
      found: 2,
      of: entriesOf('folk').length,
    })
    expect(tallyOf(new Set(), 'shadows')).toEqual({
      found: 0,
      of: entriesOf('shadows').length,
    })
  })
})

describe('sightsInReach', () => {
  const sights: Sight[] = [
    { id: 'citgo', x: 0, z: 0, reach: 10 },
    { id: 'wreck', x: 30, z: 0, reach: 5 },
    { id: 'corn-maze', x: 0, z: 40, reach: 20 },
  ]

  it('finds each place within its own reach, the edge included', () => {
    expect(sightsInReach(sights, { x: 0, z: 0 })).toEqual(['citgo'])
    expect(sightsInReach(sights, { x: 25, z: 0 })).toEqual(['wreck'])
    expect(sightsInReach(sights, { x: 0, z: 20 })).toEqual(['corn-maze'])
    expect(sightsInReach(sights, { x: 0, z: 25 })).toEqual(['corn-maze'])
    expect(sightsInReach(sights, { x: 100, z: 100 })).toEqual([])
  })
})

describe('itemsHeld', () => {
  it('names the items the pack holds any of', () => {
    expect(itemsHeld({ marlboro: 3, berries: 0, pbr: 1, nothing: 2 })).toEqual([
      'marlboro',
      'pbr',
    ])
  })
})
