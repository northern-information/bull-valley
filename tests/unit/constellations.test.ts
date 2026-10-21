import { describe, expect, it } from 'vitest'
import { CONFIG } from '../../src/config.ts'
import {
  chanceOf,
  constellationOf,
  constellationsAt,
  lanePresence,
  starField,
  STARS,
} from '../../src/constellations.ts'
import type { Star } from '../../src/constellations.ts'

const C = CONFIG.psych.constellations

const angle = (a: Star, b: Star): number =>
  Math.acos(Math.min(1, a.x * b.x + a.y * b.y + a.z * b.z))

describe('the stars', () => {
  it('are 700 unit directions over the sky, never under the horizon', () => {
    expect(STARS).toHaveLength(700)
    for (const s of STARS) {
      expect(Math.hypot(s.x, s.y, s.z)).toBeCloseTo(1)
      expect(s.y).toBeGreaterThanOrEqual(0.05)
    }
  })

  it('are the same sky every time', () => {
    expect(starField(700, 0x57a25)).toEqual(STARS)
    expect(starField(5, 1)).not.toEqual(starField(5, 2))
  })
})

describe('a constellation', () => {
  it('joins a few stars near each other with a tree of lines, and maybe a loop', () => {
    let loops = 0
    for (let turn = 0; turn < 60; turn++) {
      for (let lane = 0; lane < C.lanes; lane++) {
        const shape = constellationOf(STARS, lane, turn)
        expect(shape).not.toBeNull()
        if (!shape) continue
        const { stars, edges } = shape
        expect(new Set(stars).size).toBe(stars.length)
        expect(stars.length).toBeGreaterThanOrEqual(C.starsMin)
        expect(stars.length).toBeLessThanOrEqual(C.starsMax)
        // The first stands high enough; the rest are within reach of it.
        const [anchor, ...rest] = stars
        expect(STARS[anchor].y).toBeGreaterThanOrEqual(C.lowest)
        for (const i of rest) {
          expect(angle(STARS[i], STARS[anchor])).toBeLessThanOrEqual(
            C.reach + 1e-9
          )
        }
        // Every line joins two of its stars, and every star is joined.
        expect(edges.length).toBeGreaterThanOrEqual(stars.length - 1)
        expect(edges.length).toBeLessThanOrEqual(stars.length)
        if (edges.length === stars.length) loops++
        const joined = new Set(edges.flat())
        expect([...joined].sort()).toEqual([...stars].sort())
        // All in one piece.
        const reached = new Set([anchor])
        for (let pass = 0; pass < stars.length; pass++) {
          for (const [a, b] of edges) {
            if (reached.has(a) || reached.has(b)) {
              reached.add(a)
              reached.add(b)
            }
          }
        }
        expect(reached.size).toBe(stars.length)
        // No line drawn twice.
        const keys = edges.map(([a, b]) => [a, b].sort().join('-'))
        expect(new Set(keys).size).toBe(keys.length)
      }
    }
    expect(loops).toBeGreaterThan(0)
  })

  it('is seeded by its lane and turn', () => {
    expect(constellationOf(STARS, 1, 7)).toEqual(constellationOf(STARS, 1, 7))
    expect(constellationOf(STARS, 1, 7)).not.toEqual(
      constellationOf(STARS, 1, 8)
    )
    expect(constellationOf(STARS, 1, 7)).not.toEqual(
      constellationOf(STARS, 2, 7)
    )
  })

  it('draws nothing from a sky with nothing high or nothing near', () => {
    expect(constellationOf([], 0, 0)).toBeNull()
    const low: Star[] = [{ x: 1, y: 0, z: 0 }]
    expect(constellationOf(low, 0, 0)).toBeNull()
    const lone: Star[] = [
      { x: 0, y: 1, z: 0 },
      { x: 1, y: 0, z: 0 },
    ]
    expect(constellationOf(lone, 0, 0)).toBeNull()
  })

  it('joins two near stars with one line', () => {
    const pair: Star[] = [
      { x: 0, y: 1, z: 0 },
      { x: Math.sin(0.1), y: Math.cos(0.1), z: 0 },
    ]
    for (let turn = 0; turn < 5; turn++) {
      const shape = constellationOf(pair, 0, turn)
      expect(shape?.edges).toHaveLength(1)
    }
  })
})

describe('the constellations a trip shows', () => {
  const span = (level: number) =>
    Array.from({ length: 2000 }, (_, i) => constellationsAt(level, i * 0.5))

  it('shows none sober', () => {
    expect(span(0).every((s) => s.length === 0)).toBe(true)
  })

  it('lets one more lane show for every 1 / lanes of the level', () => {
    expect(lanePresence(0, 0)).toBe(0)
    expect(lanePresence(0, 1)).toBe(1)
    expect(lanePresence(C.lanes - 1, 1)).toBe(1)
    expect(lanePresence(1, 1 / C.lanes)).toBe(0)
    expect(lanePresence(1, 1.5 / C.lanes)).toBeCloseTo(0.5)
  })

  it('draws more often the further the trip', () => {
    expect(chanceOf(0)).toBe(C.chanceMin)
    expect(chanceOf(1)).toBe(C.chanceMax)
    expect(chanceOf(0.5)).toBeGreaterThan(C.chanceMin)
    const count = (level: number) =>
      span(level).reduce((n, shown) => n + shown.length, 0)
    const light = count(0.2)
    const full = count(1)
    expect(light).toBeGreaterThan(0)
    expect(full).toBeGreaterThan(light * 3)
    // At a full trip, more than one at once sometimes.
    expect(span(1).some((shown) => shown.length > 1)).toBe(true)
    // At a light trip, only the first lane.
    expect(span(0.15).every((shown) => shown.every((s) => s.lane === 0))).toBe(
      true
    )
  })

  it('fades each in, holds it and fades it out within its showing', () => {
    let held = false
    for (const shown of span(1)) {
      for (const s of shown) {
        expect(s.opacity).toBeGreaterThan(0)
        expect(s.opacity).toBeLessThanOrEqual(1)
        if (s.opacity === 1) held = true
      }
    }
    expect(held).toBe(true)
    // Just into a lane's turn it is faint; mid-turn, full; past its
    // showing, gone.
    const turnOf = (t: number) =>
      constellationsAt(1, t).find((s) => s.lane === 0)
    const drawn = Array.from({ length: 50 }, (_, k) => k).find(
      (k) => turnOf(k * C.periodSeconds + C.showSeconds / 2) !== undefined
    )
    expect(drawn).toBeDefined()
    const at = (drawn ?? 0) * C.periodSeconds
    expect(turnOf(at + 0.1)?.opacity ?? 0).toBeLessThan(0.5)
    expect(turnOf(at + C.showSeconds / 2)?.opacity).toBe(1)
    expect(turnOf(at + C.showSeconds + 0.1)).toBeUndefined()
    expect(turnOf(at + C.showSeconds / 2)?.turn).toBe(drawn)
  })
})
