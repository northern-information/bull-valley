// Pure: what the wards do to the view at a moment, as the numbers the
// view's pass (trails.ts) draws with. Drunk trails the view, as every
// drink and smoke once did: each frame keeps some of the one before, so
// anything that moves smears behind itself. High saturates the colours and
// adds a little of the trails; stimulated sharpens every edge. Each works
// at full strength from CONFIG.wardView.full up, in proportion below, and
// fades as its ward does. The blur at the moment of a use is trip.ts's.
// Tripping's sights are drawn elsewhere.

import { CONFIG } from './config.ts'
import { clamp01 } from './math.ts'
import type { WardAxis } from './interfaces.ts'

export interface WardView {
  // The blur's reach, in internal pixels: 0 for none.
  blur: number
  // How much of the last frame each frame keeps: 0 for no trails.
  keep: number
  // Saturation: 1 leaves the colours as they are.
  saturation: number
  // The unsharp mask's amount: 0 for none.
  sharpen: number
}

export const CLEAR: WardView = { blur: 0, keep: 0, saturation: 1, sharpen: 0 }

// Below this, an effect is too faint to draw.
const FAINT = 1e-3

// The view under `levels` (wardlevels.ts levelsAt), with `blur` from 0 to
// 1 (trip.ts tripBlur) for the moment of a use.
export function wardView(
  levels: Readonly<Record<WardAxis, number>>,
  blur: number
): WardView {
  const { full, persistence, highTrails, saturation, sharpen } = CONFIG.wardView
  const strength = (axis: WardAxis): number => clamp01(levels[axis] / full)
  const high = strength('high')
  const trails = clamp01(strength('drunk') + highTrails * high)
  return {
    blur: clamp01(blur) * CONFIG.trip.blurRadius,
    keep: persistence * trails,
    saturation: 1 + (saturation - 1) * high,
    sharpen: sharpen * strength('stimulated'),
  }
}

// Whether the view draws straight to the screen: nothing worth a pass.
export function isClear(v: WardView): boolean {
  return (
    v.blur < FAINT &&
    v.keep < FAINT &&
    Math.abs(v.saturation - 1) < FAINT &&
    v.sharpen < FAINT
  )
}
