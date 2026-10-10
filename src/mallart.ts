// Canvas art for Bull Valley Plaza (stripmall.ts): the shop signs on the
// fascia, the pylon's panels by the road, the boards and the graffiti
// inside, and the chalk on the Golden Wok's floor. Everything faded, as if
// the plaza went dark twenty years ago. Drawn small and flat so it
// survives the PS1 downscale; assets.ts maps it.

import { canvas, SANS, SERIF, text } from './canvas.ts'
import { mulberry32, range } from './rng.ts'
import type { CanvasArt } from './canvas.ts'
import type { MallArtId } from './stripmall.ts'

// Weather on a painted panel: a grime wash and specks, from its own seed.
function weather(art: CanvasArt, seed: number, amount = 1): void {
  const { ctx, w, h } = art
  const rng = mulberry32(seed)
  const grime = ctx.createLinearGradient(0, 0, 0, h)
  grime.addColorStop(0, 'rgba(20, 16, 10, 0.05)')
  grime.addColorStop(1, `rgba(30, 24, 14, ${0.35 * amount})`)
  ctx.fillStyle = grime
  ctx.fillRect(0, 0, w, h)
  for (let i = 0; i < 60 * amount; i++) {
    ctx.fillStyle = `rgba(15, 12, 8, ${range(rng, 0.1, 0.4)})`
    ctx.fillRect(range(rng, 0, w), range(rng, 0, h), range(rng, 1, 3), 1)
  }
}

// A letter fallen off: a darker patch where the letter's paint kept the sun
// off, at `x` across a panel's row at `y`.
function ghost(art: CanvasArt, x: number, y: number, size: number): void {
  art.ctx.fillStyle = 'rgba(0, 0, 0, 0.22)'
  art.ctx.fillRect(x - size * 0.3, y - size * 0.45, size * 0.6, size * 0.9)
}

// The fascia signs, 512 by 76: the same box every shop rented.
const FASCIA: [number, number] = [512, 76]

function videoVault(): CanvasArt {
  const art = canvas(FASCIA, '#1f2f63')
  const { ctx, w, h } = art
  ctx.fillStyle = '#c9a227'
  ctx.fillRect(0, h - 10, w, 6)
  text(ctx, 'VIDEO VAULT', w / 2 + 2, h / 2 - 2, w - 60, 52, SANS, '#0d1430')
  text(ctx, 'VIDEO VAULT', w / 2, h / 2 - 4, w - 60, 52, SANS, '#d9b23a')
  // The second O went years ago.
  ctx.fillStyle = '#1f2f63'
  ctx.fillRect(w * 0.355, 10, 30, 46)
  ghost(art, w * 0.37, h / 2 - 4, 46)
  weather(art, 0x71de0)
  return art
}

function suds(): CanvasArt {
  const art = canvas(FASCIA, '#d9dfe0')
  const { ctx, w } = art
  text(ctx, "SUDS 'N' DUDS", w / 2, 30, w - 80, 40, SANS, '#2a6f9e')
  text(
    ctx,
    'COIN LAUNDRY · OPEN 24 HRS',
    w / 2,
    60,
    w - 120,
    16,
    SANS,
    '#7a2a2a'
  )
  // A rock through the panel: the light box dark behind it.
  ctx.fillStyle = '#16181a'
  ctx.beginPath()
  ctx.moveTo(w * 0.78, 8)
  ctx.lineTo(w * 0.84, 20)
  ctx.lineTo(w * 0.81, 44)
  ctx.lineTo(w * 0.86, 70)
  ctx.lineTo(w * 0.74, 64)
  ctx.lineTo(w * 0.76, 30)
  ctx.closePath()
  ctx.fill()
  weather(art, 0x5bd5, 1.4)
  return art
}

function goldenWok(): CanvasArt {
  const art = canvas(FASCIA, '#8e1d17')
  const { ctx, w, h } = art
  ctx.strokeStyle = '#d6a93a'
  ctx.lineWidth = 3
  ctx.strokeRect(6, 6, w - 12, h - 12)
  text(ctx, 'GOLDEN WOK', w / 2, 30, w - 100, 40, SERIF, '#e8c15a')
  text(ctx, 'TAKE OUT · DELIVERY', w / 2, 58, w - 160, 15, SANS, '#f0dcb0')
  weather(art, 0x60c, 1.6)
  return art
}

