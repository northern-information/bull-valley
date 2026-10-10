import { describe, expect, it } from 'vitest'
import { CONTAINERS } from '../../src/drinks.ts'
import {
  CIGARETTE_IDS,
  containersOf,
  contentsOf,
  geometrieOf,
  getItem,
  healsOf,
  INVENTORY_KINDS,
  isCigarette,
  isDrink,
  isMedicine,
  isUsable,
  itemById,
  ITEMS,
  leftInOpen,
  tripSecondsOf,
} from '../../src/items.ts'
import type { Item, ItemCategory } from '../../src/items.ts'

// The fields each category carries beyond the ones every item has (id,
// category, start, and contents when it is a container): the shape of the
// union in items.ts, which the table must match entry by entry.
const COMMON = ['id', 'category', 'start', 'contents']
const FIELDS_OF: Record<
  ItemCategory,
  { required: string[]; optional: string[] }
> = {
  cigarette: {
    required: ['price', 'smokeSeconds', 'emberSeconds', 'geometrie'],
    optional: [],
  },
  joint: {
    required: ['price', 'perceptionSeconds', 'geometrie'],
    optional: [],
  },
  drink: {
    required: ['price', 'container', 'tripSeconds', 'geometrie'],
    optional: [],
  },
  medicine: { required: ['price', 'form'], optional: ['heals'] },
  forage: { required: [], optional: [] },
  valuable: { required: [], optional: [] },
}

