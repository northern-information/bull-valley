import { describe, expect, it } from 'vitest'
import { CONFIG } from '../../src/config.ts'
import {
  airborne,
  FALL_MAX,
  fallDamage,
  hurts,
  isFallHeight,
  jumpSpeed,
  mayJump,
} from '../../src/fall.ts'

const { safe, lethal, step } = CONFIG.fall

describe('fall', () => {
  it('leaves the ground only where it drops away past a step', () => {
    expect(airborne(10, 10 - step / 2)).toBe(false)
    expect(airborne(10, 10 - step * 2)).toBe(true)
    expect(airborne(10, 12)).toBe(false)
  })

  it('takes nothing short of a story', () => {
    expect(fallDamage(safe - 0.1, 1000)).toBe(0)
    expect(fallDamage(Number.NaN, 1000)).toBe(0)
    expect(hurts(safe - 0.1)).toBe(false)
    expect(hurts(safe)).toBe(true)
  })

  it('scales to all of it at two stories, and past', () => {
    expect(fallDamage(safe, 1000)).toBe(0)
    expect(fallDamage((safe + lethal) / 2, 1000)).toBe(500)
    expect(fallDamage(lethal, 1000)).toBe(1000)
    expect(fallDamage(40, 4920)).toBe(4920)
  })

  it('believes only a sensible height off the wire', () => {
    expect(isFallHeight(30)).toBe(true)
    expect(isFallHeight(0)).toBe(false)
    expect(isFallHeight(FALL_MAX + 1)).toBe(false)
    expect(isFallHeight('30')).toBe(false)
    expect(isFallHeight(Number.POSITIVE_INFINITY)).toBe(false)
  })
})

describe('a jump', () => {
  it('leaves the ground fast enough to rise its height, and no higher', () => {
    const v = jumpSpeed(0.5, CONFIG.fall)
    // v² = 2gh: at the top it has risen just the height.
    expect((v * v) / (2 * CONFIG.fall.gravity)).toBeCloseTo(0.5)
    expect(jumpSpeed(0, CONFIG.fall)).toBe(0)
    // Never so high it reads as a fall onto the same ground.
    expect(CONFIG.player.jumpHeight).toBeLessThan(CONFIG.fall.safe)
  })

  it('goes only from the ground, standing, and out of an emote', () => {
    const still = { falling: false, crouching: false, emoting: false }
    expect(mayJump(still)).toBe(true)
    expect(mayJump({ ...still, falling: true })).toBe(false)
    expect(mayJump({ ...still, crouching: true })).toBe(false)
    expect(mayJump({ ...still, emoting: true })).toBe(false)
  })
})
