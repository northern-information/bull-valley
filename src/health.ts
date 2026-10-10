// Health, pure: every raider has CONFIG.health.max points, and any shadow's
// touch (a shadowman, a spider, a spiderling, the Caretaker) takes one. The
// touch that takes the last shatters their geometrie: the strike that
// leaves everything on a body (corpses.ts), and they come to whole. A
// Citgo forecourt makes them whole, and medicine gives points back
// (items.ts heals). sharedworld.ts keeps each account's (rule 24),
// actions.ts the one a raider playing alone has. No three.js, no DOM.

import { CONFIG } from './config.ts'

export const MAX_HEALTH = CONFIG.health.max

// A touch: the points left, and whether it was the last (the account is
// whole again after, so `points` is what the raider is told: 0).
export function hit(points: number): { points: number; fatal: boolean } {
  const left = Math.max(0, Math.min(MAX_HEALTH, points) - 1)
  return { points: left, fatal: left === 0 }
}

// `by` points given back, never past whole.
export function mend(points: number, by: number): number {
  return Math.max(0, Math.min(MAX_HEALTH, points + Math.max(0, by)))
}

// Whether `points` is whole.
export function isWhole(points: number): boolean {
  return points >= MAX_HEALTH
}

// A pill of medicine that heals is kept while the raider is whole, so none
// is swallowed for nothing: the valley refuses the use, and a client
// playing alone never asks.
export function keepsPill(heals: number, points: number): boolean {
  return heals > 0 && isWhole(points)
}

// An account's points as the valley keeps them: only the accounts below
// whole are written down.
export function healthOf(
  health: Readonly<Record<string, number>>,
  account: string
): number {
  return health[account] ?? MAX_HEALTH
}

// The record with `account` at `points`: dropped when whole.
export function withHealth(
  health: Readonly<Record<string, number>>,
  account: string,
  points: number
): Record<string, number> {
  const next = { ...health }
  if (isWhole(points) || points <= 0) delete next[account]
  else next[account] = points
  return next
}

// Whether a wire value is a health count.
export function isHealth(value: unknown): value is number {
  return (
    typeof value === 'number' &&
    Number.isInteger(value) &&
    value >= 0 &&
    value <= MAX_HEALTH
  )
}

// How far the view shakes `since` seconds after a touch, in metres: the
// full shakeMetres at once, easing to nothing over shakeSeconds.
export function shakeAt(since: number, cfg = CONFIG.health): number {
  if (!(since >= 0) || since >= cfg.shakeSeconds) return 0
  const left = 1 - since / cfg.shakeSeconds
  return cfg.shakeMetres * left * left
}
