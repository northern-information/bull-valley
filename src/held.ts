// Pure: what a raider holds, and what the left click does with it. The
// hotbar is the hand, as Minecraft, Rust and Valheim have it: the number
// keys and the wheel select a slot, and what is in it is what the raider
// holds while the pack does. Every ability is a thing in a slot: the
// flashlight lit or put out, the Citgo phone dialed, Marx's whistle
// blown, Erwin von Dutch's slurm jar's catch, a rod's cast (and its
// reel), and anything usable used. One at a time, so holding the
// flashlight means holding nothing else. The tool the hand shows goes out
// on the state frame so everyone sees it, and the valley lets only a
// raider whose flashlight is lit burn a shadow with it (shadowstep.ts
// shadowRaiders). No three.js, no DOM.

import { BAITS, BOX_ROD } from './fishing.ts'
import { HOTBAR_SLOTS } from './hotbar.ts'
import { isRod } from './items.ts'
import type { Bait } from './fishing.ts'
import type { Hotbar } from './hotbar.ts'

export const TOOLS = ['flashlight', 'jar', 'rod'] as const
export type Tool = (typeof TOOLS)[number]

export function isTool(value: unknown): value is Tool {
  return (TOOLS as readonly unknown[]).includes(value)
}

// The tool a kind is in the hand, as the hand rigs draw it and the state
// frame says it: the flashlight, the jar, or any rod; null for the rest,
// which the hand holds out of sight.
export function toolOf(kind: string | null): Tool | null {
  if (kind === 'flashlight') return 'flashlight'
  if (kind === 'slurm-jar') return 'jar'
  if (kind === BOX_ROD || (kind !== null && isRod(kind))) return 'rod'
  return null
}

// What the left click does with a kind in hand: light the flashlight (or
// put it out), catch with the jar, cast or reel the rod, dial the phone,
// blow the whistle, use anything usable (`usable`, items.ts canUse as the
// pack reads it), or nothing.
export type HandUse =
  'light' | 'catch' | 'cast' | 'dial' | 'whistle' | 'use' | null

export function useOf(kind: string | null, usable: boolean): HandUse {
  if (kind === null) return null
  switch (toolOf(kind)) {
    case 'flashlight':
      return 'light'
    case 'jar':
      return 'catch'
    case 'rod':
      return 'cast'
  }
  if (kind === 'citgo-phone') return 'dial'
  if (kind === 'marx-whistle') return 'whistle'
  return usable ? 'use' : null
}

// What the hand holds: the selected slot's kind while the pack holds one,
// else nothing.
export function inHand(
  bar: Hotbar,
  slot: number,
  pack: Readonly<Record<string, number>>
): string | null {
  const kind = bar[slot] ?? null
  return kind !== null && (pack[kind] ?? 0) > 0 ? kind : null
}

// The slot a turn of the wheel selects: the next (`step` -1: the one
// before), round again past either end.
export function stepSlot(slot: number, step: 1 | -1): number {
  return (slot + step + HOTBAR_SLOTS) % HOTBAR_SLOTS
}

// The bait the rod casts with: the one picked at the tackle box while one
// is carried, else the first carried, in BAITS order; null with none.
export function baitFor(
  picked: Bait | null,
  pack: Readonly<Record<string, number>>
): Bait | null {
  if (picked && (pack[picked] ?? 0) > 0) return picked
  return BAITS.find((bait) => (pack[bait] ?? 0) > 0) ?? null
}

// A cast, as both apps draw it: the rod tips back over the shoulder, whips
// forward past where it rests toward the water, and settles; the line
// leaves the tip on the whip and the bobber flies out to the water.
export const CAST = {
  // Seconds: the back swing ends, the whip ends, the rod has settled.
  back: 0.3,
  whip: 0.45,
  settle: 0.8,
  // How far back and how far forward the rod goes past where it rests,
  // radians, up being back.
  up: 1.1,
  down: 0.35,
  // When the bobber leaves the tip, and when it lands, seconds.
  release: 0.4,
  lands: 0.9,
} as const

export interface CastPose {
  // The rod's turn from where it rests: back (positive) or forward.
  tilt: number
  // How far the bobber has flown from the tip to the water: 0 still on
  // the tip, 1 down on the water.
  fly: number
}

// Smoothstep, from 0 to 1 between a and b.
function between(t: number, a: number, b: number): number {
  const k = Math.max(0, Math.min(1, (t - a) / (b - a)))
  return k * k * (3 - 2 * k)
}

// The cast `seconds` after the click: at rest with the bobber on the water
// before 0 and once it has landed.
export function castPose(seconds: number, cfg: typeof CAST = CAST): CastPose {
  if (seconds < 0 || seconds >= cfg.lands) return { tilt: 0, fly: 1 }
  const tilt =
    seconds < cfg.back
      ? cfg.up * between(seconds, 0, cfg.back)
      : seconds < cfg.whip
        ? cfg.up - (cfg.up + cfg.down) * between(seconds, cfg.back, cfg.whip)
        : -cfg.down * (1 - between(seconds, cfg.whip, cfg.settle))
  return { tilt, fly: between(seconds, cfg.release, cfg.lands) }
}

// A scoop, as the 3D valley draws it: the jar hand dips down and out at
// the slurm on the lot, the jar tips mouth first to take it in, then
// sweeps up past where it rests, rights itself, and settles.
export const SCOOP = {
  // Seconds: the dip ends, the sweep up ends, the jar has settled.
  dip: 0.22,
  sweep: 0.46,
  settle: 0.75,
  // How far down and how far back up past rest the arm turns, radians.
  down: 0.4,
  up: 0.3,
  // How far the jar tips mouth first at the bottom of the dip, radians.
  tip: 1.4,
  // How far out the hand reaches at the bottom of the dip, metres.
  reach: 0.14,
} as const

export interface ScoopPose {
  // The arm's turn from where it rests: down (negative) or up.
  tilt: number
  // The jar's tip in the fist, mouth first: 0 upright, `tip` at most.
  tip: number
  // How far the hand reaches out ahead, metres.
  reach: number
}

const AT_REST: ScoopPose = { tilt: 0, tip: 0, reach: 0 }

// The scoop `seconds` after the click: at rest before 0 and once settled.
export function scoopPose(
  seconds: number,
  cfg: typeof SCOOP = SCOOP
): ScoopPose {
  if (seconds < 0 || seconds >= cfg.settle) return AT_REST
  if (seconds < cfg.dip) {
    const k = between(seconds, 0, cfg.dip)
    return { tilt: -cfg.down * k, tip: cfg.tip * k, reach: cfg.reach * k }
  }
  if (seconds < cfg.sweep) {
    const k = between(seconds, cfg.dip, cfg.sweep)
    return {
      tilt: -cfg.down + (cfg.down + cfg.up) * k,
      tip: cfg.tip * (1 - k),
      reach: cfg.reach * (1 - k),
    }
  }
  const k = between(seconds, cfg.sweep, cfg.settle)
  return { tilt: cfg.up * (1 - k), tip: 0, reach: 0 }
}