describe('items', () => {
  it('has unique ids and a known category', () => {
    expect(new Set(ITEMS.map((item) => item.id)).size).toBe(ITEMS.length)
    for (const item of ITEMS) {
      expect(Object.keys(FIELDS_OF)).toContain(item.category)
    }
  })

  it('gives each category exactly its own fields', () => {
    for (const item of ITEMS as readonly Item[]) {
      const { required, optional } = FIELDS_OF[item.category]
      const keys = Object.keys(item)
      for (const key of required)
        expect(keys, `${item.id}.${key}`).toContain(key)
      for (const key of keys) {
        expect(
          [...COMMON, ...required, ...optional],
          `${item.id}.${key}`
        ).toContain(key)
      }
    }
  })

  it('has cigarettes, each with tuning', () => {
    expect(CIGARETTE_IDS.length).toBeGreaterThan(0)
    expect(CIGARETTE_IDS).toEqual(
      ITEMS.filter((item) => item.category === 'cigarette').map((i) => i.id)
    )
    for (const id of CIGARETTE_IDS) {
      const item = itemById(id)
      if (item?.category !== 'cigarette') throw new Error(`no cigarette ${id}`)
      expect(item.smokeSeconds).toBeGreaterThan(0)
      expect(item.emberSeconds).toBeGreaterThan(0)
    }
  })

  it('tells each category apart by its guard', () => {
    for (const item of ITEMS) {
      expect(isCigarette(item.id), item.id).toBe(item.category === 'cigarette')
      expect(isDrink(item.id), item.id).toBe(item.category === 'drink')
      expect(isMedicine(item.id), item.id).toBe(item.category === 'medicine')
    }
    expect(isCigarette('nope')).toBe(false)
    expect(isDrink('nope')).toBe(false)
    expect(isMedicine('nope')).toBe(false)
  })

  it('doses geometrie off anything smoked or drunk, and nothing else', () => {
    for (const item of ITEMS) {
      const dosed =
        item.category === 'cigarette' ||
        item.category === 'joint' ||
        item.category === 'drink'
      expect(geometrieOf(item.id), item.id).toEqual(
        dosed ? item.geometrie : undefined
      )
    }
    expect(geometrieOf('nope')).toBeUndefined()
  })

  it('gives every counted item a starting count', () => {
    for (const id of INVENTORY_KINDS) {
      const item = itemById(id)
      if (!item) throw new Error(`no item ${id}`)
      expect(Number.isInteger(item.start), `${id}.start`).toBe(true)
    }
    expect(getItem('joints').perceptionSeconds).toBeGreaterThan(0)
  })

  it('gives every drink a known container and a dose of geometrie', () => {
    const drinks = ITEMS.filter((item) => item.category === 'drink')
    expect(drinks.length).toBeGreaterThan(0)
    for (const item of drinks) {
      expect(CONTAINERS[item.container], item.id).toBeTruthy()
      expect(isDrink(item.id)).toBe(true)
      expect(isUsable(item.id)).toBe(true)
      expect(Object.keys(item.geometrie).length, item.id).toBeGreaterThan(0)
    }
    // The energy drinks stimulate, the beer gets you drunk, Four Loko does
    // both, and water sobers you.
    expect(getItem('red-bull').geometrie).toEqual({ stimulated: 0.25 })
    expect(getItem('pbr').geometrie).toEqual({ drunk: 0.15 })
    expect(getItem('four-loko-blue').geometrie.stimulated).toBeGreaterThan(0)
    expect(getItem('four-loko-blue').geometrie.drunk).toBeGreaterThan(0)
    expect(getItem('ice-mountain').geometrie.drunk).toBeLessThan(0)
  })

  it('gets you high off a joint and stimulated off a cigarette', () => {
    expect(getItem('joints').geometrie.high).toBeGreaterThan(0)
    for (const id of CIGARETTE_IDS) {
      expect(geometrieOf(id)?.stimulated, id).toBeGreaterThan(0)
    }
  })

  it('trips on anything smoked or drunk, for as long as it lasts', () => {
    for (const item of ITEMS.filter((i) => i.category === 'drink')) {
      expect(tripSecondsOf(item.id), item.id).toBeGreaterThan(0)
    }
    expect(tripSecondsOf('marlboro')).toBe(getItem('marlboro').smokeSeconds)
    expect(tripSecondsOf('joints')).toBe(getItem('joints').perceptionSeconds)
    expect(tripSecondsOf('aspirin')).toBe(0)
    expect(tripSecondsOf('nope')).toBe(0)
  })

  it('gives every medicine a known form, and a use only when it heals', () => {
    const medicine = ITEMS.filter((item) => item.category === 'medicine')
    expect(medicine.length).toBeGreaterThan(0)
    for (const item of medicine) {
      expect(['pills', 'carton', 'dropper'], item.id).toContain(item.form)
      expect(isMedicine(item.id)).toBe(true)
      expect(isDrink(item.id)).toBe(false)
      expect(isUsable(item.id)).toBe(healsOf(item.id) > 0)
    }
    expect(healsOf('aspirin')).toBe(1)
    expect(healsOf('ibuprofen')).toBe(1)
    expect(healsOf('benadryl')).toBe(0)
    expect(healsOf('pbr')).toBe(0)
    expect(healsOf('nope')).toBe(0)
    expect(isMedicine('pbr')).toBe(false)
    expect(isUsable('nope')).toBe(false)
  })

  it('counts every item in the inventory', () => {
    expect(INVENTORY_KINDS).toEqual(ITEMS.map((item) => item.id))
  })

  it('tells cigarettes from other kinds', () => {
    expect(isCigarette('djarum')).toBe(true)
    expect(isCigarette('joints')).toBe(false)
    expect(isCigarette('nope')).toBe(false)
    expect(itemById('nope')).toBeNull()
  })

  it('prices every shelf item in whole cents, and nothing else', () => {
    const items: readonly Item[] = ITEMS
    for (const item of items) {
      // Everything but the forage and the valuables is on a shelf.
      const onShelf = item.category !== 'forage' && item.category !== 'valuable'
      expect(item.price !== undefined, item.id).toBe(onShelf)
      if (item.price === undefined) continue
      expect(Number.isInteger(item.price), item.id).toBe(true)
      expect(item.price, item.id).toBeGreaterThan(0)
    }
    expect(getItem('marlboro').price).toBe(549)
  })

  it('keeps the berries off the shelves and in the inventory, with no use yet', () => {
    const berries = getItem('berries')
    expect(berries.category).toBe('forage')
    expect('price' in berries).toBe(false)
    expect(berries.start).toBe(0)
    expect(INVENTORY_KINDS).toContain('berries')
    expect(isUsable('berries')).toBe(false)
  })

  it('carries gold bullion in the pack, never for sale and of no use', () => {
    const gold = getItem('gold-bullion')
    expect(gold.category).toBe('valuable')
    expect('price' in gold).toBe(false)
    expect(gold.start).toBe(0)
    expect(INVENTORY_KINDS).toContain('gold-bullion')
    expect(isUsable('gold-bullion')).toBe(false)
  })

  it('carries cabbages in the pack like any forage, never for sale', () => {
    const cabbage = getItem('cabbage')
    expect(cabbage.category).toBe('forage')
    expect('price' in cabbage).toBe(false)
    expect(INVENTORY_KINDS).toContain('cabbage')
    expect(isUsable('cabbage')).toBe(false)
  })
})

describe('containers', () => {
  it('holds a pack of cigarettes and a bottle of pills', () => {
    for (const id of CIGARETTE_IDS) expect(contentsOf(id)).toBe(20)
    expect(contentsOf('aspirin')).toBe(24)
    expect(contentsOf('joints')).toBe(1)
    expect(contentsOf('nope')).toBe(1)
  })

  it('counts full containers and the open one', () => {
    expect(containersOf('marlboro', 0)).toBe(0)
    expect(containersOf('marlboro', 1)).toBe(1)
    expect(containersOf('marlboro', 20)).toBe(1)
    expect(containersOf('marlboro', 21)).toBe(2)
    expect(containersOf('joints', 3)).toBe(3)
  })

  it('says what is left in the open one', () => {
    expect(leftInOpen('marlboro', 0)).toBe(0)
    expect(leftInOpen('marlboro', 18)).toBe(18)
    expect(leftInOpen('marlboro', 20)).toBe(20)
    expect(leftInOpen('marlboro', 23)).toBe(3)
    expect(leftInOpen('joints', 2)).toBeNull()
  })
})
