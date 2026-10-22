// Pure: Castle Entropy's moat, in its own frame (a MazePlace, as the corn
// maze and the Undercroft lie: moat-local metres from the island's middle,
// turned by `yaw`). An irregular pentagon: the island, and the outer edge
// the island's sides pushed out by CONFIG.castle.moat.width, so the
// channel runs the same width all round. It is cut into the terrain itself
// (`carve`): in the channel the ground is the moat's floor, `depth` under
// the lowest of the rim, and everywhere else it is the terrain, the island
// included, so everything that stands on the ground stands in the moat.
//
// Zig-zag fire escapes hang off the outer walls (`fireEscapes`): flight
// over flight in two lanes side by side, down one lane and back down the
// other, a landing across both at each end, so only Ground.standAt keeps
// feet on the flight they are on. The rim is open: walking off it is a fall (fall.ts).
// What stops a raider (`moatWalls`): a ledge along the outer edge that
// stands only for feet down in the channel, the island's edge, and each
// stair's rails, its foot open only at the floor. Cranes lean out over the
// channel from the rim (`craneSpots`) and a trickle of water runs down its
// middle (`trickle`). No three.js, no DOM.

import { CONFIG } from './config.ts'
import { pointInPolygon } from './coords.ts'
import { mazeToWorld, worldToMaze } from './maze.ts'
import { mulberry32 } from './rng.ts'
import { toWorld } from './store.ts'
import type { HeightAt, XZ } from './interfaces.ts'
import type { MazePlace } from './maze.ts'
import type { StoreOrigin } from './store.ts'
import type { Band } from './walls.ts'

type MoatConfig = typeof CONFIG.castle.moat
type StairConfig = typeof CONFIG.castle.stairs

// The two edges, moat-local, corner k of each across side k-1/k from the
// other's.
interface MoatShape {
  island: XZ[]
  outer: XZ[]
}

// The island's corners on an irregular pentagon, and the outer edge each
// side pushed out by the channel's width (mitred at the corners).
export function moatShape(cfg: MoatConfig = CONFIG.castle.moat): MoatShape {
  const rng = mulberry32(cfg.seed)
  rng()
  const island: XZ[] = []
  for (let k = 0; k < 5; k++) {
    const turn = (k / 5) * Math.PI * 2 + (rng() * 2 - 1) * cfg.twist
    const radius = cfg.island * (1 + (rng() * 2 - 1) * cfg.wobble)
    island.push({ x: Math.cos(turn) * radius, z: Math.sin(turn) * radius })
  }
  return { island, outer: inflate(island, cfg.width) }
}

// A convex polygon's sides each pushed `by` out, the corners where the
// pushed sides meet.
export function inflate(poly: readonly XZ[], by: number): XZ[] {
  const n = poly.length
  const normal = (k: number) => {
    const a = poly[k]
    const b = poly[(k + 1) % n]
    const len = Math.hypot(b.x - a.x, b.z - a.z) || 1
    // Counter-clockwise (x right, z down the page turns it clockwise on
    // screen; either way, outward is away from the middle).
    const nx = (b.z - a.z) / len
    const nz = -(b.x - a.x) / len
    const mid = { x: (a.x + b.x) / 2, z: (a.z + b.z) / 2 }
    const out = nx * mid.x + nz * mid.z >= 0 ? 1 : -1
    return { x: nx * out, z: nz * out }
  }
  const out: XZ[] = []
  for (let k = 0; k < n; k++) {
    const n0 = normal((k + n - 1) % n)
    const n1 = normal(k)
    // The corner moves along the bisector far enough that each side moves
    // `by` along its own normal.
    const bx = n0.x + n1.x
    const bz = n0.z + n1.z
    const dot = bx * n1.x + bz * n1.z || 1
    out.push({
      x: poly[k].x + (bx * by) / dot,
      z: poly[k].z + (bz * by) / dot,
    })
  }
  return out
}

export const MOAT: MoatShape = moatShape()

const ring = (poly: readonly XZ[]) =>
  poly.map((p) => [p.x, p.z] as [number, number])
const ISLAND_RING = ring(MOAT.island)
const OUTER_RING = ring(MOAT.outer)
// No point of the outer edge lies further than this from the middle.
const OUTER_REACH = Math.max(...MOAT.outer.map((p) => Math.hypot(p.x, p.z)))

