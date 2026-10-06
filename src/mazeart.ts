// Canvas art for the corn maze: the stalks painted on its walls, and the
// hand-painted CORN MAZE! sign by the road, clown and all. Drawn small and
// flat so they survive the PS1 downscale; assets.ts maps them.

import { canvas, SANS, text } from './canvas.ts'
import { mulberry32, range } from './rng.ts'
import type { CanvasArt } from './canvas.ts'

// One wall piece's face: a dense mass of stalks and leaves, ragged where
// the tassels stand up off the top. Transparent above the mass, so the
// material's alphaTest cuts the skyline out of the card.
export const STALK_MASS_TOP = 0.2 // how far down the canvas the mass starts

export function paintCornStalks(seed = 0xc022): CanvasArt {
  const rng = mulberry32(seed)
  const art = canvas([48, 64])
  const { ctx, w, h } = art
  const top = Math.round(h * STALK_MASS_TOP)
  ctx.fillStyle = '#34361a'
  ctx.fillRect(0, top, w, h - top)
  // Stalks, back to front: darker behind, paler in front.
  const stalks = ['#4a4a22', '#5c5a2a', '#76703a', '#8f8549']
  stalks.forEach((color, layer) => {
    ctx.strokeStyle = color
    ctx.lineWidth = 2
    for (let i = 0; i < 6; i++) {
      const x = range(rng, 0, w)
      const lean = range(rng, -3, 3)
      const crown = range(rng, 2, top + 6 - layer)
      ctx.beginPath()
      ctx.moveTo(x, h)
      ctx.lineTo(x + lean, crown)
      ctx.stroke()
      // Leaves off the stalk, arching out and down.
      ctx.lineWidth = 2
      for (let k = 0; k < 3; k++) {
        const y = range(rng, crown + 6, h - 6)
        const side = rng() < 0.5 ? -1 : 1
        ctx.beginPath()
        ctx.moveTo(x + lean * ((h - y) / h), y)
        ctx.quadraticCurveTo(
          x + side * 7,
          y - 6,
          x + side * range(rng, 9, 14),
          y + range(rng, 1, 6)
        )
        ctx.stroke()
      }
      // A dry tassel at the crown.
      ctx.fillStyle = '#c4ab62'
      ctx.fillRect(x + lean - 1, crown - 4, 2, 4)
    }
  })
  return art
}

// The sign's board, about 80 pixels a metre: white paint inside a red
// border, CORN MAZE! across the top and a grinning clown under it.
export const MAZE_SIGN_SIZE: [number, number] = [240, 160]

export function paintCornMazeSign(): CanvasArt {
  const art = canvas(MAZE_SIGN_SIZE, '#c8202a')
  const { ctx, w, h } = art
  ctx.fillStyle = '#f3ead2'
  ctx.fillRect(6, 6, w - 12, h - 12)
  // A drop shadow under the red, like a brush went round it twice.
  text(ctx, 'CORN MAZE!', w / 2 + 2, 32, w - 26, 34, SANS, '#2a1a12')
  text(ctx, 'CORN MAZE!', w / 2, 30, w - 26, 34, SANS, '#d42a1e')
  paintClown(ctx, w / 2, 106)
  return art
}

// The small board at the gate, painted like the big one: ENTER! over a
// fat arrow pointing right, at the gate.
export const ENTER_SIGN_SIZE: [number, number] = [160, 100]

export function paintEnterSign(): CanvasArt {
  const art = canvas(ENTER_SIGN_SIZE, '#c8202a')
  const { ctx, w, h } = art
  ctx.fillStyle = '#f3ead2'
  ctx.fillRect(5, 5, w - 10, h - 10)
  text(ctx, 'ENTER!', w / 2 + 2, 28, w - 24, 30, SANS, '#2a1a12')
  text(ctx, 'ENTER!', w / 2, 26, w - 24, 30, SANS, '#d42a1e')
  // The arrow: a shaft and a head, with the same dark drop under it.
  const arrow = (dx: number, dy: number, color: string) => {
    ctx.fillStyle = color
    ctx.beginPath()
    ctx.moveTo(24 + dx, 58 + dy)
    ctx.lineTo(100 + dx, 58 + dy)
    ctx.lineTo(100 + dx, 46 + dy)
    ctx.lineTo(136 + dx, 68 + dy)
    ctx.lineTo(100 + dx, 90 + dy)
    ctx.lineTo(100 + dx, 78 + dy)
    ctx.lineTo(24 + dx, 78 + dy)
    ctx.closePath()
    ctx.fill()
  }
  arrow(2, 2, '#2a1a12')
  arrow(0, 0, '#d42a1e')
  return art
}

