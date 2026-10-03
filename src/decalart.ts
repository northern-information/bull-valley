// Canvas art for the decals printed on character parts (outfits.ts DecalId),
// drawn small enough to survive the PS1 downscale. Each painter gets the
// outfit's colors, so a tear can show the skin under it.
//
// A print (outfits.ts prints) is a transparent canvas laid over a body part:
// only the painted pixels show, and the part's own color shows through the
// rest. A front print covers the part's full width and height, seen from the
// front; an arm print wraps once round the arm, from the shoulder or elbow
// at the top to the elbow or wrist at the bottom.
//   suicide-silence  the band tee print, on the chest. Torso, 123×150.
//   pantera          the band logo, on the chest. Torso, 123×150.
//   as-i-lay-dying   the band name, on the chest. Torso, 123×150.
//   nin              the band's box logo, on the chest. Torso, 123×150.
//   guitar-strap     a strap from the right shoulder to the left hip.
//                    Torso, 123×150.
//   torn-tank        a black tank top's cut and its tears: the neck scoop,
//                    the arm holes, rips, and a ragged hem. Torso, 123×150.
//   torn-jeans       a ripped knee and a frayed thigh. Thigh, 51×138; the
//                    knee is at the bottom.
//   sleeve-tattoo    a full sleeve in black and grey: a snake, a skull,
//                    crossbones. Arm, 64×64.
//   chest-tattoo     the same work across the chest. Torso, 123×150; lay
//                    it over an open shirt (see paintPrints).
// A pattern (outfits.ts patterns) is opaque and wraps once round every part
// of its cloth, the shirt (torso and long sleeves alike) or the pants:
//   plaid            white and grey flannel checks over the shirt color.
//                    96×48: six checks round, three up.
//   camo             woodland blots over the pants color. 96×48, tiling
//                    round the seam.
// A face (a box add-on's decal) is opaque and covers the box's front face:
//   russ             the belt buckle face: gold letters on a dark plate.

import { canvas, SERIF, text } from './canvas.ts'
import { mulberry32 } from './rng.ts'
import type { CanvasArt, CanvasSize } from './canvas.ts'
import type { DecalId, Outfit } from './outfits.ts'

export type DecalPainter = (colors: Outfit['colors']) => CanvasArt

// The torso front is 0.41 × 0.5 m and the thigh 0.17 × 0.46 m: both at
// 300 pixels a metre.
const TORSO: CanvasSize = [123, 150]
const THIGH: CanvasSize = [51, 138]
const ARM: CanvasSize = [64, 64]
const BUCKLE: CanvasSize = [75, 48]
const PATTERN: CanvasSize = [96, 48]

// Tall, tight capitals: the nearest a browser font gets to a band logo.
const CONDENSED =
  'bold $px Impact, "Arial Narrow", "Helvetica Neue", sans-serif'

function suicideSilence(): CanvasArt {
  const art = canvas(TORSO)
  const { ctx, w } = art
  // Chest height: 0.27 to 0.4 m up the torso, read from the canvas top.
  text(ctx, 'SUICIDE', w / 2, 38, 64, 20, CONDENSED, '#111111')
  text(ctx, 'SILENCE', w / 2, 58, 64, 20, CONDENSED, '#111111')
  return art
}

// A jagged hole: points round (x, y) at radii between rx and ry, jittered.
function rip(
  ctx: CanvasRenderingContext2D,
  rng: () => number,
  x: number,
  y: number,
  rx: number,
  ry: number
): void {
  const points = 9
  ctx.beginPath()
  for (let i = 0; i < points; i++) {
    const a = (i / points) * Math.PI * 2
    const r = 0.55 + rng() * 0.45
    ctx.lineTo(x + Math.cos(a) * rx * r, y + Math.sin(a) * ry * r)
  }
  ctx.closePath()
  ctx.fill()
}

function tornTank(colors: Outfit['colors']): CanvasArt {
  const art = canvas(TORSO)
  const { ctx, w, h } = art
  const rng = mulberry32(0x7a2c)
  ctx.fillStyle = colors.skin
  // The neck scoop and the two arm holes, cut from the top edge.
  ctx.beginPath()
  ctx.ellipse(w / 2, 0, 22, 30, 0, 0, Math.PI * 2)
  ctx.ellipse(0, 0, 30, 42, 0, 0, Math.PI * 2)
  ctx.ellipse(w, 0, 30, 42, 0, 0, Math.PI * 2)
  ctx.fill()
  // Rips across the chest and the belly.
  rip(ctx, rng, 44, 74, 7, 5)
  rip(ctx, rng, 82, 98, 9, 4)
  rip(ctx, rng, 52, 118, 6, 6)
  // A ragged hem: skin in the gaps of a torn bottom edge.
  ctx.beginPath()
  ctx.moveTo(0, h)
  for (let x = 0; x <= w; x += 6) {
    ctx.lineTo(x + 3, h - 3 - rng() * 8)
    ctx.lineTo(x + 6, h)
  }
  ctx.closePath()
  ctx.fill()
  return art
}

