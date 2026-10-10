// Pure: the hotbar along the bottom of the screen. Nine slots, one per
// number key, each holding an item kind or nothing; the account keeps it
// (PUT /auth/hotbar). No three.js, no DOM: hud.ts draws it.

import { givesPerception, INVENTORY_KINDS, isCigarette } from './items.ts'

export const HOTBAR_SLOTS = 9

// Slot 0 is key 1. Each entry: an item kind, or null for an empty slot.
export type Hotbar = readonly (string | null)[]

export const EMPTY_HOTBAR: Hotbar = Array.from(
  { length: HOTBAR_SLOTS },
  () => null
)

// Every kind the grid can show, so every kind a slot can hold.
const ASSIGNABLE: ReadonlySet<string> = new Set(INVENTORY_KINDS)

// Puts kind on slot, taking it off any other slot. Assigning a kind to the
// slot that already holds it clears that slot.
export function assign(bar: Hotbar, slot: number, kind: string): Hotbar {
  if (slot < 0 || slot >= HOTBAR_SLOTS) return bar
  const clear = bar[slot] === kind
  return bar.map((held, i) => {
    if (i === slot) return clear ? null : kind
    return held === kind ? null : held
  })
}

// The assigned slots in number order, as the bar shows them.
export function shownSlots(bar: Hotbar): { slot: number; kind: string }[] {
  const shown: { slot: number; kind: string }[] = []
  bar.forEach((kind, slot) => {
    if (kind !== null) shown.push({ slot, kind })
  })
  return shown
}

// Whether a value off the wire is a hotbar: nine slots, each null or a
// kind the grid can show.
export function isHotbar(value: unknown): value is Hotbar {
  return (
    Array.isArray(value) &&
    value.length === HOTBAR_SLOTS &&
    value.every(
      (kind) =>
        kind === null || (typeof kind === 'string' && ASSIGNABLE.has(kind))
    )
  )
}

// A stored bar, with any kind the game no longer has cleared from its slot;
// the empty one when it is missing or malformed.
export function toHotbar(value: unknown): Hotbar {
  if (!Array.isArray(value) || value.length !== HOTBAR_SLOTS) {
    return EMPTY_HOTBAR
  }
  return value.map((kind: unknown) =>
    typeof kind === 'string' && ASSIGNABLE.has(kind) ? kind : null
  )
}

// An effect's span on the game clock, in seconds. Inactive when end <= now.
export interface EffectSpan {
  start: number
  end: number
}

// What the player has going: a cigarette lit (every cigarette waits on it),
// its ember after, the joint's perception, and the trails anything smoked
// or drunk puts on the view (trip.ts).
export interface Effects {
  smoking: EffectSpan
  ember: EffectSpan
  perception: EffectSpan
  trip: EffectSpan
}

export const NO_EFFECTS: Effects = {
  smoking: { start: 0, end: 0 },
  ember: { start: 0, end: 0 },
  perception: { start: 0, end: 0 },
  trip: { start: 0, end: 0 },
}

export interface Cooldown {
  // 1 just begun, falling to 0 as it runs out.
  fraction: number
  // Whole seconds left, rounded up.
  seconds: number
  phase: keyof Effects
}

function running(span: EffectSpan, phase: keyof Effects, time: number) {
  if (time >= span.end) return null
  const length = Math.max(1e-3, span.end - span.start)
  return {
    fraction: Math.min(1, (span.end - time) / length),
    seconds: Math.ceil(span.end - time),
    phase,
  }
}

// The sweep over a slot holding kind: cigarettes show the smoke, then the
// ember; the joint shows perception. Null when nothing runs for it.
export function cooldownOf(
  kind: string,
  effects: Effects,
  time: number
): Cooldown | null {
  if (isCigarette(kind)) {
    return (
      running(effects.smoking, 'smoking', time) ??
      running(effects.ember, 'ember', time)
    )
  }
  if (givesPerception(kind)) {
    return running(effects.perception, 'perception', time)
  }
  return null
}
