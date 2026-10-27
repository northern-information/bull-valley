// Pure: the valley's traffic. Through traffic, a few cars and semis a
// minute on the bigger roads, coming in at one edge of the survey and
// leaving at another. Nothing about it is kept or sent: every route is laid
// once from the roads (`buildTraffic`), and where every car on it is
// follows from the valley's clock alone (`carsNear`), so every client sees
// the same car in the same place and nothing works out a car no one is
// near. The valley never knows the roads (marx.ts): a client tells it where
// the lamps of the cars round it stand (shadowstep.ts seeTraffic), and a
// raider a car runs down says so, as a fall is said (sharedworld.ts rule
// 24, `run-over`). No three.js.

import { CONFIG } from './config.ts'
import { mulberry32 } from './rng.ts'
import { roadWidth } from './roadside.ts'
import { headlightBeam, taillightBeam } from './shadowmen.ts'
import type { Metres, RoadClass, XZ } from './interfaces.ts'
import type { RoadGraph } from './roadgraph.ts'
import type { Beam, TruckPose } from './shadowmen.ts'

export const VEHICLE_KINDS = ['jeep', 'bmw', 'pickup', 'semi'] as const
export type VehicleKind = (typeof VEHICLE_KINDS)[number]

export type TrafficConfig = typeof CONFIG.traffic

export function isVehicleKind(value: unknown): value is VehicleKind {
  return (
    typeof value === 'string' &&
    (VEHICLE_KINDS as readonly string[]).includes(value)
  )
}

// The most lamps one traffic frame may carry: a tractor and its trailer
// each count.
export const TRAFFIC_LAMPS_MAX = 16

// A speed a hit may claim, m/s: far more than any car drives.
export const VEHICLE_SPEED_MAX = 60

export function isVehicleSpeed(value: unknown): value is number {
  return (
    typeof value === 'number' &&
    Number.isFinite(value) &&
    value > 0 &&
    value <= VEHICLE_SPEED_MAX
  )
}

// One direction of one route: its lane down the roads, with the arc
// length, the speed and the seconds from its start at each point, its
// bounds, and the cars' timetable (one every `headway` seconds, from
// `phase`).
export interface TrafficRoute {
  points: XZ[]
  cum: number[]
  speeds: number[]
  times: number[]
  seconds: number
  phase: number
  headway: number
  seed: number
  min: XZ
  max: XZ
}

export interface Traffic {
  routes: TrafficRoute[]
}

// A car where the clock has it. Its middle, facing `heading` (x by its
// sine, z by its cosine, as a TruckPose), m/s; a semi's trailer behind it
// on its own heading. `seed` deals its looks (trafficmodels.ts).
export interface Car {
  id: string
  kind: VehicleKind
  seed: number
  x: number
  z: number
  heading: number
  speed: number
  trailer: { x: number; z: number; heading: number } | null
}

// --- Laying the routes ----------------------------------------------------

// A small binary heap of node indices by cost, for Dijkstra.
function shortest(
  graph: RoadGraph,
  from: number,
  cost: readonly number[]
): { dist: Float64Array; via: Int32Array } {
  const n = graph.nodes.length
  const dist = new Float64Array(n).fill(Infinity)
  const via = new Int32Array(n).fill(-1)
  const heap: number[] = []
  const push = (node: number) => {
    heap.push(node)
    let i = heap.length - 1
    while (i > 0) {
      const up = (i - 1) >> 1
      if (dist[heap[up]] <= dist[heap[i]]) break
      ;[heap[up], heap[i]] = [heap[i], heap[up]]
      i = up
    }
  }
  const pop = (): number => {
    const top = heap[0]
    const last = heap.pop() as number
    if (heap.length) {
      heap[0] = last
      let i = 0
      for (;;) {
        const l = i * 2 + 1
        const r = l + 1
        let m = i
        if (l < heap.length && dist[heap[l]] < dist[heap[m]]) m = l
        if (r < heap.length && dist[heap[r]] < dist[heap[m]]) m = r
        if (m === i) break
        ;[heap[m], heap[i]] = [heap[i], heap[m]]
        i = m
      }
    }
    return top
  }
  dist[from] = 0
  push(from)
  const done = new Uint8Array(n)
  while (heap.length) {
    const node = pop()
    if (done[node]) continue
    done[node] = 1
    for (const e of graph.adjacency[node]) {
      const edge = graph.edges[e]
      const next = edge.a === node ? edge.b : edge.a
      const d = dist[node] + cost[e]
      if (d < dist[next]) {
        dist[next] = d
        via[next] = e
        push(next)
      }
    }
  }
  return { dist, via }
}

