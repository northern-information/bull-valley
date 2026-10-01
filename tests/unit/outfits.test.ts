import { describe, expect, it } from 'vitest'
import {
  ADDONS,
  BODY_SLOTS,
  OUTFIT_IDS,
  outfitById,
  OUTFITS,
} from '../../src/outfits.ts'
import { JOINTS } from '../../src/poses.ts'

describe('outfits', () => {
  it('has the seven characters', () => {
    expect(OUTFIT_IDS).toEqual([
      'marx',
      'player',
      'shadow',
      'coleman',
      'kvistad',
      'church',
      'hanson',
    ])
  })

  it('colors every body slot with a hex color', () => {
    for (const outfit of Object.values(OUTFITS)) {
      for (const slot of BODY_SLOTS) {
        expect(outfit.colors[slot]).toMatch(/^#[0-9a-f]{6}$/)
      }
    }
  })

  it('uses only known add-ons, with their color slot filled', () => {
    for (const outfit of Object.values(OUTFITS)) {
      for (const id of outfit.addons) {
        expect(ADDONS[id]).toBeDefined()
        expect(outfit.colors[ADDONS[id].slot]).toMatch(/^#[0-9a-f]{6}$/)
      }
    }
  })

  it('attaches every add-on to a real joint', () => {
    for (const addon of Object.values(ADDONS)) {
      expect(JOINTS).toContain(addon.joint)
      if ('rings' in addon) {
        expect(addon.rings.length).toBeGreaterThanOrEqual(2)
        for (const ring of addon.rings) expect(ring).toHaveLength(4)
      } else {
        expect(addon.box).toHaveLength(3)
      }
      for (const at of addon.offsets || [addon.offset || [0, 0, 0]]) {
        expect(at).toHaveLength(3)
      }
    }
  })

  it('throws on an unknown outfit', () => {
    expect(() => outfitById('snake')).toThrow()
  })
})
