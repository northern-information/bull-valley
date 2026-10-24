// Pure: the topiaries. The hedge animals of The Shining's Overlook (the
// novel's, two lions, a dog, a rabbit and a buffalo) stand in the corn
// maze, each broadside across a corridor so nothing gets past it. They are
// not shadows: no beam burns them, they never strike, and nothing is kept.
// They are there to frighten and to stand in the way. Each has its own
// spots in the maze, and on the valley's clock it moves from one to
// another (`topiariesAt`), every client reading the same clock putting it
// in the same place with nothing on the wire. But no raider ever sees one
// move: it goes only while the raider looks at neither where it stood nor
// where it is going (`mayMove`), as the novel's did, so a raider who turns
// round finds it closer, or gone, or standing where the way was open.
//
// Everything here is in the maze's own metres (maze.ts: x away from the
// road, z along it). topiaryrig.ts draws them and stands each one's
// corridor on the walls as a gate (walls.ts addGate) that holds while it
// stands there. Tune them in CONFIG.topiaries.

import { theMaze } from './caretaker.ts'
import { CONFIG } from './config.ts'
import { cellPoint, mazeGates } from './maze.ts'
import { mulberry32 } from './rng.ts'
import type { MazeMap } from './caretaker.ts'
import type { XZ } from './interfaces.ts'

type TopiaryConfig = typeof CONFIG.topiaries

export type TopiaryKind = 'lion' | 'dog' | 'rabbit' | 'buffalo'

// The animals, in the order their spots are dealt.
export const TOPIARIES: readonly TopiaryKind[] = [
  'lion',
  'lion',
  'dog',
  'rabbit',
  'buffalo',
]

// One place a topiary may stand: the middle of a corridor running along
// the road (maze-local z), and the centrelines of the corn either side of
// it (`a` toward the road, `b` away), which its gate runs between.
export interface TopiarySpot {
  id: number
  x: number
  z: number
  a: XZ
  b: XZ
}

// How many path cells from (row, col) to the corn, stepping `dr` rows at
// a time; null when the grid ends first.
function toCorn(
  grid: readonly string[],
  row: number,
  col: number,
  dr: number
): number | null {
  for (let r = row + dr, n = 1; r >= 0 && r < grid.length; r += dr, n++) {
    if (grid[r][col] === '#') return n
  }
  return null
}

// Every spot a topiary may stand on: a reachable path cell in the middle
// of a straight corridor along the road, its corn the same either side at
// the cells before and after it (so no side path opens beside the animal),
// the corridor between `minWidth` and `maxWidth` metres clear, kept off
// the heart and the gate, and each `spacing` from the last one kept.
export function topiarySpots(
  map: MazeMap = theMaze(),
  cfg: TopiaryConfig = CONFIG.topiaries,
  thickness: number = CONFIG.maze.wallThickness
): TopiarySpot[] {
  const { grid, size } = map
  const cols = grid[0]?.length ?? 0
  const at = (row: number, col: number) => cellPoint(grid, size, { col, row })
  const heart = at(map.heart.row, map.heart.col)
  const gates = mazeGates(grid).map((g) => at(g.row, g.col))
  const pitch = size.across / Math.max(1, grid.length - 1)
  const spots: TopiarySpot[] = []
  for (const { row, col } of [...map.cells].sort(
    (p, q) => p.row - q.row || p.col - q.col
  )) {
    if (col < 1 || col > cols - 2) continue
    const up = toCorn(grid, row, col, -1)
    const down = toCorn(grid, row, col, 1)
    if (up === null || down === null || up !== down) continue
    const walled = [col - 1, col + 1].every(
      (c) =>
        grid[row][c] !== '#' &&
        toCorn(grid, row, c, -1) === up &&
        toCorn(grid, row, c, 1) === down
    )
    if (!walled) continue
    const width = (up + down) * pitch - thickness
    if (width < cfg.minWidth || width > cfg.maxWidth) continue
    const p = at(row, col)
    if (Math.hypot(p.x - heart.x, p.z - heart.z) < cfg.clearOfHeart) continue
    if (gates.some((g) => Math.hypot(p.x - g.x, p.z - g.z) < cfg.clearOfGate))
      continue
    if (spots.some((s) => Math.hypot(p.x - s.x, p.z - s.z) < cfg.spacing))
      continue
    spots.push({
      id: spots.length,
      x: p.x,
      z: p.z,
      a: at(row - up, col),
      b: at(row + down, col),
    })
  }
  return spots
}

// The spots dealt out among the animals, shuffled on the seed first so
// each one's spots lie all over the maze: no two ever share a spot.
export function dealSpots(
  spots: readonly TopiarySpot[],
  count: number = TOPIARIES.length,
  seed: number = CONFIG.topiaries.seed
): TopiarySpot[][] {
  const rng = mulberry32(seed)
  const shuffled = [...spots]
  for (let i = shuffled.length - 1; i > 0; i--) {
    const k = Math.floor(rng() * (i + 1))
    ;[shuffled[i], shuffled[k]] = [shuffled[k], shuffled[i]]
  }
  const pools: TopiarySpot[][] = Array.from({ length: count }, () => [])
  shuffled.forEach((spot, i) => pools[i % count].push(spot))
  return pools
}

// Where one topiary stands for a while: the spot, and whether its nose
// points away from the road (+x) or toward it.
export interface TopiaryStand {
  spot: TopiarySpot
  away: boolean
}

// Where each topiary should stand at `seconds` on the valley's clock: each
// keeps a spot for `slotSeconds`, the animals a share of a slot apart, and
// the spot is drawn from its own pool on a seed of the animal and the slot.
export function topiariesAt(
  pools: readonly TopiarySpot[][],
  seconds: number,
  cfg: TopiaryConfig = CONFIG.topiaries
): (TopiaryStand | null)[] {
  return pools.map((pool, i) => {
    if (pool.length === 0) return null
    const slot = Math.floor(seconds / cfg.slotSeconds + i / pools.length)
    const rng = mulberry32(
      Math.imul(i + 1, 0x9e3779b1) ^ Math.imul(slot, 0x85ebca6b) ^ cfg.seed
    )
    // Neighbouring seeds start close; the first draw is thrown away.
    rng()
    const spot = pool[Math.floor(rng() * pool.length)]
    return { spot, away: rng() < 0.5 }
  })
}

// Whether a topiary a raider sees standing at one spot goes to the one the
// clock has for it: only once it is due somewhere else, while the raider
// sees neither spot, and not onto a raider who stands in its way.
export function mayMove(
  shown: TopiaryStand | null,
  due: TopiaryStand | null,
  sees: (spot: TopiarySpot) => boolean,
  inTheWay: (spot: TopiarySpot) => boolean
): boolean {
  if (!due) return false
  if (!shown) return true
  if (shown.spot.id === due.spot.id && shown.away === due.away) return false
  return !sees(shown.spot) && !sees(due.spot) && !inTheWay(due.spot)
}

// The gate a spot's corridor stands on the walls under (walls.ts addGate),
// and back.
const GATE = 'topiary:'

export function topiaryGate(spot: TopiarySpot): string {
  return `${GATE}${spot.id}`
}

export function isTopiaryGate(gate: string): boolean {
  return gate.startsWith(GATE)
}

export function spotOfGate(gate: string): number | null {
  if (!isTopiaryGate(gate)) return null
  const id = Number(gate.slice(GATE.length))
  return Number.isInteger(id) && id >= 0 ? id : null
}