// White threads across a rip, the way denim frays.
function threads(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  rows: number
): void {
  ctx.fillStyle = '#e4e2dc'
  for (let i = 0; i < rows; i++) ctx.fillRect(x, y + i * 3, width, 1)
}

function tornJeans(colors: Outfit['colors']): CanvasArt {
  const art = canvas(THIGH)
  const { ctx, w } = art
  const rng = mulberry32(0x1ea5)
  // The ripped knee, just above the bottom of the thigh.
  ctx.fillStyle = colors.skin
  rip(ctx, rng, w / 2, 122, 15, 10)
  threads(ctx, w / 2 - 12, 115, 24, 5)
  // A frayed patch higher up: threads only, no skin.
  threads(ctx, w / 2 - 6, 52, 13, 3)
  return art
}

// Black and grey ink: solid black, two greys for shading, and a pale grey
// for the bone, since a tattoo has no white.
const INK = '#141416'
const SHADE = '#3c3e42'
const WASH = '#5e6166'
const BONE = '#a4a6a8'

// A skull of size s (its cranium radius) at (x, y).
function skull(ctx: CanvasRenderingContext2D, x: number, y: number, s: number) {
  ctx.fillStyle = INK
  ctx.beginPath()
  ctx.arc(x, y, s + 1.5, 0, Math.PI * 2)
  ctx.fill()
  ctx.fillRect(x - s * 0.6 - 1.5, y, s * 1.2 + 3, s * 1.05 + 1.5)
  ctx.fillStyle = BONE
  ctx.beginPath()
  ctx.arc(x, y, s, 0, Math.PI * 2)
  ctx.fill()
  ctx.fillRect(x - s * 0.6, y, s * 1.2, s * 1.05)
  // Eye sockets, the nose, and the gaps between the teeth.
  ctx.fillStyle = INK
  ctx.beginPath()
  ctx.arc(x - s * 0.42, y + s * 0.05, s * 0.3, 0, Math.PI * 2)
  ctx.arc(x + s * 0.42, y + s * 0.05, s * 0.3, 0, Math.PI * 2)
  ctx.fill()
  ctx.beginPath()
  ctx.moveTo(x, y + s * 0.3)
  ctx.lineTo(x - s * 0.15, y + s * 0.6)
  ctx.lineTo(x + s * 0.15, y + s * 0.6)
  ctx.closePath()
  ctx.fill()
  for (let i = -1; i <= 1; i++) {
    ctx.fillRect(x + i * s * 0.3 - 0.5, y + s * 0.75, 1, s * 0.3)
  }
}

// Two crossed bones of length l at (x, y).
function crossbones(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  l: number
) {
  for (const sign of [1, -1]) {
    const dx = (l / 2) * Math.SQRT1_2
    for (const [color, width] of [
      [INK, 5],
      [BONE, 2.5],
    ] as const) {
      ctx.strokeStyle = color
      ctx.lineWidth = width
      ctx.beginPath()
      ctx.moveTo(x - dx, y - dx * sign)
      ctx.lineTo(x + dx, y + dx * sign)
      ctx.stroke()
    }
  }
}

// A snake winding down from (x, top) to (x, bottom): a black outline, a grey
// belly, a scale line, and a head with a forked tongue at the top.
function snake(
  ctx: CanvasRenderingContext2D,
  x: number,
  top: number,
  bottom: number,
  sway: number,
  turns: number
) {
  const path = () => {
    ctx.beginPath()
    for (let i = 0; i <= 24; i++) {
      const t = i / 24
      ctx.lineTo(
        x + Math.sin(t * Math.PI * 2 * turns) * sway,
        top + t * (bottom - top)
      )
    }
  }
  ctx.lineCap = 'round'
  for (const [color, width] of [
    [INK, 7],
    [WASH, 3.5],
    [SHADE, 1],
  ] as const) {
    ctx.strokeStyle = color
    ctx.lineWidth = width
    path()
    ctx.stroke()
  }
  ctx.fillStyle = INK
  ctx.beginPath()
  ctx.ellipse(x, top - 2, 4, 5.5, 0, 0, Math.PI * 2)
  ctx.fill()
  ctx.strokeStyle = INK
  ctx.lineWidth = 1
  ctx.beginPath()
  ctx.moveTo(x, top - 7)
  ctx.lineTo(x, top - 10)
  ctx.lineTo(x - 2, top - 12)
  ctx.moveTo(x, top - 10)
  ctx.lineTo(x + 2, top - 12)
  ctx.stroke()
}

