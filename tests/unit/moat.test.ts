import { describe, expect, it } from 'vitest'
import { CONFIG } from '../../src/config.ts'
import { pointInPolygon } from '../../src/coords.ts'
import { Ground } from '../../src/ground.ts'
import { mazeToWorld } from '../../src/maze.ts'
import {
  carve,
  castlePlace,
  catchPipe,
  craneSpots,
  fireEscapes,
  inChannel,
  MOAT,
  moatEdges,
  moatFloor,
  moatPipes,
  moatShape,
  moatWalls,
  onIsland,
  onMoatGrounds,
  pipeDecks,
  pipeFittings,
  pipeWalls,
  trickle,
} from '../../src/moat.ts'
import { Walls } from '../../src/walls.ts'
import type { XZ } from '../../src/interfaces.ts'

// A gentle slope for the terrain round the moat.
const raw = (x: number, z: number) => 200 + x * 0.02 - z * 0.01
const station = { x: 1000, z: 500, yaw: 0.4, y: 0 }
const place = castlePlace(station)
const floor = moatFloor(raw, place)
const ground = new Ground(carve(raw, place, floor))
const stairs = fireEscapes(raw, place, floor)
for (const stair of stairs) {
  for (const flight of stair.flights) {
    ground.addRibbon([flight.a, flight.b], stair.width, 0)
  }
  for (const l of stair.landings) {
    ground.addFloor(l.x, l.z, l.cos, l.sin, l.x0, l.x1, l.halfWidth, l.y)
  }
}
const { step, climb } = CONFIG.fall

const ring = (poly: readonly { x: number; z: number }[]) =>
  poly.map((p) => [p.x, p.z] as [number, number])

