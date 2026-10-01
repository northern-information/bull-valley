// Canvas art for the six energy drinks: the iconic trade dress of each,
// drawn small enough to survive the PS1 downscale. One painter per drink
// returns the label canvas assets.js wraps around the container, plus the
// flat colors for the metal (or plastic) and the glow:
//   wrap  the label, once around. The front of the container is the
//         middle of the canvas; the back is the left and right edges.
// Cans: 224×160 (the label is about 1.4 times as wide as it is tall, once
// around). The NOS bottle label: 240×100.

import { canvas, text, SANS, SERIF } from './packart.js'

const CAN = [224, 160]
const BOTTLE = [240, 100]
const SILVER = '#c3c7cd'

// --- Monster: three torn claw marks ------------------------------------------

// One claw mark: a tapered stroke with torn edges, wide at the top. The
// zigzag is fixed (no rng) so every can matches.
function claw(ctx, x, y0, y1, width, fill, outline) {
  const steps = 9
  const left = []
  const right = []
  for (let i = 0; i <= steps; i++) {
    const t = i / steps
    const y = y0 + (y1 - y0) * t
    const half = (width / 2) * (1 - t * 0.85)
    const tear = i % 2 ? 1.6 : -1.2
    const lean = t * t * width * 0.35
    left.push([x - half + tear + lean, y])
    right.push([x + half - tear * 0.6 + lean, y])
  }
  ctx.beginPath()
  ctx.moveTo(...left[0])
  for (const p of left) ctx.lineTo(...p)
  for (const p of right.reverse()) ctx.lineTo(...p)
  ctx.closePath()
  ctx.fillStyle = fill
  ctx.fill()
  if (outline) {
    ctx.strokeStyle = outline
    ctx.lineWidth = 1.5
    ctx.stroke()
  }
}

function claws(ctx, cx, top, fill, outline) {
  claw(ctx, cx - 17, top, top + 58, 13, fill, outline)
  claw(ctx, cx, top - 2, top + 70, 14, fill, outline)
  claw(ctx, cx + 17, top + 2, top + 52, 12, fill, outline)
}

function monster() {
  const green = '#7ac142'
  const wrap = canvas(CAN, '#0d0d0d')
  {
    const { ctx, w, h } = wrap
    text(ctx, '+ TAURINE +', w / 2, 12, 70, 8, SERIF, '#d8d8d8')
    claws(ctx, w / 2, 24, green)
    text(ctx, 'MONSTER', w / 2, 112, 92, 17, SERIF, '#f2f2f2')
    text(ctx, 'E N E R G Y', w / 2, 128, 80, 9, SANS, green)
    text(ctx, '473 ml', w / 2, h - 12, 40, 6, SANS, '#9a9a9a')
    // The back: a smaller claw on each edge.
    claw(ctx, 8, 40, 92, 10, green)
    claw(ctx, w - 8, 40, 92, 10, green)
  }
  return { wrap, metal: SILVER, tab: green, glow: 'rgba(122, 193, 66, 0.4)' }
}

function monsterUltra() {
  const wrap = canvas(CAN, '#f4f5f6')
  {
    const { ctx, w, h } = wrap
    // Faint filigree behind everything.
    ctx.strokeStyle = '#e1e3e6'
    ctx.lineWidth = 1
    for (let i = 0; i < 6; i++) {
      ctx.beginPath()
      ctx.arc(w / 2 + (i - 2.5) * 30, h / 2, 26, 0, Math.PI * 2)
      ctx.stroke()
    }
    text(ctx, '+ ZERO SUGAR +', w / 2, 14, 86, 10, SANS, '#1a1a1a')
    claws(ctx, w / 2, 26, '#b9bcc0', '#111111')
    text(ctx, 'MONSTER', w / 2, 112, 92, 17, SERIF, '#2a2a2a')
    text(ctx, 'E N E R G Y', w / 2, 127, 80, 9, SANS, '#4fb3e8')
    text(ctx, 'ULTRA', w / 2, 141, 60, 11, SANS, '#111111')
  }
  return {
    wrap,
    metal: SILVER,
    tab: '#d9dbde',
    glow: 'rgba(200, 225, 240, 0.4)',
  }
}

// --- Red Bull: blue and silver blocks, two bulls ----------------------------

