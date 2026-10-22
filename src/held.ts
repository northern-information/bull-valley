// Pure: what a raider holds in the left hand, and what the left click does
// with it. Every raider carries the flashlight; Erwin von Dutch's slurm jar
// and a rod (the best one in the pack, fishing.ts rodIn) can take its
// place. One at a time: the click lights the flashlight, catches the slurm
// the jar is aimed at, or casts the rod (and reels it in). The hand goes
// out on the state frame so everyone sees what a raider holds, and the
// valley lets only a raider holding the flashlight burn a shadow with it
// (shadowstep.ts shadowRaiders). No three.js, no DOM.

import { BAITS, rodIn } from './fishing.ts'
import type { Bait } from './fishing.ts'

export const TOOLS = ['flashlight', 'jar', 'rod'] as const
export type Tool = (typeof TOOLS)[number]

export function isTool(value: unknown): value is Tool {
  return (TOOLS as readonly unknown[]).includes(value)
}

// What `pack` lets a raider hold, in the order R and the wheel step through them: the
// flashlight always, the jar while one is carried, a rod while one is.
export function toolsIn(pack: Readonly<Record<string, number>>): Tool[] {
  return TOOLS.filter(
    (hand) =>
      hand === 'flashlight' ||
      (hand === 'jar' && (pack['slurm-jar'] ?? 0) > 0) ||
      (hand === 'rod' && rodIn(pack) !== null)
  )
}

// What the hand holds after R or a turn of the wheel: the next thing
// carried (`step` -1: the one before), round again past the flashlight.
export function nextTool(
  hand: Tool,
  pack: Readonly<Record<string, number>>,
  step: 1 | -1 = 1
): Tool {
  const carried = toolsIn(pack)
  const at = carried.indexOf(hand)
  // Holding what is gone, the first thing carried either way.
  if (at < 0) return carried[0]
  return carried[(at + step + carried.length) % carried.length]
}

// What the hand holds now that the pack is `pack`: the same, or the
// flashlight once what it held is no longer carried (dropped, left on a
// body).
export function toolIn(
  hand: Tool,
  pack: Readonly<Record<string, number>>
): Tool {
  return toolsIn(pack).includes(hand) ? hand : 'flashlight'
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
