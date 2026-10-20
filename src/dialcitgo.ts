// Bull Valley Dial-Up's Citgo (sharedworld.ts rule 29): the shelves of
// any Citgo the account has stood at, bought off from wherever the raider
// is. The Citgos visited as chips, each named as the map names it (the
// names come once the survey has loaded, citgomap.ts citgoNames), and the
// one picked's shelves, every kind with its price and how many are left,
// unit by unit as the valley keeps them (dialstate.ts shelfOf). A buy
// takes the first unit on the shelf; the valley settles it.

import { copy } from './copy.ts'
import { shelfOf } from './dialstate.ts'
import { el, text } from './dom.ts'
import { itemLabel } from './itemcopy.ts'
import { formatCash } from './store.ts'
import type { DialState } from './dialstate.ts'

export interface CitgoActions {
  buy(station: number, kind: string, unit: number): void
}

// Which Citgo the sheet shows, kept across redraws.
export interface CitgoOpen {
  station: number | null
}

// A Citgo's name: the map's, or its number until the survey has loaded.
function nameOf(names: readonly string[] | null, station: number): string {
  return names?.[station] ?? copy('map.citgo_unnamed', { n: station + 1 })
}

export function renderCitgo(
  root: HTMLElement,
  s: DialState,
  names: readonly string[] | null,
  open: CitgoOpen,
  actions: CitgoActions
): void {
  const visited = s.citgos.visited
  if (visited.length === 0) {
    root.replaceChildren(
      text('p', copy('dialup.citgo.none_visited'), 'bv-dial-note')
    )
    return
  }
  if (open.station === null || !visited.includes(open.station)) {
    open.station = s.citgos.last ?? visited[0]
  }
  const station = open.station
  const chips = el('div', 'bv-dial-chips')
  for (const one of visited) {
    const chip = text('button', nameOf(names, one), 'bv-dial-chip')
    chip.type = 'button'
    chip.dataset.station = String(one)
    chip.setAttribute('aria-pressed', String(one === station))
    chip.addEventListener('click', () => {
      open.station = one
      renderCitgo(root, s, names, open, actions)
    })
    chips.append(chip)
  }
  if (!s.world) {
    root.replaceChildren(
      chips,
      text('p', copy('dialup.citgo.no_world'), 'bv-dial-note')
    )
    return
  }
  const list = el('ul', 'bv-dial-items')
  for (const row of shelfOf(s, station)) {
    const li = el('li', 'bv-dial-item bv-dial-shelf')
    li.dataset.kind = row.kind
    const head = el('div', 'bv-dial-shelf-head')
    head.append(
      text('span', itemLabel(row.kind), 'bv-dial-shelf-name'),
      text('span', formatCash(row.price), 'bv-dial-shelf-price')
    )
    const foot = el('div', 'bv-dial-shelf-foot')
    const left = text(
      'span',
      copy('dialup.citgo.left', { count: row.left }),
      'bv-dial-item-count'
    )
    const short = row.price - s.cash
    const buy = text(
      'button',
      row.unit === null
        ? copy('dialup.citgo.sold_out')
        : short > 0
          ? copy('dialup.citgo.short', { amount: formatCash(short) })
          : copy('dialup.citgo.buy'),
      'bv-dial-btn'
    )
    buy.type = 'button'
    buy.disabled = row.unit === null || short > 0 || s.pending.buy !== null
    const unit = row.unit
    if (unit !== null) {
      buy.addEventListener('click', () => actions.buy(station, row.kind, unit))
    }
    foot.append(left, buy)
    li.append(head, foot)
    list.append(li)
  }
  root.replaceChildren(
    chips,
    text('p', formatCash(s.cash), 'bv-dial-citgo-cash'),
    list
  )
}
