// Pure: the buffs a raider has going, as the row over the hotbar shows them
// (buffhud.ts), each winding down. The wards (wardlevels.ts, what each
// does is buffs.ts): high, stimulated, drunk and tripping, each as full as
// its level and lasting until it fades to nothing at CONFIG.wards'
// fadePerSecond;
// and the joint's perception (hotbar.ts Effects), for its span. No
// three.js, no DOM.

import { CONFIG } from './config.ts'
import { AXES } from './wardlevels.ts'
import type { Effects } from './hotbar.ts'
import type { WardAxis } from './interfaces.ts'

export type BuffId = WardAxis | 'perception'

export interface Buff {
  id: BuffId
  // 1 at full strength (a full level, or a span just begun), falling to 0
  // as it runs out.
  fraction: number
  // Whole seconds left, rounded up.
  seconds: number
}

// Every buff going at `time` (game seconds), the wards in their corner order
// and then perception: a level under half a percent shows nothing, as the
// triangle shows nothing.
export function activeBuffs(
  levels: Readonly<Record<WardAxis, number>>,
  effects: Effects,
  time: number,
  fade: Readonly<Record<WardAxis, number>> = CONFIG.wards.fadePerSecond
): Buff[] {
  const buffs: Buff[] = []
  for (const axis of AXES) {
    const level = levels[axis]
    if (!(level >= 0.005) || !(fade[axis] > 0)) continue
    buffs.push({
      id: axis,
      fraction: Math.min(1, level),
      seconds: Math.ceil(level / fade[axis]),
    })
  }
  const { start, end } = effects.perception
  if (time < end) {
    buffs.push({
      id: 'perception',
      fraction: Math.min(1, (end - time) / Math.max(1e-3, end - start)),
      seconds: Math.ceil(end - time),
    })
  }
  return buffs
}

// The time left as the row prints it under the icon: minutes while there
// is a minute or more, then seconds.
export function buffTime(seconds: number): string {
  return seconds >= 60 ? `${Math.ceil(seconds / 60)}m` : `${seconds}s`
}
