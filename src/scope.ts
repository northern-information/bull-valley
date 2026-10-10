import { context2d, EGGSHELL, MONO } from './canvas.ts'
import { CONFIG } from './config.ts'
import { compassBearing } from './coords.ts'
import { outfitById } from './outfits.ts'
import type { ScopeContact } from './interfaces.ts'

// The handheld Scaduscope: a north-up sweep radar in the SYSOUT voice, run as
// an app on a phone. Blips light as the sweep passes and decay until it comes
// around again. This is the same instrument as /bull-valley-scaduscope/,
// carried into the field.
//
// The phone, the hand that holds it and the screen all draw into one small
// canvas that CSS upscales with image-rendering: pixelated, so the prop has
// the same coarse pixels as the world render (CONFIG.render.downscale). The
// shapes are flat polygons in a 200 x 360 design grid, scaled down to the
// canvas.

const GREEN = '#4ade80'
const MAGENTA = '#e879f9'
const SLATE = '#94a3b8'
// Other raiders: the blue their names take in the chat log.
const RAIDER = '#60a5fa'
// The hand is the player's: same skin and sleeve as the player outfit, with
// the shadow facet a darker tone of the skin.
const PLAYER = outfitById('player').colors
const SKIN = PLAYER.skin
const SKIN_SHADE = darken(PLAYER.skin, 0.88)
const SLEEVE = PLAYER.shirt
const CUFF = '#0f172a'
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
type Poly = [color: string, points: [number, number][]]

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

function fillPolys(
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

// A direction on the ground plane. A THREE.Vector3 fits.
export interface GroundDirection {
  x: number
  z: number
}

// What draw() needs each frame. forward is the player's facing.
export interface ScopeFrame {
  contacts: ScopeContact[]
  forward: GroundDirection
  perception: boolean
}

export class Scope {
  canvas: HTMLCanvasElement
  holder: HTMLElement
  ctx: CanvasRenderingContext2D
  raised: boolean
  sweep: number
  clock: string
  clockAge: number

  // holder is the element that slides up when the scope is raised.
  constructor(canvas: HTMLCanvasElement, holder: HTMLElement = canvas) {
    this.canvas = canvas
    this.holder = holder
    this.ctx = context2d(canvas)
    this.raised = false
    this.sweep = 0
    this.clock = ''
    this.clockAge = Infinity
    canvas.width = WIDTH
    canvas.height = HEIGHT
  }

  toggle(): boolean {
    this.raised = !this.raised
    this.holder.classList.toggle('bv-phone--raised', this.raised)
    return this.raised
  }

  draw(dt: number, { contacts, forward, perception }: ScopeFrame): void {
    if (!this.raised) return
    this.sweep =
      (this.sweep + (dt * Math.PI * 2) / CONFIG.scope.sweepSeconds) %
      (Math.PI * 2)
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

    // Dish
    const c = SX + SW / 2
    const cy = SY + 92
    const r = 44
    ctx.save()
    ctx.beginPath()
    ctx.arc(c, cy, r, 0, Math.PI * 2)
    ctx.clip()

    // Rings and cross
    ctx.strokeStyle = 'rgba(74, 222, 128, 0.35)'
    ctx.lineWidth = px
    ctx.beginPath()
    ctx.arc(c, cy, r / 2, 0, Math.PI * 2)
    ctx.moveTo(c, cy - r)
    ctx.lineTo(c, cy + r)
    ctx.moveTo(c - r, cy)
    ctx.lineTo(c + r, cy)
    ctx.stroke()

    // Sweep wedge
    const grad = ctx.createConicGradient
      ? ctx.createConicGradient(this.sweep - Math.PI / 2, c, cy)
      : null
    if (grad) {
      grad.addColorStop(0, 'rgba(74, 222, 128, 0.35)')
      grad.addColorStop(0.12, 'rgba(74, 222, 128, 0)')
      grad.addColorStop(1, 'rgba(74, 222, 128, 0)')
      ctx.fillStyle = grad
      ctx.fillRect(c - r, cy - r, r * 2, r * 2)
    }
    ctx.strokeStyle = GREEN
    ctx.beginPath()
    ctx.moveTo(c, cy)
    ctx.lineTo(c + Math.sin(this.sweep) * r, cy - Math.cos(this.sweep) * r)
    ctx.stroke()

    // Contacts. A shadow's alpha decays with angular distance behind the
    // sweep; another raider holds steady, bigger and blue, so a friend is
    // never mistaken for a shadow.
    for (const contact of contacts) {
      const rad = (contact.bearing * Math.PI) / 180
      const rr = Math.min(1, contact.dist / CONFIG.scope.rangeMetres) * r
      const x = c + Math.sin(rad) * rr
      const y = cy - Math.cos(rad) * rr
      if (contact.kind === 'raider') {
        ctx.fillStyle = RAIDER
        ctx.fillRect(x - 1.5 * px, y - 1.5 * px, 3 * px, 3 * px)
        continue
      }
      let behind = this.sweep - rad
      while (behind < 0) behind += Math.PI * 2
      const alpha = Math.max(0.08, 1 - behind / (Math.PI * 2))
      ctx.fillStyle = contact.hunting ? MAGENTA : GREEN
      ctx.globalAlpha = perception ? Math.min(1, alpha + 0.3) : alpha
      ctx.fillRect(x - px, y - px, 2 * px, 2 * px)
      ctx.globalAlpha = 1
    }

    // Player facing tick at centre.
    const yaw = (compassBearing(forward.x, forward.z) * Math.PI) / 180
    ctx.strokeStyle = SLATE
    ctx.beginPath()
    ctx.moveTo(c, cy)
    ctx.lineTo(c + Math.sin(yaw) * 4 * px, cy - Math.cos(yaw) * 4 * px)
    ctx.stroke()

    ctx.restore()

    // Dish rim and the nearest shadow.
    ctx.strokeStyle = GREEN
    ctx.lineWidth = px
    ctx.beginPath()
    ctx.arc(c, cy, r, 0, Math.PI * 2)
    ctx.stroke()
    let best: ScopeContact | null = null
    for (const contact of contacts) {
      if (contact.kind !== 'shadow') continue
      if (!best || contact.dist < best.dist) best = contact
    }
    const line = best
      ? `${String(Math.round(best.bearing)).padStart(3, '0')}° ${Math.round(best.dist)}M`
      : 'NO CONTACT'
    ctx.textAlign = 'center'
    ctx.fillStyle = EGGSHELL
    ctx.fillText(line, c, cy + r + 9 * px)

    fillPolys(ctx, FRONT)
  }
}
