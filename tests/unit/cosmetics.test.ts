import { describe, expect, it } from 'vitest'
import {
  affords,
  cosmeticById,
  COSMETICS,
  isCosmetic,
  MOAB_OFFERS,
  moabOffer,
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
    for (const offer of MOAB_OFFERS) expect(isCosmetic(offer)).toBe(true)
  })

  it('sells the Flaming Halo for one troy ounce of gold bullion', () => {
    expect(cosmeticById('flaming-halo')?.price).toEqual({
      kind: 'gold-bullion',
      count: 1,
    })
    expect(cosmeticById('golden-crown')).toBeNull()
    expect(isCosmetic('golden-crown')).toBe(false)
  })

  it('keeps only the known cosmetics, each once, in table order', () => {
    expect(toCosmetics(['nope', 'flaming-halo', 'flaming-halo'])).toEqual([
      'flaming-halo',
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
