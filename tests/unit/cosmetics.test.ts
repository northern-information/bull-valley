import { describe, expect, it } from 'vitest'
import { copy } from '../../src/copy.ts'
import {
  affords,
  cosmeticById,
  COSMETICS,
  gainedOf,
  MOAB_OFFERS,
  moabOffer,
  moabWants,
  moabWorth,
  toCosmetics,
  tradeRefusal,
} from '../../src/cosmetics.ts'
import { STARTING_INVENTORY } from '../../src/inventory.ts'
import { itemLabel } from '../../src/itemcopy.ts'
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

  it('counts gold by the ounce in his window, and nothing else', () => {
    expect(moabWorth('gold-bullion')).toBe(1)
    expect(moabWorth('marlboro')).toBe(0)
    for (const id of MOAB_OFFERS) {
      const cosmetic = cosmeticById(id)
      expect(cosmetic && moabWorth(cosmetic.price.kind)).toBe(1)
    }
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

describe('gainedOf', () => {
  it('names only what the account did not wear before', () => {
    expect(gainedOf([], ['flaming-halo'])).toEqual(['flaming-halo'])
    expect(gainedOf(['flaming-halo'], ['flaming-halo', 'coleman-1'])).toEqual([
      'coleman-1',
    ])
    expect(gainedOf(['flaming-halo'], ['flaming-halo'])).toEqual([])
  })
})

describe("Moab's refusal", () => {
  it('says what a trade is short of, that it is owned, or no', () => {
    const halo = cosmeticById('flaming-halo')!
    expect(tradeRefusal('short', 'flaming-halo')).toBe(
      copy('log.trade_short', {
        count: halo.price.count,
        price: itemLabel(halo.price.kind),
      })
    )
    expect(tradeRefusal('owned', 'flaming-halo')).toBe(
      copy('log.trade_owned', { cosmetic: halo.label })
    )
    expect(tradeRefusal('short', null)).toBe(copy('log.trade_refused'))
    expect(tradeRefusal('gone', 'flaming-halo')).toBe(copy('log.trade_refused'))
  })
})
