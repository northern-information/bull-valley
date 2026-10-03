// Canvas art for the medicine on the Citgo rack, as it looked circa 2008:
// the trade dress of each, drawn small enough to survive the PS1 downscale.
// One painter per medicine returns the canvases assets.ts maps onto its
// packaging, plus flat colors for the plastic, the cap, the carton edges,
// and the glow:
//   label  a wrap label once around a bottle. The front of the bottle is
//          the middle of the canvas; the back is the left and right edges.
//   front  a carton's front (and back).
//   side   a carton's sides.

import { canvas, SANS, text } from './canvas.ts'
import type { CanvasArt, CanvasSize } from './canvas.ts'

// Everything one medicine's painter returns. Which fields are present
// depends on the form: bottles have label, plastic and cap; cartons have
// front, side and edge.
export interface MedicineArt {
  label?: CanvasArt
  front?: CanvasArt
  side?: CanvasArt
  plastic?: string
  cap?: string
  edge?: string
  glow: string
}

export type MedicinePainter = () => MedicineArt

// Once around a 24-count pill bottle, about three times as wide as tall.
const PILL_LABEL: CanvasSize = [192, 64]
// Once around a half-ounce dropper bottle.
const DROPPER_LABEL: CanvasSize = [160, 64]
// A carton's 70 x 100 mm front, and its 25 x 100 mm side.
const CARTON_FRONT: CanvasSize = [84, 120]
const CARTON_SIDE: CanvasSize = [30, 120]

// A band across the full width of a wrap, so it meets itself at the back.
function band(
  ctx: CanvasRenderingContext2D,
  y: number,
  h: number,
  w: number,
  color: string
): void {
  ctx.fillStyle = color
  ctx.fillRect(0, y, w, h)
}

// --- Aspirin: the yellow label, the cross in a ring ------------------------

function aspirin(): MedicineArt {
  const yellow = '#f5c518'
  const label = canvas(PILL_LABEL, yellow)
  {
    const { ctx, w, h } = label
    band(ctx, 0, 4, w, '#2b2b2b')
    band(ctx, h - 8, 8, w, '#2e7d32')
    // The emblem: a white disc with a black cross, front and center.
    ctx.fillStyle = '#ffffff'
    ctx.beginPath()
    ctx.arc(w / 2, 20, 11, 0, Math.PI * 2)
    ctx.fill()
    ctx.fillStyle = '#1a1a1a'
    ctx.fillRect(w / 2 - 2, 11, 4, 18)
    ctx.fillRect(w / 2 - 9, 18, 18, 4)
    text(ctx, 'ASPIRIN', w / 2, 41, 80, 15, SANS, '#1a1a1a')
    text(ctx, '325 mg  24 TABLETS', w / 2, 52, 80, 7, SANS, '#1a1a1a')
    // The back: a block of small print.
    for (const x of [16, w - 56]) {
      ctx.fillStyle = 'rgba(0, 0, 0, 0.55)'
      for (let i = 0; i < 6; i++) ctx.fillRect(x, 14 + i * 6, 40, 2)
    }
  }
  return {
    label,
    plastic: '#f4f1ea',
    cap: '#ffffff',
    glow: 'rgba(245, 197, 24, 0.4)',
  }
}

// --- Ibuprofen: blue, with the yellow pill ---------------------------------

function ibuprofen(): MedicineArt {
  const blue = '#1a4fa3'
  const label = canvas(PILL_LABEL, blue)
  {
    const { ctx, w, h } = label
    band(ctx, 0, 3, w, '#ffffff')
    band(ctx, h - 3, 3, w, '#ffffff')
    // A yellow pill shape across the front, the name on it.
    ctx.fillStyle = '#f7c948'
    ctx.beginPath()
    ctx.arc(w / 2 - 27, 21, 11, Math.PI / 2, -Math.PI / 2)
    ctx.arc(w / 2 + 27, 21, 11, -Math.PI / 2, Math.PI / 2)
    ctx.closePath()
    ctx.fill()
    text(ctx, 'IBUPROFEN', w / 2, 21, 68, 12, SANS, '#0d2d66')
    text(ctx, '200 mg', w / 2, 41, 60, 9, SANS, '#ffffff')
    text(ctx, 'PAIN RELIEVER  24 TABLETS', w / 2, 53, 90, 6, SANS, '#cfe0ff')
    for (const x of [14, w - 50]) {
      ctx.fillStyle = 'rgba(255, 255, 255, 0.6)'
      for (let i = 0; i < 6; i++) ctx.fillRect(x, 14 + i * 6, 36, 2)
    }
  }
  return {
    label,
    plastic: '#f4f1ea',
    cap: '#1a4fa3',
    glow: 'rgba(60, 120, 220, 0.4)',
  }
}

