// Geometrie and the wards as seen, in the upper left: the wards'
// tetrahedron turning (wards.ts tetraView), each corner lit by its level
// and carrying its mark (icons.ts); beside it the geometrie bar, as long as
// the raider's whole is (health.ts maxGeometrie: it grows with the level),
// a pale trail of what a touch just took draining after it, the points on
// it and the level over it; under the bar the last touch's number, with
// what the wards took off it, and a chip for every ward going. hud.ts
// builds it and delegates; loop.ts turns it every frame.

import { CONFIG } from './config.ts'
import { copy } from './copy.ts'
import { el } from './dom.ts'
import { BASE_GEOMETRIE } from './health.ts'
import { ICON_SHAPES, iconSvg } from './icons.ts'
import { AXES } from './wardlevels.ts'
import { tetraView } from './wards.ts'
import type { WardAxis } from './interfaces.ts'

const SVG = 'http://www.w3.org/2000/svg'

// Touches this close together add up into one number, as Dark Souls
// counts a combo.
const POP_SUM_MS = 2000
// The number stays this long after the last touch before it fades.
const POP_HOLD_MS = 2600

// The bar's length: `base` rem at level 1's whole, `perPoint` rem more
// for every point past it (the rest is capped in styles.css).
const BAR = { base: 16, perPoint: 0.008 }

function svg<K extends keyof SVGElementTagNameMap>(
  tag: K,
  attrs: Record<string, string> = {}
): SVGElementTagNameMap[K] {
  const node = document.createElementNS(SVG, tag)
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, v)
  return node
}

// Groups of three digits, the way the bar prints its big numbers.
export function grouped(n: number): string {
  return Math.round(n)
    .toString()
    .replace(/\B(?=(\d{3})+(?!\d))/g, ',')
}

// A ward's name, and the shadows it wards against, as the Book of Shadows
// and the item card say them.
export function wardName(axis: WardAxis): string {
  switch (axis) {
    case 'high':
      return copy('wards.high')
    case 'stimulated':
      return copy('wards.stimulated')
    case 'drunk':
      return copy('wards.drunk')
    case 'tripping':
      return copy('wards.tripping')
  }
}

export function wardAgainst(axis: WardAxis): string {
  switch (axis) {
    case 'high':
      return copy('wards.high_against')
    case 'stimulated':
      return copy('wards.stimulated_against')
    case 'drunk':
      return copy('wards.drunk_against')
    case 'tripping':
      return copy('wards.tripping_against')
  }
}

// A line naming `axis` in its colour, its mark before it.
export function wardLine(
  className: string,
  axis: WardAxis,
  words: string
): HTMLElement {
  const line = el('p', className)
  line.dataset.ward = axis
  const mark = el('span', 'bv-ward-mark')
  mark.innerHTML = iconSvg(axis)
  line.append(mark, el('span', '', words))
  return line
}

interface Pop {
  damage: number
  warded: number
  ward: WardAxis
  at: number
}

export class VitalsHud {
  readonly root: HTMLDivElement
  private readonly tetra: SVGSVGElement
  private readonly hull: SVGPolygonElement
  private readonly glows = new Map<WardAxis, SVGPolygonElement>()
  private readonly gradients = new Map<WardAxis, SVGRadialGradientElement>()
  private readonly edges: SVGLineElement[] = []
  private readonly marks = new Map<WardAxis, SVGGElement>()
  private readonly bar: HTMLDivElement
  private readonly fill: HTMLDivElement
  private readonly lost: HTMLDivElement
  private readonly ticks: HTMLDivElement
  private readonly value: HTMLSpanElement
  private readonly levelTag: HTMLSpanElement
  private readonly pop: HTMLDivElement
  private readonly popDamage: HTMLSpanElement
  private readonly popWarded: HTMLSpanElement
  private readonly chips = new Map<
    WardAxis,
    { li: HTMLLIElement; text: HTMLSpanElement }
  >()
  private wardsView = ''
  private healthView = ''
  private levelView = -1
  private turnView = NaN
  private points = BASE_GEOMETRIE
  private last: Pop | null = null

