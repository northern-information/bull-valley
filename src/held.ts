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
