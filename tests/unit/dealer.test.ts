import { describe, expect, it } from 'vitest'
import { CONFIG } from '../../src/config.ts'
import { copy } from '../../src/copy.ts'
import {
  atDealer,
  costIn,
  deal,
  DEALER_GOODS,
  dealRefusal,
  freshDealerStock,
  goodOf,
  leftOf,
  payable,
  ramble,
  unitWorth,
} from '../../src/dealer.ts'
import { getItem, itemById } from '../../src/items.ts'

const lsd = goodOf('lsd')
if (!lsd) throw new Error('no LSD')

describe('Erwin von Dutch', () => {
  it('deals LSD, Adderall and mushrooms, none of them on a Citgo shelf', () => {
    expect(DEALER_GOODS.map((good) => good.kind)).toEqual([
      'lsd',
      'adderall',
      'mushrooms',
    ])
    for (const good of DEALER_GOODS) {
      expect(itemById(good.kind)?.price, good.kind).toBeUndefined()
      expect(Number.isInteger(good.worth) && good.worth > 0).toBe(true)
      expect(good.perDay).toBeGreaterThan(0)
    }
    expect(goodOf('marlboro')).toBeNull()
  })

  it('starts every day with a day of each', () => {
    const stock = freshDealerStock()
    for (const good of DEALER_GOODS) {
      expect(leftOf(stock, good.kind)).toBe(good.perDay)
    }
    expect(leftOf(stock, 'marlboro')).toBe(0)
  })

  it('counts each unit at a little under its shelf price, and cash at nothing', () => {
    const marlboro = getItem('marlboro')
    expect(unitWorth('marlboro')).toBeCloseTo(
      (marlboro.price / marlboro.contents) * CONFIG.dealer.rate
    )
    expect(CONFIG.dealer.rate).toBeLessThan(1)
    expect(CONFIG.dealer.rate).toBeGreaterThan(0.8)
    expect(unitWorth('cabbage')).toBe(0)
    expect(unitWorth('gold-bullion')).toBe(0)
    expect(unitWorth('lsd')).toBe(0)
    expect(unitWorth('dimes')).toBe(0)
  })

  it('asks enough units to cover the good, rounded up', () => {
    const count = costIn(lsd, 'marlboro')
    if (count === null) throw new Error('refused Marlboro')
    expect(count * unitWorth('marlboro')).toBeGreaterThanOrEqual(lsd.worth)
    expect((count - 1) * unitWorth('marlboro')).toBeLessThan(lsd.worth)
    expect(costIn(lsd, 'cabbage')).toBeNull()
  })

  it('trades one out of the stock for units out of the pack', () => {
    const stock = freshDealerStock()
    const count = costIn(lsd, 'pbr') ?? 0
    const sale = deal(stock, 'lsd', 'pbr', { pbr: count })
    if (!sale.ok) throw new Error(sale.reason)
    expect(sale.give).toEqual({ kind: 'pbr', count })
    expect(sale.units).toBe(1)
    expect(leftOf(sale.stock, 'lsd')).toBe(lsd.perDay - 1)
    // The stock he had is untouched.
    expect(leftOf(stock, 'lsd')).toBe(lsd.perDay)
    // Adderall comes by the bottle.
    const pills = deal(stock, 'adderall', 'pbr', { pbr: 100 })
    expect(pills.ok && pills.units).toBe(getItem('adderall').contents)
  })

  it('refuses a good he lacks, one gone, payment he will not take, and a pack short of it', () => {
    const stock = freshDealerStock()
    const pack = { marlboro: 200, cabbage: 9 }
    expect(deal(stock, 'marlboro', 'marlboro', pack)).toEqual({
      ok: false,
      reason: 'no-such-good',
    })
    expect(deal({ ...stock, lsd: 0 }, 'lsd', 'marlboro', pack)).toEqual({
      ok: false,
      reason: 'sold-out',
    })
    expect(deal(stock, 'lsd', 'cabbage', pack)).toEqual({
      ok: false,
      reason: 'worthless',
    })
    expect(deal(stock, 'lsd', 'marlboro', { marlboro: 1 })).toEqual({
      ok: false,
      reason: 'short',
    })
  })

  it('names what a pack could pay him with', () => {
    expect(
      payable({ marlboro: 3, cabbage: 2, pbr: 0, joints: 1, 'vault-key': 1 })
    ).toEqual(['marlboro', 'joints'])
  })

  it('deals only with a raider beside him', () => {
    const at = { x: 10, z: 10 }
    const reach = CONFIG.dealer.dealReach
    expect(atDealer({ x: 10 + reach - 0.1, z: 10 }, at)).toBe(true)
    expect(atDealer({ x: 10 + reach + 0.1, z: 10 }, at)).toBe(false)
    expect(atDealer(null, at)).toBe(false)
    expect(atDealer(at, null)).toBe(false)
  })

  it('rambles about the currency, round again, and says why he refused', () => {
    expect(ramble(0)).toBe(copy('dealer.ramble_1'))
    expect(ramble(3)).toBe(copy('dealer.ramble_4'))
    expect(ramble(4)).toBe(ramble(0))
    expect(dealRefusal('sold-out')).toBe(copy('dealer.sold_out'))
    expect(dealRefusal('short')).toBe(copy('dealer.short'))
    expect(dealRefusal('worthless')).toBe(copy('dealer.worthless'))
    expect(dealRefusal('too-far')).toBe(copy('dealer.too_far'))
    expect(dealRefusal('unavailable')).toBe(copy('dealer.refused'))
  })
})
