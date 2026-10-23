// What both apps say of the Recycling Center (recycling.ts, sharedworld.ts
// rule 33): each research line's name and what it does, the log line for
// a level bought or loose change found, and the line for a refusal. Pure
// but for the copy book; no three.js, no DOM.

import { copy } from './copy.ts'
import { DIME_CENTS } from './drops.ts'
import { formatCash } from './store.ts'
import type { ResearchMessage } from './protocol.ts'
import type { ResearchLine } from './recycling.ts'

const NAMES: Record<ResearchLine, () => string> = {
  dimes: () => copy('recycling.line_dimes'),
}

const BLURBS: Record<ResearchLine, () => string> = {
  dimes: () => copy('recycling.line_dimes_blurb'),
}

export function lineName(line: ResearchLine): string {
  return NAMES[line]()
}

export function lineBlurb(line: ResearchLine): string {
  return BLURBS[line]()
}

// What the log says of research as the valley wrote it: the level just
// bought, or nothing for research only read.
export function researchNews(
  msg: Pick<ResearchMessage, 'research' | 'line'>
): string | null {
  if (!msg.line) return null
  return copy('log.researched', {
    line: lineName(msg.line),
    level: msg.research[msg.line],
  })
}

// Loose change found over a burst's dimes.
export function foundLine(dimes: number): string {
  return copy('log.found_dimes', {
    count: dimes,
    amount: formatCash(dimes * DIME_CENTS),
  })
}

// Why the valley would not take the empties.
export function recycleRefusal(reason: string): string {
  switch (reason) {
    case 'no-wreck':
    case 'aboard':
      return copy('log.recycle_far')
    case 'short':
      return copy('log.recycle_short')
    case 'not-in-valley':
      return copy('log.recycle_offline')
    default:
      return copy('log.recycle_refused')
  }
}
