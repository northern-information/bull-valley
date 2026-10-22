import { describe, expect, it } from 'vitest'
import { CONFIG } from '../../src/config.ts'
import { pointInPolygon } from '../../src/coords.ts'
import { Ground } from '../../src/ground.ts'
import { mazeToWorld } from '../../src/maze.ts'
import {
  aloft,
  carve,
  castlePlace,
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

  it('lets the foot out only at the floor', () => {
    const walls = new Walls()
    for (const stair of stairs) {
      for (const r of stair.rails) walls.addWall(r.a, r.b, r.half, r.band)
    }
    for (const stair of stairs) {
      const last = stair.flights.at(-1)
      if (!last) throw new Error('no flights')
      // From the last flight's foot out through its end: open on the
      // floor, closed a story up.
      const from = last.b
      const dx = stair.foot.x - from.x
      const dz = stair.foot.z - from.z
      const crossing = { x: from.x + dx * 0.55, z: from.z + dz * 0.55 }
      const low = walls.resolve(crossing.x, crossing.z, 0.3, floor)
      const high = walls.resolve(crossing.x, crossing.z, 0.3, floor + 3)
      expect(Math.hypot(low.x - crossing.x, low.z - crossing.z)).toBeLessThan(
        Math.hypot(high.x - crossing.x, high.z - crossing.z) + 1e-9
      )
    }
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
        const run = Math.hypot(f.b.x - f.a.x, f.b.z - f.a.z)
        const on = { x: (f.b.x - f.a.x) / run, z: (f.b.z - f.a.z) / run }
        const path: XZ[] = [f.a, f.b]
        const after = stair.flights[i + 1]
        if (after) {
          const turn = { x: f.b.x + on.x, z: f.b.z + on.z }
          path.push(turn, { x: after.a.x + on.x, z: after.a.z + on.z })
          path.push(after.a)
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
    // Every stretch stands for a head at its height; a drop to the floor
    // stands for feet on the floor, a stretch overhead does not.
    const walls = new Walls()
    for (const w of pipes.flatMap((pipe) => pipeWalls(pipe))) {
      walls.addWall(w.a, w.b, w.half, w.band)
    }
    for (const pipe of pipes) {
      const [p, q] = pipe.points
      const mid = { x: (p.x + q.x) / 2, z: (p.z + q.z) / 2 }
      const at = (feet: number) => walls.resolve(mid.x, mid.z, 0.3, feet)
      expect(at(p.y - 1)).not.toEqual(mid)
      expect(at(floor)).toEqual(mid)
      const last = pipe.points.at(-1)
      if (last && last.y === floor) {
        const by = { x: last.x + 0.1, z: last.z }
        expect(walls.resolve(by.x, by.z, 0.3, floor)).not.toEqual(by)
      }
    }
  })

  it('holds a raider up a fire escape out of reach of the floor', () => {
    const moat = { place, floor }
    const { aloft: over } = CONFIG.castle.moat
    for (const stair of stairs) {
      const f = stair.flights[0]
      expect(aloft(moat, f.a)).toBe(true)
      expect(aloft(moat, { ...stair.foot, y: floor })).toBe(false)
      expect(aloft(moat, { ...stair.foot, y: floor + over - 0.1 })).toBe(false)
      // On the rim, off the channel, they are on the ground.
      expect(aloft(moat, stair.top)).toBe(false)
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
