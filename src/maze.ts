// Pure: the corn maze across Lake Avenue from the spawn Citgo, laid out
// after the hedge maze in The Shining. No three.js: world.ts plants it,
// tests/unit/maze.test.ts walks it.
//
// The layout is a grid of characters: `#` is corn, `.` is path. Columns
// run along the road and rows run away from it. Walls stand on the even
// columns and mostly on every fourth row; the rows are traced that finely
// so the few walls that sit halfway between the others have a row of
// their own. A wall is a run of `#` from one character's centre to
// another's. Traced from an overhead render of the film's maze and
// mirrored, so its one gate is on the left, the end nearest the station.

import { projectOnSegment } from './coords.ts'

export const SHINING_MAZE: readonly string[] = [
  '#########################################################',
  '#...........................#...........................#',
  '#...........................#...........................#',
  '#...........................#...........................#',
  '#.###########.###########.#.#.#########.###############.#',
  '#.#.......................#.#.#.........#.............#.#',
  '#.#.......................#.#.#.........#.............#.#',
  '#.#.......................#.#.#.........#.............#.#',
  '#.#.#########.#############.#.#.#######.#.###########.#.#',
  '#.#.#.........#...........#.#.#.......#.#...........#.#.#',
  '#.#.#.........#...........#.#.#.......#.#...........#.#.#',
  '#.#.#.........#...........#.#.#.......#.#...........#.#.#',
  '#.#.#.#######.#.#########.#.#.#########.###########.#.#.#',
  '#.#.#.#.....#.#.#.......#.#.#.....................#.#.#.#',
  '#.#.#.#.....#.#.#.......#.#.#.....................#.#.#.#',
  '#.#.#.#.....#.#.#.......#.#.#.....................#.#.#.#',
  '#.#.#.#.###.#.#.#.#####.#.#.#####################.#.#.#.#',
  '#.#.#.#.#...#.#.#.#.....#.#.#.........#.........#.#.#.#.#',
  '#.#.#.#.#...#.#.#.#.....#.#.#.........#.........#.#.#.#.#',
  '#.#.#.#.#...#.#.#.#.....#.#.#.........#.........#.#.#.#.#',
  '#.#.#.#.#.###.#.#.#.#####.#.#.#######.#.#######.#.#.#.#.#',
  '#.#.#.#.#.#...#.#.#.......#...#.....#...#.....#.#.#.#.#.#',
  '#.#.#.#.#.#...#.#.#.......#...#.....#...#.....#.#.#.#.#.#',
  '#.#.#.#.#.#...#.#.#.......#...#.....#...#.....#.#.#.#.#.#',
  '#.#.#.#.#.#.###.#.###.#########.###.#####.###.#.#.#.#.#.#',
  '#.#.#.#.#.#.#...............................#.#.#.#.#.#.#',
  '#.#.#.#.#.#.#...............................#.#.#.#.#.#.#',
  '#.#.#.#.#.#.#...............................#.#...#.#.#.#',
  '#.#.#.#.#.#.#.#.##########.######.#######.#.#.#...#.#.#.#',
  '#...#.#.#...#.#...........................#.#.#...#.#.#.#',
  '#...#.#.#...#.#...........................#.#.#####.#.#.#',
  '#...#.#.#...#.#...........................#.#.......#.#.#',
  '#.###.#.#####.#.#####.####.####.###.#####.#.#.......#.#.#',
  '#...#.......#.#...........................#.#.......#.#.#',
  '#...#.......#.#...........................#.#######.#.#.#',
  '#...#.......#.#...........................#.........#...#',
  '....#######.#.#...........................#.........#...#',
  '#...#.......#.#...........................#.........#...#',
  '#...#.......#.#...........................#.#############',
  '#...#.......#.#...........................#.......#.....#',
  '#.###########.#.#####.####.####.###.#####.#.......#.....#',
  '#...#.......#.#...................................#.....#',
  '#...#.......#.#.............................#####.#.###.#',
  '#...#.......#.#.............................#...#.#.#...#',
  '#.#.#.#####.#.#.#.########.############.#####...#.#.#...#',
  '#.#.#.#...#.#...#...........#.......#...#.......#.#.#...#',
  '#.#.#.#...#.#...#...........#.......#...#.....#.#.#.#.#.#',
  '#.#.#.#...#.#...#...........#.......#...#.....#.#.#.#.#.#',
  '#.#.#.#.###.###.#.#.#######.#.#####.#.#.#.#####.#.#.#.#.#',
  '#.#.#.#.#.#...#.#.#.......#.#.#.....#.#.#.#.....#.#.#.#.#',
  '#.#.#.#.#.#...#.#.#.......#.#.#.....#.#.#.#.....#.#.#.#.#',
  '#.#.#.#.#.#...#.#.#.......#.#.#.....#.#.#.#.....#.#.#.#.#',
  '#.#.#.#.#.###.#.#.#.#####.#.#.#.#####.#.#.#.#####.#.#.#.#',
  '#.#.#.#.#.....#.#.#.......#.#.#.#.....#.#.#.......#.#.#.#',
  '#.#.#.#.#.....#.#.#.......#.#.#.#.....#.#.#.......#.#.#.#',
  '#.#.#.#.#.....#.#.#.......#.#.#.#.....#.#.#.......#.#.#.#',
  '#.#.#.#.#######.#.#########.#.#.#.#####.#.#########.#.#.#',
  '#.#.#.#.........#...........#.#.#.......#...........#.#.#',
  '#.#.#.#.........#...........#.#.#.......#...........#.#.#',
  '#.#.#.#.........#...........#.#.#.......#...........#.#.#',
  '#.#.#.#######################.#.###################.#.#.#',
  '#.#.#...........#.............#.....................#.#.#',
  '#.#.#...........#.............#.....................#.#.#',
  '#.#.#...........#.............#.....................#.#.#',
  '#.#.###########.#.#########.#########################.#.#',
  '#.#...........................#.......................#.#',
  '#.#...........................#.......................#.#',
  '#.#...........................#.......................#.#',
  '#.#############.#############.#.#########.#############.#',
  '#.............................#.........................#',
  '#.............................#.........................#',
  '#.............................#.........................#',
  '#########################################################',
]