// The road ends at the survey's edge: the ways in and out of the valley.
export function exitsOf(
  graph: RoadGraph,
  metres: Metres,
  cfg: TrafficConfig = CONFIG.traffic
): number[] {
  const hw = metres.width / 2 - cfg.exitMargin
  const hh = metres.height / 2 - cfg.exitMargin
  const exits: number[] = []
  graph.nodes.forEach((p, i) => {
    if (graph.adjacency[i].length !== 1) return
    if (Math.abs(p.x) >= hw || Math.abs(p.z) >= hh) exits.push(i)
  })
  return exits
}

// The edges from `from` to `to` in order, by the `via` of a search from
// `from`.
function pathEdges(
  graph: RoadGraph,
  via: Int32Array,
  from: number,
  to: number
): number[] {
  const edges: number[] = []
  let node = to
  while (node !== from) {
    const e = via[node]
    if (e < 0) return []
    edges.unshift(e)
    const edge = graph.edges[e]
    node = edge.a === node ? edge.b : edge.a
  }
  return edges
}

// The routes between exits that together carry the most of the bigger
// roads: each the cheapest way between its two exits, chosen greedily by
// how much of the bigger roads it carries that none chosen yet does.
export function chooseRoutes(
  graph: RoadGraph,
  exits: readonly number[],
  cfg: TrafficConfig = CONFIG.traffic
): { from: number; edges: number[]; share: number }[] {
  const main = new Set<RoadClass>(cfg.main)
  const cost = graph.edges.map((e) => e.length * cfg.weight[e.c])
  const searches = exits.map((x) => shortest(graph, x, cost))
  const pairs: { from: number; edges: number[] }[] = []
  for (let i = 0; i < exits.length; i++) {
    for (let j = i + 1; j < exits.length; j++) {
      if (!Number.isFinite(searches[i].dist[exits[j]])) continue
      const edges = pathEdges(graph, searches[i].via, exits[i], exits[j])
      if (edges.length) pairs.push({ from: exits[i], edges })
    }
  }
  const carried = new Uint8Array(graph.edges.length)
  const chosen: { from: number; edges: number[] }[] = []
  while (chosen.length < cfg.maxRoutes) {
    let best = -1
    let bestGain = 0
    pairs.forEach((pair, k) => {
      let gain = 0
      for (const e of pair.edges) {
        if (!carried[e] && main.has(graph.edges[e].c))
          gain += graph.edges[e].length
      }
      if (gain > bestGain) {
        bestGain = gain
        best = k
      }
    })
    if (best < 0 || bestGain < cfg.minGain) break
    const pair = pairs[best]
    for (const e of pair.edges) carried[e] = 1
    chosen.push(pair)
  }
  // Where routes share a road, each sends its cars the less often, so a
  // road many carry is no busier than one only one does: by how many
  // carry its bigger roads, on average down its length.
  const sharing = new Uint16Array(graph.edges.length)
  for (const pair of chosen) for (const e of pair.edges) sharing[e]++
  return chosen.map((pair) => {
    let length = 0
    let shared = 0
    for (const e of pair.edges) {
      if (!main.has(graph.edges[e].c)) continue
      length += graph.edges[e].length
      shared += graph.edges[e].length * sharing[e]
    }
    return { ...pair, share: length > 0 ? shared / length : 1 }
  })
}

