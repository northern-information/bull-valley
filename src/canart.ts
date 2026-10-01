// Canvas art for the drinks, as they looked circa 2008: the iconic trade
// dress of each, drawn small enough to survive the PS1 downscale. One
// painter per drink returns the label canvases assets.js maps onto the
// container, plus flat colors for the metal, glass, liquid, cap and glow:
//   wrap   a label once around. The front of the container is the middle
//          of the canvas; the back is the left and right edges. Cans are
//          224×160 (about 1.4 times as wide as tall, once around); the NOS
//          label is 240×100 and the Ice Mountain label 240×80.
//   label  a front label on a bottle: half way around a round bottle, or
//          flat on a square one.
//   neck   a band around a bottle neck.

import { canvas, SANS, SERIF, text } from './packart.js'
import { mulberry32 } from './rng.js'

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

// --- Four Loko: camo, a giant FOUR up the can, script Loko ------------------

// Camo blobs in three colors over a base, seeded so every can matches.
function camo(ctx, w, h, base, colors, seed) {
  ctx.fillStyle = base
  ctx.fillRect(0, 0, w, h)
  const rng = mulberry32(seed)
  for (let i = 0; i < 70; i++) {
    ctx.fillStyle = colors[i % colors.length]
    const x = rng() * w
    const y = rng() * h
    ctx.beginPath()
    for (let k = 0; k < 7; k++) {
      const a = (k / 7) * Math.PI * 2
      const r = 6 + rng() * 12
      ctx.lineTo(x + Math.cos(a) * r * 1.4, y + Math.sin(a) * r)
    }
    ctx.closePath()
    ctx.fill()
  }
}

function fourLoko(flavor, base, colors, seed, glow) {
  return () => {
    const wrap = canvas(CAN)
    const { ctx, w, h } = wrap
    camo(ctx, w, h, base, colors, seed)
    text(ctx, '• CONTAINS ALCOHOL •', w / 2, 8, 100, 8, SANS, '#ffffff')
    // FOUR runs up the can, bottom to top, white with a dark rim.
    ctx.save()
    ctx.translate(w / 2 - 4, h / 2 + 6)
    ctx.rotate(-Math.PI / 2)
    ctx.font = '900 46px "Helvetica Neue", Arial, sans-serif'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.lineWidth = 4
    ctx.strokeStyle = '#2a2a2a'
    ctx.strokeText('FOUR', 0, 0)
    ctx.fillStyle = '#f4f4f4'
    ctx.fillText('FOUR', 0, 0)
    ctx.restore()
    // Loko, in a black brush script, down the right of FOUR.
    ctx.save()
    ctx.translate(w / 2 + 26, 46)
    ctx.rotate(-Math.PI / 2 + 0.15)
    ctx.font = 'italic bold 20px "Brush Script MT", "Snell Roundhand", cursive'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.lineWidth = 3
    ctx.strokeStyle = '#ffffff'
    ctx.strokeText('Loko', 0, 0)
    ctx.fillStyle = '#111111'
    ctx.fillText('Loko', 0, 0)
    ctx.restore()
    // The flavor, up the left side.
    ctx.save()
    ctx.translate(w / 2 - 36, h / 2 + 10)
    ctx.rotate(-Math.PI / 2)
    text(ctx, flavor, 0, 0, 120, 8, SANS, '#ffffff')
    ctx.restore()
    text(ctx, '12.0% ALC/VOL', w / 2 + 40, 22, 30, 6, SANS, '#ffffff')
    return { wrap, metal: SILVER, tab: SILVER, glow }
  }
}

// --- Wild Turkey 101: the 1999–2011 label, the bird in full color -----------

function turkey(ctx, x, y) {
  // Standing, facing left: fanned tail, bronze body, bare neck, red wattle.
  ctx.fillStyle = '#5a3a20'
  ctx.beginPath()
  ctx.ellipse(x + 8, y - 4, 9, 14, 0.3, 0, Math.PI * 2)
  ctx.fill()
  ctx.fillStyle = '#8a5a2e'
  ctx.beginPath()
  ctx.ellipse(x, y, 11, 15, 0.15, 0, Math.PI * 2)
  ctx.fill()
  ctx.fillStyle = '#c9b48a'
  ctx.fillRect(x - 3, y + 14, 2, 12)
  ctx.fillRect(x + 3, y + 14, 2, 12)
  ctx.fillStyle = '#7a6a8a'
  ctx.fillRect(x - 7, y - 26, 4, 16)
  ctx.fillStyle = '#c0302a'
  ctx.beginPath()
  ctx.arc(x - 6, y - 28, 3.5, 0, Math.PI * 2)
  ctx.fill()
  ctx.fillRect(x - 9, y - 26, 3, 6)
}

