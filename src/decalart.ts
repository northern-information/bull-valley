// Canvas art for the decals printed on character parts (outfits.ts DecalId),
// drawn small enough to survive the PS1 downscale:
//   suicide-silence  the band tee print. A transparent canvas mapped across
//                    the whole torso front (SHIRT_FRONT), letters on the
//                    chest only, so the shirt shows through everywhere else.
//   russ             the belt buckle face: gold letters on a dark plate.

import { canvas, text } from './canvas.ts'
import type { CanvasArt, CanvasSize } from './canvas.ts'
import type { DecalId } from './outfits.ts'

// The torso front in metres, which a shirt print canvas covers: the full
// width at the shoulders and the full height from the waist.
export const SHIRT_FRONT = { width: 0.41, height: 0.5 }

// A shirt print canvas keeps the torso front's aspect ratio.
const SHIRT: CanvasSize = [123, 150]
const BUCKLE: CanvasSize = [75, 48]

// Tall, tight capitals: the nearest a browser font gets to a band logo.
const CONDENSED =
  'bold $px Impact, "Arial Narrow", "Helvetica Neue", sans-serif'

function suicideSilence(): CanvasArt {
  const art = canvas(SHIRT)
  const { ctx, w } = art
  // Chest height: 0.27 to 0.4 m up the torso, read from the canvas top.
  text(ctx, 'SUICIDE', w / 2, 38, 64, 20, CONDENSED, '#111111')
  text(ctx, 'SILENCE', w / 2, 58, 64, 20, CONDENSED, '#111111')
  return art
}

function russ(): CanvasArt {
  const gold = '#d9b23a'
  const art = canvas(BUCKLE, gold)
  const { ctx, w, h } = art
  ctx.fillStyle = '#1a1714'
  ctx.fillRect(5, 5, w - 10, h - 10)
  text(ctx, 'RUSS', w / 2, h / 2 + 1, w - 16, 30, CONDENSED, gold)
  return art
}

export const DECAL_PAINTERS: Record<DecalId, () => CanvasArt> = {
  'suicide-silence': suicideSilence,
  russ,
}
