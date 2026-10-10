import { describe, expect, it } from 'vitest'
import { CONFIG } from '../../src/config.ts'
import { copy } from '../../src/copy.ts'
import {
  atDealer,
  deal,
  DEALER_GOODS,
  dealRefusal,
  freshDealerStock,
  goodOf,
  leftOf,
} from '../../src/dealer.ts'
import { itemById } from '../../src/items.ts'

describe('the dealer', () => {
  it('sells real items no Citgo shelf carries at his price, the key among them', () => {
    for (const good of DEALER_GOODS) {
      expect(itemById(good.kind), good.kind).not.toBeNull()
      expect(Number.isInteger(good.price) && good.price > 0).toBe(true)
      expect(good.perDay).toBeGreaterThan(0)
    }
    expect(goodOf('vault-key')).not.toBeNull()
    expect(goodOf('mushrooms')).not.toBeNull()
    expect(goodOf('marlboro')).toBeNull()
    expect(itemById('mushrooms')?.price).toBeUndefined()
    expect(itemById('vault-key')?.price).toBeUndefined()
  })

  it('starts every day with a day of each', () => {
    const stock = freshDealerStock()
    for (const good of DEALER_GOODS) {
      expect(leftOf(stock, good.kind)).toBe(good.perDay)
    }
    expect(leftOf(stock, 'marlboro')).toBe(0)
  })

  it('sells one out of the stock for its price', () => {
    const stock = freshDealerStock()
    const sale = deal(stock, 'mushrooms', 10_000, {})
    if (!sale.ok) throw new Error(sale.reason)
    const good = goodOf('mushrooms')
    expect(sale.price).toBe(good?.price)
    expect(sale.units).toBe(1)
    expect(leftOf(sale.stock, 'mushrooms')).toBe(leftOf(stock, 'mushrooms') - 1)
    // The stock he had is untouched.
    expect(leftOf(stock, 'mushrooms')).toBe(good?.perDay)
  })

  it('refuses a good he lacks, one sold out, a key already carried, and a short wallet', () => {
    const stock = freshDealerStock()
    expect(deal(stock, 'marlboro', 10_000, {})).toEqual({
      ok: false,
      reason: 'no-such-good',
    })
    expect(deal({ ...stock, joints: 0 }, 'joints', 10_000, {})).toEqual({
      ok: false,
      reason: 'sold-out',
    })
    expect(deal(stock, 'vault-key', 10_000, { 'vault-key': 1 })).toEqual({
      ok: false,
      reason: 'have-one',
    })
    // Mushrooms in the pack are no reason not to sell more.
    expect(deal(stock, 'mushrooms', 10_000, { mushrooms: 3 }).ok).toBe(true)
    expect(deal(stock, 'vault-key', 100, {})).toEqual({
      ok: false,
      reason: 'short',
    })
  })

  it('deals only with a raider beside him', () => {
    const at = { x: 10, z: 10 }
    const reach = CONFIG.dealer.dealReach
    expect(atDealer({ x: 10 + reach - 0.1, z: 10 }, at)).toBe(true)
    expect(atDealer({ x: 10 + reach + 0.1, z: 10 }, at)).toBe(false)
    expect(atDealer(null, at)).toBe(false)
    expect(atDealer(at, null)).toBe(false)
  })

  it('says why a deal was refused', () => {
    expect(dealRefusal('sold-out')).toBe(copy('dealer.sold_out'))
    expect(dealRefusal('short')).toBe(copy('dealer.short'))
    expect(dealRefusal('have-one')).toBe(copy('dealer.have_one'))
    expect(dealRefusal('too-far')).toBe(copy('dealer.too_far'))
    expect(dealRefusal('unavailable')).toBe(copy('dealer.refused'))
  })
})
