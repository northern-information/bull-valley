import { describe, expect, it } from 'vitest'
import {
  caretakerAt,
  cellOf,
  clearBetween,
  createCaretaker,
  heartPoint,
  mazeMap,
  routeTo,
  segmentGap,
  stepCaretaker,
  theMaze,
} from '../../src/caretaker.ts'
import { CONFIG } from '../../src/config.ts'
import { pointSegmentDistance } from '../../src/coords.ts'
import { cellPoint, mazeToWorld } from '../../src/maze.ts'
import { mulberry32 } from '../../src/rng.ts'
import { beamFrom } from '../../src/shadowmen.ts'
import type { Caretaker } from '../../src/caretaker.ts'
import type { Raider } from '../../src/shadowmen.ts'

// A little maze: a corridor along z with a wall across it halfway, open at
// one side, so the way round is longer than the way through.
//   #######
//   #.....#
//   #.###.#
//   #.....#
//   #######
const SMALL = ['#######', '#.....#', '#.###.#', '#.....#', '#######']
const SMALL_SIZE = { across: 8, along: 12 }

const map = theMaze()
const place = { x: 1000, z: -500, yaw: 0.7 }
const heart = heartPoint(map)
// A maze-local point in the world.
const world = (p: { x: number; z: number }) => mazeToWorld(place, p)

const raider = (over: Partial<Raider> & { x: number; z: number }): Raider => ({
  id: 'r',
  vulnerable: true,
  beam: null,
  ...over,
})

// Steps until `done` says so, or `steps` run out; how many it took.
function stepUntil(
  ct: Caretaker,
  raiders: Raider[],
  done: (out: ReturnType<typeof stepCaretaker>) => boolean,
  steps = 600,
  dt = 0.1
): number {
  const rng = mulberry32(7)
  for (let i = 0; i < steps; i++) {
    if (done(stepCaretaker(ct, rng, { dt, raiders, place }))) return i
  }
  return -1
}

describe('the maze as the Caretaker knows it', () => {
  it('patrols only the paths the heart can be walked to from', () => {
    const small = mazeMap(SMALL, SMALL_SIZE, 1)
    expect(small.cells.length).toBe(12)
    expect(small.heart).toEqual({ col: 3, row: 1 })
    for (const cell of map.cells) {
      expect(map.grid[cell.row][cell.col]).toBe('.')
    }
    // The court at the heart, and the gate's path, are among them.
    expect(map.reachable.has(map.heart.row * 57 + map.heart.col)).toBe(true)
  })

  it('measures the gap between two segments, crossing or not', () => {
    const o = { x: 0, z: 0 }
    expect(segmentGap(o, { x: 2, z: 2 }, { x: 0, z: 2 }, { x: 2, z: 0 })).toBe(
      0
    )
    expect(
      segmentGap(o, { x: 2, z: 0 }, { x: 0, z: 1 }, { x: 2, z: 1 })
    ).toBeCloseTo(1)
    expect(
      segmentGap(o, { x: 1, z: 0 }, { x: 3, z: 0 }, { x: 4, z: 0 })
    ).toBeCloseTo(2)
  })

  it('sees down an open path but never through the corn', () => {
    const small = mazeMap(SMALL, SMALL_SIZE, 1)
    const at = (col: number, row: number) =>
      cellPoint(SMALL, SMALL_SIZE, { col, row })
    expect(clearBetween(small, at(1, 1), at(5, 1), 0)).toBe(true)
    expect(clearBetween(small, at(3, 1), at(3, 3), 0)).toBe(false)
    // A body keeps further off the corn than a glance does.
    expect(clearBetween(small, at(1, 1), at(5, 1), 2)).toBe(false)
  })

  it('finds the nearest path to any point, in the corn or out past it', () => {
    const small = mazeMap(SMALL, SMALL_SIZE, 1)
    const wall = cellPoint(SMALL, SMALL_SIZE, { col: 3, row: 2 })
    expect([1, 3]).toContain(cellOf(small, wall).row)
    expect(cellOf(small, { x: -50, z: -50 })).toEqual({ col: 1, row: 1 })
  })

  it('routes round the wall, ending where it was asked to go', () => {
    const small = mazeMap(SMALL, SMALL_SIZE, 1)
    const from = cellPoint(SMALL, SMALL_SIZE, { col: 3, row: 1 })
    const to = cellPoint(SMALL, SMALL_SIZE, { col: 3, row: 3 })
    const route = routeTo(small, from, to)
    expect(route[route.length - 1]).toEqual(to)
    // Out to an end of the wall and back: longer than straight through.
    let length = 0
    let prev = from
    for (const p of route) {
      expect(clearBetween(small, prev, p, 0)).toBe(true)
      length += Math.hypot(p.x - prev.x, p.z - prev.z)
      prev = p
    }
    expect(length).toBeGreaterThan(Math.hypot(to.x - from.x, to.z - from.z))
  })
})