function curlUp(): CanvasArt {
  const art = canvas(FASCIA, '#efe2e6')
  const { ctx, w, h } = art
  text(
    ctx,
    'Curl Up & Dye',
    w / 2,
    h / 2 - 6,
    w - 70,
    44,
    'italic bold $px Georgia, serif',
    '#c2477a'
  )
  text(
    ctx,
    'HAIR · NAILS · TANNING',
    w / 2,
    h - 12,
    w - 160,
    13,
    SANS,
    '#5a3a48'
  )
  // The D's gone, and the sun has had the rest.
  ghost(art, w * 0.81, h / 2 - 6, 40)
  weather(art, 0xc0d1, 1.2)
  return art
}

function rewind(): CanvasArt {
  const art = canvas([192, 60], '#e9d33c')
  const { ctx, w } = art
  text(ctx, 'BE KIND', w / 2, 20, w - 20, 22, SANS, '#1b1b1b')
  text(ctx, 'PLEASE REWIND', w / 2, 44, w - 20, 16, SANS, '#1b1b1b')
  weather(art, 0x2e3, 0.8)
  return art
}

// Over the curtain: the adult section's sign, hand-lettered on red.
function adultsOnly(): CanvasArt {
  const art = canvas([192, 64], '#7a0f12')
  const { ctx, w } = art
  ctx.strokeStyle = '#f2d24a'
  ctx.lineWidth = 2
  ctx.strokeRect(4, 4, w - 8, 56)
  text(ctx, 'ADULTS ONLY', w / 2, 24, w - 24, 22, SANS, '#f2d24a')
  text(ctx, 'MUST BE 18 · NO MINORS', w / 2, 47, w - 30, 11, SANS, '#f4e8d0')
  weather(art, 0xadd1, 1.1)
  return art
}

// A low-poly pin-up: flat polygons in a poster's few inks, the way a
// 1996 shooter painted its wall art, every pose in a bikini. Points are
// in the unit square of the figure's own box, `box` placing it on the
// canvas.
type Poly = readonly (readonly [number, number])[]

function polygon(
  ctx: CanvasRenderingContext2D,
  poly: Poly,
  [x0, y0, w, h]: readonly [number, number, number, number],
  color: string
): void {
  ctx.fillStyle = color
  ctx.beginPath()
  poly.forEach(([u, v], i) => {
    const x = x0 + u * w
    const y = y0 + v * h
    if (i === 0) ctx.moveTo(x, y)
    else ctx.lineTo(x, y)
  })
  ctx.closePath()
  ctx.fill()
}

interface PinupInks {
  ground: string
  burst: string
  skin: string
  shade: string
  hair: string
  suit: string
  title: string
}

// Standing, one hand behind her head, hip out.
const STANDING: Record<string, Poly> = {
  hair: [
    [0.38, 0.02],
    [0.62, 0.02],
    [0.7, 0.16],
    [0.66, 0.3],
    [0.34, 0.28],
    [0.31, 0.12],
  ],
  head: [
    [0.42, 0.06],
    [0.58, 0.06],
    [0.6, 0.17],
    [0.5, 0.22],
    [0.4, 0.17],
  ],
  armUp: [
    [0.58, 0.24],
    [0.74, 0.08],
    [0.62, 0.02],
    [0.56, 0.1],
    [0.62, 0.12],
    [0.55, 0.24],
  ],
  body: [
    [0.42, 0.22],
    [0.58, 0.22],
    [0.62, 0.32],
    [0.58, 0.46],
    [0.66, 0.56],
    [0.36, 0.56],
    [0.42, 0.44],
    [0.38, 0.32],
  ],
  armDown: [
    [0.4, 0.25],
    [0.33, 0.4],
    [0.36, 0.52],
    [0.39, 0.51],
    [0.37, 0.4],
    [0.43, 0.29],
  ],
  legs: [
    [0.36, 0.56],
    [0.66, 0.56],
    [0.6, 0.78],
    [0.6, 0.97],
    [0.54, 0.97],
    [0.51, 0.72],
    [0.47, 0.78],
    [0.36, 0.97],
    [0.3, 0.95],
    [0.4, 0.74],
  ],
  top: [
    [0.4, 0.3],
    [0.6, 0.3],
    [0.6, 0.37],
    [0.4, 0.37],
  ],
  bottom: [
    [0.37, 0.53],
    [0.65, 0.53],
    [0.58, 0.61],
    [0.5, 0.63],
    [0.43, 0.61],
  ],
}

