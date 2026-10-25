// Pure: the topiaries. The hedge animals of The Shining's Overlook (the
// novel's, two lions, a dog, a rabbit and a buffalo) stand in the corn
// maze, each broadside across a corridor so nothing gets past it. They are
// not shadows: no beam burns them and they never strike. They are there
// to frighten and to stand in the way, and only fire harms them: a torch
// out of the toolbox at the lookout's foot (CONFIG.torch) takes a bite out
// of one a swing, and burned to nothing it grows back a few minutes later
// (`hitTopiary`, `regrow`; the valley keeps each one's health,
// sharedworld.ts rule 39). Each has its own
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
import { pointSegmentDistance } from './coords.ts'
import { cellPoint, mazeGates, mazeToWorld } from './maze.ts'
import { mulberry32 } from './rng.ts'
import type { MazeMap } from './caretaker.ts'
import type { XZ } from './interfaces.ts'
import type { MazePlace } from './maze.ts'

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

// The game's own spots and each animal's share of them, worked out once.
let dealt: { spots: TopiarySpot[]; pools: TopiarySpot[][] } | null = null

export function theTopiaries(): {
  spots: TopiarySpot[]
  pools: TopiarySpot[][]
} {
  if (!dealt) {
    const spots = topiarySpots()
    dealt = { spots, pools: dealSpots(spots) }
  }
  return dealt
}

// Whether a topiary grown back (or never placed) may show itself at the
// spot the clock has it at: only where the raider does not see it, and
// not on them.
export function mayAppear(
  due: TopiaryStand | null,
  sees: (spot: TopiarySpot) => boolean,
  inTheWay: (spot: TopiarySpot) => boolean
): boolean {
  return due !== null && !sees(due.spot) && !inTheWay(due.spot)
}

// --- Fire ------------------------------------------------------------------

// How one topiary stands, as the valley keeps it: its health, and while it
// is burned away, when (valley ms) it grows back; null while it stands.
export interface TopiaryHealth {
  hp: number
  back: number | null
}

export function freshTopiaries(
  hp: number = CONFIG.topiaries.hp
): TopiaryHealth[] {
  return TOPIARIES.map(() => ({ hp, back: null }))
}

// Whether a topiary is burned away.
export function burnedAway(health: TopiaryHealth | undefined): boolean {
  return health !== undefined && health.back !== null
}

// What one swing of a torch takes off, on the valley's roll (0 to 1):
// CONFIG.torch.damage, give or take its spread, never less than one.
export function torchDamage(roll: number, cfg = CONFIG.torch): number {
  const k = 1 - cfg.spread + 2 * cfg.spread * Math.min(1, Math.max(0, roll))
  return Math.max(1, Math.round(cfg.damage * k))
}

// Topiary `index` after a swing that takes `damage`: burned away at
// nothing, to grow back `regrowSeconds` on; null when there is no such
// topiary or it is already burned away.
export function hitTopiary(
  list: readonly TopiaryHealth[],
  index: number,
  damage: number,
  now: number,
  cfg: TopiaryConfig = CONFIG.topiaries
): { list: TopiaryHealth[]; burned: boolean } | null {
  const was = list[index]
  if (!was || was.back !== null) return null
  const hp = Math.max(0, was.hp - damage)
  const burned = hp === 0
  const next = list.map((h, i) =>
    i === index
      ? { hp, back: burned ? now + cfg.regrowSeconds * 1000 : null }
      : h
  )
  return { list: next, burned }
}

// The topiaries at `now`: every one whose time has come grown back whole;
// null when none has.
export function regrow(
  list: readonly TopiaryHealth[],
  now: number,
  hp: number = CONFIG.topiaries.hp
): TopiaryHealth[] | null {
  if (!list.some((h) => h.back !== null && h.back <= now)) return null
  return list.map((h) =>
    h.back !== null && h.back <= now ? { hp, back: null } : h
  )
}

