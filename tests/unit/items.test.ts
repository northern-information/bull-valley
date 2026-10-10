import { describe, expect, it } from 'vitest'
import { CONTAINERS } from '../../src/drinks.ts'
import {
  CIGARETTE_IDS,
  containersOf,
  contentsOf,
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
import type { Item } from '../../src/interfaces.ts'

describe('items', () => {
  it('has unique ids and a known category', () => {
    expect(new Set(ITEMS.map((item) => item.id)).size).toBe(ITEMS.length)
    for (const item of ITEMS) {
      expect([
        'cigarette',
        'joint',
        'drink',
        'medicine',
        'forage',
        'valuable',
      ]).toContain(item.category)
    }
  })

  it('has five cigarettes, each with tuning', () => {
    expect(CIGARETTE_IDS).toHaveLength(5)
    for (const id of CIGARETTE_IDS) {
      const item = itemById(id)
      if (!item) throw new Error(`no item ${id}`)
      expect(item.smokeSeconds).toBeGreaterThan(0)
      expect(item.emberSeconds).toBeGreaterThan(0)
    }
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
    expect(drinks).toHaveLength(17)
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
      expect(itemById(id)?.geometrie?.stimulated, id).toBeGreaterThan(0)
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
    expect(medicine.map((item) => item.id)).toEqual([
      'aspirin',
      'ibuprofen',
      'benadryl',
      'eye-drops',
    ])
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
    expect(isMedicine('pbr')).toBe(false)
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

  it('prices every shelf item in whole cents', () => {
    const items: readonly Item[] = ITEMS
    const forSale = items.filter((item) => item.price !== undefined)
    // All but the forage (the berries and the cabbages) and the gold.
    expect(forSale.length).toBe(ITEMS.length - 3)
    for (const item of forSale) {
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