// Where the moat lies: the island's middle at CONFIG.castle.at in the
// spawn station's frame, straight out its door past the donut field.
export function castlePlace(
  station: StoreOrigin,
  cfg = CONFIG.castle
): MazePlace {
  const [x, , z] = toWorld(station, [cfg.at.x, 0, cfg.at.z])
  return { x, z, yaw: cfg.yaw }
}

export function onIsland(place: MazePlace, x: number, z: number): boolean {
  const p = worldToMaze(place, { x, z })
  return pointInPolygon(p.x, p.z, ISLAND_RING)
}

// Whether (x, z) is in the channel, between the island and the outer edge.
export function inChannel(place: MazePlace, x: number, z: number): boolean {
  const dx = x - place.x
  const dz = z - place.z
  if (dx * dx + dz * dz > OUTER_REACH * OUTER_REACH) return false
  const p = worldToMaze(place, { x, z })
  return (
    pointInPolygon(p.x, p.z, OUTER_RING) &&
    !pointInPolygon(p.x, p.z, ISLAND_RING)
  )
}

// Whether (x, z) lies on the moat's grounds: inside the outer edge, or
// within `margin` of it (roughly: from the middle, the reach of the edge
// that way), for the trees, the poles and the pickups to keep off.
export function onMoatGrounds(
  place: MazePlace,
  x: number,
  z: number,
  margin = CONFIG.castle.moat.clear
): boolean {
  const dx = x - place.x
  const dz = z - place.z
  const far = OUTER_REACH + margin
  if (dx * dx + dz * dz > far * far) return false
  const p = worldToMaze(place, { x, z })
  if (pointInPolygon(p.x, p.z, OUTER_RING)) return true
  return MOAT.outer.some((a, k) => {
    const b = MOAT.outer[(k + 1) % MOAT.outer.length]
    return segmentDistance(p, a, b) <= margin
  })
}

function segmentDistance(p: XZ, a: XZ, b: XZ): number {
  const dx = b.x - a.x
  const dz = b.z - a.z
  const len2 = dx * dx + dz * dz || 1
  const t = Math.max(
    0,
    Math.min(1, ((p.x - a.x) * dx + (p.z - a.z) * dz) / len2)
  )
  return Math.hypot(p.x - (a.x + dx * t), p.z - (a.z + dz * t))
}

// Points along a closed polygon, about `every` metres apart.
function alongEdge(poly: readonly XZ[], every: number): XZ[] {
  const out: XZ[] = []
  poly.forEach((a, k) => {
    const b = poly[(k + 1) % poly.length]
    const steps = Math.max(
      1,
      Math.ceil(Math.hypot(b.x - a.x, b.z - a.z) / every)
    )
    for (let i = 0; i < steps; i++) {
      const t = i / steps
      out.push({ x: a.x + (b.x - a.x) * t, z: a.z + (b.z - a.z) * t })
    }
  })
  return out
}

// The moat's floor: `depth` under the lowest of the terrain along either
// edge, so every wall stands at least that tall.
export function moatFloor(
  raw: HeightAt,
  place: MazePlace,
  cfg: MoatConfig = CONFIG.castle.moat
): number {
  let lowest = Infinity
  for (const p of [...alongEdge(MOAT.outer, 3), ...alongEdge(MOAT.island, 3)]) {
    const w = mazeToWorld(place, p)
    lowest = Math.min(lowest, raw(w.x, w.z))
  }
  return lowest - cfg.depth
}

// The terrain with the moat cut into it: the floor in the channel, the
// terrain everywhere else.
export function carve(
  raw: HeightAt,
  place: MazePlace,
  floor: number
): HeightAt {
  return (x, z) => (inChannel(place, x, z) ? floor : raw(x, z))
}

// The lowest of the terrain along outer side k (from corner k to k + 1),
// in the world.
function rimOf(raw: HeightAt, place: MazePlace, k: number): number {
  const a = MOAT.outer[k]
  const b = MOAT.outer[(k + 1) % MOAT.outer.length]
  let lowest = Infinity
  for (const p of alongEdge([a, b], 2).slice(0, -1).concat([a, b])) {
    const w = mazeToWorld(place, p)
    lowest = Math.min(lowest, raw(w.x, w.z))
  }
  return lowest
}

// A wall as the moat registers it on Walls, in the world.
export interface MoatWall {
  a: XZ
  b: XZ
  half: number
  band?: Band
}

