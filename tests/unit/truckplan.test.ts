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
  routeFrom,
  truckParking,
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
  // Off the road on the lot, ahead of where he parks and behind it.
  pullOut: { x: home.x + 6, z: home.z - 8 },
  pullIn: { x: home.x + 6, z: home.z + 8 },
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
    const back = homeRoute(ctx, departRoute[departRoute.length - 1]) ?? []
    expect(route).toEqual([...departRoute, ...back.slice(1)])
  })

  it('comes home in from behind, by the pull-in', () => {
    const route = homeRoute(ctx, { x: -250, z: 0 }) ?? []
    expect(route.slice(-2)).toEqual([ctx.pullIn, home])
    // Already home, he stays put.
    expect(homeRoute(ctx, home)).toEqual([home])
  })

  it('leaves home out ahead, by the pull-out', () => {
    const to = near(-300, 0)
    const route = routeFrom(ctx, home, to) ?? []
    expect(route.slice(0, 2)).toEqual([home, ctx.pullOut])
    expect(route[route.length - 1]).toEqual(to)
    // From anywhere else, straight by road.
    expect(routeFrom(ctx, out, to)).toEqual(callRoute(graph, out, to))
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
    expect(at).toEqual(
      pointAlong(routeFrom(ctx, from, to) ?? [], CONFIG.truck.speed, false, 5)
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

  it('drives a charter from the tailgate to the place picked, and stops there', () => {
    const to = near(-300, 0)
    const plan = planLeg({ kind: 'charter', at: T0, to }, ctx)
    expect(plan).toMatchObject({
      kind: 'drive',
      fromTailgate: true,
      home: false,
    })
    if (plan.kind !== 'drive') throw new Error('not a drive')
    expect(plan.points[0]).toEqual(home)
    expect(plan.points[plan.points.length - 1]).toEqual(to)
    // Let off there, he drives home from where the charter's road ended.
    const back = planLeg(
      {
        kind: 'parked',
        at: T0 + 600_000,
        from: {
          kind: 'called',
          at: T0,
          from: home,
          to,
          rest: true,
          cut: T0 + 600_000,
        },
        leavesAt: null,
      },
      ctx
    )
    if (back.kind !== 'drive') throw new Error('not a drive')
    expect(back.points[0]).toEqual(to)
    expect(back.points[back.points.length - 1]).toEqual(home)
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

describe('truckParking', () => {
  // A station turned a quarter round, so local +X (toward the road) is
  // world +Z.
  const station = { x: 100, y: 0, z: 50, yaw: Math.PI / 2 }
  const local = (p: XZ): XZ => {
    const dx = p.x - station.x
    const dz = p.z - station.z
    return { x: dz, z: -dx }
  }
  const parking = truckParking(station)
  const { at } = CONFIG.tyler

  it('parks beside the Jeep, on its pump side', () => {
    const home = local(parking.home)
    expect(Math.hypot(home.x - at.x, home.z - at.z)).toBeCloseTo(
      CONFIG.truck.park.beside
    )
    expect(home.x).toBeLessThan(at.x)
  })

  it('faces the way the Jeep does, and pulls out ahead and in behind', () => {
    const { toward } = CONFIG.tyler
    const len = Math.hypot(toward.x - at.x, toward.z - at.z)
    const dir = local({
      x: station.x + parking.homeDir.x,
      z: station.z + parking.homeDir.z,
    })
    expect(dir.x).toBeCloseTo((toward.x - at.x) / len)
    expect(dir.z).toBeCloseTo((toward.z - at.z) / len)
    const home = local(parking.home)
    const out = local(parking.pullOut)
    const back = local(parking.pullIn)
    expect(out.x - home.x).toBeCloseTo(dir.x * CONFIG.truck.park.pullOut)
    expect(out.z - home.z).toBeCloseTo(dir.z * CONFIG.truck.park.pullOut)
    expect(back.x - home.x).toBeCloseTo(-dir.x * CONFIG.truck.park.pullIn)
    expect(back.z - home.z).toBeCloseTo(-dir.z * CONFIG.truck.park.pullIn)
  })
})
