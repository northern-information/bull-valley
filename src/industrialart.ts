// Canvas art for the industrial park (industrial.ts): each building's sign
// over its office, the bay numbers, the notices on the doors. Paint
// chalked off by the weather, letters gone, as if the park closed the
// winter the plaza did. Drawn small and flat so it survives the PS1
// downscale; industrialmodel.ts maps it. The graffiti is the plaza's own
// (mallart.ts).

import { canvas, SANS, SERIF, text } from './canvas.ts'
import { paintMallArt, spray } from './mallart.ts'
import { mulberry32, range } from './rng.ts'
import type { CanvasArt } from './canvas.ts'
import type { WorksArtId, WorksGraffiti } from './industrial.ts'

// The signs, 512 by 104: a panel bolted over every office.
const SIGN: [number, number] = [512, 104]

// Weather on a panel: rust weeping from the bolts, a grime wash, specks.
function weather(art: CanvasArt, seed: number, amount = 1): void {
  const { ctx, w, h } = art
  const rng = mulberry32(seed)
  const grime = ctx.createLinearGradient(0, 0, 0, h)
  grime.addColorStop(0, 'rgba(20, 16, 10, 0.08)')
  grime.addColorStop(1, `rgba(40, 26, 12, ${0.4 * amount})`)
  ctx.fillStyle = grime
  ctx.fillRect(0, 0, w, h)
  for (const x of [10, w - 14]) {
    for (const y of [10, h - 14]) {
      ctx.fillStyle = '#3a2a1c'
      ctx.fillRect(x, y, 4, 4)
      ctx.fillStyle = 'rgba(110, 52, 20, 0.35)'
      ctx.fillRect(x, y + 4, 3, range(rng, 8, 30) * amount)
    }
  }
  for (let i = 0; i < 80 * amount; i++) {
    ctx.fillStyle = `rgba(15, 12, 8, ${range(rng, 0.1, 0.45)})`
    ctx.fillRect(range(rng, 0, w), range(rng, 0, h), range(rng, 1, 4), 1)
  }
}

// A letter gone: its ghost left darker where its paint kept the sun off.
function gone(art: CanvasArt, x: number, y: number, size: number, bg: string) {
  art.ctx.fillStyle = bg
  art.ctx.fillRect(x - size * 0.32, y - size * 0.5, size * 0.64, size)
  art.ctx.fillStyle = 'rgba(0, 0, 0, 0.18)'
  art.ctx.fillRect(x - size * 0.26, y - size * 0.42, size * 0.52, size * 0.84)
}

// A company sign: its name big, a line under it, a stripe.
function company(
  name: string,
  line: string,
  bg: string,
  ink: string,
  accent: string,
  seed: number,
  font = SANS
): CanvasArt {
  const art = canvas(SIGN, bg)
  const { ctx, w, h } = art
  ctx.fillStyle = accent
  ctx.fillRect(0, h - 16, w, 8)
  text(ctx, name, w / 2, 40, w - 50, 46, font, ink)
  text(ctx, line, w / 2, 76, w - 120, 16, SANS, accent)
  weather(art, seed)
  return art
}

const PAINTERS: Record<
  Exclude<WorksArtId, 'graffiti-eye' | 'graffiti-tag' | WorksGraffiti>,
  () => CanvasArt
