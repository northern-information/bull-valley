// Canvas art for the five cigarette packs: the iconic trade dress of each
// brand, drawn small enough to survive the PS1 downscale. One painter per
// brand returns the face canvases assets.js maps onto the pack:
//   front    body front (and back), 100×120, the pack's 55×66 mm face
//   side     body sides, 40×120
//   lidFront the open lid's front, 100×40
//   lidTop   the lid's top, 100×40
// plus the flat colors for edges, collar, and the cigarettes themselves.

const FRONT = [100, 120]
const SIDE = [40, 120]
const LID = [100, 40]

export function canvas([w, h], fill) {
  const c = document.createElement('canvas')
  c.width = w
  c.height = h
  const ctx = c.getContext('2d')
  if (fill) {
    ctx.fillStyle = fill
    ctx.fillRect(0, 0, w, h)
  }
  return { c, ctx, w, h }
}

// Centered text, shrunk until it fits maxW.
export function text(ctx, str, x, y, maxW, px, font, color) {
  let size = px
  ctx.font = `${font.replace('$', size)}`
  while (ctx.measureText(str).width > maxW && size > 6) {
    size -= 1
    ctx.font = `${font.replace('$', size)}`
  }
  ctx.fillStyle = color
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText(str, x, y)
}

export const SERIF = 'bold $px Georgia, "Times New Roman", serif'
export const SANS = 'bold $px "Helvetica Neue", Arial, sans-serif'

// --- Marlboro Reds: the red roof over white ---------------------------------

function marlboro() {
  const red = '#c8102e'
  const gold = '#c9a227'
  const front = canvas(FRONT, '#f4f1ea')
  {
    const { ctx, w, h } = front
    // The roof: two red triangles above a white chevron peaking top centre.
    ctx.fillStyle = red
    ctx.beginPath()
    ctx.moveTo(0, 0)
    ctx.lineTo(w / 2, 0)
    ctx.lineTo(0, h * 0.42)
    ctx.closePath()
    ctx.moveTo(w / 2, 0)
    ctx.lineTo(w, 0)
    ctx.lineTo(w, h * 0.42)
    ctx.closePath()
    ctx.fill()
    // Crest: a red seal in a gold ring.
    ctx.fillStyle = gold
    ctx.beginPath()
    ctx.arc(w / 2, h * 0.36, 7, 0, Math.PI * 2)
    ctx.fill()
    ctx.fillStyle = red
    ctx.beginPath()
    ctx.arc(w / 2, h * 0.36, 4.5, 0, Math.PI * 2)
    ctx.fill()
    text(ctx, 'Marlboro', w / 2, h * 0.64, w - 10, 22, SERIF, '#111111')
    text(ctx, '20 CLASS A', w / 2, h * 0.8, w - 30, 8, SANS, gold)
    ctx.fillStyle = red
    ctx.fillRect(0, h * 0.9, w, 4)
  }
  const side = canvas(SIDE, '#f4f1ea')
  side.ctx.fillStyle = red
  side.ctx.fillRect(0, 0, side.w, side.h * 0.4)
  const lidFront = canvas(LID, red)
  {
    const { ctx, w, h } = lidFront
    ctx.fillStyle = '#f4f1ea'
    ctx.beginPath()
    ctx.roundRect(14, h / 2 - 6, w - 28, 12, 6)
    ctx.fill()
    text(ctx, 'FILTER CIGARETTES', w / 2, h / 2 + 1, w - 34, 8, SANS, red)
  }
  return {
    front,
    side,
    lidFront,
    lidTop: canvas(LID, red),
    edge: red,
    collar: '#f4f1ea',
    inner: '#e9e2d0',
    stick: { paper: '#f3f0e8', filter: '#c98f4a', tip: '#e6d6b4' },
    glow: 'rgba(200, 16, 46, 0.35)',
  }
}

// --- Camel Turkish Royals: blue panel, pyramid, camel -----------------------

function drawCamel(ctx, x, y, s) {
  // Side-on, facing left: body, hump, neck, head, four legs.
  ctx.fillStyle = '#b07a3a'
  ctx.beginPath()
  ctx.ellipse(x, y, 13 * s, 6 * s, 0, 0, Math.PI * 2)
  ctx.fill()
  ctx.beginPath()
  ctx.ellipse(x + 1 * s, y - 6 * s, 6 * s, 5 * s, 0, Math.PI, 0)
  ctx.fill()
  ctx.fillRect(x - 15 * s, y - 13 * s, 4 * s, 11 * s)
  ctx.fillRect(x - 21 * s, y - 15 * s, 8 * s, 4 * s)
  for (const lx of [-10, -6, 6, 10]) {
    ctx.fillRect(x + lx * s, y + 3 * s, 2 * s, 12 * s)
  }
}

