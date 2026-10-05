import { describe, expect, it } from 'vitest'
import { pointSegmentDistance, unitToWorld } from '../../src/coords.ts'
import {
  findJunctions,
  placeRoadside,
  ROADSIDE,
  roadWidth,
} from '../../src/roadside.ts'
import type { Metres, Road, XZ } from '../../src/interfaces.ts'

// 0.01 of the unit square is 100 m.
const METRES: Metres = { width: 10000, height: 10000 }

// A long straight road; a T where a residential street leaves a tertiary
// road; a + of two residential streets; one residential road drawn as two
// polylines that meet end to end; and an unnamed lane.
const STRAIGHT: Road = {
  c: 'tertiary',
  n: 'Straight Road',
  p: [
    [0.1, 0.5],
    [0.4, 0.5],
  ],
}
const T_THROUGH: Road = {
  c: 'tertiary',
  n: 'Through Road',
  p: [
    [0.6, 0.2],
    [0.6, 0.4],
    [0.6, 0.6],
  ],
}
const T_BRANCH: Road = {
  c: 'residential',
  n: 'Branch Lane',
  p: [
    [0.6, 0.4],
    [0.8, 0.4],
  ],
}
const PLUS: Road[] = [
  {
    c: 'residential',
    n: 'North South',
    p: [
      [0.85, 0.7],
      [0.85, 0.8],
      [0.85, 0.9],
    ],
  },
  {
    c: 'residential',
    n: 'East West',
    p: [
      [0.75, 0.8],
      [0.85, 0.8],
      [0.95, 0.8],
    ],
  },
]
const JOINED: Road[] = [
  {
    c: 'residential',
    n: 'Joined Road',
    p: [
      [0.1, 0.8],
      [0.2, 0.8],
    ],
  },
  {
    c: 'residential',
    n: 'Joined Road',
    p: [
      [0.2, 0.8],
      [0.3, 0.8],
    ],
  },
]
const UNNAMED: Road = {
  c: 'residential',
  n: '',
  p: [
    [0.1, 0.1],
    [0.4, 0.1],
  ],
}
const ROADS: Road[] = [
  STRAIGHT,
  T_THROUGH,
  T_BRANCH,
  ...PLUS,
  ...JOINED,
  UNNAMED,
]

const at = (u: number, v: number) => unitToWorld(u, v, METRES)
const dist = (a: XZ, b: XZ) => Math.hypot(a.x - b.x, a.z - b.z)
const onStraight = (p: XZ) =>
  Math.abs(p.z - at(0, 0.5).z) < 10 && p.x < at(0.45, 0).x

// How far p stands outside the nearest ribbon edge.
function clearance(p: XZ, roads: readonly Road[]): number {
  let best = Infinity
  for (const road of roads) {
    for (let i = 0; i < road.p.length - 1; i++) {
      const a = at(...road.p[i])
      const b = at(...road.p[i + 1])
      const d =
        pointSegmentDistance(p.x, p.z, a.x, a.z, b.x, b.z) -
        roadWidth(road.c) / 2
      best = Math.min(best, d)
    }
  }
  return best
}

describe('findJunctions', () => {
  it('finds a T and a +, but not two polylines joined end to end', () => {
    const junctions = findJunctions(ROADS, METRES)
    expect(junctions).toHaveLength(2)
    const t = junctions.find((j) => dist(j, at(0.6, 0.4)) < 1e-6)
    const plus = junctions.find((j) => dist(j, at(0.85, 0.8)) < 1e-6)
    expect(t?.arms).toHaveLength(3)
    expect(plus?.arms).toHaveLength(4)
    expect(t?.classes).toEqual(new Set(['tertiary', 'residential']))
  })
})

describe('placeRoadside', () => {
  const { poles, lamps } = placeRoadside(ROADS, METRES)

  it('is deterministic for the seed', () => {
    expect(placeRoadside(ROADS, METRES)).toEqual({ poles, lamps })
  })

  it('paces a line of poles along a straight road, right of travel', () => {
    const line = poles.filter(onStraight)
    expect(line.length).toBeGreaterThan(50)
    expect(new Set(line.map((p) => p.line)).size).toBe(1)
    for (let i = 1; i < line.length; i++) {
      expect(dist(line[i], line[i - 1])).toBeCloseTo(ROADSIDE.spacing, 6)
    }
    // Travel is +x, so the right of travel is +z.
    for (const p of line) {
      expect(p.z - at(0, 0.5).z).toBeCloseTo(ROADSIDE.offset, 6)
    }
  })

  it('turns every pole square to its road, within the jitter', () => {
    const line = poles.filter(onStraight)
    for (const p of line) {
      // Local +Z along travel (+x) is a yaw of π/2.
      expect(Math.abs(p.yaw - Math.PI / 2)).toBeLessThanOrEqual(
        ROADSIDE.yawJitter
      )
      expect(Math.abs(p.tilt)).toBeLessThanOrEqual(ROADSIDE.tilt)
      expect(p.height).toBeGreaterThanOrEqual(ROADSIDE.height[0])
      expect(p.height).toBeLessThanOrEqual(ROADSIDE.height[1])
    }
  })

  it('keeps poles off the roads and out of the junctions', () => {
    const junctions = findJunctions(ROADS, METRES)
    for (const p of poles) {
      expect(clearance(p, ROADS)).toBeGreaterThanOrEqual(ROADSIDE.roadClear)
      for (const j of junctions) {
        expect(dist(p, j)).toBeGreaterThanOrEqual(ROADSIDE.junctionClear)
      }
    }
  })

  it('breaks the line where a pole is dropped', () => {
    // The through road's poles stop short of the junction on either side.
    const through = poles.filter(
      (p) => Math.abs(p.x - at(0.6, 0).x) < 10 && p.z < at(0, 0.6).z
    )
    const before = through.filter((p) => p.z < at(0, 0.4).z)
    const after = through.filter((p) => p.z > at(0, 0.4).z)
    expect(before.length).toBeGreaterThan(0)
    expect(after.length).toBeGreaterThan(0)
    expect(before[before.length - 1].line).not.toBe(after[0].line)
  })

  it('leaves unnamed roads bare', () => {
    expect(poles.some((p) => Math.abs(p.z - at(0, 0.1).z) < 10)).toBe(false)
  })

  it('lights the junction a tertiary road passes through, and no other', () => {
    expect(lamps).toHaveLength(1)
    const [lamp] = lamps
    const node = at(0.6, 0.4)
    expect(dist(lamp, node)).toBeLessThanOrEqual(ROADSIDE.lampReach)
    expect(clearance(lamp, ROADS)).toBeGreaterThanOrEqual(
      ROADSIDE.lampClear - 1e-9
    )
    // The widest gap at the T is the west side, opposite the branch.
    expect(lamp.x).toBeLessThan(node.x)
    // Local +X under the yaw points at the junction.
    const reach = { x: Math.cos(lamp.yaw), z: -Math.sin(lamp.yaw) }
    const toNode = { x: node.x - lamp.x, z: node.z - lamp.z }
    const len = Math.hypot(toNode.x, toNode.z)
    expect(reach.x).toBeCloseTo(toNode.x / len, 6)
    expect(reach.z).toBeCloseTo(toNode.z / len, 6)
  })

  it('stands nothing near a fuel point', () => {
    const station = at(0.6, 0.4)
    const avoided = placeRoadside(ROADS, METRES, { avoid: [station] })
    expect(avoided.lamps).toHaveLength(0)
    for (const p of avoided.poles) {
      expect(dist(p, station)).toBeGreaterThanOrEqual(ROADSIDE.stationClear)
    }
  })
})
