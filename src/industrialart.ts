// Canvas art for the industrial park (industrial.ts): each building's sign
// over its office, the bay numbers, the notices on the doors. Paint
// chalked off by the weather, letters gone, as if the park closed the
// winter the plaza did. Drawn small and flat so it survives the PS1
// downscale; industrialmodel.ts maps it. The graffiti is the plaza's own
// (mallart.ts).

import { canvas, SANS, SERIF, text } from './canvas.ts'
import { isCutOut, paintMallArt } from './mallart.ts'
import { mulberry32, range } from './rng.ts'
import type { CanvasArt } from './canvas.ts'
import type { WorksArtId } from './industrial.ts'

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
  Exclude<WorksArtId, 'graffiti-eye' | 'graffiti-tag'>,
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

export function paintWorksArt(id: WorksArtId): CanvasArt {
  if (id === 'graffiti-eye' || id === 'graffiti-tag') return paintMallArt(id)
  return PAINTERS[id]()
}

// Whether a panel's art is cut out of its background, drawn see-through.
export function isWorksCutOut(id: WorksArtId): boolean {
  return (id === 'graffiti-eye' || id === 'graffiti-tag') && isCutOut(id)
}