  constructor(parent: HTMLElement) {
    this.root = el('div', 'bv-vitals')

    // The tetrahedron: a dim face, a glow per corner over it, the edges,
    // and the marks.
    this.tetra = svg('svg', { viewBox: '0 0 100 100', 'aria-hidden': 'true' })
    this.tetra.classList.add('bv-vitals-tetra')
    const defs = svg('defs')
    this.hull = svg('polygon', { class: 'bv-geo-face' })
    this.tetra.append(defs, this.hull)
    for (const axis of AXES) {
      const gradient = svg('radialGradient', {
        id: `bv-geo-${axis}`,
        gradientUnits: 'userSpaceOnUse',
        r: '58',
      })
      gradient.append(
        svg('stop', { offset: '0', class: 'bv-geo-hot' }),
        svg('stop', { offset: '0.25', class: 'bv-geo-lit' }),
        svg('stop', {
          offset: '1',
          class: 'bv-geo-lit',
          'stop-opacity': '0',
        })
      )
      defs.append(gradient)
      this.gradients.set(axis, gradient)
      const glow = svg('polygon', {
        class: 'bv-geo-glow',
        'data-axis': axis,
        fill: `url(#bv-geo-${axis})`,
      })
      this.glows.set(axis, glow)
      this.tetra.append(glow)
    }
    for (let i = 0; i < 6; i++) {
      const edge = svg('line', { class: 'bv-geo-edge' })
      this.edges.push(edge)
      this.tetra.append(edge)
    }
    for (const axis of AXES) {
      const mark = svg('g', { class: 'bv-geo-mark', 'data-mark': axis })
      mark.innerHTML = ICON_SHAPES[axis]
      this.marks.set(axis, mark)
      this.tetra.append(mark)
    }

    // The bar, its title and level over it.
    const column = el('div', 'bv-vitals-column')
    const head = el('div', 'bv-vitals-head')
    const title = el('span', 'bv-vitals-title', copy('hud.health_title'))
    this.levelTag = el('span', 'bv-vitals-level')
    head.append(title, this.levelTag)
    this.bar = el('div', 'bv-vitals-bar')
    this.bar.setAttribute('role', 'img')
    this.lost = el('div', 'bv-vitals-lost')
    this.fill = el('div', 'bv-vitals-fill')
    this.ticks = el('div', 'bv-vitals-ticks')
    this.value = el('span', 'bv-vitals-value')
    this.bar.append(this.lost, this.fill, this.ticks, this.value)

    // The last touch's number, and the wards going.
    this.pop = el('div', 'bv-vitals-pop')
    this.pop.setAttribute('aria-live', 'polite')
    this.popDamage = el('span', 'bv-vitals-damage')
    this.popWarded = el('span', 'bv-vitals-warded')
    this.pop.append(this.popDamage, this.popWarded)
    const chips = el('ol', 'bv-vitals-wards')
    for (const axis of AXES) {
      const li = el('li', 'bv-vitals-ward')
      li.dataset.ward = axis
      li.title = copy(`buffs.${axis}`)
      li.hidden = true
      const mark = el('span', 'bv-vitals-ward-mark')
      mark.innerHTML = iconSvg(axis)
      const text = el('span', 'bv-vitals-ward-level')
      li.append(mark, text)
      chips.append(li)
      this.chips.set(axis, { li, text })
    }
    column.append(head, this.bar, this.pop, chips)

    this.root.append(this.tetra, column)
    parent.append(this.root)
    this.setHealth(BASE_GEOMETRIE, BASE_GEOMETRIE)
    this.setLevel(1)
    this.turn(0)
  }

  // The tetrahedron turned to `time` (game seconds): touched only when it
  // has turned far enough to move a corner.
  turn(time: number): void {
    const turn =
      ((time / CONFIG.wards.turnSeconds) * 2 * Math.PI) % (2 * Math.PI)
    if (Math.abs(turn - this.turnView) < 0.004) return
    this.turnView = turn
    const view = tetraView(turn)
    const hull = view.hull.map(({ x, y }) => `${x},${y}`).join(' ')
    this.hull.setAttribute('points', hull)
    for (const axis of AXES) {
      const { x, y, depth } = view.corners[axis]
      const gradient = this.gradients.get(axis)!
      gradient.setAttribute('cx', String(x))
      gradient.setAttribute('cy', String(y))
      this.glows.get(axis)!.setAttribute('points', hull)
      // The nearer a corner, the larger its mark.
      const size = 17 + depth * 4
      const mark = this.marks.get(axis)!
      mark.setAttribute(
        'transform',
        `translate(${x - size / 2} ${y - size / 2}) scale(${size / 24})`
      )
    }
    view.edges.forEach(({ a, b, front }, i) => {
      const edge = this.edges[i]
      const from = view.corners[a]
      const to = view.corners[b]
      edge.setAttribute('x1', String(from.x))
      edge.setAttribute('y1', String(from.y))
      edge.setAttribute('x2', String(to.x))
      edge.setAttribute('y2', String(to.y))
      edge.classList.toggle('bv-geo-edge--back', !front)
    })
    // The marks nearest the viewer drawn last, over the rest.
    const order = [...AXES].sort(
      (a, b) => view.corners[a].depth - view.corners[b].depth
    )
    for (const axis of order) this.tetra.append(this.marks.get(axis)!)
  }

