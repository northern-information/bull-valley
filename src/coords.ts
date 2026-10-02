// Pure coordinate and geometry helpers for the Bull Valley unit square
// (x right/east, y down/south — the projection scripts/fetch_bull_valley.cjs
// writes into geo.json). No three.js imports: tests/unit/coords.test.ts
// runs these directly in Node.

import type { Metres, UnitPoint } from './interfaces.ts'

export interface Bounds {
  minX: number
  minY: number
  maxX: number
  maxY: number
}
//
// World space is three.js metres centred on the square: +x east, +z south,
// so north is -z.

export function unitToWorld(
  u: number,
  v: number,
  metres: Metres
): { x: number; z: number } {
  return { x: (u - 0.5) * metres.width, z: (v - 0.5) * metres.height }
}

// Bilinear sample of a size×size height grid over the unit square. Heights are
// normalized 0..1 (terrain.png's 16 bits, R high byte + G low byte); callers
// scale by the metre range recorded in geo.json.terrain.
export function bilinearHeight(
  heights: ArrayLike<number>,
  size: number,
  u: number,
  v: number
): number {
  const x = Math.min(size - 1.001, Math.max(0, u * (size - 1)))
  const y = Math.min(size - 1.001, Math.max(0, v * (size - 1)))
  const ix = Math.floor(x)
  const iy = Math.floor(y)
  const dx = x - ix
  const dy = y - iy
  const at = (a: number, b: number) => heights[b * size + a]
  return (
    at(ix, iy) * (1 - dx) * (1 - dy) +
    at(ix + 1, iy) * dx * (1 - dy) +
    at(ix, iy + 1) * (1 - dx) * dy +
    at(ix + 1, iy + 1) * dx * dy
  )
}

// Ray cast over a [[x, y], …] ring.
export function pointInPolygon(
  x: number,
  y: number,
  poly: readonly UnitPoint[]
): boolean {
  let inside = false
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const xi = poly[i][0]
    const yi = poly[i][1]
    const xj = poly[j][0]
    const yj = poly[j][1]
    const crosses =
      yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi
    if (crosses) inside = !inside
  }
  return inside
}

export function polygonBounds(poly: readonly UnitPoint[]): Bounds {
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  for (const [x, y] of poly) {
    if (x < minX) minX = x
    if (y < minY) minY = y
    if (x > maxX) maxX = x
    if (y > maxY) maxY = y
  }
  return { minX, minY, maxX, maxY }
}

// The closest point on the segment a-b to p: where it is, how far along
// the segment it sits (t from 0 at a to 1 at b), and the distance to p. A
// zero-length segment projects onto a.
export interface SegmentProjection {
  x: number
  y: number
  t: number
  dist: number
}

export function projectOnSegment(
  px: number,
  py: number,
  ax: number,
  ay: number,
  bx: number,
  by: number
): SegmentProjection {
  const dx = bx - ax
  const dy = by - ay
  const len2 = dx * dx + dy * dy
  const t =
    len2 === 0
      ? 0
      : Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / len2))
  const x = ax + t * dx
  const y = ay + t * dy
  return { x, y, t, dist: Math.hypot(px - x, py - y) }
}

export function pointSegmentDistance(
  px: number,
  py: number,
  ax: number,
  ay: number,
  bx: number,
  by: number
): number {
  return projectOnSegment(px, py, ax, ay, bx, by).dist
}

// Compass bearing of a world-space offset: north (-z) is 0°, east (+x) is 90°.
export function compassBearing(dx: number, dz: number): number {
  let deg = (Math.atan2(dx, -dz) * 180) / Math.PI
  if (deg < 0) deg += 360
  return deg
}