// --- Benadryl: the pink box --------------------------------------------------

function benadryl(): MedicineArt {
  const pink = '#e2338a'
  const deep = '#b2185f'
  const front = canvas(CARTON_FRONT, pink)
  {
    const { ctx, w, h } = front
    band(ctx, 0, 14, w, '#ffffff')
    text(ctx, 'ALLERGY', w / 2, 7, 70, 8, SANS, deep)
    ctx.save()
    ctx.translate(w / 2, 46)
    ctx.transform(1, 0, -0.18, 1, 0, 0)
    text(ctx, 'Benadryl', 0, 0, 76, 18, SANS, '#ffffff')
    ctx.restore()
    ctx.fillStyle = deep
    ctx.fillRect(0, 62, w, 22)
    text(ctx, 'DIPHENHYDRAMINE', w / 2, 69, 76, 6, SANS, '#ffffff')
    text(ctx, '25 mg', w / 2, 79, 60, 8, SANS, '#ffffff')
    // Two pink pills on the white foot of the box.
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, h - 26, w, 26)
    ctx.fillStyle = pink
    for (const x of [w / 2 - 12, w / 2 + 12]) {
      ctx.beginPath()
      ctx.ellipse(x, h - 15, 9, 5, 0, 0, Math.PI * 2)
      ctx.fill()
    }
    text(ctx, '24 TABLETS', w / 2, h - 5, 60, 6, SANS, deep)
  }
  const side = canvas(CARTON_SIDE, pink)
  {
    const { ctx, w, h } = side
    band(ctx, 0, 14, w, '#ffffff')
    band(ctx, 62, 22, w, deep)
    band(ctx, h - 26, 26, w, '#ffffff')
  }
  return {
    front,
    side,
    edge: pink,
    glow: 'rgba(226, 51, 138, 0.4)',
  }
}

// --- Eye drops: white, blue and red, an eye ----------------------------------

function eyeDrops(): MedicineArt {
  const blue = '#1c5fb8'
  const red = '#d7262c'
  const label = canvas(DROPPER_LABEL, '#ffffff')
  {
    const { ctx, w, h } = label
    band(ctx, 0, 22, w, blue)
    band(ctx, 22, 3, w, red)
    text(ctx, 'EYE DROPS', w / 2, 11, 70, 11, SANS, '#ffffff')
    // The eye: a blue almond, a white iris, a dark pupil.
    ctx.fillStyle = blue
    ctx.beginPath()
    ctx.ellipse(w / 2, 38, 16, 8, 0, 0, Math.PI * 2)
    ctx.fill()
    ctx.fillStyle = '#ffffff'
    ctx.beginPath()
    ctx.arc(w / 2, 38, 5, 0, Math.PI * 2)
    ctx.fill()
    ctx.fillStyle = '#1a1a1a'
    ctx.beginPath()
    ctx.arc(w / 2, 38, 2.5, 0, Math.PI * 2)
    ctx.fill()
    text(ctx, 'REDNESS RELIEF', w / 2, 53, 70, 7, SANS, red)
    text(ctx, '0.5 FL OZ', w / 2, 60, 50, 5, SANS, blue)
    for (const x of [10, w - 42]) {
      ctx.fillStyle = 'rgba(28, 95, 184, 0.6)'
      for (let i = 0; i < 5; i++) ctx.fillRect(x, 30 + i * 6, 32, 2)
    }
    band(ctx, h - 2, 2, w, blue)
  }
  return {
    label,
    plastic: '#f4f6f8',
    cap: red,
    glow: 'rgba(215, 38, 44, 0.35)',
  }
}

const PAINTERS: Partial<Record<string, MedicinePainter>> = {
  aspirin,
  ibuprofen,
  benadryl,
  'eye-drops': eyeDrops,
}

// Fresh canvases on every call, so each package owns its art.
export function paintMedicine(medicineId: string): MedicineArt {
  const painter = PAINTERS[medicineId]
  if (!painter) throw new Error(`No label art for medicine "${medicineId}"`)
  return painter()
}
