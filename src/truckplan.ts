// What a client draws for each of Matthew Marx's legs (marx.ts), pure: the
// road the truck drives, how fast, from when, whether Marx walks from the
// tailgate to his door first, and where a leg cut short left the truck.
// Every client that knows the leg and the server clock puts the truck at
// the same spot (truck.ts driveRouteAt). No three.js.

import { CONFIG } from './config.ts'
import { TO_DOOR_SECONDS } from './marx.ts'
import { callRoute, createWalker } from './roadgraph.ts'
import type { XZ } from './interfaces.ts'
import type { Approach, Leg } from './marx.ts'
import type { RoadGraph, Route } from './roadgraph.ts'

// What the client knows of the roads: the graph, where the truck parks and
// which way it faces there, the joyride out, and the donuts for a seed.
export interface TruckContext {
  graph: RoadGraph
  home: XZ
  homeDir: XZ
  departRoute: Route
  donutRoute(seed: number): Route | null
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

// The roads from `from` to where the truck parks, ending there; null with
// no road between.
export function homeRoute(ctx: TruckContext, from: XZ): Route | null {
  const route = callRoute(ctx.graph, from, ctx.home)
  if (!route || route.length < 1) return null
  return [...route, { x: ctx.home.x, z: ctx.home.z }]
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
  const points = callRoute(ctx.graph, from.from, from.to)
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

// What the truck does for `leg`.
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
    case 'called':
      return drive(callRoute(ctx.graph, leg.from, leg.to), leg.at, {
        fromTailgate: leg.rest,
        home: false,
      })
    case 'ferry': {
      const route = callRoute(ctx.graph, leg.from, leg.to)
      const end = route?.[route.length - 1] ?? leg.to
      return drive(homeRoute(ctx, end), leg.at)
    }
  }
}