// The road's points down `edges` from node `from`, with each segment's
// class.
function trace(
  graph: RoadGraph,
  from: number,
  edges: readonly number[]
): { points: XZ[]; classes: RoadClass[] } {
  const points: XZ[] = []
  const classes: RoadClass[] = []
  let node = from
  for (const e of edges) {
    const edge = graph.edges[e]
    const pts = edge.a === node ? edge.points : [...edge.points].reverse()
    for (const p of pts) {
      const last = points[points.length - 1]
      if (last && Math.hypot(p.x - last.x, p.z - last.z) < 0.05) continue
      if (points.length) classes.push(edge.c)
      points.push({ x: p.x, z: p.z })
    }
    node = edge.a === node ? edge.b : edge.a
  }
  return { points, classes }
}

// The lane: the road's points moved a quarter of its width to the right
// of travel, mitred at each bend.
export function laneOf(
  points: readonly XZ[],
  classes: readonly RoadClass[]
): XZ[] {
  const n = points.length
  const right = (k: number): XZ => {
    const a = points[k]
    const b = points[k + 1]
    const len = Math.hypot(b.x - a.x, b.z - a.z) || 1
    return { x: -(b.z - a.z) / len, z: (b.x - a.x) / len }
  }
  return points.map((p, k) => {
    const before = k > 0 ? right(k - 1) : right(0)
    const after = k < n - 1 ? right(k) : right(n - 2)
    const mx = before.x + after.x
    const mz = before.z + after.z
    const len = Math.hypot(mx, mz) || 1
    const m = { x: mx / len, z: mz / len }
    const scale = 1 / Math.max(0.5, m.x * before.x + m.z * before.z)
    const lane =
      (roadWidth(classes[Math.max(0, k - 1)]) +
        roadWidth(classes[Math.min(classes.length - 1, k)])) /
      8
    return { x: p.x + m.x * lane * scale, z: p.z + m.z * lane * scale }
  })
}

// The speed at each point: each class's own, slowed for the bends, eased
// up at accel and down at brake.
export function speedsOf(
  points: readonly XZ[],
  classes: readonly RoadClass[],
  cfg: TrafficConfig = CONFIG.traffic
): number[] {
  const n = points.length
  const seg = (k: number) =>
    Math.hypot(points[k + 1].x - points[k].x, points[k + 1].z - points[k].z)
  const v = points.map((_, k) => {
    const a = classes[Math.max(0, k - 1)]
    const b = classes[Math.min(classes.length - 1, k)]
    let limit = Math.min(cfg.speed[a], cfg.speed[b])
    if (k > 0 && k < n - 1) {
      const p = points[k - 1]
      const q = points[k]
      const r = points[k + 1]
      const ax = q.x - p.x
      const az = q.z - p.z
      const bx = r.x - q.x
      const bz = r.z - q.z
      const cos =
        (ax * bx + az * bz) / (Math.hypot(ax, az) * Math.hypot(bx, bz) || 1)
      const turn = Math.acos(Math.max(-1, Math.min(1, cos)))
      if (turn > 0.01) {
        const radius = Math.min(seg(k - 1), seg(k)) / 2 / Math.tan(turn / 2)
        limit = Math.min(
          limit,
          Math.max(cfg.minSpeed, Math.sqrt(cfg.lateral * radius))
        )
      }
    }
    return limit
  })
  for (let k = 1; k < n; k++) {
    v[k] = Math.min(v[k], Math.sqrt(v[k - 1] ** 2 + 2 * cfg.accel * seg(k - 1)))
  }
  for (let k = n - 2; k >= 0; k--) {
    v[k] = Math.min(v[k], Math.sqrt(v[k + 1] ** 2 + 2 * cfg.brake * seg(k)))
  }
  return v
}

