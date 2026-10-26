// Pure: the celestial graveyard, the precinct of the nephilim and the
// seraphim that Jericho sends a raider to (npcs.ts nearestYard), laid out
// in the survey's graveyard nearest him at four times a raider's scale
// (CONFIG.celestial). Its own frame (a MazePlace, maze.ts mazeToWorld)
// stands at the graveyard's middle with +x out through the gate toward
// him: the iron fence round it with the gate cut on +x, the avenue in
// from the gate along z = 0 to the weeping angel facing back up it, her
// grave at her feet (where a raider with a shovel digs up a mech,
// sharedworld.ts rule 42), the heap of earth by the gate the shovel
// stands in, the candelabra down the avenue in pairs, and the giant
// monuments strewn round it all from one seed, the same for everyone.
// No three.js, no DOM.

import { CONFIG } from './config.ts'
import { mazeToWorld } from './maze.ts'
import { mulberry32, pick, range } from './rng.ts'
import type { XZ } from './interfaces.ts'
import type { MazePlace } from './maze.ts'

// The monuments: a round-topped headstone, a Celtic cross, an obelisk, a
// mourning angel on a plinth, a box tomb, and a broken column.
export type StoneKind =
  'slab' | 'cross' | 'obelisk' | 'mourner' | 'tomb' | 'column'

export const STONE_KINDS: readonly StoneKind[] = [
  'slab',
  'slab',
  'slab',
  'cross',
  'cross',
  'obelisk',
  'mourner',
  'tomb',
  'tomb',
  'column',
]

// How far each kind blocks from its middle, metres.
export const STONE_RADIUS: Readonly<Record<StoneKind, number>> = {
  slab: 2.2,
  cross: 1.4,
  obelisk: 1.8,
  mourner: 2,
  tomb: 3.4,
  column: 1.3,
}

// One monument in the world: its kind, where it stands, which way its
// face looks (radians, the three.js turn about y), how much bigger than
// its kind's own size, and how far it leans off true (radians, about its
// own z).
export interface GiantStone extends XZ {
  kind: StoneKind
  yaw: number
  scale: number
  lean: number
}

// The precinct's frame, at `yard` (its middle) with +x toward `toward`
// (Jericho), so the gate faces the way a raider comes from him.
export function celestialPlaceOf(yard: XZ, toward: XZ): MazePlace {
  const yaw = Math.atan2(toward.z - yard.z, toward.x - yard.x)
  return { x: yard.x, z: yard.z, yaw }
}

// The turn (three.js, about y) that faces an object's own +x along the
// frame's local direction `local` (radians off its +x).
export function facing(place: MazePlace, local: number): number {
  return -(place.yaw + local)
}

// The weeping angel's plinth in the world, and her turn: facing back up
// the avenue to the gate.
export function angelOf(place: MazePlace): XZ & { yaw: number } {
  return {
    ...mazeToWorld(place, { x: CONFIG.celestial.angelAt, z: 0 }),
    yaw: facing(place, 0),
  }
}

// The middle of her grave, where E digs.
export function graveOf(place: MazePlace): XZ {
  return mazeToWorld(place, { x: CONFIG.celestial.grave.at, z: 0 })
}

// The heap of earth by the gate the shovel stands in.
export function shovelOf(place: MazePlace): XZ {
  const { radius, shovel } = CONFIG.celestial
  return mazeToWorld(place, { x: radius - shovel.in, z: shovel.out })
}

// Whether `at` is within `reach` of `spot`; never for a raider the valley
// has not placed.
function within(at: XZ | null, spot: XZ, reach: number): boolean {
  return at !== null && Math.hypot(at.x - spot.x, at.z - spot.z) <= reach
}

// Whether a raider at `at` may take a shovel (`slack` more for the
// valley, whose word on where they are is a beat behind).
export function atShovel(place: MazePlace, at: XZ | null, slack = 0): boolean {
  return within(at, shovelOf(place), CONFIG.celestial.shovelReach + slack)
}

// Whether a raider at `at` may dig the angel's grave.
export function atGrave(place: MazePlace, at: XZ | null, slack = 0): boolean {
  return within(at, graveOf(place), CONFIG.celestial.graveReach + slack)
}