function wildTurkey() {
  const cream = '#efe6c8'
  const maroon = '#7a1e22'
  const ink = '#1d1a14'
  // The label goes half way round the bottle; paint in the middle 150 px so
  // nothing sits on the edges that curve away.
  const label = canvas([210, 160], cream)
  {
    const { ctx, h } = label
    const w = 150
    ctx.translate(30, 0)
    ctx.strokeStyle = '#6b5a3a'
    ctx.lineWidth = 1
    ctx.strokeRect(3, 3, w - 6, h - 6)
    text(ctx, 'Estd. 1855', w / 2 - 16, 12, 40, 6, SERIF, '#6b5a3a')
    text(ctx, 'Austin Nichols', w / 2 - 16, 24, 84, 11, SERIF, ink)
    text(ctx, 'WILD', w / 2 - 16, 46, 90, 22, SERIF, ink)
    text(ctx, 'TURKEY', w / 2 - 16, 70, 96, 22, SERIF, ink)
    text(ctx, 'KENTUCKY STRAIGHT', w / 2 - 16, 88, 80, 7, SERIF, ink)
    text(ctx, 'BOURBON', w / 2 - 16, 98, 70, 10, SERIF, '#a3201e')
    text(ctx, 'WHISKEY', w / 2 - 16, 108, 50, 6, SERIF, ink)
    text(
      ctx,
      'Real Kentucky',
      w / 2 - 16,
      120,
      70,
      10,
      'italic $px Georgia, serif',
      ink
    )
    turkey(ctx, w - 30, 82)
    ctx.fillStyle = maroon
    ctx.fillRect(4, 130, w - 8, 18)
    text(ctx, 'PROOF   101   PROOF', w / 2, 139, w - 20, 13, SERIF, '#f1e6c8')
    text(
      ctx,
      'AUSTIN, NICHOLS DISTILLING CO.',
      w / 2,
      153,
      w - 30,
      5,
      SERIF,
      ink
    )
  }
  const neck = canvas([64, 48], maroon)
  text(neck.ctx, '101', 32, 30, 40, 14, SERIF, '#f1e6c8')
  return {
    label,
    neck,
    liquid: '#8a4a14',
    cap: maroon,
    glow: 'rgba(163, 32, 30, 0.4)',
  }
}

// --- Jim Beam: the pre-2016 white label and red seal -------------------------

function jimBeam() {
  const red = '#b22234'
  const gold = '#c9a043'
  const ink = '#1a1a1a'
  const label = canvas([110, 194], '#f7f5ee')
  {
    const { ctx, w, h } = label
    ctx.strokeStyle = gold
    ctx.lineWidth = 1.5
    ctx.strokeRect(3, 3, w - 6, h - 6)
    text(ctx, "THE WORLD'S No. 1 BOURBON", w / 2, 13, w - 16, 7, SANS, red)
    text(ctx, 'JIM BEAM', w / 2, 34, w - 10, 20, SERIF, ink)
    // Trees either side of the seal, then the seal in its gold rosette.
    ctx.fillStyle = '#8a8a80'
    for (const tx of [18, w - 18]) {
      ctx.beginPath()
      ctx.arc(tx, 62, 9, 0, Math.PI * 2)
      ctx.fill()
      ctx.fillRect(tx - 1, 66, 2, 10)
    }
    ctx.fillStyle = gold
    ctx.beginPath()
    ctx.moveTo(w / 2 - 10, 72)
    ctx.lineTo(w / 2 - 16, 90)
    ctx.lineTo(w / 2 - 4, 82)
    ctx.moveTo(w / 2 + 10, 72)
    ctx.lineTo(w / 2 + 16, 90)
    ctx.lineTo(w / 2 + 4, 82)
    ctx.fill()
    ctx.beginPath()
    ctx.arc(w / 2, 64, 15, 0, Math.PI * 2)
    ctx.fill()
    ctx.fillStyle = red
    ctx.beginPath()
    ctx.arc(w / 2, 64, 12, 0, Math.PI * 2)
    ctx.fill()
    text(ctx, 'B', w / 2, 65, 12, 12, SERIF, '#f7f5ee')
    text(ctx, 'SOUR        MASH', w / 2, 98, 80, 6, SERIF, red)
    text(ctx, 'KENTUCKY STRAIGHT', w / 2, 112, w - 16, 10, SANS, ink)
    text(ctx, 'BOURBON WHISKEY', w / 2, 125, w - 16, 10, SANS, ink)
    text(
      ctx,
      'James B. Beam',
      w / 2,
      143,
      70,
      11,
      'italic $px Georgia, serif',
      ink
    )
    text(ctx, 'JAMES B. BEAM DISTILLING CO.', w / 2, 160, w - 16, 7, SANS, ink)
    text(ctx, 'CLERMONT, KENTUCKY', w / 2, 170, w - 30, 5, SANS, ink)
    text(ctx, '40% ALC/VOL', w - 24, h - 12, 36, 6, SANS, ink)
  }
  const neck = canvas([96, 24], '#f2f2ee')
  text(neck.ctx, 'JIM BEAM', 48, 12, 60, 9, SERIF, ink)
  return {
    label,
    neck,
    liquid: '#b8732c',
    cap: '#eeeeea',
    glow: 'rgba(178, 34, 52, 0.4)',
  }
}

