import { context2d, EGGSHELL, MONO } from './canvas.ts'
import { CONFIG } from './config.ts'
import { copy } from './copy.ts'
import { outfitById } from './outfits.ts'

// The portal phone: Q brings it up and it dials a Citgo portal to the
// last Citgo the raider stood at (portals.ts, sharedworld.ts rule 28), the
// screen filling as it goes, then says the portal is open and goes down again.
// While one of ours is open the screen says how long it has left. Q again
// while it dials hangs up.
//
// The phone, the hand that holds it and the screen all draw into one small
// canvas that CSS upscales with image-rendering: pixelated, so the prop has
// the same coarse pixels as the world render (CONFIG.render.downscale). The
// shapes are flat polygons in a 200 x 360 design grid, scaled down to the
// canvas.

// The portal's blue, as Citgo portals burn (assets.ts CITGO_PORTAL).
const BLUE = '#6aa8ff'
const DIM = 'rgba(106, 168, 255, 0.3)'
// The hand is the player's: same skin and sleeve as the player outfit, with
// the shadow facet a darker tone of the skin. The torch's grip
// (torchhand.ts) is the same hand.
const PLAYER = outfitById('player').colors
export const SKIN = PLAYER.skin
export const SKIN_SHADE = darken(PLAYER.skin, 0.88)
export const SLEEVE = PLAYER.shirt
export const CUFF = '#0f172a'
const BODY = '#0b0f14'
const SCREEN = '#020617'

// Design grid, and the canvas size: the phone is 17rem (272px) wide, so one
// canvas pixel covers about CONFIG.render.downscale screen pixels.
const GRID_W = 200
const GRID_H = 360
const WIDTH = 90
const K = WIDTH / GRID_W
const HEIGHT = Math.round(GRID_H * K) // 162

// The screen hole in the phone body, in grid units.
const SX = 46
const SY = 34
const SW = 108
const SH = 208

// A flat polygon: its fill and its corners in grid units.
export type Poly = [color: string, points: [number, number][]]

// Back layer, drawn before the phone body.
// prettier-ignore
const BACK: Poly[] = [
  [SLEEVE, [[58, 360], [66, 296], [154, 296], [164, 360]]],
  [CUFF, [[64, 300], [68, 282], [152, 282], [156, 300]]],
  [SKIN, [[36, 172], [30, 238], [54, 286], [150, 290], [174, 258], [174, 172]]],
  [SKIN_SHADE, [[30, 238], [54, 286], [104, 288], [88, 246]]],
  [SKIN, [[50, 110], [24, 122], [24, 234], [50, 250]]],
  [BODY, [[52, 20], [148, 20], [160, 32], [160, 242], [148, 254], [52, 254], [40, 242], [40, 32]]],
]

// Front layer: the thumb over the bezel.
// prettier-ignore
const FRONT: Poly[] = [
  [SKIN, [[176, 252], [180, 208], [170, 170], [160, 162], [152, 172], [156, 210], [153, 254]]],
  [SKIN_SHADE, [[176, 252], [180, 208], [166, 212], [164, 253]]],
]

function darken(hex: string, factor: number): string {
  const n = parseInt(hex.slice(1), 16)
  const channel = (shift: number) => Math.round(((n >> shift) & 255) * factor)
  return `rgb(${channel(16)}, ${channel(8)}, ${channel(0)})`
}

export function fillPolys(
  ctx: CanvasRenderingContext2D,
  polys: readonly Poly[]
): void {
  for (const [color, points] of polys) {
    ctx.fillStyle = color
    ctx.beginPath()
    ctx.moveTo(points[0][0], points[0][1])
    for (let i = 1; i < points.length; i++)
      ctx.lineTo(points[i][0], points[i][1])
    ctx.closePath()
    ctx.fill()
  }
}

function clockText() {
  return new Date().toLocaleTimeString('en-US', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    timeZone: 'America/Chicago',
  })
}

function mmss(seconds: number): string {
  const m = Math.floor(seconds / 60)
  const s = seconds % 60
  return `${m}:${String(s).padStart(2, '0')}`
}

// How long the screen says OPEN after the portal opens, before the phone
// goes down.
const OPEN_HOLD = 1.2

// What draw() needs each frame: whole seconds left on our own open portal,
// or null with none.
interface PhoneFrame {
  open: number | null
}

export class Phone {
  canvas: HTMLCanvasElement
  holder: HTMLElement
  ctx: CanvasRenderingContext2D
  raised: boolean
  // Seconds into dialing, or null when not dialing.
  dialing: number | null
  // Seconds the screen still says OPEN, once the dial went through.
  holding: number
  spin: number
  clock: string
  clockAge: number

