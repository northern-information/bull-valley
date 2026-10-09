// Canvas art for the advertisements on the Citgo walls: the cigarette price
// board behind the counter, the card over the door, and two drink posters;
// and in the back room the flag over the lockers, the health and safety
// notices every employer pins up, and the bathroom's signs. Drawn big and
// flat so they survive the PS1 downscale. One painter per sign, keyed by
// AdId; store.ts hangs them, assets.ts maps them. The prices come from
// items.ts, so the board never lies about the shelf.

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

// --- The back room -------------------------------------------------------

// The back room's notices are drawn at about 200 pixels per metre, so their
// small print still reads as print.

const OLD_GLORY = { red: '#b22234', white: '#f2efe6', blue: '#3c3b6e' }

// A five-pointed star of outer radius r, point up.
function star(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  r: number
): void {
  ctx.beginPath()
  for (let i = 0; i < 10; i++) {
    const radius = i % 2 === 0 ? r : r * 0.38
    const a = -Math.PI / 2 + (i * Math.PI) / 5
    ctx.lineTo(x + Math.cos(a) * radius, y + Math.sin(a) * radius)
  }
  ctx.closePath()
  ctx.fill()
}

// The flag: thirteen stripes, the canton seven stripes deep and two fifths
// of the fly, fifty stars in nine rows of six and five.
function flag(): CanvasArt {
  const art = canvas([304, 160], OLD_GLORY.white)
  const { ctx, w, h } = art
  const stripe = h / 13
  ctx.fillStyle = OLD_GLORY.red
  for (let i = 0; i < 13; i += 2) {
    ctx.fillRect(0, Math.round(i * stripe), w, Math.round(stripe))
  }
  const cw = w * 0.4
  const ch = stripe * 7
  ctx.fillStyle = OLD_GLORY.blue
  ctx.fillRect(0, 0, cw, ch)
  ctx.fillStyle = OLD_GLORY.white
  const dx = cw / 12
  const dy = ch / 10
  for (let row = 0; row < 9; row++) {
    const odd = row % 2 === 1
    for (let col = 0; col < (odd ? 5 : 6); col++) {
      star(ctx, dx * (col * 2 + (odd ? 2 : 1)), dy * (row + 1), dy * 0.42)
    }
  }
  return art
}

// A notice with a colored header band over a pale sheet: the band's words,
// then the body's lines in black.
function notice(
  size: [number, number],
  band: string,
  head: string,
  lines: string[]
): CanvasArt {
  const art = canvas(size, '#f2efe6')
  const { ctx, w, h } = art
  const bandH = Math.round(h * 0.2)
  ctx.fillStyle = band
  ctx.fillRect(0, 0, w, bandH)
  text(ctx, head, w / 2, bandH / 2, w - 12, bandH * 0.6, SANS, '#ffffff')
  const top = bandH + 8
  const step = (h - top - 8) / lines.length
  lines.forEach((line, i) => {
    text(ctx, line, w / 2, top + step * (i + 0.5), w - 14, 13, SANS, '#1a1a1a')
  })
  ctx.strokeStyle = '#1a1a1a'
  ctx.lineWidth = 2
  ctx.strokeRect(1, 1, w - 2, h - 2)
  return art
}

// A stick figure lifting a box the right way: knees bent, back straight.
function lift(): CanvasArt {
  const art = notice([120, 160], '#1f6b3a', 'SAFETY', [])
  const { ctx, w, h } = art
  ctx.strokeStyle = '#1a1a1a'
  ctx.lineWidth = 3
  ctx.lineCap = 'round'
  const cx = w / 2
  ctx.beginPath()
  ctx.arc(cx, 48, 7, 0, Math.PI * 2)
  ctx.moveTo(cx, 55)
  ctx.lineTo(cx, 82)
  ctx.moveTo(cx, 82)
  ctx.lineTo(cx + 14, 92)
  ctx.lineTo(cx + 6, 108)
  ctx.moveTo(cx, 82)
  ctx.lineTo(cx - 14, 92)
  ctx.lineTo(cx - 6, 108)
  ctx.moveTo(cx, 64)
  ctx.lineTo(cx + 14, 82)
  ctx.moveTo(cx, 64)
  ctx.lineTo(cx - 14, 82)
  ctx.stroke()
  ctx.fillStyle = '#a07a4a'
  ctx.fillRect(cx - 18, 80, 36, 22)
  text(ctx, 'LIFT WITH', w / 2, h - 36, w - 14, 14, SANS, '#1a1a1a')
  text(ctx, 'YOUR LEGS', w / 2, h - 18, w - 14, 14, SANS, '#c8102e')
  return art
}

