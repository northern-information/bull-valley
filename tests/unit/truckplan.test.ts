import { describe, expect, it } from 'vitest'
import { CONFIG } from '../../src/config.ts'
import { TO_DOOR_SECONDS } from '../../src/marx.ts'
import {
  buildRoadGraph,
  callRoute,
  createWalker,
  nearestRoadPoint,
} from '../../src/roadgraph.ts'
import {
  approachStart,
  homeRoute,
  joyrideMs,
  joyrideRoute,
  planLeg,
  pointAlong,
} from '../../src/truckplan.ts'
import type { Metres, Road, XZ } from '../../src/interfaces.ts'
import type { TruckContext } from '../../src/truckplan.ts'

// A cross with a spur, as in roadgraph.test.ts, over a 1000 m frame.
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
]
const graph = buildRoadGraph(ROADS, METRES)
const near = (x: number, z: number): XZ => {
  const p = nearestRoadPoint(graph, x, z)
  if (!p) throw new Error('no road')
  return { x: p.x, z: p.z }
}
const home = near(0, 300)
const out = near(300, 0)
const departRoute = callRoute(graph, home, out) ?? []
const donuts = [
  home,
  { x: home.x + 30, z: home.z },
  { x: home.x + 30, z: home.z + 30 },
]
const ctx: TruckContext = {
  graph,
  home,
  homeDir: { x: 0, z: -1 },
  departRoute,
  donutRoute: (seed) => (seed === 0 ? null : donuts),
}
const T0 = 1_000_000
const length = (points: readonly XZ[]) => createWalker(points).total

describe('the roads Marx drives', () => {
  it('drives the joyride out and home again, ending where he parks', () => {
    const route = joyrideRoute(ctx)
    expect(route[0]).toEqual(departRoute[0])
    expect(route[route.length - 1]).toEqual(home)
    expect(length(route)).toBeCloseTo(length(departRoute) * 2, 0)
  })

  it('tells the valley how long the joyride takes, his walk included', () => {
    expect(joyrideMs(ctx)).toBe(
      Math.round(
        (TO_DOOR_SECONDS + length(joyrideRoute(ctx)) / CONFIG.truck.speed) *
          1000
      )
    )
  })

  it('comes home from anywhere by road', () => {
    const route = homeRoute(ctx, { x: -250, z: 0 })
    expect(route?.[route.length - 1]).toEqual(home)
  })

  it('finds the truck along a drive, waiting out the walk to his door', () => {
    expect(pointAlong(donuts, 10, true, TO_DOOR_SECONDS)).toEqual(home)
    expect(pointAlong(donuts, 10, false, 2)).toEqual({
      x: home.x + 20,
      z: home.z,
    })
    expect(pointAlong(donuts, 10, false, 1000)).toEqual(donuts[2])
  })
})

describe('approachStart', () => {
  it('starts home from where his donuts were cut short', () => {
    const at = approachStart(ctx, {
      kind: 'donuts',
      at: T0,
      cut: T0 + (TO_DOOR_SECONDS + 1) * 1000,
    })
    expect(at.x).toBeCloseTo(home.x + CONFIG.truck.donuts.speed)
    // No donuts to draw: he was home all along.
    expect(approachStart(ctx, { kind: 'donuts', at: 0, cut: 9 })).toEqual(home)
  })

  it('starts home from where a whistle had brought him', () => {
    const from = home
    const to = near(-300, 0)
    const at = approachStart(ctx, {
      kind: 'called',
      at: T0,
      from,
      to,
      rest: false,
      cut: T0 + 5000,
    })
    expect(Math.hypot(at.x - from.x, at.z - from.z)).toBeCloseTo(
      CONFIG.truck.speed * 5,
      0
    )
    // Nowhere to drive: where it stood.
    const lost = { x: 99999, z: 99999 }
    expect(
      approachStart(ctx, {
        kind: 'called',
        at: T0,
        from: lost,
        to: lost,
        rest: false,
        cut: T0,
      })
    ).toEqual(lost)
  })
})

describe('planLeg', () => {
  it('parks at home, or drives home first', () => {
    expect(
      planLeg({ kind: 'parked', at: T0, from: null, leavesAt: null }, ctx)
    ).toEqual({ kind: 'park' })
    const plan = planLeg(
      {
        kind: 'parked',
        at: T0,
        from: { kind: 'donuts', at: T0 - 60_000, cut: T0 },
        leavesAt: null,
      },
      ctx
    )
    expect(plan).toMatchObject({
      kind: 'drive',
      at: T0,
      fromTailgate: false,
      donuts: false,
      home: true,
    })
  })

  it('does donuts from the tailgate, sliding, and stays out', () => {
    expect(planLeg({ kind: 'donuts', at: T0 }, ctx)).toEqual({
      kind: 'drive',
      points: donuts,
      at: T0,
      speed: CONFIG.truck.donuts.speed,
      fromTailgate: true,
      donuts: true,
      home: false,
    })
    // No field to do them in: he stays parked.
    expect(planLeg({ kind: 'donuts', at: 0 }, ctx)).toEqual({ kind: 'park' })
  })

  it('takes the joyride from the tailgate, and comes home', () => {
    expect(planLeg({ kind: 'joyride', at: T0 }, ctx)).toMatchObject({
      kind: 'drive',
      points: joyrideRoute(ctx),
      fromTailgate: true,
      home: true,
    })
  })

  it('answers a whistle, then drives the whistler home', () => {
    const to = near(-300, 0)
    expect(
      planLeg(
        { kind: 'called', at: T0, by: 'a', from: home, to, rest: true },
        ctx
      )
    ).toMatchObject({ kind: 'drive', fromTailgate: true, home: false })
    const ferry = planLeg({ kind: 'ferry', at: T0, from: home, to }, ctx)
    expect(ferry).toMatchObject({ kind: 'drive', home: true })
    if (ferry.kind !== 'drive') throw new Error('not a drive')
    expect(ferry.points[0]).toEqual(to)
    expect(ferry.points[ferry.points.length - 1]).toEqual(home)
  })
})
