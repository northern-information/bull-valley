import { describe, expect, it } from 'vitest'
import { copy } from '../../src/copy.ts'
import { CONTAINERS } from '../../src/drinks.ts'
import {
  CIGARETTE_IDS,
  containersOf,
  contentsOf,
  getItem,
  INVENTORY_KINDS,
  isCigarette,
  isDrink,
  isMedicine,
  isUsable,
  itemById,
  ITEMS,
  leftInOpen,
} from '../../src/items.ts'
import type { Item } from '../../src/interfaces.ts'

describe('items', () => {
  it('has unique ids and a known category', () => {
    expect(new Set(ITEMS.map((item) => item.id)).size).toBe(ITEMS.length)
    for (const item of ITEMS) {
      expect(['cigarette', 'joint', 'drink', 'medicine', 'forage']).toContain(
        item.category
      )
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

  it('gives every counted item its text and a starting count', () => {
    for (const id of INVENTORY_KINDS) {
      const item = itemById(id)
      if (!item) throw new Error(`no item ${id}`)
      const keys: (keyof Item)[] = ['label', 'blurb']
      // Shelf items are bought; berries are collected off a bush.
      if (item.price !== undefined) keys.push('bought')
      if (id === 'berries') keys.push('collected')
      if (isUsable(id)) keys.push('used', 'empty')
      for (const key of keys) {
        expect(item[key], `${id}.${key}`).toBeTruthy()
      }
      expect(Number.isInteger(item.start), `${id}.start`).toBe(true)
    }
    expect(getItem('joints').perceptionSeconds).toBeGreaterThan(0)
  })

  it('gives every drink a known container, and no use', () => {
    const drinks = ITEMS.filter((item) => item.category === 'drink')
    expect(drinks).toHaveLength(17)
    for (const item of drinks) {
      expect(CONTAINERS[item.container], item.id).toBeTruthy()
      expect(isDrink(item.id)).toBe(true)
      expect(isUsable(item.id)).toBe(false)
    }
  })

  it('gives every medicine a known form, and no use', () => {
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
      expect(isUsable(item.id)).toBe(false)
    }
    expect(isMedicine('pbr')).toBe(false)
  })

  it('counts every item in the inventory', () => {
    expect(INVENTORY_KINDS).toEqual(ITEMS.map((item) => item.id))
  })

  it('tells cigarettes from other kinds', () => {
    expect(isCigarette('djarum')).toBe(true)
    expect(isCigarette('joints')).toBe(false)
    expect(isCigarette('nope')).toBe(false)
    expect(getItem('newport').label).toBe(copy('items.newport.label'))
    expect(itemById('nope')).toBeNull()
  })

  it('prices every shelf item in whole cents', () => {
    const items: readonly Item[] = ITEMS
    const forSale = items.filter((item) => item.price !== undefined)
    // All but the forage: the berries and the cabbages.
    expect(forSale.length).toBe(ITEMS.length - 2)
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
    expect('bought' in berries).toBe(false)
    expect(berries.collected).toBeTruthy()
    expect(berries.start).toBe(0)
    expect(INVENTORY_KINDS).toContain('berries')
    expect(isUsable('berries')).toBe(false)
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