// Lying along the poster on one elbow, knees up: the centerfold.
const RECLINING: Record<string, Poly> = {
  hair: [
    [0.04, 0.3],
    [0.16, 0.24],
    [0.24, 0.34],
    [0.2, 0.62],
    [0.08, 0.6],
  ],
  head: [
    [0.1, 0.32],
    [0.19, 0.32],
    [0.2, 0.48],
    [0.12, 0.5],
  ],
  armDown: [
    [0.12, 0.5],
    [0.2, 0.5],
    [0.24, 0.86],
    [0.17, 0.88],
  ],
  body: [
    [0.18, 0.46],
    [0.5, 0.52],
    [0.58, 0.66],
    [0.5, 0.82],
    [0.2, 0.74],
  ],
  legs: [
    [0.5, 0.56],
    [0.68, 0.3],
    [0.76, 0.32],
    [0.92, 0.7],
    [0.96, 0.8],
    [0.86, 0.8],
    [0.72, 0.5],
    [0.62, 0.8],
    [0.5, 0.82],
  ],
  top: [
    [0.24, 0.5],
    [0.36, 0.52],
    [0.36, 0.62],
    [0.24, 0.6],
  ],
  bottom: [
    [0.46, 0.55],
    [0.58, 0.62],
    [0.56, 0.76],
    [0.46, 0.78],
  ],
}

function pinup(
  size: [number, number],
  figure: Record<string, Poly>,
  box: readonly [number, number, number, number],
  inks: PinupInks,
  title: string,
  seed: number
): CanvasArt {
  const art = canvas(size, inks.ground)
  const { ctx, w, h } = art
  // A starburst behind her.
  ctx.fillStyle = inks.burst
  const cx = box[0] + box[2] / 2
  const cy = box[1] + box[3] * 0.45
  for (let i = 0; i < 12; i += 2) {
    const a0 = (i / 12) * Math.PI * 2
    const a1 = ((i + 1) / 12) * Math.PI * 2
    ctx.beginPath()
    ctx.moveTo(cx, cy)
    ctx.lineTo(cx + Math.cos(a0) * w, cy + Math.sin(a0) * w)
    ctx.lineTo(cx + Math.cos(a1) * w, cy + Math.sin(a1) * w)
    ctx.closePath()
    ctx.fill()
  }
  const order: [string, string][] = [
    ['hair', inks.hair],
    ['armUp', inks.shade],
    ['legs', inks.skin],
    ['body', inks.skin],
    ['armDown', inks.shade],
    ['head', inks.skin],
    ['top', inks.suit],
    ['bottom', inks.suit],
  ]
  for (const [part, color] of order) {
    const poly = figure[part]
    if (poly) polygon(ctx, poly, box, color)
  }
  text(ctx, title, w / 2, h - 12, w - 16, 16, SANS, inks.title)
  weather(art, seed, 0.9)
  return art
}

const pinupA = () =>
  pinup(
    [96, 140],
    STANDING,
    [8, 8, 80, 108],
    {
      ground: '#1b1030',
      burst: '#2c1a4a',
      skin: '#e8b48e',
      shade: '#c8906c',
      hair: '#f0d070',
      suit: '#e8203c',
      title: '#f0d070',
    },
    'HOT SUMMER',
    0xa1
  )

const pinupB = () =>
  pinup(
    [96, 144],
    STANDING,
    [10, 10, 76, 108],
    {
      ground: '#0e2a2a',
      burst: '#174040',
      skin: '#c88a64',
      shade: '#a86c4c',
      hair: '#1a1210',
      suit: '#f2f2e0',
      title: '#ff6a9a',
    },
    'BABES 1996',
    0xb2
  )

