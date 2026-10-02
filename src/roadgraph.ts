// Pure road-network math over geo.json's road polylines, in world metres.
// No three.js: tests/unit/roadgraph.test.ts runs this directly in Node.
//
// geo.json quantizes unit coordinates to 1e-4, so vertices shared between OSM
// ways coincide exactly and string keys find junctions with no snapping pass.
// Nodes are polyline endpoints plus any vertex used more than once; runs of
// interior vertices collapse into edges that keep their full point lists.

import { projectOnSegment, unitToWorld } from './coords.ts'
import { pick } from './rng.ts'
import type { Metres, Road, XZ } from './interfaces.ts'
import type { Rng } from './rng.ts'

// A point on the road network, in world metres.
export type RoadPoint = XZ

// A run of road between two nodes, with its full polyline.
export interface RoadEdge {
  // Node indices at the start and end of points.
  a: number
  b: number
  points: RoadPoint[]
  // Arc length at each point, in metres.
  cum: number[]
  length: number
  name: string
}

export interface RoadGraph {
  nodes: RoadPoint[]
  edges: RoadEdge[]
  // Node index -> indices of the edges that touch it.
  adjacency: number[][]
}

// The closest point on the road network, from nearestRoadPoint.
export interface RoadPointOnEdge extends RoadPoint {
  edge: number
  // Arc position along the edge, in metres.
  s: number
  dist: number
}

export type Route = RoadPoint[]

export interface WalkerState {
  x: number
  z: number
  dirX: number
  dirZ: number
  done: boolean
}

export interface Walker {
  total: number
  advance(metres: number): WalkerState
  position(): WalkerState
}

function cumulative(points: readonly RoadPoint[]): number[] {
  const cum = [0]
  for (let i = 1; i < points.length; i++) {
    cum.push(
      cum[i - 1] +
        Math.hypot(points[i].x - points[i - 1].x, points[i].z - points[i - 1].z)
    )
  }
  return cum
}

// Polyline slice between arc positions s0 and s1 (metres along the points),
// endpoints interpolated. Reversed when s0 > s1.
function slice(
  points: readonly RoadPoint[],
  cum: readonly number[],
  s0: number,
  s1: number
): RoadPoint[] {
  const reversed = s0 > s1
  const lo = Math.max(0, Math.min(s0, s1))
  const hi = Math.min(cum[cum.length - 1], Math.max(s0, s1))
  const at = (s: number): RoadPoint => {
    let i = 1
    while (i < cum.length - 1 && cum[i] < s) i++
    const span = cum[i] - cum[i - 1] || 1
    const t = (s - cum[i - 1]) / span
    return {
      x: points[i - 1].x + (points[i].x - points[i - 1].x) * t,
      z: points[i - 1].z + (points[i].z - points[i - 1].z) * t,
    }
  }
  const out = [at(lo)]
  for (let i = 0; i < points.length; i++) {
    if (cum[i] > lo && cum[i] < hi) out.push(points[i])
  }
  out.push(at(hi))
  if (reversed) out.reverse()
  return out
}

export function buildRoadGraph(
  roads: readonly Pick<Road, 'n' | 'p'>[],
  metres: Metres
): RoadGraph {
  // First pass: how often each quantized vertex appears across all polylines.
  const usage = new Map<string, number>()
  for (const road of roads) {
    for (const [u, v] of road.p) {
      const key = `${u},${v}`
      usage.set(key, (usage.get(key) || 0) + 1)
    }
  }

  const nodes: RoadPoint[] = []
  const nodeIndex = new Map<string, number>()
  const nodeAt = (key: string, u: number, v: number): number => {
    let idx = nodeIndex.get(key)
    if (idx === undefined) {
      const { x, z } = unitToWorld(u, v, metres)
      idx = nodes.length
      nodes.push({ x, z })
      nodeIndex.set(key, idx)
    }
    return idx
  }

  // Second pass: split each polyline at its junction vertices.
  const edges: RoadEdge[] = []
  const adjacency: number[][] = []
  const link = (edge: RoadEdge) => {
    const idx = edges.length
    edges.push(edge)
    ;(adjacency[edge.a] = adjacency[edge.a] || []).push(idx)
    ;(adjacency[edge.b] = adjacency[edge.b] || []).push(idx)
  }
  for (const road of roads) {
    if (road.p.length < 2) continue
    let runStart = 0
    for (let i = 1; i < road.p.length; i++) {
      const [u, v] = road.p[i]
      const isNode =
        i === road.p.length - 1 || (usage.get(`${u},${v}`) ?? 0) > 1
      if (!isNode) continue
      const unitRun = road.p.slice(runStart, i + 1)
      const points = unitRun.map(([pu, pv]) => {
        const { x, z } = unitToWorld(pu, pv, metres)
        return { x, z }
      })
      const cum = cumulative(points)
      const length = cum[cum.length - 1]
      if (length > 0) {
        link({
          a: nodeAt(`${unitRun[0][0]},${unitRun[0][1]}`, ...unitRun[0]),
          b: nodeAt(`${u},${v}`, u, v),
          points,
          cum,
          length,
          name: road.n || '',
        })
      }
      runStart = i
    }
  }
  for (let i = 0; i < nodes.length; i++) adjacency[i] = adjacency[i] || []
  return { nodes, edges, adjacency }
}