// A grid position: column along the road, row away from it.
export interface Cell {
  col: number
  row: number
}

// One straight wall, from the centre of one `#` to the centre of another
// in the same row or column. A lone `#` is a post: a and b are the same.
export interface MazeRun {
  a: Cell
  b: Cell
}

// The maze's size in metres: `along` the road (the columns) and `across`
// it, away from the road (the rows).
export interface MazeSize {
  along: number
  across: number
}

function isCorn(grid: readonly string[], row: number, col: number): boolean {
  return grid[row]?.[col] === '#'
}

// Every wall as a straight run: each row's runs of two or more `#`, then
// each column's. A `#` that touches no other is a post. A corner belongs
// to both runs that meet there, so the corn closes round it.
export function mazeRuns(grid: readonly string[]): MazeRun[] {
  const rows = grid.length
  const cols = grid[0]?.length ?? 0
  const runs: MazeRun[] = []
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      if (!isCorn(grid, row, col)) continue
      const start = col
      while (isCorn(grid, row, col + 1)) col++
      if (col > start) runs.push({ a: { col: start, row }, b: { col, row } })
    }
  }
  for (let col = 0; col < cols; col++) {
    for (let row = 0; row < rows; row++) {
      if (!isCorn(grid, row, col)) continue
      const start = row
      while (isCorn(grid, row + 1, col)) row++
      if (row > start) runs.push({ a: { col, row: start }, b: { col, row } })
    }
  }
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      const alone =
        isCorn(grid, row, col) &&
        !isCorn(grid, row, col - 1) &&
        !isCorn(grid, row, col + 1) &&
        !isCorn(grid, row - 1, col) &&
        !isCorn(grid, row + 1, col)
      if (alone) runs.push({ a: { col, row }, b: { col, row } })
    }
  }
  return runs
}

// The path cells on the maze's edge: its gates.
export function mazeGates(grid: readonly string[]): Cell[] {
  const rows = grid.length
  const cols = grid[0]?.length ?? 0
  const gates: Cell[] = []
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      const edge =
        row === 0 || col === 0 || row === rows - 1 || col === cols - 1
      if (edge && !isCorn(grid, row, col)) gates.push({ col, row })
    }
  }
  return gates
}

