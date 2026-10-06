// Canvas art for the Bull Valley Cabbage Stand at the spawn Citgo: the
// hand-painted board on its roof. Drawn small and flat so it survives the
// PS1 downscale; assets.ts maps it.

import { canvas, SANS, text } from './canvas.ts'
import type { CanvasArt } from './canvas.ts'

const STAND_SIGN_SIZE: [number, number] = [256, 64]

// White house paint on weathered green, the words brushed on twice.
export function paintStandSign(): CanvasArt {
  const art = canvas(STAND_SIGN_SIZE, '#2f4a2a')
  const { ctx, w, h } = art
  ctx.fillStyle = '#3d5c35'
  ctx.fillRect(4, 4, w - 8, h - 8)
  text(ctx, 'CABBAGE', w / 2 + 2, 24, w - 24, 30, SANS, '#1a2416')
  text(ctx, 'CABBAGE', w / 2, 22, w - 24, 30, SANS, '#efe8d4')
  text(ctx, 'BULL VALLEY', w / 2, 50, w - 40, 14, SANS, '#d8cfb4')
  return art
}