// Closest point on any edge. Returns arc position s along that edge so routes
// can start and end mid-edge.
export function nearestRoadPoint(
  graph: RoadGraph,
  x: number,
  z: number
): RoadPointOnEdge | null {
  let best: RoadPointOnEdge | null = null
  for (let e = 0; e < graph.edges.length; e++) {
    const { points, cum } = graph.edges[e]
    for (let i = 0; i < points.length - 1; i++) {
      const p = projectOnSegment(
        x,
        z,
        points[i].x,
        points[i].z,
        points[i + 1].x,
        points[i + 1].z
      )
      if (!best || p.dist < best.dist) {
        best = {
          x: p.x,
          z: p.y,
          edge: e,
          s: cum[i] + (cum[i + 1] - cum[i]) * p.t,
          dist: p.dist,
        }
      }
    }
  }
  return best
}

// Dijkstra between two on-edge points (nearestRoadPoint results). Seeds both
// endpoints of the start edge with the partial along-edge cost, targets both
// endpoints of the goal edge, then stitches the partial slices onto the node
// path. Returns a flat [{x, z}, …] polyline, or null when disconnected.
export function planRoute(
  graph: RoadGraph,
  from: RoadPointOnEdge,
  to: RoadPointOnEdge
): Route | null {
  const fromEdge = graph.edges[from.edge]
  const toEdge = graph.edges[to.edge]
  if (from.edge === to.edge) {
    return slice(fromEdge.points, fromEdge.cum, from.s, to.s)
  }

  const dist = new Map<number, number>()
  // node → { node, edge } it was reached from
  const prev = new Map<number, { node: number; edge: number }>()
  const seed = [
    { node: fromEdge.a, cost: from.s },
    { node: fromEdge.b, cost: fromEdge.length - from.s },
  ]
  const queue: number[] = []
  for (const { node, cost } of seed) {
    if (cost < (dist.get(node) ?? Infinity)) {
      dist.set(node, cost)
      queue.push(node)
    }
  }
  while (queue.length) {
    // Linear extract-min: the graph is a few thousand nodes, called rarely.
    let qi = 0
    for (let i = 1; i < queue.length; i++) {
      // Every queued node has a distance; ?? only satisfies the Map type.
      if ((dist.get(queue[i]) ?? Infinity) < (dist.get(queue[qi]) ?? Infinity))
        qi = i
    }
    const node = queue.splice(qi, 1)[0]
    const d = dist.get(node) ?? Infinity
    for (const e of graph.adjacency[node]) {
      const edge = graph.edges[e]
      const next = edge.a === node ? edge.b : edge.a
      const nd = d + edge.length
      if (nd < (dist.get(next) ?? Infinity)) {
        dist.set(next, nd)
        prev.set(next, { node, edge: e })
        queue.push(next)
      }
    }
  }

  const ends = [
    { node: toEdge.a, extra: to.s },
    { node: toEdge.b, extra: toEdge.length - to.s },
  ].filter(({ node }) => dist.has(node))
  if (!ends.length) return null
  // The filter above kept only nodes with a distance.
  const total = (end: { node: number; extra: number }) =>
    (dist.get(end.node) ?? Infinity) + end.extra
  ends.sort((p, q) => total(p) - total(q))
  const goal = ends[0].node

  // Walk prev back to a seeded node, collecting edges.
  const nodePath = [goal]
  const edgePath: number[] = []
  let cursor = goal
  while (prev.has(cursor)) {
    const step = prev.get(cursor)
    if (!step) break
    const { node, edge } = step
    edgePath.unshift(edge)
    nodePath.unshift(node)
    cursor = node
  }

  const points: Route = []
  const append = (pts: readonly RoadPoint[]) => {
    for (const p of pts) {
      const last = points[points.length - 1]
      if (last && last.x === p.x && last.z === p.z) continue
      points.push(p)
    }
  }
  // Partial start edge: from the on-edge point to the first path node.
  const startNode = nodePath[0]
  append(
    slice(
      fromEdge.points,
      fromEdge.cum,
      from.s,
      startNode === fromEdge.a ? 0 : fromEdge.length
    )
  )
  // Full middle edges, oriented along the path.
  for (let i = 0; i < edgePath.length; i++) {
    const edge = graph.edges[edgePath[i]]
    const pts =
      edge.a === nodePath[i] ? edge.points : [...edge.points].reverse()
    append(pts)
  }
  // Partial goal edge: from the last node to the on-edge point.
  append(
    slice(
      toEdge.points,
      toEdge.cum,
      goal === toEdge.a ? 0 : toEdge.length,
      to.s
    )
  )
  return points
}