// --- Grey Goose: frosted glass, the window of geese over the Alps -----------

function greyGoose() {
  const frost = '#dfe6ec'
  const blue = '#2a52be'
  const red = '#c8102e'
  // Printed half way round the bottle; paint in the middle 154 px so
  // nothing sits on the edges that curve away.
  const label = canvas([214, 240], frost)
  {
    const { ctx } = label
    const w = 154
    ctx.translate(30, 0)
    // The etched goose in flight, high on the bottle.
    ctx.strokeStyle = '#9aa5ae'
    ctx.lineWidth = 2
    ctx.beginPath()
    ctx.moveTo(w / 2 - 26, 14)
    ctx.quadraticCurveTo(w / 2 - 6, 4, w / 2 + 4, 14)
    ctx.quadraticCurveTo(w / 2 + 14, 8, w / 2 + 26, 10)
    ctx.stroke()
    // The window: sky, snowy Alps, dark water, a skein of geese.
    const sky = ctx.createLinearGradient(0, 26, 0, 96)
    sky.addColorStop(0, '#8fa3b5')
    sky.addColorStop(1, '#5e7385')
    ctx.fillStyle = sky
    ctx.fillRect(12, 26, w - 24, 70)
    ctx.fillStyle = '#f0f3f6'
    ctx.beginPath()
    ctx.moveTo(12, 78)
    for (const [x, y] of [
      [30, 50],
      [44, 66],
      [66, 40],
      [88, 64],
      [106, 48],
      [126, 70],
      [w - 12, 58],
    ]) {
      ctx.lineTo(x, y)
    }
    ctx.lineTo(w - 12, 80)
    ctx.closePath()
    ctx.fill()
    ctx.fillStyle = '#4a5f72'
    ctx.fillRect(12, 80, w - 24, 16)
    ctx.strokeStyle = '#2f3e4c'
    ctx.lineWidth = 1
    for (const [x, y] of [
      [50, 36],
      [62, 32],
      [74, 38],
      [86, 34],
      [98, 40],
    ]) {
      ctx.beginPath()
      ctx.moveTo(x - 4, y - 2)
      ctx.lineTo(x, y)
      ctx.lineTo(x + 4, y - 2)
      ctx.stroke()
    }
    // GREY GOOSE in blue, with a red drop shadow.
    text(ctx, 'GREY GOOSE', w / 2 + 1.5, 123.5, w - 30, 22, SERIF, red)
    text(ctx, 'GREY GOOSE', w / 2, 122, w - 30, 22, SERIF, blue)
    text(ctx, 'VODKA', w / 2, 144, 70, 14, SERIF, blue)
    text(ctx, 'DISTILLED AND BOTTLED', w / 2, 168, w - 30, 8, SERIF, '#222222')
    text(ctx, 'IN FRANCE', w / 2, 180, 60, 8, SERIF, '#222222')
    // The tricolor, slanted.
    for (const [i, color] of ['#0055a4', '#ffffff', '#ef4135'].entries()) {
      const x = w / 2 - 33 + i * 22
      ctx.fillStyle = color
      ctx.beginPath()
      ctx.moveTo(x, 204)
      ctx.lineTo(x + 22, 200)
      ctx.lineTo(x + 22, 206)
      ctx.lineTo(x, 210)
      ctx.closePath()
      ctx.fill()
    }
  }
  return { label, frost, cap: '#1f3f8f', glow: 'rgba(42, 82, 190, 0.4)' }
}