const pinupC = () =>
  pinup(
    [192, 112],
    RECLINING,
    [16, 4, 160, 92],
    {
      ground: '#2a0a10',
      burst: '#40121c',
      skin: '#eac0a0',
      shade: '#c89878',
      hair: '#a03a1a',
      suit: '#101010',
      title: '#ffcc33',
    },
    'LOVE MACHINE',
    0xc3
  )

// The plate on the back room's door.
function employees(): CanvasArt {
  const art = canvas([128, 64], '#c9c4b4')
  const { ctx, w } = art
  text(ctx, 'EMPLOYEES', w / 2, 22, w - 16, 20, SANS, '#7a1d18')
  text(ctx, 'ONLY', w / 2, 46, w - 40, 18, SANS, '#7a1d18')
  weather(art, 0xe3, 0.8)
  return art
}

function menu(): CanvasArt {
  const art = canvas([320, 96], '#141414')
  const { ctx, w } = art
  text(ctx, 'LUNCH SPECIAL', w / 2, 14, w - 40, 14, SANS, '#e05a3a')
  const lines = [
    ['GENERAL TSO', '5.95'],
    ['SESAME CHICKEN', '5.95'],
    ['LO MEIN', '4.50'],
    ['EGG ROLL', '1.25'],
  ]
  ctx.font = 'bold 11px "Helvetica Neue", Arial, sans-serif'
  ctx.textBaseline = 'middle'
  lines.forEach(([dish, price], i) => {
    const y = 34 + i * 16
    ctx.fillStyle = '#e8e2c8'
    ctx.textAlign = 'left'
    ctx.fillText(dish, 16, y)
    ctx.textAlign = 'right'
    ctx.fillText(price, w - 16, y)
  })
  // Half its tubes are out.
  ctx.fillStyle = 'rgba(0, 0, 0, 0.55)'
  ctx.fillRect(w * 0.55, 0, w * 0.45, 96)
  return art
}

function forLease(): CanvasArt {
  const art = canvas([120, 80], '#e8e4d6')
  const { ctx, w } = art
  ctx.fillStyle = '#b52a22'
  ctx.fillRect(0, 0, w, 30)
  text(ctx, 'FOR LEASE', w / 2, 16, w - 12, 20, SANS, '#f4f1ea')
  text(ctx, 'RETAIL · 1,200 SQ FT', w / 2, 46, w - 14, 10, SANS, '#2a2a2a')
  text(ctx, 'INQUIRE WITHIN', w / 2, 64, w - 20, 10, SANS, '#2a2a2a')
  weather(art, 0x1ea5e, 1.5)
  return art
}

// Spray paint: rough strokes in one color, flecked at the edges.
function spray(
  ctx: CanvasRenderingContext2D,
  rng: () => number,
  color: string,
  draw: () => void,
  width: number
): void {
  ctx.strokeStyle = color
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'
  ctx.lineWidth = width
  draw()
  ctx.fillStyle = color
  for (let i = 0; i < 40; i++) {
    ctx.globalAlpha = range(rng, 0.2, 0.6)
    ctx.fillRect(
      range(rng, 0, ctx.canvas.width),
      range(rng, 0, ctx.canvas.height),
      1,
      1
    )
  }
  ctx.globalAlpha = 1
}

// An eye over the mattress, and a line under it.
function graffitiEye(): CanvasArt {
  const art = canvas([192, 128])
  const { ctx, w } = art
  const rng = mulberry32(0xe7e)
  spray(
    ctx,
    rng,
    '#c9201c',
    () => {
      ctx.beginPath()
      ctx.moveTo(30, 52)
      ctx.quadraticCurveTo(w / 2, 6, w - 30, 52)
      ctx.quadraticCurveTo(w / 2, 98, 30, 52)
      ctx.stroke()
      ctx.beginPath()
      ctx.arc(w / 2, 52, 16, 0, Math.PI * 2)
      ctx.stroke()
    },
    5
  )
  ctx.fillStyle = '#c9201c'
  ctx.beginPath()
  ctx.arc(w / 2, 52, 7, 0, Math.PI * 2)
  ctx.fill()
  text(ctx, 'THEY CROSS AT NIGHT', w / 2, 110, w - 20, 16, SANS, '#e7e2d2')
  return art
}

