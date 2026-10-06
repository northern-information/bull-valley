// Pure: the raise and lower both first-person hands share. The left hand
// holds the flashlight up for as long as it is on; the right hand brings
// an item up once, as it is used, and puts it down again. A lift runs 0
// (out of view, below the frame) to 1 (held up in view), linear in time;
// ease() shapes it for drawing. fphands.ts draws both.

import { CONFIG } from './config.ts'

export type HandsConfig = typeof CONFIG.hands

// A hand that stays where it is put: up, or on its way down.
export interface Hand {
  up: boolean
  lift: number
}

export const HAND_DOWN: Hand = { up: false, lift: 0 }

// The hand one frame on: the lift moves toward up or down at one full
// raise per raiseSeconds, and stops there.
export function stepHand(
  hand: Hand,
  dt: number,
  cfg: HandsConfig = CONFIG.hands
): Hand {
  const step = dt / cfg.raiseSeconds
  const lift = hand.up
    ? Math.min(1, hand.lift + step)
    : Math.max(0, hand.lift - step)
  return { up: hand.up, lift }
}

// The right hand's one pass for an item used at startedAt: up, held, and
// down again, 0 before and after. Times are game seconds.
export function useLift(
  startedAt: number,
  now: number,
  cfg: HandsConfig = CONFIG.hands
): number {
  const e = now - startedAt
  const r = cfg.raiseSeconds
  if (e <= 0) return 0
  if (e < r) return e / r
  if (e < r + cfg.holdSeconds) return 1
  return Math.max(0, 1 - (e - r - cfg.holdSeconds) / r)
}

// How long one use holds the right hand, end to end.
export function useSeconds(cfg: HandsConfig = CONFIG.hands): number {
  return cfg.raiseSeconds * 2 + cfg.holdSeconds
}

// Smoothstep: a hand eases out of rest and into place.
export function ease(lift: number): number {
  const t = Math.max(0, Math.min(1, lift))
  return t * t * (3 - 2 * t)
}
