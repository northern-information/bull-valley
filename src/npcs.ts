// Pure: what Matthew Marx, David Carlsten, Moab Coldë, Tyler Etters,
// Jericho, the Candlebearer, and Gron say. Walk up to one and he glows; E
// has him say his next line into the player's own chat log, and he starts
// over after the last. interactions.ts decides who is in reach (Gron by
// the bush, as `talk`).

import { CONFIG } from './config.ts'
import { copy } from './copy.ts'
import { outfitById } from './outfits.ts'
import type { XZ } from './interfaces.ts'

export type NpcId = 'marx' | 'carlsten' | 'moab' | 'tyler' | 'jericho' | 'gron'

// An NPC standing where E could reach him. A Moab stands at every station,
// so his spot says which one (an index into the stations).
export interface NpcSpot extends XZ {
  id: NpcId
  station?: number
}

// How close you must stand for him to glow and answer E. Moab stands
// beside his horse, so his reach runs from the middle of it and is longer;
// Tyler sits up in the back of his Jeep; Jericho, twice anyone's height,
// sits low, his cloak pooled round him.
export function npcReach(id: NpcId): number {
  if (id === 'moab') return CONFIG.moab.reach
  if (id === 'tyler') return CONFIG.tyler.reach
  if (id === 'jericho') return CONFIG.castle.yard.jericho.reach
  if (id === 'gron') return CONFIG.gron.reach
  return CONFIG.npcs.reach
}

// Marx recites the poem a stanza at a time; Carlsten makes small talk;
// Moab has one thing to say; Tyler, hunched over his laptop, barely looks
// up; Jericho greets you and tells you what passage to Castle Entropy
// would take; Gron, under his raincloud, keeps his own counsel.
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
  tyler: [copy('tyler.says_1'), copy('tyler.says_2'), copy('tyler.says_3')],
  jericho: [
    copy('jericho.says_1'),
    copy('jericho.says_2'),
    copy('jericho.says_3'),
  ],
  gron: [copy('gron.says_1'), copy('gron.says_2'), copy('gron.says_3')],
}

// The name his lines go under in the log: his outfit's, or, for Jericho,
// who wears none a raider could, his own.
export function npcName(id: NpcId): string {
  return id === 'jericho' ? copy('jericho.name') : outfitById(id).label
}

// The line after `said` lines have been said, round again past the last.
export function npcLine(id: NpcId, said: number): string {
  const lines = NPC_LINES[id]
  return lines[said % lines.length]
}

// Whether the line after `said` lines is the one where Jericho marks the
// raider's map: his last, each time round.
export function marksMap(id: NpcId, said: number): boolean {
  if (id !== 'jericho') return false
  const lines = NPC_LINES.jericho
  return said % lines.length === lines.length - 1
}

// A graveyard as Jericho marks it: its middle in the world, and its name
// from the survey.
export interface Yard extends XZ {
  name: string
}

// The graveyard nearest `from`, or null with none.
export function nearestYard(from: XZ, yards: readonly Yard[]): Yard | null {
  let best: Yard | null = null
  let bestD = Infinity
  for (const yard of yards) {
    const d = Math.hypot(yard.x - from.x, yard.z - from.z)
    if (d < bestD) {
      best = yard
      bestD = d
    }
  }
  return best
}

// Whether `list` already holds a pin within a metre of `at`, so his
// marking the same graveyard again pins nothing new.
export function pinnedAt(list: readonly XZ[], at: XZ): boolean {
  return list.some((p) => Math.hypot(p.x - at.x, p.z - at.z) < 1)
}
