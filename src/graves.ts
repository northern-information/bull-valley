// Tombstones, pure: every shadowman burnt in a beam leaves one where it
// burst, carved with the name it is given then (names.ts). sharedworld.ts
// keeps the valley's (rule 17), actions.ts the ones a raider playing alone
// makes. No three.js, no DOM.

import { CONFIG } from './config.ts'
import { generateName } from './names.ts'
import type { XZ } from './interfaces.ts'
import type { Rng } from './rng.ts'
import type { ShadeKind } from './shadowmen.ts'

// One tombstone: where it stands and whose it is. The id is the valley's,
// never reused within its world, and turns the stone (gravestones.ts).
export interface Grave extends XZ {
  id: number
  name: string
}

// A shadowman to bury: where it burst, and its name.
export interface Burial extends XZ {
  name: string
}

// Names for the shadowmen that burst at `bursts`, one each. A spiderling
// is too small a thing to bury.
export function burialsOf(
  bursts: readonly (XZ & { kind?: ShadeKind })[],
  rng: Rng
): Burial[] {
  return bursts
    .filter(({ kind }) => kind !== 'spiderling')
    .map(({ x, z }) => ({ x, z, name: generateName(rng) }))
}

const GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5))

// Where grave `id` stands: a step off where its shadowman burst, turned
// round by id, so the stone never covers the dimes it left.
export function graveSpot(at: XZ, id: number, cfg = CONFIG): XZ {
  const turn = id * GOLDEN_ANGLE
  return {
    x: at.x + Math.cos(turn) * cfg.graves.offset,
    z: at.z + Math.sin(turn) * cfg.graves.offset,
  }
}

// The longest name a stone takes; anything longer is not one of ours.
export const NAME_MAX = 48

// The graves after `burials` are laid beside `graves`, numbered from
// `next`: the oldest go once more than CONFIG.graves.max stand.
export function bury(
  graves: readonly Grave[],
  next: number,
  burials: readonly Burial[],
  cfg = CONFIG
): { graves: Grave[]; next: number } {
  const laid = burials
    .filter(
      (b) =>
        Number.isFinite(b.x) &&
        Number.isFinite(b.z) &&
        b.name.length > 0 &&
        b.name.length <= NAME_MAX
    )
    .map((b, i) => ({
      id: next + i,
      name: b.name,
      ...graveSpot(b, next + i, cfg),
    }))
  const all = [...graves, ...laid]
  return {
    graves: all.slice(Math.max(0, all.length - cfg.graves.max)),
    next: next + laid.length,
  }
}
