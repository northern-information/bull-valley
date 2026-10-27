// The map (M): the valley from above, its roads and every Citgo, the ones
// the account has stood at lit in Citgo red and the last of them (where
// the phone's portal goes) ringed and named, every portal phone the
// account knows a pale blue dot (the one by a visited Citgo's door, or one
// found; one not known is not shown), with the raider an arrow among them,
// and each of their party (sharedworld.ts rule 34) a named arrow of its
// own, and each of the raider's own bodies a bone-white cross where it
// lies until they take their things back (corpses.ts, sharedworld.ts rule
// 18). Clicking a known portal phone fast travels there (actions.ts,
// citgos.ts fastTravel). Opened for a charter
// (the first one into Marx's bed, marx.ts charter), a click anywhere picks
// where he drives instead. Otherwise a click anywhere else pins a waypoint
// there (waypoints.ts, sharedworld.ts rule 37), and a click on a pin lifts
// it. The wheel zooms in about the pointer and a drag pans the zoomed
// map; a drag never pins. It opens over the valley with the pointer free,
// as the Book of Shadows does; hud.ts builds it, loop.ts draws it each
// frame while it is open.

import { context2d, EGGSHELL, MONO } from './canvas.ts'
import { knownPhones, roadNameNear, surveyedStations } from './citgos.ts'
import { unitToWorld } from './coords.ts'
import { copy } from './copy.ts'
import { el } from './dom.ts'
import { liftWaypoint, placeWaypoint, WAYPOINT_MAX } from './waypoints.ts'
import type { CitgoLog, MapRoad, PortalPhone } from './citgos.ts'
import type { Facing } from './drops.ts'
import type { Geo, Metres, XZ } from './interfaces.ts'
import type { Waypoints } from './waypoints.ts'

// One Citgo or portal phone on the map: where it stands, and what it is
// called there; a portal phone by a Citgo's door names its station.
interface MapCitgo extends XZ {
  label: string
  station?: number
}

// What one frame of the open map shows: where the raider stands and faces,
// their Citgos and portal phones, whether they may fast travel from where
// they stand (a portal phone in the pack, or one stood at; 'aboard' in
// the truck bed, 'below' in the Undercroft, where no call carries up),
// where each of
// their party placed in the valley stands and faces, their waypoints, and
// where their own bodies lie.
interface MapFrame {
  me: Facing
  log: CitgoLog
  travel: boolean | 'aboard' | 'below'
  party?: readonly (Facing & { name: string })[]
  marks?: Waypoints
  bodies?: readonly (XZ & { id: number })[]
}

// The canvas, square, in its own pixels; CSS sizes it.
const SIZE = 720
// Pixels round a Citgo a pointer may land and still pick it.
const PICK = 14
const CITGO = '#ff4a1c'
const PHONE = '#9ec5ff'
const RAIDER = '#60a5fa'
const PARTY = '#22d3ee'
const PIN = '#f0ead6'
const BODY = '#e7e5e4'
const ROAD = 'rgba(240, 234, 214, 0.22)'
const UNVISITED = 'rgba(240, 234, 214, 0.45)'
// How near a Citgo a point is still called after it.
const NEAR_CITGO = 80
// How far in the wheel zooms, and how far one notch of it goes.
const MAX_ZOOM = 12
const WHEEL_ZOOM = 0.0015
// Canvas pixels a press may move and still be a click, not a drag.
const DRAG = 4

