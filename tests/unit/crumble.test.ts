import { describe, expect, it } from 'vitest'
import { castleOf, SLAB } from '../../src/castle.ts'
import { CONFIG } from '../../src/config.ts'
import {
  chunkAt,
  fragmentAt,
  mix,
  piecesOf,
  ruinOf,
  ruinsAt,
} from '../../src/crumble.ts'

const DAYS = Array.from({ length: 20 }, (_, i) =>
  new Date(Date.UTC(2026, 9, 1 + i)).toISOString().slice(0, 10)
)
const { ruin: RUIN, fragments: FRAG } = CONFIG.castle
const ROUND = RUIN.crumble + RUIN.gone + RUIN.regrow

describe('crumble', () => {
  it('hashes to [0, 1), the same for the same parts', () => {
    expect(mix(1, 2, 3)).toBe(mix(1, 2, 3))
    expect(mix(1, 2, 3)).not.toBe(mix(1, 2, 4))
    for (let i = 0; i < 200; i++) {
      const h = mix(i, 7)
      expect(h).toBeGreaterThanOrEqual(0)
      expect(h).toBeLessThan(1)
    }
  })

  it('never lets the keep, the cathedral, the lighthouse or a bearing mass fall', () => {
    let buttresses = 0
    let masses = 0
    for (const day of DAYS) {
      const layout = castleOf(day)
      const pieces = piecesOf(layout)
      const fall = new Set(
        pieces.filter((p) => p.kind === 'mass').map((p) => p.index)
      )
      expect(fall.has(0)).toBe(false)
      expect(fall.has(layout.spires[0].on)).toBe(false)
      expect(fall.has(layout.lighthouse.on)).toBe(false)
      for (const index of fall) {
        const m = layout.masses[index]
        // Nothing stands on it.
        expect(
          layout.masses.some(
            (o) =>
              o !== m &&
              Math.abs(o.y - (m.y + m.h)) < 1e-6 &&
              Math.abs(o.x - m.x) < (o.w + m.w) / 2 &&
              Math.abs(o.z - m.z) < (o.d + m.d) / 2
          )
        ).toBe(false)
      }
      masses += fall.size
      buttresses += pieces.filter((p) => p.kind === 'buttress').length
      expect(pieces.filter((p) => p.kind === 'buttress')).toHaveLength(
        layout.buttresses.length
      )
    }
    expect(masses).toBeGreaterThan(0)
    expect(buttresses).toBeGreaterThan(0)
  })

  it('crumbles, stays gone, regrows and stands, in that order', () => {
    // Find a piece that falls in some round, then walk through it.
    let seen = false
    for (let key = 0; key < 50 && !seen; key++) {
      for (let t = 0; t < RUIN.cycle * 20 && !seen; t += 1) {
        const r = ruinOf(42, key, t)
        if (r.stage !== 'crumbling' || r.since > 1) continue
        const at = (dt: number) => ruinOf(42, key, t + dt).stage
        expect(at(RUIN.crumble / 2)).toBe('crumbling')
        expect(at(RUIN.crumble + RUIN.gone / 2)).toBe('gone')
        expect(at(RUIN.crumble + RUIN.gone + RUIN.regrow / 2)).toBe('regrowing')
        expect(at(ROUND + 1)).toBe('standing')
        seen = true
      }
    }
    expect(seen).toBe(true)
  })

  it('brings down about its share of the pieces over the rounds', () => {
    let fell = 0
    const rounds = 400
    for (let key = 0; key < rounds; key++) {
      // Any moment of round 3 that is past the offset is in one round.
      const t = RUIN.cycle * 3 + 0.5
      const stage = ruinOf(7, key, t).stage
      if (stage !== 'standing') fell++
    }
    // A piece is down for ROUND of each cycle it falls in.
    const expected = (RUIN.share * ROUND) / RUIN.cycle
    expect(fell / rounds).toBeGreaterThan(expected * 0.6)
    expect(fell / rounds).toBeLessThan(expected * 1.4)
  })

  it('takes a buttress down with a mass it spans', () => {
    let checked = 0
    for (const day of DAYS) {
      const layout = castleOf(day)
      for (let t = 0; t < RUIN.cycle * 10; t += 7) {
        const ruins = ruinsAt(layout, t)
        layout.buttresses.forEach((b, i) => {
          const down = [ruins.masses[b.low], ruins.masses[b.tall]].some(
            (r) => r.stage !== 'standing'
          )
          if (down) {
            expect(ruins.buttresses[i].stage).not.toBe('standing')
            checked++
          }
        })
      }
    }
    expect(checked).toBeGreaterThan(0)
  })

  it('drops fragments off the castle, falling and fading', () => {
    const layout = castleOf(DAYS[0])
    const ruins = ruinsAt(layout, 0)
    let some = 0
    for (let i = 0; i < FRAG.count; i++) {
      const a = fragmentAt(layout, ruins, i, 100)
      const b = fragmentAt(layout, ruins, i, 100.2)
      if (!a || !b) continue
      some++
      expect(a.fade).toBeGreaterThanOrEqual(0)
      expect(a.fade).toBeLessThan(1)
      expect(a.size).toBeGreaterThanOrEqual(FRAG.size.min)
      expect(a.size).toBeLessThanOrEqual(FRAG.size.max)
      // Within one fall, it only goes down.
      if (b.fade > a.fade) expect(b.y).toBeLessThan(a.y)
    }
    expect(some).toBeGreaterThan(FRAG.count / 2)
  })

  it('drops no fragment off a mass that is down, but still off the rock', () => {
    const layout = castleOf(DAYS[0])
    const down = {
      masses: layout.masses.map(() => ({
        stage: 'gone' as const,
        u: 0.5,
        since: 10,
        round: 0,
      })),
    }
    let rock = 0
    for (let i = 0; i < FRAG.count; i++) {
      const f = fragmentAt(layout, down, i, 50)
      if (f) {
        rock++
        expect(f.y).toBeLessThan(-SLAB + 1e-6)
      }
    }
    expect(rock).toBeGreaterThan(0)
  })

  it('throws chunks out of a crumbling mass and lets them go', () => {
    const m = { x: 0, y: 10, z: 0, w: 6, d: 6, h: 8 }
    let thrown = 0
    for (let j = 0; j < FRAG.chunks; j++) {
      expect(chunkAt(m, 1, 2, j, -1)).toBeNull()
      expect(
        chunkAt(m, 1, 2, j, FRAG.chunkSpread + FRAG.chunkLife + 0.1)
      ).toBeNull()
      const f = chunkAt(m, 1, 2, j, FRAG.chunkSpread + 0.5)
      if (!f) continue
      thrown++
      expect(f.size).toBeGreaterThanOrEqual(FRAG.chunk.min)
      expect(f.fade).toBeGreaterThan(0)
    }
    expect(thrown).toBeGreaterThan(FRAG.chunks / 2)
  })
})
