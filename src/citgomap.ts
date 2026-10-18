// The map (M): the valley from above, its roads and every Citgo, the ones
// the account has stood at lit in Citgo red and the last of them (where
// the phone's portal goes) ringed and named, with the raider an arrow
// among them. Clicking a visited Citgo fast travels there (actions.ts,
// citgos.ts fastTravel). It opens over the valley with the pointer free, as
// the Book of Shadows does; hud.ts builds it, loop.ts draws it each frame
// while it is open.

import { context2d, EGGSHELL, MONO } from './canvas.ts'
import { roadNameNear } from './citgos.ts'
import { copy } from './copy.ts'
import { el } from './dom.ts'
import type { CitgoLog, MapRoad } from './citgos.ts'
import type { Facing } from './drops.ts'
import type { Metres, XZ } from './interfaces.ts'

// One Citgo on the map: where its pump island stands, and what it is
// called there.
interface MapCitgo extends XZ {
  label: string
}

// What one frame of the open map shows: where the raider stands and faces,
// their Citgos, and the one they stand at (null: out in the valley).
interface MapFrame {
  me: Facing
  log: CitgoLog
  here: number | null
}

// The canvas, square, in its own pixels; CSS sizes it.
const SIZE = 720
// Pixels round a Citgo a pointer may land and still pick it.
const PICK = 14
const CITGO = '#ff4a1c'
const RAIDER = '#60a5fa'
const ROAD = 'rgba(240, 234, 214, 0.22)'
const UNVISITED = 'rgba(240, 234, 214, 0.45)'

export class CitgoMap {
  readonly root: HTMLElement
  // A visited Citgo clicked: actions.ts fast travels there.
  onTravel?: (station: number) => void
  private readonly canvas: HTMLCanvasElement
  private readonly ctx: CanvasRenderingContext2D
  private readonly count: HTMLElement
  private readonly last: HTMLElement
  private readonly hint: HTMLElement
  private readonly citgos: readonly MapCitgo[]
  private readonly roads: readonly MapRoad[]
  // World metres per canvas pixel, and the world point at its middle.
  private readonly scale: number
  private base: HTMLCanvasElement | null = null
  private hovered: number | null = null

  constructor(
    ui: HTMLElement,
    {
      roads,
      metres,
      citgos,
    }: {
      roads: readonly MapRoad[]
      metres: Metres
      citgos: readonly MapCitgo[]
    }
  ) {
    this.roads = roads
    this.citgos = citgos
    this.scale = Math.max(metres.width, metres.height) / SIZE

    this.root = el('section', 'bv-map')
    this.root.setAttribute('role', 'dialog')
    this.root.setAttribute('aria-label', copy('map.title'))
    this.root.hidden = true
    const head = el('header', 'bv-map-head')
    this.count = el('p', 'bv-map-count')
    head.append(el('h2', 'bv-map-title', copy('map.title')), this.count)
    this.canvas = el('canvas', 'bv-map-canvas')
    this.canvas.width = SIZE
    this.canvas.height = SIZE
    this.canvas.dataset.bv = 'map'
    this.ctx = context2d(this.canvas)
    this.last = el('p', 'bv-map-last')
    this.last.dataset.bv = 'map-last'
    this.hint = el('p', 'bv-map-hint')
    this.root.append(head, this.canvas, this.last, this.hint)
    ui.appendChild(this.root)

    this.canvas.addEventListener('mousemove', (e) => {
      this.hovered = this.pick(e)
      this.canvas.style.cursor = this.hovered === null ? '' : 'pointer'
    })
    this.canvas.addEventListener('mouseleave', () => {
      this.hovered = null
    })
    this.canvas.addEventListener('click', (e) => {
      // Not a click past the map, which closes it.
      e.stopPropagation()
      const station = this.pick(e)
      if (station !== null) this.onTravel?.(station)
    })
  }

  // What the map calls Citgo `station`.
  label(station: number): string {
    return this.citgos[station]?.label ?? ''
  }

  show(show: boolean): boolean {
    this.root.hidden = !show
    if (!show) this.hovered = null
    return show
  }

