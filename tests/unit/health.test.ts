import { describe, expect, it } from 'vitest'
import { CONFIG } from '../../src/config.ts'
import {
  healthOf,
  hit,
  isHealth,
  isWhole,
  MAX_HEALTH,
  mend,
  shakeAt,
  withHealth,
} from '../../src/health.ts'

describe('health', () => {
  it('is CONFIG.health.max points whole', () => {
    expect(MAX_HEALTH).toBe(CONFIG.health.max)
    expect(isWhole(MAX_HEALTH)).toBe(true)
    expect(isWhole(MAX_HEALTH - 1)).toBe(false)
  })

  it('takes a point a touch, the last one fatal', () => {
    expect(hit(3)).toEqual({ points: 2, fatal: false })
    expect(hit(2)).toEqual({ points: 1, fatal: false })
    expect(hit(1)).toEqual({ points: 0, fatal: true })
    // Never below nothing, nor from past whole.
    expect(hit(0)).toEqual({ points: 0, fatal: true })
    expect(hit(MAX_HEALTH + 5)).toEqual({
      points: MAX_HEALTH - 1,
      fatal: MAX_HEALTH === 1,
    })
  })

  it('gives points back, never past whole', () => {
    expect(mend(1, 1)).toBe(2)
    expect(mend(2, 5)).toBe(MAX_HEALTH)
    expect(mend(2, -1)).toBe(2)
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