> = {
  nippersink: () => {
    const art = company(
      'NIPPERSINK TOOL & DIE',
      'PRECISION STAMPING · SINCE 1961',
      '#d8d2c0',
      '#1e3a5c',
      '#8c2a1e',
      0x1a01
    )
    gone(art, 512 * 0.31, 40, 40, '#d8d2c0')
    return art
  },
  hollis: () =>
    company(
      'HOLLIS COLD STORAGE',
      'FROZEN · CHILLED · BONDED',
      '#2f5f86',
      '#eef2f4',
      '#a8c8dc',
      0x1a02
    ),
  'valley-freight': () =>
    company(
      'VALLEY FREIGHT LINES',
      'TERMINAL 4 · DRIVERS CHECK IN AT OFFICE',
      '#7a1e1a',
      '#f0e6d0',
      '#e0b040',
      0x1a03
    ),
  'coral-canning': () =>
    company(
      'CORAL CANNING CO.',
      'SWEET CORN · BEETS · SAUERKRAUT',
      '#e3d7a8',
      '#2a5a2a',
      '#b8432a',
      0x1a04,
      SERIF
    ),
  'box-carton': () =>
    company(
      'BULL VALLEY BOX & CARTON',
      'CORRUGATED · DIE CUT · SAME DAY',
      '#a2763e',
      '#1c140c',
      '#3a2a18',
      0x1a05
    ),
  'prairie-litho': () =>
    company(
      'PRAIRIE LITHO',
      'OFFSET · LETTERPRESS · BINDERY',
      '#1d1d22',
      '#e6e0d2',
      '#c23a4a',
      0x1a06,
      SERIF
    ),
  'for-lease': () => {
    const art = canvas(SIGN, '#e8e4da')
    const { ctx, w } = art
    text(ctx, 'FOR LEASE', w / 2, 42, w - 80, 50, SANS, '#b2221c')
    text(
      ctx,
      '42,000 SQ FT · 4 DOCKS · CALL',
      w / 2,
      80,
      w - 120,
      16,
      SANS,
      '#2a2a2a'
    )
    // The number torn off.
    ctx.fillStyle = '#8a8478'
    ctx.fillRect(w * 0.72, 68, 110, 22)
    weather(art, 0x1a07, 1.5)
    return art
  },
  'greenwood-motor': () =>
    company(
      'GREENWOOD ELECTRIC MOTOR',
      'REWINDING · REPAIR · 24 HR SERVICE',
      '#244a2c',
      '#e8dc9a',
      '#d8d0b0',
      0x1a08
    ),
  'feed-seed': () =>
    company(
      'McCULLOM FEED & SEED',
      'WHOLESALE · BULK · BAGGED',
      '#e0c25a',
      '#3a2410',
      '#6a3a1a',
      0x1a09,
      SERIF
    ),
  thornwood: () =>
    company(
      'THORNWOOD SUPPLY',
      'INDUSTRIAL · JANITORIAL · SAFETY',
      '#3c4452',
      '#f2a33a',
      '#d6d6d6',
      0x1a0a
    ),
  'shadow-brook': () => {
    const art = company(
      'SHADOW BROOK DAIRY',
      'BOTTLED FRESH IN McHENRY COUNTY',
      '#f2f0e8',
      '#2a4a8a',
      '#2a4a8a',
      0x1a0b,
      SERIF
    )
    gone(art, 512 * 0.62, 40, 40, '#f2f0e8')
    return art
  },
  scorched: () => {
    // Burned black: the letters only where the soot came off.
    const art = canvas(SIGN, '#1a1714')
    const { ctx, w } = art
    text(
      ctx,
      'R   VER   ID   PL   STI  S',
      w / 2,
      44,
      w - 60,
      40,
      SANS,
      'rgba(120, 110, 96, 0.5)'
    )
    weather(art, 0x1a0c, 2)
    return art
  },
  'no-trespassing': () => {
    const art = canvas([192, 128], '#f0ece0')
    const { ctx, w } = art
    ctx.fillStyle = '#b2221c'
    ctx.fillRect(0, 0, w, 40)
    text(ctx, 'NO', w / 2, 22, w - 20, 30, SANS, '#f0ece0')
    text(ctx, 'TRESPASSING', w / 2, 66, w - 16, 24, SANS, '#1a1a1a')
    text(
      ctx,
      'VIOLATORS WILL BE PROSECUTED',
      w / 2,
      100,
      w - 16,
      10,
      SANS,
      '#1a1a1a'
    )
    weather(art, 0x1a0d, 0.8)
    return art
  },
  'bay-1': () => bayNumber(1),
  'bay-2': () => bayNumber(2),
  'bay-3': () => bayNumber(3),
  'bay-4': () => bayNumber(4),
  'bay-5': () => bayNumber(5),
  'park-sign': () => {
    // The park's own, on its monument out front: the developer's green,
    // its name in cream, the number in a roundel of its own.
    const art = canvas([512, 168], '#24402e')
    const { ctx, w, h } = art
    ctx.strokeStyle = '#d8cca0'
    ctx.lineWidth = 4
    ctx.strokeRect(8, 8, w - 16, h - 16)
    text(ctx, 'BULL VALLEY', w / 2 - 40, 54, w - 180, 34, SERIF, '#e9dfbf')
    text(ctx, 'INDUSTRIAL PARK', w / 2 - 40, 112, w - 170, 40, SANS, '#e9dfbf')
    ctx.fillStyle = '#d8b02a'
    ctx.beginPath()
    ctx.arc(w - 72, h / 2, 46, 0, Math.PI * 2)
    ctx.fill()
    text(ctx, '#4', w - 72, h / 2 + 2, 70, 48, SANS, '#1a1a1a')
    weather(art, 0x1a0e, 1.2)
    return art
  },
}

