import { CONFIG } from './config.js'
import { compassBearing } from './coords.js'

// The handheld Scaduscope: a north-up sweep radar in the SYSOUT voice, run as
// an app on a phone. Blips light as the sweep passes and decay until it comes
// around again. This is the same instrument as /bull-valley-scaduscope/,
// carried into the field. The canvas is the phone screen (hud.js).

const GREEN = '#4ade80'
const MAGENTA = '#e879f9'
const EGGSHELL = '#f0ead6' // --bv-eggshell; canvas cannot read CSS vars
const SLATE = '#94a3b8'

// Screen size in canvas pixels; the aspect matches the screen hole in the
// phone art (108 x 208 viewBox units).
const WIDTH = 216
const HEIGHT = 416

function clockText() {
  return new Date().toLocaleTimeString('en-US', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    timeZone: 'America/Chicago',
  })
}

export class Scope {
  // holder is the element that slides up when the scope is raised.
  constructor(canvas, holder = canvas) {
    this.canvas = canvas
    this.holder = holder
    this.ctx = canvas.getContext('2d')
    this.raised = false
    this.sweep = 0
    this.clock = ''
    this.clockAge = Infinity
    canvas.width = WIDTH
    canvas.height = HEIGHT
  }

  toggle() {
    this.raised = !this.raised
    this.holder.classList.toggle('bv-phone--raised', this.raised)
    return this.raised
  }

  draw(dt, { contacts, forward, nerves, perception }) {
    if (!this.raised) return
    this.sweep =
      (this.sweep + (dt * Math.PI * 2) / CONFIG.scope.sweepSeconds) %
      (Math.PI * 2)
    const ctx = this.ctx
    const c = WIDTH / 2
    const cy = 196
    const r = c - 12
    ctx.fillStyle = '#020617'
    ctx.fillRect(0, 0, WIDTH, HEIGHT)

    // Status bar: the local clock, signal bars and a battery.
    this.clockAge += dt
    if (this.clockAge > 1) {
      this.clockAge = 0
      this.clock = clockText()
    }
    ctx.font = '12px Inter, system-ui, sans-serif'
    ctx.textBaseline = 'middle'
    ctx.textAlign = 'left'
    ctx.fillStyle = EGGSHELL
    ctx.fillText(this.clock, 14, 16)
    for (let i = 0; i < 4; i++) {
      ctx.fillRect(WIDTH - 62 + i * 5, 20 - (i + 1) * 2.5, 3, (i + 1) * 2.5)
    }
    ctx.strokeStyle = EGGSHELL
    ctx.lineWidth = 1
    ctx.strokeRect(WIDTH - 36.5, 10.5, 20, 10)
    ctx.fillRect(WIDTH - 16, 13, 2, 5)
    ctx.fillRect(WIDTH - 35, 12, 12, 7)

    // App title.
    ctx.textAlign = 'center'
    ctx.fillStyle = GREEN
    ctx.fillText('SCADUSCOPE', c, 52)

    // Dish
    ctx.save()
    ctx.beginPath()
    ctx.arc(c, cy, r, 0, Math.PI * 2)
    ctx.fillStyle = 'rgba(2, 6, 23, 0.92)'
    ctx.fill()
    ctx.clip()

    // Rings and cross
    ctx.strokeStyle = 'rgba(74, 222, 128, 0.25)'
    ctx.lineWidth = 1
    for (const t of [1 / 3, 2 / 3, 1]) {
      ctx.beginPath()
      ctx.arc(c, cy, r * t, 0, Math.PI * 2)
      ctx.stroke()
    }
    ctx.beginPath()
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
      grad.addColorStop(0, 'rgba(74, 222, 128, 0.28)')
      grad.addColorStop(0.12, 'rgba(74, 222, 128, 0)')
      grad.addColorStop(1, 'rgba(74, 222, 128, 0)')
      ctx.fillStyle = grad
      ctx.beginPath()
      ctx.arc(c, cy, r, 0, Math.PI * 2)
      ctx.fill()
    }
    ctx.strokeStyle = 'rgba(74, 222, 128, 0.7)'
    ctx.beginPath()
    ctx.moveTo(c, cy)
    ctx.lineTo(c + Math.sin(this.sweep) * r, cy - Math.cos(this.sweep) * r)
    ctx.stroke()

    // Contacts: alpha decays with angular distance behind the sweep.
    for (const contact of contacts) {
      const rad = (contact.bearing * Math.PI) / 180
      let behind = this.sweep - rad
      while (behind < 0) behind += Math.PI * 2
      const alpha = Math.max(0.08, 1 - behind / (Math.PI * 2))
      const rr = Math.min(1, contact.dist / CONFIG.scope.rangeMetres) * r
      const px = c + Math.sin(rad) * rr
      const py = cy - Math.cos(rad) * rr
      ctx.fillStyle = contact.hunting ? MAGENTA : GREEN
      ctx.globalAlpha = perception ? Math.min(1, alpha + 0.3) : alpha
      ctx.fillRect(px - 2, py - 2, 4, 4)
      ctx.globalAlpha = 1
    }

    // Player facing wedge at centre.
    const yaw = (compassBearing(forward.x, forward.z) * Math.PI) / 180
    ctx.strokeStyle = SLATE
    ctx.beginPath()
    ctx.moveTo(c, cy)
    ctx.lineTo(c + Math.sin(yaw) * 14, cy - Math.cos(yaw) * 14)
    ctx.stroke()

    // Interference climbs with nerves.
    const flecks = Math.floor((nerves / 100) * 60)
    ctx.fillStyle = 'rgba(74, 222, 128, 0.35)'
    for (let i = 0; i < flecks; i++) {
      const a = Math.random() * Math.PI * 2
      const rr = Math.random() * r
      ctx.fillRect(c + Math.sin(a) * rr, cy - Math.cos(a) * rr, 1.5, 1.5)
    }
    ctx.restore()

    // Bezel and readout line.
    ctx.strokeStyle = GREEN
    ctx.lineWidth = 2
    ctx.beginPath()
    ctx.arc(c, cy, r, 0, Math.PI * 2)
    ctx.stroke()
    ctx.font = '12px Inter, system-ui, sans-serif'
    ctx.textAlign = 'center'
    ctx.fillStyle = EGGSHELL
    let line = 'NO CONTACT'
    let best = null
    for (const contact of contacts) {
      if (!best || contact.dist < best.dist) best = contact
    }
    if (best) {
      line = `CONTACT ${String(Math.round(best.bearing)).padStart(3, '0')}° ${Math.round(best.dist)}M`
    }
    ctx.fillText(line, c, cy + r + 30)
    ctx.fillStyle = SLATE
    ctx.fillText(`RANGE ${CONFIG.scope.rangeMetres}M`, c, cy + r + 50)

    // Home indicator.
    ctx.fillStyle = SLATE
    ctx.fillRect(c - 36, HEIGHT - 12, 72, 3)
  }
}
