import { describe, expect, it } from 'vitest'
import { mulberry32 } from '../../src/rng.ts'
import {
  buildRoadGraph,
  callRoute,
  createWalker,
  nearestRoadPoint,
  planRoute,
  wanderRoute,
} from '../../src/roadgraph.ts'
import type { Metres, Road } from '../../src/interfaces.ts'
import type { RoadPoint } from '../../src/roadgraph.ts'

// Fails the test with a clear message when a result is missing.
function must<T>(value: T | null | undefined, what: string): T {
  if (value === null || value === undefined) throw new Error(`No ${what}`)
  return value
}

// A cross with a spur, in unit coordinates over a 1000x1000 m frame:
//
//        (0.5,0.1)
//            |
// (0.1,0.5)-+-(0.9,0.5)
//            |     |
//        (0.5,0.9) (0.9,0.7)
//
// The junction (0.5,0.5) and the spur joint (0.9,0.5) are shared vertices,
// exactly as geo.json's 1e-4 quantization makes OSM junctions coincide.
const METRES: Metres = { width: 1000, height: 1000 }
const ROADS: Road[] = [
  {
    c: 'tertiary',
    n: 'North South Road',
    p: [
      [0.5, 0.1],
      [0.5, 0.5],
      [0.5, 0.9],
    ],
  },
  {
    c: 'tertiary',
    n: 'East West Road',
    p: [
      [0.1, 0.5],
      [0.5, 0.5],
      [0.9, 0.5],
    ],
  },
  {
    c: 'residential',
    n: 'Spur Lane',
    p: [
      [0.9, 0.5],
      [0.9, 0.7],
    ],
  },
]

const graph = buildRoadGraph(ROADS, METRES)

// The closest road point, which this fixture always has.
function snap(x: number, z: number) {
  return must(nearestRoadPoint(graph, x, z), 'road point')
}

function polylineLength(points: readonly RoadPoint[]) {
  let len = 0
  for (let i = 1; i < points.length; i++) {
    len += Math.hypot(
      points[i].x - points[i - 1].x,
      points[i].z - points[i - 1].z
    )
  }
  return len
}

describe('buildRoadGraph', () => {
  it('finds the junctions and splits polylines there', () => {
    // 6 nodes: 4 road ends, the cross junction, the spur joint.
    expect(graph.nodes.length).toBe(6)
    // 5 edges: the cross's four arms plus the spur.
    expect(graph.edges.length).toBe(5)
    // The cross junction at world (0, 0) touches four edges.
    const junction = graph.nodes.findIndex((n) => n.x === 0 && n.z === 0)
    expect(junction).toBeGreaterThanOrEqual(0)
    expect(graph.adjacency[junction].length).toBe(4)
    // The spur joint at (400, 0) touches two.
    const joint = graph.nodes.findIndex((n) => n.x === 400 && n.z === 0)
    expect(graph.adjacency[joint].length).toBe(2)
  })

  it('measures edge lengths in metres', () => {
    const lengths = graph.edges.map((e) => e.length).sort((a, b) => a - b)
    const expected = [200, 400, 400, 400, 400]
    lengths.forEach((len, i) => expect(len).toBeCloseTo(expected[i], 6))
  })
})

describe('nearestRoadPoint', () => {
  it('projects onto the closest edge', () => {
    const p = snap(10, -100)
    expect(p.x).toBeCloseTo(0, 6)
    expect(p.z).toBeCloseTo(-100, 6)
    expect(p.dist).toBeCloseTo(10, 6)
  })

  it('clamps beyond edge ends', () => {
    const p = snap(400, 300)
    expect(p.x).toBeCloseTo(400, 6)
    expect(p.z).toBeCloseTo(200, 6)
  })
})

describe('planRoute', () => {
  it('routes across the junction with partial edges at both ends', () => {
    const from = snap(0, -200)
    const to = snap(200, 0)
    const route = must(planRoute(graph, from, to), 'route')
    expect(route[0].x).toBeCloseTo(0, 6)
    expect(route[0].z).toBeCloseTo(-200, 6)
    expect(route[route.length - 1].x).toBeCloseTo(200, 6)
    expect(route[route.length - 1].z).toBeCloseTo(0, 6)
    expect(polylineLength(route)).toBeCloseTo(400, 4)
  })

  it('stays on one edge when both points share it', () => {
    const from = snap(0, -300)
    const to = snap(0, -100)
    const route = must(planRoute(graph, from, to), 'route')
    expect(polylineLength(route)).toBeCloseTo(200, 4)
  })

  it('reaches the spur end from the far arm', () => {
    const from = snap(-400, 0)
    const to = snap(400, 200)
    const route = must(planRoute(graph, from, to), 'route')
    // West arm 400 + east arm 400 + spur 200.
    expect(polylineLength(route)).toBeCloseTo(1000, 4)
  })
})

describe('callRoute', () => {
  it('starts on the road when the truck is on it', () => {
    const route = must(
      callRoute(graph, { x: 0, z: -200 }, { x: 200, z: 0 }),
      'route'
    )
    expect(polylineLength(route)).toBeCloseTo(400, 4)
  })

  it('drives onto the road first from off it', () => {
    const route = must(
      callRoute(graph, { x: 30, z: -200 }, { x: 200, z: 0 }),
      'route'
    )
    expect(route[0]).toEqual({ x: 30, z: -200 })
    expect(polylineLength(route)).toBeCloseTo(430, 4)
  })
})

describe('wanderRoute', () => {
  it('is deterministic for a fixed seed', () => {
    const from = snap(0, -200)
    const a = wanderRoute(graph, from, mulberry32(7), 600)
    const b = wanderRoute(graph, from, mulberry32(7), 600)
    expect(a).toEqual(b)
  })

  it('takes the straightest continuation instead of reversing', () => {
    // Start on the north arm heading south: the straight continuation at the
    // junction is the south arm, not a turn and never a reversal.
    const from = snap(0, -200)
    const route = wanderRoute(graph, from, mulberry32(1), 500)
    const last = route[route.length - 1]
    expect(last.x).toBeCloseTo(0, 6)
    expect(last.z).toBeCloseTo(400, 6)
    expect(polylineLength(route)).toBeCloseTo(600, 4)
  })
})

describe('createWalker', () => {
  it('walks arc length with per-segment headings', () => {
    const walker = createWalker([
      { x: 0, z: 0 },
      { x: 100, z: 0 },
      { x: 100, z: 100 },
    ])
    expect(walker.total).toBeCloseTo(200, 6)
    let s = walker.advance(50)
    expect(s.x).toBeCloseTo(50, 6)
    expect(s.dirX).toBeCloseTo(1, 6)
    expect(s.dirZ).toBeCloseTo(0, 6)
    s = walker.advance(100)
    expect(s.x).toBeCloseTo(100, 6)
    expect(s.z).toBeCloseTo(50, 6)
    expect(s.dirX).toBeCloseTo(0, 6)
    expect(s.dirZ).toBeCloseTo(1, 6)
    expect(s.done).toBe(false)
    s = walker.advance(100)
    expect(s.x).toBeCloseTo(100, 6)
    expect(s.z).toBeCloseTo(100, 6)
    expect(s.done).toBe(true)
  })
})