describe('the Caretaker', () => {
  it('forms at the heart, in the world where the maze lies', () => {
    const ct = createCaretaker(map)
    expect({ x: ct.x, z: ct.z }).toEqual(heart)
    expect(caretakerAt(ct, place)).toEqual(world(heart))
    expect(caretakerAt({ ...ct, gone: 1 }, place)).toBeNull()
  })

  it('patrols the paths, never into the corn, and comes home by turns', () => {
    const ct = createCaretaker(map)
    const rng = mulberry32(3)
    let closest = Infinity
    let home = 0
    let wasHome = true
    for (let i = 0; i < 6000; i++) {
      stepCaretaker(ct, rng, { dt: 0.1, raiders: [], place })
      for (const s of map.spans) {
        closest = Math.min(
          closest,
          pointSegmentDistance(ct.x, ct.z, s.a.x, s.a.z, s.b.x, s.b.z)
        )
      }
      const isHome = Math.hypot(ct.x - heart.x, ct.z - heart.z) < 0.01
      if (isHome && !wasHome) home++
      wasHome = isHome
    }
    expect(closest).toBeGreaterThanOrEqual(
      map.half + CONFIG.caretaker.clearance - 1e-6
    )
    expect(home).toBeGreaterThan(0)
  })

  it('hunts a raider it sees in the maze, and catches them', () => {
    const ct = createCaretaker(map)
    const prey = raider({ ...world({ x: heart.x, z: heart.z + 12 }) })
    let caught: string[] = []
    const steps = stepUntil(ct, [prey], (out) => {
      caught = out.struck
      return out.struck.length > 0
    })
    expect(caught).toEqual(['r'])
    // At its hunting pace.
    expect(steps * 0.1).toBeLessThan(12 / CONFIG.caretaker.huntSpeed + 0.5)
    // It lets them be, and goes home.
    expect(ct.target).toBeNull()
    expect(ct.homeward).toBe(true)
  })

  it('outpaced, it loses a raider it can no longer see', () => {
    const ct = createCaretaker(map)
    const rng = mulberry32(1)
    const near = raider({ ...world({ x: heart.x, z: heart.z + 10 }) })
    stepCaretaker(ct, rng, { dt: 0.1, raiders: [near], place })
    expect(ct.target).toBe('r')
    // Round a corner, far away: out of sight and out of the maze's
    // reckoning. It keeps on toward where it last saw them, then gives up.
    const gone = raider({ ...world({ x: 2, z: 2 }) })
    const steps = stepUntil(ct, [gone], () => ct.target === null)
    expect(steps).toBeGreaterThan(0)
    expect(steps * 0.1).toBeLessThanOrEqual(
      CONFIG.caretaker.forgetSeconds + 0.11
    )
  })

  it('leaves be a raider who cannot be struck, or who is out of the corn', () => {
    for (const r of [
      raider({ ...world({ x: heart.x, z: heart.z + 1 }), vulnerable: false }),
      raider({ ...world({ x: -3, z: -3 }) }),
    ]) {
      const ct = createCaretaker(map)
      stepCaretaker(ct, mulberry32(1), { dt: 0.1, raiders: [r], place })
      expect(ct.target).toBeNull()
    }
  })

  it('senses a raider very close, even through the corn', () => {
    const small = mazeMap(SMALL, SMALL_SIZE, 1)
    const ct = createCaretaker(small)
    const below = cellPoint(SMALL, SMALL_SIZE, { col: 3, row: 3 })
    const r = raider({ ...mazeToWorld(place, below) })
    stepCaretaker(
      ct,
      mulberry32(1),
      { dt: 0.1, raiders: [r], place },
      { ...CONFIG.caretaker, senseRadius: 5, sightRange: 5 },
      small
    )
    expect(ct.target).toBe('r')
  })

  describe('two beams', () => {
    // Raiders down the court from it, looking at it: the beam aims from
    // world feet along world yaw, so turn the maze's +z into the world.
    const lit = (id: string, dx: number): Raider => {
      const feet = world({ x: heart.x + dx, z: heart.z - 8 })
      const toward = world(heart)
      const yaw = Math.atan2(-(toward.x - feet.x), -(toward.z - feet.z))
      return {
        id,
        ...feet,
        vulnerable: false,
        beam: beamFrom({ ...feet, y: 0 }, yaw, 0, false),
      }
    }

    it('does nothing with one beam, however long', () => {
      const ct = createCaretaker(map)
      for (let i = 0; i < 50; i++) {
        stepCaretaker(ct, mulberry32(1), {
          dt: 0.1,
          raiders: [lit('a', 0)],
          place,
        })
      }
      expect(ct.burn).toBe(0)
      expect(ct.gone).toBe(0)
    })

    it('unmakes it with two at once, and it forms again at the heart', () => {
      const ct = createCaretaker(map)
      const raiders = [lit('a', 0), lit('b', 0.6)]
      let burst = null as ReturnType<typeof stepCaretaker>['burst']
      let unmadeBy: string[] = []
      const steps = stepUntil(
        ct,
        raiders,
        (out) => {
          burst = out.burst
          unmadeBy = out.unmadeBy
          return out.burst !== null
        },
        100,
        0.05
      )
      expect(steps * 0.05).toBeCloseTo(CONFIG.caretaker.burnSeconds - 0.05, 5)
      expect(burst).not.toBeNull()
      // Both beams that held it, for the season (sharedworld.ts rule 14).
      expect(unmadeBy).toEqual(['a', 'b'])
      expect(ct.gone).toBe(CONFIG.caretaker.respawnSeconds)
      expect(caretakerAt(ct, place)).toBeNull()
      // Gone, it neither burns nor hunts.
      stepCaretaker(ct, mulberry32(1), {
        dt: CONFIG.caretaker.respawnSeconds - 1,
        raiders,
        place,
      })
      expect(caretakerAt(ct, place)).toBeNull()
      stepCaretaker(ct, mulberry32(1), { dt: 1, raiders, place })
      expect(caretakerAt(ct, place)).toEqual(world(heart))
      expect(ct.burn).toBe(0)
    })

    it('cools off when the second beam drops', () => {
      const ct = createCaretaker(map)
      const rng = mulberry32(1)
      stepCaretaker(ct, rng, {
        dt: 0.5,
        raiders: [lit('a', 0), lit('b', 0.6)],
        place,
      })
      expect(ct.burn).toBeCloseTo(0.5)
      stepCaretaker(ct, rng, { dt: 0.3, raiders: [lit('a', 0)], place })
      expect(ct.burn).toBeCloseTo(0.2)
    })

    it('is not burned through the corn', () => {
      const ct = createCaretaker(map)
      // The same two, from the far side of the court's wall.
      const behind = (id: string, dx: number): Raider => {
        const r = lit(id, dx)
        const feet = world({ x: heart.x - 12, z: heart.z })
        const toward = world(heart)
        const yaw = Math.atan2(-(toward.x - feet.x), -(toward.z - feet.z))
        return {
          ...r,
          ...feet,
          beam: beamFrom({ ...feet, y: 0 }, yaw, 0, false),
        }
      }
      stepCaretaker(ct, mulberry32(1), {
        dt: CONFIG.caretaker.burnSeconds,
        raiders: [behind('a', 0), behind('b', 0)],
        place,
      })
      expect(ct.gone).toBe(0)
    })
  })
})

describe('a Caretaker a spec put somewhere', () => {
  it('floats still until it has someone to hunt, then walks on', () => {
    const ct = { ...createCaretaker(map), held: true }
    const rng = mulberry32(1)
    for (let i = 0; i < 20; i++) {
      stepCaretaker(ct, rng, { dt: 0.1, raiders: [], place })
    }
    expect({ x: ct.x, z: ct.z }).toEqual(heart)
    const prey = raider({ ...world({ x: heart.x, z: heart.z + 4 }) })
    stepUntil(ct, [prey], (out) => out.struck.length > 0)
    expect(ct.held).toBe(false)
  })
})
