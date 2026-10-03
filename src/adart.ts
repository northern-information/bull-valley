// Canvas art for the advertisements on the Citgo walls: the cigarette price
// board behind the counter, the card over the door, and two drink posters.
// Drawn big and flat so they survive the PS1 downscale. One painter per
// sign, keyed by AdId; store.ts hangs them, assets.ts maps them. The prices
// come from items.ts, so the board never lies about the shelf.

import { canvas, SANS, SERIF, text } from './canvas.ts'
import { getItem } from './items.ts'
import { formatCash } from './store.ts'
import type { CanvasArt } from './canvas.ts'
import type { AdId } from './store.ts'

// About 100 pixels per metre, like the road sign.

// Black board, white price, a red band with the brand: the special-price
// card every counter has.
function smokes(): CanvasArt {
  const art = canvas([140, 100], '#141414')
  const { ctx, w } = art
  ctx.fillStyle = '#c8102e'
  ctx.fillRect(0, 0, w, 24)
  text(ctx, 'MARLBORO', w / 2, 12, w - 10, 15, SANS, '#f4f1ea')
  text(ctx, 'SPECIAL PRICE', w / 2, 36, w - 16, 10, SANS, '#d8d4c8')
  text(
    ctx,
    formatCash(getItem('marlboro').price),
    w / 2,
    64,
    w - 12,
    36,
    SANS,
    '#ffffff'
  )
  text(ctx, 'PLUS TAX', w / 2, 90, w - 16, 10, SANS, '#d8d4c8')
  return art
}

// A white card in a black frame, serif, taped up by the door.
function thanks(): CanvasArt {
  const art = canvas([120, 50], '#111111')
  const { ctx, w, h } = art
  ctx.fillStyle = '#f4f1ea'
  ctx.fillRect(2, 2, w - 4, h - 4)
  text(ctx, 'Thanks for', w / 2, 17, w - 14, 15, SERIF, '#1a1a1a')
  text(ctx, 'Shopping Here.', w / 2, 35, w - 14, 15, SERIF, '#1a1a1a')
  return art
}

// Blue field, a snowcap of white, yellow BEER.
function beer(): CanvasArt {
  const art = canvas([160, 100], '#1f3a93')
  const { ctx, w } = art
  ctx.fillStyle = '#f4f1ea'
  ctx.beginPath()
  ctx.moveTo(0, 0)
  ctx.lineTo(w, 0)
  ctx.lineTo(w, 10)
  for (let x = w; x >= 0; x -= 20) {
    ctx.lineTo(x - 10, 22)
    ctx.lineTo(x - 20, 10)
  }
  ctx.closePath()
  ctx.fill()
  text(ctx, 'ICE COLD', w / 2, 42, w - 16, 20, SANS, '#f4f1ea')
  text(ctx, 'BEER', w / 2, 76, w - 16, 40, SANS, '#ffd23f')
  return art
}

// Black field, green brand, the shelf price in white.
function energy(): CanvasArt {
  const art = canvas([160, 100], '#0c0c0c')
  const { ctx, w, h } = art
  ctx.fillStyle = '#7ed321'
  ctx.fillRect(0, h - 6, w, 6)
  text(ctx, 'MONSTER', w / 2, 30, w - 12, 30, SANS, '#7ed321')
  text(ctx, 'ENERGY', w / 2, 56, w - 40, 16, SANS, '#f4f1ea')
  text(
    ctx,
    `${formatCash(getItem('monster').price)} EACH`,
    w / 2,
    80,
    w - 30,
    12,
    SANS,
    '#f4f1ea'
  )
  return art
}

const PAINTERS: Record<AdId, () => CanvasArt> = { smokes, thanks, beer, energy }

export function paintAd(id: AdId): CanvasArt {
  return PAINTERS[id]()
}
