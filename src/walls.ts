// Pure: the few things in the valley that stop you. Today that is only the
// Citgo walls and fixtures (store.ts); trees, the truck, and everything else
// stay walk-through. A wall is a capsule: a segment on the ground plane,
// `half` its thickness either side. The player asks resolve() after every
// move and is pushed back out of any wall it walked into.
//
// Walls register once as the world is built. A spatial hash of square
// cells, as in ground.ts, keeps a query to the few walls near the point.

import { projectOnSegment } from './coords.ts'
import type { XZ } from './interfaces.ts'

interface Wall {
  a: XZ
  b: XZ
  half: number
}

// Two passes settle a corner, where pushing out of one wall can push into
// the next.
const PASSES = 2
// A wall files itself in every cell within this much of it, so a body
// whose point sits in the next cell over still finds it. Wider than any
// body radius.
const BODY_MARGIN = 1

export class Walls {
  // Bound, so it passes as a plain function.
  readonly resolve: (x: number, z: number, radius: number) => XZ
  private readonly cell: number
  private readonly cells = new Map<string, Wall[]>()

  constructor(cell = 50) {
    this.cell = cell
    this.resolve = (x, z, radius) => this.push(x, z, radius)
  }

  addWall(a: XZ, b: XZ, half: number) {
    const wall: Wall = { a, b, half }
    const pad = half + BODY_MARGIN
    const i0 = Math.floor((Math.min(a.x, b.x) - pad) / this.cell)
    const i1 = Math.floor((Math.max(a.x, b.x) + pad) / this.cell)
    const j0 = Math.floor((Math.min(a.z, b.z) - pad) / this.cell)
    const j1 = Math.floor((Math.max(a.z, b.z) + pad) / this.cell)
    for (let i = i0; i <= i1; i++) {
      for (let j = j0; j <= j1; j++) {
        const key = `${i},${j}`
        let list = this.cells.get(key)
        if (!list) {
          list = []
          this.cells.set(key, list)
        }
        list.push(wall)
      }
    }
  }

  // (x, z) pushed out until it is at least `radius` clear of every wall.
  private push(x: number, z: number, radius: number): XZ {
    const near = this.cells.get(
      `${Math.floor(x / this.cell)},${Math.floor(z / this.cell)}`
    )
    if (!near) return { x, z }
    let px = x
    let pz = z
    for (let pass = 0; pass < PASSES; pass++) {
      let moved = false
      for (const wall of near) {
        const clear = wall.half + radius
        const p = projectOnSegment(
          px,
          pz,
          wall.a.x,
          wall.a.z,
          wall.b.x,
          wall.b.z
        )
        if (p.dist >= clear) continue
        if (p.dist > 1e-9) {
          const k = clear / p.dist
          px = p.x + (px - p.x) * k
          pz = p.y + (pz - p.y) * k
        } else {
          // Exactly on the centreline: out along the wall's normal.
          const dx = wall.b.x - wall.a.x
          const dz = wall.b.z - wall.a.z
          const len = Math.hypot(dx, dz) || 1
          px = p.x - (dz / len) * clear
          pz = p.y + (dx / len) * clear
        }
        moved = true
      }
      if (!moved) break
    }
    return { x: px, z: pz }
  }
}
