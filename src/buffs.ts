// Buffs, pure: what the wards do while they last besides warding
// (sharedworld.ts rule 27; the warding is wards.ts). High reaches the
// flashlight further and wider and stimulated quickens the sprint, each
// scaled by its level (wardlevels.ts levelsAt). And passing: anything smoked, drunk
// or swallowed can go to a raider within reach instead, who takes it in
// full (its dose and its heal), the giver catching shareScale of the dose
// and the XP for sharing. Tune it all in CONFIG.buffs. No three.js, no DOM.

import { CONFIG } from './config.ts'
import { AXES, dose, levelsAt, SOBER } from './wardlevels.ts'
import type { WardAxis } from './interfaces.ts'
import type { Beam } from './shadowmen.ts'
import type { WardState } from './wardlevels.ts'

type Levels = Readonly<Record<WardAxis, number>>

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

// An item's dose scaled: the giver's share of what they passed.
export function scaled(
  amounts: Partial<Levels> | undefined,
  scale: number
): Partial<Record<WardAxis, number>> {
  const out: Partial<Record<WardAxis, number>> = {}
  if (!amounts) return out
  for (const axis of AXES) {
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

// An account's wards as the valley keeps them: only the accounts not
// sober are written down. The valley's clock is in seconds here.
export function wardsOf(
  record: Readonly<Record<string, WardState>>,
  account: string
): WardState {
  return record[account] ?? SOBER
}

// Whether every level has faded to nothing at `time`.
export function isSober(g: WardState, time: number): boolean {
  const l = levelsAt(g, time)
  return l.high === 0 && l.stimulated === 0 && l.drunk === 0
}

// The record with `account` dosed by `amounts` at `time`, and every
// account gone sober by then dropped, so it never grows.
export function dosed(
  record: Readonly<Record<string, WardState>>,
  account: string,
  amounts: Partial<Levels> | undefined,
  time: number
): Record<string, WardState> {
  const next: Record<string, WardState> = {}
  for (const [key, g] of Object.entries(record)) {
    if (!isSober(g, time)) next[key] = g
  }
  const after = dose(wardsOf(record, account), amounts, time)
  if (isSober(after, time)) delete next[account]
  else next[account] = after
  return next
}

// The record with `account` sober again (a strike shatters it).
export function sobered(
  record: Readonly<Record<string, WardState>>,
  account: string
): Record<string, WardState> {
  const next = { ...record }
  delete next[account]
  return next
}

// Whether a wire value is a set of ward levels.
export function isLevels(value: unknown): value is Levels {
  if (typeof value !== 'object' || value === null) return false
  const v = value as Record<string, unknown>
  return AXES.every(
    (axis) => typeof v[axis] === 'number' && v[axis] >= 0 && v[axis] <= 1
  )
}
