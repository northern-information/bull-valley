import { describe, expect, it } from 'vitest'
import { CONFIG } from '../../src/config.ts'
import { copy } from '../../src/copy.ts'
import {
  atDealer,
  boughtLine,
  costIn,
  deal,
  DEALER_GOODS,
  dealRefusal,
  evenUp,
  freshDealerStock,
  goodOf,
  leftOf,
  offerWorth,
  payable,
  ramble,
  spareIn,
  unitWorth,
} from '../../src/dealer.ts'
import { itemLabel } from '../../src/itemcopy.ts'
import { getItem, itemById } from '../../src/items.ts'

const lsd = goodOf('lsd')
if (!lsd) throw new Error('no LSD')

describe('Erwin von Dutch', () => {
  it('deals LSD, Adderall, mushrooms and the slurm jar, none of them on a Citgo shelf or taken in trade', () => {
    expect(DEALER_GOODS.map((good) => good.kind)).toEqual([
      'lsd',
      'adderall',
      'mushrooms',
      'slurm-jar',
    ])
    for (const good of DEALER_GOODS) {
      expect(itemById(good.kind)?.price, good.kind).toBeUndefined()
      expect(unitWorth(good.kind), good.kind).toBe(0)
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
    const sale = deal(stock, 'lsd', { pbr: count }, { pbr: count })
    if (!sale.ok) throw new Error(sale.reason)
    expect(sale.give).toEqual({ pbr: count })
    expect(sale.units).toBe(1)
    expect(leftOf(sale.stock, 'lsd')).toBe(lsd.perDay - 1)
    // The stock he had is untouched.
    expect(leftOf(stock, 'lsd')).toBe(lsd.perDay)
    // Adderall comes by the bottle.
    const adderall = goodOf('adderall')
    if (!adderall) throw new Error('no Adderall')
    const pbr = costIn(adderall, 'pbr') ?? 0
    const pills = deal(stock, 'adderall', { pbr }, { pbr: 100 })
    expect(pills.ok && pills.units).toBe(getItem('adderall').contents)
  })

  it('takes any mix of kinds that covers the good, counted together', () => {
    const offer = { marlboro: 20, pbr: 6 }
    expect(offerWorth(offer)).toBeCloseTo(
      20 * unitWorth('marlboro') + 6 * unitWorth('pbr')
    )
    const pack = { marlboro: 200, pbr: 20, joints: 1 }
    const fill = evenUp(lsd, pack, { pbr: 3 })
    if (!fill) throw new Error('no fill')
    expect(offerWorth(fill)).toBeGreaterThanOrEqual(lsd.worth - 1e-6)
    expect(spareIn(lsd, fill)).toEqual([])
    const sale = deal(freshDealerStock(), 'lsd', fill, pack)
    expect(sale.ok && sale.give).toEqual(fill)
  })

  it('makes no change: an offer with a unit to spare is refused', () => {
    const count = costIn(lsd, 'marlboro') ?? 0
    const pack = { marlboro: 200, joints: 1 }
    expect(spareIn(lsd, { marlboro: count })).toEqual([])
    expect(spareIn(lsd, { marlboro: count + 1 })).toEqual(['marlboro'])
    expect(
      deal(freshDealerStock(), 'lsd', { marlboro: count + 1 }, pack)
    ).toEqual({
      ok: false,
      reason: 'over',
    })
    // A joint on top of enough smokes: the smokes are to spare.
    expect(spareIn(lsd, { marlboro: count, joints: 1 })).toContain('marlboro')
  })

  it('evens up out of the pack, cheapest first, and trims what it can spare', () => {
    // From nothing: all smokes, just enough.
    const count = costIn(lsd, 'marlboro') ?? 0
    expect(evenUp(lsd, { marlboro: 200, pbr: 50 }, {})).toEqual({
      marlboro: count,
    })
    // Too much on the table comes back down to even.
    expect(evenUp(lsd, { marlboro: 200 }, { marlboro: 199 })).toEqual({
      marlboro: count,
    })
    // What is on the table but not in the pack, or worthless, goes.
    expect(evenUp(lsd, { marlboro: 200 }, { pbr: 4, cabbage: 2 })).toEqual({
      marlboro: count,
    })
    // A pack that cannot cover it.
    expect(evenUp(lsd, { marlboro: 3, cabbage: 50 }, {})).toBeNull()
    // Never more than the pack holds of a kind.
    const mixed = evenUp(lsd, { marlboro: 5, pbr: 50 }, {})
    if (!mixed) throw new Error('no fill')
    expect(mixed.marlboro ?? 0).toBeLessThanOrEqual(5)
    expect(spareIn(lsd, mixed)).toEqual([])
  })

  it('refuses a good he lacks, one gone, payment he will not take, a pack short of it, and an empty offer', () => {
    const stock = freshDealerStock()
    const pack = { marlboro: 200, cabbage: 9 }
    const count = costIn(lsd, 'marlboro') ?? 0
    const smokes = { marlboro: count }
    expect(deal(stock, 'marlboro', smokes, pack)).toEqual({
      ok: false,
      reason: 'no-such-good',
    })
    expect(deal({ ...stock, lsd: 0 }, 'lsd', smokes, pack)).toEqual({
      ok: false,
      reason: 'sold-out',
    })
    expect(deal(stock, 'lsd', { ...smokes, cabbage: 1 }, pack)).toEqual({
      ok: false,
      reason: 'worthless',
    })
    expect(deal(stock, 'lsd', {}, pack)).toEqual({
      ok: false,
      reason: 'worthless',
    })
    expect(deal(stock, 'lsd', smokes, { marlboro: 1 })).toEqual({
      ok: false,
      reason: 'short',
    })
    expect(deal(stock, 'lsd', { marlboro: 2 }, pack)).toEqual({
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
    expect(dealRefusal('over')).toBe(copy('dealer.over'))
    expect(dealRefusal('worthless')).toBe(copy('dealer.worthless'))
    expect(dealRefusal('too-far')).toBe(copy('dealer.too_far'))
    expect(dealRefusal('unavailable')).toBe(copy('dealer.refused'))
  })
})

describe('boughtLine', () => {
  it('names the good a deal brought', () => {
    expect(boughtLine('lsd')).toBe(
      copy('dealer.bought', { item: itemLabel('lsd') })
    )
  })
})