  // The wards' levels: each corner's glow and mark, and its chip. Touched
  // only when a level moves by a percent.
  setWards(levels: Record<WardAxis, number>): void {
    const percent = (axis: WardAxis) =>
      Math.round(Math.max(0, Math.min(1, levels[axis] || 0)) * 100)
    const view = AXES.map(percent).join(':')
    if (view === this.wardsView) return
    this.wardsView = view
    for (const axis of AXES) {
      const p = percent(axis)
      this.glows.get(axis)!.style.opacity = String(p / 100)
      // Each mark reads dim until its corner lights.
      this.marks.get(axis)!.style.opacity = String(0.45 + (0.55 * p) / 100)
      const chip = this.chips.get(axis)!
      chip.li.hidden = p < 1
      chip.li.style.setProperty('--ward', String(p / 100))
      chip.text.textContent = copy('hud.ward_chip', { percent: p })
    }
    this.tetra.setAttribute(
      'aria-label',
      copy('hud.wards_label', {
        high: percent('high'),
        stimulated: percent('stimulated'),
        drunk: percent('drunk'),
        tripping: percent('tripping'),
      })
    )
  }

  // The bar at `points` of `max`: as long as `max` is, filled to `points`,
  // the trail of what was lost draining after it.
  setHealth(points: number, max: number): void {
    const view = `${points}/${max}`
    if (view === this.healthView) return
    this.healthView = view
    const whole = Math.max(1, max)
    const share = Math.max(0, Math.min(1, points / whole))
    const length = BAR.base + Math.max(0, max - BASE_GEOMETRIE) * BAR.perPoint
    this.root.style.setProperty('--bv-vitals-length', `${length}rem`)
    // Lost: the trail holds where it was, then drains (styles.css). Given
    // back: it follows at once.
    this.lost.classList.toggle('bv-vitals-lost--drain', points < this.points)
    this.points = points
    this.fill.style.width = `${share * 100}%`
    this.lost.style.width = `${share * 100}%`
    // A tick at every thousand.
    const ticks = Math.max(0, Math.ceil(whole / 1000) - 1)
    if (this.ticks.childElementCount !== ticks) {
      this.ticks.replaceChildren(
        ...Array.from({ length: ticks }, (_, i) => {
          const tick = el('span', 'bv-vitals-tick')
          tick.style.left = `${(((i + 1) * 1000) / whole) * 100}%`
          return tick
        })
      )
    } else {
      ;[...this.ticks.children].forEach((tick, i) => {
        ;(tick as HTMLElement).style.left =
          `${(((i + 1) * 1000) / whole) * 100}%`
      })
    }
    this.value.textContent = copy('hud.health_value', {
      health: grouped(points),
      max: grouped(max),
    })
    this.root.dataset.health = String(points)
    this.root.dataset.max = String(max)
    this.bar.setAttribute(
      'aria-label',
      copy('hud.health_label', { health: points, max })
    )
  }

  setLevel(level: number): void {
    if (level === this.levelView) return
    this.levelView = level
    this.levelTag.textContent = copy('hud.level_tag', { level })
  }

  // A touch: its number under the bar, and what `ward` took off it, added
  // to the last if it came close behind; it fades a while after.
  hit(damage: number, warded: number, ward: WardAxis, now: number): void {
    const last = this.last
    const pop: Pop =
      last && now - last.at < POP_SUM_MS
        ? {
            damage: last.damage + damage,
            warded: last.warded + warded,
            ward: warded > 0 ? ward : last.ward,
            at: now,
          }
        : { damage, warded, ward, at: now }
    this.last = pop
    this.popDamage.textContent = copy('hud.damage', {
      damage: grouped(pop.damage),
    })
    this.popWarded.hidden = pop.warded <= 0
    this.popWarded.dataset.ward = pop.ward
    this.popWarded.innerHTML = ''
    this.popWarded.append(
      el('span', 'bv-vitals-warded-mark'),
      el('span', '', copy('hud.warded', { warded: grouped(pop.warded) }))
    )
    ;(this.popWarded.firstChild as HTMLElement).innerHTML = iconSvg(pop.ward)
    this.pop.classList.remove('bv-vitals-pop--on')
    // Read layout so the animation starts over.
    void this.pop.offsetWidth
    this.pop.style.setProperty('--bv-pop-hold', `${POP_HOLD_MS}ms`)
    this.pop.classList.add('bv-vitals-pop--on')
  }
}
