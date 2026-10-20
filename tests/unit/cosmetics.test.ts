import { describe, expect, it } from 'vitest'
import {
  affords,
  cosmeticById,
  COSMETICS,
  MOAB_OFFERS,
  moabOffer,
  moabWants,
  toCosmetics,
} from '../../src/cosmetics.ts'
import { STARTING_INVENTORY } from '../../src/inventory.ts'
import { itemById } from '../../src/items.ts'

const carrying = (gold: number) => ({
  ...STARTING_INVENTORY,
  'gold-bullion': gold,
})

describe('cosmetics', () => {
  it('prices every cosmetic in an item the pack can carry', () => {
    expect(new Set(COSMETICS.map((c) => c.id)).size).toBe(COSMETICS.length)
    for (const cosmetic of COSMETICS) {
      expect(cosmetic.label).toBeTruthy()
      expect(itemById(cosmetic.price.kind)).not.toBeNull()
      expect(Number.isInteger(cosmetic.price.count)).toBe(true)
      expect(cosmetic.price.count).toBeGreaterThan(0)
    }
    for (const offer of MOAB_OFFERS) expect(cosmeticById(offer)).not.toBeNull()
  })

  it('sells the Flaming Halo for one troy ounce of gold bullion', () => {
    expect(cosmeticById('flaming-halo')?.price).toEqual({
      kind: 'gold-bullion',
      count: 1,
    })
    expect(cosmeticById('golden-crown')).toBeNull()
  })

  it('sells David Coleman: #1 for ten troy ounces of gold bullion', () => {
    expect(cosmeticById('coleman-1')?.price).toEqual({
      kind: 'gold-bullion',
      count: 10,
    })
    for (const cosmetic of COSMETICS) {
      expect(cosmetic.offer).toBeTruthy()
      expect(cosmetic.traded).toBeTruthy()
      expect(cosmetic.worn).toBeTruthy()
    }
  })

  it('offers #1 to a raider carrying ten ounces, the halo to one with less', () => {
    expect(MOAB_OFFERS).toEqual(['coleman-1', 'flaming-halo'])
    expect(moabOffer(carrying(10), [])).toBe('coleman-1')
    expect(moabOffer(carrying(9), [])).toBe('flaming-halo')
    expect(moabOffer(carrying(10), ['coleman-1'])).toBe('flaming-halo')
    expect(moabOffer(carrying(10), ['coleman-1', 'flaming-halo'])).toBeNull()
    expect(moabWants([])).toBe('coleman-1')
    expect(moabWants(['coleman-1'])).toBe('flaming-halo')
    expect(moabWants(['coleman-1', 'flaming-halo'])).toBeNull()
  })

  it('keeps only the known cosmetics, each once, in table order', () => {
    expect(toCosmetics(['nope', 'flaming-halo', 'flaming-halo'])).toEqual([
      'flaming-halo',
    ])
    expect(toCosmetics(['coleman-1', 'flaming-halo'])).toEqual([
      'flaming-halo',
      'coleman-1',
    ])
    expect(toCosmetics('flaming-halo')).toEqual([])
    expect(toCosmetics(undefined)).toEqual([])
  })

  it('has Moab offer the halo only to a raider with gold and no halo', () => {
    expect(affords(carrying(1), 'flaming-halo')).toBe(true)
    expect(affords(carrying(0), 'flaming-halo')).toBe(false)
    expect(moabOffer(carrying(1), [])).toBe('flaming-halo')
    expect(moabOffer(carrying(5), [])).toBe('flaming-halo')
    expect(moabOffer(carrying(0), [])).toBeNull()
    expect(moabOffer({}, [])).toBeNull()
    expect(moabOffer(carrying(1), ['flaming-halo'])).toBeNull()
  })
})
