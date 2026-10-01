import { describe, expect, it } from 'vitest'
import {
  CIGARETTE_IDS,
  INVENTORY_KINDS,
  ITEMS,
  ITEM_IDS,
  cigaretteToSmoke,
  isCigarette,
  isDrink,
  isUsable,
  itemById,
  shopStock,
} from '../../src/items.js'
import { CONFIG } from '../../src/config.js'
import { CONTAINERS } from '../../src/drinks.js'

describe('items', () => {
  it('has unique ids and a known category', () => {
    expect(new Set(ITEM_IDS).size).toBe(ITEMS.length)
    for (const item of ITEMS) {
      expect(['cigarette', 'joint', 'drink', 'gear']).toContain(item.category)
    }
  })

  it('has five cigarettes, each with tuning and a shop cap', () => {
    expect(CIGARETTE_IDS).toHaveLength(5)
    for (const id of CIGARETTE_IDS) {
      const item = itemById(id)
      expect(item.smokeSeconds).toBeGreaterThan(0)
      expect(item.emberSeconds).toBeGreaterThan(0)
      expect(item.shopCap).toBeGreaterThan(0)
    }
  })

  it('gives every counted item its text and a starting count', () => {
    for (const id of INVENTORY_KINDS) {
      const item = itemById(id)
      const keys = ['label', 'blurb', 'bought']
      if (isUsable(id)) keys.push('used', 'empty')
      for (const key of keys) {
        expect(item[key], `${id}.${key}`).toBeTruthy()
      }
      expect(Number.isInteger(item.start), `${id}.start`).toBe(true)
    }
    expect(itemById('joints').perceptionSeconds).toBeGreaterThan(0)
  })

  it('gives every drink a known container and a shop cap, and no use', () => {
    const drinks = ITEMS.filter((item) => item.category === 'drink')
    expect(drinks).toHaveLength(16)
    for (const item of drinks) {
      expect(CONTAINERS[item.container], item.id).toBeTruthy()
      expect(item.shopCap, item.id).toBeGreaterThan(0)
      expect(isDrink(item.id)).toBe(true)
      expect(isUsable(item.id)).toBe(false)
    }
  })

  it('keeps gear out of the inventory', () => {
    expect(INVENTORY_KINDS).not.toContain('sack')
    expect(itemById('sack').carryLimit).toBeGreaterThan(
      CONFIG.cabbage.carryLimit
    )
  })

  it('tells cigarettes from other kinds', () => {
    expect(isCigarette('djarum')).toBe(true)
    expect(isCigarette('joints')).toBe(false)
    expect(isCigarette('nope')).toBe(false)
    expect(itemById('newport').label).toBe('Newports')
    expect(itemById('nope')).toBeNull()
  })

  it('stocks a fresh tailgate at each cap', () => {
    const stock = shopStock()
    expect(stock).toMatchObject({ marlboro: 2, joints: 2, sack: 1 })
    stock.marlboro = 0
    expect(shopStock().marlboro).toBe(2)
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
