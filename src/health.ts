// Geometrie, the raider's hit points, pure: every raider has
// maxGeometrie(level) of it, CONFIG.health.base at level 1 and more with
// every level (progression.ts), and each shadow's touch takes its own hit
// (wards.ts damageOf), cut by the raider's wards. The touch that takes the
// last shatters their geometrie: the strike that leaves everything on a
// body (corpses.ts), and they come to whole. A Citgo forecourt makes them
// whole, and anything smoked, drunk or swallowed gives back its share of
// whole (items.ts healsPct). sharedworld.ts keeps each account's (rule
// 24). No three.js, no DOM.
//
// The valley keeps what each account has lost (its wounds), not what it
// has left, so a new level's larger whole tops a raider up by the
// difference, and nothing need be rescaled when the curve is retuned.

import { CONFIG } from './config.ts'
import { clamp01 } from './math.ts'

// Geometrie whole at `level` (1 and up).
export function maxGeometrie(level = 1, cfg = CONFIG.health): number {
  const l = Math.max(1, Math.floor(Number.isFinite(level) ? level : 1))
  const raw = cfg.base + cfg.perLevel * (l - 1)
  return Math.round(raw / cfg.round) * cfg.round
}

// Whole at level 1, what a raider starts with.
export const BASE_GEOMETRIE = maxGeometrie(1)

// The most geometrie any raider can have, at the highest level.
export const TOP_GEOMETRIE = maxGeometrie(CONFIG.progression.maxLevel)

// A touch of `damage` off `points` of `max`: the points left, and whether
// it was the last (the account is whole again after, so `points` is what
// the raider is told: 0).
export function hit(
  points: number,
  damage: number,
  max: number = BASE_GEOMETRIE
): { points: number; fatal: boolean } {
  const left = Math.max(0, Math.min(max, points) - Math.max(0, damage))
  return { points: left, fatal: left === 0 }
}

// `by` points given back, never past `max`.
export function mend(
  points: number,
  by: number,
  max: number = BASE_GEOMETRIE
): number {
  return Math.max(0, Math.min(max, points + Math.max(0, by)))
}

// Points left of `max` with `wounds` taken.
export function pointsOf(wounds: number, max: number): number {
  return Math.max(0, max - Math.max(0, wounds))
}

// What an account has lost, as the valley keeps it: only the wounded are
// written down.
export function woundsOf(
  wounds: Readonly<Record<string, number>>,
  account: string
): number {
  return wounds[account] ?? 0
}

// The record with `account` wounded by `amount`: dropped when whole.
export function withWounds(
  wounds: Readonly<Record<string, number>>,
  account: string,
  amount: number
): Record<string, number> {
  const next = { ...wounds }
  if (!Number.isFinite(amount) || amount <= 0) delete next[account]
  else next[account] = Math.round(amount)
  return next
}

// A record a valley kept as points left of `storedMax` (an older build's),
// as wounds against level 1's whole: every account at the same share of
// whole, never at nothing.
export function woundsFromHealth(
  health: Readonly<Record<string, number>>,
  storedMax: number
): Record<string, number> {
  let next: Record<string, number> = {}
  if (!(storedMax > 0)) return next
  for (const [account, points] of Object.entries(health)) {
    if (!Number.isFinite(points)) continue
    const share = clamp01(points / storedMax)
    const lost = Math.round((1 - share) * BASE_GEOMETRIE)
    next = withWounds(next, account, Math.min(BASE_GEOMETRIE - 1, lost))
  }
  return next
}

// Whether a wire value is a count of geometrie.
export function isHealth(value: unknown): value is number {
  return (
    typeof value === 'number' &&
    Number.isInteger(value) &&
    value >= 0 &&
    value <= TOP_GEOMETRIE
  )
}

// How far the view shakes `since` seconds after a touch, in metres: the
// full shakeMetres at once, easing to nothing over shakeSeconds.
export function shakeAt(since: number, cfg = CONFIG.health): number {
  if (!(since >= 0) || since >= cfg.shakeSeconds) return 0
  const left = 1 - since / cfg.shakeSeconds
  return cfg.shakeMetres * left * left
}
