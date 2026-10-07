// Pure: how hard anything smoked or drunk is working on the view at a
// moment, from its span on the game clock (hotbar.ts Effects.trip). Each
// use starts the span afresh: the view blurs for CONFIG.trip.blurSeconds,
// and trails follow every move until the span ends, thinning out over its
// last CONFIG.trip.fadeSeconds. trails.ts draws it.

import { CONFIG } from './config.ts'
import type { EffectSpan } from './hotbar.ts'

export interface TripLevel {
  // 1 the moment it is used, falling to 0 over blurSeconds.
  blur: number
  // 1 while the trip runs, thinning to 0 as it ends.
  trails: number
}

export const SOBER: TripLevel = { blur: 0, trails: 0 }

export function tripLevel(span: EffectSpan, time: number): TripLevel {
  if (time < span.start || time >= span.end) return SOBER
  const { blurSeconds, fadeSeconds } = CONFIG.trip
  const since = time - span.start
  return {
    blur: since < blurSeconds ? 1 - since / blurSeconds : 0,
    trails: Math.min(1, (span.end - time) / fadeSeconds),
  }
}