// --- Pabst Blue Ribbon: white can, red sash, the blue ribbon badge ----------

function pbr() {
  const red = '#c8102e'
  const blue = '#1f3d99'
  const white = '#f3f4f6'
  const wrap = canvas(CAN, '#e9ecef')
  {
    const { ctx, w, h } = wrap
    const cx = w / 2
    ctx.fillStyle = red
    ctx.fillRect(0, 0, w, 4)
    ctx.fillRect(0, h - 4, w, 4)
    text(
      ctx,
      'Established in Milwaukee 1844',
      cx,
      13,
      96,
      8,
      'italic bold $px Georgia, serif',
      red
    )
    // The red sash, top left to bottom right, behind the badge.
    ctx.fillStyle = red
    ctx.beginPath()
    ctx.moveTo(cx - 52, 20)
    ctx.lineTo(cx - 24, 20)
    ctx.lineTo(cx + 52, 150)
    ctx.lineTo(cx + 24, 150)
    ctx.closePath()
    ctx.fill()
    // Ribbon tails, notched at the ends.
    ctx.fillStyle = blue
    for (const dir of [-1, 1]) {
      const x = cx + dir * 11
      ctx.beginPath()
      ctx.moveTo(x - 10, 92)
      ctx.lineTo(x + 10, 92)
      ctx.lineTo(x + 10 + dir * 4, 132)
      ctx.lineTo(x + dir * 2, 124)
      ctx.lineTo(x - 10 + dir * 4, 132)
      ctx.closePath()
      ctx.fill()
    }
    // The rosette: a scalloped blue edge, a white ring, a blue disk.
    ctx.fillStyle = blue
    for (let i = 0; i < 24; i++) {
      const a = (i / 24) * Math.PI * 2
      ctx.beginPath()
      ctx.arc(cx + Math.cos(a) * 36, 62 + Math.sin(a) * 36, 5, 0, Math.PI * 2)
      ctx.fill()
    }
    ctx.fillStyle = white
    ctx.beginPath()
    ctx.arc(cx, 62, 36, 0, Math.PI * 2)
    ctx.fill()
    ctx.fillStyle = blue
    ctx.beginPath()
    ctx.arc(cx, 62, 31, 0, Math.PI * 2)
    ctx.fill()
    text(ctx, 'Pabst', cx, 52, 50, 20, 'italic bold $px Georgia, serif', white)
    // Blue Ribbon runs wider than the badge, on a blue band.
    ctx.fillStyle = blue
    ctx.fillRect(cx - 48, 66, 96, 18)
    text(ctx, 'Blue Ribbon', cx, 75, 92, 15, SERIF, white)
    text(ctx, 'BEER', cx, 90, 24, 7, SERIF, white)
    text(ctx, '12 FL OZ', cx, 144, 40, 6, SANS, '#333333')
    // The back: PABST BLUE RIBBON up each edge.
    for (const x of [12, w - 12]) {
      ctx.save()
      ctx.translate(x, h / 2)
      ctx.rotate(-Math.PI / 2)
      text(ctx, 'PABST BLUE RIBBON', 0, 0, 120, 10, SERIF, blue)
      ctx.restore()
    }
  }
  return { wrap, metal: SILVER, tab: SILVER, glow: 'rgba(31, 61, 153, 0.4)' }
}

// --- Miller High Life: white label, red script, gold neck foil -------------

