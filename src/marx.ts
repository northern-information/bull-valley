// Matthew Marx's day, pure: where the white Chevy is in the persistent
// valley and what it does next, as a chain of legs stamped with server
// times. The valley keeps the truck (sharedworld.ts) and moves it through
// these rules; every client drives the same leg against the same clock
// (truckplan.ts), so all of them agree where the truck is. Played alone,
// the client runs the same rules against its own clock. No three.js.
//
// His day, over and over: he reads at the tailgate by the spawn Citgo for
// CONFIG.truck.readSeconds, then does donuts in the field across Lake
// Avenue for donutSeconds, then drives home and reads again. Anyone
// arriving in the valley while he is at his donuts brings him straight
// home. Anyone climbing into the bed starts a countdownSeconds clock; when
// it runs out he takes whoever is aboard on the joyride out through the
// valley and home again, and lets them off at the Citgo. A whistle (T)
// brings him to the whistler, who climbs in and is driven home.
//
// The valley never knows the roads, so it never knows exactly when a drive
// ends. It reckons generously (a road is never shorter than the straight
// line, nor much more than roadFactor times it) and moves on only once the
// drive is surely done; the clients, who know the roads, show the truck
// parked as soon as it really is.

import { CONFIG } from './config.ts'
import type { XZ } from './interfaces.ts'

// How the truck comes home to park: from its donuts, cut short at `cut`,
// or from answering a whistle whose caller is gone.
export type Approach =
  | { kind: 'donuts'; at: number; cut: number }
  | { kind: 'called'; at: number; from: XZ; to: XZ; rest: boolean; cut: number }

export type Leg =
  // By the spawn Citgo, Marx reading at the tailgate: once he is home
  // (`from`, the drive there, or null when he already is). leavesAt is
  // when he leaves with whoever is in the bed, or null while it is empty.
  | {
      kind: 'parked'
      at: number
      from: Approach | null
      leavesAt: number | null
    }
  // In the field by the corn maze, seeded by `at`.
  | { kind: 'donuts'; at: number }
  // Out through the valley and home again, with whoever was aboard.
  | { kind: 'joyride'; at: number }
  // To whoever whistled: from where the truck was to where they stood.
  // rest: Marx was reading at the tailgate, so he walks to his door first.
  | { kind: 'called'; at: number; by: string; from: XZ; to: XZ; rest: boolean }
  // Home with the whistler, from the end of the call's road.
  | { kind: 'ferry'; at: number; from: XZ; to: XZ }

export interface TruckState {
  leg: Leg
  // Socket ids in the bed, in the order they climbed in.
  riders: string[]
}

// What the valley knows of the roads, from the build that opened the
// world: where the truck parks, and how long the joyride takes, out and
// home, Marx's walk to his door included.
export interface TruckRoutes {
  home: XZ
  joyrideMs: number
}

export type MarxConfig = typeof CONFIG.truck

// Marx's walk from the tailgate round the rear corner and up the driver
// side to his door, truck-local (truck.ts draws it); a drive that starts
// with him reading holds until he is in.
export const TAILGATE: XZ = { x: 0.8, z: -3.2 }
export const TO_DOOR: readonly XZ[] = [
  TAILGATE,
  { x: 1.4, z: -3.0 },
  { x: 1.4, z: 0.7 },
]
export const WALK_SPEED = 1.4 // m/s, an easy stroll
export const TO_DOOR_SECONDS =
  TO_DOOR.slice(1).reduce(
    (sum, p, i) => sum + Math.hypot(p.x - TO_DOOR[i].x, p.z - TO_DOOR[i].z),
    0
  ) / WALK_SPEED

export function createTruck(now: number): TruckState {
  return {
    leg: { kind: 'parked', at: now, from: null, leavesAt: null },
    riders: [],
  }
}

const dist = (a: XZ, b: XZ) => Math.hypot(a.x - b.x, a.z - b.z)

