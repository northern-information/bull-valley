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
//   torn-tank        a black tank top's cut and its tears: the neck scoop,
//                    the arm holes, rips, and a ragged hem. Torso, 123×150.
//   torn-jeans       a ripped knee and a frayed thigh. Thigh, 51×138; the
//                    knee is at the bottom.
//   sleeve-tattoo    full sleeve tattoos. Arm, 64×64.
// A face (a box add-on's decal) is opaque and covers the box's front face:
//   russ             the belt buckle face: gold letters on a dark plate.

import { canvas, text } from './canvas.ts'
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

function sleeveTattoo(): CanvasArt {
  const art = canvas(ARM)
  const { ctx, w, h } = art
  const rng = mulberry32(0x5ee7e)
  const inks = ['#1e2530', '#1e2530', '#1e2530', '#6e2a2a', '#2c5246']
  // Bold filled shapes: the flash pieces of a sleeve.
  for (let i = 0; i < 30; i++) {
    ctx.fillStyle = inks[Math.floor(rng() * inks.length)]
    rip(ctx, rng, rng() * w, rng() * h, 5 + rng() * 8, 5 + rng() * 8)
  }
  // Linework that ties them into one sleeve.
  ctx.strokeStyle = '#1e2530'
  ctx.lineWidth = 2
  for (let i = 0; i < 24; i++) {
    const x = rng() * w
    const y = rng() * h
    ctx.beginPath()
    ctx.arc(x, y, 3 + rng() * 8, rng() * Math.PI, rng() * Math.PI * 3)
    ctx.stroke()
  }
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

export const DECAL_PAINTERS: Record<DecalId, DecalPainter> = {
  'suicide-silence': suicideSilence,
  russ,
  'torn-tank': tornTank,
  'torn-jeans': tornJeans,
  'sleeve-tattoo': sleeveTattoo,
}