// The portal at the maze's heart: a spiral of pale green bands on black,
// brightest at the eye, fading to nothing at the rim. Drawn for additive
// blending, so black is clear.
export function paintPortalSwirl(): CanvasArt {
  const art = canvas([64, 64], '#000000')
  const { ctx, w, h } = art
  const cx = w / 2
  const cy = h / 2
  const r = w / 2
  for (let arm = 0; arm < 3; arm++) {
    for (let s = 0; s < 1; s += 0.01) {
      const a = (arm / 3) * Math.PI * 2 + s * Math.PI * 3
      const d = s * r
      const fade = 1 - s
      ctx.fillStyle = `rgba(150, 255, 210, ${(0.25 + fade * 0.75).toFixed(2)})`
      ctx.beginPath()
      ctx.arc(
        cx + Math.cos(a) * d,
        cy + Math.sin(a) * d,
        1 + s * 4,
        0,
        Math.PI * 2
      )
      ctx.fill()
    }
  }
  const eye = ctx.createRadialGradient(cx, cy, 0, cx, cy, r * 0.4)
  eye.addColorStop(0, 'rgba(230, 255, 245, 1)')
  eye.addColorStop(1, 'rgba(60, 200, 160, 0)')
  ctx.fillStyle = eye
  ctx.fillRect(0, 0, w, h)
  return art
}

// A happy clown's face centred on (x, y): orange tufts, a white face, blue
// diamond eyes, a red nose and a wide red grin, and a little party hat.
function paintClown(ctx: CanvasRenderingContext2D, x: number, y: number) {
  const r = 34
  const disc = (cx: number, cy: number, radius: number, color: string) => {
    ctx.fillStyle = color
    ctx.beginPath()
    ctx.arc(cx, cy, radius, 0, Math.PI * 2)
    ctx.fill()
  }
  // Hair in tufts either side.
  for (const side of [-1, 1]) {
    disc(x + side * (r + 4), y - 8, 13, '#ff7a1a')
    disc(x + side * (r + 10), y + 6, 11, '#ff7a1a')
    disc(x + side * (r - 2), y - 22, 11, '#ff7a1a')
  }
  // The hat, and its pompom.
  ctx.fillStyle = '#7b3fc4'
  ctx.beginPath()
  ctx.moveTo(x - 16, y - r + 6)
  ctx.lineTo(x + 16, y - r + 6)
  ctx.lineTo(x + 4, y - r - 22)
  ctx.closePath()
  ctx.fill()
  disc(x + 4, y - r - 23, 5, '#ffd23f')
  // The face, outlined.
  disc(x, y, r + 2, '#2a1a12')
  disc(x, y, r, '#fbf7ee')
  disc(x - 20, y + 8, 6, '#f6a5b5')
  disc(x + 20, y + 8, 6, '#f6a5b5')
  // Diamond eyes with a pupil each.
  for (const side of [-1, 1]) {
    const ex = x + side * 13
    const ey = y - 9
    ctx.fillStyle = '#2f6fdc'
    ctx.beginPath()
    ctx.moveTo(ex, ey - 10)
    ctx.lineTo(ex + 6, ey)
    ctx.lineTo(ex, ey + 10)
    ctx.lineTo(ex - 6, ey)
    ctx.closePath()
    ctx.fill()
    disc(ex, ey, 2.5, '#141414')
  }
  // The grin: a red crescent, white teeth across it.
  ctx.fillStyle = '#e3242b'
  ctx.beginPath()
  ctx.arc(x, y + 4, 22, 0.1 * Math.PI, 0.9 * Math.PI)
  ctx.arc(x, y + 2, 15, 0.85 * Math.PI, 0.15 * Math.PI, true)
  ctx.closePath()
  ctx.fill()
  ctx.fillStyle = '#fbf7ee'
  ctx.fillRect(x - 9, y + 19, 18, 3)
  disc(x, y + 2, 7, '#e3242b')
}