// Generously, how long a drive between two points takes by road.
function driveMs(a: XZ, b: XZ, cfg: MarxConfig): number {
  return ((dist(a, b) * cfg.roadFactor) / cfg.speed + cfg.slackSeconds) * 1000
}

// When a parked truck is surely home: at once, or once its drive home is
// surely done.
export function homeAt(
  leg: Extract<Leg, { kind: 'parked' }>,
  routes: TruckRoutes,
  cfg: MarxConfig = CONFIG.truck
): number {
  const from = leg.from
  if (!from) return leg.at
  if (from.kind === 'donuts') return leg.at + cfg.donutHomeSeconds * 1000
  const far = Math.max(dist(from.from, routes.home), dist(from.to, routes.home))
  return leg.at + ((far * cfg.roadFactor) / cfg.speed + cfg.slackSeconds) * 1000
}

// When the truck's leg next changes on its own, or null for a called
// truck, which waits for its caller.
export function nextChange(
  truck: TruckState,
  routes: TruckRoutes,
  cfg: MarxConfig = CONFIG.truck
): number | null {
  const { leg } = truck
  switch (leg.kind) {
    case 'parked':
      if (leg.leavesAt !== null) return leg.leavesAt
      return homeAt(leg, routes, cfg) + cfg.readSeconds * 1000
    case 'donuts':
      return leg.at + cfg.donutSeconds * 1000
    case 'joyride':
      return leg.at + routes.joyrideMs
    case 'ferry':
      return leg.at + driveMs(leg.to, routes.home, cfg)
    case 'called':
      return null
  }
}

// Why the truck's leg changed, for the valley's frames and the log.
export type TruckChange = 'depart' | 'home' | 'donuts' | 'back'

// Past this many changes in one settle (days with nobody about), the
// truck is simply put back at the Citgo, reading.
const MAX_CHANGES = 64

// The truck moved on through every change due by `now`: the countdown
// running out, the joyride or the ride home done, his reading done, his
// donuts done. Returns the truck as it stands at `now` and the changes on
// the way, oldest first.
export function settleTruck(
  truck: TruckState,
  now: number,
  routes: TruckRoutes,
  cfg: MarxConfig = CONFIG.truck
): { truck: TruckState; changes: TruckChange[] } {
  let next = truck
  const changes: TruckChange[] = []
  for (let i = 0; i < MAX_CHANGES; i++) {
    const due = nextChange(next, routes, cfg)
    if (due === null || due > now) return { truck: next, changes }
    const { leg } = next
    switch (leg.kind) {
      case 'parked':
        if (leg.leavesAt !== null) {
          next = { ...next, leg: { kind: 'joyride', at: due } }
          changes.push('depart')
        } else {
          next = { ...next, leg: { kind: 'donuts', at: due } }
          changes.push('donuts')
        }
        break
      case 'donuts':
        next = {
          ...next,
          leg: {
            kind: 'parked',
            at: due,
            from: { kind: 'donuts', at: leg.at, cut: due },
            leavesAt: null,
          },
        }
        changes.push('back')
        break
      case 'joyride':
      case 'ferry':
        // Home: whoever is still aboard is let off at the Citgo.
        next = {
          leg: { kind: 'parked', at: due, from: null, leavesAt: null },
          riders: [],
        }
        changes.push('home')
        break
      case 'called':
        return { truck: next, changes }
    }
  }
  return {
    truck: {
      leg: { kind: 'parked', at: now, from: null, leavesAt: null },
      riders: [],
    },
    changes: [...changes, 'home'],
  }
}

// A refusal, and why.
export interface Refused {
  refused: string
}

export function refused(result: TruckState | Refused): result is Refused {
  return 'refused' in result
}

