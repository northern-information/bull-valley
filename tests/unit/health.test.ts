import { describe, expect, it } from 'vitest'
import { CONFIG } from '../../src/config.ts'
import {
  healthOf,
  hit,
  isHealth,
  isWhole,
  MAX_HEALTH,
  mend,
  rescaled,
  shakeAt,
  withHealth,
} from '../../src/health.ts'

const TOUCH = CONFIG.health.touch

describe('health', () => {
  it('is CONFIG.health.max points whole', () => {
    expect(MAX_HEALTH).toBe(CONFIG.health.max)
    expect(isWhole(MAX_HEALTH)).toBe(true)
    expect(isWhole(MAX_HEALTH - 1)).toBe(false)
  })

  it('is three blocks of a hundred, a block a touch', () => {
    expect(MAX_HEALTH).toBe(300)
    expect(CONFIG.health.block).toBe(100)
    expect(TOUCH).toBe(CONFIG.health.block)
  })

  it('takes a touch of hit points, the last one fatal', () => {
    expect(hit(300)).toEqual({ points: 200, fatal: false })
    expect(hit(200)).toEqual({ points: 100, fatal: false })
    expect(hit(100)).toEqual({ points: 0, fatal: true })
    // Whatever a touch takes, and only what it takes.
    expect(hit(300, 40)).toEqual({ points: 260, fatal: false })
    expect(hit(30, 40)).toEqual({ points: 0, fatal: true })
    expect(hit(300, -5)).toEqual({ points: 300, fatal: false })
    // Never below nothing, nor from past whole.
    expect(hit(0)).toEqual({ points: 0, fatal: true })
    expect(hit(MAX_HEALTH + 5)).toEqual({
      points: MAX_HEALTH - TOUCH,
      fatal: MAX_HEALTH <= TOUCH,
    })
  })

  it('gives points back, never past whole', () => {
    expect(mend(100, 100)).toBe(200)
    expect(mend(200, 500)).toBe(MAX_HEALTH)
    expect(mend(200, -1)).toBe(200)
  })

  it('rescales a record kept against another max to the same share', () => {
    expect(rescaled({ a: 1, b: 2 }, 3)).toEqual({ a: 100, b: 200 })
    expect(rescaled({ a: 120 }, MAX_HEALTH)).toEqual({ a: 120 })
    // Never rounded down to nothing, nor kept when it comes to whole.
    expect(rescaled({ a: 1 }, 10_000)).toEqual({ a: 1 })
    expect(rescaled({ a: 2.999 }, 3)).toEqual({})
    expect(rescaled({ a: 1 }, 0)).toEqual({ a: 1 })
  })

  it('writes down no account at NaN or Infinity', () => {
    expect(withHealth({}, 'a', NaN)).toEqual({})
    expect(withHealth({ a: 1 }, 'a', Infinity)).toEqual({})
    expect(withHealth({}, 'a', 1)).toEqual({ a: 1 })
  })

  it('keeps only the accounts below whole', () => {
    expect(healthOf({}, 'a')).toBe(MAX_HEALTH)
    const one = withHealth({}, 'a', 1)
    expect(one).toEqual({ a: 1 })
    expect(healthOf(one, 'a')).toBe(1)
    expect(withHealth(one, 'a', MAX_HEALTH)).toEqual({})
    // Shattered is whole again.
    expect(withHealth(one, 'a', 0)).toEqual({})
  })

  it('reads a health off the wire', () => {
    expect(isHealth(0)).toBe(true)
    expect(isHealth(MAX_HEALTH)).toBe(true)
    expect(isHealth(MAX_HEALTH + 1)).toBe(false)
    expect(isHealth(1.5)).toBe(false)
    expect(isHealth(-1)).toBe(false)
    expect(isHealth('2')).toBe(false)
  })
})

describe('shakeAt', () => {
  const cfg = { ...CONFIG.health, shakeSeconds: 0.5, shakeMetres: 0.1 }

  it('shakes hardest at the touch, and eases to nothing', () => {
    expect(shakeAt(0, cfg)).toBeCloseTo(0.1, 9)
    expect(shakeAt(0.25, cfg)).toBeCloseTo(0.025, 9)
    expect(shakeAt(0.5, cfg)).toBe(0)
    expect(shakeAt(3, cfg)).toBe(0)
  })

  it('never shakes before a touch, or with none', () => {
    expect(shakeAt(-1, cfg)).toBe(0)
    expect(shakeAt(-Infinity, cfg)).toBe(0)
    expect(shakeAt(Infinity, cfg)).toBe(0)
    expect(shakeAt(NaN, cfg)).toBe(0)
  })
})
