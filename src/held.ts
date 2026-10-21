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

// What `pack` lets a raider hold, in the order Q steps through them: the
// flashlight always, the jar while one is carried, a rod while one is.
export function toolsIn(pack: Readonly<Record<string, number>>): Tool[] {
  return TOOLS.filter(
    (hand) =>
      hand === 'flashlight' ||
      (hand === 'jar' && (pack['slurm-jar'] ?? 0) > 0) ||
      (hand === 'rod' && rodIn(pack) !== null)
  )
}

// What the hand holds after Q: the next thing carried, round again to the
// flashlight.
export function nextTool(
  hand: Tool,
  pack: Readonly<Record<string, number>>
): Tool {
  const carried = toolsIn(pack)
  const at = carried.indexOf(hand)
  return carried[(at + 1) % carried.length]
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