// Grey shading that fills the gaps, the way a full sleeve has no bare skin
// between its pieces.
function smoke(
  ctx: CanvasRenderingContext2D,
  rng: () => number,
  w: number,
  h: number,
  count: number
) {
  for (let i = 0; i < count; i++) {
    ctx.fillStyle = rng() < 0.5 ? SHADE : WASH
    rip(ctx, rng, rng() * w, rng() * h, 5 + rng() * 6, 5 + rng() * 6)
  }
}

// One wrap round the arm: a snake down the outside, a skull, and
// crossbones, over grey shading.
function sleeveTattoo(): CanvasArt {
  const art = canvas(ARM)
  const { ctx, w, h } = art
  smoke(ctx, mulberry32(0x5ee7e), w, h, 26)
  snake(ctx, 14, 9, 62, 6, 1.5)
  skull(ctx, 42, 18, 8)
  crossbones(ctx, 44, 46, 18)
  return art
}

// Chest pieces for a torso layer above an open shirt: a skull at the
// breastbone, snakes over both shoulders, and shading across the chest.
// Laid over a tank top, it shows only through the openings.
function chestTattoo(): CanvasArt {
  const art = canvas(TORSO)
  const { ctx, w } = art
  smoke(ctx, mulberry32(0xc4e57), w, 70, 40)
  skull(ctx, w / 2, 16, 10)
  snake(ctx, 14, 6, 60, 7, 1)
  snake(ctx, w - 14, 6, 60, 7, 1)
  crossbones(ctx, w / 2, 40, 22)
  return art
}

// The band logo across the chest, in pale grey on the black shirt: tall
// capitals with the first and last letters drawn larger.
// A leather guitar strap across the chest, from the right shoulder down to
// the left hip. The canvas left edge is the body's right side.
function guitarStrap(): CanvasArt {
  const art = canvas(TORSO)
  const { ctx, w, h } = art
  for (const [color, width] of [
    ['#22170f', 13],
    ['#4a3222', 10],
  ] as const) {
    ctx.strokeStyle = color
    ctx.lineWidth = width
    ctx.beginPath()
    ctx.moveTo(w * 0.18, -4)
    ctx.lineTo(w * 0.88, h + 4)
    ctx.stroke()
  }
  return art
}

// The band name in pale grey serif capitals across the chest, on two lines.
function asILayDying(): CanvasArt {
  const art = canvas(TORSO)
  const { ctx, w } = art
  const grey = '#d6d6d4'
  text(ctx, 'AS I LAY', w / 2, 40, 62, 15, SERIF, grey)
  text(ctx, 'DYING', w / 2, 56, 62, 18, SERIF, grey)
  return art
}

// The band's box logo on the chest, in pale grey on the black hoodie: NIN
// in a thin frame, each letter in its own third, the last N mirrored.
function nin(): CanvasArt {
  const art = canvas(TORSO)
  const { ctx, w } = art
  const grey = '#d6d6d4'
  const boxW = 78
  const boxH = 36
  const left = (w - boxW) / 2
  const top = 28
  const mid = top + boxH / 2
  ctx.strokeStyle = grey
  ctx.lineWidth = 3
  ctx.strokeRect(left + 1.5, top + 1.5, boxW - 3, boxH - 3)
  const cell = boxW / 3
  text(ctx, 'N', left + cell * 0.5, mid, cell - 4, 32, CONDENSED, grey)
  text(ctx, 'I', left + cell * 1.5, mid, cell - 4, 32, CONDENSED, grey)
  ctx.save()
  ctx.translate(left + cell * 2.5, 0)
  ctx.scale(-1, 1)
  text(ctx, 'N', 0, mid, cell - 4, 32, CONDENSED, grey)
  ctx.restore()
  return art
}

