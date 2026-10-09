import { describe, expect, it } from 'vitest'
import { CONFIG } from '../../src/config.ts'
import { copy } from '../../src/copy.ts'
import {
  accruedAt,
  affordsUpgrade,
  atStand,
  capOf,
  collect,
  collectable,
  FRESH_STAND,
  fullAt,
  isGood,
  isStandLedger,
  levelOf,
  ratePerHour,
  refusalLine,
  settle,
  shelfRoom,
  standXp,
  stock,
  stocked,
  topLevel,
  upgrade,
  upgradePrice,
} from '../../src/stand.ts'
import type { StandLedger } from '../../src/stand.ts'

const HOUR = 60 * 60 * 1000
const [one, two] = CONFIG.stand.levels

// A level-1 stand with its table full since t = 0.
function full(): StandLedger {
  return { ...FRESH_STAND, stock: { cabbage: one.shelf } }
}

describe('the Cabbage Stand', () => {
  it('starts at level 1 with an empty table and nothing banked', () => {
    expect(levelOf(FRESH_STAND)).toBe(one)
    expect(stocked(FRESH_STAND)).toBe(0)
    expect(shelfRoom(FRESH_STAND)).toBe(one.shelf)
    expect(ratePerHour(FRESH_STAND)).toBe(0)
    expect(accruedAt(FRESH_STAND, 100 * HOUR)).toBe(0)
    expect(fullAt(FRESH_STAND, 0)).toBeNull()
    expect(collect(FRESH_STAND, 100 * HOUR)).toBeNull()
  })

  it('takes only goods, and no more than the table holds', () => {
    expect(isGood('cabbage')).toBe(true)
    expect(isGood('berries')).toBe(true)
    expect(isGood('joints')).toBe(false)
    expect(stock(FRESH_STAND, 'joints', 1, 0)).toBeNull()
    expect(stock(FRESH_STAND, 'cabbage', 0, 0)).toBeNull()
    expect(stock(FRESH_STAND, 'cabbage', 1.5, 0)).toBeNull()
    expect(stock(FRESH_STAND, 'cabbage', one.shelf + 1, 0)).toBeNull()
    const some = stock(FRESH_STAND, 'cabbage', 2, 0)
    expect(some?.stock).toEqual({ cabbage: 2 })
    const more = some && stock(some, 'berries', one.shelf - 2, 0)
    expect(more && stocked(more)).toBe(one.shelf)
    expect(more && shelfRoom(more)).toBe(0)
    expect(more && stock(more, 'cabbage', 1, 0)).toBeNull()
  })

  it('earns the level rate for the share of the table filled', () => {
    const half = stock(FRESH_STAND, 'cabbage', one.shelf / 2, 0)
    if (!half) throw new Error('stocked')
    expect(ratePerHour(half)).toBeCloseTo(one.rate / 2)
    expect(accruedAt(half, 2 * HOUR)).toBeCloseTo(one.rate)
    expect(ratePerHour(full())).toBe(one.rate)
    expect(accruedAt(full(), 3 * HOUR)).toBeCloseTo(3 * one.rate)
  })

  it('banks on the clock until its cap, then stops', () => {
    const cap = capOf(full())
    expect(cap).toBe(one.rate * one.capHours)
    expect(accruedAt(full(), one.capHours * HOUR)).toBeCloseTo(cap)
    expect(accruedAt(full(), 100 * one.capHours * HOUR)).toBe(cap)
    expect(fullAt(full(), 0)).toBe(one.capHours * HOUR)
    expect(fullAt(full(), 1000 * HOUR)).toBe(1000 * HOUR)
    // A clock behind the ledger earns nothing, never less.
    expect(accruedAt({ ...full(), since: 5 * HOUR }, 0)).toBe(0)
  })

  it('banks what it earned before a change, then earns at the new rate', () => {
    const half = stock(FRESH_STAND, 'cabbage', one.shelf / 2, 0)
    if (!half) throw new Error('stocked')
    const later = stock(half, 'cabbage', one.shelf / 2, 2 * HOUR)
    if (!later) throw new Error('stocked')
    expect(later.since).toBe(2 * HOUR)
    expect(later.banked).toBeCloseTo(one.rate)
    expect(accruedAt(later, 3 * HOUR)).toBeCloseTo(2 * one.rate)
    expect(settle(later, 3 * HOUR).banked).toBeCloseTo(2 * one.rate)
  })

  it('collects the whole cents and keeps the fraction', () => {
    const after = 90 * 60 * 1000 + 1000
    const got = collect(full(), after)
    expect(got?.cents).toBe(collectable(full(), after))
    expect(got?.cents).toBe(Math.floor((one.rate * after) / HOUR))
    expect(got?.ledger.banked).toBeGreaterThanOrEqual(0)
    expect(got?.ledger.banked).toBeLessThan(1)
    expect(got?.ledger.since).toBe(after)
    // Collected, it starts again from nothing.
    expect(got && collect(got.ledger, after)).toBeNull()
  })

  it('levels up for its price, banking first, until the top', () => {
    expect(upgradePrice(FRESH_STAND)).toEqual(two.price)
    const price = two.price
    if (!price) throw new Error('priced')
    expect(affordsUpgrade(FRESH_STAND, price.cash, price.items)).toBe(true)
    expect(affordsUpgrade(FRESH_STAND, price.cash - 1, price.items)).toBe(false)
    expect(affordsUpgrade(FRESH_STAND, price.cash, {})).toBe(false)
    const up = upgrade(full(), HOUR)
    expect(up?.level).toBe(2)
    expect(up?.banked).toBeCloseTo(one.rate)
    expect(up && levelOf(up)).toBe(two)
    expect(up && shelfRoom(up)).toBe(two.shelf - one.shelf)
    const top = { ...FRESH_STAND, level: topLevel() }
    expect(upgradePrice(top)).toBeNull()
    expect(upgrade(top, 0)).toBeNull()
    expect(affordsUpgrade(top, 1e9, { cabbage: 1e9, berries: 1e9 })).toBe(false)
    // A level out of range reads as the nearest there is.
    expect(levelOf({ ...FRESH_STAND, level: 99 }).shelf).toBe(
      CONFIG.stand.levels[topLevel() - 1].shelf
    )
  })

  it('is tended only close to where it stands', () => {
    const at = { x: 10, z: 10 }
    expect(atStand({ x: 12, z: 11 }, at)).toBe(true)
    expect(atStand({ x: 10 + CONFIG.stand.tendReach + 0.1, z: 10 }, at)).toBe(
      false
    )
    expect(atStand(null, at)).toBe(false)
    expect(atStand(at, null)).toBe(false)
  })

  it('checks a ledger from storage or the wire', () => {
    expect(isStandLedger(FRESH_STAND)).toBe(true)
    expect(isStandLedger(full())).toBe(true)
    expect(isStandLedger(null)).toBe(false)
    expect(isStandLedger({ ...FRESH_STAND, level: 0 })).toBe(false)
    expect(isStandLedger({ ...FRESH_STAND, level: 1.5 })).toBe(false)
    expect(isStandLedger({ ...FRESH_STAND, level: topLevel() + 1 })).toBe(false)
    expect(isStandLedger({ ...FRESH_STAND, banked: -1 })).toBe(false)
    expect(isStandLedger({ ...FRESH_STAND, banked: Infinity })).toBe(false)
    expect(isStandLedger({ ...FRESH_STAND, since: 'now' })).toBe(false)
    expect(isStandLedger({ ...FRESH_STAND, stock: [] })).toBe(false)
    expect(isStandLedger({ ...FRESH_STAND, stock: { joints: 1 } })).toBe(false)
    expect(isStandLedger({ ...FRESH_STAND, stock: { cabbage: -1 } })).toBe(
      false
    )
  })
})

describe('the stand refused', () => {
  it('says why in a line of its own for each reason', () => {
    const reasons = [
      'no-stand',
      'short',
      'none-left',
      'no-room',
      'empty',
      'top',
      'not-in-valley',
      'too-fast',
    ]
    const lines = reasons.map(refusalLine)
    expect(new Set(lines).size).toBe(reasons.length)
    expect(refusalLine('aboard')).toBe(refusalLine('no-stand'))
    expect(refusalLine('not-in-valley')).toBe(copy('log.stand_offline'))
  })
})

describe('the stand’s XP', () => {
  it('earns once a whole xpCents paid out, the rest earning none', () => {
    const step = CONFIG.stand.xpCents
    expect(standXp(0)).toBe(0)
    expect(standXp(step - 1)).toBe(0)
    expect(standXp(step)).toBe(1)
    expect(standXp(10 * step + step - 1)).toBe(10)
    // Many small collects never earn more than one big one.
    expect(4 * standXp(step - 1)).toBeLessThanOrEqual(standXp(4 * (step - 1)))
  })
})
