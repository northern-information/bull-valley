// An item's stats as both apps show them (itemstats.ts): a table of a
// label and a value a row, and under it a line for each ward it moves, in
// that ward's colour, with what the ward wards against. The 3D valley's
// pack card (packhud.ts) and Dial-Up's pack (dialpack.ts) both lay it out;
// styles.css .bv-item-stats styles it for both. No three.js.

import { copy } from './copy.ts'
import { el, text } from './dom.ts'
import { doseText, itemStats, spanOf } from './itemstats.ts'
import { formatCash } from './store.ts'
import { wardAgainst, wardLine, wardName } from './vitalshud.ts'
import type { ItemCategory } from './items.ts'
import type { ItemStat } from './itemstats.ts'

// What kind of thing an item is, as its stats name it.
function categoryName(category: ItemCategory): string {
  switch (category) {
    case 'cigarette':
      return copy('stats.cigarette')
    case 'joint':
      return copy('stats.joint')
    case 'psychedelic':
      return copy('stats.psychedelic')
    case 'stimulant':
      return copy('stats.stimulant')
    case 'drink':
      return copy('stats.drink')
    case 'medicine':
      return copy('stats.medicine')
    case 'forage':
      return copy('stats.forage')
    case 'valuable':
      return copy('stats.valuable')
    case 'key-item':
      return copy('stats.key_item')
  }
}

// One stat of the table as its label and value; a ward's goes in the
// lines under it instead.
function statRow(stat: ItemStat): [string, string] | null {
  switch (stat.stat) {
    case 'category':
      return [copy('stats.kind'), categoryName(stat.category)]
    case 'heals':
      return [copy('stats.heals'), copy('stats.heals_value', { pct: stat.pct })]
    case 'lasts':
      return [
        copy(
          stat.lasting === 'smoke'
            ? 'stats.smokes'
            : stat.lasting === 'perception'
              ? 'stats.perception'
              : 'stats.trails'
        ),
        spanOf(stat.seconds),
      ]
    case 'contents':
      return [
        copy('stats.contents'),
        copy('stats.contents_value', { count: stat.count }),
      ]
    case 'price':
      return [copy('stats.price'), formatCash(stat.cents)]
    case 'ward':
      return null
  }
}

// A ward's line: what a dose wards against, or that it brings the ward
// down. copy() throws on a value its line has no place for, so each line
// gets only its own.
export function wardWords(stat: Extract<ItemStat, { stat: 'ward' }>): string {
  const ward = wardName(stat.axis)
  const dose = doseText(stat.dose)
  return stat.dose > 0
    ? copy('wards.card_dose', { ward, dose, against: wardAgainst(stat.axis) })
    : copy('wards.card_lower', { ward, dose })
}

// The table's rows (dt, dd) and the wards' lines for `kind`.
export function statsOf(kind: string): {
  rows: HTMLElement[]
  wards: HTMLElement[]
} {
  const stats = itemStats(kind)
  return {
    rows: stats.flatMap((stat) => {
      const row = statRow(stat)
      return row ? [text('dt', row[0]), text('dd', row[1])] : []
    }),
    wards: stats.flatMap((stat) =>
      stat.stat === 'ward'
        ? [wardLine('bv-ward-line', stat.axis, wardWords(stat))]
        : []
    ),
  }
}

// The table and the wards' lines, built fresh for `kind`.
export function statsView(kind: string): HTMLElement[] {
  const { rows, wards } = statsOf(kind)
  const table = el('dl', 'bv-item-stats')
  table.append(...rows)
  const lines = el('div', 'bv-item-wards')
  lines.append(...wards)
  return [table, lines]
}