// The path cell nearest the middle of the grid: the court at the maze's
// heart, where the worn trail leads.
export function mazeHeart(grid: readonly string[]): Cell {
  const rows = grid.length
  const cols = grid[0]?.length ?? 0
  const mid = { col: (cols - 1) / 2, row: (rows - 1) / 2 }
  let best: Cell = { col: 0, row: 0 }
  let bestD = Infinity
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      if (isCorn(grid, row, col)) continue
      const d = Math.hypot(col - mid.col, row - mid.row)
      if (d < bestD) {
        bestD = d
        best = { col, row }
      }
    }
  }
  return best
}

// The shortest walk along the paths from one cell to another, as the
// cells where it turns, both ends included; empty when the two never meet.
export function mazeWalk(
  grid: readonly string[],
  from: Cell,
  to: Cell
): Cell[] {
  const cols = grid[0]?.length ?? 0
  const id = ({ col, row }: Cell) => row * cols + col
  const open = (c: Cell) =>
    c.col >= 0 &&
    c.col < cols &&
    c.row >= 0 &&
    c.row < grid.length &&
    !isCorn(grid, c.row, c.col)
  if (!open(from) || !open(to)) return []
  const came = new Map<number, Cell | null>([[id(from), null]])
  const queue: Cell[] = [from]
  for (let i = 0; i < queue.length && !came.has(id(to)); i++) {
    const cell = queue[i]
    for (const [dc, dr] of [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ]) {
      const next = { col: cell.col + dc, row: cell.row + dr }
      if (!open(next) || came.has(id(next))) continue
      came.set(id(next), cell)
      queue.push(next)
    }
  }
  if (!came.has(id(to))) return []
  const steps: Cell[] = []
  for (let c: Cell | null = to; c; c = came.get(id(c)) ?? null) steps.push(c)
  steps.reverse()
  // Keep the ends and every cell where the walk turns.
  return steps.filter((cell, i) => {
    if (i === 0 || i === steps.length - 1) return true
    const prev = steps[i - 1]
    const next = steps[i + 1]
    return prev.col - cell.col !== cell.col - next.col
  })
}

// A cell's centre in maze-local metres: x away from the road, from the
// near edge, and z along it, from the gate end. The first and last
// characters sit on the maze's outer edges.
export function cellPoint(
  grid: readonly string[],
  size: MazeSize,
  { col, row }: Cell
): { x: number; z: number } {
  const cols = grid[0]?.length ?? 1
  const rows = grid.length
  return {
    x: (row / Math.max(1, rows - 1)) * size.across,
    z: (col / Math.max(1, cols - 1)) * size.along,
  }
}

// A straight stretch in maze-local metres.
export interface Span {
  a: { x: number; z: number }
  b: { x: number; z: number }
}

// Every wall's centreline in maze-local metres, corner to corner. A wall
// `half` its thickness either side of this line meets its neighbours
// exactly; this is what the walls.ts capsules run along.
export function mazeSpans(grid: readonly string[], size: MazeSize): Span[] {
  return mazeRuns(grid).map((run) => ({
    a: cellPoint(grid, size, run.a),
    b: cellPoint(grid, size, run.b),
  }))
}

// A span drawn as pieces no longer than `maxLength`, each end pushed out
// by `extend` so the corn closes round a corner the way a capsule does. A
// post (a zero-length span) is one square piece `extend` either side,
// along x.
export function spanPieces(
  span: Span,
  extend: number,
  maxLength: number
): Span[] {
  const dx = span.b.x - span.a.x
  const dz = span.b.z - span.a.z
  const length = Math.hypot(dx, dz)
  const ux = length > 0 ? dx / length : 1
  const uz = length > 0 ? dz / length : 0
  const total = length + extend * 2
  const count = Math.max(1, Math.ceil(total / maxLength))
  const pieces: Span[] = []
  for (let i = 0; i < count; i++) {
    const s0 = (total * i) / count - extend
    const s1 = (total * (i + 1)) / count - extend
    pieces.push({
      a: { x: span.a.x + ux * s0, z: span.a.z + uz * s0 },
      b: { x: span.a.x + ux * s1, z: span.a.z + uz * s1 },
    })
  }
  return pieces
}

