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

const AWNING_SIZE: [number, number] = [128, 32]

// The canopy's cloth: faded red and white stripes, nine across, the white
// gone the color of old newspaper.
export function paintAwning(): CanvasArt {
  const art = canvas(AWNING_SIZE, '#e9dfc4')
  const { ctx, w, h } = art
  const stripes = 9
  ctx.fillStyle = '#9e2f2a'
  for (let i = 0; i < stripes; i += 2) {
    ctx.fillRect((i * w) / stripes, 0, w / stripes, h)
  }
  return art
}

const OPEN_BOARD_SIZE: [number, number] = [96, 128]

// The sandwich board out front: OPEN in red over the goods, brushed on a
// whitewashed board.
export function paintOpenBoard(): CanvasArt {
  const art = canvas(OPEN_BOARD_SIZE, '#5a4630')
  const { ctx, w, h } = art
  ctx.fillStyle = '#ece4cc'
  ctx.fillRect(5, 5, w - 10, h - 10)
  text(ctx, 'OPEN', w / 2, 34, w - 18, 30, SANS, '#a3271f')
  text(ctx, 'CABBAGE', w / 2, 72, w - 18, 16, SANS, '#2f4a2a')
  text(ctx, '&', w / 2, 90, w - 18, 12, SANS, '#2f4a2a')
  text(ctx, 'BERRIES', w / 2, 108, w - 18, 16, SANS, '#2f4a2a')
  return art
}