// Someone arrived in the valley: if Marx is at his donuts he stops and
// drives home for them. The truck as it was otherwise.
export function arrive(truck: TruckState, now: number): TruckState {
  const { leg } = truck
  if (leg.kind !== 'donuts') return truck
  return {
    ...truck,
    leg: {
      kind: 'parked',
      at: now,
      from: { kind: 'donuts', at: leg.at, cut: now },
      leavesAt: null,
    },
  }
}

// `id` climbs into the bed: of the truck parked at the Citgo, which starts
// the countdown if it is not running already; or of the truck they
// whistled, which drives them home.
export function board(
  truck: TruckState,
  id: string,
  now: number,
  cfg: MarxConfig = CONFIG.truck
): TruckState | Refused {
  if (truck.riders.includes(id)) return { refused: 'aboard' }
  const { leg } = truck
  if (leg.kind === 'parked') {
    return {
      riders: [...truck.riders, id],
      leg: {
        ...leg,
        leavesAt: leg.leavesAt ?? now + cfg.countdownSeconds * 1000,
      },
    }
  }
  if (leg.kind === 'called') {
    if (leg.by !== id) return { refused: 'not-yours' }
    return {
      riders: [id],
      leg: { kind: 'ferry', at: now, from: leg.from, to: leg.to },
    }
  }
  return { refused: 'gone' }
}

// `id` gets out of the bed: off the parked truck (the countdown stops when
// the bed is empty), or over the side wherever the truck is.
export function hopOut(truck: TruckState, id: string): TruckState | Refused {
  if (!truck.riders.includes(id)) return { refused: 'not-aboard' }
  const riders = truck.riders.filter((r) => r !== id)
  const { leg } = truck
  if (leg.kind === 'parked' && riders.length === 0) {
    return { riders, leg: { ...leg, leavesAt: null } }
  }
  return { ...truck, riders }
}

// `id` whistles from `to`, the truck being at `from` as their client saw
// it. Only an empty truck answers, reading or at its donuts; one whistle
// at a time.
export function call(
  truck: TruckState,
  id: string,
  from: XZ,
  to: XZ,
  now: number
): TruckState | Refused {
  const { leg } = truck
  if (truck.riders.length > 0) return { refused: 'busy' }
  if (leg.kind !== 'parked' && leg.kind !== 'donuts') {
    return { refused: 'busy' }
  }
  return {
    ...truck,
    leg: {
      kind: 'called',
      at: now,
      by: id,
      from,
      to,
      rest: leg.kind === 'parked',
    },
  }
}

// `id` left the valley: out of the bed, and a truck on its way to them
// turns for home.
export function leave(truck: TruckState, id: string, now: number): TruckState {
  let next = truck.riders.includes(id)
    ? (hopOut(truck, id) as TruckState)
    : truck
  const { leg } = next
  if (leg.kind === 'called' && leg.by === id) {
    next = {
      ...next,
      leg: {
        kind: 'parked',
        at: now,
        from: {
          kind: 'called',
          at: leg.at,
          from: leg.from,
          to: leg.to,
          rest: leg.rest,
          cut: now,
        },
        leavesAt: null,
      },
    }
  }
  return next
}

// A dev server's hurry: the truck's next change, due in `seconds`. Nothing
// for a called truck, which waits for its caller.
export function hurry(
  truck: TruckState,
  now: number,
  seconds: number,
  routes: TruckRoutes,
  cfg: MarxConfig = CONFIG.truck
): TruckState {
  const due = nextChange(truck, routes, cfg)
  if (due === null) return truck
  const shift = now + Math.max(0, seconds) * 1000 - due
  const { leg } = truck
  if (leg.kind === 'parked' && leg.leavesAt !== null) {
    return { ...truck, leg: { ...leg, leavesAt: leg.leavesAt + shift } }
  }
  return { ...truck, leg: { ...leg, at: leg.at + shift } }
}

// Who is in the bed, by id.
export function isAboard(truck: TruckState, id: string): boolean {
  return truck.riders.includes(id)
}