// The board on the wall by the doorway, its count never once past zero.
function accidents(): CanvasArt {
  const art = canvas([180, 120], '#1f6b3a')
  const { ctx, w, h } = art
  ctx.fillStyle = '#f2efe6'
  ctx.fillRect(6, 6, w - 12, h - 12)
  text(ctx, 'THIS WORKPLACE HAS GONE', w / 2, 22, w - 24, 12, SANS, '#1a1a1a')
  ctx.fillStyle = '#141414'
  ctx.fillRect(w / 2 - 26, 34, 52, 44)
  text(ctx, '0', w / 2, 57, 44, 40, SANS, '#c8102e')
  text(ctx, 'DAYS WITHOUT', w / 2, 90, w - 24, 13, SANS, '#1a1a1a')
  text(ctx, 'AN ACCIDENT', w / 2, h - 16, w - 24, 13, SANS, '#1f6b3a')
  return art
}

// The workers' rights notice: dense print nobody reads.
function theLaw(): CanvasArt {
  return notice([120, 160], '#1f3a93', "IT'S THE LAW!", [
    'JOB SAFETY',
    'AND HEALTH',
    'You have the right',
    'to a safe workplace.',
    'Report hazards to',
    'your manager.',
    'Post in a place',
    'all can see.',
  ])
}

// What to do when the store burns.
function fire(): CanvasArt {
  return notice([120, 160], '#c8102e', 'IN CASE OF FIRE', [
    '1. PULL ALARM',
    '2. LEAVE BUILDING',
    '3. CALL 911',
    'DO NOT USE',
    'ELEVATORS',
  ])
}

// The bathroom's door sign: a figure on blue.
function restroom(): CanvasArt {
  const art = canvas([60, 60], '#1f3a93')
  const { ctx, w } = art
  ctx.fillStyle = '#f2efe6'
  ctx.beginPath()
  ctx.arc(w / 2, 14, 5, 0, Math.PI * 2)
  ctx.fill()
  ctx.fillRect(w / 2 - 7, 21, 14, 16)
  ctx.fillRect(w / 2 - 6, 37, 5, 12)
  ctx.fillRect(w / 2 + 1, 37, 5, 12)
  text(ctx, 'RESTROOM', w / 2, 54, w - 6, 8, SANS, '#f2efe6')
  return art
}

// Over the sink, the one every bathroom behind a counter has.
function washHands(): CanvasArt {
  const art = canvas([120, 90], '#f2efe6')
  const { ctx, w, h } = art
  ctx.fillStyle = '#c8102e'
  ctx.fillRect(0, 0, w, 6)
  ctx.fillRect(0, h - 6, w, 6)
  text(ctx, 'EMPLOYEES', w / 2, 24, w - 14, 16, SANS, '#1a1a1a')
  text(ctx, 'MUST WASH', w / 2, 44, w - 14, 16, SANS, '#1a1a1a')
  text(ctx, 'HANDS', w / 2, 66, w - 14, 20, SANS, '#c8102e')
  return art
}

const PAINTERS: Record<AdId, () => CanvasArt> = {
  smokes,
  thanks,
  beer,
  energy,
  flag,
  lift,
  accidents,
  'the-law': theLaw,
  fire,
  restroom,
  'wash-hands': washHands,
}

export function paintAd(id: AdId): CanvasArt {
  return PAINTERS[id]()
}
