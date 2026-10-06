import { describe, expect, it } from 'vitest'
import { copy } from '../../src/copy.ts'
import { CONTAINERS } from '../../src/drinks.ts'
import {
  CIGARETTE_IDS,
  getItem,
  INVENTORY_KINDS,
  isCigarette,
  isDrink,
  isMedicine,
  isUsable,
  itemById,
  ITEMS,
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
      // Shelf items are bought; forage is collected off the bush.
      keys.push(item.price !== undefined ? 'bought' : 'collected')
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
    expect(forSale.length).toBe(ITEMS.length - 1)
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
})