// Whether (x, z) lies within `margin` of the fence (inside or out).
export function inPrecinct(
  place: MazePlace,
  x: number,
  z: number,
  margin = 0
): boolean {
  return (
    Math.hypot(x - place.x, z - place.z) <= CONFIG.celestial.radius + margin
  )
}

// How many posts the fence has round its circle.
export const FENCE_POSTS = 48

// The fence as runs between its posts in the world, round the circle,
// with none across the gate.
export function fenceOf(place: MazePlace): { a: XZ; b: XZ }[] {
  const { radius, gate } = CONFIG.celestial
  // Half the gate's opening, as an angle round the circle.
  const open = Math.asin(Math.min(1, gate / 2 / radius))
  const from = open
  const to = Math.PI * 2 - open
  const runs: { a: XZ; b: XZ }[] = []
  const at = (a: number) =>
    mazeToWorld(place, { x: Math.cos(a) * radius, z: Math.sin(a) * radius })
  for (let i = 0; i < FENCE_POSTS; i++) {
    const a0 = from + ((to - from) * i) / FENCE_POSTS
    const a1 = from + ((to - from) * (i + 1)) / FENCE_POSTS
    runs.push({ a: at(a0), b: at(a1) })
  }
  return runs
}

// The two gate piers in the world, either side of the gap.
export function gatePiersOf(place: MazePlace): [XZ, XZ] {
  const { radius, gate } = CONFIG.celestial
  const x = Math.sqrt(Math.max(0, radius * radius - (gate / 2) ** 2))
  return [
    mazeToWorld(place, { x, z: -gate / 2 }),
    mazeToWorld(place, { x, z: gate / 2 }),
  ]
}

// The candelabra down the avenue in pairs, from just inside the gate to
// the angel's plaza, each a step off the avenue's edge.
export function candelabraOf(place: MazePlace): XZ[] {
  const { radius, avenue, candleEvery, plaza, angelAt } = CONFIG.celestial
  const spots: XZ[] = []
  for (let x = radius - 5; x > angelAt + plaza; x -= candleEvery) {
    for (const side of [-1, 1]) {
      spots.push(mazeToWorld(place, { x, z: side * (avenue / 2 + 1.5) }))
    }
  }
  return spots
}

// Whether the frame's local (x, z) is kept clear of monuments: the
// avenue from the gate in, the angel's plaza, and the heap by the gate.
function keptClear(x: number, z: number): boolean {
  const { avenue, plaza, angelAt, radius, shovel } = CONFIG.celestial
  if (Math.abs(z) < avenue / 2 + 4 && x > angelAt) return true
  if (Math.hypot(x - angelAt, z) < plaza) return true
  return Math.hypot(x - (radius - shovel.in), z - shovel.out) < 5
}

// The giant monuments, strewn from CONFIG.celestial.seed: inside the
// fence with room to walk round them, never on the avenue, the plaza or
// the heap, none nearer another than `spacing`. Most face the avenue; a
// few have gone over a little.
export function stonesOf(place: MazePlace): GiantStone[] {
  const { radius, stones, spacing, seed } = CONFIG.celestial
  const rng = mulberry32(seed)
  const local: (XZ & { kind: StoneKind })[] = []
  const placed: GiantStone[] = []
  for (let tries = 0; tries < stones * 30 && placed.length < stones; tries++) {
    const a = rng() * Math.PI * 2
    const r = Math.sqrt(range(rng, 0.08, 1)) * (radius - 5)
    const x = Math.cos(a) * r
    const z = Math.sin(a) * r
    const kind = pick(rng, STONE_KINDS)
    const scale = range(rng, 0.85, 1.25)
    const swing = range(rng, -0.35, 0.35)
    const lean = rng() < 0.2 ? range(rng, -0.18, 0.18) : range(rng, -0.03, 0.03)
    if (keptClear(x, z)) continue
    if (local.some((s) => Math.hypot(s.x - x, s.z - z) < spacing)) continue
    local.push({ x, z, kind })
    // Facing the avenue: toward z = 0, square to it.
    const toward = z > 0 ? -Math.PI / 2 : Math.PI / 2
    placed.push({
      ...mazeToWorld(place, { x, z }),
      kind,
      yaw: facing(place, toward + swing),
      scale,
      lean,
    })
  }
  return placed
}