export class CitgoMap {
  readonly root: HTMLElement
  // A known portal phone clicked: actions.ts fast travels there.
  onTravel?: (phone: number) => void
  // Opened for a charter, a point clicked: actions.ts has Marx drive there.
  onCharter?: (to: XZ) => void
  // A pin placed or lifted: every waypoint as it should now stand, for
  // actions.ts to send the valley.
  onMark?: (marks: Waypoints) => void
  private readonly canvas: HTMLCanvasElement
  private readonly ctx: CanvasRenderingContext2D
  private readonly count: HTMLElement
  private readonly pinCount: HTMLElement
  private readonly last: HTMLElement
  private readonly hint: HTMLElement
  private readonly title: HTMLElement
  private readonly citgos: readonly MapCitgo[]
  private readonly phones: readonly MapCitgo[]
  // The portal phones known, as the last frame drew them: only those
  // pick.
  private known: readonly number[] = []
  private readonly roads: readonly MapRoad[]
  // World metres per canvas pixel unzoomed, how far in it is zoomed, and
  // the world point at its middle.
  private readonly scale: number
  private zoom = 1
  private centre: XZ = { x: 0, z: 0 }
  // A press on the canvas: where it went down, the middle then, and
  // whether it has moved far enough to be a drag.
  private press: { x: number; y: number; centre: XZ; dragged: boolean } | null =
    null
  // The roads as drawn for the view they were drawn at.
  private base: HTMLCanvasElement | null = null
  private baseView = ''
  private hovered: number | null = null
  // Whether a click picks where Marx drives (a charter), and the world
  // point under the pointer while it does.
  private charter = false
  private pointer: XZ | null = null
  // The waypoints as last drawn, and the one under the pointer.
  private marks: Waypoints = []
  private hoveredPin: number | null = null

  constructor(
    ui: HTMLElement,
    {
      roads,
      metres,
      citgos,
      phones = [],
    }: {
      roads: readonly MapRoad[]
      metres: Metres
      citgos: readonly MapCitgo[]
      phones?: readonly MapCitgo[]
    }
  ) {
    this.roads = roads
    this.citgos = citgos
    this.phones = phones
    this.scale = Math.max(metres.width, metres.height) / SIZE

    this.root = el('section', 'bv-map')
    this.root.setAttribute('role', 'dialog')
    this.root.setAttribute('aria-label', copy('map.title'))
    this.root.hidden = true
    const head = el('header', 'bv-map-head')
    this.count = el('p', 'bv-map-count')
    this.pinCount = el('p', 'bv-map-count')
    this.title = el('h2', 'bv-map-title', copy('map.title'))
    head.append(this.title, this.count, this.pinCount)
    this.canvas = el('canvas', 'bv-map-canvas')
    this.canvas.width = SIZE
    this.canvas.height = SIZE
    this.canvas.dataset.bv = 'map'
    this.ctx = context2d(this.canvas)
    this.last = el('p', 'bv-map-last')
    this.last.dataset.bv = 'map-last'
    this.hint = el('p', 'bv-map-hint')
    // The wheel and the drag work the same whatever a click does, so they
    // get a line of their own under the hint.
    const zoom = el('p', 'bv-map-zoom', copy('map.zoom'))
    this.root.append(head, this.canvas, this.last, this.hint, zoom)
    ui.appendChild(this.root)

    this.canvas.addEventListener(
      'wheel',
      (e) => {
        e.preventDefault()
        // Keep the point under the pointer where it was.
        const before = this.toWorld(e)
        this.zoom = Math.min(
          MAX_ZOOM,
          Math.max(1, this.zoom * Math.exp(-e.deltaY * WHEEL_ZOOM))
        )
        const after = this.toWorld(e)
        if (before && after) {
          this.centre = {
            x: this.centre.x + before.x - after.x,
            z: this.centre.z + before.z - after.z,
          }
        }
        this.keepInside()
      },
      { passive: false }
    )
    this.canvas.addEventListener('mousedown', (e) => {
      if (e.button !== 0) return
      this.press = {
        x: e.clientX,
        y: e.clientY,
        centre: this.centre,
        dragged: false,
      }
    })
    window.addEventListener('mouseup', (e) => {
      // The click that ends a drag on the map still reads it, then it is
      // done; a drag let go off the map gets no click, so it ends here.
      if (!this.press?.dragged || e.target !== this.canvas) this.press = null
    })
    this.canvas.addEventListener('mousemove', (e) => {
      const press = this.press
      if (press && e.buttons & 1) {
        const k = this.pixelsPerClient()
        const dx = (e.clientX - press.x) * k
        const dy = (e.clientY - press.y) * k
        if (press.dragged || Math.hypot(dx, dy) > DRAG) {
          press.dragged = true
          const m = this.scale / this.zoom
          this.centre = {
            x: press.centre.x - dx * m,
            z: press.centre.z - dy * m,
          }
          this.keepInside()
        }
      }
      this.hovered = this.pick(e)
      this.hoveredPin = this.charter ? null : this.pickPin(e)
      this.pointer = this.charter ? this.toWorld(e) : null
      this.canvas.style.cursor = this.press?.dragged
        ? 'grabbing'
        : this.charter || (this.hovered === null && this.hoveredPin === null)
          ? 'crosshair'
          : 'pointer'
    })
    this.canvas.addEventListener('mouseleave', () => {
      this.hovered = null
      this.hoveredPin = null
      this.pointer = null
    })
    this.canvas.addEventListener('click', (e) => {
      // Not a click past the map, which closes it.
      e.stopPropagation()
      // The end of a drag: it moved the map, it picks nothing.
      const dragged = this.press?.dragged
      this.press = null
      if (dragged) return
      const phone = this.pick(e)
      if (this.charter) {
        const to = phone === null ? this.toWorld(e) : this.phones[phone]
        if (to) this.onCharter?.({ x: to.x, z: to.z })
      } else if (phone !== null) {
        this.onTravel?.(phone)
      } else {
        const pin = this.pickPin(e)
        if (pin !== null) {
          this.hoveredPin = null
          this.onMark?.(liftWaypoint(this.marks, pin))
        } else {
          const at = this.toWorld(e)
          if (at) this.onMark?.(placeWaypoint(this.marks, at))
        }
      }
    })
  }