  // The world to the canvas: x east, z south, the survey's middle in the
  // canvas's.
  private toCanvas(at: XZ): { x: number; y: number } {
    return { x: SIZE / 2 + at.x / this.scale, y: SIZE / 2 + at.z / this.scale }
  }

  // The Citgo under the pointer, or null.
  private pick(e: MouseEvent): number | null {
    const box = this.canvas.getBoundingClientRect()
    if (box.width === 0) return null
    const k = SIZE / box.width
    const px = (e.clientX - box.left) * k
    const py = (e.clientY - box.top) * k
    let best: number | null = null
    let bestD = PICK * k
    this.citgos.forEach((c, i) => {
      const { x, y } = this.toCanvas(c)
      const d = Math.hypot(px - x, py - y)
      if (d <= bestD) {
        best = i
        bestD = d
      }
    })
    return best
  }

  // The roads, drawn once.
  private roadLayer(): HTMLCanvasElement {
    if (this.base) return this.base
    const base = document.createElement('canvas')
    base.width = SIZE
    base.height = SIZE
    const ctx = context2d(base)
    ctx.strokeStyle = ROAD
    ctx.lineWidth = 1
    ctx.beginPath()
    for (const { points } of this.roads) {
      points.forEach((p, i) => {
        const { x, y } = this.toCanvas(p)
        if (i === 0) ctx.moveTo(x, y)
        else ctx.lineTo(x, y)
      })
    }
    ctx.stroke()
    this.base = base
    return base
  }

  draw({ me, log, here }: MapFrame): void {
    const ctx = this.ctx
    ctx.clearRect(0, 0, SIZE, SIZE)
    ctx.drawImage(this.roadLayer(), 0, 0)
    ctx.font = MONO.replace('$', '14')
    ctx.textBaseline = 'bottom'
    ctx.textAlign = 'center'
    this.citgos.forEach((c, i) => {
      const { x, y } = this.toCanvas(c)
      const visited = log.visited.includes(i)
      if (visited) {
        ctx.fillStyle = CITGO
        ctx.fillRect(x - 5, y - 5, 10, 10)
      } else {
        ctx.strokeStyle = UNVISITED
        ctx.lineWidth = 1.5
        ctx.strokeRect(x - 4, y - 4, 8, 8)
      }
      if (i === log.last) {
        ctx.strokeStyle = EGGSHELL
        ctx.lineWidth = 2
        ctx.beginPath()
        ctx.arc(x, y, 11, 0, Math.PI * 2)
        ctx.stroke()
      }
      if (i === log.last || i === this.hovered) {
        ctx.fillStyle = EGGSHELL
        ctx.fillText(c.label, x, y - 14)
      }
    })
    // The raider: an arrow along their facing (the camera looks along
    // (-sin yaw, -cos yaw)).
    const { x, y } = this.toCanvas(me)
    ctx.save()
    ctx.translate(x, y)
    ctx.rotate(-me.yaw)
    ctx.fillStyle = RAIDER
    ctx.beginPath()
    ctx.moveTo(0, -9)
    ctx.lineTo(6, 7)
    ctx.lineTo(0, 3)
    ctx.lineTo(-6, 7)
    ctx.closePath()
    ctx.fill()
    ctx.restore()

    this.count.textContent = copy('map.visited', {
      count: log.visited.length,
      total: this.citgos.length,
    })
    const last = log.last === null ? null : this.citgos[log.last]
    this.last.textContent = last
      ? copy('map.last', { citgo: last.label })
      : copy('map.none')
    this.hint.textContent =
      here === null ? copy('map.hint_away') : copy('map.hint')
  }
}

// Every Citgo as the map names it: for its nearest named road, or by its
// number where none runs near.
export function mapCitgos(
  stations: readonly XZ[],
  roads: readonly MapRoad[]
): MapCitgo[] {
  return stations.map(({ x, z }, i) => {
    const road = roadNameNear({ x, z }, roads)
    return {
      x,
      z,
      label: road
        ? copy('map.citgo', { road })
        : copy('map.citgo_unnamed', { n: i + 1 }),
    }
  })
}
