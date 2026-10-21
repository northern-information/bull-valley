import { describe, expect, it } from 'vitest'
import { CONFIG } from '../../src/config.ts'
import { PSYCH_FUCHSIA } from '../../src/fuchsia.ts'
import {
  fadeOf,
  presenceOf,
  SOLID_KINDS,
  solidAt,
  solidsAt,
} from '../../src/tripsolids.ts'

const C = CONFIG.psych.solids

// Seconds 0..span in steps, for looking over a stretch of a trip.
const moments = (span: number, step = 0.25): number[] =>
  Array.from({ length: Math.floor(span / step) }, (_, i) => i * step)

describe('psychedelic fuchsia', () => {
  it('is one hex colour', () => {
    expect(PSYCH_FUCHSIA).toMatch(/^#[0-9a-f]{6}$/)
  })
})

describe('the trip solids', () => {
  it('are the five platonic solids, each index always the same one', () => {
    expect(new Set(SOLID_KINDS).size).toBe(5)
    for (let i = 0; i < C.max; i++) {
      expect(solidAt(i, 1, 0).kind).toBe(SOLID_KINDS[i % 5])
      expect(solidAt(i, 0.3, 500).kind).toBe(SOLID_KINDS[i % 5])
    }
  })

  it('shows none sober', () => {
    for (const t of moments(60, 1)) {
      expect(solidsAt(0, t).every((s) => s.opacity === 0)).toBe(true)
    }
  })

  it('always gives one to each index, in order', () => {
    const all = solidsAt(1, 12.5)
    expect(all).toHaveLength(C.max)
    expect(all.map((s) => s.kind)).toEqual(
      Array.from({ length: C.max }, (_, i) => SOLID_KINDS[i % 5])
    )
  })

  it('lets one more show for every 1 / max of the level', () => {
    expect(presenceOf(0, 0)).toBe(0)
    expect(presenceOf(0, 1)).toBe(1)
    expect(presenceOf(C.max - 1, 1)).toBe(1)
    expect(presenceOf(1, 1 / C.max)).toBe(0)
    expect(presenceOf(0, 1 / C.max)).toBeCloseTo(1)
    expect(presenceOf(2, 2.5 / C.max)).toBeCloseTo(0.5)
    // Past the ends, held.
    expect(presenceOf(0, 2)).toBe(1)
    expect(presenceOf(0, -1)).toBe(0)
  })

  it('fades in and out at the ends of a showing, none outside it', () => {
    expect(fadeOf(-0.1, 10, 1)).toBe(0)
    expect(fadeOf(10.1, 10, 1)).toBe(0)
    expect(fadeOf(0, 10, 1)).toBe(0)
    expect(fadeOf(0.5, 10, 1)).toBeCloseTo(0.5)
    expect(fadeOf(5, 10, 1)).toBe(1)
    expect(fadeOf(9.5, 10, 1)).toBeCloseTo(0.5)
  })

  it('shows more of them the further the trip', () => {
    const shownAt = (level: number) =>
      moments(120, 0.5).reduce(
        (n, t) => n + solidsAt(level, t).filter((s) => s.opacity > 0).length,
        0
      )
    const light = shownAt(0.25)
    const full = shownAt(1)
    expect(light).toBeGreaterThan(0)
    expect(full).toBeGreaterThan(light * 2)
  })

  it('comes and goes on its own: each one rests some of the time', () => {
    for (let i = 0; i < C.max; i++) {
      const seen = moments(200, 0.5).map((t) => solidAt(i, 1, t).opacity > 0)
      expect(seen).toContain(true)
      expect(seen).toContain(false)
    }
  })

  it('floats a few metres off the eye, never past its faces', () => {
    for (const t of moments(120, 0.5)) {
      for (const s of solidsAt(1, t)) {
        const out = Math.hypot(s.x, s.z)
        expect(out).toBeGreaterThanOrEqual(C.radiusMin - 0.31)
        expect(out).toBeLessThanOrEqual(C.radiusMax + 0.31)
        expect(s.y).toBeGreaterThanOrEqual(C.low - 0.26)
        expect(s.y).toBeLessThanOrEqual(C.high + 0.26)
        expect(s.size).toBeGreaterThanOrEqual(C.sizeMin)
        expect(s.size).toBeLessThanOrEqual(C.sizeMax)
        expect(s.opacity).toBeGreaterThanOrEqual(0)
        expect(s.opacity).toBeLessThanOrEqual(C.opacity)
      }
    }
  })

  it('drifts and tumbles smoothly while it shows', () => {
    const dt = 1 / 60
    let checked = 0
    for (const t of moments(60, 0.5)) {
      for (let i = 0; i < C.max; i++) {
        const a = solidAt(i, 1, t)
        const b = solidAt(i, 1, t + dt)
        if (a.opacity <= 0 || b.opacity <= 0) continue
        checked++
        const moved = Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z)
        expect(moved).toBeLessThan(0.1)
        expect(Math.abs(b.rx - a.rx)).toBeLessThanOrEqual(C.tumble * dt + 1e-9)
        expect(a.size).toBe(b.size)
      }
    }
    expect(checked).toBeGreaterThan(0)
  })

  it('is the same at the same moment, every time', () => {
    expect(solidsAt(0.7, 42.25)).toEqual(solidsAt(0.7, 42.25))
  })
})
