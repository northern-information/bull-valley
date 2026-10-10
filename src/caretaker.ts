// The Caretaker: one floating shade that keeps the corn maze. It walks the
// maze's paths, never through the corn: out to a random corner and home to
// the heart, by turns, where the berry bushes ring the portal. A raider on
// foot in the maze that it can see, or that comes very close, it hunts down
// the paths, and its touch is a strike, as a shadowman's. One flashlight
// does nothing to it. Two raiders' beams on it at once, held, unmake it,
// and it forms again at the heart a few minutes later.
//
// Pure, no three.js. Everything here is in the maze's own metres (maze.ts:
// x away from the road, z along it); MazePlace carries a raider's world
// position in and the Caretaker's out. In the shared valley the server
// steps the one Caretaker everyone sees, beside the shadowmen
// (sharedworld.ts rule 13); played alone, the client steps its own
// (caretakerrig.ts). Tune it in CONFIG.caretaker.

import { CONFIG } from './config.ts'
import { pointSegmentDistance } from './coords.ts'
import {
  cellPoint,
  inMaze,
  mazeHeart,
  mazeSpans,
  mazeToWorld,
  mazeWalk,
  SHINING_MAZE,
  worldToMaze,
} from './maze.ts'
import { inBeam } from './shadowmen.ts'
import type { XZ } from './interfaces.ts'
import type { Cell, MazePlace, MazeSize, Span } from './maze.ts'
import type { Rng } from './rng.ts'
import type { Raider } from './shadowmen.ts'

export type CaretakerConfig = typeof CONFIG.caretaker

export interface Caretaker {
  // Where it floats, in maze-local metres.
  x: number
  z: number
  // The points it is walking to, maze-local, the next one first.
  route: XZ[]
  // Whether its next patrol leg is home to the heart.
  homeward: boolean
  // The raider it hunts, where it last saw them, the seconds left before
  // it gives them up, and the seconds before it works out its way to them
  // again.
  target: string | null
  lastSeen: XZ | null
  forget: number
  rethink: number
  // Seconds it has been held in two beams at once, running back down
  // outside them.
  burn: number
  // Seconds until it forms again at the heart; 0 while it walks.
  gone: number
  // Put somewhere by a spec (placeCaretaker): it floats still there until
  // it has someone to hunt.
  held: boolean
}

// The maze as the Caretaker knows it: its walls' centrelines, half their
// thickness, the cell at the heart, and every path cell the heart can be
// walked to from (the only ones it patrols).
export interface MazeMap {
  grid: readonly string[]
  size: MazeSize
  spans: Span[]
  half: number
  heart: Cell
  cells: Cell[]
  reachable: Set<number>
}

export function mazeMap(
  grid: readonly string[] = SHINING_MAZE,
  size: MazeSize = CONFIG.maze.size,
  thickness: number = CONFIG.maze.wallThickness
): MazeMap {
  const cols = grid[0]?.length ?? 0
  const heart = mazeHeart(grid)
  const reachable = new Set<number>([heart.row * cols + heart.col])
  const cells: Cell[] = [heart]
  for (let i = 0; i < cells.length; i++) {
    const { col, row } = cells[i]
    for (const [dc, dr] of [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ]) {
      const c = col + dc
      const r = row + dr
      if (c < 0 || c >= cols || r < 0 || r >= grid.length) continue
      if (grid[r][c] === '#' || reachable.has(r * cols + c)) continue
      reachable.add(r * cols + c)
      cells.push({ col: c, row: r })
    }
  }
  return {
    grid,
    size,
    spans: mazeSpans(grid, size),
    half: thickness / 2,
    heart,
    cells,
    reachable,
  }
}

let built: MazeMap | null = null

// The game's own maze, worked out once.
export function theMaze(): MazeMap {
  built ??= mazeMap()
  return built
}

// Whether two segments in the plane cross.
function crosses(a: XZ, b: XZ, c: XZ, d: XZ): boolean {
  const side = (p: XZ, q: XZ, r: XZ) =>
    (q.x - p.x) * (r.z - p.z) - (q.z - p.z) * (r.x - p.x)
  const d1 = side(c, d, a)
  const d2 = side(c, d, b)
  const d3 = side(a, b, c)
  const d4 = side(a, b, d)
  return d1 * d2 < 0 && d3 * d4 < 0
}

// The closest two segments come to each other.
export function segmentGap(a: XZ, b: XZ, c: XZ, d: XZ): number {
  if (crosses(a, b, c, d)) return 0
  return Math.min(
    pointSegmentDistance(a.x, a.z, c.x, c.z, d.x, d.z),
    pointSegmentDistance(b.x, b.z, c.x, c.z, d.x, d.z),
    pointSegmentDistance(c.x, c.z, a.x, a.z, b.x, b.z),
    pointSegmentDistance(d.x, d.z, a.x, a.z, b.x, b.z)
  )
}

