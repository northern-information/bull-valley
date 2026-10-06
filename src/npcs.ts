// Pure: what Matthew Marx, David Carlsten and Moab Coldë say. Walk up to
// one and he glows; E has him say his next line into the player's own chat
// log, and he starts over after the last. interactions.ts decides who is
// in reach. Gron is not here: his dialog is grondialog.ts.

import { CONFIG } from './config.ts'
import { copy } from './copy.ts'
import type { XZ } from './interfaces.ts'

export type NpcId = 'marx' | 'carlsten' | 'moab'

// An NPC standing where E could reach him. A Moab stands at every station,
// so his spot says which one (an index into the stations).
export interface NpcSpot extends XZ {
  id: NpcId
  station?: number
}

// How close you must stand for him to glow and answer E. Moab stands
// beside his horse, so his reach runs from the middle of it and is longer.
export function npcReach(id: NpcId): number {
  return id === 'moab' ? CONFIG.moab.reach : CONFIG.npcs.reach
}

// Marx recites the poem a stanza at a time; Carlsten makes small talk;
// Moab has one thing to say.
const NPC_LINES: Record<NpcId, readonly string[]> = {
  marx: [
    copy('marx.stanza_1'),
    copy('marx.stanza_2'),
    copy('marx.stanza_3'),
    copy('marx.stanza_4'),
  ],
  carlsten: [
    copy('carlsten.says_1'),
    copy('carlsten.says_2'),
    copy('carlsten.says_3'),
  ],
  moab: [copy('moab.says')],
}

// The line after `said` lines have been said, round again past the last.
export function npcLine(id: NpcId, said: number): string {
  const lines = NPC_LINES[id]
  return lines[said % lines.length]
}
