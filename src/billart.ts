// Canvas art for the $20 bill a shadow spider bursts into (drops.ts
// TWENTY): the face of a US twenty as it reads from a few strides off, the
// greens and the numerals, small and flat for the PS1 downscale. assets.ts
// maps it.

import { canvas, SERIF, text } from './canvas.ts'
import type { CanvasArt } from './canvas.ts'

const BILL_SIZE: [number, number] = [128, 54]

export function paintTwenty(): CanvasArt {
  const art = canvas(BILL_SIZE, '#c9d2bd')
  const { ctx, w, h } = art
  // The border, then the face inside it.
  ctx.strokeStyle = '#3f5a3c'
  ctx.lineWidth = 3
  ctx.strokeRect(3, 3, w - 6, h - 6)
  ctx.fillStyle = '#b6c2a6'
  ctx.fillRect(7, 7, w - 14, h - 14)
  // The portrait's oval, off centre.
  ctx.fillStyle = '#5d6f55'
  ctx.beginPath()
  ctx.ellipse(w * 0.55, h / 2, 13, 18, 0, 0, Math.PI * 2)
  ctx.fill()
  ctx.fillStyle = '#a3b192'
  ctx.beginPath()
  ctx.ellipse(w * 0.55, h / 2 + 2, 8, 12, 0, 0, Math.PI * 2)
  ctx.fill()
  // The numerals in the corners, the big one at the right.
  text(ctx, '20', 16, 15, 20, 12, SERIF, '#2d4229')
  text(ctx, '20', 16, h - 13, 20, 12, SERIF, '#2d4229')
  text(ctx, '20', w - 22, h / 2 + 1, 30, 24, SERIF, '#2d4229')
  // The green seal on the left.
  ctx.strokeStyle = '#4b7a45'
  ctx.lineWidth = 2
  ctx.beginPath()
  ctx.arc(w * 0.3, h / 2, 7, 0, Math.PI * 2)
  ctx.stroke()
  return art
}