  // What the map calls Citgo `station`.
  label(station: number): string {
    return this.citgos[station]?.label ?? ''
  }

  // What the map calls portal phone `phone`.
  phoneLabel(phone: number): string {
    return this.phones[phone]?.label ?? ''
  }

  // What a point is called: the Citgo it is by, or the road it is near.
  placeOf(at: XZ): string {
    let best: MapCitgo | null = null
    let bestD = NEAR_CITGO
    for (const c of this.citgos) {
      const d = Math.hypot(at.x - c.x, at.z - c.z)
      if (d <= bestD) {
        best = c
        bestD = d
      }
    }
    if (best) return best.label
    const road = roadNameNear(at, this.roads)
    return road ?? copy('map.somewhere')
  }

  // Shown or hidden; shown for a charter, a click picks where Marx goes.
  show(show: boolean, charter = false): boolean {
    this.root.hidden = !show
    this.charter = show && charter
    this.root.classList.toggle('bv-map--charter', this.charter)
    // Opened for a charter, the map is Marx asking where to.
    this.title.textContent = copy(this.charter ? 'marx.where_to' : 'map.title')
    if (!show) {
      this.hovered = null
      this.hoveredPin = null
      this.pointer = null
    }
    return show
  }

  // The world to the canvas: x east, z south, the view's middle in the
  // canvas's.
  private toCanvas(at: XZ): { x: number; y: number } {
    const m = this.zoom / this.scale
    return {
      x: SIZE / 2 + (at.x - this.centre.x) * m,
      y: SIZE / 2 + (at.z - this.centre.z) * m,
    }
  }

  // Canvas pixels to one CSS pixel of the canvas as laid out.
  private pixelsPerClient(): number {
    const width = this.canvas.getBoundingClientRect().width
    return width === 0 ? 1 : SIZE / width
  }

  // The world point under the pointer, or null.
  private toWorld(e: MouseEvent): XZ | null {
    const box = this.canvas.getBoundingClientRect()
    if (box.width === 0) return null
    const k = SIZE / box.width
    const px = (e.clientX - box.left) * k
    const py = (e.clientY - box.top) * k
    const m = this.scale / this.zoom
    return {
      x: this.centre.x + (px - SIZE / 2) * m,
      z: this.centre.z + (py - SIZE / 2) * m,
    }
  }

