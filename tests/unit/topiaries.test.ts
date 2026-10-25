import { describe, expect, it } from 'vitest'
import { clearBetween, mazeMap, theMaze } from '../../src/caretaker.ts'
import { CONFIG } from '../../src/config.ts'
import {
  cellPoint,
  mazeGates,
  mazeToWorld,
  SHINING_MAZE,
} from '../../src/maze.ts'
import {
  burnedAway,
  dealSpots,
  freshTopiaries,
  hitTopiary,
  inTorchReach,
  isTopiaryGate,
  mayAppear,
  mayMove,
  nextRegrowth,
  regrow,
  spineDistance,
  spotOfGate,
  swingTarget,
  theTopiaries,
  TOPIARIES,
  topiariesAt,
  topiaryGate,
  topiarySpots,
  torchDamage,
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

describe('a topiary grown back', () => {
  const due: TopiaryStand = { spot: spots[0], away: true }
  it('shows itself only where it is not seen, and not on the raider', () => {
    expect(
      mayAppear(
        due,
        () => false,
        () => false
      )
    ).toBe(true)
    expect(
      mayAppear(
        due,
        () => true,
        () => false
      )
    ).toBe(false)
    expect(
      mayAppear(
        due,
        () => false,
        () => true
      )
    ).toBe(false)
    expect(
      mayAppear(
        null,
        () => false,
        () => false
      )
    ).toBe(false)
  })
})

describe('the torch on a topiary', () => {
  it('works out the spots once', () => {
    expect(theTopiaries()).toBe(theTopiaries())
    expect(theTopiaries().pools).toEqual(pools)
  })

  it('stands every one whole', () => {
    const list = freshTopiaries()
    expect(list).toHaveLength(TOPIARIES.length)
    expect(list.every((h) => h.hp === cfg.hp && h.back === null)).toBe(true)
    expect(burnedAway(list[0])).toBe(false)
    expect(burnedAway(undefined)).toBe(false)
    expect(nextRegrowth(list)).toBeNull()
  })

  it('takes the damage, give or take its spread, never none', () => {
    const { damage, spread } = CONFIG.torch
    expect(torchDamage(0.5)).toBe(damage)
    expect(torchDamage(0)).toBe(Math.round(damage * (1 - spread)))
    expect(torchDamage(1)).toBe(Math.round(damage * (1 + spread)))
    expect(torchDamage(5)).toBe(torchDamage(1))
    expect(torchDamage(0, { ...CONFIG.torch, damage: 0 })).toBe(1)
  })

  it('takes a blow off one, and burns it away at nothing', () => {
    const list = freshTopiaries()
    const hit = hitTopiary(list, 1, 30, 1000)
    expect(hit?.burned).toBe(false)
    expect(hit?.list[1]).toEqual({ hp: cfg.hp - 30, back: null })
    expect(hit?.list[0]).toBe(list[0])
    const burned = hitTopiary(hit?.list ?? [], 1, cfg.hp, 2000)
    expect(burned?.burned).toBe(true)
    expect(burned?.list[1]).toEqual({
      hp: 0,
      back: 2000 + cfg.regrowSeconds * 1000,
    })
    // Burned away, or no such one: nothing to hit.
    expect(hitTopiary(burned?.list ?? [], 1, 10, 3000)).toBeNull()
    expect(hitTopiary(list, 99, 10, 3000)).toBeNull()
  })

  it('grows each back whole when its time comes', () => {
    const burned = [
      { hp: 0, back: 5000 },
      { hp: 40, back: null },
      { hp: 0, back: 9000 },
    ]
    expect(nextRegrowth(burned)).toBe(5000)
    expect(regrow(burned, 4000)).toBeNull()
    expect(regrow(burned, 5000)).toEqual([
      { hp: cfg.hp, back: null },
      { hp: 40, back: null },
      { hp: 0, back: 9000 },
    ])
  })

  it('reaches one from beside any of its own spots, and no further', () => {
    const place = { x: 500, z: -200, yaw: 0.6 }
    const spot = pools[2][0]
    const on = mazeToWorld(place, spot)
    expect(spineDistance(place, spot, on)).toBeCloseTo(0)
    expect(inTorchReach(place, 2, on, 1)).toBe(true)
    const away = mazeToWorld(place, { x: spot.x, z: spot.z + 5 })
    expect(inTorchReach(place, 2, away, 3)).toBe(false)
    expect(inTorchReach(place, 2, away, 6)).toBe(true)
    expect(inTorchReach(place, 99, on, 1)).toBe(false)
  })
})

describe('where a swing lands', () => {
  const spine = { a: { x: 0, z: -2 }, b: { x: 0, z: 2 } }
  const reach = CONFIG.torch.reach
  it('lands on the one ahead within reach', () => {
    expect(swingTarget([spine], { x: 2, z: 0 }, { x: -1, z: 0 }, reach)).toBe(0)
  })

  it('misses one behind, or out of reach, or not standing', () => {
    expect(
      swingTarget([spine], { x: 2, z: 0 }, { x: 1, z: 0 }, reach)
    ).toBeNull()
    expect(
      swingTarget([spine], { x: reach + 1, z: 0 }, { x: -1, z: 0 }, reach)
    ).toBeNull()
    expect(
      swingTarget([null], { x: 2, z: 0 }, { x: -1, z: 0 }, reach)
    ).toBeNull()
  })

  it('lands on one close enough to touch whichever way the raider faces', () => {
    expect(swingTarget([spine], { x: 1, z: 0 }, { x: 1, z: 0 }, reach)).toBe(0)
  })

  it('lands on the nearest of two', () => {
    const far = { a: { x: -2, z: -2 }, b: { x: -2, z: 2 } }
    expect(swingTarget([far, spine], { x: 2, z: 0 }, { x: -1, z: 0 }, 5)).toBe(
      1
    )
  })
})