const WALL_HALF = 0.25
// How far a landing runs on over the flights' ends.
const LAP = 0.3

// A flight of a fire escape: from `a` down (or up) to `b`, each with the
// height of its tread, `width` across.
interface Flight {
  a: XZ & { y: number }
  b: XZ & { y: number }
}

// A landing: a flat floor, laid out like Ground.addFloor (along x0..x1 on
// (cos, sin) through (x, z), halfWidth either side), at `y`.
interface Landing {
  x: number
  z: number
  cos: number
  sin: number
  x0: number
  x1: number
  halfWidth: number
  y: number
}

// One fire escape, in the world: its flights from the top down, its
// landings (the top first), its rails, where it starts on the rim and
// where its foot lets out onto the floor, and the side and the wall's
// line it hangs from (for drawing the brackets).
export interface FireEscape {
  side: number
  flights: Flight[]
  landings: Landing[]
  rails: MoatWall[]
  top: XZ & { y: number }
  foot: XZ & { y: number }
  // One lane's width; the strip is two.
  width: number
  // Along the wall, the strip's two ends, and the wall's inward normal.
  ends: [XZ, XZ]
  inward: XZ
}

// The fire escapes on the outer sides CONFIG.castle.stairs.sides names:
// each a strip two lanes of `width` wide against the wall at the side's
// middle, `n` flights of about `rise` each, down the outer lane and back
// down the inner by turns (so a flight never lies right over the one
// before it), landings across both lanes at both ends, the top at the rim
// and the foot on the floor at the end the last flight comes down to.
export function fireEscapes(
  raw: HeightAt,
  place: MazePlace,
  floor: number,
  cfg: StairConfig = CONFIG.castle.stairs
): FireEscape[] {
  return cfg.sides.map((side) => fireEscape(raw, place, floor, side, cfg))
}

function fireEscape(
  raw: HeightAt,
  place: MazePlace,
  floor: number,
  side: number,
  cfg: StairConfig
): FireEscape {
  const n5 = MOAT.outer.length
  const a = MOAT.outer[side % n5]
  const b = MOAT.outer[(side + 1) % n5]
  const len = Math.hypot(b.x - a.x, b.z - a.z)
  const u = { x: (b.x - a.x) / len, z: (b.z - a.z) / len }
  // Inward, toward the island.
  const mid = { x: (a.x + b.x) / 2, z: (a.z + b.z) / 2 }
  let inward = { x: -u.z, z: u.x }
  if (inward.x * mid.x + inward.z * mid.z > 0) {
    inward = { x: -inward.x, z: -inward.z }
  }
  const run = cfg.rise / cfg.slope
  const half = run / 2 + cfg.landing
  const gap = 0.05
  // Out from the wall: the inner lane's middle, the outer's, the strip's.
  const inner = gap + cfg.width / 2
  const outer = gap + (cfg.width * 3) / 2
  const strip = gap + cfg.width
  // A landing runs from the wall itself out over both lanes.
  const deep = (gap + cfg.width * 2) / 2
  // Moat-local: t along the wall from the side's middle, s out from it.
  const local = (t: number, s: number): XZ => ({
    x: mid.x + u.x * t + inward.x * s,
    z: mid.z + u.z * t + inward.z * s,
  })
  const world = (t: number, s: number) => mazeToWorld(place, local(t, s))
  const endA = -half
  const endB = half
  const runA = -run / 2
  const runB = run / 2
  const head = world((endA + runA) / 2, 0)
  const topY = raw(head.x, head.z)
  // Where a raider steps onto it, on the rim behind the top landing.
  const rim = world((endA + runA) / 2, -0.6)
  const drop = Math.max(cfg.rise, topY - floor)
  const count = Math.max(1, Math.round(drop / cfg.rise))
  const step = drop / count
  const flights: Flight[] = []
  for (let i = 0; i < count; i++) {
    const from = i % 2 === 0 ? runA : runB
    const to = i % 2 === 0 ? runB : runA
    const lane = i % 2 === 0 ? outer : inner
    flights.push({
      a: { ...world(from, lane), y: topY - step * i },
      b: { ...world(to, lane), y: topY - step * (i + 1) },
    })
  }
  // The turn that carries landing-local +x along the wall.
  const along = mazeToWorld({ x: 0, z: 0, yaw: place.yaw }, u)
  const centre = world(0, deep)
  const landing = (end: 'a' | 'b', y: number): Landing => ({
    x: centre.x,
    z: centre.z,
    cos: along.x,
    sin: along.z,
    // A little over the flights' ends, so no seam opens between the lanes.
    x0: end === 'a' ? endA : runB - LAP,
    x1: end === 'a' ? runA + LAP : endB,
    halfWidth: deep,
    y,
  })
  const landings: Landing[] = [landing('a', topY)]
  for (let j = 1; j <= count; j++) {
    landings.push(landing((j - 1) % 2 === 0 ? 'b' : 'a', topY - step * j))
  }
  // The foot: the end the last flight comes down to, on the floor.
  const footEnd = (count - 1) % 2 === 0 ? endB : endA
  const rail = gap + cfg.width * 2 + 0.05
  const rails: MoatWall[] = [
    { a: world(endA, rail), b: world(endB, rail), half: 0.06 },
    {
      a: world(endA, 0),
      b: world(endA, rail),
      half: 0.06,
      ...(footEnd === endA ? { band: { low: floor + 1 } } : {}),
    },
    {
      a: world(endB, 0),
      b: world(endB, rail),
      half: 0.06,
      ...(footEnd === endB ? { band: { low: floor + 1 } } : {}),
    },
  ]
  const foot = world(footEnd + Math.sign(footEnd) * 1.5, strip)
  return {
    side,
    flights,
    landings,
    rails,
    top: { ...rim, y: raw(rim.x, rim.z) },
    foot: { ...foot, y: floor },
    width: cfg.width,
    ends: [world(endA, 0), world(endB, 0)],
    inward: mazeToWorld({ x: 0, z: 0, yaw: place.yaw }, inward),
  }
}