function bull(ctx, x, y, dir, color) {
  // Side-on, head down, charging toward the sun: body, head, horn, legs.
  ctx.fillStyle = color
  ctx.beginPath()
  ctx.ellipse(x, y, 11, 5, dir * -0.15, 0, Math.PI * 2)
  ctx.fill()
  ctx.beginPath()
  ctx.moveTo(x + dir * 8, y - 4)
  ctx.lineTo(x + dir * 17, y + 1)
  ctx.lineTo(x + dir * 9, y + 5)
  ctx.closePath()
  ctx.fill()
  ctx.fillRect(x + dir * 12 - 1, y - 7, 2, 4)
  for (const lx of [-8, -4, 4]) ctx.fillRect(x + dir * lx, y + 3, 2, 6)
}

function redBull() {
  const blue = '#1c2f8f'
  const red = '#d6133f'
  const wrap = canvas(CAN, SILVER)
  {
    const { ctx, w, h } = wrap
    // Four blocks, front and back: blue top left and bottom right of a
    // slanted split, silver in the other two.
    ctx.fillStyle = blue
    const split = h * 0.56
    for (const cx of [0, w / 2, w]) {
      const at = (y) => cx + 22 - 44 * (y / h)
      ctx.beginPath()
      ctx.moveTo(cx - w / 4, 0)
      ctx.lineTo(at(0), 0)
      ctx.lineTo(at(split), split)
      ctx.lineTo(cx - w / 4, split)
      ctx.closePath()
      ctx.moveTo(at(split), split)
      ctx.lineTo(cx + w / 4, split)
      ctx.lineTo(cx + w / 4, h)
      ctx.lineTo(at(h), h)
      ctx.closePath()
      ctx.fill()
    }
    text(ctx, 'Red Bull', w / 2, 58, 86, 22, SANS, red)
    ctx.fillStyle = '#e8b730'
    ctx.beginPath()
    ctx.arc(w / 2, 80, 7, 0, Math.PI * 2)
    ctx.fill()
    bull(ctx, w / 2 - 20, 82, 1, red)
    bull(ctx, w / 2 + 20, 82, -1, red)
    text(ctx, 'ENERGY DRINK', w / 2, 102, 84, 9, SANS, red)
    text(ctx, '250 ml', w / 2, h - 12, 40, 7, SANS, '#ffffff')
  }
  return { wrap, metal: SILVER, tab: SILVER, glow: 'rgba(214, 19, 63, 0.4)' }
}

// --- Rip It: gunmetal, a red X, the slanted logo ----------------------------

function ripIt() {
  const red = '#c4142a'
  const wrap = canvas(CAN, '#2b2e33')
  {
    const { ctx, w, h } = wrap
    // Silver rays from the middle, then the red X over them.
    ctx.strokeStyle = '#6a6f77'
    ctx.lineWidth = 6
    for (const [dx, dy] of [
      [-60, -80],
      [60, -80],
      [-70, 60],
      [70, 60],
    ]) {
      ctx.beginPath()
      ctx.moveTo(w / 2, 70)
      ctx.lineTo(w / 2 + dx, 70 + dy)
      ctx.stroke()
    }
    ctx.fillStyle = red
    ctx.beginPath()
    ctx.moveTo(w / 2 - 30, 10)
    ctx.lineTo(w / 2, 62)
    ctx.lineTo(w / 2 + 30, 10)
    ctx.lineTo(w / 2 + 12, 10)
    ctx.lineTo(w / 2, 34)
    ctx.lineTo(w / 2 - 12, 10)
    ctx.closePath()
    ctx.moveTo(w / 2 - 14, 148)
    ctx.lineTo(w / 2, 82)
    ctx.lineTo(w / 2 + 14, 148)
    ctx.closePath()
    ctx.fill()
    // The logo: heavy, slanted, white with a red rim.
    ctx.save()
    ctx.translate(w / 2, 50)
    ctx.transform(1, 0, -0.3, 1, 0, 0)
    ctx.font = 'italic 900 22px "Helvetica Neue", Arial, sans-serif'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.lineWidth = 3
    ctx.strokeStyle = red
    ctx.strokeText('rip it', 0, 0)
    ctx.fillStyle = '#ffffff'
    ctx.fillText('rip it', 0, 0)
    ctx.restore()
    text(ctx, 'ENERGY FUEL', w / 2, 70, 70, 8, SANS, '#e6e6e6')
    text(ctx, 'POWER', w / 2, 118, 40, 8, SANS, '#ffffff')
    text(ctx, '16 FL OZ', w / 2, h - 12, 40, 6, SANS, '#9a9a9a')
  }
  return { wrap, metal: SILVER, tab: SILVER, glow: 'rgba(196, 20, 42, 0.4)' }
}

// --- Rockstar: black, a gold star with RR -----------------------------------

