import { describe, expect, it } from 'vitest'
import { bobAt, castleOf, lighthouseAngle, seedOf } from '../../src/castle.ts'
import { CONFIG } from '../../src/config.ts'
import { pointInPolygon } from '../../src/coords.ts'
import { MOAT } from '../../src/moat.ts'

const island = MOAT.island.map((p) => [p.x, p.z] as [number, number])
const DAYS = Array.from({ length: 30 }, (_, i) => {
  const d = new Date(Date.UTC(2026, 9, 1 + i))
  return d.toISOString().slice(0, 10)
})

describe('castle', () => {
  it('stands the same all day', () => {
    expect(castleOf('2026-10-20')).toEqual(castleOf('2026-10-20'))
    expect(seedOf('2026-10-20')).toBe(seedOf('2026-10-20'))
  })

  it('is made anew every day', () => {
    const seen = new Set(DAYS.map((d) => JSON.stringify(castleOf(d).masses)))
    expect(seen.size).toBe(DAYS.length)
    expect(seedOf('2026-10-20')).not.toBe(seedOf('2026-10-21'))
  })

  it('stands over the island, within its counts', () => {
    const { masses, spires } = CONFIG.castle
    for (const day of DAYS) {
      const castle = castleOf(day)
      expect(castle.day).toBe(day)
      expect(castle.masses.length).toBeGreaterThan(0)
      expect(castle.masses.length).toBeLessThanOrEqual(masses.max)
      expect(castle.spires.length).toBeLessThanOrEqual(spires.max)
      for (const m of castle.masses) {
        for (const [sx, sz] of [
          [-1, -1],
          [1, 1],
          [1, -1],
          [-1, 1],
        ]) {
          expect(
            pointInPolygon(m.x + (sx * m.w) / 2, m.z + (sz * m.d) / 2, island)
          ).toBe(true)
        }
        expect(m.h).toBeGreaterThan(0)
        expect(m.y).toBeGreaterThanOrEqual(0)
      }
      for (const s of castle.rock) {
        expect(pointInPolygon(s.x, s.z, island)).toBe(true)
        expect(s.depth).toBeGreaterThan(0)
      }
      const { lighthouse } = castle
      expect(pointInPolygon(lighthouse.x, lighthouse.z, island)).toBe(true)
      // Its lamp over everything else.
      const highest = Math.max(...castle.masses.map((m) => m.y + m.h))
      expect(lighthouse.y + lighthouse.h).toBeGreaterThan(highest)
    }
  })

  it('stands spires on roofs and flies buttresses up to taller masses', () => {
    let buttresses = 0
    let gargoyles = 0
    for (const day of DAYS) {
      const castle = castleOf(day)
      const roofs = new Set(castle.masses.map((m) => m.y + m.h))
      for (const s of castle.spires) expect(roofs.has(s.y)).toBe(true)
      for (const b of castle.buttresses)
        expect(b.to.y).toBeGreaterThan(b.from.y)
      buttresses += castle.buttresses.length
      gargoyles += castle.gargoyles.length
    }
    expect(buttresses).toBeGreaterThan(0)
    expect(gargoyles).toBeGreaterThan(0)
  })

  it('turns the lighthouse on the shared clock', () => {
    const { rpm } = CONFIG.castle.lighthouse
    expect(lighthouseAngle(0)).toBe(0)
    expect(lighthouseAngle(60 / rpm / 4)).toBeCloseTo(Math.PI / 2)
    expect(lighthouseAngle(60 / rpm)).toBeCloseTo(0)
    expect(lighthouseAngle(1e9)).toBeGreaterThanOrEqual(0)
    expect(lighthouseAngle(1e9)).toBeLessThan(Math.PI * 2)
  })

  it('bobs a little either way', () => {
    const { metres, seconds } = CONFIG.castle.bob
    expect(bobAt(0)).toBe(0)
    expect(bobAt(seconds / 4)).toBeCloseTo(metres)
  })
})
