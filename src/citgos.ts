// The Citgos a raider has stood at, pure (sharedworld.ts rule 28): which
// station they stand at now, the log the valley keeps of every one visited
// and the last, and fast travel from one visited Citgo to another. The
// valley's reducer runs the log; actions.ts and the map (citgomap.ts) read
// it for fast travel. No three.js, no DOM.

import { CONFIG } from './config.ts'
import { projectOnSegment } from './coords.ts'
import type { Facing } from './drops.ts'
import type { FuelStation, XZ } from './interfaces.ts'

// An account's Citgos: every station it has stood at, in the order first
// visited, and the last (indices into world.fuelPoints), or null for none
// yet.
export interface CitgoLog {
  last: number | null
  visited: number[]
}

export const NO_CITGOS: CitgoLog = { last: null, visited: [] }

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
    last: station,
    visited: seen ? log.visited : [...log.visited, station],
  }
}

// Whether a raider standing at station `from` (null: at none) may fast
// travel to station `to`, or why not: only from a Citgo, only to one
// visited, and never to the one they stand at.
export function fastTravel(
  log: CitgoLog,
  from: number | null,
  to: number
): 'ok' | 'not-at-citgo' | 'not-visited' | 'here' {
  if (from === null) return 'not-at-citgo'
  if (from === to) return 'here'
  if (!log.visited.includes(to)) return 'not-visited'
  return 'ok'
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