// The worn trail down the middle of every path in the maze, as a field
// over its floor: `cols` samples along the road (z) by `rows` across it
// (x), `step` metres apart, the first at the maze's corner. Each sample
// holds how far it lies, in metres, from the middle of the path it is on:
// 0 on the line itself, Infinity in the corn. The middle is the ridge of
// the distance to the nearest corn, so the line runs exactly halfway
// between the walls of every corridor, round every turn, up every dead end
// as far as its middle goes, and across the court, and a painter wears mud
// wherever the value is small. The ridge also runs a diagonal into every
// inside corner, halfway between two walls that meet there; those are not
// the middle of anything, so only ridge between walls on opposite sides of
// it is kept (middleOf).
export interface TrailField {
  cols: number
  rows: number
  step: number
  fromMiddle: Float32Array
}

export function trailField(
  grid: readonly string[],
  size: MazeSize,
  thickness: number,
  step: number
): TrailField {
  const cols = Math.ceil(size.along / step) + 1
  const rows = Math.ceil(size.across / step) + 1
  const n = cols * rows
  // The corn, as the walls.ts capsules stand it.
  const corn = new Uint8Array(n)
  const half = thickness / 2
  const spans = mazeSpans(grid, size)
  for (const { a, b } of spans) {
    const i0 = Math.max(0, Math.floor((Math.min(a.z, b.z) - half) / step))
    const i1 = Math.min(cols - 1, Math.ceil((Math.max(a.z, b.z) + half) / step))
    const j0 = Math.max(0, Math.floor((Math.min(a.x, b.x) - half) / step))
    const j1 = Math.min(rows - 1, Math.ceil((Math.max(a.x, b.x) + half) / step))
    for (let j = j0; j <= j1; j++) {
      for (let i = i0; i <= i1; i++) {
        const p = projectOnSegment(j * step, i * step, a.x, a.z, b.x, b.z)
        if (p.dist <= half) corn[j * cols + i] = 1
      }
    }
  }
  // How far every sample lies from the corn, then the ridge of that: a
  // sample at least as far as both neighbours on one axis, and further
  // than one of them, so a corridor's middle counts and its length (flat
  // along the corridor) does not.
  const clear = distanceField(corn, cols, rows)
  const ridge = new Uint8Array(n)
  for (let j = 0; j < rows; j++) {
    for (let i = 0; i < cols; i++) {
      const k = j * cols + i
      const d = clear[k]
      if (corn[k] || d < 1) continue
      const peak = (p: number, q: number) =>
        d >= p && d >= q && (d > p || d > q)
      const alongZ = i > 0 && i < cols - 1 && peak(clear[k - 1], clear[k + 1])
      const acrossX =
        j > 0 && j < rows - 1 && peak(clear[k - cols], clear[k + cols])
      const reach = (d + 2) * step + half
      if (
        (alongZ || acrossX) &&
        middleOf(spans, j * step, i * step, step, reach)
      ) {
        ridge[k] = 1
      }
    }
  }
  dropSpecks(ridge, cols, rows, Math.round(2 / step))
  const toRidge = distanceField(ridge, cols, rows)
  const fromMiddle = new Float32Array(n)
  for (let k = 0; k < n; k++) {
    fromMiddle[k] = corn[k] ? Infinity : toRidge[k] * step
  }
  return { cols, rows, step, fromMiddle }
}

