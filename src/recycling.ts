// The Recycling Center at the wreck (#127), pure: what using an item leaves
// behind in the pack, and the research every account buys with it. A drink
// leaves its can or its bottle; the last cigarette out of a pack leaves the
// pack (sharedworld.ts rule 32). Fed in at the wreck, the empties buy
// levels on research lines (rule 33), each the account's own: nothing here
// touches the shared world, the shadows or the flashlight. The first line
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

// Every line's level, each a whole number from 0 to its top; anything
// else in `raw` is dropped.
export function toResearch(raw: unknown, cfg = CONFIG): Research {
  const source = (raw && typeof raw === 'object' ? raw : {}) as Record<
    string,
    unknown
  >
  const research = { ...FRESH_RESEARCH }
  for (const line of RESEARCH_LINES) {
    const n = Math.floor(Number(source[line]))
    research[line] = Number.isFinite(n)
      ? Math.min(Math.max(n, 0), topLevel(line, cfg))
      : 0
  }
  return research
}

// The highest level `line` goes to.
export function topLevel(line: ResearchLine, cfg = CONFIG): number {
  return cfg.recycling.lines[line].length
}

// What the next level on `line` costs in empties, or null at the top.
export function priceOf(
  research: Research,
  line: ResearchLine,
  cfg = CONFIG
): Inventory | null {
  const next = cfg.recycling.lines[line][research[line]]
  return next ? { ...next.price } : null
}

// Whether `pack` holds every empty `price` asks for.
export function affordsResearch(pack: Inventory, price: Inventory): boolean {
  return Object.entries(price).every(([kind, n]) => (pack[kind] || 0) >= n)
}

// The chance a burst's dimes come with as many again, at `research`.
export function dimesChance(research: Research, cfg = CONFIG): number {
  const level = research.dimes
  return level > 0 ? cfg.recycling.lines.dimes[level - 1].chance : 0
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

// Whether a raider whose last state frame put them `at` is beside the
// wreck, for the valley to take their empties.
export function atWreck(
  at: XZ | null,
  wreck: XZ | null,
  cfg = CONFIG
): boolean {
  if (!at || !wreck) return false
  return Math.hypot(at.x - wreck.x, at.z - wreck.z) <= cfg.recycling.tendReach
}
