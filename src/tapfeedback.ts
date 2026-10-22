// What a tap or a click on a button gives back (tapfx.ts says what):
// Bull Valley Dial-Up throws a burst of red tetrahedrons from under the
// finger, drawn on a canvas over everything (`mountTapBurst`); the 3D
// valley's buttons press in (styles.css .bv-btn:active) and ripple out
// from where the click landed (`mountTapRipple`). Both tick, through a
// context of their own made on the first tap, at the raider's Sounds
// setting; a silent page (silent.ts) passes no volume and hears nothing.

import { SILENT } from './silent.ts'
import { BURST, burst, shardFaces, stepShards, TAP_TONE } from './tapfx.ts'
import type { Shard } from './tapfx.ts'

// What counts as a button: anything a tap acts on.
const PRESSABLE = 'button:not(:disabled), a[href], [role="button"]'

// The ripple's life (ms), as styles.css .bv-ripple runs it.
const RIPPLE_MS = 560

// The pressable a pointer went down on, or null.
function pressed(e: PointerEvent): HTMLElement | null {
  if (e.button !== 0) return null
  return e.target instanceof Element
    ? e.target.closest<HTMLElement>(PRESSABLE)
    : null
}

// The tick, played on its own context, made on the first tap (a page
// plays nothing before a gesture). `volume` reads the raider's Sounds
// setting, 0 to 100, each time.
function ticker(volume: () => number): () => void {
  let ctx: AudioContext | null = null
  return () => {
    const level = Math.max(0, Math.min(1, volume() / 100))
    if (level === 0) return
    ctx ??= new AudioContext()
    void ctx.resume()
    const t = ctx.currentTime
    const tone = (at: number, from: number, to: number, gain: number) => {
      const osc = ctx!.createOscillator()
      const amp = ctx!.createGain()
      osc.type = 'triangle'
      osc.frequency.setValueAtTime(from, at)
      osc.frequency.exponentialRampToValueAtTime(to, at + TAP_TONE.seconds)
      amp.gain.setValueAtTime(gain, at)
      amp.gain.exponentialRampToValueAtTime(0.0001, at + TAP_TONE.seconds)
      osc.connect(amp).connect(ctx!.destination)
      osc.start(at)
      osc.stop(at + TAP_TONE.seconds)
    }
    const gain = TAP_TONE.gain * level
    tone(t, TAP_TONE.from, TAP_TONE.to, gain)
    tone(t + TAP_TONE.echo, TAP_TONE.from * 2, TAP_TONE.to * 2, gain / 3)
  }
}

// The tick a page hears, or nothing on a silent one.
function tickOf(volume: () => number): () => void {
  return SILENT ? () => {} : ticker(volume)
}

// Dial-Up: every tap on a button throws a burst of red tetrahedrons from
// under the finger, and ticks. The canvas draws only while a burst flies.
export function mountTapBurst(volume: () => number): void {
  const canvas = document.createElement('canvas')
  canvas.className = 'bv-tapburst'
  canvas.setAttribute('aria-hidden', 'true')
  document.body.append(canvas)
  const g = canvas.getContext('2d')
  const tick = tickOf(volume)
  let shards: Shard[] = []
  let last = 0
  let frame = 0

  const size = () => {
    const dpr = window.devicePixelRatio || 1
    canvas.width = Math.round(window.innerWidth * dpr)
    canvas.height = Math.round(window.innerHeight * dpr)
    g?.setTransform(dpr, 0, 0, dpr, 0, 0)
  }

  // Stepped on whole frames at BURST.fps, so the shards jerk along.
  const frameS = 1 / BURST.fps
  const draw = (now: number) => {
    frame = requestAnimationFrame(draw)
    if ((now - last) / 1000 < frameS) return
    last = now
    shards = stepShards(shards, frameS)
    if (!shards.length) {
      cancelAnimationFrame(frame)
      frame = 0
    }
    if (!g) return
    g.clearRect(0, 0, window.innerWidth, window.innerHeight)
    for (const shard of shards) {
      for (const face of shardFaces(shard)) {
        // Citgo red (#ff4a1c), lit.
        const r = Math.round(255 * face.light)
        const gr = Math.round(74 * face.light)
        const b = Math.round(28 * face.light)
        g.fillStyle = `rgba(${r}, ${gr}, ${b}, ${face.alpha})`
        g.beginPath()
        face.points.forEach(([x, y], i) =>
          i === 0 ? g.moveTo(x, y) : g.lineTo(x, y)
        )
        g.closePath()
        g.fill()
      }
    }
  }

  document.addEventListener(
    'pointerdown',
    (e) => {
      if (!pressed(e)) return
      tick()
      shards = [...shards, ...burst(e.clientX, e.clientY, Math.random)]
      if (frame) return
      size()
      last = 0
      frame = requestAnimationFrame(draw)
    },
    { capture: true, passive: true }
  )
  window.addEventListener('resize', () => {
    if (frame) size()
  })
}

// The 3D valley: every click on a button ripples out from where it
// landed, and ticks; the press itself is styles.css's (.bv-btn:active).
export function mountTapRipple(volume: () => number): void {
  const tick = tickOf(volume)
  document.addEventListener(
    'pointerdown',
    (e) => {
      const button = pressed(e)
      if (!button) return
      tick()
      if (getComputedStyle(button).position === 'static') {
        button.style.position = 'relative'
      }
      const box = button.getBoundingClientRect()
      // Far enough to reach the corner furthest from the click.
      const reach = Math.hypot(
        Math.max(e.clientX - box.left, box.right - e.clientX),
        Math.max(e.clientY - box.top, box.bottom - e.clientY)
      )
      const clip = document.createElement('span')
      clip.className = 'bv-ripples'
      clip.setAttribute('aria-hidden', 'true')
      const ring = document.createElement('span')
      ring.className = 'bv-ripple'
      ring.style.left = `${e.clientX - box.left}px`
      ring.style.top = `${e.clientY - box.top}px`
      ring.style.setProperty('--bv-ripple-reach', `${reach * 2}px`)
      // Each one torn a different way.
      ring.style.setProperty('--bv-ripple-turn', `${Math.random() * 360}deg`)
      clip.append(ring)
      button.append(clip)
      window.setTimeout(() => clip.remove(), RIPPLE_MS)
    },
    { capture: true, passive: true }
  )
}
