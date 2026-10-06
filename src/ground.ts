// Pure: the ground under any point. The terrain is a heightfield, and the
// roads, station lots, and store floors are surfaces laid over it a little
// above the ground, so anything stood at the terrain height sinks into them.
// Ground answers "what does something stand on here": the terrain, or the
// surface covering the point, whichever is higher. Everything placed or
// moved in the world asks Ground; only the terrain mesh and the surfaces
// themselves sample the terrain directly.
//
// Surfaces register once as the world is built. A spatial hash of square
// cells keeps a query to the few surfaces near the point, so the player and
// the truck can ask every frame.

import { projectOnSegment } from './coords.ts'
import type { HeightAt, XZ } from './interfaces.ts'

// A point with its height, as a ribbon's centreline carries it.
export interface GroundPoint extends XZ {
  y: number
}

// A run of ribbon between two centreline points, half a width either side.
// Its deck is flat across and linear along, the way the ribbon mesh draws
// it, so standing on it matches what is drawn.
interface Segment {
  kind: 'segment'
  a: GroundPoint
  b: GroundPoint
  half: number
  lift: number
}

// A run of trail between two points, half a width either side: draped on
// the terrain and lifted off it, the way a mud trail or a road's muddy
// shoulder is drawn, so its deck follows the ground both ways.
interface TrailSegment {
  kind: 'trail'
  a: XZ
  b: XZ
  half: number
  lift: number
}

// A rectangle draped on the terrain and lifted off it: `along` runs from
// x0 to x1 on the axis (cos, sin) through (x, z); halfWidth spans the
// perpendicular.
interface Patch {
  kind: 'patch'
  x: number
  z: number
  cos: number
  sin: number
  x0: number
  x1: number
  halfWidth: number
  lift: number
}

// A flat rectangle at a fixed height, like a store floor: laid out as a
// patch, but its deck is `y` everywhere, the way the floor slab draws it.
interface Floor {
  kind: 'floor'
  x: number
  z: number
  cos: number
  sin: number
  x0: number
  x1: number
  halfWidth: number
  y: number
}

type Surface = Segment | TrailSegment | Patch | Floor

export class Ground {
  // The height to stand on at (x, z). Bound, so it passes as a HeightAt.
  readonly at: HeightAt
  private readonly terrain: HeightAt
  private readonly cell: number
  private readonly cells = new Map<string, Surface[]>()

  constructor(terrain: HeightAt, cell = 50) {
    this.terrain = terrain
    this.cell = cell
    this.at = (x, z) => this.heightAt(x, z)
  }

  // A ribbon (a road) along a centreline of points with heights, `width`
  // across, drawn `lift` above those heights.
  addRibbon(points: readonly GroundPoint[], width: number, lift: number) {
    const half = width / 2
    for (let i = 0; i < points.length - 1; i++) {
      const a = points[i]
      const b = points[i + 1]
      this.register(
        { kind: 'segment', a, b, half, lift },
        Math.min(a.x, b.x) - half,
        Math.min(a.z, b.z) - half,
        Math.max(a.x, b.x) + half,
        Math.max(a.z, b.z) + half
      )
    }
  }

  // A trail along a line of points, `width` across, draped `lift` above
  // the terrain.
  addTrail(points: readonly XZ[], width: number, lift: number) {
    const half = width / 2
    for (let i = 0; i < points.length - 1; i++) {
      const a = points[i]
      const b = points[i + 1]
      this.register(
        { kind: 'trail', a, b, half, lift },
        Math.min(a.x, b.x) - half,
        Math.min(a.z, b.z) - half,
        Math.max(a.x, b.x) + half,
        Math.max(a.z, b.z) + half
      )
    }
  }

  // A patch (a lot) on the terrain, `lift` above it.
  addPatch(
    x: number,
    z: number,
    cos: number,
    sin: number,
    x0: number,
    x1: number,
    halfWidth: number,
    lift: number
  ) {
    const patch: Patch = {
      kind: 'patch',
      x,
      z,
      cos,
      sin,
      x0,
      x1,
      halfWidth,
      lift,
    }
    this.registerRect(patch)
  }

  // A flat floor at height `y`, laid out like a patch.
  addFloor(
    x: number,
    z: number,
    cos: number,
    sin: number,
    x0: number,
    x1: number,
    halfWidth: number,
    y: number
  ) {
    this.registerRect({
      kind: 'floor',
      x,
      z,
      cos,
      sin,
      x0,
      x1,
      halfWidth,
      y,
    })
  }

  // The highest surface deck covering (x, z), or null on bare terrain.
  surfaceAt(x: number, z: number): number | null {
    const near = this.cells.get(this.key(x, z))
    if (!near) return null
    let best: number | null = null
    for (const surface of near) {
      const y = this.deck(surface, x, z)
      if (y !== null && (best === null || y > best)) best = y
    }
    return best
  }

  heightAt(x: number, z: number): number {
    const terrain = this.terrain(x, z)
    const surface = this.surfaceAt(x, z)
    return surface === null ? terrain : Math.max(terrain, surface)
  }

  private deck(surface: Surface, x: number, z: number): number | null {
    if (surface.kind === 'segment') {
      const { a, b, half, lift } = surface
      const p = projectOnSegment(x, z, a.x, a.z, b.x, b.z)
      if (p.dist > half) return null
      return a.y + (b.y - a.y) * p.t + lift
    }
    if (surface.kind === 'trail') {
      const { a, b, half, lift } = surface
      const p = projectOnSegment(x, z, a.x, a.z, b.x, b.z)
      return p.dist > half ? null : this.terrain(x, z) + lift
    }
    const dx = x - surface.x
    const dz = z - surface.z
    const along = dx * surface.cos + dz * surface.sin
    const across = -dx * surface.sin + dz * surface.cos
    if (along < surface.x0 || along > surface.x1) return null
    if (Math.abs(across) > surface.halfWidth) return null
    if (surface.kind === 'floor') return surface.y
    return this.terrain(x, z) + surface.lift
  }

  // File a patch or floor under the bounds of its four corners.
  private registerRect(rect: Patch | Floor) {
    const { x, z, cos, sin, x0, x1, halfWidth } = rect
    const xs: number[] = []
    const zs: number[] = []
    for (const a of [x0, x1]) {
      for (const b of [-halfWidth, halfWidth]) {
        xs.push(x + cos * a - sin * b)
        zs.push(z + sin * a + cos * b)
      }
    }
    this.register(
      rect,
      Math.min(...xs),
      Math.min(...zs),
      Math.max(...xs),
      Math.max(...zs)
    )
  }

  private key(x: number, z: number): string {
    return `${Math.floor(x / this.cell)},${Math.floor(z / this.cell)}`
  }

  // File the surface in every cell its bounds touch.
  private register(
    surface: Surface,
    minX: number,
    minZ: number,
    maxX: number,
    maxZ: number
  ) {
    const i0 = Math.floor(minX / this.cell)
    const i1 = Math.floor(maxX / this.cell)
    const j0 = Math.floor(minZ / this.cell)
    const j1 = Math.floor(maxZ / this.cell)
    for (let i = i0; i <= i1; i++) {
      for (let j = j0; j <= j1; j++) {
        const key = `${i},${j}`
        let list = this.cells.get(key)
        if (!list) {
          list = []
          this.cells.set(key, list)
        }
        list.push(surface)
      }
    }
  }
}
