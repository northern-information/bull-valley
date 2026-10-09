import { describe, expect, it } from 'vitest'
import { CONFIG } from '../../src/config.ts'
import {
  barOf,
  levelOf,
  levelUp,
  totals,
  XP,
  xpToReach,
} from '../../src/progression.ts'

const CFG = CONFIG.progression

describe('the XP curve', () => {
  it('starts every raider at level 1 with no XP', () => {
    expect(xpToReach(1)).toBe(0)
    expect(xpToReach(0)).toBe(0)
    expect(levelOf(0)).toBe(1)
  })

  it('asks a little more for each level than the last', () => {
    let step = 0
    for (let level = 2; level <= CFG.maxLevel; level++) {
      const next = xpToReach(level) - xpToReach(level - 1)
      expect(next).toBeGreaterThanOrEqual(step)
      step = next
    }
  })

  it('reads a level off the XP in all, at each threshold exactly', () => {
    for (const level of [2, 5, 10, 15, 42]) {
      expect(levelOf(xpToReach(level))).toBe(level)
      expect(levelOf(xpToReach(level) - 1)).toBe(level - 1)
    }
  })

  it('never goes past the highest level', () => {
    expect(levelOf(Number.MAX_SAFE_INTEGER)).toBe(CFG.maxLevel)
    expect(levelOf(10_000, { base: 1, power: 1, maxLevel: 5 })).toBe(5)
  })

  it('makes level 5 a few evenings of burning, not one', () => {
    const burns = xpToReach(5) / XP.burn
    expect(burns).toBeGreaterThan(40)
    expect(burns).toBeLessThan(200)
  })
})

describe('the bar', () => {
  it('fills from the level’s start toward the next', () => {
    const start = xpToReach(3)
    const span = xpToReach(4) - start
    expect(barOf(start + 7)).toEqual({ level: 3, into: 7, span })
    expect(barOf(0)).toEqual({ level: 1, into: 0, span: xpToReach(2) })
  })

  it('is full at the highest level', () => {
    expect(barOf(xpToReach(CFG.maxLevel) + 5)).toEqual({
      level: CFG.maxLevel,
      into: 5,
      span: null,
    })
  })
})

describe('the grants', () => {
  it('makes unmaking the Caretaker the big jump', () => {
    const others = Object.entries(XP).filter(([source]) => source !== 'unmake')
    for (const [, xp] of others) {
      expect(XP.unmake).toBeGreaterThanOrEqual(xp * 10)
      expect(xp).toBeGreaterThan(0)
    }
    expect(XP.spider).toBeGreaterThan(XP.burn)
  })

  it('sums each account’s grants, in the order they first earned', () => {
    const sums = totals([
      { account: 'b', source: 'burn' },
      { account: 'a', source: 'berry' },
      { account: 'b', source: 'ride' },
    ])
    expect([...sums]).toEqual([
      ['b', XP.burn + XP.ride],
      ['a', XP.berry],
    ])
    expect(totals([]).size).toBe(0)
    // A grant of several times its source's XP, as the stand's is.
    expect(totals([{ account: 'a', source: 'stand', times: 7 }])).toEqual(
      new Map([['a', 7 * XP.stand]])
    )
  })

  it('says the level reached only when XP crosses into one', () => {
    const two = xpToReach(2)
    expect(levelUp(two - 1, two)).toBe(2)
    expect(levelUp(0, xpToReach(4))).toBe(4)
    expect(levelUp(two, two + 1)).toBeNull()
    expect(levelUp(0, 0)).toBeNull()
  })
})