  // The middle held where the zoomed view still covers only the survey's
  // square.
  private keepInside(): void {
    const reach = (SIZE / 2) * this.scale * (1 - 1 / this.zoom)
    const clamp = (v: number) => Math.min(reach, Math.max(-reach, v))
    this.centre = { x: clamp(this.centre.x), z: clamp(this.centre.z) }
  }

  // The known portal phone under the pointer, or null.
  private pick(e: MouseEvent): number | null {
    const known = this.known.filter((phone) => this.phones[phone])
    const i = this.nearest(
      e,
      known.map((phone) => this.phones[phone])
    )
    return i === null ? null : known[i]
  }

  // The waypoint under the pointer, or null.
  private pickPin(e: MouseEvent): number | null {
    return this.nearest(e, this.marks)
  }

  // The one of `points` within PICK of the pointer and nearest it, or
  // null.
  private nearest(e: MouseEvent, points: readonly XZ[]): number | null {
    const box = this.canvas.getBoundingClientRect()
    if (box.width === 0) return null
    const k = SIZE / box.width
    const px = (e.clientX - box.left) * k
    const py = (e.clientY - box.top) * k
    let best: number | null = null
    let bestD = PICK * k
    points.forEach((c, i) => {
      const { x, y } = this.toCanvas(c)
      const d = Math.hypot(px - x, py - y)
      if (d <= bestD) {
        best = i
        bestD = d
      }
    })
    return best
  }

  // The roads, drawn once for each view.
  private roadLayer(): HTMLCanvasElement {
    const view = `${this.zoom},${this.centre.x},${this.centre.z}`
    if (this.base && this.baseView === view) return this.base
    const base = this.base ?? document.createElement('canvas')
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
    this.baseView = view
    return base
  }

  // An arrow at `at` along a facing of `yaw` (the camera looks along
  // (-sin yaw, -cos yaw)).
  private arrow(at: { x: number; y: number }, yaw: number, fill: string) {
    const ctx = this.ctx
    ctx.save()
    ctx.translate(at.x, at.y)
    ctx.rotate(-yaw)
    ctx.fillStyle = fill
    ctx.beginPath()
    ctx.moveTo(0, -9)
    ctx.lineTo(6, 7)
    ctx.lineTo(0, 3)
    ctx.lineTo(-6, 7)
    ctx.closePath()
    ctx.fill()
    ctx.restore()
  }

