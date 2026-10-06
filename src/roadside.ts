// Pure: what stands beside the roads. Utility poles pace the named roads in
// lines, crossarms square to the road, so world.ts can string wire from one
// pole to the next; sodium streetlights stand at the junctions the bigger
// roads pass through, arms reaching back over the crossing. Every spot is
// seeded here, so world.ts places meshes and draws nothing at random. This
// module never touches three.js.

import { projectOnSegment, unitToWorld } from './coords.ts'
import { mulberry32, range } from './rng.ts'
import type { Metres, Road, RoadClass, XZ } from './interfaces.ts'
import type { Rng } from './rng.ts'

const ROADSIDE_SEED = 0x9013e5

// Carriageway widths in metres by class; world.ts draws the ribbons at
// these widths, and the poles and lamps stand clear of them.
const ROAD_WIDTH: Record<RoadClass, number> = {
  primary: 8,
  secondary: 7,
  tertiary: 6,
  residential: 5,
  unclassified: 5,
}

export function roadWidth(c: RoadClass): number {
  return ROAD_WIDTH[c]
}

export const ROADSIDE = {
  // Poles: a span every `spacing` metres, `offset` right of travel.
  poles: new Set<RoadClass>([
    'primary',
    'secondary',
    'tertiary',
    'residential',
    'unclassified',
  ]),
  spacing: 50,
  offset: 6.5,
  height: [8, 9.5] as const,
  // Radians either way off square to the road, and off plumb.
  yawJitter: 0.06,
  tilt: 0.03,
  // A junction a bigger road passes through gets a streetlight.
  lamps: new Set<RoadClass>(['primary', 'secondary', 'tertiary']),
  // Metres a lamp stands clear of a ribbon's edge, and the farthest it
  // stands from its junction.
  lampClear: 2,
  lampReach: 14,
  // Two junctions closer than this share one lamp.
  lampSpacing: 25,
  // Nothing stands within `junctionClear` of a junction's centre (lamps
  // excepted), within `roadClear` of a ribbon's edge, or within
  // `stationClear` of a fuel point (the lot and the store behind it).
  junctionClear: 16,
  roadClear: 1.5,
  stationClear: 40,
}

export interface PoleSpot extends XZ {
  // rotation.y that turns the pole's local +Z along the road; its
  // crossarm (local X) then spans across it.
  yaw: number
  tilt: number
  height: number
  // Consecutive poles of one line carry wire between them; a dropped pole
  // or a new road starts a new line.
  line: number
}

export interface LampSpot extends XZ {
  // rotation.y that points the lamp's local +X (its arm) at the junction.
  yaw: number
}

export interface Junction extends XZ {
  // Every road class that meets here.
  classes: Set<RoadClass>
  // Directions of the arms leaving the junction, radians on the x–z plane
  // (atan2(dz, dx)), one per distinct neighbouring vertex.
  arms: number[]
}

// A square-cell hash of points or segments, for "anything near here".
class Grid<T> {
  private readonly cell: number
  private readonly cells = new Map<string, T[]>()

  constructor(cell: number) {
    this.cell = cell
  }

  add(item: T, minX: number, minZ: number, maxX: number, maxZ: number) {
    const i0 = Math.floor(minX / this.cell)
    const i1 = Math.floor(maxX / this.cell)
    const j0 = Math.floor(minZ / this.cell)
    const j1 = Math.floor(maxZ / this.cell)
    for (let i = i0; i <= i1; i++) {
      for (let j = j0; j <= j1; j++) {
        const key = `${i},${j}`
        let list = this.cells.get(key)
        if (!list) {
          list = []
          this.cells.set(key, list)
        }
        list.push(item)
      }
    }
  }

  // Everything filed in a cell that touches the square of `r` around (x, z).
  near(x: number, z: number, r: number): Set<T> {
    const out = new Set<T>()
    const i0 = Math.floor((x - r) / this.cell)
    const i1 = Math.floor((x + r) / this.cell)
    const j0 = Math.floor((z - r) / this.cell)
    const j1 = Math.floor((z + r) / this.cell)
    for (let i = i0; i <= i1; i++) {
      for (let j = j0; j <= j1; j++) {
        for (const item of this.cells.get(`${i},${j}`) ?? []) out.add(item)
      }
    }
    return out
  }
}

interface Segment {
  a: XZ
  b: XZ
  half: number
}

// How far (x, z) stands outside the nearest ribbon edge, looking no
// farther than `within`; Infinity when no ribbon is that close.
function ribbonClearance(
  segments: Grid<Segment>,
  x: number,
  z: number,
  within: number
): number {
  let best = Infinity
  for (const s of segments.near(x, z, within)) {
    const d = projectOnSegment(x, z, s.a.x, s.a.z, s.b.x, s.b.z).dist - s.half
    if (d < best) best = d
  }
  return best
}

function indexRoads(roads: readonly Road[], metres: Metres): Grid<Segment> {
  const grid = new Grid<Segment>(50)
  for (const road of roads) {
    const half = roadWidth(road.c) / 2
    for (let i = 0; i < road.p.length - 1; i++) {
      const a = unitToWorld(road.p[i][0], road.p[i][1], metres)
      const b = unitToWorld(road.p[i + 1][0], road.p[i + 1][1], metres)
      grid.add(
        { a, b, half },
        Math.min(a.x, b.x) - half,
        Math.min(a.z, b.z) - half,
        Math.max(a.x, b.x) + half,
        Math.max(a.z, b.z) + half
      )
    }
  }
  return grid
}

function indexPoints(points: readonly XZ[], cell: number): Grid<XZ> {
  const grid = new Grid<XZ>(cell)
  for (const p of points) grid.add(p, p.x, p.z, p.x, p.z)
  return grid
}

