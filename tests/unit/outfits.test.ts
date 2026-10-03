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
  it('has the nine characters', () => {
    expect(OUTFIT_IDS).toEqual([
      'marx',
      'player',
      'shadow',
      'coleman',
      'kvistad',
      'church',
      'hanson',
      'halatek',
      'carlsten',
    ])
  })

  it('dresses Chris Halatek in the oversized NIN hoodie', () => {
    const chris = OUTFITS.halatek
    expect(chris.label).toBe('Chris Halatek')
    expect(chris.addons).toEqual(
      expect.arrayContaining([
        'dreadlocks',
        'bandana',
        'bandana-knot',
        'bandana-tails',
        'stubble',
        'hood-down',
        'kangaroo-pocket',
      ])
    )
    expect(chris.addons).not.toContain('goatee')
    expect(chris.prints?.torso).toEqual(['nin'])
    expect(chris.patterns?.pants).toBe('camo')
    // Long sleeves: a hoodie.
    expect(chris.sleeves).toBeUndefined()
    expect(chris.loose).toBeGreaterThan(1)
    expect(chris.baggy).toBeGreaterThan(1)
  })

  it('dresses David Carlsten for the counter', () => {
    const clerk = OUTFITS.carlsten
    expect(clerk.label).toBe('David Carlsten')
    expect(clerk.addons).toEqual(
      expect.arrayContaining([
        'long-hair',
        'goatee',
        'glasses',
        'glasses-arms',
        'beret',
      ])
    )
    expect(clerk.patterns?.shirt).toBe('plaid')
    expect(clerk.baggy).toBeGreaterThan(1)
    expect(clerk.inHand).toBe('bat')
    // Long sleeves: the plaid wraps the arms too.
    expect(clerk.sleeves).toBeUndefined()
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
      } else if ('crescents' in addon) {
        expect(addon.crescents.length).toBeGreaterThanOrEqual(1)
        for (const one of addon.crescents) {
          expect(one.at).toHaveLength(2)
          expect(addon.joint).toBe('neck')
          expect(one.width).toBeLessThan(one.radius * 2)
        }
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