// One direction of a route, ready to drive: a car every `share` times the
// headway.
export function routeOf(
  points: readonly XZ[],
  classes: readonly RoadClass[],
  seed: number,
  share = 1,
  cfg: TrafficConfig = CONFIG.traffic
): TrafficRoute {
  const lane = laneOf(points, classes)
  const speeds = speedsOf(lane, classes, cfg)
  const cum = [0]
  const times = [0]
  const min = { x: Infinity, z: Infinity }
  const max = { x: -Infinity, z: -Infinity }
  lane.forEach((p, k) => {
    min.x = Math.min(min.x, p.x)
    min.z = Math.min(min.z, p.z)
    max.x = Math.max(max.x, p.x)
    max.z = Math.max(max.z, p.z)
    if (k === 0) return
    const d = Math.hypot(p.x - lane[k - 1].x, p.z - lane[k - 1].z)
    cum.push(cum[k - 1] + d)
    times.push(times[k - 1] + (2 * d) / (speeds[k - 1] + speeds[k]))
  })
  const rng = mulberry32(seed)
  return {
    points: lane,
    cum,
    speeds,
    times,
    seconds: times[times.length - 1],
    phase: rng() * cfg.headway * share,
    headway: cfg.headway * share,
    seed,
    min,
    max,
  }
}

// The valley's traffic, laid once from the roads: both directions of
// every route chooseRoutes picks.
export function buildTraffic(
  graph: RoadGraph,
  metres: Metres,
  cfg: TrafficConfig = CONFIG.traffic
): Traffic {
  const routes: TrafficRoute[] = []
  chooseRoutes(graph, exitsOf(graph, metres, cfg), cfg).forEach((pair, i) => {
    const { points, classes } = trace(graph, pair.from, pair.edges)
    if (points.length < 2) return
    const back = [...points].reverse()
    const backClasses = [...classes].reverse()
    routes.push(routeOf(points, classes, 0x7a0f1c + i * 2, pair.share, cfg))
    routes.push(routeOf(back, backClasses, 0x7a0f1d + i * 2, pair.share, cfg))
  })
  return { routes }
}

// --- Driving them ---------------------------------------------------------

// The first index k with values[k] <= at < values[k + 1].
function search(values: readonly number[], at: number): number {
  let lo = 0
  let hi = values.length - 2
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1
    if (values[mid] <= at) lo = mid
    else hi = mid - 1
  }
  return lo
}

// Where on the lane `s` metres in lies, carried on straight past either
// end.
export function pointAt(route: TrafficRoute, s: number): XZ {
  const { points, cum } = route
  const k = search(cum, Math.max(0, Math.min(s, cum[cum.length - 1])))
  const a = points[k]
  const b = points[k + 1]
  const span = cum[k + 1] - cum[k] || 1
  const t = (s - cum[k]) / span
  return { x: a.x + (b.x - a.x) * t, z: a.z + (b.z - a.z) * t }
}

// How far down the lane a car is `seconds` after it came in, and how fast:
// each stretch at an even change of speed.
export function travelAt(
  route: TrafficRoute,
  seconds: number
): { s: number; speed: number } {
  const { times, cum, speeds } = route
  const at = Math.max(0, Math.min(seconds, route.seconds))
  const k = search(times, at)
  const d = cum[k + 1] - cum[k]
  const v0 = speeds[k]
  const v1 = speeds[k + 1]
  const u = at - times[k]
  const a = d > 0 ? (v1 * v1 - v0 * v0) / (2 * d) : 0
  return {
    s: cum[k] + Math.min(d, v0 * u + 0.5 * a * u * u),
    speed: Math.max(0, v0 + a * u),
  }
}

const headingOf = (from: XZ, to: XZ) => Math.atan2(to.x - from.x, to.z - from.z)

// How far either way a car looks down its lane for its heading, so a bend
// turns it rather than snapping it round.
const LOOK = 2.5

// Car `m` of a route: when it comes in, and what it is.
function carOf(
  route: TrafficRoute,
  m: number,
  cfg: TrafficConfig
): { start: number; kind: VehicleKind; seed: number } {
  const rng = mulberry32((route.seed * 31 + m * 2654435761) >>> 0)
  const start = route.phase + (m + rng() * cfg.jitter) * route.headway
  let roll = rng() * VEHICLE_KINDS.reduce((n, k) => n + cfg.weights[k], 0)
  let kind: VehicleKind = VEHICLE_KINDS[0]
  for (const k of VEHICLE_KINDS) {
    roll -= cfg.weights[k]
    kind = k
    if (roll < 0) break
  }
  return { start, kind, seed: Math.floor(rng() * 2 ** 31) }
}

