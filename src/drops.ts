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
import type { ShadeKind } from './shadowmen.ts'

// The kind of the drop a shadowman bursts into: dimes, which are cash.
// Taken up, they go into the wallet, never the pack, at DIME_CENTS each.
export const DIMES = 'dimes'
export const DIME_CENTS = 10

// What a shadow spider bursts into: one $20 bill, cash the same way.
export const TWENTY = 'twenty'
export const TWENTY_CENTS = 2000

const CENTS: Readonly<Record<string, number>> = {
  [DIMES]: DIME_CENTS,
  [TWENTY]: TWENTY_CENTS,
}

export function isCash(kind: string): boolean {
  return kind in CENTS
}

// What one of a cash kind is worth, in cents; 0 for anything else.
export function centsOf(kind: string): number {
  return CENTS[kind] ?? 0
}

// How many dimes one burst shadowman (or spiderling, from its own fewer)
// leaves: min to max, evenly.
export function dimesFor(
  rng: Rng,
  cfg = CONFIG,
  kind: ShadeKind = 'man'
): number {
  const { min, max } =
    kind === 'spiderling' ? cfg.shadowmen.spiderling.dimes : cfg.shadowmen.dimes
  return min + Math.floor(rng() * (max - min + 1))
}

// The kind of the drops the Caretaker leaves where it was unmade: gold
// bullion, an item, each one a 1 troy ounce bar.
export const GOLD_BULLION: ItemId = 'gold-bullion'

// One drop the valley sets down of its own accord: what, how many, where.
export interface Spill extends XZ {
  kind: string
  count: number
}

// How far each of the Caretaker's bars lies from where it was unmade, in
// metres.
const BAR_SPREAD = 0.25

// What one step leaves lying: dimes where each shadowman (or spiderling)
// burst, a $20 bill where each spider did, and the Caretaker's gold bullion where it was
// unmade: its bars, one troy ounce each, as drops of their own, side by
// side.
export function spillsOf(
  bursts: readonly (XZ & { kind?: ShadeKind })[],
  unmade: XZ | null,
  rng: Rng,
  cfg = CONFIG
): Spill[] {
  const spills: Spill[] = bursts.map(({ x, z, kind }) =>
    kind === 'spider'
      ? { x, z, kind: TWENTY, count: 1 }
      : { x, z, kind: DIMES, count: dimesFor(rng, cfg, kind) }
  )
  if (unmade) {
    const bars = cfg.caretaker.bullion
    for (let i = 0; i < bars; i++) {
      const turn = (i / bars) * Math.PI * 2
      const r = bars > 1 ? BAR_SPREAD : 0
      spills.push({
        x: unmade.x + Math.cos(turn) * r,
        z: unmade.z + Math.sin(turn) * r,
        kind: GOLD_BULLION,
        count: 1,
      })
    }
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
