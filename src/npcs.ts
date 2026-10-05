// Pure: what Matthew Marx and David Carlsten say. Walk up to one and he
// glows; E has him say his next line into the player's own chat log, and
// he starts over after the last. interactions.ts decides who is in reach.
// Gron is not here: his dialog is grondialog.ts.

import { copy } from './copy.ts'
import type { XZ } from './interfaces.ts'

export type NpcId = 'marx' | 'carlsten'

// An NPC standing where E could reach him.
export interface NpcSpot extends XZ {
  id: NpcId
}

// Marx recites the poem a stanza at a time; Carlsten makes small talk.
export const NPC_LINES: Record<NpcId, readonly string[]> = {
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
}

// The line after `said` lines have been said, round again past the last.
export function npcLine(id: NpcId, said: number): string {
  const lines = NPC_LINES[id]
  return lines[said % lines.length]
}
