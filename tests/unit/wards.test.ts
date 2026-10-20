import { describe, expect, it } from 'vitest'
import { CONFIG } from '../../src/config.ts'
import { AXES } from '../../src/wardlevels.ts'
import {
  damageOf,
  isShadowHit,
  SHADOW_HITS,
  tetraCorners,
  tetraView,
  WARD_OF,
  wardedBy,
  wardOf,
  wardOfEntry,
} from '../../src/wards.ts'

const SOBER = { high: 0, stimulated: 0, drunk: 0, tripping: 0 }
const full = (axis: keyof typeof SOBER) => ({ ...SOBER, [axis]: 1 })

describe('wards', () => {
  it('sets each shadow against its own ward', () => {
    expect(WARD_OF).toEqual({
      man: 'high',
      spider: 'stimulated',
      spiderling: 'stimulated',
      caretaker: 'drunk',
      shade: 'tripping',
      warden: 'tripping',
    })
    expect(wardedBy('stimulated')).toEqual(['spiderling', 'spider'])
    expect(wardedBy('tripping')).toEqual(['shade', 'warden'])
    for (const axis of AXES) expect(wardedBy(axis).length).toBeGreaterThan(0)
  })

  it("names the ward on each shadow's page of the Book of Shadows", () => {
    expect(wardOfEntry('shadowman')).toBe('high')
    expect(wardOfEntry('spiderling')).toBe('stimulated')
    expect(wardOfEntry('caretaker')).toBe('drunk')
    expect(wardOfEntry('tunnel-shade')).toBe('tripping')
    expect(wardOfEntry('warden')).toBe('tripping')
    expect(wardOfEntry('citgo')).toBeNull()
    expect(wardOfEntry('toString')).toBeNull()
  })

  it('takes nothing off sober', () => {
    for (const by of SHADOW_HITS) expect(wardOf(SOBER, by)).toBe(0)
  })

  it('cuts most with the matching corner, a little with any other', () => {
    expect(wardOf(full('high'), 'man')).toBeCloseTo(CONFIG.wards.matching)
    expect(wardOf(full('high'), 'spider')).toBeCloseTo(CONFIG.wards.other)
    expect(wardOf({ ...SOBER, drunk: 0.5 }, 'caretaker')).toBeCloseTo(0.3)
    // Only the strongest other counts.
    expect(
      wardOf({ ...SOBER, high: 0.5, drunk: 1, stimulated: 1 }, 'shade')
    ).toBeCloseTo(CONFIG.wards.other)
  })

  it('never cuts past the cap', () => {
    const all = { high: 1, stimulated: 1, drunk: 1, tripping: 1 }
    for (const by of SHADOW_HITS) {
      expect(wardOf(all, by)).toBeCloseTo(0.7)
      expect(wardOf(all, by)).toBeLessThanOrEqual(CONFIG.wards.cap)
    }
    const steep = { ...CONFIG.wards, matching: 0.9, other: 0.5 }
    expect(wardOf(all, 'man', steep)).toBe(steep.cap)
    // Levels out of range read as held between 0 and 1.
    expect(wardOf({ ...SOBER, high: 7 }, 'man')).toBeCloseTo(0.6)
    expect(wardOf({ ...SOBER, high: -1 }, 'man')).toBe(0)
  })
})

describe('damageOf', () => {
  it('hits each shadow for its own, square in the middle', () => {
    expect(SHADOW_HITS.map((by) => damageOf(by, SOBER).damage)).toEqual([
      140, 320, 480, 420, 750, 1100,
    ])
    for (const by of SHADOW_HITS) {
      expect(damageOf(by, SOBER)).toEqual({
        damage: CONFIG.damage[by],
        warded: 0,
      })
    }
  })

  it('spreads either way on the roll', () => {
    expect(damageOf('man', SOBER, 0).damage).toBe(288)
    expect(damageOf('man', SOBER, 1).damage).toBe(352)
    expect(damageOf('man', SOBER, 5).damage).toBe(352)
    expect(damageOf('man', SOBER, NaN).damage).toBe(320)
  })

  it('says what the wards took off it', () => {
    expect(damageOf('man', full('high'))).toEqual({ damage: 128, warded: 192 })
    expect(damageOf('spider', full('stimulated'))).toEqual({
      damage: 192,
      warded: 288,
    })
    expect(damageOf('caretaker', full('drunk'))).toEqual({
      damage: 300,
      warded: 450,
    })
    expect(damageOf('warden', full('tripping'))).toEqual({
      damage: 440,
      warded: 660,
    })
    // The wrong ward helps only a little.
    expect(damageOf('warden', full('drunk'))).toEqual({
      damage: 990,
      warded: 110,
    })
  })

  it('reads a shadow off the wire', () => {
    for (const by of SHADOW_HITS) expect(isShadowHit(by)).toBe(true)
    expect(isShadowHit('tunnel')).toBe(false)
    expect(isShadowHit(undefined)).toBe(false)
  })
})

describe('the tetrahedron', () => {
  it('keeps high on top, turning the rest round it', () => {
    for (const turn of [0, 1, 2.5, 4]) {
      const corners = tetraCorners(turn)
      const high = corners.find((c) => c.axis === 'high')!
      for (const c of corners) {
        expect(c.x).toBeGreaterThanOrEqual(0)
        expect(c.x).toBeLessThanOrEqual(100)
        expect(c.y).toBeGreaterThanOrEqual(0)
        expect(c.y).toBeLessThanOrEqual(100)
        expect(Number.isInteger(c.x) && Number.isInteger(c.y)).toBe(true)
        if (c !== high) expect(c.y).toBeGreaterThan(high.y)
      }
    }
    expect(tetraCorners(0)).not.toEqual(tetraCorners(1))
  })

  it('draws six edges, the front ones whole, round a three- or four-sided outline', () => {
    for (let turn = 0; turn < 6.3; turn += 0.37) {
      const view = tetraView(turn)
      expect(view.edges).toHaveLength(6)
      const front = view.edges.filter((e) => e.front).length
      // One face toward the viewer shows three edges, two show five.
      expect(front === 3 || front === 5 || front === 6).toBe(true)
      expect(view.hull.length === 3 || view.hull.length === 4).toBe(true)
    }
  })
})
