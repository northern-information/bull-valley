import { describe, expect, it } from 'vitest'
import { CONFIG } from '../../src/config.ts'
import { CONTAINERS } from '../../src/drinks.ts'
import {
  CIGARETTE_IDS,
  cigaretteToSmoke,
  getItem,
  INVENTORY_KINDS,
  isCigarette,
  isDrink,
  isForage,
  isForSale,
  isUsable,
  ITEM_LIST,
  itemById,
  ITEMS,
} from '../../src/items.ts'
import type { Item } from '../../src/interfaces.ts'

describe('items', () => {
  it('has unique ids and a known category', () => {
    expect(new Set(ITEMS.map((item) => item.id)).size).toBe(ITEMS.length)
    for (const item of ITEMS) {
      expect(['cigarette', 'joint', 'drink', 'forage', 'gear']).toContain(
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
      keys.push(isForSale(id) ? 'bought' : 'collected')
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

  it('keeps gear out of the inventory', () => {
    expect(INVENTORY_KINDS).not.toContain('sack')
    expect(getItem('sack').carryLimit).toBeGreaterThan(
      CONFIG.cabbage.carryLimit
    )
  })

  it('tells cigarettes from other kinds', () => {
    expect(isCigarette('djarum')).toBe(true)
    expect(isCigarette('joints')).toBe(false)
    expect(isCigarette('nope')).toBe(false)
    expect(getItem('newport').label).toBe('Newports')
    expect(itemById('nope')).toBeNull()
  })

  it('prices every shelf item in whole cents', () => {
    const forSale = ITEM_LIST.filter((item) => isForSale(item.id))
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
    expect(isForage('berries')).toBe(true)
    expect(isForage('pbr')).toBe(false)
    expect(isForSale('berries')).toBe(false)
    expect('price' in berries).toBe(false)
    expect('bought' in berries).toBe(false)
    expect(berries.collected).toBeTruthy()
    expect(berries.start).toBe(0)
    expect(INVENTORY_KINDS).toContain('berries')
    expect(isUsable('berries')).toBe(false)
  })

  it('smokes the selected cigarette, else the first one carried', () => {
    const inv = { marlboro: 0, camel: 1, parliament: 0, newport: 2, djarum: 0 }
    expect(cigaretteToSmoke(inv, 'newport')).toBe('newport')
    expect(cigaretteToSmoke(inv, 'marlboro')).toBe('camel')
    expect(cigaretteToSmoke(inv, null)).toBe('camel')
    expect(cigaretteToSmoke({ ...inv, joints: 3 }, 'joints')).toBe('camel')
    expect(
      cigaretteToSmoke({ ...inv, camel: 0, newport: 0 }, 'camel')
    ).toBeNull()
  })
})
