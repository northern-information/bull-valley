// Buffs, pure: what geometrie does while it lasts (sharedworld.ts rule 25).
// High reaches the flashlight further and wider, stimulated quickens the
// sprint, and drunk shrugs a shadow's touch off now and then; each scaled
// by its level (geometrie.ts levelsAt). And passing: anything smoked, drunk
// or swallowed can go to a raider within reach instead, who takes it in
// full (its dose and its heal), the giver catching shareScale of the dose
// and the XP for sharing. Tune it all in CONFIG.buffs. No three.js, no DOM.

import { CONFIG } from './config.ts'
import { dose, levelsAt, SOBER } from './geometrie.ts'
import type { Geometrie } from './geometrie.ts'
import type { GeometrieAxis } from './interfaces.ts'
import type { Beam } from './shadowmen.ts'

export type BuffsConfig = typeof CONFIG.buffs
type Levels = Readonly<Record<GeometrieAxis, number>>

// How much further and wider the flashlight reaches at `levels`.
export function beamScale(levels: Levels, cfg = CONFIG.buffs): number {
  return 1 + cfg.beamPerHigh * levels.high
}

// A beam reached out by `levels`' high; the beam itself when sober.
export function buffedBeam(
  beam: Beam,
  levels: Levels,
  cfg = CONFIG.buffs
): Beam {
  const scale = beamScale(levels, cfg)
  if (scale === 1) return beam
  return {
    ...beam,
    range: beam.range * scale,
    halfAngle: Math.min(Math.PI / 2, beam.halfAngle * scale),
  }
}

// How much faster the sprint runs at `levels`.
export function sprintScale(levels: Levels, cfg = CONFIG.buffs): number {
  return 1 + cfg.sprintPerStimulated * levels.stimulated
}

// The chance a touch is shrugged off at `levels`.
export function shrugChance(levels: Levels, cfg = CONFIG.buffs): number {
  return Math.min(1, Math.max(0, cfg.shrugPerDrunk * levels.drunk))
}

// Whether a touch is shrugged off, `roll` drawn from 0 to 1 by the caller.
export function shrugs(
  levels: Levels,
  roll: number,
  cfg = CONFIG.buffs
): boolean {
  return roll < shrugChance(levels, cfg)
}

// An item's dose scaled: the giver's share of what they passed.
export function scaled(
  amounts: Partial<Levels> | undefined,
  scale: number
): Partial<Record<GeometrieAxis, number>> {
  const out: Partial<Record<GeometrieAxis, number>> = {}
  if (!amounts) return out
  for (const axis of ['high', 'stimulated', 'drunk'] as const) {
    const amount = amounts[axis]
    if (amount !== undefined) out[axis] = amount * scale
  }
  return out
}

interface Spot {
  x: number
  z: number
}

// Whether two raiders stand close enough to pass something between them.
export function inPassReach(a: Spot, b: Spot, cfg = CONFIG.buffs): boolean {
  return Math.hypot(a.x - b.x, a.z - b.z) <= cfg.passReach
}

// Who a raider at `me`, facing `yaw` (0 faces -Z, player.ts), would pass
// to: the nearest of `peers` in reach and in front of them (within 60
// degrees of the way they face), or null.
export function passTarget<P extends Spot>(
  me: Spot,
  yaw: number,
  peers: readonly P[],
  cfg = CONFIG.buffs
): P | null {
  const fx = -Math.sin(yaw)
  const fz = -Math.cos(yaw)
  let best: P | null = null
  let bestD = Infinity
  for (const peer of peers) {
    const dx = peer.x - me.x
    const dz = peer.z - me.z
    const d = Math.hypot(dx, dz)
    if (d > cfg.passReach || d >= bestD) continue
    if (d > 0 && (dx * fx + dz * fz) / d < Math.cos(Math.PI / 3)) continue
    best = peer
    bestD = d
  }
  return best
}

// An account's geometrie as the valley keeps it: only the accounts not
// sober are written down. The valley's clock is in seconds here.
export function geometrieOf(
  record: Readonly<Record<string, Geometrie>>,
  account: string
): Geometrie {
  return record[account] ?? SOBER
}

// Whether every level has faded to nothing at `time`.
export function isSober(g: Geometrie, time: number): boolean {
  const l = levelsAt(g, time)
  return l.high === 0 && l.stimulated === 0 && l.drunk === 0
}

// The record with `account` dosed by `amounts` at `time`, and every
// account gone sober by then dropped, so it never grows.
export function dosed(
  record: Readonly<Record<string, Geometrie>>,
  account: string,
  amounts: Partial<Levels> | undefined,
  time: number
): Record<string, Geometrie> {
  const next: Record<string, Geometrie> = {}
  for (const [key, g] of Object.entries(record)) {
    if (!isSober(g, time)) next[key] = g
  }
  const after = dose(geometrieOf(record, account), amounts, time)
  if (isSober(after, time)) delete next[account]
  else next[account] = after
  return next
}

// The record with `account` sober again (a strike shatters it).
export function sobered(
  record: Readonly<Record<string, Geometrie>>,
  account: string
): Record<string, Geometrie> {
  const next = { ...record }
  delete next[account]
  return next
}

// Whether a wire value is a set of geometrie levels.
export function isLevels(value: unknown): value is Levels {
  if (typeof value !== 'object' || value === null) return false
  const v = value as Record<string, unknown>
  return (['high', 'stimulated', 'drunk'] as const).every(
    (axis) => typeof v[axis] === 'number' && v[axis] >= 0 && v[axis] <= 1
  )
}