  draw({
    me,
    log,
    travel,
    party = [],
    marks = [],
    bodies = [],
  }: MapFrame): void {
    this.marks = marks
    if (this.hoveredPin !== null && this.hoveredPin >= marks.length) {
      this.hoveredPin = null
    }
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
      if (i === log.last) {
        ctx.fillStyle = EGGSHELL
        ctx.fillText(c.label, x, y - 14)
      }
    })
    // The portal phones known, each a dot, named under the pointer.
    this.known = knownPhones(log, this.phones)
    for (const phone of this.known) {
      const p = this.phones[phone] as MapCitgo | undefined
      if (!p) continue
      const { x, y } = this.toCanvas(p)
      ctx.fillStyle = PHONE
      ctx.beginPath()
      ctx.arc(x, y, 4, 0, Math.PI * 2)
      ctx.fill()
      if (phone === this.hovered) {
        ctx.fillStyle = EGGSHELL
        ctx.fillText(p.label, x, y - 12)
      }
    }
    this.canvas.dataset.phones = this.known.join(',')
    // The waypoints: numbered diamonds, the hovered one named.
    marks.forEach((mark, i) => {
      const { x, y } = this.toCanvas(mark)
      ctx.fillStyle = PIN
      ctx.beginPath()
      ctx.moveTo(x, y - 7)
      ctx.lineTo(x + 6, y)
      ctx.lineTo(x, y + 7)
      ctx.lineTo(x - 6, y)
      ctx.closePath()
      ctx.fill()
      ctx.fillText(
        i === this.hoveredPin
          ? copy('map.pin', { n: i + 1, place: this.placeOf(mark) })
          : String(i + 1),
        x,
        y - 10
      )
    })
    this.canvas.dataset.pins = String(marks.length)
    this.canvas.dataset.zoom = this.zoom.toFixed(2)
    // The raider's bodies: each a cross where it lies, always named, so a
    // corpse run knows where to run.
    for (const body of bodies) {
      const { x, y } = this.toCanvas(body)
      ctx.strokeStyle = BODY
      ctx.lineWidth = 3
      ctx.beginPath()
      ctx.moveTo(x, y - 8)
      ctx.lineTo(x, y + 8)
      ctx.moveTo(x - 6, y - 3)
      ctx.lineTo(x + 6, y - 3)
      ctx.stroke()
      ctx.fillStyle = BODY
      ctx.fillText(copy('map.body'), x, y - 11)
    }
    this.canvas.dataset.bodies = bodies.map((body) => body.id).join(',')
    // The party, each named, under the raider's own arrow.
    for (const mate of party) {
      const at = this.toCanvas(mate)
      this.arrow(at, mate.yaw, PARTY)
      ctx.fillStyle = PARTY
      ctx.fillText(mate.name, at.x, at.y - 12)
    }
    this.canvas.dataset.party = party.map((mate) => mate.name).join(',')
    // The raider: an arrow along their facing.
    this.arrow(this.toCanvas(me), me.yaw, RAIDER)

    // A charter: a cross where the pointer is, named.
    if (this.charter && this.pointer) {
      const at =
        (this.hovered !== null && this.phones[this.hovered]) || this.pointer
      const p = this.toCanvas(at)
      ctx.strokeStyle = EGGSHELL
      ctx.lineWidth = 2
      ctx.beginPath()
      ctx.moveTo(p.x - 7, p.y - 7)
      ctx.lineTo(p.x + 7, p.y + 7)
      ctx.moveTo(p.x + 7, p.y - 7)
      ctx.lineTo(p.x - 7, p.y + 7)
      ctx.stroke()
      if (this.hovered === null) {
        ctx.fillStyle = EGGSHELL
        ctx.fillText(this.placeOf(at), p.x, p.y - 12)
      }
    }

    this.count.textContent = copy('map.visited', {
      count: log.visited.length,
      total: this.citgos.length,
    })
    this.pinCount.textContent = copy('map.pins', {
      count: marks.length,
      max: WAYPOINT_MAX,
    })
    const last = log.last === null ? null : this.citgos[log.last]
    this.last.textContent = last
      ? copy('map.last', { citgo: last.label })
      : copy('map.none')
    this.hint.textContent = this.charter
      ? copy('map.hint_charter')
      : travel === 'aboard'
        ? copy('map.hint_aboard')
        : travel === 'below'
          ? copy('map.hint_below')
          : travel
            ? copy('map.hint')
            : copy('map.hint_away')
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

// What the map calls a portal phone: by the Citgo it stands at, named by
// `citgo`, or the castle's or the drive-in's.
export function phoneLabel(
  phone: Pick<PortalPhone, 'site' | 'station'>,
  citgo: (station: number) => string
): string {
  if (phone.site === 'castle') return copy('map.phone_castle')
  if (phone.site === 'drive-in') return copy('map.phone_drive_in')
  return copy('map.phone_citgo', { citgo: citgo(phone.station ?? -1) })
}

// Every Citgo's name, indexed like world.fuelPoints, straight from the
// survey: the same names the map gives, for Bull Valley Dial-Up, which
// builds no world. Each is named from its fuel point, a few metres off its
// pump island, well within roadNameNear's reach.
export function citgoNames(
  geo: Pick<Geo, 'fuel' | 'roads' | 'metres'>
): string[] {
  const roads = geo.roads.map((road) => ({
    name: road.n,
    points: road.p.map(([u, v]) => unitToWorld(u, v, geo.metres)),
  }))
  const stations = surveyedStations(geo.fuel).map((f) =>
    unitToWorld(f.p[0], f.p[1], geo.metres)
  )
  return mapCitgos(stations, roads).map((citgo) => citgo.label)
}
