// Pure: falling. The player's feet follow the ground, but where the ground
// drops away by more than CONFIG.fall.step (off the moat's rim, off a
// landing) they leave it and fall (player.ts), and the landing hurts by how
// far they fell: nothing short of `safe`, then a share of the raider's
// whole growing to all of it at `lethal`, two stories, and past it. The
// valley takes the hurt off the account (sharedworld.ts rule 24, `plunge`).
// No three.js, no DOM.

import { CONFIG } from './config.ts'
import { clamp01 } from './math.ts'
import type { ShadowHit } from './wards.ts'

// What hurt a raider: a shadow's touch, a fall, or a car of the traffic
// (traffic.ts).
export type Hurt = ShadowHit | 'fall' | 'vehicle'

// Whether the feet at `feetY` are in the air over ground at `groundY`.
export function airborne(
  feetY: number,
  groundY: number,
  cfg = CONFIG.fall
): boolean {
  return groundY < feetY - cfg.step
}

// What a landing from `height` metres takes off a raider whole at `max`,
// in whole points: all of it from `lethal` on.
export function fallDamage(
  height: number,
  max: number,
  cfg = CONFIG.fall
): number {
  if (!Number.isFinite(height) || height < cfg.safe) return 0
  const share = clamp01((height - cfg.safe) / (cfg.lethal - cfg.safe))
  return Math.round(share * max)
}

// Whether a landing from `height` hurts at all, so the client tells the
// valley.
export function hurts(height: number, cfg = CONFIG.fall): boolean {
  return Number.isFinite(height) && height >= cfg.safe
}

// How fast the feet leave the ground for a jump `height` high, m/s up,
// under CONFIG.fall.gravity: the speed that falls to nothing at the top.
export function jumpSpeed(
  height = CONFIG.player.jumpHeight,
  cfg = CONFIG.fall
): number {
  return Math.sqrt(2 * cfg.gravity * Math.max(0, height))
}

// Whether the feet may leave the ground now: standing on it, not crouched,
// and not sat or knelt in an emote.
export function mayJump(state: {
  falling: boolean
  crouching: boolean
  emoting: boolean
}): boolean {
  return !state.falling && !state.crouching && !state.emoting
}

// The highest fall the valley believes: far more than the moat is deep.
export const FALL_MAX = 500

// A fall height off the wire.
export function isFallHeight(value: unknown): value is number {
  return (
    typeof value === 'number' &&
    Number.isFinite(value) &&
    value > 0 &&
    value <= FALL_MAX
  )
}