// A bay's number, stencilled big on a yellow board.
function bayNumber(n: number): CanvasArt {
  const art = canvas([96, 80], '#d8b02a')
  const { ctx, w, h } = art
  ctx.strokeStyle = '#1a1a1a'
  ctx.lineWidth = 4
  ctx.strokeRect(4, 4, w - 8, h - 8)
  text(ctx, String(n), w / 2, h / 2 + 2, w - 30, 56, SANS, '#1a1a1a')
  weather(art, 0x1b00 + n, 0.6)
  return art
}

// --- The fence -----------------------------------------------------------

// One tile of rusted chain-link, see-through between its wires: the
// diamonds woven corner to corner, the zinc long gone to rust in streaks.
// industrialmodel.ts repeats it down every run.
export function paintChainLink(): CanvasArt {
  const art = canvas([64, 64])
  const { ctx, w, h } = art
  const rng = mulberry32(0xc4a1)
  ctx.lineWidth = 3
  ctx.lineCap = 'square'
  for (let k = -w; k <= w; k += 16) {
    for (const dir of [1, -1]) {
      ctx.strokeStyle =
        rng() < 0.3 ? '#9a6a44' : rng() < 0.5 ? '#6e4426' : '#7e7a72'
      ctx.beginPath()
      if (dir > 0) {
        ctx.moveTo(k, 0)
        ctx.lineTo(k + h, h)
      } else {
        ctx.moveTo(k + h, 0)
        ctx.lineTo(k, h)
      }
      ctx.stroke()
    }
  }
  return art
}

// --- Graffiti ------------------------------------------------------------

// Paint run down from a stroke: a few drips, each from a point along it.
function drips(
  ctx: CanvasRenderingContext2D,
  rng: () => number,
  color: string,
  points: readonly [number, number][]
): void {
  ctx.fillStyle = color
  for (const [x, y] of points) {
    const long = range(rng, 8, 30)
    ctx.fillRect(x - 1, y, 2, long)
    ctx.beginPath()
    ctx.arc(x, y + long, 2, 0, Math.PI * 2)
    ctx.fill()
  }
}

// A throw-up: three fat bubble letters, filled and outlined, a crew's
// letters no one in the valley can read.
function throwup(): CanvasArt {
  const art = canvas([256, 128])
  const { ctx, w, h } = art
  const rng = mulberry32(0x7b0)
  ctx.font = SANS.replace('$', '88')
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.lineJoin = 'round'
  ctx.lineWidth = 14
  ctx.strokeStyle = '#141414'
  ctx.strokeText('VKR', w / 2, h / 2)
  ctx.fillStyle = '#e0e0d4'
  ctx.fillText('VKR', w / 2, h / 2)
  ctx.lineWidth = 4
  ctx.strokeStyle = '#7a2fb0'
  ctx.strokeText('VKR', w / 2, h / 2)
  drips(ctx, rng, '#7a2fb0', [
    [70, 92],
    [128, 96],
    [176, 90],
  ])
  spray(ctx, rng, '#e0e0d4', () => undefined, 1)
  return art
}