function pantera(): CanvasArt {
  const art = canvas(TORSO)
  const { ctx, w } = art
  const grey = '#d6d6d4'
  // Measure the letters so the big P and A sit tight against ANTER.
  ctx.font = CONDENSED.replace('$', '16')
  const middle = ctx.measureText('ANTER').width
  ctx.font = CONDENSED.replace('$', '22')
  const p = ctx.measureText('P').width
  const a = ctx.measureText('A').width
  const left = w / 2 - (p + middle + a) / 2
  text(ctx, 'P', left + p / 2, 47, p, 22, CONDENSED, grey)
  text(ctx, 'ANTER', left + p + middle / 2, 48, middle, 16, CONDENSED, grey)
  text(ctx, 'A', left + p + middle + a / 2, 47, a, 22, CONDENSED, grey)
  // The underline that runs from the P to the last A.
  ctx.fillStyle = grey
  ctx.fillRect(left, 59, p + middle + a, 2)
  return art
}

function russ(): CanvasArt {
  const gold = '#d9b23a'
  const art = canvas(BUCKLE, gold)
  const { ctx, w, h } = art
  ctx.fillStyle = '#1a1714'
  ctx.fillRect(5, 5, w - 10, h - 10)
  text(ctx, 'RUSS', w / 2, h / 2 + 1, w - 16, 30, CONDENSED, gold)
  return art
}

// Flannel: a grey band across and a grey band down every check, darker
// where they cross, with a thin charcoal line through the middle of each
// band and a white thread between them.
function plaid(colors: Outfit['colors']): CanvasArt {
  const art = canvas(PATTERN, colors.shirt)
  const { ctx, w, h } = art
  const check = 16
  ctx.fillStyle = 'rgba(96, 99, 106, 0.55)'
  for (let x = 0; x < w; x += check) ctx.fillRect(x, 0, 7, h)
  for (let y = 0; y < h; y += check) ctx.fillRect(0, y, w, 7)
  ctx.fillStyle = 'rgba(52, 54, 60, 0.8)'
  for (let x = 0; x < w; x += check) ctx.fillRect(x + 3, 0, 1, h)
  for (let y = 0; y < h; y += check) ctx.fillRect(0, y + 3, w, 1)
  ctx.fillStyle = 'rgba(255, 255, 255, 0.5)'
  for (let x = 0; x < w; x += check) ctx.fillRect(x + 11, 0, 1, h)
  return art
}

// Woodland camouflage: dark green, brown and black blots over the pants
// color. Each blot is drawn again a canvas-width to either side, so the
// pattern meets itself at the seam where the wrap closes.
function camo(colors: Outfit['colors']): CanvasArt {
  const art = canvas(PATTERN, colors.pants)
  const { ctx, w, h } = art
  const rng = mulberry32(0xca30)
  const inks = ['#3a4a2c', '#5c4a30', '#1c2018']
  for (const ink of inks) {
    ctx.fillStyle = ink
    for (let i = 0; i < 9; i++) {
      const x = rng() * w
      const y = rng() * h
      const rx = 7 + rng() * 9
      const ry = 4 + rng() * 6
      for (const dx of [-w, 0, w]) rip(ctx, rng, x + dx, y, rx, ry)
    }
  }
  return art
}

export const DECAL_PAINTERS: Record<DecalId, DecalPainter> = {
  'suicide-silence': suicideSilence,
  russ,
  'torn-tank': tornTank,
  'torn-jeans': tornJeans,
  'sleeve-tattoo': sleeveTattoo,
  'chest-tattoo': chestTattoo,
  pantera,
  'guitar-strap': guitarStrap,
  'as-i-lay-dying': asILayDying,
  plaid,
  nin,
  camo,
}

// Tattoos ink only onto skin a layer below already painted.
const SKIN_INK: ReadonlySet<DecalId> = new Set(['chest-tattoo'])

// Paint a stack of prints for one part onto one canvas, in order. A tattoo
// over a torn tank top shows in the openings and never on the shirt.
export function paintPrints(
  ids: readonly DecalId[],
  colors: Outfit['colors']
): CanvasArt {
  const [first, ...rest] = ids
  const art = DECAL_PAINTERS[first](colors)
  for (const id of rest) {
    art.ctx.globalCompositeOperation = SKIN_INK.has(id)
      ? 'source-atop'
      : 'source-over'
    art.ctx.drawImage(DECAL_PAINTERS[id](colors).c, 0, 0)
  }
  art.ctx.globalCompositeOperation = 'source-over'
  return art
}
