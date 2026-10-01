import { describe, expect, it } from 'vitest'
import {
  BRANDS,
  BRAND_IDS,
  brandById,
  brandToSmoke,
  isBrand,
} from '../../src/brands.js'
import { CONFIG } from '../../src/config.js'

describe('brands', () => {
  it('has five unique brands', () => {
    expect(BRANDS).toHaveLength(5)
    expect(new Set(BRAND_IDS).size).toBe(5)
  })

  it('gives every brand tuning and a shop cap', () => {
    for (const id of BRAND_IDS) {
      expect(CONFIG.items.cigarettes[id].smokeSeconds).toBeGreaterThan(0)
      expect(CONFIG.items.cigarettes[id].emberSeconds).toBeGreaterThan(0)
      expect(CONFIG.shop.cigarettes[id]).toBeGreaterThan(0)
    }
    expect(Object.keys(CONFIG.items.cigarettes).sort()).toEqual(
      [...BRAND_IDS].sort()
    )
  })

  it('tells brands from other kinds', () => {
    expect(isBrand('djarum')).toBe(true)
    expect(isBrand('joints')).toBe(false)
    expect(isBrand('cigarettes')).toBe(false)
    expect(brandById('newport').label).toBe('Newports')
    expect(brandById('nope')).toBeNull()
  })

  it('smokes the selected brand, else the first one carried', () => {
    const inv = { marlboro: 0, camel: 1, parliament: 0, newport: 2, djarum: 0 }
    expect(brandToSmoke(inv, 'newport')).toBe('newport')
    expect(brandToSmoke(inv, 'marlboro')).toBe('camel')
    expect(brandToSmoke(inv, null)).toBe('camel')
    expect(brandToSmoke({ ...inv, camel: 0, newport: 0 }, 'camel')).toBeNull()
  })
})