describe('moat', () => {
  it('lies straight out the station door, past the donut field', () => {
    const { at } = CONFIG.castle
    const out = { x: Math.cos(station.yaw), z: Math.sin(station.yaw) }
    const side = { x: -out.z, z: out.x }
    const dx = place.x - station.x
    const dz = place.z - station.z
    expect(dx * out.x + dz * out.z).toBeCloseTo(at.x)
    expect(dx * side.x + dz * side.z).toBeCloseTo(at.z)
    expect(at.x).toBeGreaterThan(CONFIG.truck.donuts.field.x)
    expect(place.yaw).toBe(CONFIG.castle.yaw)
  })

  it('is an irregular pentagon with the island inside the outer edge', () => {
    expect(MOAT.island).toHaveLength(5)
    expect(moatShape()).toEqual(MOAT)
    for (const p of MOAT.island) {
      expect(pointInPolygon(p.x, p.z, ring(MOAT.outer))).toBe(true)
    }
    const radii = MOAT.island.map((p) => Math.hypot(p.x, p.z))
    expect(Math.max(...radii) - Math.min(...radii)).toBeGreaterThan(1)
  })

  it('runs the channel the same width all round', () => {
    const { width } = CONFIG.castle.moat
    MOAT.island.forEach((a, k) => {
      const b = MOAT.island[(k + 1) % 5]
      const o = MOAT.outer[k]
      // The outer corner's distance to the island side's line.
      const len = Math.hypot(b.x - a.x, b.z - a.z)
      const d =
        Math.abs((b.x - a.x) * (a.z - o.z) - (a.x - o.x) * (b.z - a.z)) / len
      expect(d).toBeCloseTo(width, 5)
    })
  })

  it('cuts the floor into the channel alone', () => {
    const mid = trickle(place)[0]
    expect(inChannel(place, mid.x, mid.z)).toBe(true)
    expect(ground.at(mid.x + 0.01, mid.z)).toBe(floor)
    expect(onIsland(place, place.x, place.z)).toBe(true)
    expect(ground.at(place.x, place.z)).toBe(raw(place.x, place.z))
    expect(inChannel(place, place.x, place.z)).toBe(false)
    expect(inChannel(place, place.x + 5000, place.z)).toBe(false)
    // At least `depth` under every point of either edge.
    const edges = moatEdges(place)
    for (const p of [...edges.outer, ...edges.island]) {
      expect(raw(p.x, p.z) - floor).toBeGreaterThanOrEqual(
        CONFIG.castle.moat.depth
      )
    }
  })

  it('keeps its grounds clear a margin past the outer edge', () => {
    const o = moatEdges(place).outer[0]
    const out = { x: o.x - place.x, z: o.z - place.z }
    const r = Math.hypot(out.x, out.z)
    const at = (d: number) => ({
      x: o.x + (out.x / r) * d,
      z: o.z + (out.z / r) * d,
    })
    expect(onMoatGrounds(place, place.x, place.z)).toBe(true)
    expect(onMoatGrounds(place, at(5).x, at(5).z)).toBe(true)
    expect(onMoatGrounds(place, at(40).x, at(40).z)).toBe(false)
    expect(onMoatGrounds(place, place.x + 9000, place.z)).toBe(false)
  })

  it('hangs a fire escape on each side it names, rim to floor', () => {
    expect(stairs.map((s) => s.side)).toEqual(CONFIG.castle.stairs.sides)
    for (const stair of stairs) {
      expect(stair.top.y).toBeCloseTo(raw(stair.top.x, stair.top.z))
      expect(inChannel(place, stair.top.x, stair.top.z)).toBe(false)
      expect(Math.abs(stair.flights[0].a.y - stair.top.y)).toBeLessThan(step)
      expect(stair.flights.at(-1)?.b.y).toBeCloseTo(floor)
      expect(stair.landings[0].y).toBeCloseTo(stair.flights[0].a.y)
      expect(stair.landings.at(-1)?.y).toBeCloseTo(floor)
      // Each flight picks up where the last left off.
      stair.flights.slice(1).forEach((f, i) => {
        expect(f.a.y).toBeCloseTo(stair.flights[i].b.y)
      })
      // Every flight hangs over the channel.
      for (const f of stair.flights) {
        expect(inChannel(place, f.a.x, f.a.z)).toBe(true)
        expect(inChannel(place, f.b.x, f.b.z)).toBe(true)
      }
    }
  })

  it('walks every fire escape down flight by flight, and back up', () => {
    for (const stair of stairs) {
      // From the rim onto the top landing, then down each flight in small
      // steps, never stepping off a deck by more than a step.
      let feet = stair.top.y
      const walk = (x: number, z: number) => {
        const y = ground.standAt(x, z, feet, climb)
        expect(Math.abs(y - feet)).toBeLessThanOrEqual(step)
        feet = y
      }
      let at = { x: stair.top.x, z: stair.top.z }
      const line = (to: { x: number; z: number }) => {
        for (let i = 1; i <= 40; i++) {
          const t = i / 40
          walk(at.x + (to.x - at.x) * t, at.z + (to.z - at.z) * t)
        }
        at = { x: to.x, z: to.z }
      }
      for (const f of stair.flights) {
        // Across the landing to the flight's head, then down it.
        line(f.a)
        line(f.b)
      }
      expect(feet).toBeCloseTo(floor)
      // And out of the foot onto the floor.
      line(stair.foot)
      expect(feet).toBe(floor)
      // Then all the way back up.
      for (const f of [...stair.flights].reverse()) {
        line(f.b)
        line(f.a)
      }
      line(stair.top)
      expect(feet).toBeCloseTo(stair.top.y)
    }
  })

  it('lets a raider up on a pipe walk it, and stops one under it', () => {
    const pipes = moatPipes(raw, place, floor, stairs)
    const decks = new Ground(carve(raw, place, floor))
    for (const deck of pipes.flatMap(pipeDecks)) {
      decks.addRibbon([deck.a, deck.b], deck.width, 0)
    }
    const walls = new Walls()
    for (const w of pipes.flatMap((pipe) => pipeWalls(pipe))) {
      walls.addWall(w.a, w.b, w.half, w.band)
    }
    for (const pipe of pipes) {
      const top = pipe.points[0].y + pipe.radius
      // Every level stretch is a deck; a drop to the floor is none.
      const level = pipe.points.filter(
        (p, i) => i > 0 && p.y === pipe.points[i - 1].y
      )
      expect(pipeDecks(pipe)).toHaveLength(level.length)
      // Along its length, feet on it stay on it, and nothing stops them.
      for (let i = 0; i < pipe.points.length - 1; i++) {
        const p = pipe.points[i]
        const q = pipe.points[i + 1]
        if (p.y !== q.y) continue
        for (let j = 0; j <= 10; j++) {
          const at = {
            x: p.x + (q.x - p.x) * (j / 10),
            z: p.z + (q.z - p.z) * (j / 10),
          }
          expect(decks.standAt(at.x, at.z, top, climb)).toBeCloseTo(top)
          expect(walls.resolve(at.x, at.z, 0.3, top)).toEqual(at)
        }
      }
      // A body a step under its top climbs onto it; one too far under to
      // climb it, whose head would meet it, is stopped.
      const [p, q] = pipe.points
      const mid = { x: (p.x + q.x) / 2, z: (p.z + q.z) / 2 }
      expect(decks.standAt(mid.x, mid.z, top - 1, climb)).toBeCloseTo(top)
      expect(walls.resolve(mid.x, mid.z, 0.3, top - 1)).toEqual(mid)
      const under = top - climb - 0.1
      expect(walls.resolve(mid.x, mid.z, 0.3, under)).not.toEqual(mid)
      expect(decks.standAt(mid.x, mid.z, under, climb)).toBeLessThan(top)
      // From the floor it is out of reach.
      expect(decks.standAt(mid.x, mid.z, floor, climb)).toBe(floor)
    }
  })

  it('lays a maze of pipes down every wall, level under level', () => {
    const cfg = CONFIG.castle.pipes
    const pipes = moatPipes(raw, place, floor, stairs)
    const walls = new Map<string, typeof pipes>()
    for (const pipe of pipes) {
      const key = `${pipe.wall.x},${pipe.wall.z}`
      walls.set(key, [...(walls.get(key) ?? []), pipe])
    }
    expect(walls.size).toBe(10)
    let first = 0
    let under = 0
    let levels = 0
    for (const maze of walls.values()) {
      const tops = [
        ...new Set(maze.map((p) => (p.points[0].y + p.radius).toFixed(6))),
      ]
        .map(Number)
        .sort((a, b) => b - a)
      // Levels, each a drop or more under the last, the lowest clear of
      // the floor.
      expect(tops.length).toBeGreaterThan(2)
      tops.slice(1).forEach((top, i) => {
        const gap = tops[i] - top
        // (A level may lie bare where the rim runs low, or every run on
        // it be missing, so a gap may span several.)
        expect(gap).toBeGreaterThanOrEqual(cfg.drop[0] - 1e-6)
      })
      expect(tops.at(-1)).toBeGreaterThanOrEqual(floor + cfg.floorClear)
      const on = (top: number) =>
        maze.filter(
          (p) => (p.points[0].y + p.radius).toFixed(6) === top.toFixed(6)
        ).length
      // Each level broken into runs in rows out from the wall, the first
      // thick, to catch a raider off the rim, the ones under it sparse
      // (counted over every wall, below).
      first += on(tops[0])
      under += tops.slice(1).reduce((sum, top) => sum + on(top), 0)
      levels += tops.length - 1
      for (const pipe of maze) {
        const [p] = pipe.points
        const out =
          (p.x - pipe.wall.x) * pipe.normal.x +
          (p.z - pipe.wall.z) * pipe.normal.z
        const rows = cfg.rows.map((row) => pipe.radius + 0.75 + row)
        // In a row, or out past a fire escape's rail.
        expect(
          rows.some((r) => Math.abs(r - out) < 1e-6) || out > rows[0]
        ).toBe(true)
        // Only the lowest level turns down to the floor.
        if (pipe.points.at(-1)?.y === floor) {
          expect(pipe.points[0].y + pipe.radius).toBeCloseTo(tops.at(-1) ?? 0)
        }
      }
    }
    // On the whole: the first level in runs, those under it with fewer
    // each, though they run the walls' whole height.
    expect(first).toBeGreaterThanOrEqual(walls.size * 2)
    expect(under / levels).toBeLessThan(first / walls.size)
  })

  it('catches a raider falling past a pipe, within reach of its top', () => {
    const deck = {
      a: { x: 0, z: 0, y: 10 },
      b: { x: 10, z: 0, y: 10 },
      width: 0.6,
    }
    const reach = 1.2
    // Dropping past its top over it, or within reach of its edge.
    expect(catchPipe([deck], { x: 4, z: 0.5 }, 10.3, 9.8, 10.3, reach)).toEqual(
      {
        x: 4,
        z: 0,
        y: 10,
      }
    )
    expect(
      catchPipe([deck], { x: 4, z: 1.4 }, 10.3, 9.8, 10.3, reach)
    ).not.toBeNull()
    // Too far off, not yet down to it, or already past it.
    expect(
      catchPipe([deck], { x: 4, z: 1.6 }, 10.3, 9.8, 10.3, reach)
    ).toBeNull()
    expect(
      catchPipe([deck], { x: 4, z: 0 }, 10.6, 10.2, 10.6, reach)
    ).toBeNull()
    expect(catchPipe([deck], { x: 4, z: 0 }, 9.9, 9.5, 9.9, reach)).toBeNull()
    // Never the pipe just stepped off, however the frames fall.
    expect(catchPipe([deck], { x: 4, z: 0 }, 10, 9.9, 10, reach)).toBeNull()
    expect(catchPipe([deck], { x: 4, z: 0 }, 10.02, 9.9, 10, reach)).toBeNull()
    // But one crossed in the first breath of a frame, in a fall from over
    // it, is caught.
    expect(
      catchPipe([deck], { x: 4, z: 0 }, 10.02, 9.8, 13, reach)
    ).not.toBeNull()
    // Off its end, by the round of the end.
    expect(catchPipe([deck], { x: 11, z: 0 }, 10.3, 9.8, 10.3, reach)).toEqual({
      x: 10,
      z: 0,
      y: 10,
    })
    // Of two dropped past in one frame, the higher.
    const lower = {
      ...deck,
      a: { ...deck.a, y: 9.9 },
      b: { ...deck.b, y: 9.9 },
    }
    expect(
      catchPipe([lower, deck], { x: 4, z: 0 }, 10.3, 9.5, 10.3, reach)?.y
    ).toBe(10)
  })

  it('catches most raiders who walk off the rim, hurt, not dead', () => {
    const pipes = moatPipes(raw, place, floor, stairs)
    const decks = pipes.flatMap(pipeDecks)
    const { gravity, lethal } = CONFIG.fall
    const { walkSpeed, sprintSpeed } = CONFIG.player
    // From every metre of the outer rim, straight out over the channel,
    // landing on a pipe, or a fire escape (ground), or the floor.
    const fall = (from: XZ, out: XZ, speed: number) => {
      let { x, z } = from
      const start = raw(x, z)
      let y = start
      let v = 0
      const dt = 1 / 60
      while (y > floor) {
        v += gravity * dt
        const next = y - v * dt
        x += out.x * speed * dt
        z += out.z * speed * dt
        const caught = inChannel(place, x, z)
          ? catchPipe(decks, { x, z }, y, next, start)
          : null
        if (caught) return start - caught.y
        const deck = ground.standAt(x, z, y, 0)
        if (deck > floor + 0.5 && deck >= next && deck <= y) return start - deck
        y = next
      }
      return start - floor
    }
    const outer = moatEdges(place).outer
    const falls = { walk: [] as number[], sprint: [] as number[] }
    outer.forEach((a, k) => {
      const b = outer[(k + 1) % outer.length]
      const len = Math.hypot(b.x - a.x, b.z - a.z)
      const u = { x: (b.x - a.x) / len, z: (b.z - a.z) / len }
      let out = { x: -u.z, z: u.x }
      const mid = { x: (a.x + b.x) / 2 - place.x, z: (a.z + b.z) / 2 - place.z }
      if (out.x * mid.x + out.z * mid.z > 0) out = { x: -out.x, z: -out.z }
      for (let d = 1; d < len - 1; d++) {
        const from = { x: a.x + u.x * d, z: a.z + u.z * d }
        falls.walk.push(fall(from, out, walkSpeed))
        falls.sprint.push(fall(from, out, sprintSpeed))
      }
    })
    const share = (h: number[], test: (x: number) => boolean) =>
      h.filter(test).length / h.length
    // Nine in ten walking off are caught short of a fatal fall, most of
    // them hurt by it.
    expect(share(falls.walk, (h) => h < lethal)).toBeGreaterThan(0.9)
    expect(share(falls.walk, (h) => h >= CONFIG.fall.safe)).toBeGreaterThan(0.5)
    // A sprint off sails out past most of them.
    expect(share(falls.sprint, (h) => h < lethal)).toBeLessThan(
      share(falls.walk, (h) => h < lethal)
    )
  })

  it('rails the far end of every landing, but lets the foot out at the floor', () => {
    const walls = new Walls()
    for (const stair of stairs) {
      for (const r of stair.rails) walls.addWall(r.a, r.b, r.half, r.band)
    }
    for (const stair of stairs) {
      for (const l of stair.landings) {
        // Just short of the far end, on the landing's middle.
        const t = l.far < 0 ? l.x0 + 0.1 : l.x1 - 0.1
        const p = { x: l.x + l.cos * t, z: l.z + l.sin * t }
        const out = walls.resolve(p.x, p.z, 0.3, l.y)
        const moved = Math.hypot(out.x - p.x, out.z - p.z)
        if (l.open) {
          expect(l.y).toBe(floor)
          expect(moved).toBe(0)
        } else {
          expect(moved).toBeGreaterThan(0.2)
        }
      }
      expect(stair.landings.filter((l) => l.open)).toHaveLength(1)
    }
  })

  it('makes no two fire escapes alike, their landings long and short', () => {
    const { vary, rise } = CONFIG.castle.stairs
    for (const stair of stairs) {
      const lengths = stair.landings.map((l) => l.x1 - l.x0)
      expect(new Set(lengths.map((x) => x.toFixed(1))).size).toBeGreaterThan(
        lengths.length / 2
      )
      for (const x of lengths) {
        expect(x).toBeGreaterThanOrEqual(vary.landing.min)
        expect(x).toBeLessThanOrEqual(vary.landing.max + 0.5)
      }
      // Every flight climbs more than a body steps onto, and about `rise`.
      for (const f of stair.flights) {
        expect(f.a.y - f.b.y).toBeGreaterThan(climb)
        expect(f.a.y - f.b.y).toBeLessThan(rise * 1.5)
      }
    }
    const [one, two] = stairs.map((s) =>
      s.landings.map((l) => (l.x1 - l.x0).toFixed(2)).join()
    )
    expect(one).not.toBe(two)
  })

  it('rails the lanes apart, so no one steps across onto another flight', () => {
    const walls = new Walls()
    for (const stair of stairs) {
      for (const r of stair.rails) walls.addWall(r.a, r.b, r.half, r.band)
    }
    for (const w of moatWalls(raw, place)) {
      walls.addWall(w.a, w.b, w.half, w.band)
    }
    const { radius } = CONFIG.player
    const lerp = (p: XZ, q: XZ, t: number) => ({
      x: p.x + (q.x - p.x) * t,
      z: p.z + (q.z - p.z) * t,
    })
    for (const stair of stairs) {
      stair.flights.forEach((f, i) => {
        const feet = (f.a.y + f.b.y) / 2
        // Halfway down, a step toward the other lane is pushed back.
        const mid = lerp(f.a, f.b, 0.5)
        const next = stair.flights[i + 1] ?? stair.flights[i - 1]
        const across = lerp(mid, lerp(next.a, next.b, 0.5), 0.5)
        const out = walls.resolve(across.x, across.z, radius, feet)
        expect(Math.hypot(out.x - across.x, out.z - across.z)).toBeGreaterThan(
          0.2
        )
        // Down the lane's middle, nothing stands in the way, nor round the
        // landing at its foot to the next flight's head.
        const path: XZ[] = [f.a, f.b]
        const after = stair.flights[i + 1]
        if (after) {
          // Halfway from the turn to the landing's railed far end.
          const l = stair.landings[i + 1]
          const axis = { x: l.cos, z: l.sin }
          const at = (f.b.x - l.x) * axis.x + (f.b.z - l.z) * axis.z
          const half = ((l.far < 0 ? l.x0 : l.x1) - at) / 2
          const by = { x: axis.x * half, z: axis.z * half }
          path.push({ x: f.b.x + by.x, z: f.b.z + by.z })
          path.push({ x: after.a.x + by.x, z: after.a.z + by.z }, after.a)
        }
        for (let k = 0; k < path.length - 1; k++) {
          for (let j = 0; j <= 20; j++) {
            const p = lerp(path[k], path[k + 1], j / 20)
            const y = k === 0 ? f.a.y + (f.b.y - f.a.y) * (j / 20) : f.b.y
            const q = walls.resolve(p.x, p.z, radius, y)
            expect(Math.hypot(q.x - p.x, q.z - p.z)).toBeLessThan(1e-9)
          }
        }
      })
    }
  })

  it('runs its pipes round the fire escapes, and they stop a raider', () => {
    const pipes = moatPipes(raw, place, floor, stairs)
    expect(pipes.length).toBeGreaterThan(10)
    expect(moatPipes(raw, place, floor, stairs)).toEqual(pipes)
    // Every stair's strip, from its wall out past its outer rail.
    const strip = (stair: (typeof stairs)[number], p: XZ) => {
      const [a, b] = stair.ends
      const len = Math.hypot(b.x - a.x, b.z - a.z)
      const t = ((p.x - a.x) * (b.x - a.x) + (p.z - a.z) * (b.z - a.z)) / len
      const s = (p.x - a.x) * stair.inward.x + (p.z - a.z) * stair.inward.z
      return t > -0.3 && t < len + 0.3 && s > -0.5 && s < stair.depth + 0.3
    }
    let detours = 0
    for (const pipe of pipes) {
      if (pipe.points.length > 3) detours++
      for (let i = 0; i < pipe.points.length - 1; i++) {
        const p = pipe.points[i]
        const q = pipe.points[i + 1]
        for (let j = 0; j <= 40; j++) {
          const at = {
            x: p.x + (q.x - p.x) * (j / 40),
            z: p.z + (q.z - p.z) * (j / 40),
          }
          for (const stair of stairs) expect(strip(stair, at)).toBe(false)
        }
      }
      // Between the floor and the rim, never in a raider's walk below.
      for (const p of pipe.points.slice(0, 2)) {
        expect(p.y).toBeGreaterThanOrEqual(floor + 3)
      }
    }
    expect(detours).toBeGreaterThan(0)
    // Nor do their brackets or junction boxes reach into a stair's strip,
    // though the pipes elsewhere keep them.
    let brackets = 0
    let junctions = 0
    for (const pipe of pipes) {
      const { brackets: held, junction } = pipeFittings(pipe, stairs)
      brackets += held.length
      for (const [p, q] of held) {
        for (let j = 0; j <= 20; j++) {
          const at = {
            x: p.x + (q.x - p.x) * (j / 20),
            z: p.z + (q.z - p.z) * (j / 20),
          }
          for (const stair of stairs) expect(strip(stair, at)).toBe(false)
        }
      }
      if (junction) {
        junctions++
        for (const stair of stairs) expect(strip(stair, junction)).toBe(false)
      }
    }
    expect(brackets).toBeGreaterThan(pipes.length)
    expect(junctions).toBeGreaterThan(0)
    // Without the stairs, some would have.
    const crossing = pipes.some((pipe) =>
      pipeFittings(pipe, []).brackets.some(([, q]) =>
        stairs.some((stair) => strip(stair, q))
      )
    )
    expect(crossing).toBe(true)
    // On any one wall, pipes run on one level or far enough apart that
    // one walking a pipe never steps up onto the one over it.
    pipes.forEach((one, i) => {
      for (const other of pipes.slice(i + 1)) {
        const sameWall =
          Math.abs(one.normal.x - other.normal.x) < 1e-9 &&
          Math.abs(one.normal.z - other.normal.z) < 1e-9
        if (!sameWall) continue
        // On one level, or a climb apart.
        const gap = Math.abs(
          one.points[0].y + one.radius - other.points[0].y - other.radius
        )
        if (gap > 1e-9) expect(gap).toBeGreaterThan(climb)
      }
    })
    // Every stretch stands for a head at its height; a drop to the floor
    // stands for feet on the floor, a stretch overhead does not.
    const walls = new Walls()
    for (const w of pipes.flatMap((pipe) => pipeWalls(pipe))) {
      walls.addWall(w.a, w.b, w.half, w.band)
    }
    for (const pipe of pipes) {
      const own = new Walls()
      for (const w of pipeWalls(pipe)) own.addWall(w.a, w.b, w.half, w.band)
      const [p, q] = pipe.points
      const mid = { x: (p.x + q.x) / 2, z: (p.z + q.z) / 2 }
      const at = (feet: number) => own.resolve(mid.x, mid.z, 0.3, feet)
      // Out of a step's reach under its top, a head meets it.
      expect(at(p.y + pipe.radius - climb - 0.1)).not.toEqual(mid)
      expect(at(floor)).toEqual(mid)
      const last = pipe.points.at(-1)
      if (last && last.y === floor) {
        const by = { x: last.x + 0.1, z: last.z }
        expect(walls.resolve(by.x, by.z, 0.3, floor)).not.toEqual(by)
      }
    }
  })

  it('stands a ledge at the rim for the channel alone, and walls the island', () => {
    const walls = moatWalls(raw, place)
    expect(walls).toHaveLength(10)
    const ledges = walls.filter((w) => w.band)
    expect(ledges).toHaveLength(5)
    for (const w of ledges) {
      expect(w.band?.high).toBeGreaterThan(floor)
      expect(w.band?.high).toBeLessThan(raw(w.a.x, w.a.z))
    }
  })

  it('stands the cranes on the rim, reaching over the channel', () => {
    const cranes = craneSpots(place)
    expect(cranes).toHaveLength(CONFIG.castle.cranes)
    for (const c of cranes) {
      expect(onMoatGrounds(place, c.x, c.z)).toBe(true)
      expect(inChannel(place, c.x, c.z)).toBe(false)
      expect(onIsland(place, c.x, c.z)).toBe(false)
      // Its jib, at its reach, ends over the island's edge or past it.
      const tip = {
        x: c.x + Math.cos(c.yaw) * c.reach,
        z: c.z + Math.sin(c.yaw) * c.reach,
      }
      expect(Math.hypot(tip.x - place.x, tip.z - place.z)).toBeLessThan(
        Math.hypot(c.x - place.x, c.z - place.z)
      )
    }
  })

  it('runs the trickle down the middle of the channel', () => {
    const line = trickle(place)
    expect(line).toHaveLength(5)
    for (const p of line) expect(inChannel(place, p.x, p.z)).toBe(true)
    expect(mazeToWorld(place, { x: 0, z: 0 })).toEqual({
      x: place.x,
      z: place.z,
    })
  })
})