// Whether the straight line from a to b keeps `clearance` metres off the
// corn the whole way: the Caretaker's body passing, or, with 0, a line of
// sight. Out past the maze nothing stands but its outer walls.
export function clearBetween(
  map: MazeMap,
  a: XZ,
  b: XZ,
  clearance: number
): boolean {
  const reach = map.half + clearance
  const x0 = Math.min(a.x, b.x) - reach
  const x1 = Math.max(a.x, b.x) + reach
  const z0 = Math.min(a.z, b.z) - reach
  const z1 = Math.max(a.z, b.z) + reach
  for (const span of map.spans) {
    if (Math.max(span.a.x, span.b.x) < x0 || Math.min(span.a.x, span.b.x) > x1)
      continue
    if (Math.max(span.a.z, span.b.z) < z0 || Math.min(span.a.z, span.b.z) > z1)
      continue
    if (segmentGap(a, b, span.a, span.b) < reach) return false
  }
  return true
}

// The reachable path cell nearest a maze-local point.
export function cellOf(map: MazeMap, p: XZ): Cell {
  const cols = map.grid[0]?.length ?? 1
  const rows = map.grid.length
  const col = Math.round((p.z / map.size.along) * (cols - 1))
  const row = Math.round((p.x / map.size.across) * (rows - 1))
  let best = map.heart
  let bestD = Infinity
  // The cells round it first; a point out past them falls back to the
  // whole maze.
  for (let radius = 1; radius <= 3 && bestD === Infinity; radius += 2) {
    for (let r = row - radius; r <= row + radius; r++) {
      for (let c = col - radius; c <= col + radius; c++) {
        if (!map.reachable.has(r * cols + c) || c < 0 || c >= cols) continue
        const at = cellPoint(map.grid, map.size, { col: c, row: r })
        const d = Math.hypot(at.x - p.x, at.z - p.z)
        if (d < bestD) {
          bestD = d
          best = { col: c, row: r }
        }
      }
    }
  }
  if (bestD < Infinity) return best
  for (const cell of map.cells) {
    const at = cellPoint(map.grid, map.size, cell)
    const d = Math.hypot(at.x - p.x, at.z - p.z)
    if (d < bestD) {
      bestD = d
      best = cell
    }
  }
  return best
}

// The way down the paths from `from` to `to`, as the points to walk to:
// the cells where the walk turns, then `to` itself.
export function routeTo(map: MazeMap, from: XZ, to: XZ): XZ[] {
  const walk = mazeWalk(map.grid, cellOf(map, from), cellOf(map, to))
  return [...walk.map((cell) => cellPoint(map.grid, map.size, cell)), to]
}

export function heartPoint(map: MazeMap): XZ {
  return cellPoint(map.grid, map.size, map.heart)
}

export function createCaretaker(map: MazeMap = theMaze()): Caretaker {
  return {
    ...heartPoint(map),
    route: [],
    homeward: false,
    target: null,
    lastSeen: null,
    forget: 0,
    rethink: 0,
    burn: 0,
    gone: 0,
    held: false,
  }
}

// Down its route `distance` metres, cutting each corner it can clear: the
// Caretaker, or a tunnel shade in the Undercroft (tunnelshades.ts).
export function advance(
  ct: { x: number; z: number; route: XZ[] },
  distance: number,
  map: MazeMap,
  clearance: number
): void {
  let budget = distance
  while (budget > 0 && ct.route.length > 0) {
    while (
      ct.route.length > 1 &&
      clearBetween(map, ct, ct.route[1], clearance)
    ) {
      ct.route.shift()
    }
    const next = ct.route[0]
    const d = Math.hypot(next.x - ct.x, next.z - ct.z)
    if (d <= budget) {
      ct.x = next.x
      ct.z = next.z
      budget -= d
      ct.route.shift()
    } else {
      ct.x += ((next.x - ct.x) / d) * budget
      ct.z += ((next.z - ct.z) / d) * budget
      budget = 0
    }
  }
}

function giveUp(ct: Caretaker): void {
  ct.held = false
  ct.target = null
  ct.lastSeen = null
  ct.forget = 0
  ct.route = []
  // Back to the berries.
  ct.homeward = true
}

export interface CaretakerStep {
  dt: number
  // Every raider the valley knows, in world metres (shadowmen.ts Raider:
  // who can be struck, and their beam).
  raiders: readonly Raider[]
  place: MazePlace
}

