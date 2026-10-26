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
// stair's rails, its foot open only at the floor, with a rail between its
// lanes so no one steps across onto the flight over or under theirs. Pipes
// run along the walls (`moatPipes`), out round any fire escape in their
// way: they stop a raider walking into one (`pipeWalls`), and are walked
// along by whoever gets up on one (`pipeDecks`). Cranes lean out over the channel from the
// rim (`craneSpots`) and a trickle of water runs down its middle
// (`trickle`). No three.js, no DOM.

import { CONFIG } from './config.ts'
import { pointInPolygon, projectOnSegment } from './coords.ts'
import { mazeToWorld, worldToMaze } from './maze.ts'
import { mulberry32 } from './rng.ts'
import { STORE_LAYOUT, toWorld } from './store.ts'
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

// The castle's place, and where the spawn Citgo's front door stands and
// the way straight out of it (station-local +x), in the world: the walk
// that finds Jericho and the payphone (castleyard.ts).
export interface CastlePlace extends MazePlace {
  door: XZ
  walk: XZ
}

// Where the moat lies: the island's middle at CONFIG.castle.at in the
// spawn station's frame, straight out its door past the donut field.
export function castlePlace(
  station: StoreOrigin,
  cfg = CONFIG.castle
): CastlePlace {
  const [x, , z] = toWorld(station, [cfg.at.x, 0, cfg.at.z])
  const [dx, , dz] = toWorld(station, [STORE_LAYOUT.front, 0, 0])
  return {
    x,
    z,
    yaw: cfg.yaw,
    door: { x: dx, z: dz },
    walk: { x: Math.cos(station.yaw), z: Math.sin(station.yaw) },
  }
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

// Whether (x, z) lies on the moat's grounds: inside the outer edge pushed
// out `margin` all round, its corners mitred as the yard's concrete is
// (castleyard.ts apronOf), for the trees, the poles and the pickups to keep
// off.
export function onMoatGrounds(
  place: MazePlace,
  x: number,
  z: number,
  margin = CONFIG.castle.moat.clear
): boolean {
  const ring = groundsRing(margin)
  const dx = x - place.x
  const dz = z - place.z
  if (dx * dx + dz * dz > ring.reach * ring.reach) return false
  const p = worldToMaze(place, { x, z })
  return pointInPolygon(p.x, p.z, ring.points)
}

// The grounds' outline at a margin, moat-local, and its furthest corner
// from the middle; worked out once a margin.
const GROUNDS = new Map<number, { points: [number, number][]; reach: number }>()
function groundsRing(margin: number) {
  let ring = GROUNDS.get(margin)
  if (!ring) {
    const out = inflate(MOAT.outer, margin)
    ring = {
      points: out.map((p) => [p.x, p.z] as [number, number]),
      reach: Math.max(...out.map((p) => Math.hypot(p.x, p.z))),
    }
    GROUNDS.set(margin, ring)
  }
  return ring
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
// (cos, sin) through (x, z), halfWidth either side), at `y`. `far` is the
// end away from the flights (-1 at x0, 1 at x1), railed unless `open`
// (the foot, where it lets out onto the floor).
interface Landing {
  x: number
  z: number
  cos: number
  sin: number
  x0: number
  x1: number
  halfWidth: number
  y: number
  far: -1 | 1
  open: boolean
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
  // How far the outer rail stands out from the wall.
  depth: number
  // Along the wall, the strip's two ends, and the wall's inward normal.
  ends: [XZ, XZ]
  inward: XZ
}

// The fire escapes on the outer sides CONFIG.castle.stairs.sides names:
// each a strip two lanes of `width` wide against the wall at the side's
// middle, flights of about `rise` each, down the outer lane and back down
// the inner by turns (so a flight never lies right over the one before
// it), landings across both lanes at each turn, the top at the rim and
// the foot on the floor at the end the last flight comes down to. No two
// are alike (`vary`): each turns a little further on or short of the
// last at its end, so its flights run longer or shorter (and climb as
// much more or less, all at one pitch), and its landings run on past the
// turn by more or less.
export function fireEscapes(
  raw: HeightAt,
  place: MazePlace,
  floor: number,
  cfg: StairConfig = CONFIG.castle.stairs
): FireEscape[] {
  return cfg.sides.map((side) => fireEscape(raw, place, floor, side, cfg))
}

// How far a lane's rail stands its band over and under the feet on the
// flight or landing it rails.
const RAIL_BAND = 1

function fireEscape(
  raw: HeightAt,
  place: MazePlace,
  floor: number,
  side: number,
  cfg: StairConfig
): FireEscape {
  const rng = mulberry32(cfg.seed + side * 0x9e37)
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
  const gap = 0.05
  // Out from the wall: the inner lane's middle, the outer's, the strip's
  // (where the lanes meet), and the outer rail.
  const inner = gap + cfg.width / 2
  const outer = gap + (cfg.width * 3) / 2
  const strip = gap + cfg.width
  const rail = gap + cfg.width * 2 + 0.05
  // A landing runs from the wall itself out over both lanes.
  const deep = (gap + cfg.width * 2) / 2
  // Moat-local: t along the wall from the side's middle, s out from it.
  const local = (t: number, s: number): XZ => ({
    x: mid.x + u.x * t + inward.x * s,
    z: mid.z + u.z * t + inward.z * s,
  })
  const world = (t: number, s: number) => mazeToWorld(place, local(t, s))
  const jitter = () => (rng() * 2 - 1) * cfg.vary.turn
  const landingLength = () =>
    cfg.vary.landing.min + rng() * (cfg.vary.landing.max - cfg.vary.landing.min)
  // The top landing, at the near end, on the rim.
  const turn0 = -run / 2 + jitter()
  const length0 = landingLength()
  const head = world(turn0 - length0 / 2, 0)
  const topY = raw(head.x, head.z)
  const drop = Math.max(cfg.rise, topY - floor)
  const count = Math.max(1, Math.round(drop / cfg.rise))
  // Where each flight turns: at the near end (-run / 2) for the even
  // ones, the far end for the odd, each jittered; and how far each
  // landing runs on past its turn.
  const turns = [turn0]
  const lengths = [length0]
  for (let j = 1; j <= count; j++) {
    turns.push((j % 2 === 0 ? -run / 2 : run / 2) + jitter())
    lengths.push(landingLength())
  }
  // Each flight climbs its share of the drop by how long it runs, so all
  // stand at one pitch.
  const runs = turns.slice(1).map((t, i) => Math.abs(t - turns[i]))
  const total = runs.reduce((sum, r) => sum + r, 0)
  const heights = [topY]
  runs.forEach((r, i) => heights.push(heights[i] - (drop * r) / total))
  heights[count] = floor
  const flights: Flight[] = []
  for (let i = 0; i < count; i++) {
    const lane = i % 2 === 0 ? outer : inner
    flights.push({
      a: { ...world(turns[i], lane), y: heights[i] },
      b: { ...world(turns[i + 1], lane), y: heights[i + 1] },
    })
  }
  // The turn that carries landing-local +x along the wall.
  const along = mazeToWorld({ x: 0, z: 0, yaw: place.yaw }, u)
  const centre = world(0, deep)
  const landings: Landing[] = turns.map((t, j) => {
    // The near end's landings run on toward -t, the far end's toward +t,
    // a little over the flights' ends so no seam opens between the lanes.
    const far = j % 2 === 0 ? -1 : 1
    return {
      x: centre.x,
      z: centre.z,
      cos: along.x,
      sin: along.z,
      x0: far < 0 ? t - lengths[j] : t - LAP,
      x1: far < 0 ? t + LAP : t + lengths[j],
      halfWidth: deep,
      y: heights[j],
      far,
      open: j === count,
    }
  })
  const x0 = Math.min(...landings.map((l) => l.x0))
  const x1 = Math.max(...landings.map((l) => l.x1))
  const band = (low: number, high: number) => ({
    low: low - RAIL_BAND,
    high: high + RAIL_BAND,
  })
  const rails: MoatWall[] = [
    // The outer rail, end to end, for everyone.
    { a: world(x0, rail), b: world(x1, rail), half: 0.06 },
    // Between the lanes, each flight's length, for the feet on it: the
    // landings turn round their ends.
    ...flights.map((f, i) => ({
      a: world(turns[i], strip),
      b: world(turns[i + 1], strip),
      half: 0.06,
      band: band(f.b.y, f.a.y),
    })),
    // Across each landing's far end, for the feet on it, but the foot's.
    ...landings
      .filter((l) => !l.open)
      .map((l) => {
        const t = l.far < 0 ? l.x0 : l.x1
        return {
          a: world(t, 0),
          b: world(t, rail),
          half: 0.06,
          band: band(l.y, l.y),
        }
      }),
  ]
  // The foot: past the last landing's far end, on the floor.
  const last = landings[count]
  const footAt = (last.far < 0 ? last.x0 : last.x1) + last.far * 1.5
  const foot = world(footAt, strip)
  // Where a raider steps onto it, on the rim behind the top landing.
  const rim = world(turn0 - length0 / 2, -0.6)
  return {
    side,
    flights,
    landings,
    rails,
    top: { ...rim, y: raw(rim.x, rim.z) },
    foot: { ...foot, y: floor },
    width: cfg.width,
    depth: rail,
    ends: [world(x0, 0), world(x1, 0)],
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

// A pipe along a wall of the moat, in the world: its bends from one end
// to the other, all at one height (the last may drop to the floor), how
// thick, which paint, where along its first stretch a valve wheel and a
// junction box sit (a share of it, or null), and the face's normal toward
// the channel.
export interface MoatPipe {
  points: (XZ & { y: number })[]
  radius: number
  grey: boolean
  valve: number | null
  junction: number | null
  normal: XZ
  // A point on the wall's line, for how far out each bend stands.
  wall: XZ
}

// How far a pipe keeps off a fire escape's ends and its outer rail, over
// its own radius, and how far its ends keep off the stair (so a drop to
// the floor never stands in the foot's way).
const PIPE_CLEAR = 0.4
const PIPE_END_CLEAR = 4
// How far a pipe's ends keep off the wall's corners, so pipes on two
// walls never cross where they meet.
const PIPE_CORNER = 3

// The pipes down the moat's walls, a maze of them on each side of each
// edge: levels from `CONFIG.castle.pipes.under` under the rim's lowest (a
// raider who walks off the rim lands on one, `catchPipe`) down by `drop`
// at a time, as far as `floorClear` over the floor, each level broken
// into runs `length` long with `gap`s between, each run in one of the
// `rows` out from the wall, a share `missing` (the first under the rim)
// or `sparse` (any under that). Clear of the corners. A run by a fire
// escape bends out past its outer rail and back.
export function moatPipes(
  raw: HeightAt,
  place: MazePlace,
  floor: number,
  stairs: readonly FireEscape[],
  cfg = CONFIG.castle.pipes
): MoatPipe[] {
  const rng = mulberry32(cfg.seed)
  const between = ([lo, hi]: readonly [number, number]) =>
    lo + rng() * (hi - lo)
  const edges = moatEdges(place)
  const pipes: MoatPipe[] = []
  const n = edges.outer.length
  for (let k = 0; k < n; k++) {
    for (const outer of [true, false]) {
      const edge = outer ? edges.outer : edges.island
      const a = edge[k]
      const b = edge[(k + 1) % n]
      const len = Math.hypot(b.x - a.x, b.z - a.z)
      const u = { x: (b.x - a.x) / len, z: (b.z - a.z) / len }
      // Toward the channel: in to the middle from the outer edge, out
      // from the island's.
      let normal = { x: -u.z, z: u.x }
      const toward =
        normal.x * ((a.x + b.x) / 2 - place.x) +
          normal.z * ((a.z + b.z) / 2 - place.z) <
        0
      if (toward !== outer) normal = { x: -normal.x, z: -normal.z }
      // The rim along the wall, and its lowest between two stretches.
      const rims = alongEdge([a, b], 2)
        .concat([b])
        .map((p) => ({
          d: (p.x - a.x) * u.x + (p.z - a.z) * u.z,
          y: raw(p.x, p.z),
        }))
      const highTop = Math.max(...rims.map((r) => r.y))
      const rimOver = (d0: number, d1: number) =>
        Math.min(
          ...rims.filter((r) => r.d >= d0 - 2 && r.d <= d1 + 2).map((r) => r.y)
        )
      // The stairs on this wall, as stretches along it.
      const along = (p: XZ) => (p.x - a.x) * u.x + (p.z - a.z) * u.z
      const busy = outer
        ? stairs
            .filter((s) => s.side % n === k)
            .map((s) => {
              const d = [along(s.ends[0]), along(s.ends[1])]
              return { from: Math.min(...d), to: Math.max(...d), s }
            })
            .sort((p, q) => p.from - q.from)
        : []
      const at = (d: number, out: number, y: number) => ({
        x: a.x + u.x * d + normal.x * out,
        z: a.z + u.z * d + normal.z * out,
        y,
      })
      const near = (d: number) =>
        busy.some(
          ({ from, to }) => d > from - PIPE_END_CLEAR && d < to + PIPE_END_CLEAR
        )
      // Where each level's tops run, from just under the rim's highest
      // down; a run is laid only where the rim over it stands `under` over
      // it, so wherever the rim runs, the first run under it is near.
      const tops: number[] = []
      for (
        let top = highTop - between(cfg.under);
        top >= floor + cfg.floorClear;
        top -= between(cfg.drop)
      ) {
        tops.push(top)
      }
      // Out from the wall where a run in the stretch a to b must stand to
      // clear a fire escape: past its outer rail, or nowhere in particular.
      const clearOf = (d0: number, d1: number, radius: number) =>
        busy
          .filter(({ from, to }) => {
            const clear = radius + PIPE_CLEAR
            return d1 > from - clear && d0 < to + clear
          })
          .map(({ from, to, s }) => {
            const clear = radius + PIPE_CLEAR
            return { from: from - clear, to: to + clear, out: s.depth + clear }
          })
      for (const top of tops) {
        // Each level broken into runs along the wall, each in a row out
        // from it, with gaps between and now and then one missing.
        for (
          let d0 = PIPE_CORNER + between(cfg.gap) / 2;
          d0 < len - PIPE_CORNER - 2;
        ) {
          const d1 = Math.min(d0 + between(cfg.length), len - PIPE_CORNER)
          const radius = between(cfg.radius)
          const row = cfg.rows[Math.floor(rng() * cfg.rows.length)]
          const grey = rng() < 0.5
          const valve = rng() < 0.6 ? rng() : null
          const junction = rng() < 0.5 ? rng() : null
          // The first run under the rim here is laid as a rule, to catch
          // a raider who walks off; any under it seldom.
          const over = tops[tops.indexOf(top) - 1]
          const first =
            over === undefined || rimOver(d0, d1) - over < cfg.under[0]
          const missing = rng() < (first ? cfg.missing : cfg.sparse)
          // Only the lowest level turns down to the floor, past nothing
          // under it, and never by a stair's foot.
          const drop = rng() < cfg.toFloor && top === tops.at(-1) && !near(d1)
          const next = d1 + between(cfg.gap)
          if (missing || d1 - d0 < 2 || rimOver(d0, d1) - top < cfg.under[0]) {
            d0 = next
            continue
          }
          const y = top - radius
          const base = radius + 0.75 + row
          // Round any fire escape in the way: out past its rail and back.
          const zones = clearOf(d0, d1, radius)
          const offAt = (d: number) =>
            Math.max(
              base,
              ...zones.filter((z) => d >= z.from && d <= z.to).map((z) => z.out)
            )
          const points = [at(d0, offAt(d0), y)]
          for (const zone of zones) {
            if (zone.out <= base) continue
            if (zone.from > d0) {
              points.push(at(zone.from, base, y), at(zone.from, zone.out, y))
            }
            if (zone.to < d1) {
              points.push(at(zone.to, zone.out, y), at(zone.to, base, y))
            }
          }
          points.push(at(d1, offAt(d1), y))
          if (drop) points.push(at(d1, offAt(d1), floor))
          pipes.push({ points, radius, grey, valve, junction, normal, wall: a })
          d0 = next
        }
      }
    }
  }
  return pipes
}

// The walls a pipe stands as: each stretch, and a drop to the floor, for
// any body whose head would meet it (feet within `body` under it) and too
// far under its top to step up onto it (more than `climb`, as Ground
// standAt climbs); nearer, a body steps up onto it (`pipeDecks`).
export function pipeWalls(
  pipe: MoatPipe,
  body = 2,
  climb = CONFIG.fall.climb
): MoatWall[] {
  const walls: MoatWall[] = []
  for (let i = 0; i < pipe.points.length - 1; i++) {
    const p = pipe.points[i]
    const q = pipe.points[i + 1]
    const top = Math.max(p.y, q.y) + pipe.radius
    const bottom = Math.min(p.y, q.y)
    walls.push({
      a: { x: p.x, z: p.z },
      b: { x: q.x, z: q.z },
      half: pipe.radius,
      band: { low: bottom - body, high: top - climb },
    })
  }
  return walls
}

// Whether a point lies in a fire escape's strip, from its wall out past its
// outer rail and on past its ends, by `pad` all round.
function onStair(stair: FireEscape, p: XZ, pad: number): boolean {
  const [a, b] = stair.ends
  const len = Math.hypot(b.x - a.x, b.z - a.z)
  const t = ((p.x - a.x) * (b.x - a.x) + (p.z - a.z) * (b.z - a.z)) / len
  const s = (p.x - a.x) * stair.inward.x + (p.z - a.z) * stair.inward.z
  return t > -pad && t < len + pad && s > -pad && s < stair.depth + pad
}

// How far a pipe's fittings keep off a fire escape's strip, and how big a
// junction box stands (along the wall, up it, out from it).
const FITTING_CLEAR = 0.5
export const JUNCTION = { wide: 1.2, high: 1.2, deep: 0.6 }

// What of a pipe reaches back to the wall: a bracket every `every` metres
// along each stretch that runs level at one distance out (from the pipe
// to the wall behind it), and the junction box on the wall over its first
// stretch at `junction` along it (where its middle stands). None stands
// in or over a fire escape's strip, so nothing reaches into its lanes: a
// stretch round one hangs from its bends.
export interface PipeFittings {
  brackets: [XZ & { y: number }, XZ & { y: number }][]
  junction: (XZ & { y: number }) | null
}

export function pipeFittings(
  pipe: MoatPipe,
  stairs: readonly FireEscape[],
  every = 4
): PipeFittings {
  const { normal, wall, points } = pipe
  const outOf = (p: XZ) => (p.x - wall.x) * normal.x + (p.z - wall.z) * normal.z
  const back = (p: XZ & { y: number }, out: number) => ({
    x: p.x - normal.x * out,
    z: p.z - normal.z * out,
    y: p.y,
  })
  const clear = (p: XZ, pad: number) =>
    !stairs.some((stair) => onStair(stair, p, pad))
  const lerp = (p: XZ & { y: number }, q: XZ & { y: number }, t: number) => ({
    x: p.x + (q.x - p.x) * t,
    z: p.z + (q.z - p.z) * t,
    y: p.y + (q.y - p.y) * t,
  })
  const brackets: PipeFittings['brackets'] = []
  for (let i = 0; i < points.length - 1; i++) {
    const p = points[i]
    const q = points[i + 1]
    const out = outOf(p)
    if (p.y !== q.y || Math.abs(out - outOf(q)) > 1e-3) continue
    const span = Math.hypot(q.x - p.x, q.z - p.z)
    if (span < 1e-3) continue
    for (let d = 0; d <= span; d += every) {
      const at = lerp(p, q, d / span)
      const to = back(at, out)
      if (!clear(at, FITTING_CLEAR) || !clear(to, FITTING_CLEAR)) continue
      brackets.push([at, to])
    }
  }
  let junction: PipeFittings['junction'] = null
  if (pipe.junction !== null) {
    // On the wall over the pipe, clear of the level over it.
    const at = lerp(points[0], points[1], pipe.junction)
    const box = back(at, outOf(at) - JUNCTION.deep / 2)
    box.y += 1.1
    if (clear(box, FITTING_CLEAR + JUNCTION.wide / 2)) junction = box
  }
  return { brackets, junction }
}

// How far a foot hangs over a pipe's sides and still stands on it.
const PIPE_FOOTING = 0.15

// What of a pipe is walked on: the top of each level stretch, a deck as
// wide as the pipe and a foot's hang either side (its ends round, so the
// bends join), for Ground.addRibbon.
export interface PipeDeck {
  a: XZ & { y: number }
  b: XZ & { y: number }
  width: number
}

export function pipeDecks(pipe: MoatPipe): PipeDeck[] {
  const decks: PipeDeck[] = []
  for (let i = 0; i < pipe.points.length - 1; i++) {
    const p = pipe.points[i]
    const q = pipe.points[i + 1]
    if (p.y !== q.y) continue
    const y = p.y + pipe.radius
    decks.push({
      a: { x: p.x, z: p.z, y },
      b: { x: q.x, z: q.z, y },
      width: pipe.radius * 2 + PIPE_FOOTING * 2,
    })
  }
  return decks
}

// A raider falling past a pipe catches it: of the decks whose top the
// feet dropped past this frame (from `from` down to `to`), the highest
// within `reach` of the deck's edge, and where on its middle they land;
// never the one they fell from (at `start`, where the fall began). Null when they fall past
// every one. Short of a fall's whole drift, so a raider who walks off the
// rim over a pipe may land on it, and one who sprints off sails past.
export function catchPipe(
  decks: readonly PipeDeck[],
  at: XZ,
  from: number,
  to: number,
  start = from,
  reach = CONFIG.fall.catchReach
): (XZ & { y: number }) | null {
  let best: (XZ & { y: number }) | null = null
  for (const { a, b, width } of decks) {
    const y = a.y
    if (y > from || y < to || y >= start - CATCH_LEAVE) continue
    if (best && y <= best.y) continue
    const p = projectOnSegment(at.x, at.z, a.x, a.z, b.x, b.z)
    if (p.dist > width / 2 + reach) continue
    best = { x: p.x, z: p.y, y }
  }
  return best
}

// Feet this little over a deck have only just left it: no catch.
const CATCH_LEAVE = 0.05

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

// The way a body walks a fire escape, from its top on the rim down to its
// foot on the floor: onto the top landing, down each flight from end to
// end, across each landing to the next lane, and off the open landing at
// the foot. Each point with the height of what is underfoot there, and
// straight between them, so a shadow walking it treads the decks a raider
// would (shadowclimb.ts).
export function stairPath(escape: FireEscape): (XZ & { y: number })[] {
  return [escape.top, ...escape.flights.flatMap((f) => [f.a, f.b]), escape.foot]
}
