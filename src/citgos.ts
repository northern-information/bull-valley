// The Citgos a raider has stood at, pure (sharedworld.ts rule 28): which
// station they stand at now, the log the valley keeps of every one visited
// and the last, and of every payphone found (castleyard.ts payphoneSpot),
// and fast travel from one visited Citgo or found payphone to another. The
// valley's reducer runs the log; actions.ts and the map (citgomap.ts) read
// it for fast travel. No three.js, no DOM.

import { CONFIG } from './config.ts'
import { projectOnSegment } from './coords.ts'
import { copy } from './copy.ts'
import { formatCash } from './store.ts'
import type { Facing } from './drops.ts'
import type { FuelStation, XZ } from './interfaces.ts'

// An account's Citgos: every station it has stood at, in the order first
// visited, and the last (indices into world.fuelPoints), or null for none
// yet; and every payphone it has found, in the order found (indices into
// world.payphones; none when absent, as a log kept before there were any).
export interface CitgoLog {
  last: number | null
  visited: number[]
  phones?: number[]
}

export const NO_CITGOS: CitgoLog = { last: null, visited: [] }

// A place fast travel goes from and to: a Citgo by its station, or a
// payphone by its index.
export type Stop = { citgo: number } | { phone: number }

// Every payphone the log has found.
export function phonesOf(log: CitgoLog): readonly number[] {
  return log.phones ?? []
}

// The survey's fuel points a Citgo stands on: every one clear of the
// survey's edge, in order, so the n-th is station n (stations.ts builds
// one at each, indexed like world.fuelPoints).
export function surveyedStations(fuel: readonly FuelStation[]): FuelStation[] {
  return fuel.filter(
    (f) => f.p[0] > 0.015 && f.p[0] < 0.985 && f.p[1] > 0.015 && f.p[1] < 0.985
  )
}

// The station a raider at `at` stands at: the nearest pump island within
// `reach`, or null out in the valley.
export function citgoAt(
  at: XZ,
  stations: readonly XZ[],
  reach: number = CONFIG.portal.visitReach
): number | null {
  let best: number | null = null
  let bestD = reach
  stations.forEach((s, i) => {
    const d = Math.hypot(at.x - s.x, at.z - s.z)
    if (d <= bestD) {
      best = i
      bestD = d
    }
  })
  return best
}

// The log once a raider stands at `station`: it is the last, and visited.
// The same log, unchanged, when it already was.
export function visit(log: CitgoLog, station: number): CitgoLog {
  const seen = log.visited.includes(station)
  if (seen && log.last === station) return log
  return {
    ...log,
    last: station,
    visited: seen ? log.visited : [...log.visited, station],
  }
}

// The payphone a raider at `at` stands at: the nearest within `reach`, or
// null.
export function phoneAt(
  at: XZ,
  phones: readonly XZ[],
  reach: number = CONFIG.castle.yard.payphone.reach
): number | null {
  return citgoAt(at, phones, reach)
}

// The log once a raider finds payphone `phone`; the same log when it was
// already found. A payphone is never the last Citgo: the portal still goes
// to that.
export function findPhone(log: CitgoLog, phone: number): CitgoLog {
  const phones = phonesOf(log)
  if (phones.includes(phone)) return log
  return { ...log, phones: [...phones, phone] }
}

const sameStop = (a: Stop, b: Stop) =>
  'citgo' in a
    ? 'citgo' in b && a.citgo === b.citgo
    : 'phone' in b && a.phone === b.phone

// Whether a raider standing at `from` (null: at no Citgo and no payphone
// found) may fast travel to `to`, or why not: only from a Citgo or a
// found payphone, only to a Citgo visited or a payphone found, and never
// to where they stand.
export function fastTravel(
  log: CitgoLog,
  from: Stop | null,
  to: Stop
): 'ok' | 'not-at-citgo' | 'not-visited' | 'here' {
  if (from === null) return 'not-at-citgo'
  if ('phone' in from && !phonesOf(log).includes(from.phone)) {
    return 'not-at-citgo'
  }
  if (sameStop(from, to)) return 'here'
  const known =
    'citgo' in to
      ? log.visited.includes(to.citgo)
      : phonesOf(log).includes(to.phone)
  return known ? 'ok' : 'not-visited'
}

// Where a raider stands: the Citgo, or else a payphone, or null.
export function stopAt(
  at: XZ,
  stations: readonly XZ[],
  phones: readonly XZ[]
): Stop | null {
  const citgo = citgoAt(at, stations)
  if (citgo !== null) return { citgo }
  const phone = phoneAt(at, phones)
  return phone === null ? null : { phone }
}

// Where fast travel sets a raider down: the middle of the station's
// portal ring, facing its pump island (the camera looks along (-sin yaw,
// -cos yaw)).
export function arrivalAt(ring: XZ, island: XZ): Facing {
  return {
    x: ring.x,
    z: ring.z,
    yaw: Math.atan2(-(island.x - ring.x), -(island.z - ring.z)),
  }
}

// A road as the map draws it: its name ('' for none) and its points in the
// world.
export interface MapRoad {
  name: string
  points: readonly XZ[]
}

// The name of the nearest named road within `reach` metres of `at`, to
// tell one Citgo from another on the map; null with none so near.
export function roadNameNear(
  at: XZ,
  roads: readonly MapRoad[],
  reach = 250
): string | null {
  let best: string | null = null
  let bestD = reach
  for (const { name, points } of roads) {
    if (!name) continue
    for (let i = 0; i < points.length - 1; i++) {
      const a = points[i]
      const b = points[i + 1]
      const { dist } = projectOnSegment(at.x, at.z, a.x, a.z, b.x, b.z)
      if (dist < bestD) {
        best = name
        bestD = dist
      }
    }
  }
  return best
}

// Where fast travel sets a raider down at a payphone: a step out in front
// of it, facing it. Its face looks along (cos yaw, sin yaw).
export function arrivalAtPhone(phone: XZ & { yaw: number }): Facing {
  const fx = Math.cos(phone.yaw)
  const fz = Math.sin(phone.yaw)
  return {
    x: phone.x + fx * 1.6,
    z: phone.z + fz * 1.6,
    yaw: Math.atan2(fx, fz),
  }
}

// What a new log says in the log: each Citgo found since `before`, named
// by `label`, with its bounty when the valley paid one (in a world, for
// any but the first ever; sharedworld.ts rule 28), then each payphone
// found.
export function citgoLines(
  before: CitgoLog,
  after: CitgoLog,
  label: (station: number) => string,
  inWorld: boolean
): string[] {
  const found = after.visited.filter((i) => !before.visited.includes(i))
  const paid = inWorld && after.visited.length > found.length
  const lines = found.map((station) =>
    paid
      ? copy('log.citgo_bounty', {
          citgo: label(station),
          cash: formatCash(CONFIG.bounties.citgo),
        })
      : copy('log.citgo_visited', { citgo: label(station) })
  )
  const had = phonesOf(before)
  for (const phone of phonesOf(after)) {
    if (had.includes(phone)) continue
    lines.push(copy('log.payphone_found'))
  }
  return lines
}
