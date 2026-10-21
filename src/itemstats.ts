// Pure: an item's stats, as its card in the pack shows them (packhud.ts),
// a small page of the Book of Shadows beside the item spinning: what kind
// of thing it is, what it gives back, how far it moves each ward, how long
// it works on you, how many come in one, and its shelf price. Read off the
// items.ts table, so a change there shows on the card. The words are the
// card's (COPY.toml [stats]). No three.js, no DOM.

import { contentsOf, doseOf, itemById } from './items.ts'
import { AXES } from './wardlevels.ts'
import type { WardAxis } from './interfaces.ts'
import type { ItemCategory } from './items.ts'

// How long an item works: a cigarette while it smokes, the joint and the
// psychedelics their perception. What a drink or the stimulant does to
// the view follows its ward as it fades (wardview.ts), so it has no span
// of its own to show.
export type Lasting = 'smoke' | 'perception'

export type ItemStat =
  | { stat: 'category'; category: ItemCategory }
  // The share of whole geometrie one use gives back, in percent.
  | { stat: 'heals'; pct: number }
  // How far one use moves the ward, 0 to 1 (negative brings it down).
  | { stat: 'ward'; axis: WardAxis; dose: number }
  | { stat: 'lasts'; lasting: Lasting; seconds: number }
  // How many one pack, bottle or box holds, when more than one.
  | { stat: 'contents'; count: number }
  // The shelf price at every Citgo, in cents.
  | { stat: 'price'; cents: number }

// Every stat `kind` has, in the card's order; none for a kind the table
// lacks.
export function itemStats(kind: string): ItemStat[] {
  const item = itemById(kind)
  if (!item) return []
  const stats: ItemStat[] = [{ stat: 'category', category: item.category }]
  if ('healsPct' in item && item.healsPct) {
    stats.push({ stat: 'heals', pct: item.healsPct })
  }
  const dose = doseOf(kind) ?? {}
  for (const axis of AXES) {
    const amount = dose[axis]
    if (amount) stats.push({ stat: 'ward', axis, dose: amount })
  }
  switch (item.category) {
    case 'cigarette':
      stats.push({
        stat: 'lasts',
        lasting: 'smoke',
        seconds: item.smokeSeconds,
      })
      break
    case 'joint':
    case 'psychedelic':
      stats.push({
        stat: 'lasts',
        lasting: 'perception',
        seconds: item.perceptionSeconds,
      })
      break
    default:
      break
  }
  const count = contentsOf(kind)
  if (count > 1) stats.push({ stat: 'contents', count })
  if (item.price !== undefined) stats.push({ stat: 'price', cents: item.price })
  return stats
}

// A span as the card prints it: "45s", "2m", "2m 30s".
export function spanOf(seconds: number): string {
  const whole = Math.max(0, Math.round(seconds))
  const m = Math.floor(whole / 60)
  const s = whole % 60
  if (m === 0) return `${s}s`
  return s === 0 ? `${m}m` : `${m}m ${s}s`
}

// A dose as the card prints it: a signed whole percent of the ward.
export function doseText(dose: number): string {
  const pct = Math.round(dose * 100)
  return `${pct < 0 ? '−' : '+'}${Math.abs(pct)}%`
}
