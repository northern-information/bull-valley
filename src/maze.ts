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
