// Pure: what Matthew Marx and David Carlsten say, and whether the player is
// looking at one of them. E speaks to the one in view; each says his next
// line into the player's own chat log, and starts over after the last.
// Gron is not here: his dialog is grondialog.ts.

import { CONFIG } from './config.ts'
import { copy } from './copy.ts'
import { aimAngle } from './store.ts'
import type { Vec3 } from './interfaces.ts'

export type NpcId = 'marx' | 'carlsten'

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

// An NPC standing where E could reach him, aimed at by `at` (his neck).
export interface NpcSpot {
  id: NpcId
  at: Vec3
}

// The NPC the player is looking at: within reach of the eye, inside the aim
// cone, the closest to the view ray, and closer to it than `rival` (the
// angle of the shelf facing in view, or null), so looking past Carlsten at
// the counter still buys. `dir` is the unit look direction.
export function npcInView(
  spots: readonly NpcSpot[],
  eye: Vec3,
  dir: Vec3,
  rival: number | null = null
): NpcId | null {
  const { reach, aimCone } = CONFIG.npcs
  let best: NpcId | null = null
  let bestAngle = Math.min(aimCone, rival ?? Infinity)
  for (const spot of spots) {
    const angle = aimAngle(spot.at, eye, dir, reach)
    if (angle !== null && angle < bestAngle) {
      bestAngle = angle
      best = spot.id
    }
  }
  return best
}
