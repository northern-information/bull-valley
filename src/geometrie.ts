// Pure: geometrie, the player's state of mind, a stat like hp or mp. Three
// levels, each from 0 to 1: how high, how stimulated, how drunk. An item
// used doses one or more of them (items.ts `geometrie`), and each fades
// back toward 0 on the game clock at its own rate (CONFIG.geometrie). hud.ts
// draws it as a red triangle: the top corner lights with high, the lower
// right with stimulated, the lower left with drunk.
//
// It is the account's, kept by the valley (sharedworld.ts rule 25) and sent
// to the client as levels; played alone, the client keeps its own. What
// it does while it lasts is buffs.ts.

import { CONFIG } from './config.ts'
import type { GeometrieAxis } from './interfaces.ts'

export const AXES: readonly GeometrieAxis[] = ['high', 'stimulated', 'drunk']

// The three levels as they stood at `at` (game seconds).
export interface Geometrie {
  at: number
  levels: Readonly<Record<GeometrieAxis, number>>
}

export const SOBER: Geometrie = {
  at: 0,
  levels: { high: 0, stimulated: 0, drunk: 0 },
}

const clamp01 = (value: number) => Math.min(1, Math.max(0, value))

// Every level at `time`, faded from where it stood. Time never runs back:
// an earlier time reads the levels as they stood.
export function levelsAt(
  g: Geometrie,
  time: number
): Record<GeometrieAxis, number> {
  const elapsed = Math.max(0, time - g.at)
  const fade = CONFIG.geometrie.fadePerSecond
  return {
    high: clamp01(g.levels.high - fade.high * elapsed),
    stimulated: clamp01(g.levels.stimulated - fade.stimulated * elapsed),
    drunk: clamp01(g.levels.drunk - fade.drunk * elapsed),
  }
}

// The levels after a dose at `time`: each axis the dose names moves by its
// amount (a negative one brings it down, as water does the drunk), held
// between 0 and 1.
export function dose(
  g: Geometrie,
  amounts: Partial<Readonly<Record<GeometrieAxis, number>>> | undefined,
  time: number
): Geometrie {
  const now = levelsAt(g, time)
  return {
    at: Math.max(g.at, time),
    levels: {
      high: clamp01(now.high + (amounts?.high ?? 0)),
      stimulated: clamp01(now.stimulated + (amounts?.stimulated ?? 0)),
      drunk: clamp01(now.drunk + (amounts?.drunk ?? 0)),
    },
  }
}
