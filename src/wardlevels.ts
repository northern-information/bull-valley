// Pure: the wards, the raider's state of mind. Four levels, each from 0 to
// 1: how high, how stimulated, how drunk, how far into a trip. An item used
// doses one or more of them (items.ts `wards`), and each fades back
// toward 0 on the game clock at its own rate (CONFIG.wards.fadePerSecond). hud.ts
// draws them as a red tetrahedron turning in the upper left, each corner
// lit by its level; wards.ts says what each wards against.
//
// They are the account's, kept by the valley (sharedworld.ts rule 27) and
// sent to the client as levels; played alone, the client keeps its own.
// What else they do while they last is buffs.ts.

import { CONFIG } from './config.ts'
import { clamp01 } from './math.ts'
import type { WardAxis } from './interfaces.ts'

export const AXES: readonly WardAxis[] = [
  'high',
  'stimulated',
  'drunk',
  'tripping',
]

// The four levels as they stood at `at` (game seconds).
export interface WardState {
  at: number
  levels: Readonly<Record<WardAxis, number>>
}

export const SOBER: WardState = {
  at: 0,
  levels: { high: 0, stimulated: 0, drunk: 0, tripping: 0 },
}

// Every level at `time`, faded from where it stood. Time never runs back:
// an earlier time reads the levels as they stood. A level missing (a
// record kept before the trip had its own) reads as none.
export function levelsAt(g: WardState, time: number): Record<WardAxis, number> {
  const elapsed = Math.max(0, time - g.at)
  const fade = CONFIG.wards.fadePerSecond
  const at = (axis: WardAxis): number =>
    clamp01((g.levels[axis] ?? 0) - fade[axis] * elapsed)
  return {
    high: at('high'),
    stimulated: at('stimulated'),
    drunk: at('drunk'),
    tripping: at('tripping'),
  }
}

// The levels after a dose at `time`: each axis the dose names moves by its
// amount (a negative one brings it down, as water does the drunk), held
// between 0 and 1.
export function dose(
  g: WardState,
  amounts: Partial<Readonly<Record<WardAxis, number>>> | undefined,
  time: number
): WardState {
  const now = levelsAt(g, time)
  const by = (axis: WardAxis): number =>
    clamp01(now[axis] + (amounts?.[axis] ?? 0))
  return {
    at: Math.max(g.at, time),
    levels: {
      high: by('high'),
      stimulated: by('stimulated'),
      drunk: by('drunk'),
      tripping: by('tripping'),
    },
  }
}