function highLife() {
  const red = '#c8102e'
  const gold = '#c9a043'
  const ink = '#2a1d12'
  // Half way round the bottle; paint in the middle 150 px so nothing sits
  // on the edges that curve away.
  const label = canvas([210, 108], '#f4f6f7')
  {
    const { ctx, h } = label
    const w = 150
    ctx.translate(30, 0)
    ctx.fillStyle = gold
    ctx.fillRect(0, 0, w, 6)
    ctx.fillRect(0, h - 6, w, 6)
    ctx.fillStyle = ink
    ctx.fillRect(0, 6, w, 1.5)
    ctx.fillRect(0, h - 7.5, w, 1.5)
    // The crest: a red seal in a gold wreath.
    ctx.fillStyle = gold
    ctx.beginPath()
    ctx.arc(w / 2, 22, 11, 0, Math.PI * 2)
    ctx.fill()
    ctx.fillStyle = red
    ctx.beginPath()
    ctx.arc(w / 2, 22, 7, 0, Math.PI * 2)
    ctx.fill()
    text(
      ctx,
      'Miller',
      w / 2,
      54,
      110,
      34,
      'italic bold $px "Brush Script MT", "Snell Roundhand", cursive',
      red
    )
    text(ctx, 'HIGH LIFE', w / 2, 80, 90, 14, SERIF, ink)
    text(
      ctx,
      "America's Quality Beer Since 1855",
      w / 2,
      93,
      110,
      6,
      'italic $px Georgia, serif',
      ink
    )
  }
  const neck = canvas([96, 40], gold)
  text(
    neck.ctx,
    'Miller',
    48,
    16,
    60,
    14,
    'italic bold $px "Brush Script MT", "Snell Roundhand", cursive',
    red
  )
  text(neck.ctx, 'HIGH LIFE', 48, 31, 50, 8, SERIF, ink)
  return {
    label,
    neck,
    liquid: '#d8a23a',
    cap: gold,
    glow: 'rgba(216, 162, 58, 0.4)',
  }
}

// --- Modelo Especial: the pre-2010 cream can, lions and crest ---------------

function lion(ctx, x, y, dir, color) {
  // Rampant, facing the wordmark: body, mane, raised paws, tail.
  ctx.fillStyle = color
  ctx.beginPath()
  ctx.ellipse(x, y, 5, 10, dir * 0.3, 0, Math.PI * 2)
  ctx.fill()
  ctx.beginPath()
  ctx.arc(x + dir * 3, y - 10, 5, 0, Math.PI * 2)
  ctx.fill()
  ctx.fillRect(x + dir * 4, y - 6, dir * 7, 2)
  ctx.fillRect(x - 3, y + 8, 2, 7)
  ctx.fillRect(x + 1, y + 8, 2, 7)
  ctx.fillRect(x - dir * 7, y + 2, dir * 4, 2)
}

function modelo() {
  const navy = '#1b2a5c'
  const gold = '#c9a24a'
  const wrap = canvas(CAN, '#f3efe2')
  {
    const { ctx, w, h } = wrap
    ctx.fillStyle = gold
    ctx.fillRect(0, 0, w, 10)
    ctx.fillRect(0, h - 10, w, 10)
    ctx.fillStyle = navy
    ctx.fillRect(0, 10, w, 1.5)
    ctx.fillRect(0, h - 11.5, w, 1.5)
    text(ctx, 'CERVEZA', w / 2, 34, 50, 9, SERIF, '#c0272d')
    text(ctx, 'Modelo', w / 2, 60, 62, 26, SERIF, navy)
    lion(ctx, w / 2 - 40, 64, 1, gold)
    lion(ctx, w / 2 + 40, 64, -1, gold)
    text(ctx, 'e s p e c i a l', w / 2, 86, 70, 11, SERIF, navy)
    // The crest: a navy ring around the red and gold eagle seal.
    ctx.fillStyle = navy
    ctx.beginPath()
    ctx.arc(w / 2, 116, 13, 0, Math.PI * 2)
    ctx.fill()
    ctx.fillStyle = '#f3efe2'
    ctx.beginPath()
    ctx.arc(w / 2, 116, 10, 0, Math.PI * 2)
    ctx.fill()
    ctx.fillStyle = '#c0272d'
    ctx.beginPath()
    ctx.arc(w / 2, 116, 6, 0, Math.PI * 2)
    ctx.fill()
    ctx.fillStyle = gold
    ctx.fillRect(w / 2 - 3, 113, 6, 6)
    text(ctx, '12 FL OZ', w / 2, h - 20, 40, 6, SANS, navy)
  }
  return { wrap, metal: SILVER, tab: SILVER, glow: 'rgba(201, 162, 74, 0.4)' }
}

// --- MD 20/20 Banana Red: the black square on a red flask -------------------