// The car `seconds` into its route.
export function placeCar(
  route: TrafficRoute,
  id: string,
  kind: VehicleKind,
  seed: number,
  seconds: number,
  cfg: TrafficConfig = CONFIG.traffic
): Car {
  const { s, speed } = travelAt(route, seconds)
  const at = pointAt(route, s)
  const heading = headingOf(pointAt(route, s - LOOK), pointAt(route, s + LOOK))
  let trailer: Car['trailer'] = null
  if (kind === 'semi') {
    const { kingpin, trailer: length, overhang } = cfg.semi
    const pin = pointAt(route, s - kingpin)
    const back = pointAt(route, s - kingpin - length + overhang)
    const len = Math.hypot(pin.x - back.x, pin.z - back.z) || 1
    const dx = (pin.x - back.x) / len
    const dz = (pin.z - back.z) / len
    const middle = length / 2 - overhang
    trailer = {
      x: pin.x - dx * middle,
      z: pin.z - dz * middle,
      heading: Math.atan2(dx, dz),
    }
  }
  return { id, kind, seed, x: at.x, z: at.z, heading, speed, trailer }
}

// Every car within `radius` of `at` at `seconds` on the valley's clock.
// A route whose bounds lie further off is never looked at, and of the
// rest only the cars on the road now are.
export function carsNear(
  traffic: Traffic,
  seconds: number,
  at: XZ,
  radius: number,
  cfg: TrafficConfig = CONFIG.traffic
): Car[] {
  const cars: Car[] = []
  traffic.routes.forEach((route, r) => {
    if (
      at.x < route.min.x - radius ||
      at.x > route.max.x + radius ||
      at.z < route.min.z - radius ||
      at.z > route.max.z + radius
    ) {
      return
    }
    const first = Math.floor(
      (seconds - route.seconds - route.phase) / route.headway - cfg.jitter
    )
    const last = Math.floor((seconds - route.phase) / route.headway)
    for (let m = first; m <= last; m++) {
      const car = carOf(route, m, cfg)
      const on = seconds - car.start
      if (on < 0 || on >= route.seconds) continue
      const placed = placeCar(route, `${r}.${m}`, car.kind, car.seed, on, cfg)
      if (Math.hypot(placed.x - at.x, placed.z - at.z) <= radius) {
        cars.push(placed)
      }
    }
  })
  return cars
}

// --- Hits -----------------------------------------------------------------

// Whether `p` lies within `pad` of a box `length` by `width` swept from
// (fromX, fromZ) to (x, z) down `heading`: the box where it stands now,
// and everywhere it passed since, so a long frame never lets a car jump
// through a raider. From where it stands, the sweep is the box alone.
function inSweep(
  p: XZ,
  fromX: number,
  fromZ: number,
  x: number,
  z: number,
  heading: number,
  length: number,
  width: number,
  pad: number
): boolean {
  const fx = Math.sin(heading)
  const fz = Math.cos(heading)
  const local = (cx: number, cz: number) => {
    const dx = p.x - cx
    const dz = p.z - cz
    return { along: dx * fx + dz * fz, across: -dx * fz + dz * fx }
  }
  const now = local(x, z)
  const was = local(fromX, fromZ)
  const reach = length / 2 + pad
  return (
    Math.abs(now.across) <= width / 2 + pad &&
    Math.min(now.along, was.along) <= reach &&
    Math.max(now.along, was.along) >= -reach
  )
}