// An outbound joyride: from an on-edge point, keep taking the straightest
// continuation at each junction (seeded rng breaks ties), never immediately
// reversing, until minLength metres accumulate. Deterministic per seed.
export function wanderRoute(
  graph: RoadGraph,
  from: RoadPointOnEdge,
  rng: Rng,
  minLength: number
): Route {
  const fromEdge = graph.edges[from.edge]
  // Leave along the longer remaining side of the starting edge.
  const towardB = fromEdge.length - from.s >= from.s
  const points = slice(
    fromEdge.points,
    fromEdge.cum,
    from.s,
    towardB ? fromEdge.length : 0
  )
  let travelled = Math.abs((towardB ? fromEdge.length : 0) - from.s)
  let node = towardB ? fromEdge.b : fromEdge.a
  let cameBy = from.edge

  for (let hops = 0; travelled < minLength && hops < 400; hops++) {
    const options = graph.adjacency[node].filter((e) => e !== cameBy)
    const candidates = options.length ? options : graph.adjacency[node]
    if (!candidates.length) break
    const last = points[points.length - 1]
    const before = points[points.length - 2] || last
    const inX = last.x - before.x
    const inZ = last.z - before.z
    const inLen = Math.hypot(inX, inZ) || 1
    let bestScore = -Infinity
    let best: number[] = []
    for (const e of candidates) {
      const edge = graph.edges[e]
      const pts = edge.a === node ? edge.points : [...edge.points].reverse()
      const outX = pts[1].x - pts[0].x
      const outZ = pts[1].z - pts[0].z
      const outLen = Math.hypot(outX, outZ) || 1
      const score = (inX * outX + inZ * outZ) / (inLen * outLen)
      if (score > bestScore + 1e-9) {
        bestScore = score
        best = [e]
      } else if (Math.abs(score - bestScore) <= 1e-9) {
        best.push(e)
      }
    }
    const chosen = best.length === 1 ? best[0] : pick(rng, best)
    const edge = graph.edges[chosen]
    const pts = edge.a === node ? edge.points : [...edge.points].reverse()
    for (let i = 1; i < pts.length; i++) points.push(pts[i])
    travelled += edge.length
    node = edge.a === node ? edge.b : edge.a
    cameBy = chosen
  }
  return points
}

// Arc-length walker over a route polyline. advance(metres) moves the cursor
// and reports position, direction of travel, and completion.
export function createWalker(points: readonly RoadPoint[]): Walker {
  const cum = cumulative(points)
  const total = cum[cum.length - 1]
  let s = 0
  let seg = 0
  const state: WalkerState = {
    x: points[0].x,
    z: points[0].z,
    dirX: 0,
    dirZ: 1,
    done: false,
  }
  const settle = () => {
    while (seg < points.length - 2 && cum[seg + 1] < s) seg++
    const span = cum[seg + 1] - cum[seg] || 1
    const t = Math.max(0, Math.min(1, (s - cum[seg]) / span))
    const a = points[seg]
    const b = points[seg + 1]
    state.x = a.x + (b.x - a.x) * t
    state.z = a.z + (b.z - a.z) * t
    const len = Math.hypot(b.x - a.x, b.z - a.z) || 1
    state.dirX = (b.x - a.x) / len
    state.dirZ = (b.z - a.z) / len
    state.done = s >= total
  }
  settle()
  return {
    total,
    advance(metres: number) {
      s = Math.min(total, s + metres)
      settle()
      return state
    },
    position() {
      return state
    },
  }
}