// When the next burned topiary grows back, or null with none burned.
export function nextRegrowth(list: readonly TopiaryHealth[]): number | null {
  let at: number | null = null
  for (const h of list) {
    if (h.back !== null && (at === null || h.back < at)) at = h.back
  }
  return at
}

// How far a world point lies from a spot's spine (the line it stands
// along, across the corridor), with the maze where `place` puts it.
export function spineDistance(
  place: MazePlace,
  spot: TopiarySpot,
  at: XZ
): number {
  const a = mazeToWorld(place, spot.a)
  const b = mazeToWorld(place, spot.b)
  return pointSegmentDistance(at.x, at.z, a.x, a.z, b.x, b.z)
}

// Whether a raider at `at` could have reached topiary `index` with a
// torch: within `reach` of the spine of one of its spots. The valley asks
// it of a swing; where the animal stands as the raider saw it is the
// client's, so any spot of its own does.
export function inTorchReach(
  place: MazePlace,
  index: number,
  at: XZ,
  reach: number,
  pools: readonly TopiarySpot[][] = theTopiaries().pools
): boolean {
  return (pools[index] ?? []).some(
    (spot) => spineDistance(place, spot, at) <= reach
  )
}

// The topiary a swing from `at`, looking along `dir` (unit, level), lands
// on: of the ones standing, by their spines in the world (null for one not
// standing), the nearest within `reach` that lies ahead of the raider, or
// close enough to touch whichever way they face. Null with none.
export function swingTarget(
  spines: readonly ({ a: XZ; b: XZ } | null)[],
  at: XZ,
  dir: XZ,
  reach: number
): number | null {
  let best: number | null = null
  let bestD = Infinity
  spines.forEach((spine, i) => {
    if (!spine) return
    const { a, b } = spine
    const d = pointSegmentDistance(at.x, at.z, a.x, a.z, b.x, b.z)
    if (d > reach || d >= bestD) return
    // The nearest point of the spine, and whether it lies ahead.
    const dx = b.x - a.x
    const dz = b.z - a.z
    const len2 = dx * dx + dz * dz || 1
    const t = Math.max(
      0,
      Math.min(1, ((at.x - a.x) * dx + (at.z - a.z) * dz) / len2)
    )
    const px = a.x + dx * t - at.x
    const pz = a.z + dz * t - at.z
    const ahead = (px * dir.x + pz * dir.z) / (Math.hypot(px, pz) || 1)
    if (d > CONFIG.topiaries.gateHalf + 0.6 && ahead < 0.35) return
    best = i
    bestD = d
  })
  return best
}

// --- Death -----------------------------------------------------------------

// A topiary burned away, `seconds` into its death (CONFIG.topiaries
// deathSeconds): the fire on it (0 to 1, how big), how far it has rolled
// over onto its back (radians, about its spine), how hard its legs kick (0
// to 1), how charred it is (0 to 1), how far it has burned down into ash
// (0 to 1), and whether it is over. It bursts into flame, topples over as
// a body falls (slow, then all at once), kicks on its back while it
// blackens, and the kicking dies down as it burns down and goes out.
export interface DeathPose {
  fire: number
  roll: number
  flail: number
  char: number
  sink: number
  over: boolean
}

export function deathPose(
  seconds: number,
  total: number = CONFIG.topiaries.deathSeconds
): DeathPose {
  const t = Math.max(0, seconds) / total
  const span = (a: number, b: number) =>
    Math.min(1, Math.max(0, (t - a) / (b - a)))
  // Up in flames within the first tenth; out over the last.
  const fire = span(0, 0.1) * (1 - span(0.88, 1))
  // Over onto its back between a tenth and three tenths in, falling.
  const fall = span(0.1, 0.3)
  const roll = Math.PI * fall * fall
  // Kicking from the moment it lands, dying away by eight tenths.
  const flail = t < 0.28 ? 0 : 1 - span(0.45, 0.8)
  return {
    fire,
    roll,
    flail,
    char: span(0.05, 0.6),
    sink: span(0.72, 1),
    over: t >= 1,
  }
}
