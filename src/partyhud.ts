// Every other raider's geometrie as seen, under our own bar in the upper
// left, the way Elden Ring lists the co-op party: each name small over a
// thin bar as long as their whole, a pale trail of what a touch took
// draining after it. The nearest few placed in the valley (peers.ts
// party); hidden with no one about. hud.ts builds it into the vitals
// column; loop.ts hands it the party every frame, and it touches the page
// only when a row's geometrie or the order changes.

import { copy } from './copy.ts'
import { el } from './dom.ts'
import { BASE_GEOMETRIE } from './health.ts'
import type { PartyMember } from './peers.ts'

// A bar's length: `base` rem at level 1's whole, `perPoint` rem more for
// every point past it, as our own bar grows but shorter.
const BAR = { base: 9, perPoint: 0.0045 }

interface Row {
  li: HTMLLIElement
  name: HTMLSpanElement
  fill: HTMLDivElement
  lost: HTMLDivElement
  bar: HTMLDivElement
  view: string
  health: number
}

export class PartyHud {
  readonly root: HTMLOListElement
  private readonly rows = new Map<string, Row>()
  private order = ''

  constructor(parent: HTMLElement) {
    this.root = el('ol', 'bv-party')
    this.root.hidden = true
    parent.append(this.root)
  }

  set(members: readonly PartyMember[]): void {
    const ids = members.map((m) => m.id)
    for (const [id, row] of this.rows) {
      if (ids.includes(id)) continue
      row.li.remove()
      this.rows.delete(id)
    }
    for (const member of members) this.draw(this.rowOf(member.id), member)
    const order = ids.join(' ')
    if (order !== this.order) {
      this.order = order
      this.root.replaceChildren(...ids.map((id) => this.rows.get(id)!.li))
    }
    this.root.hidden = members.length === 0
  }

  private rowOf(id: string): Row {
    const known = this.rows.get(id)
    if (known) return known
    const li = el('li', 'bv-party-member')
    li.dataset.peer = id
    const name = el('span', 'bv-party-name')
    const bar = el('div', 'bv-party-bar')
    bar.setAttribute('role', 'img')
    const lost = el('div', 'bv-vitals-lost')
    const fill = el('div', 'bv-vitals-fill')
    bar.append(lost, fill)
    li.append(name, bar)
    const row: Row = { li, name, fill, lost, bar, view: '', health: -1 }
    this.rows.set(id, row)
    return row
  }

  private draw(row: Row, { name, health, max }: PartyMember): void {
    const view = `${name}:${health}/${max}`
    if (view === row.view) return
    row.view = view
    const whole = Math.max(1, max)
    const share = Math.max(0, Math.min(1, health / whole))
    const length = BAR.base + Math.max(0, max - BASE_GEOMETRIE) * BAR.perPoint
    row.li.style.setProperty('--bv-party-length', `${length}rem`)
    row.name.textContent = name
    // Lost: the trail holds, then drains; given back, the fill and the
    // trail climb together over a beat.
    row.lost.classList.toggle(
      'bv-vitals-lost--drain',
      row.health >= 0 && health < row.health
    )
    row.bar.classList.toggle(
      'bv-vitals-rise',
      row.health >= 0 && health > row.health
    )
    row.health = health
    row.fill.style.width = `${share * 100}%`
    row.lost.style.width = `${share * 100}%`
    row.li.dataset.health = String(health)
    row.li.dataset.max = String(max)
    row.bar.setAttribute(
      'aria-label',
      copy('hud.party_label', { name, health, max })
    )
  }
}