  // holder is the element that slides up when the phone is raised.
  constructor(canvas: HTMLCanvasElement, holder: HTMLElement = canvas) {
    this.canvas = canvas
    this.holder = holder
    this.ctx = context2d(canvas)
    this.raised = false
    this.dialing = null
    this.holding = 0
    this.spin = 0
    this.clock = ''
    this.clockAge = Infinity
    canvas.width = WIDTH
    canvas.height = HEIGHT
  }

  private raise(raised: boolean): void {
    this.raised = raised
    this.holder.classList.toggle('bv-phone--raised', raised)
  }

  // Q: dial a portal, or hang up on one dialing. Whether it now dials.
  dial(): boolean {
    if (this.dialing !== null) {
      this.hangUp()
      return false
    }
    this.dialing = 0
    this.holding = 0
    this.raise(true)
    return true
  }

  // Down again, whatever it was doing.
  hangUp(): void {
    this.dialing = null
    this.holding = 0
    this.raise(false)
  }

  // A frame on: true the frame the dial goes through, when the portal
  // should open.
  update(dt: number, frame: PhoneFrame): boolean {
    let through = false
    if (this.dialing !== null) {
      this.dialing += dt
      if (this.dialing >= CONFIG.portal.dialSeconds) {
        this.dialing = null
        this.holding = OPEN_HOLD
        through = true
      }
    } else if (this.holding > 0) {
      this.holding -= dt
      if (this.holding <= 0) this.raise(false)
    }
    if (this.raised) this.draw(dt, frame)
    return through
  }

  private draw(dt: number, { open }: PhoneFrame): void {
    this.spin = (this.spin + dt * 2.4) % (Math.PI * 2)
    const ctx = this.ctx
    ctx.setTransform(1, 0, 0, 1, 0, 0)
    ctx.clearRect(0, 0, WIDTH, HEIGHT)
    // Work in grid units from here; one canvas pixel is 1 / K units.
    ctx.setTransform(K, 0, 0, K, 0, 0)
    const px = 1 / K

    fillPolys(ctx, BACK)
    ctx.fillStyle = SCREEN
    ctx.fillRect(SX, SY, SW, SH)

    // Status bar: the local clock and a battery.
    this.clockAge += dt
    if (this.clockAge > 1) {
      this.clockAge = 0
      this.clock = clockText()
    }
    ctx.font = MONO.replace('$', String(7 * px))
    ctx.textBaseline = 'middle'
    ctx.textAlign = 'left'
    ctx.fillStyle = EGGSHELL
    ctx.fillText(this.clock, SX + 3 * px, SY + 5 * px)
    ctx.fillRect(SX + SW - 9 * px, SY + 3 * px, 6 * px, 3 * px)

    // The app's name.
    const c = SX + SW / 2
    ctx.textAlign = 'center'
    ctx.fillStyle = BLUE
    ctx.fillText(copy('phone.title'), c, SY + 32)

    // The portal: a ring that fills as it dials, and a swirl inside that
    // grows with it.
    const cy = SY + 98
    const r = 40
    const charge =
      this.dialing !== null
        ? Math.min(1, this.dialing / CONFIG.portal.dialSeconds)
        : 1
    ctx.lineWidth = 2 * px
    ctx.strokeStyle = DIM
    ctx.beginPath()
    ctx.arc(c, cy, r, 0, Math.PI * 2)
    ctx.stroke()
    ctx.strokeStyle = BLUE
    ctx.beginPath()
    ctx.arc(c, cy, r, -Math.PI / 2, -Math.PI / 2 + charge * Math.PI * 2)
    ctx.stroke()
    ctx.lineWidth = px
    for (let arm = 0; arm < 3; arm++) {
      ctx.beginPath()
      for (let s = 0; s <= 1; s += 0.05) {
        const a = this.spin + (arm / 3) * Math.PI * 2 + s * Math.PI * 2.5
        const d = s * (r - 6) * charge
        const x = c + Math.cos(a) * d
        const y = cy + Math.sin(a) * d
        if (s === 0) ctx.moveTo(x, y)
        else ctx.lineTo(x, y)
      }
      ctx.stroke()
    }

    // What it is doing, and how long ours has left.
    ctx.fillStyle = EGGSHELL
    const said =
      this.dialing !== null ? copy('phone.dialing') : copy('phone.open')
    ctx.fillText(said, c, cy + r + 14)
    if (open !== null) {
      ctx.fillStyle = BLUE
      ctx.fillText(copy('phone.left', { clock: mmss(open) }), c, cy + r + 30)
    }

    fillPolys(ctx, FRONT)
  }
}