// What stops a raider at the moat: a ledge along each outer side that
// stands only for feet under its rim (down in the channel), and the
// island's edge for everyone. The fire escapes carry their own rails.
export function moatWalls(raw: HeightAt, place: MazePlace): MoatWall[] {
  const n = MOAT.outer.length
  const walls: MoatWall[] = []
  for (let k = 0; k < n; k++) {
    walls.push({
      a: mazeToWorld(place, MOAT.outer[k]),
      b: mazeToWorld(place, MOAT.outer[(k + 1) % n]),
      half: WALL_HALF,
      band: { high: rimOf(raw, place, k) - 1 },
    })
    walls.push({
      a: mazeToWorld(place, MOAT.island[k]),
      b: mazeToWorld(place, MOAT.island[(k + 1) % n]),
      half: WALL_HALF,
    })
  }
  return walls
}

// A crane on the rim: where its mast stands, the way its jib reaches (at
// the island), and how far it reaches.
export interface CraneSpot extends XZ {
  yaw: number
  reach: number
  seed: number
}

// The cranes on the outer corners (no fire escape hangs at a corner), the
// first corner left bare, each set back off the edge and leaning its jib
// out over the channel toward the island.
export function craneSpots(
  place: MazePlace,
  count = CONFIG.castle.cranes
): CraneSpot[] {
  const spots: CraneSpot[] = []
  const n = MOAT.outer.length
  for (let i = 0; i < Math.min(count, n - 1); i++) {
    const k = i + 1
    const o = MOAT.outer[k]
    const r = Math.hypot(o.x, o.z) || 1
    const back = 6
    const at = { x: o.x + (o.x / r) * back, z: o.z + (o.z / r) * back }
    const w = mazeToWorld(place, at)
    // Facing the middle, in the world (the heading of -at, turned).
    const yaw = Math.atan2(-at.z, -at.x) + place.yaw
    spots.push({
      x: w.x,
      z: w.z,
      yaw,
      reach: r + back - Math.hypot(MOAT.island[k].x, MOAT.island[k].z) + 4,
      seed: 0xc4a0 + k,
    })
  }
  return spots
}

// The trickle down the channel's middle, a closed line in the world.
export function trickle(place: MazePlace): XZ[] {
  return MOAT.island.map((p, k) =>
    mazeToWorld(place, {
      x: (p.x + MOAT.outer[k].x) / 2,
      z: (p.z + MOAT.outer[k].z) / 2,
    })
  )
}

// The two edges in the world, for drawing the walls and cutting the
// terrain's hole.
export function moatEdges(place: MazePlace): MoatShape {
  return {
    island: MOAT.island.map((p) => mazeToWorld(place, p)),
    outer: MOAT.outer.map((p) => mazeToWorld(place, p)),
  }
}