// Clears every piece of `set` (samples touching, corners included) of
// fewer than `min` samples: what is left of the ridge by a wall's end once
// its diagonals are gone is a speck, not a trail.
function dropSpecks(
  set: Uint8Array,
  cols: number,
  rows: number,
  min: number
): void {
  const seen = new Uint8Array(set.length)
  for (let start = 0; start < set.length; start++) {
    if (!set[start] || seen[start]) continue
    const piece = [start]
    seen[start] = 1
    for (let p = 0; p < piece.length; p++) {
      const i = piece[p] % cols
      const j = Math.floor(piece[p] / cols)
      for (let dj = -1; dj <= 1; dj++) {
        for (let di = -1; di <= 1; di++) {
          const ni = i + di
          const nj = j + dj
          if (ni < 0 || ni >= cols || nj < 0 || nj >= rows) continue
          const k = nj * cols + ni
          if (set[k] && !seen[k]) {
            seen[k] = 1
            piece.push(k)
          }
        }
      }
    }
    if (piece.length < min) for (const k of piece) set[k] = 0
  }
}

// Whether a point on the ridge lies in the middle of a path, rather than
// on a diagonal into an inside corner. Among the walls nearest it (within
// a sample and a half of the nearest, the ridge being only as exact as its
// samples), a diagonal has just the walls that make the corner, about
// square to each other as seen from the point (60 to 105 degrees: two
// sides, or where a corridor jogs a side and the end of the wall it jogs
// round), and none across from either. The jog's own middle sees that end
// and side wider apart, past 105. A corridor's middle has its walls straight across (180 degrees),
// the curve round a wall's end has the end on one side and the outside
// walls on the other (135 at the turn's middle), and the line across a
// side path's mouth sees the ends of the walls either side of the mouth,
// not their sides: all of those are kept.
function middleOf(
  spans: readonly Span[],
  x: number,
  z: number,
  step: number,
  // No wall further than this matters: past the nearest, and then some.
  reach: number
): boolean {
  const near: { dx: number; dz: number; dist: number; side: boolean }[] = []
  let nearest = Infinity
  for (const { a, b } of spans) {
    if (
      Math.min(a.x, b.x) - reach > x ||
      Math.max(a.x, b.x) + reach < x ||
      Math.min(a.z, b.z) - reach > z ||
      Math.max(a.z, b.z) + reach < z
    ) {
      continue
    }
    const p = projectOnSegment(x, z, a.x, a.z, b.x, b.z)
    nearest = Math.min(nearest, p.dist)
    // Its side, not its end: what a wall into an inside corner shows.
    const side = p.t > 0 && p.t < 1
    near.push({ dx: p.x - x, dz: p.y - z, dist: p.dist, side })
  }
  const within = near.filter((w) => w.dist <= nearest + step * 1.5)
  let square = false
  for (let i = 0; i < within.length; i++) {
    for (let k = i + 1; k < within.length; k++) {
      const u = within[i]
      const v = within[k]
      const cos = (u.dx * v.dx + u.dz * v.dz) / (u.dist * v.dist || 1)
      if (cos < -0.5) return true
      if (cos < 0.5 && cos > -0.25 && (u.side || v.side)) square = true
    }
  }
  return !square
}

// The Euclidean distance, in samples, from every sample to the nearest one
// set in `features` (Felzenszwalb and Huttenlocher's exact transform: down
// the columns, then along the rows). Infinity where none is set.
export function distanceField(
  features: Uint8Array,
  cols: number,
  rows: number
): Float32Array {
  const big = 1e20
  const squared = new Float64Array(cols * rows)
  for (let k = 0; k < squared.length; k++) squared[k] = features[k] ? 0 : big
  const line = (start: number, stride: number, length: number) => {
    const f = new Float64Array(length)
    for (let q = 0; q < length; q++) f[q] = squared[start + q * stride]
    const v = new Int32Array(length)
    const z = new Float64Array(length + 1)
    let k = 0
    v[0] = 0
    z[0] = -Infinity
    z[1] = Infinity
    for (let q = 1; q < length; q++) {
      let s = (f[q] + q * q - (f[v[k]] + v[k] * v[k])) / (2 * q - 2 * v[k])
      while (s <= z[k]) {
        k--
        s = (f[q] + q * q - (f[v[k]] + v[k] * v[k])) / (2 * q - 2 * v[k])
      }
      k++
      v[k] = q
      z[k] = s
      z[k + 1] = Infinity
    }
    k = 0
    for (let q = 0; q < length; q++) {
      while (z[k + 1] < q) k++
      squared[start + q * stride] = (q - v[k]) * (q - v[k]) + f[v[k]]
    }
  }
  for (let i = 0; i < cols; i++) line(i, cols, rows)
  for (let j = 0; j < rows; j++) line(j * cols, 1, cols)
  const out = new Float32Array(squared.length)
  for (let k = 0; k < out.length; k++) {
    out[k] = squared[k] >= big ? Infinity : Math.sqrt(squared[k])
  }
  return out
}