// The first car moving fast enough to hurt with a raider's feet (radius
// `pad`) under it, or passed over them since `before` (the same cars a
// frame ago, by id): the tractor or a semi's trailer.
export function struckBy(
  cars: readonly Car[],
  feet: XZ,
  pad: number,
  before: ReadonlyMap<string, Car> = new Map(),
  cfg: TrafficConfig = CONFIG.traffic
): Car | null {
  for (const car of cars) {
    if (car.speed < cfg.minHitSpeed) continue
    const { length, width } = cfg.vehicles[car.kind]
    const was = before.get(car.id) ?? car
    const { x, z, heading } = car
    if (inSweep(feet, was.x, was.z, x, z, heading, length, width, pad)) {
      return car
    }
    const t = car.trailer
    const wt = was.trailer ?? t
    if (
      t &&
      wt &&
      inSweep(
        feet,
        wt.x,
        wt.z,
        t.x,
        t.z,
        t.heading,
        cfg.semi.trailer,
        width,
        pad
      )
    ) {
      return car
    }
  }
  return null
}

// What a hit by `kind` at `speed` m/s takes off a raider whole at `max`,
// in whole points: the kind's share at fullSpeed, less as it goes slower,
// never under one point.
export function vehicleDamage(
  kind: VehicleKind,
  speed: number,
  max: number,
  cfg: TrafficConfig = CONFIG.traffic
): number {
  const pace = Math.max(0, Math.min(1, speed / cfg.fullSpeed))
  return Math.max(1, Math.round(max * cfg.hit[kind] * pace))
}

// Where a hit throws a raider at `feet`: the car's way, and off to the side
// of it they stood on, m/s.
export function throwOf(
  car: Car,
  feet: XZ,
  cfg: TrafficConfig = CONFIG.traffic
): { x: number; z: number; up: number } {
  const fx = Math.sin(car.heading)
  const fz = Math.cos(car.heading)
  const side = -(feet.x - car.x) * fz + (feet.z - car.z) * fx >= 0 ? 1 : -1
  const x = fx + -fz * side * 0.8
  const z = fz + fx * side * 0.8
  const len = Math.hypot(x, z) || 1
  return {
    x: (x / len) * cfg.throwSpeed,
    z: (z / len) * cfg.throwSpeed,
    up: cfg.throwUp,
  }
}

// --- Lamps ----------------------------------------------------------------

// What a lamp belongs to: a vehicle, or a semi's trailer, whose tail
// carries the semi's taillights.
export const LAMP_KINDS = [...VEHICLE_KINDS, 'trailer'] as const
export type LampKind = (typeof LAMP_KINDS)[number]

export function isLampKind(value: unknown): value is LampKind {
  return (
    typeof value === 'string' &&
    (LAMP_KINDS as readonly string[]).includes(value)
  )
}

// Where one vehicle (or trailer) stands, its feet at y, for its lamps.
export interface TrafficLamp extends TruckPose {
  kind: LampKind
}

// A car's lamps as the valley is told of them, its middle on ground `y`
// and its trailer's on `trailerY`.
export function lampsOf(car: Car, y: number, trailerY = y): TrafficLamp[] {
  const lamps: TrafficLamp[] = [
    { kind: car.kind, x: car.x, y, z: car.z, heading: car.heading },
  ]
  const t = car.trailer
  if (t)
    lamps.push({
      kind: 'trailer',
      x: t.x,
      y: trailerY,
      z: t.z,
      heading: t.heading,
    })
  return lamps
}

// The beams a lamp throws: the headlights ahead, the taillights behind (a
// semi's at its trailer's tail, so a tractor throws none back).
export function lampBeams(
  lamp: TrafficLamp,
  cfg: TrafficConfig = CONFIG.traffic,
  lights = CONFIG.truck.headlights
): Beam[] {
  if (lamp.kind === 'trailer') {
    return [
      taillightBeam(lamp, -cfg.semi.trailer / 2, cfg.semi.tailHeight, cfg.tail),
    ]
  }
  const { nose, tail, height } = cfg.vehicles[lamp.kind]
  const ahead = headlightBeam(lamp, { ...lights, nose, height })
  return lamp.kind === 'semi'
    ? [ahead]
    : [ahead, taillightBeam(lamp, tail, height, cfg.tail)]
}