function camel() {
  const blue = '#1f4fa3'
  const gold = '#c7a13f'
  const cream = '#f1e3b5'
  const front = canvas(FRONT, '#f2f2ee')
  {
    const { ctx, w, h } = front
    ctx.fillStyle = blue
    ctx.fillRect(6, 4, w - 12, h - 8)
    ctx.strokeStyle = gold
    ctx.lineWidth = 2
    ctx.strokeRect(8, 6, w - 16, h - 12)
    text(ctx, 'CAMEL', w / 2, 20, w - 22, 20, SERIF, cream)
    text(ctx, 'TURKISH ROYAL', w / 2, 35, w - 30, 9, SERIF, gold)
    // Desert: a pale pyramid on a darker horizon, the camel before it.
    ctx.fillStyle = '#2a5fb8'
    ctx.fillRect(9, 44, w - 18, 48)
    ctx.fillStyle = '#e2cf98'
    ctx.beginPath()
    ctx.moveTo(26, 86)
    ctx.lineTo(48, 52)
    ctx.lineTo(70, 86)
    ctx.closePath()
    ctx.fill()
    ctx.fillStyle = '#183f86'
    ctx.fillRect(9, 86, w - 18, 20)
    drawCamel(ctx, 54, 84, 1)
    text(ctx, 'RICH & MELLOW', w / 2, h - 13, w - 30, 7, SERIF, gold)
  }
  const side = canvas(SIDE, '#f2f2ee')
  side.ctx.fillStyle = gold
  side.ctx.fillRect(3, 0, 2, side.h)
  side.ctx.fillRect(side.w - 5, 0, 2, side.h)
  const lidFront = canvas(LID, blue)
  lidFront.ctx.fillStyle = gold
  lidFront.ctx.fillRect(0, lidFront.h - 5, lidFront.w, 2)
  return {
    front,
    side,
    lidFront,
    lidTop: canvas(LID, blue),
    edge: blue,
    collar: '#f2f2ee',
    inner: '#e8e4d8',
    stick: { paper: '#f3f0e8', filter: '#c08a4c', tip: '#e4d2ae' },
    glow: 'rgba(42, 95, 184, 0.35)',
  }
}

// --- Parliaments: white pack, blue diagonal panel ---------------------------

function parliament() {
  const navy = '#1b2a6b'
  const light = '#2f8fe0'
  const front = canvas(FRONT, '#f5f5f2')
  {
    const { ctx, w, h } = front
    text(ctx, 'Parliament', w / 2, 15, w - 12, 18, SANS, navy)
    // The panel: light blue over navy, split by a white diagonal.
    const x0 = 12
    const y0 = 28
    const pw = w - 24
    const ph = h - 50
    ctx.fillStyle = light
    ctx.fillRect(x0, y0, pw, ph)
    ctx.fillStyle = navy
    ctx.beginPath()
    ctx.moveTo(x0 + pw, y0)
    ctx.lineTo(x0 + pw, y0 + ph)
    ctx.lineTo(x0, y0 + ph)
    ctx.closePath()
    ctx.fill()
    ctx.strokeStyle = '#f5f5f2'
    ctx.lineWidth = 3
    ctx.beginPath()
    ctx.moveTo(x0 + pw, y0)
    ctx.lineTo(x0, y0 + ph)
    ctx.stroke()
    ctx.strokeStyle = '#aeb3bb'
    ctx.lineWidth = 2
    ctx.strokeRect(x0, y0, pw, ph)
    // The silver chevron with its red P.
    ctx.fillStyle = '#c3c7cf'
    ctx.beginPath()
    ctx.moveTo(x0 + 16, y0 + 12)
    ctx.lineTo(x0 + 30, y0 + 22)
    ctx.lineTo(x0 + 44, y0 + 12)
    ctx.lineTo(x0 + 30, y0 + 17)
    ctx.closePath()
    ctx.fill()
    text(ctx, 'P', x0 + 30, y0 + 13, 10, 8, SANS, '#b3242c')
    text(ctx, 'RECESSED FILTER', w / 2, h - 11, w - 28, 7, SANS, '#8a8f98')
  }
  const side = canvas(SIDE, '#f5f5f2')
  side.ctx.fillStyle = light
  side.ctx.fillRect(0, 28, side.w, 4)
  return {
    front,
    side,
    lidFront: canvas(LID, '#f5f5f2'),
    lidTop: canvas(LID, '#f5f5f2'),
    edge: '#f5f5f2',
    collar: '#d9dce2',
    inner: '#ecedf0',
    // White filter; the dark tip is the recess.
    stick: { paper: '#f6f5f0', filter: '#f2f2ee', tip: '#7f7a70' },
    glow: 'rgba(47, 143, 224, 0.35)',
  }
}