// A spot just outside the maze, with the way back to the corn (inward,
// unit length), in maze-local metres.
export interface EdgeSpot {
  x: number
  z: number
  inX: number
  inZ: number
}

// Spots all the way round the maze, `out` metres off its edge, about
// `spacing` apart along each side, a corner at the start of every side.
export function perimeterSpots(
  size: MazeSize,
  out: number,
  spacing: number
): EdgeSpot[] {
  const { across, along } = size
  // Each side from one corner toward the next, going round, and the way
  // in from it.
  const sides = [
    { x0: 0, z0: 0, x1: across, z1: 0, inX: 0, inZ: 1 },
    { x0: across, z0: 0, x1: across, z1: along, inX: -1, inZ: 0 },
    { x0: across, z0: along, x1: 0, z1: along, inX: 0, inZ: -1 },
    { x0: 0, z0: along, x1: 0, z1: 0, inX: 1, inZ: 0 },
  ]
  const spots: EdgeSpot[] = []
  for (const s of sides) {
    const length = Math.hypot(s.x1 - s.x0, s.z1 - s.z0)
    const count = Math.max(1, Math.round(length / spacing))
    for (let i = 0; i < count; i++) {
      const t = i / count
      spots.push({
        x: s.x0 + (s.x1 - s.x0) * t - s.inX * out,
        z: s.z0 + (s.z1 - s.z0) * t - s.inZ * out,
        inX: s.inX,
        inZ: s.inZ,
      })
    }
  }
  return spots
}

// Whether a point stands inside the portal: within `radius` of its middle.
export function inPortal(
  x: number,
  z: number,
  portal: { x: number; z: number },
  radius: number
): boolean {
  return Math.hypot(x - portal.x, z - portal.z) <= radius
}

// Whether a maze-local point lies within `margin` metres of the maze.
export function inMaze(
  size: MazeSize,
  x: number,
  z: number,
  margin = 0
): boolean {
  return (
    x >= -margin &&
    x <= size.across + margin &&
    z >= -margin &&
    z <= size.along + margin
  )
}

// Where the maze lies in the world: the world point of its maze-local
// origin (the corner nearest the station, CONFIG.maze.at), and the turn
// that carries maze-local +x to (cos yaw, sin yaw), as store.ts toWorld
// turns a station's own parts. The hello carries it, so the valley can
// step the Caretaker (caretaker.ts) in the maze's own metres.
export interface MazePlace {
  x: number
  z: number
  yaw: number
}

export function mazeToWorld(place: MazePlace, p: { x: number; z: number }) {
  const cos = Math.cos(place.yaw)
  const sin = Math.sin(place.yaw)
  return {
    x: place.x + cos * p.x - sin * p.z,
    z: place.z + sin * p.x + cos * p.z,
  }
}

export function worldToMaze(place: MazePlace, p: { x: number; z: number }) {
  const cos = Math.cos(place.yaw)
  const sin = Math.sin(place.yaw)
  const dx = p.x - place.x
  const dz = p.z - place.z
  return { x: cos * dx + sin * dz, z: -sin * dx + cos * dz }
}

// `count` spots on an ellipse round `centre` in maze-local metres, `across`
// and `along` its radii, the first straight across from it: the berry
// bushes round the portal at the heart. With an even count none stands
// square in the court's length, the way the walk comes in.
export function ringSpots(
  centre: { x: number; z: number },
  count: number,
  across: number,
  along: number
): { x: number; z: number }[] {
  const spots: { x: number; z: number }[] = []
  for (let i = 0; i < count; i++) {
    const a = (i / count) * Math.PI * 2
    spots.push({
      x: centre.x + Math.cos(a) * across,
      z: centre.z + Math.sin(a) * along,
    })
  }
  return spots
}