// A shadowman, black and tall with long arms, sprayed by someone who saw
// one cross: the paint run off his hands.
function shadowman(): CanvasArt {
  const art = canvas([128, 192])
  const { ctx, w } = art
  const rng = mulberry32(0x5dad)
  ctx.fillStyle = '#0b0b0b'
  ctx.beginPath()
  ctx.ellipse(w / 2, 34, 14, 18, 0, 0, Math.PI * 2)
  ctx.fill()
  spray(
    ctx,
    rng,
    '#0b0b0b',
    () => {
      ctx.beginPath()
      ctx.moveTo(w / 2, 50)
      ctx.lineTo(w / 2, 120)
      ctx.moveTo(w / 2, 120)
      ctx.lineTo(w / 2 - 14, 176)
      ctx.moveTo(w / 2, 120)
      ctx.lineTo(w / 2 + 14, 176)
      ctx.moveTo(w / 2, 62)
      ctx.lineTo(w / 2 - 34, 132)
      ctx.moveTo(w / 2, 62)
      ctx.lineTo(w / 2 + 34, 132)
      ctx.stroke()
    },
    12
  )
  drips(ctx, rng, '#0b0b0b', [
    [w / 2 - 34, 132],
    [w / 2 + 34, 132],
  ])
  return art
}

// A crown in yellow, three points and a band, run at the bottom.
function crown(): CanvasArt {
  const art = canvas([192, 128])
  const { ctx } = art
  const rng = mulberry32(0xc20)
  spray(
    ctx,
    rng,
    '#e3c22a',
    () => {
      ctx.beginPath()
      ctx.moveTo(40, 90)
      ctx.lineTo(48, 30)
      ctx.lineTo(74, 66)
      ctx.lineTo(96, 20)
      ctx.lineTo(118, 66)
      ctx.lineTo(144, 30)
      ctx.lineTo(152, 90)
      ctx.closePath()
      ctx.stroke()
    },
    7
  )
  drips(ctx, rng, '#e3c22a', [
    [56, 92],
    [96, 92],
    [140, 92],
  ])
  return art
}

// An arrow in red round a circle crossed through: a mark for whoever
// comes after, pointing back the way out.
function arrow(): CanvasArt {
  const art = canvas([224, 112])
  const { ctx, h } = art
  const rng = mulberry32(0xa22)
  spray(
    ctx,
    rng,
    '#c4281f',
    () => {
      ctx.beginPath()
      ctx.arc(52, h / 2, 30, 0, Math.PI * 2)
      ctx.moveTo(30, h / 2 + 22)
      ctx.lineTo(74, h / 2 - 22)
      ctx.moveTo(100, h / 2)
      ctx.lineTo(200, h / 2)
      ctx.moveTo(176, h / 2 - 20)
      ctx.lineTo(200, h / 2)
      ctx.lineTo(176, h / 2 + 20)
      ctx.stroke()
    },
    8
  )
  drips(ctx, rng, '#c4281f', [
    [130, h / 2 + 4],
    [52, h / 2 + 30],
  ])
  return art
}

const GRAFFITI_PAINTERS: Record<WorksGraffiti, () => CanvasArt> = {
  'graffiti-throwup': throwup,
  'graffiti-shadowman': shadowman,
  'graffiti-crown': crown,
  'graffiti-arrow': arrow,
}

// Whether a piece is one of the park's own graffiti.
function isParkGraffiti(id: WorksArtId): id is WorksGraffiti {
  return id in GRAFFITI_PAINTERS
}

export function paintWorksArt(id: WorksArtId): CanvasArt {
  if (id === 'graffiti-eye' || id === 'graffiti-tag') return paintMallArt(id)
  if (isParkGraffiti(id)) return GRAFFITI_PAINTERS[id]()
  return PAINTERS[id]()
}

// Whether a panel's art is cut out of its background, drawn see-through:
// every piece of graffiti, the plaza's and the park's.
export function isWorksCutOut(id: WorksArtId): boolean {
  return id.startsWith('graffiti-')
}