export interface CaretakerUpdate {
  // The raider it touched this step, if any.
  struck: string[]
  // Where it was unmade this step, in world metres, and the raiders whose
  // beams were on it when it came apart.
  burst: XZ | null
  unmadeBy: string[]
}

// One step of the Caretaker, dt seconds on. Mutates ct.
export function stepCaretaker(
  ct: Caretaker,
  rng: Rng,
  { dt, raiders, place }: CaretakerStep,
  cfg: CaretakerConfig = CONFIG.caretaker,
  map: MazeMap = theMaze()
): CaretakerUpdate {
  const none: CaretakerUpdate = { struck: [], burst: null, unmadeBy: [] }
  if (ct.gone > 0) {
    ct.gone = Math.max(0, ct.gone - dt)
    if (ct.gone === 0) Object.assign(ct, createCaretaker(map))
    return none
  }
  const local = raiders.map((r) => ({ r, at: worldToMaze(place, r) }))

  // Two raiders' beams at once, each with the corn out of the way.
  const world = mazeToWorld(place, ct)
  const holders: string[] = []
  for (const { r, at } of local) {
    if (!r.beam) continue
    const chest = { ...world, y: r.beam.floor + cfg.chestHeight }
    if (inBeam(r.beam, chest) && clearBetween(map, at, ct, 0)) {
      holders.push(r.id)
    }
  }
  ct.burn = holders.length >= 2 ? ct.burn + dt : Math.max(0, ct.burn - dt)
  if (ct.burn >= cfg.burnSeconds) {
    giveUp(ct)
    ct.burn = 0
    ct.gone = cfg.respawnSeconds
    return { struck: [], burst: world, unmadeBy: holders }
  }

  // Only a raider who can be struck, and only in the maze.
  const prey = local.filter(
    ({ r, at }) => r.vulnerable && inMaze(map.size, at.x, at.z)
  )
  const sees = (at: XZ) => {
    const d = Math.hypot(at.x - ct.x, at.z - ct.z)
    return (
      d <= cfg.senseRadius ||
      (d <= cfg.sightRange && clearBetween(map, ct, at, 0))
    )
  }
  let quarry = ct.target ? prey.find(({ r }) => r.id === ct.target) : undefined
  if (ct.target && !quarry) giveUp(ct)
  if (quarry) {
    if (sees(quarry.at)) {
      ct.lastSeen = quarry.at
      ct.forget = cfg.forgetSeconds
    } else {
      ct.forget -= dt
      if (ct.forget <= 0) giveUp(ct)
      quarry = undefined
    }
  }
  if (!ct.target) {
    let best = Infinity
    for (const p of prey) {
      const d = Math.hypot(p.at.x - ct.x, p.at.z - ct.z)
      if (d < best && sees(p.at)) {
        best = d
        quarry = p
      }
    }
    if (quarry) {
      ct.target = quarry.r.id
      ct.lastSeen = quarry.at
      ct.forget = cfg.forgetSeconds
      ct.rethink = 0
      ct.route = []
    }
  }

  if (ct.target && ct.lastSeen) {
    ct.rethink -= dt
    if (clearBetween(map, ct, ct.lastSeen, cfg.clearance)) {
      ct.route = [ct.lastSeen]
    } else if (ct.rethink <= 0 || ct.route.length === 0) {
      ct.route = routeTo(map, ct, ct.lastSeen)
      ct.rethink = cfg.rethinkSeconds
    }
    advance(ct, cfg.huntSpeed * dt, map, cfg.clearance)
    if (
      quarry &&
      Math.hypot(quarry.at.x - ct.x, quarry.at.z - ct.z) < cfg.touchRadius
    ) {
      const struck = [quarry.r.id]
      giveUp(ct)
      return { struck, burst: null, unmadeBy: [] }
    }
    return none
  }

  // Patrol: out to a random corner of the maze, then home, by turns.
  if (ct.held) return none
  if (ct.route.length === 0) {
    const to = ct.homeward
      ? heartPoint(map)
      : cellPoint(
          map.grid,
          map.size,
          map.cells[Math.floor(rng() * map.cells.length)]
        )
    ct.homeward = !ct.homeward
    ct.route = routeTo(map, ct, to)
  }
  advance(ct, cfg.patrolSpeed * dt, map, cfg.clearance)
  return none
}

// Where it floats in the world, or null while it is unmade.
export function caretakerAt(ct: Caretaker, place: MazePlace): XZ | null {
  return ct.gone > 0 ? null : mazeToWorld(place, ct)
}
