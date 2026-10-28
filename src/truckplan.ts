// What a client draws for each of Matthew Marx's legs (marx.ts), pure: the
// road the truck drives, how fast, from when, whether Marx walks from the
// tailgate to his door first, and where a leg cut short left the truck.
// Every client that knows the leg and the server clock puts the truck at
// the same spot (truck.ts driveRouteAt). No three.js.

import { CONFIG } from './config.ts'
import { TO_DOOR_SECONDS } from './marx.ts'
import { callRoute, createWalker } from './roadgraph.ts'
import { toWorld } from './store.ts'
import type { XZ } from './interfaces.ts'
import type { Approach, Leg } from './marx.ts'
import type { RoadGraph, Route } from './roadgraph.ts'
import type { StoreOrigin } from './store.ts'

// Where the truck parks and which way it faces there, and the two spots on
// the lot it drives through: `pullOut` ahead of it to leave, `pullIn`
// behind it to come home, so it never drives through what stands round it.
export interface TruckParking {
  home: XZ
  homeDir: XZ
  pullOut: XZ
  pullIn: XZ
}

// What the client knows of the roads: the graph, where the truck parks,
// the joyride out, and the donuts for a seed.
export interface TruckContext extends TruckParking {
  graph: RoadGraph
  departRoute: Route
  donutRoute(seed: number): Route | null
}

// Where the truck parks at the spawn Citgo `station` (CONFIG.truck.park):
// beside Tyler's Jeep (CONFIG.tyler) on its pump side, nose the same way.
// It leaves out ahead of the Jeep, and comes home from behind both, round
// Moab and under the road sign's side of the lot.
export function truckParking(station: StoreOrigin): TruckParking {
  const { at, toward } = CONFIG.tyler
  const { beside, pullOut, pullIn } = CONFIG.truck.park
  const len = Math.hypot(toward.x - at.x, toward.z - at.z) || 1
  const dx = (toward.x - at.x) / len
  const dz = (toward.z - at.z) / len
  // Square to the Jeep, toward the pumps (local -X).
  const side = dz >= 0 ? 1 : -1
  const hx = at.x - dz * side * beside
  const hz = at.z + dx * side * beside
  const world = (x: number, z: number): XZ => {
    const [wx, , wz] = toWorld(station, [x, 0, z])
    return { x: wx, z: wz }
  }
  const cos = Math.cos(station.yaw)
  const sin = Math.sin(station.yaw)
  return {
    home: world(hx, hz),
    homeDir: { x: cos * dx - sin * dz, z: sin * dx + cos * dz },
    pullOut: world(hx + dx * pullOut, hz + dz * pullOut),
    pullIn: world(hx - dx * pullIn, hz - dz * pullIn),
  }
}

// Nearer home than this is at home.
const AT_HOME = 0.5

const atHome = (ctx: TruckParking, p: XZ): boolean =>
  Math.hypot(p.x - ctx.home.x, p.z - ctx.home.z) < AT_HOME

// The roads from `from` to `to`, leaving the lot by `pullOut` when it
// starts at home; null with no road between.
export function routeFrom(ctx: TruckContext, from: XZ, to: XZ): Route | null {
  if (!atHome(ctx, from)) return callRoute(ctx.graph, from, to)
  const route = callRoute(ctx.graph, ctx.pullOut, to)
  if (!route) return null
  return [{ x: ctx.home.x, z: ctx.home.z }, ...route]
}

export type TruckPlan =
  // Parked at home, Marx reading.
  | { kind: 'park' }
  // Driving `points` from server ms `at`: at `speed`, after Marx's walk to
  // his door when he starts from the tailgate, sliding into the turns on
  // donuts, and parking at home once done when `home` is set.
  | {
      kind: 'drive'
      points: Route
      at: number
      speed: number
      fromTailgate: boolean
      donuts: boolean
      home: boolean
    }

// The joyride: the wander out from the Citgo, then the roads home.
export function joyrideRoute(ctx: TruckContext): Route {
  const out = ctx.departRoute
  const back = homeRoute(ctx, out[out.length - 1]) ?? []
  return [...out, ...back.slice(1)]
}

// The roads from `from` to where the truck parks, in by `pullIn` and
// ending there; null with no road between. From home it stays put.
export function homeRoute(ctx: TruckContext, from: XZ): Route | null {
  const home = { x: ctx.home.x, z: ctx.home.z }
  if (atHome(ctx, from)) return [home]
  const route = callRoute(ctx.graph, from, ctx.pullIn)
  if (!route || route.length < 1) return null
  return [...route, { x: ctx.pullIn.x, z: ctx.pullIn.z }, home]
}

// The joyride, out and home, in ms, Marx's walk to his door included: what
// the hello tells the valley, which never knows the roads.
export function joyrideMs(ctx: TruckContext): number {
  const length = createWalker(joyrideRoute(ctx)).total
  return Math.round((TO_DOOR_SECONDS + length / CONFIG.truck.speed) * 1000)
}

// Where a route drive is `seconds` after it started: Marx walks to his
// door first when he starts from the tailgate.
export function pointAlong(
  points: Route,
  speed: number,
  fromTailgate: boolean,
  seconds: number
): XZ {
  const hold = fromTailgate ? TO_DOOR_SECONDS : 0
  const s = createWalker(points).advance(speed * Math.max(0, seconds - hold))
  return { x: s.x, z: s.z }
}

// Where an approach home starts: where the leg it cut short had the truck.
export function approachStart(ctx: TruckContext, from: Approach): XZ {
  const seconds = (from.cut - from.at) / 1000
  if (from.kind === 'donuts') {
    const points = ctx.donutRoute(from.at)
    if (!points) return ctx.home
    return pointAlong(points, CONFIG.truck.donuts.speed, true, seconds)
  }
  const points = routeFrom(ctx, from.from, from.to)
  if (!points || points.length < 2) return from.from
  return pointAlong(points, CONFIG.truck.speed, from.rest, seconds)
}

const drive = (
  points: Route | null,
  at: number,
  extra: Partial<Extract<TruckPlan, { kind: 'drive' }>> = {}
): TruckPlan =>
  points && points.length >= 2
    ? {
        kind: 'drive',
        points,
        at,
        speed: CONFIG.truck.speed,
        fromTailgate: false,
        donuts: false,
        home: true,
        ...extra,
      }
    : { kind: 'park' }

export function planLeg(leg: Leg, ctx: TruckContext): TruckPlan {
  switch (leg.kind) {
    case 'parked':
      if (!leg.from) return { kind: 'park' }
      return drive(homeRoute(ctx, approachStart(ctx, leg.from)), leg.at)
    case 'donuts':
      return drive(ctx.donutRoute(leg.at), leg.at, {
        speed: CONFIG.truck.donuts.speed,
        fromTailgate: true,
        donuts: true,
        home: false,
      })
    case 'joyride':
      return drive(joyrideRoute(ctx), leg.at, { fromTailgate: true })
    case 'charter':
      return drive(routeFrom(ctx, ctx.home, leg.to), leg.at, {
        fromTailgate: true,
        home: false,
      })
    case 'called':
      return drive(routeFrom(ctx, leg.from, leg.to), leg.at, {
        fromTailgate: leg.rest,
        home: false,
      })
    case 'ferry': {
      const route = routeFrom(ctx, leg.from, leg.to)
      const end = route?.[route.length - 1] ?? leg.to
      return drive(homeRoute(ctx, end), leg.at)
    }
  }
}
