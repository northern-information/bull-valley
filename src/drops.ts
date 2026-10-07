// Dropped items, pure: how much one drop takes out of what a raider
// carries, where it lands, and what taking it up leaves, and what the
// shadowmen and the Caretaker leave behind. sharedworld.ts runs these for
// the shared valley (rules 11, 12 and 13), actions.ts for the valley played
// alone. No three.js, no DOM.

import { CONFIG } from './config.ts'
import { leftInOpen } from './items.ts'
import type { XZ } from './interfaces.ts'
import type { ItemId } from './items.ts'
import type { Rng } from './rng.ts'

// The kind of the drop a shadowman bursts into: dimes, which are cash.
// Taken up, they go into the wallet, never the pack, at DIME_CENTS each.
export const DIMES = 'dimes'
export const DIME_CENTS = 10

export function isCash(kind: string): boolean {
  return kind === DIMES
}

// How many dimes one burst shadowman leaves: min to max, evenly.
export function dimesFor(rng: Rng, cfg = CONFIG): number {
  const { min, max } = cfg.shadowmen.dimes
  return min + Math.floor(rng() * (max - min + 1))
}

// The kind of the drop the Caretaker leaves where it was unmade: gold
// bullion, an item, counted by the troy ounce.
export const GOLD_BULLION: ItemId = 'gold-bullion'

// One drop the valley sets down of its own accord: what, how many, where.
export interface Spill extends XZ {
  kind: string
  count: number
}

// What one step leaves lying: dimes where each shadowman burst, and the
// Caretaker's gold bullion where it was unmade.
export function spillsOf(
  bursts: readonly XZ[],
  unmade: XZ | null,
  rng: Rng,
  cfg = CONFIG
): Spill[] {
  const spills: Spill[] = bursts.map(({ x, z }) => ({
    x,
    z,
    kind: DIMES,
    count: dimesFor(rng, cfg),
  }))
  if (unmade) {
    const { x, z } = unmade
    spills.push({ x, z, kind: GOLD_BULLION, count: cfg.caretaker.bullion })
  }
  return spills
}

// One drop on the ground: what lies there and how many. The id is the
// valley's, never reused within its world.
export interface Drop extends XZ {
  id: number
  kind: string
  count: number
}

// Where a raider stands and faces, as their last state frame said.
export interface Facing extends XZ {
  yaw: number
}

// How many of `kind` one drop takes out of `held`: the whole stack, or
// one: the open container (the pack of cigarettes or bottle of pills in
// use, items.ts leftInOpen) or one of anything else. 0 when none are held.
export function dropAmount(kind: string, held: number, all: boolean): number {
  if (held < 1) return 0
  if (all) return held
  return Math.min(held, leftInOpen(kind, held) ?? 1)
}

// Where drop `id` lands: a little ahead of the raider, turned a step round
// a small circle per id so drops made from one spot lie side by side.
export function dropSpot(at: Facing, id: number, cfg = CONFIG): XZ {
  const { ahead, scatter } = cfg.drops
  const turn = id * GOLDEN_ANGLE
  return {
    x: at.x - Math.sin(at.yaw) * ahead + Math.cos(turn) * scatter,
    z: at.z - Math.cos(at.yaw) * ahead + Math.sin(turn) * scatter,
  }
}

const GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5))

// Taking up a drop with room for `room` more (Infinity for the pack): how
// many come up, and the drop as it lies after, or null when none is left.
export function takeUp(
  drop: Drop,
  room: number
): { taken: number; left: Drop | null } {
  const taken = Math.max(0, Math.min(drop.count, room))
  const count = drop.count - taken
  return { taken, left: count > 0 ? { ...drop, count } : null }
}
