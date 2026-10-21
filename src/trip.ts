// Pure: the blur at the moment anything smoked or drunk is used, from its
// span on the game clock (hotbar.ts Effects.trip). Each use starts the span
// afresh, and the view blurs for CONFIG.trip.blurSeconds. trails.ts draws
// it; what the wards do to the view after is wardview.ts.

import { CONFIG } from './config.ts'
import type { EffectSpan } from './hotbar.ts'

// 1 the moment it is used, falling to 0 over blurSeconds; 0 outside the
// span.
export function tripBlur(span: EffectSpan, time: number): number {
  if (time < span.start || time >= span.end) return 0
  const since = time - span.start
  const { blurSeconds } = CONFIG.trip
  return since < blurSeconds ? 1 - since / blurSeconds : 0
}
