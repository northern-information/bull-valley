// The Recycling Center (#127), pure: what using an item leaves behind in
// the pack, and the research every account buys with it. A drink leaves
// its can or its bottle; the last cigarette out of a pack leaves the pack
// (sharedworld.ts rule 32). Fed into the recycling machine on any Citgo's
// lot, the empties buy levels on research lines (rule 33), each the
// account's own: nothing here touches the shared world, the shadows or the
// flashlight. The first line
// is loose change: a chance that a burst shadow's dimes come with as many
// again, into the taker's wallet alone. Levels live in D1 beside the
// wallet. No three.js, no DOM.

import { CONFIG } from './config.ts'
import { isCan } from './drinks.ts'
import { contentsOf, itemById } from './items.ts'
import type { Inventory, XZ } from './interfaces.ts'
import type { ItemId } from './items.ts'

// The empty one use of `kind` leaves, with `left` units of it still in the
// pack after the use; null when it leaves nothing.
export function emptyOf(kind: string, left: number): ItemId | null {
  const item = itemById(kind)
  if (!item) return null
  switch (item.category) {
    case 'drink':
      return isCan(item.container) ? 'empty-can' : 'empty-bottle'
    case 'cigarette':
      return left >= 0 && left % contentsOf(kind) === 0 ? 'empty-pack' : null
    default:
      return null
  }
}

// --- Research --------------------------------------------------------------

export const RESEARCH_LINES = ['dimes'] as const
export type ResearchLine = (typeof RESEARCH_LINES)[number]

// One account's research: the level reached on each line, 0 before any.
export type Research = Record<ResearchLine, number>

export const FRESH_RESEARCH: Research = { dimes: 0 }

export function isResearchLine(value: unknown): value is ResearchLine {
  return (RESEARCH_LINES as readonly unknown[]).includes(value)
}

// Every line's level, each a whole number from 0 up; anything else in
// `raw` is dropped.
export function toResearch(raw: unknown): Research {
  const source = (raw && typeof raw === 'object' ? raw : {}) as Record<
    string,
    unknown
  >
  const research = { ...FRESH_RESEARCH }
  for (const line of RESEARCH_LINES) {
    const n = Math.floor(Number(source[line]))
    research[line] = Number.isSafeInteger(n) ? Math.max(n, 0) : 0
  }
  return research
}

interface ResearchStep {
  chance: number
  price: Inventory
}

// Level `level` (1 on) of `line`: what it does and what it costs. The
// config lists the first few; past its last, every level more closes
// CONFIG.recycling.beyond's share of what the chance still lacks of
// certain and costs its factor more empties than the one before.
function stepOf(line: ResearchLine, level: number, cfg = CONFIG): ResearchStep {
  const listed = cfg.recycling.lines[line]
  if (level <= listed.length) return listed[Math.max(level, 1) - 1]
  const last = listed[listed.length - 1]
  const { closes, price } = cfg.recycling.beyond[line]
  const past = level - listed.length
  const costs: Inventory = {}
  for (const [kind, n] of Object.entries(last.price)) {
    costs[kind] = Math.ceil(n * price ** past)
  }
  return {
    chance: 1 - (1 - last.chance) * (1 - closes) ** past,
    price: costs,
  }
}

// What the next level on `line` costs in empties. There is always a next.
export function priceOf(
  research: Research,
  line: ResearchLine,
  cfg = CONFIG
): Inventory {
  return { ...stepOf(line, research[line] + 1, cfg).price }
}

// Whether `pack` holds every empty `price` asks for.
export function affordsResearch(pack: Inventory, price: Inventory): boolean {
  return Object.entries(price).every(([kind, n]) => (pack[kind] || 0) >= n)
}

// The chance a burst's dimes come with as many again, at `research`.
export function dimesChance(research: Research, cfg = CONFIG): number {
  const level = research.dimes
  return level > 0 ? stepOf('dimes', level, cfg).chance : 0
}

// The dimes over and above the `taken` a burst left, found with the
// valley's `roll` (0 to 1): as many again when the roll falls under the
// chance, none otherwise.
export function extraDimes(
  research: Research,
  taken: number,
  roll: number,
  cfg = CONFIG
): number {
  return taken > 0 && roll < dimesChance(research, cfg) ? taken : 0
}

// Whether a raider whose last state frame put them `at` is beside one of
// the Citgos' recycling machines, for the valley to take their empties.
export function atRecycler(
  at: XZ | null,
  recyclers: readonly XZ[],
  cfg = CONFIG
): boolean {
  if (!at) return false
  return recyclers.some(
    (r) => Math.hypot(at.x - r.x, at.z - r.z) <= cfg.recycling.tendReach
  )
}