function anyWithin(grid: Grid<XZ>, x: number, z: number, r: number): boolean {
  for (const p of grid.near(x, z, r)) {
    if (Math.hypot(p.x - x, p.z - z) < r) return true
  }
  return false
}

// Every vertex where three or more arms meet, across all the polylines.
// geo.json shares a junction's vertex between the roads that meet there
// (the same quantized unit point), as buildRoadGraph relies on; two
// polylines of one road that merely join end to end make two arms, not a
// junction.
export function findJunctions(
  roads: readonly Road[],
  metres: Metres
): Junction[] {
  const seen = new Map<string, { classes: Set<RoadClass>; next: Set<string> }>()
  const at = (k: string) => {
    let entry = seen.get(k)
    if (!entry) {
      entry = { classes: new Set(), next: new Set() }
      seen.set(k, entry)
    }
    return entry
  }
  for (const road of roads) {
    for (let i = 0; i < road.p.length; i++) {
      const entry = at(road.p[i].join())
      entry.classes.add(road.c)
      if (i > 0) entry.next.add(road.p[i - 1].join())
      if (i < road.p.length - 1) entry.next.add(road.p[i + 1].join())
    }
  }
  const junctions: Junction[] = []
  for (const [key, entry] of seen) {
    if (entry.next.size < 3) continue
    const [u, v] = key.split(',').map(Number)
    const here = unitToWorld(u, v, metres)
    const arms = [...entry.next].map((k) => {
      const [nu, nv] = k.split(',').map(Number)
      const there = unitToWorld(nu, nv, metres)
      return Math.atan2(there.z - here.z, there.x - here.x)
    })
    junctions.push({ ...here, classes: entry.classes, arms })
  }
  return junctions
}

export interface RoadsideOptions {
  // Places nothing stands near: the fuel points.
  avoid?: readonly XZ[]
  rng?: Rng
}

export interface Roadside {
  poles: PoleSpot[]
  lamps: LampSpot[]
}

export function placeRoadside(
  roads: readonly Road[],
  metres: Metres,
  { avoid = [], rng = mulberry32(ROADSIDE_SEED) }: RoadsideOptions = {}
): Roadside {
  const R = ROADSIDE
  const segments = indexRoads(roads, metres)
  const junctions = findJunctions(roads, metres)
  const junctionGrid = indexPoints(junctions, 50)
  const stations = indexPoints(avoid, 50)
  const clear = (x: number, z: number, need: number) =>
    !anyWithin(stations, x, z, R.stationClear) &&
    ribbonClearance(segments, x, z, need + 10) >= need

  // Lamps first: one per junction a bigger road passes through, on the
  // bisector of its widest gap between arms, far enough out to clear both
  // roads that bound the gap.
  const lamps: LampSpot[] = []
  const lampGrid = new Grid<XZ>(50)
  for (const j of junctions) {
    if (![...j.classes].some((c) => R.lamps.has(c))) continue
    if (anyWithin(lampGrid, j.x, j.z, R.lampSpacing)) continue
    const arms = [...j.arms].sort((a, b) => a - b)
    let gap = 0
    let from = 0
    for (let i = 0; i < arms.length; i++) {
      const next = i + 1 < arms.length ? arms[i + 1] : arms[0] + Math.PI * 2
      if (next - arms[i] > gap) {
        gap = next - arms[i]
        from = arms[i]
      }
    }
    const theta = from + gap / 2
    let widest = 0
    for (const c of j.classes) widest = Math.max(widest, roadWidth(c) / 2)
    const sin = Math.sin(Math.min(gap, Math.PI) / 2)
    const out = (widest + R.lampClear) / sin
    if (out > R.lampReach) continue
    const x = j.x + Math.cos(theta) * out
    const z = j.z + Math.sin(theta) * out
    if (!clear(x, z, R.lampClear)) continue
    const lamp = { x, z, yaw: Math.atan2(Math.sin(theta), -Math.cos(theta)) }
    lamps.push(lamp)
    lampGrid.add(lamp, x, z, x, z)
  }

  // Poles: walk each named road, one every `spacing` metres, right of
  // travel. A pole that would stand in a junction, on another road or on a
  // lot is dropped, and the line breaks there.
  const poles: PoleSpot[] = []
  let line = 0
  for (const road of roads) {
    if (!R.poles.has(road.c) || !road.n) continue
    line++
    let carry = rng() * R.spacing
    for (let i = 0; i < road.p.length - 1; i++) {
      const a = unitToWorld(road.p[i][0], road.p[i][1], metres)
      const b = unitToWorld(road.p[i + 1][0], road.p[i + 1][1], metres)
      const dx = b.x - a.x
      const dz = b.z - a.z
      const len = Math.hypot(dx, dz)
      if (len === 0) continue
      while (carry < len) {
        const t = carry / len
        const x = a.x + dx * t - (dz / len) * R.offset
        const z = a.z + dz * t + (dx / len) * R.offset
        carry += R.spacing
        // Every pole draws its jitter, kept or not, so one dropped pole
        // never reshuffles the rest.
        const yaw = Math.atan2(dx, dz) + range(rng, -R.yawJitter, R.yawJitter)
        const tilt = range(rng, -R.tilt, R.tilt)
        const height = range(rng, R.height[0], R.height[1])
        if (
          anyWithin(junctionGrid, x, z, R.junctionClear) ||
          anyWithin(lampGrid, x, z, R.junctionClear) ||
          !clear(x, z, R.roadClear)
        ) {
          line++
          continue
        }
        poles.push({ x, z, yaw, tilt, height, line })
      }
      carry -= len
    }
  }
  return { poles, lamps }
}
