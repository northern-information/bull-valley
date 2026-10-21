// Pure: the few things in the valley that stop you: the Citgo walls and
// fixtures (store.ts), the berry bush, Gron, Moab and his horse (a capsule
// along its spine), Tyler's Jeep, the wreck by the spawn
// Citgo (a capsule down the car) and the tree it hit, the dishes behind
// it, Bull Valley Plaza
// (stripmall.ts), and the utility poles and streetlights (roadside.ts),
// each a post (a capsule of zero length) unless noted; trees, the truck,
// and everything else stay walk-through. A gate is a wall that stands for
// some and not for others: a locked door (keys.ts), asked whether it is
// open for the body at (x, z) every time it is met. A wall is a
// capsule: a segment on the ground plane, `half` its thickness either side.
// The player asks resolve() after every move and is pushed back out of any
// wall it walked into. A wall with a band stands only for a body whose
// feet are within it: the moat's rim stops whoever is down in the channel
// from walking up its face, but not whoever walks off it from above.
//
// Walls register once as the world is built. A spatial hash of square
// cells, as in ground.ts, keeps a query to the few walls near the point.

import { projectOnSegment } from './coords.ts'
import type { XZ } from './interfaces.ts'

interface Wall {
  a: XZ
  b: XZ
  half: number
  // A gate's name, for `open` to answer.
  gate?: string
  // The heights of the feet it stands for, when not all of them.
  band?: Band
}

// The feet a wall stands for: at or over `low`, at or under `high`.
export interface Band {
  low?: number
  high?: number
}

function stands(band: Band | undefined, feet: number | undefined): boolean {
  if (!band) return true
  if (feet === undefined) return true
  if (band.low !== undefined && feet < band.low) return false
  if (band.high !== undefined && feet > band.high) return false
  return true
}

// Whether gate `gate` lets the body at (x, z) through.
type GateOpen = (gate: string, x: number, z: number) => boolean

// Two passes settle a corner, where pushing out of one wall can push into
// the next.
const PASSES = 2
// A wall files itself in every cell within this much of it, so a body
// whose point sits in the next cell over still finds it. Wider than any
// body radius.
const BODY_MARGIN = 1

export class Walls {
  // Bound, so it passes as a plain function.
  readonly resolve: (x: number, z: number, radius: number, feet?: number) => XZ
  // Bound too: whether a wall stands across the line between two points.
  readonly between: (from: XZ, to: XZ) => boolean
  private readonly cell: number
  private readonly cells = new Map<string, Wall[]>()
  // Every gate stands until told otherwise.
  private open: GateOpen = () => false

  constructor(cell = 50) {
    this.cell = cell
    this.resolve = (x, z, radius, feet) => this.push(x, z, radius, feet)
    this.between = (from, to) => this.crossed(from, to)
  }

  // A gate: a wall that stands unless `open` says it lets a body through.
  addGate(a: XZ, b: XZ, half: number, gate: string) {
    this.file({ a, b, half, gate })
  }

  // Who each gate lets through, from now on.
  setGates(open: GateOpen) {
    this.open = open
  }

  // A wall, standing for every body, or only for feet within `band`.
  addWall(a: XZ, b: XZ, half: number, band?: Band) {
    this.file(band ? { a, b, half, band } : { a, b, half })
  }

  private file(wall: Wall) {
    const { a, b, half } = wall
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

  // Whether the straight line from `from` to `to` crosses a wall from one
  // side of it to the other, so what lies at `to` is out of reach of a
  // hand at `from` (a pickup behind a partition). A post, of no length,
  // never stands across a line; a gate open to the body at `from` stands
  // aside, a banded wall, a ledge, never stands across a reach, and nor
  // does the fixture `to` stands in (a bottle at the back of a cooler).
  private crossed(from: XZ, to: XZ): boolean {
    const i0 = Math.floor(Math.min(from.x, to.x) / this.cell)
    const i1 = Math.floor(Math.max(from.x, to.x) / this.cell)
    const j0 = Math.floor(Math.min(from.z, to.z) / this.cell)
    const j1 = Math.floor(Math.max(from.z, to.z) / this.cell)
    for (let i = i0; i <= i1; i++) {
      for (let j = j0; j <= j1; j++) {
        for (const wall of this.cells.get(`${i},${j}`) ?? []) {
          if (wall.gate !== undefined && this.open(wall.gate, from.x, from.z)) {
            continue
          }
          if (wall.band) continue
          if (holds(wall, to)) continue
          if (crosses(from, to, wall)) return true
        }
      }
    }
    return false
  }

  // (x, z) pushed out until it is at least `radius` clear of every wall
  // that stands for feet at `feet` (every wall, with no feet given).
  private push(x: number, z: number, radius: number, feet?: number): XZ {
    const near = this.cells.get(
      `${Math.floor(x / this.cell)},${Math.floor(z / this.cell)}`
    )
    if (!near) return { x, z }
    let px = x
    let pz = z
    for (let pass = 0; pass < PASSES; pass++) {
      let moved = false
      for (const wall of near) {
        if (wall.gate !== undefined && this.open(wall.gate, x, z)) continue
        if (!stands(wall.band, feet)) continue
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

// Whether `p` stands inside the wall's capsule: in the fixture itself.
function holds(wall: Wall, p: XZ): boolean {
  const { a, b } = wall
  return projectOnSegment(p.x, p.z, a.x, a.z, b.x, b.z).dist < wall.half
}

// Whether segment pq crosses the wall's centreline, run on through the
// round of each end so that walls meeting at a corner leave no chink
// between them: each point strictly on its own side of the other's line.
function crosses(p: XZ, q: XZ, wall: Wall): boolean {
  const dx = wall.b.x - wall.a.x
  const dz = wall.b.z - wall.a.z
  const len = Math.hypot(dx, dz)
  if (len === 0) return false
  const k = wall.half / len
  const a = { x: wall.a.x - dx * k, z: wall.a.z - dz * k }
  const b = { x: wall.b.x + dx * k, z: wall.b.z + dz * k }
  const side = (o: XZ, u: XZ, v: XZ) =>
    (u.x - o.x) * (v.z - o.z) - (u.z - o.z) * (v.x - o.x)
  return side(a, b, p) * side(a, b, q) < 0 && side(p, q, a) * side(p, q, b) < 0
}