function star(ctx, cx, cy, outer, inner) {
  ctx.beginPath()
  for (let i = 0; i < 10; i++) {
    const r = i % 2 ? inner : outer
    const a = -Math.PI / 2 + (i * Math.PI) / 5
    ctx.lineTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r)
  }
  ctx.closePath()
}

function rockstar() {
  const gold = '#d9a92c'
  const red = '#d23a3a'
  const wrap = canvas(CAN, '#0e0e0e')
  {
    const { ctx, w, h } = wrap
    text(ctx, 'GUARANA ★ B-VITAMINS ★ TAURINE', w / 2, 10, 104, 7, SANS, red)
    text(ctx, 'ROCKSTAR', w / 2, 30, 92, 17, SANS, gold)
    text(ctx, 'ENERGY DRINK', w / 2, 46, 80, 9, SANS, red)
    star(ctx, w / 2, 98, 40, 17)
    ctx.fillStyle = gold
    ctx.fill()
    ctx.strokeStyle = '#d8d8d8'
    ctx.lineWidth = 2
    ctx.stroke()
    // RR: the first R mirrored, back to back with the second.
    ctx.font = 'bold 18px Georgia, "Times New Roman", serif'
    ctx.textBaseline = 'middle'
    ctx.textAlign = 'center'
    ctx.fillStyle = '#111111'
    ctx.save()
    ctx.translate(w / 2 - 6, 101)
    ctx.scale(-1, 1)
    ctx.fillText('R', 0, 0)
    ctx.restore()
    ctx.fillText('R', w / 2 + 6, 101)
    // The back: ROCKSTAR running down each edge.
    ctx.save()
    ctx.translate(10, h / 2)
    ctx.rotate(Math.PI / 2)
    text(ctx, 'ROCKSTAR', 0, 0, 130, 14, SANS, gold)
    ctx.restore()
  }
  // The gold lid is part of the trade dress.
  return {
    wrap,
    metal: SILVER,
    lid: gold,
    tab: red,
    glow: 'rgba(217, 169, 44, 0.4)',
  }
}

// --- NOS: the orange label on a blue bottle ---------------------------------

function nos() {
  const orange = '#f25a1d'
  const lime = '#d5e83a'
  const wrap = canvas(BOTTLE, orange)
  {
    const { ctx, w, h } = wrap
    // Silver rails top and bottom, a black strap under the top rail.
    ctx.fillStyle = '#b9bdc4'
    ctx.fillRect(0, 0, w, 6)
    ctx.fillRect(0, h - 6, w, 6)
    ctx.fillStyle = '#111111'
    ctx.fillRect(0, 6, w, 10)
    text(
      ctx,
      'WITH CMPLX6 FOR ENHANCED METABOLISM',
      w / 2,
      11,
      w - 30,
      7,
      SANS,
      lime
    )
    // NOS in heavy white with a black rim, the arrow off the S.
    ctx.font = '900 34px "Helvetica Neue", Arial, sans-serif'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.lineWidth = 4
    ctx.strokeStyle = '#111111'
    ctx.strokeText('NOS', w / 2, 40)
    ctx.fillStyle = '#ffffff'
    ctx.fillText('NOS', w / 2, 40)
    ctx.beginPath()
    ctx.moveTo(w / 2 + 34, 22)
    ctx.lineTo(w / 2 + 50, 28)
    ctx.lineTo(w / 2 + 34, 34)
    ctx.closePath()
    ctx.fill()
    ctx.stroke()
    text(ctx, 'HIGH PERFORMANCE', w / 2, 66, 96, 9, SANS, lime)
    text(ctx, 'ENERGY DRINK', w / 2, 77, 96, 9, SANS, lime)
    ctx.fillStyle = '#1a1a1a'
    ctx.beginPath()
    ctx.roundRect(w / 2 - 34, 84, 68, 8, 4)
    ctx.fill()
    text(ctx, 'CMPLX6', w / 2, 88, 40, 6, SANS, '#ffffff')
  }
  return {
    wrap,
    plastic: '#1747a6',
    cap: '#f26a1b',
    glow: 'rgba(242, 90, 29, 0.4)',
  }
}

const PAINTERS = {
  monster,
  'monster-ultra': monsterUltra,
  'red-bull': redBull,
  'rip-it': ripIt,
  rockstar,
  nos,
}

// Fresh canvases on every call, so each container owns its art.
export function paintDrink(drinkId) {
  const painter = PAINTERS[drinkId]
  if (!painter) throw new Error(`No can art for drink "${drinkId}"`)
  return painter()
}
