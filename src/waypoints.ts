// Waypoints and the compass (sharedworld.ts rule 37): the points an
// account pins on the map (citgomap.ts), up to WAYPOINT_MAX of them, kept
// by the valley; and where a facing puts any point on the compass strip
// across the top of the screen (compasshud.ts). Pure: no three, no DOM.

import type { Metres, XZ } from './interfaces.ts'

// The most waypoints an account keeps; one more drops the oldest.
export const WAYPOINT_MAX = 5

export type Waypoints = readonly XZ[]

export const NO_WAYPOINTS: Waypoints = []

// `list` with a pin at `at`, the oldest dropped past WAYPOINT_MAX.
export function placeWaypoint(list: Waypoints, at: XZ): Waypoints {
  return [...list, { x: at.x, z: at.z }].slice(-WAYPOINT_MAX)
}

// `list` without its pin `i` (unchanged for no such pin).
export function liftWaypoint(list: Waypoints, i: number): Waypoints {
  if (!Number.isInteger(i) || i < 0 || i >= list.length) return list
  return list.filter((_, j) => j !== i)
}

// The points a client sent, as the valley keeps them: only those inside
// the survey (centred on the world's origin), to the decimetre, the last
// WAYPOINT_MAX.
export function cleanWaypoints(raw: readonly XZ[], metres: Metres): Waypoints {
  const { width, height } = metres
  return raw
    .filter(
      ({ x, z }) =>
        Number.isFinite(x) &&
        Number.isFinite(z) &&
        Math.abs(x) <= width / 2 &&
        Math.abs(z) <= height / 2
    )
    .map(({ x, z }) => ({
      x: Math.round(x * 10) / 10,
      z: Math.round(z * 10) / 10,
    }))
    .slice(-WAYPOINT_MAX)
}

// Whether two lists hold the same pins in the same order.
export function sameWaypoints(a: Waypoints, b: Waypoints): boolean {
  return (
    a.length === b.length && a.every((p, i) => p.x === b[i].x && p.z === b[i].z)
  )
}

// The yaw that faces `to` from `from`: the camera looks along
// (-sin yaw, -cos yaw), so 0 is north (-z) and east is -π/2.
export function yawTo(from: XZ, to: XZ): number {
  return Math.atan2(-(to.x - from.x), -(to.z - from.z))
}

// `a` brought into (-π, π].
function wrap(a: number): number {
  const t = (a + Math.PI) % (Math.PI * 2)
  return (t <= 0 ? t + Math.PI * 2 : t) - Math.PI
}

// Where a facing of `target` sits on a compass strip `span` radians wide
// while the raider faces `yaw`: -1 at the strip's left end, 0 dead ahead,
// 1 at its right end; null when it is off the strip.
export function compassX(
  yaw: number,
  target: number,
  span: number
): number | null {
  const x = wrap(yaw - target) / (span / 2)
  return Math.abs(x) <= 1 ? x : null
}

// The yaw that faces compass bearing `degrees` (0 north, 90 east).
export function bearingYaw(degrees: number): number {
  return (-degrees * Math.PI) / 180
}

// Waypoints off the wire as the client reads them: a garbled list, or an
// older server's none, reads as no pins.
export function toWaypoints(value: unknown): Waypoints {
  if (!Array.isArray(value)) return NO_WAYPOINTS
  return value
    .filter(
      (p): p is XZ =>
        typeof p === 'object' &&
        p !== null &&
        Number.isFinite((p as XZ).x) &&
        Number.isFinite((p as XZ).z)
    )
    .map(({ x, z }) => ({ x, z }))
    .slice(-WAYPOINT_MAX)
}