// A tag on the alley wall, in two colors over each other.
function graffitiTag(): CanvasArt {
  const art = canvas([256, 96])
  const { ctx, w, h } = art
  const rng = mulberry32(0x7a6)
  const scrawl = (dx: number, dy: number) => () => {
    ctx.beginPath()
    ctx.moveTo(20 + dx, 70 + dy)
    for (let i = 1; i <= 9; i++) {
      ctx.lineTo(20 + dx + i * 24, 20 + dy + ((i * 37) % 50))
    }
    ctx.stroke()
  }
  spray(ctx, rng, '#2d7fd0', scrawl(3, 3), 9)
  spray(ctx, rng, '#e8e3cf', scrawl(0, 0), 4)
  text(ctx, 'BVSW', w - 40, h - 14, 60, 14, SANS, '#d9d24a')
  return art
}

// A triangle in chalk inside a circle, on the floor in the candles.
function chalk(): CanvasArt {
  const art = canvas([128, 128])
  const { ctx, w, h } = art
  ctx.strokeStyle = 'rgba(236, 232, 220, 0.85)'
  ctx.lineWidth = 2
  ctx.beginPath()
  ctx.arc(w / 2, h / 2, 54, 0, Math.PI * 2)
  ctx.stroke()
  ctx.beginPath()
  for (let i = 0; i <= 3; i++) {
    const a = -Math.PI / 2 + (i * Math.PI * 2) / 3
    const x = w / 2 + Math.cos(a) * 46
    const y = h / 2 + Math.sin(a) * 46
    if (i === 0) ctx.moveTo(x, y)
    else ctx.lineTo(x, y)
  }
  ctx.stroke()
  return art
}

const PAINTERS: Record<MallArtId, () => CanvasArt> = {
  'video-vault': videoVault,
  suds,
  'golden-wok': goldenWok,
  'curl-up': curlUp,
  rewind,
  employees,
  'adults-only': adultsOnly,
  'pinup-a': pinupA,
  'pinup-b': pinupB,
  'pinup-c': pinupC,
  menu,
  'for-lease': forLease,
  'graffiti-eye': graffitiEye,
  'graffiti-tag': graffitiTag,
  chalk,
}

export function paintMallArt(id: MallArtId): CanvasArt {
  return PAINTERS[id]()
}

// Whether a panel's art is cut out of its background (graffiti, chalk),
// so assets.ts draws it see-through.
export function isCutOut(id: MallArtId): boolean {
  return id === 'graffiti-eye' || id === 'graffiti-tag' || id === 'chalk'
}

// The pylon by the road: the plaza's name on the header, and a panel for
// each tenant under it, the one for the empty unit kicked in.
export function paintPylonHeader(): CanvasArt {
  const art = canvas([256, 96], '#2b3a2f')
  const { ctx, w } = art
  ctx.strokeStyle = '#c8b98a'
  ctx.lineWidth = 3
  ctx.strokeRect(5, 5, w - 10, 86)
  text(ctx, 'BULL VALLEY', w / 2, 34, w - 40, 30, SERIF, '#e9dfbf')
  text(ctx, 'PLAZA', w / 2, 68, w - 120, 26, SERIF, '#e9dfbf')
  weather(art, 0x9a2a, 1.3)
  return art
}

export const PYLON_PANELS = [
  'VIDEO VAULT',
  'COIN LAUNDRY',
  'GOLDEN WOK',
  'CURL UP & DYE',
  null,
] as const

export function paintPylonPanel(label: string | null, seed: number): CanvasArt {
  const art = canvas([256, 48], '#e6e2d4')
  const { ctx, w, h } = art
  if (label) {
    text(ctx, label, w / 2, h / 2, w - 30, 26, SANS, '#2b2b2b')
  } else {
    // Kicked in: the panel gone to its frame, the lamps behind it dark.
    ctx.fillStyle = '#121212'
    ctx.beginPath()
    ctx.moveTo(30, 0)
    ctx.lineTo(w - 20, 0)
    ctx.lineTo(w - 50, h)
    ctx.lineTo(60, h)
    ctx.closePath()
    ctx.fill()
  }
  weather(art, seed, 1.4)
  return art
}
