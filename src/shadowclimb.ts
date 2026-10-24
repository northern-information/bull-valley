// Pure: how a shadow gets between the moat's floor and its rim
// (shadowmen.ts). The ground the valley knows (heightmap.ts valleyGround)
// is the terrain with the channel cut 30 m down into it, so a wall is
// wherever one step would take a body up or down more than it can climb
// (CONFIG.shadowmen.wall). A shadowman never walks through one: he goes
// round, or takes a fire escape down or up (`StairPath`, from
// moat.ts stairPath), treading its flights and landings as a raider would.
// A spider crawls straight up or down the wall's face (`Climb`), and is
// drawn clinging to it (shadowbodies.ts). No three.js, no DOM.

import type { HeightAt, XZ } from './interfaces.ts'

// A fire escape's way from its top on the rim to its foot on the floor.
export type StairPath = readonly (XZ & { y: number })[]

// A wall a step met: where on its line, the unit normal of its face (out
// of the wall, toward the low side, where its face looks), and the heights
// of the ground below it and above it.
export interface WallFace extends XZ {
  nx: number
  nz: number
  low: number
  high: number
}

// How far off the face a spider clings, and how far past the wall it
// steps off at the top or the bottom.
export const CLING = 0.1
const STEP_OFF = 1
// Halvings to find a wall's line along a step, and how far either side
// of it the ground is read for the face's normal.
const BISECTIONS = 12
const NORMAL_REACH = 0.75

// The wall between `from` and `to`, where the ground under them differs by
// more than `wall` metres, or null where it does not.
export function wallBetween(
  ground: HeightAt,
  from: XZ,
  to: XZ,
  wall: number
): WallFace | null {
  const start = ground(from.x, from.z)
  const end = ground(to.x, to.z)
  if (Math.abs(end - start) <= wall) return null
  // The last point still level with `from`, and the first that is not.
  let lo = 0
  let hi = 1
  const at = (t: number): XZ => ({
    x: from.x + (to.x - from.x) * t,
    z: from.z + (to.z - from.z) * t,
  })
  for (let i = 0; i < BISECTIONS; i++) {
    const mid = (lo + hi) / 2
    const p = at(mid)
    if (Math.abs(ground(p.x, p.z) - start) <= wall) lo = mid
    else hi = mid
  }
  const edge = at((lo + hi) / 2)
  // Downhill across the wall: the face looks that way. Where the reading
  // finds no slope (a corner), the way the step went down will do.
  const r = NORMAL_REACH
  let nx = -(ground(edge.x + r, edge.z) - ground(edge.x - r, edge.z))
  let nz = -(ground(edge.x, edge.z + r) - ground(edge.x, edge.z - r))
  let len = Math.hypot(nx, nz)
  if (len === 0) {
    const down = end < start ? 1 : -1
    nx = (to.x - from.x) * down
    nz = (to.z - from.z) * down
    len = Math.hypot(nx, nz) || 1
  }
  return {
    ...edge,
    nx: nx / len,
    nz: nz / len,
    low: Math.min(start, end),
    high: Math.max(start, end),
  }
}

// A spider on a wall's face: the face's normal (WallFace), the height it
// crawls to, and where it steps off the wall when it gets there.
export interface Climb {
  nx: number
  nz: number
  toY: number
  off: XZ
}

// A spider that met `face` coming from `fromY`: where it clings, and the
// climb that takes it to the other side's ground.
export function startClimb(
  face: WallFace,
  fromY: number
): { at: XZ; climb: Climb } {
  const down = fromY > (face.low + face.high) / 2
  // Off at the foot, out from the face; off at the top, back over the rim.
  const out = down ? STEP_OFF : -STEP_OFF
  return {
    at: { x: face.x + face.nx * CLING, z: face.z + face.nz * CLING },
    climb: {
      nx: face.nx,
      nz: face.nz,
      toY: down ? face.low : face.high,
      off: { x: face.x + face.nx * out, z: face.z + face.nz * out },
    },
  }
}

// `y` moved `by` metres toward `toY`, and whether it is there.
export function crawl(
  y: number,
  toY: number,
  by: number
): { y: number; there: boolean } {
  const left = toY - y
  if (Math.abs(left) <= by) return { y: toY, there: true }
  return { y: y + Math.sign(left) * by, there: false }
}

// How long a path is, end to end, up and down included.
export function pathLength(path: StairPath): number {
  let total = 0
  for (let i = 1; i < path.length; i++) {
    const a = path[i - 1]
    const b = path[i]
    total += Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z)
  }
  return total
}

// The point `along` metres down a path from its first point (from its last
// when `reverse`), and whether that is its end.
export function alongPath(
  path: StairPath,
  along: number,
  reverse = false
): XZ & { y: number; end: boolean } {
  const points = reverse ? [...path].reverse() : path
  let left = Math.max(0, along)
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1]
    const b = points[i]
    const leg = Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z)
    if (left <= leg && leg > 0) {
      const t = left / leg
      return {
        x: a.x + (b.x - a.x) * t,
        y: a.y + (b.y - a.y) * t,
        z: a.z + (b.z - a.z) * t,
        end: false,
      }
    }
    left -= leg
  }
  const last = points[points.length - 1]
  return { x: last.x, y: last.y, z: last.z, end: true }
}

// The fire escape whose end on the level of `y` (its top for a shadow on
// the rim, its foot for one on the floor) is nearest `p`, within `wall` of
// that level, going the way that takes it to `toY`: its index, its end,
// and whether it goes down. Null where there is none.
export function nearestStair(
  paths: readonly StairPath[],
  p: XZ & { y: number },
  toY: number,
  wall: number
): { path: number; down: boolean; end: XZ } | null {
  const down = toY < p.y
  let best: { path: number; down: boolean; end: XZ } | null = null
  let nearest = Infinity
  for (let i = 0; i < paths.length; i++) {
    const path = paths[i]
    const end = down ? path[0] : path[path.length - 1]
    const other = down ? path[path.length - 1] : path[0]
    if (!end || Math.abs(end.y - p.y) > wall) continue
    // Only a stair that comes out nearer the height it is going to.
    if (Math.abs(other.y - toY) >= Math.abs(p.y - toY)) continue
    const d = Math.hypot(end.x - p.x, end.z - p.z)
    if (d < nearest) {
      nearest = d
      best = { path: i, down, end: { x: end.x, z: end.z } }
    }
  }
  return best
}
