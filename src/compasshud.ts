// The compass: a faint strip across the top of the screen, half the
// horizon wide, the raider's facing in its middle. North, east, south and
// west ride it as letters over hairline ticks; each waypoint the account
// keeps (sharedworld.ts rule 36, waypoints.ts) is a small diamond, its
// distance said under it while it is dead ahead; each of the raider's
// party placed in the valley (rule 34) is a cyan tick. Shown only while
// the pointer is locked and nothing is open over the valley, as the
// reticle is (styles.css). hud.ts builds it; loop.ts sets it every frame,
// and it touches the page only where something moved.

import { copy } from './copy.ts'
import { el } from './dom.ts'
import { bearingYaw, compassX, yawTo } from './waypoints.ts'
import type { Facing } from './drops.ts'
import type { XZ } from './interfaces.ts'

// How much of the horizon the strip shows: half of it.
const SPAN = Math.PI
// A tick every this many degrees.
const TICK = 15
// How near the middle a waypoint is dead ahead, as a share of half the
// strip.
const AHEAD = 0.06

// What one frame of the compass shows.
export interface CompassFrame {
  me: Facing
  waypoints: readonly XZ[]
  party: readonly XZ[]
}

// One mark on the strip, and where it last stood there, so a mark that
// has not moved is not touched.
interface Mark {
  node: HTMLElement
  left: string
}

export class CompassHud {
  readonly root: HTMLElement
  private readonly strip: HTMLElement
  private readonly ticks: { mark: Mark; yaw: number }[] = []
  private readonly pins: Mark[] = []
  private readonly mates: Mark[] = []
  private readonly far: HTMLElement
  private farText = ''

  constructor(ui: HTMLElement) {
    this.root = el('div', 'bv-compass')
    this.root.setAttribute('aria-hidden', 'true')
    this.root.dataset.bv = 'compass'
    this.strip = el('div', 'bv-compass-strip')
    const letters = [
      copy('compass.n'),
      copy('compass.e'),
      copy('compass.s'),
      copy('compass.w'),
    ]
    for (let deg = 0; deg < 360; deg += TICK) {
      const letter = deg % 90 === 0 ? letters[deg / 90] : undefined
      const node = letter
        ? el('span', 'bv-compass-letter', letter)
        : el('span', 'bv-compass-tick')
      this.strip.appendChild(node)
      this.ticks.push({ mark: { node, left: '' }, yaw: bearingYaw(deg) })
    }
    this.strip.appendChild(el('span', 'bv-compass-notch'))
    this.far = el('span', 'bv-compass-far')
    this.root.append(this.strip, this.far)
    ui.appendChild(this.root)
  }

  set({ me, waypoints, party }: CompassFrame): void {
    for (const { mark, yaw } of this.ticks) {
      place(mark, compassX(me.yaw, yaw, SPAN))
    }
    let ahead: XZ | null = null
    grow(this.pins, waypoints.length, this.strip, 'bv-compass-pin')
    for (const [i, mark] of this.pins.entries()) {
      const at = waypoints[i]
      const x = at ? compassX(me.yaw, yawTo(me, at), SPAN) : null
      place(mark, x)
      const dead = x !== null && Math.abs(x) <= AHEAD
      mark.node.classList.toggle('bv-compass-pin--ahead', dead)
      if (dead) ahead = at
    }
    grow(this.mates, party.length, this.strip, 'bv-compass-mate')
    this.mates.forEach((mark, i) => {
      const at = party[i]
      place(mark, at ? compassX(me.yaw, yawTo(me, at), SPAN) : null)
    })
    this.root.dataset.pins = String(waypoints.length)
    const text = ahead
      ? copy('compass.metres', {
          metres: Math.round(Math.hypot(ahead.x - me.x, ahead.z - me.z)),
        })
      : ''
    if (text !== this.farText) {
      this.farText = text
      this.far.textContent = text
    }
  }
}

// At least `count` marks of `className` in `pool`, built as needed.
function grow(
  pool: Mark[],
  count: number,
  strip: HTMLElement,
  className: string
): void {
  while (pool.length < count) {
    const node = el('span', className)
    strip.appendChild(node)
    pool.push({ node, left: '' })
  }
}

// A mark at `x` along the strip (-1 its left end, 1 its right), or out of
// sight for null.
function place(mark: Mark, x: number | null): void {
  const left = x === null ? '' : `${((x + 1) * 50).toFixed(2)}%`
  if (left === mark.left) return
  mark.left = left
  mark.node.hidden = x === null
  if (x !== null) mark.node.style.left = left
}
