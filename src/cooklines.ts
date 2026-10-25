// What both apps say of the campfire (cooking.ts, sharedworld.ts rule
// 39): the log line for fish cooked, and the line for a refusal. Pure but
// for the copy book; no three.js, no DOM.

import { copy } from './copy.ts'
import { itemLabel } from './itemcopy.ts'
import type { CookedMessage } from './protocol.ts'

// What the log says of fish the valley cooked.
export function cookedLine(
  msg: Pick<CookedMessage, 'kind' | 'count' | 'into'>
): string {
  return copy('log.cooked', {
    count: msg.count,
    fish: itemLabel(msg.kind),
    food: itemLabel(msg.into),
  })
}

// Why the valley would not cook.
export function cookRefusal(reason: string): string {
  switch (reason) {
    case 'no-campfire':
    case 'aboard':
      return copy('log.cook_far')
    case 'short':
      return copy('log.cook_short')
    case 'not-in-valley':
      return copy('log.cook_offline')
    default:
      return copy('log.cook_refused')
  }
}