function md2020() {
  const gold = '#c9a043'
  const red = '#d0202e'
  // Transparent margins: the flask shows around the label.
  const label = canvas([120, 220])
  {
    const { ctx, w } = label
    // The black square with its gold rule.
    ctx.fillStyle = '#111111'
    ctx.fillRect(12, 34, w - 24, 110)
    ctx.strokeStyle = gold
    ctx.lineWidth = 2
    ctx.strokeRect(16, 38, w - 32, 102)
    // The fruit over the top edge: a banana and a strawberry.
    ctx.fillStyle = '#f2d23a'
    ctx.beginPath()
    ctx.ellipse(w / 2 - 6, 30, 18, 7, -0.3, 0, Math.PI)
    ctx.fill()
    ctx.fillStyle = '#e0303a'
    ctx.beginPath()
    ctx.arc(w / 2 + 14, 30, 8, 0, Math.PI * 2)
    ctx.fill()
    ctx.fillStyle = '#3a8a2a'
    ctx.fillRect(w / 2 + 11, 20, 6, 3)
    text(ctx, 'MD', w / 2, 76, 70, 32, SERIF, '#ffffff')
    text(ctx, '20/20', w / 2, 112, 84, 28, SERIF, '#ffffff')
    // The flavor band.
    ctx.fillStyle = red
    ctx.fillRect(16, 152, w - 32, 18)
    ctx.strokeStyle = gold
    ctx.strokeRect(16, 152, w - 32, 18)
    text(ctx, 'BANANA RED', w / 2, 161, w - 40, 10, SERIF, '#f6e7c0')
  }
  return {
    label,
    liquid: '#c8152e',
    cap: '#b9bdc4',
    glow: 'rgba(200, 21, 46, 0.4)',
  }
}

// --- Ice Mountain: the blue wrap, a snowy peak ------------------------------

function iceMountain() {
  const blue = '#1e5aa8'
  const wrap = canvas([240, 80], blue)
  {
    const { ctx, w, h } = wrap
    // The peak, front and back.
    for (const cx of [w / 2, 0, w]) {
      ctx.fillStyle = '#7fb2e5'
      ctx.beginPath()
      ctx.moveTo(cx - 40, 46)
      ctx.lineTo(cx - 10, 14)
      ctx.lineTo(cx + 4, 26)
      ctx.lineTo(cx + 16, 18)
      ctx.lineTo(cx + 40, 46)
      ctx.closePath()
      ctx.fill()
      ctx.fillStyle = '#ffffff'
      ctx.beginPath()
      ctx.moveTo(cx - 18, 23)
      ctx.lineTo(cx - 10, 14)
      ctx.lineTo(cx + 4, 26)
      ctx.lineTo(cx + 16, 18)
      ctx.lineTo(cx + 24, 26)
      ctx.lineTo(cx + 4, 32)
      ctx.closePath()
      ctx.fill()
    }
    text(ctx, 'ICE MOUNTAIN', w / 2, 54, 100, 14, SANS, '#ffffff')
    ctx.fillStyle = '#2e8b3a'
    ctx.fillRect(w / 2 - 50, 63, 100, 10)
    text(ctx, '100% NATURAL SPRING WATER', w / 2, 68, 94, 7, SANS, '#ffffff')
    ctx.fillStyle = '#163f78'
    ctx.fillRect(0, 0, w, 3)
    ctx.fillRect(0, h - 3, w, 3)
  }
  return {
    wrap,
    water: '#f2f6f8',
    cap: '#2b6cc4',
    glow: 'rgba(127, 178, 229, 0.4)',
  }
}

const PAINTERS = {
  monster,
  'monster-ultra': monsterUltra,
  'red-bull': redBull,
  'rip-it': ripIt,
  rockstar,
  nos,
  'four-loko-blue': fourLoko(
    'BLUE RASPBERRY FLAVOR',
    '#66d4ff',
    ['#00a0e9', '#003c9e', '#e8243c'],
    0x4b1,
    'rgba(0, 160, 233, 0.4)'
  ),
  'four-loko-punch': fourLoko(
    'FRUIT PUNCH',
    '#8c0030',
    ['#e8004c', '#5a5a5e', '#c41e2e'],
    0x4b2,
    'rgba(232, 0, 76, 0.4)'
  ),
  'four-loko-lemon': fourLoko(
    'LEMON LIME FLAVOR',
    '#f2f200',
    ['#9be800', '#3d8c00', '#e8f5c0'],
    0x4b3,
    'rgba(155, 232, 0, 0.4)'
  ),
  'wild-turkey': wildTurkey,
  'jim-beam': jimBeam,
  'grey-goose': greyGoose,
  pbr,
  'high-life': highLife,
  modelo,
  'md-2020': md2020,
  'ice-mountain': iceMountain,
}

// Fresh canvases on every call, so each container owns its art.
export function paintDrink(drinkId) {
  const painter = PAINTERS[drinkId]
  if (!painter) throw new Error(`No can art for drink "${drinkId}"`)
  return painter()
}
