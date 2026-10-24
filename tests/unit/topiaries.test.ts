import { describe, expect, it } from 'vitest'
import { clearBetween, mazeMap, theMaze } from '../../src/caretaker.ts'
import { CONFIG } from '../../src/config.ts'
import { cellPoint, mazeGates, SHINING_MAZE } from '../../src/maze.ts'
import {
  dealSpots,
  isTopiaryGate,
  mayMove,
  spotOfGate,
  TOPIARIES,
  topiariesAt,
  topiaryGate,
  topiarySpots,
} from '../../src/topiaries.ts'
import type { TopiaryStand } from '../../src/topiaries.ts'

const cfg = CONFIG.topiaries
const spots = topiarySpots()
const pools = dealSpots(spots)

describe('where the topiaries may stand', () => {
  it('finds spots all over the maze, enough for every animal to move', () => {
    expect(spots.length).toBeGreaterThan(TOPIARIES.length * 5)
    expect(new Set(spots.map((s) => s.id)).size).toBe(spots.length)
  })

  it('stands each across a corridor along the road, its corn either side', () => {
    const half = CONFIG.maze.wallThickness / 2
    for (const s of spots) {
      // The gate runs across the corridor, away from the road.
      expect(s.a.z).toBe(s.z)
      expect(s.b.z).toBe(s.z)
      expect(s.a.x).toBeLessThan(s.x)
      expect(s.b.x).toBeGreaterThan(s.x)
      expect(s.x - s.a.x).toBeCloseTo(s.b.x - s.x)
      const width = s.b.x - s.a.x - 2 * half
      expect(width).toBeGreaterThanOrEqual(cfg.minWidth)
      expect(width).toBeLessThanOrEqual(cfg.maxWidth)
      // Each end is in the corn, and the middle is clear of it.
      const map = theMaze()
      expect(clearBetween(map, s.a, s.b, 0)).toBe(false)
      expect(clearBetween(map, s, s, 0.5)).toBe(true)
    }
  })

  it('keeps off the heart, the gate and each other', () => {
    const map = theMaze()
    const heart = cellPoint(map.grid, map.size, map.heart)
    const gates = mazeGates(SHINING_MAZE).map((g) =>
      cellPoint(SHINING_MAZE, CONFIG.maze.size, g)
    )
    for (const s of spots) {
      expect(Math.hypot(s.x - heart.x, s.z - heart.z)).toBeGreaterThanOrEqual(
        cfg.clearOfHeart
      )
      for (const g of gates) {
        expect(Math.hypot(s.x - g.x, s.z - g.z)).toBeGreaterThanOrEqual(
          cfg.clearOfGate
        )
      }
      for (const t of spots) {
        if (t === s) continue
        expect(Math.hypot(s.x - t.x, s.z - t.z)).toBeGreaterThanOrEqual(
          cfg.spacing
        )
      }
    }
  })

  it('finds none in a maze with no corridor wide enough', () => {
    const grid = ['#####', '#...#', '.....', '#...#', '#####']
    const map = mazeMap(grid, { across: 4, along: 4 }, 1)
    expect(topiarySpots(map)).toEqual([])
  })

  it('deals every spot to one animal alone', () => {
    expect(pools).toHaveLength(TOPIARIES.length)
    const dealt = pools.flat().map((s) => s.id)
    expect(dealt.sort((a, b) => a - b)).toEqual(spots.map((s) => s.id))
    for (const pool of pools) {
      expect(pool.length).toBeGreaterThanOrEqual(
        Math.floor(spots.length / TOPIARIES.length)
      )
    }
    expect(dealSpots(spots)).toEqual(pools)
  })
})

describe('the topiaries on the valley clock', () => {
  it('puts every animal in the same place for every client', () => {
    const at = 1_800_000_000
    expect(topiariesAt(pools, at)).toEqual(topiariesAt(pools, at))
    const stands = topiariesAt(pools, at)
    stands.forEach((stand, i) => {
      expect(pools[i]).toContain(stand?.spot)
    })
  })

  it('holds each one a slot, and moves them at different moments', () => {
    const start = 1_800_000_000
    const moves: number[][] = TOPIARIES.map(() => [])
    let last = topiariesAt(pools, start)
    for (let t = start + 1; t < start + cfg.slotSeconds * 40; t++) {
      const now = topiariesAt(pools, t)
      now.forEach((stand, i) => {
        if (stand?.spot.id !== last[i]?.spot.id) moves[i].push(t)
      })
      last = now
    }
    for (const times of moves) {
      // It goes somewhere else most slots, never sooner than a slot on.
      expect(times.length).toBeGreaterThan(20)
      for (let k = 1; k < times.length; k++) {
        expect(times[k] - times[k - 1]).toBeGreaterThanOrEqual(cfg.slotSeconds)
      }
    }
    const firsts = new Set(moves.map((times) => times[0] % cfg.slotSeconds))
    expect(firsts.size).toBeGreaterThan(1)
  })

  it('stands no one with no spots', () => {
    expect(topiariesAt([[], pools[0]], 10)[0]).toBeNull()
  })
})

describe('a topiary only moves unseen', () => {
  const [one, two] = spots
  const shown: TopiaryStand = { spot: one, away: true }
  const due: TopiaryStand = { spot: two, away: false }
  const never = () => false

  it('takes its first place at once', () => {
    expect(
      mayMove(
        null,
        due,
        () => true,
        () => true
      )
    ).toBe(true)
  })

  it('stays put while it is due where it stands', () => {
    expect(mayMove(shown, { ...shown }, never, never)).toBe(false)
    expect(mayMove(shown, null, never, never)).toBe(false)
  })

  it('turns round, unseen, at the same spot', () => {
    expect(mayMove(shown, { ...shown, away: false }, never, never)).toBe(true)
  })

  it('moves while the raider sees neither end', () => {
    expect(mayMove(shown, due, never, never)).toBe(true)
  })

  it('holds while the raider sees where it stands or where it goes', () => {
    expect(mayMove(shown, due, (s) => s === one, never)).toBe(false)
    expect(mayMove(shown, due, (s) => s === two, never)).toBe(false)
  })

  it('never lands on a raider in its way', () => {
    expect(mayMove(shown, due, never, (s) => s === two)).toBe(false)
  })
})

describe('the corridor gates', () => {
  it('names each spot and reads it back', () => {
    const gate = topiaryGate(spots[3])
    expect(isTopiaryGate(gate)).toBe(true)
    expect(spotOfGate(gate)).toBe(spots[3].id)
    expect(isTopiaryGate('lock:office')).toBe(false)
    expect(spotOfGate('lock:office')).toBeNull()
    expect(spotOfGate('topiary:x')).toBeNull()
  })
})
