import { describe, expect, it } from 'vitest'
import { CONFIG } from '../../src/config.ts'
import {
  BASE_GEOMETRIE,
  hit,
  isHealth,
  maxGeometrie,
  mend,
  pointsOf,
  shakeAt,
  withWounds,
  woundsFromHealth,
  woundsOf,
} from '../../src/health.ts'

describe('geometrie whole', () => {
  it('is a thousand at level 1, forty more a level, in tens', () => {
    expect(BASE_GEOMETRIE).toBe(1000)
    expect(maxGeometrie(1)).toBe(CONFIG.health.base)
    expect(maxGeometrie(10)).toBe(1360)
    expect(maxGeometrie(25)).toBe(1960)
    expect(maxGeometrie(50)).toBe(2960)
    expect(maxGeometrie(99)).toBe(4920)
    for (let level = 1; level < 99; level++) {
      expect(maxGeometrie(level + 1)).toBeGreaterThan(maxGeometrie(level))
      expect(maxGeometrie(level) % CONFIG.health.round).toBe(0)
    }
  })

  it('reads no level, or a broken one, as level 1', () => {
    expect(maxGeometrie()).toBe(BASE_GEOMETRIE)
    expect(maxGeometrie(0)).toBe(BASE_GEOMETRIE)
    expect(maxGeometrie(-4)).toBe(BASE_GEOMETRIE)
    expect(maxGeometrie(NaN)).toBe(BASE_GEOMETRIE)
    expect(maxGeometrie(2.9)).toBe(maxGeometrie(2))
  })
})

describe('health', () => {
  it('takes what a touch takes, the last of it fatal', () => {
    expect(hit(1000, 320)).toEqual({ points: 680, fatal: false })
    expect(hit(320, 320)).toEqual({ points: 0, fatal: true })
    expect(hit(100, 320)).toEqual({ points: 0, fatal: true })
    expect(hit(1000, -5)).toEqual({ points: 1000, fatal: false })
    // Never from past whole.
    expect(hit(5000, 320, 1360)).toEqual({ points: 1040, fatal: false })
  })

  it('gives points back, never past whole', () => {
    expect(mend(100, 150)).toBe(250)
    expect(mend(900, 500)).toBe(1000)
    expect(mend(900, 500, 1360)).toBe(1360)
    expect(mend(200, -1)).toBe(200)
  })

  it('keeps only the wounded, as what they lost', () => {
    expect(woundsOf({}, 'a')).toBe(0)
    const one = withWounds({}, 'a', 320)
    expect(one).toEqual({ a: 320 })
    expect(woundsOf(one, 'a')).toBe(320)
    expect(withWounds(one, 'a', 0)).toEqual({})
    expect(withWounds(one, 'a', -3)).toEqual({})
    expect(withWounds({}, 'a', NaN)).toEqual({})
    expect(withWounds({}, 'a', Infinity)).toEqual({})
    expect(pointsOf(320, 1000)).toBe(680)
    // A new level's larger whole tops the raider up by the difference.
    expect(pointsOf(320, 1360)).toBe(1040)
    expect(pointsOf(5000, 1000)).toBe(0)
  })

  it("reads an older valley's hit points as wounds at the same share", () => {
    expect(woundsFromHealth({ a: 100, b: 200 }, 300)).toEqual({
      a: 667,
      b: 333,
    })
    expect(woundsFromHealth({ a: 1, b: 2 }, 3)).toEqual({ a: 667, b: 333 })
    // Never at nothing, and whole is no wound.
    expect(woundsFromHealth({ a: 0 }, 300)).toEqual({ a: 999 })
    expect(woundsFromHealth({ a: 300 }, 300)).toEqual({})
    expect(woundsFromHealth({ a: 1 }, 0)).toEqual({})
    expect(woundsFromHealth({ a: NaN }, 300)).toEqual({})
  })

  it('reads a geometrie off the wire', () => {
    expect(isHealth(0)).toBe(true)
    expect(isHealth(maxGeometrie(1000))).toBe(true)
    expect(isHealth(Number.MAX_SAFE_INTEGER + 1)).toBe(false)
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