// --- Newports: white over menthol teal, the spinnaker -----------------------

function newport() {
  const teal = '#1f9483'
  const dark = '#0f5e53'
  const gold = '#b49a4a'
  const green = '#1d4d3c'
  const front = canvas(FRONT, '#f4f4f0')
  {
    const { ctx, w, h } = front
    text(ctx, 'Newport', w / 2, 20, w - 10, 24, SANS, green)
    ctx.fillStyle = gold
    ctx.fillRect(0, 38, w, 3)
    ctx.fillStyle = teal
    ctx.fillRect(0, 41, w, h - 41)
    ctx.fillStyle = dark
    for (let y = 43; y < h; y += 4) ctx.fillRect(0, y, w, 1.5)
    // The spinnaker: a white crescent sail with a gold keel line.
    ctx.fillStyle = '#f4f4f0'
    ctx.strokeStyle = gold
    ctx.lineWidth = 1.5
    ctx.beginPath()
    ctx.moveTo(56, 106)
    ctx.quadraticCurveTo(70, 88, 86, 86)
    ctx.quadraticCurveTo(76, 94, 74, 106)
    ctx.closePath()
    ctx.fill()
    ctx.stroke()
  }
  const side = canvas(SIDE, teal)
  side.ctx.fillStyle = '#f4f4f0'
  side.ctx.fillRect(0, 0, side.w, 38)
  side.ctx.fillStyle = dark
  for (let y = 43; y < side.h; y += 4) side.ctx.fillRect(0, y, side.w, 1.5)
  return {
    front,
    side,
    lidFront: canvas(LID, '#f4f4f0'),
    lidTop: canvas(LID, '#f4f4f0'),
    edge: '#f4f4f0',
    collar: '#f4f4f0',
    inner: '#e7efe9',
    stick: { paper: '#f3f0e8', filter: '#c99a58', tip: '#e8d8b6' },
    glow: 'rgba(31, 148, 131, 0.35)',
  }
}

// --- Djarum Blacks: black pack, BL▲CK, black kreteks ------------------------

function djarum() {
  const black = '#141414'
  const gold = '#b8935a'
  const red = '#d6262b'
  const front = canvas(FRONT, black)
  {
    const { ctx, w, h } = front
    text(ctx, 'DJARUM', 26, 34, 34, 9, SERIF, gold)
    // BL▲CK: the A is a red triangle.
    ctx.font = 'bold 26px "Helvetica Neue", Arial, sans-serif'
    ctx.textBaseline = 'middle'
    ctx.textAlign = 'left'
    ctx.fillStyle = '#f2f2f2'
    ctx.fillText('BL', 8, 56)
    const blW = ctx.measureText('BL').width
    ctx.fillStyle = red
    ctx.beginPath()
    ctx.moveTo(8 + blW + 1, 66)
    ctx.lineTo(8 + blW + 10, 45)
    ctx.lineTo(8 + blW + 19, 66)
    ctx.closePath()
    ctx.fill()
    ctx.fillStyle = '#f2f2f2'
    ctx.fillText('CK', 8 + blW + 21, 56)
    text(ctx, '16 KRETEK FILTER', w / 2, h - 26, w - 30, 8, SANS, gold)
    text(ctx, 'EXPORT QUALITY', w / 2, h - 12, w - 40, 6, SANS, '#6f6450')
  }
  const side = canvas(SIDE, black)
  return {
    front,
    side,
    lidFront: canvas(LID, black),
    lidTop: canvas(LID, black),
    edge: black,
    collar: '#1c1c1c',
    inner: '#2a2a2a',
    // Black paper and filter, a gold band at the joint, white tip.
    stick: {
      paper: '#161616',
      filter: '#1a1a1a',
      tip: '#d9d4c8',
      band: '#c9a227',
    },
    glow: 'rgba(214, 38, 43, 0.35)',
  }
}

const PAINTERS = { marlboro, camel, parliament, newport, djarum }

// Fresh canvases on every call, so each pack owns (and can dispose) its art.
export function paintPack(brandId) {
  const painter = PAINTERS[brandId]
  if (!painter) throw new Error(`No pack art for brand "${brandId}"`)
  return painter()
}
