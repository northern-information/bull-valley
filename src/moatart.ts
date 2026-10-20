// Canvas art for Castle Entropy's moat and the castle (moatmodel.ts,
// castlemodel.ts): poured concrete, grey, its formwork panels and tie
// holes still showing, streaked where water has run down it for decades;
// and the vines that hang down the walls, cut out against the dark. Each
// painted once and kept (assetkit.ts memo), its texture shared.

import { canvas } from './canvas.ts'
import { mulberry32, range } from './rng.ts'
import type { CanvasArt } from './canvas.ts'

// Board-formed concrete, one panel 128 px a side: tiles both ways.
export function concreteArt(base = '#77746f'): CanvasArt {
  const art = canvas([128, 128], base)
  const { ctx, w, h } = art
  const rng = mulberry32(0xc0c7e)
  // Mottle.
  for (let i = 0; i < 900; i++) {
    const shade = Math.floor(range(rng, 90, 140))
    ctx.fillStyle = `rgba(${shade}, ${shade - 2}, ${shade - 6}, 0.18)`
    ctx.fillRect(
      Math.floor(rng() * w),
      Math.floor(rng() * h),
      1 + Math.floor(rng() * 3),
      1 + Math.floor(rng() * 3)
    )
  }
  // The formwork's seams: a panel joint across, the boards' grain down.
  ctx.fillStyle = 'rgba(30, 28, 26, 0.45)'
  ctx.fillRect(0, h - 2, w, 2)
  ctx.fillRect(w - 2, 0, 2, h)
  ctx.fillStyle = 'rgba(40, 38, 35, 0.12)'
  for (let x = 8; x < w; x += 16) ctx.fillRect(x, 0, 1, h)
  // Tie holes, in pairs.
  ctx.fillStyle = 'rgba(20, 18, 16, 0.8)'
  for (const [x, y] of [
    [24, 30],
    [104, 30],
    [24, 94],
    [104, 94],
  ]) {
    ctx.fillRect(x - 2, y - 2, 4, 4)
  }
  // Streaks run down from the holes and the joint: rust and black water.
  for (let i = 0; i < 26; i++) {
    const x = Math.floor(rng() * w)
    const top = Math.floor(rng() * h * 0.6)
    const long = Math.floor(range(rng, 20, 90))
    const rust = rng() < 0.3
    const grad = ctx.createLinearGradient(0, top, 0, top + long)
    grad.addColorStop(
      0,
      rust ? 'rgba(110, 58, 26, 0.45)' : 'rgba(18, 18, 16, 0.45)'
    )
    grad.addColorStop(1, 'rgba(0, 0, 0, 0)')
    ctx.fillStyle = grad
    ctx.fillRect(x, top, 1 + Math.floor(rng() * 2), long)
  }
  return art
}

// One hanging vine, 64 by 256 px: a few strands from the top, leaves
// along them, clear between, so a strip of it cuts out against the wall.
export function vineArt(): CanvasArt {
  const art = canvas([64, 256])
  const { ctx, w, h } = art
  const rng = mulberry32(0x71e5)
  for (let s = 0; s < 5; s++) {
    let x = range(rng, 8, w - 8)
    const end = range(rng, h * 0.45, h)
    ctx.strokeStyle = '#2a3a1c'
    ctx.lineWidth = 2
    ctx.beginPath()
    ctx.moveTo(x, 0)
    for (let y = 0; y < end; y += 8) {
      x = Math.max(4, Math.min(w - 4, x + range(rng, -3, 3)))
      ctx.lineTo(x, y)
      if (rng() < 0.7) {
        const green = Math.floor(range(rng, 50, 90))
        ctx.fillStyle = `rgb(${green - 20}, ${green}, ${green - 35})`
        const side = rng() < 0.5 ? -1 : 1
        ctx.fillRect(x + side * range(rng, 1, 5), y, 5, 4)
        ctx.fillRect(x + side * range(rng, 1, 3), y + 3, 3, 3)
      }
    }
    ctx.stroke()
  }
  return art
}
