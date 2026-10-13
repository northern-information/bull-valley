// Canvas art for the Undercroft (undercroft.ts): the sigil chalked on the
// chalk room's floor and cut over the altar (Erwin's triangle in its
// circle, ringed with marks no one reads), the shadowmen's names cut into
// the ossuary's end wall, and the line over the way into the deep chamber.
// Drawn small and rough so it survives the PS1 downscale; assets.ts maps
// it. The names are the Scaduscope's folklore (names.ts), carved like the
// tombstones' and like them not in COPY.toml.

import { canvas, SERIF, text } from './canvas.ts'
import { generateName } from './names.ts'
import { mulberry32, range } from './rng.ts'
import type { CanvasArt } from './canvas.ts'
import type { CroftArtId } from './undercroft.ts'

// The sigil: a circle, the triangle inside it, the eye in the triangle,
// and runes round the ring. Chalk on the floor, transparent between.
function sigil(): CanvasArt {
  const art = canvas([256, 256])
  const { ctx, w, h } = art
  const rng = mulberry32(0x5161)
  ctx.strokeStyle = 'rgba(236, 230, 214, 0.85)'
  ctx.lineWidth = 3
  for (const r of [118, 100]) {
    ctx.beginPath()
    ctx.arc(w / 2, h / 2, r, 0, Math.PI * 2)
    ctx.stroke()
  }
  ctx.beginPath()
  for (let i = 0; i <= 3; i++) {
    const a = -Math.PI / 2 + (i * Math.PI * 2) / 3
    const x = w / 2 + Math.cos(a) * 96
    const y = h / 2 + Math.sin(a) * 96
    if (i === 0) ctx.moveTo(x, y)
    else ctx.lineTo(x, y)
  }
  ctx.stroke()
  ctx.beginPath()
  ctx.ellipse(w / 2, h / 2 + 14, 22, 12, 0, 0, Math.PI * 2)
  ctx.stroke()
  ctx.fillStyle = 'rgba(236, 230, 214, 0.85)'
  ctx.beginPath()
  ctx.arc(w / 2, h / 2 + 14, 5, 0, Math.PI * 2)
  ctx.fill()
  // The runes: short strokes between the rings.
  ctx.lineWidth = 2
  for (let i = 0; i < 24; i++) {
    const a = (i / 24) * Math.PI * 2
    const x = w / 2 + Math.cos(a) * 109
    const y = h / 2 + Math.sin(a) * 109
    ctx.beginPath()
    ctx.moveTo(x + range(rng, -4, 4), y + range(rng, -4, 4))
    ctx.lineTo(x + range(rng, -4, 4), y + range(rng, -4, 4))
    ctx.lineTo(x + range(rng, -4, 4), y + range(rng, -4, 4))
    ctx.stroke()
  }
  return art
}

// The names, cut into stone: pale grooves on dark rock, row by row.
function names(): CanvasArt {
  const art = canvas([256, 128], '#2c2a27')
  const { ctx, w } = art
  const rng = mulberry32(0x0551)
  for (let i = 0; i < 7; i++) {
    const name = generateName(rng).toUpperCase()
    text(ctx, name, w / 2, 12 + i * 17, w - 20, 12, SERIF, '#8f8a7e')
  }
  return art
}

function warning(): CanvasArt {
  const art = canvas([192, 64], '#2c2a27')
  const { ctx, w } = art
  text(ctx, 'WHAT YOU TAKE', w / 2, 20, w - 20, 18, SERIF, '#9a2a22')
  text(ctx, 'YOU OWE', w / 2, 44, w - 60, 18, SERIF, '#9a2a22')
  return art
}

const PAINTERS: Record<CroftArtId, () => CanvasArt> = { sigil, names, warning }

export function paintCroftArt(id: CroftArtId): CanvasArt {
  return PAINTERS[id]()
}
