// The Citgos a raider has stood at, pure (sharedworld.ts rule 28): which
// station they stand at now, the log the valley keeps of every one visited
// and the last, and of every portal phone found (one by every Citgo's door,
// one at the drive-in, one on Castle Entropy's rim), and fast travel, which
// always goes to a portal phone: from anywhere with the portal phone in the
// pack, or from any portal phone without it. The valley's reducer runs the
// log; actions.ts and the map (citgomap.ts) read it for fast travel. No
// three.js, no DOM.

import { CONFIG } from './config.ts'
import { projectOnSegment } from './coords.ts'
import { copy } from './copy.ts'
import { formatCash } from './store.ts'
import type { Facing } from './drops.ts'
import type { FuelStation, XZ } from './interfaces.ts'

// An account's Citgos: every station it has stood at, in the order first
// visited, and the last (indices into world.fuelPoints), or null for none
// yet; and every portal phone it has found by standing at it, in the order
// found (indices into world.payphones; none when absent, as a log kept
// before there were any).
export interface CitgoLog {
  last: number | null
  visited: number[]
  phones?: number[]
}

export const NO_CITGOS: CitgoLog = { last: null, visited: [] }

// A portal phone where the world stands it: its face looks along
// (cos yaw, sin yaw), and the site it stands at. One by a Citgo's door
// names its station, and is known once that Citgo is visited, whether or
// not it was stood at.
export interface PortalPhone extends XZ {
  yaw: number
  site: 'castle' | 'drive-in' | 'citgo'
  station?: number
}

// Every portal phone the log has found by standing at it.
export function phonesOf(log: CitgoLog): readonly number[] {
  return log.phones ?? []
}

// Every portal phone the account knows, the ones fast travel goes to: each
// found, in the order found, then each by a visited Citgo's door, in the
// order the phones stand.
export function knownPhones(
  log: CitgoLog,
  phones: readonly Pick<PortalPhone, 'station'>[]
): number[] {
  const known = phonesOf(log).filter((i) => i >= 0 && i < phones.length)
  phones.forEach(({ station }, i) => {
    if (station === undefined || known.includes(i)) return
    if (log.visited.includes(station)) known.push(i)
  })
  return known
}

// The portal phone by Citgo `station`'s door, or null.
export function phoneOfCitgo(
  phones: readonly Pick<PortalPhone, 'station'>[],
  station: number
): number | null {
  const i = phones.findIndex((p) => p.station === station)
  return i < 0 ? null : i
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

// The portal phone a raider at `at` stands at: the nearest within
// `reach`, or null.
export function phoneAt(
  at: XZ,
  phones: readonly XZ[],
  reach: number = CONFIG.castle.yard.payphone.reach
): number | null {
  return citgoAt(at, phones, reach)
}

// The log once a raider finds portal phone `phone`; the same log when it
// was already found. A portal phone is never the last Citgo: the portal
// still goes to that.
export function findPhone(log: CitgoLog, phone: number): CitgoLog {
  const phones = phonesOf(log)
  if (phones.includes(phone)) return log
  return { ...log, phones: [...phones, phone] }
}

// Whether a raider may fast travel to portal phone `to`, or why not:
// standing at portal phone `from` (null: at none), carrying a portal phone
// or not. Only to one known (knownPhones), never to the one stood at, and
// from anywhere with a portal phone in the pack, or else only from a
// portal phone.
export function fastTravel(
  known: readonly number[],
  from: number | null,
  to: number,
  carrying: boolean
): 'ok' | 'no-phone' | 'not-found' | 'here' {
  if (from === to) return 'here'
  if (!known.includes(to)) return 'not-found'
  if (from === null && !carrying) return 'no-phone'
  return 'ok'
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

// Where fast travel sets a raider down: a step out in front of the portal
// phone, facing it. Its face looks along (cos yaw, sin yaw).
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
// any but the first ever; sharedworld.ts rule 28), then each portal phone
// found that was not known before (one by a visited Citgo's door already
// was; `phones` says which stand by which Citgo).
export function citgoLines(
  before: CitgoLog,
  after: CitgoLog,
  label: (station: number) => string,
  inWorld: boolean,
  phones: readonly Pick<PortalPhone, 'station'>[] = []
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
    const station = phones[phone]?.station
    if (station !== undefined && after.visited.includes(station)) continue
    lines.push(copy('log.payphone_found'))
  }
  return lines
}
