// Bull Valley Dial-Up's Citgo (sharedworld.ts rule 29): the Citgos the
// account has stood at, each named as the map names it (the names come
// once the survey has loaded, citgomap.ts citgoNames), the last one stood
// at first. Each opens that Citgo's shelves in the trade window
// (shopdialog.ts), bought off from wherever the raider is.

import { copy } from './copy.ts'
import { el, text } from './dom.ts'
import type { DialState } from './dialstate.ts'

export interface CitgoActions {
  // Opens station `station`'s shelves, named `name`.
  open(station: number, name: string): void
}

// A Citgo's name: the map's, or its number until the survey has loaded.
export function nameOf(
  names: readonly string[] | null,
  station: number
): string {
  return names?.[station] ?? copy('map.citgo_unnamed', { n: station + 1 })
}

export function renderCitgo(
  root: HTMLElement,
  s: DialState,
  names: readonly string[] | null,
  actions: CitgoActions
): void {
  const visited = s.citgos.visited
  if (visited.length === 0) {
    root.replaceChildren(
      text('p', copy('dialup.citgo.none_visited'), 'bv-dial-note')
    )
    return
  }
  if (!s.world) {
    root.replaceChildren(
      text('p', copy('dialup.citgo.no_world'), 'bv-dial-note')
    )
    return
  }
  const last = s.citgos.last
  const order =
    last !== null && visited.includes(last)
      ? [last, ...visited.filter((one) => one !== last)]
      : visited
  const list = el('div', 'bv-dial-citgos')
  for (const station of order) {
    const name = nameOf(names, station)
    const button = text('button', name, 'bv-dial-btn bv-dial-citgo')
    button.type = 'button'
    button.dataset.station = String(station)
    button.addEventListener('click', () => actions.open(station, name))
    list.append(button)
  }
  root.replaceChildren(list)
}
