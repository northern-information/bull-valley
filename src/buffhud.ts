// The buffs as seen: a row of small cells over the hotbar, its left edge
// on the hotbar's (or, with nothing on the bar, where the bar would be),
// each cell the buff's mark (icons.ts) under a dark wedge that grows
// clockwise as it winds down, and the time left under it. buffbar.ts says
// what is going; loop.ts feeds it every frame.

import { buffTime } from './buffbar.ts'
import { copy } from './copy.ts'
import { el } from './dom.ts'
import { iconSvg } from './icons.ts'
import type { Buff, BuffId } from './buffbar.ts'

// Each buff's name and what it does, for its title and its label.
function nameOf(id: BuffId): string {
  switch (id) {
    case 'high':
      return copy('buffs.high')
    case 'stimulated':
      return copy('buffs.stimulated')
    case 'drunk':
      return copy('buffs.drunk')
    case 'perception':
      return copy('buffs.perception')
  }
}

interface Cell {
  li: HTMLLIElement
  time: HTMLElement
  view: string
}

export class BuffHud {
  readonly row: HTMLOListElement
  private key = ''
  private cells: Cell[] = []

  constructor(parent: HTMLElement) {
    this.row = el('ol', 'bv-buffs')
    this.row.setAttribute('aria-label', copy('buffs.label'))
    this.row.hidden = true
    parent.prepend(this.row)
  }

  // The cells are rebuilt only when which buffs are going changes; each
  // wedge and time only when it moves.
  set(buffs: readonly Buff[]): void {
    const key = buffs.map(({ id }) => id).join(',')
    if (key !== this.key) {
      this.key = key
      this.cells = buffs.map(({ id }) => this.cell(id))
      this.row.replaceChildren(...this.cells.map(({ li }) => li))
      this.row.hidden = buffs.length < 1
    }
    buffs.forEach(({ id, fraction, seconds }, i) => {
      const cell = this.cells[i]
      const time = buffTime(seconds)
      const view = `${fraction.toFixed(3)}:${time}`
      if (view === cell.view) return
      cell.view = view
      // The wedge covers what has run out.
      cell.li.style.setProperty('--spent', (1 - fraction).toFixed(3))
      cell.time.textContent = time
      cell.li.setAttribute(
        'aria-label',
        copy('buffs.cell', { buff: nameOf(id), time })
      )
    })
  }

  private cell(id: BuffId): Cell {
    const li = el('li', 'bv-buff')
    li.dataset.buff = id
    li.title = nameOf(id)
    const mark = el('span', 'bv-buff-mark')
    mark.innerHTML = iconSvg(id)
    const time = el('span', 'bv-buff-time')
    li.append(mark, time)
    return { li, time, view: '' }
  }
}
