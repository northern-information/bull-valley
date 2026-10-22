// What both apps say of fishing at the firefly pond (fishing.ts,
// sharedworld.ts rule 36), as Final Fantasy XI says it: the hook's call,
// the feeling a fish far past the skill gives, the catch or how it was
// lost, the skill rising, what the bank and the tackle box gave, and why
// the valley refused. Pure but for the copy book; no three.js, no DOM.

import { copy } from './copy.ts'
import { catchableOf, skillText } from './fishing.ts'
import { itemLabel } from './itemcopy.ts'
import type { Bait, Feeling, HookCall } from './fishing.ts'
import type { AnglerMessage, CatchMessage } from './protocol.ts'

// Something took the hook: small, large, or not a fish at all.
export function hookLine(call: HookCall): string {
  switch (call) {
    case 'small':
      return copy('fishing.hook_small')
    case 'large':
      return copy('fishing.hook_large')
    case 'item':
      return copy('fishing.hook_item')
  }
}

// What a fish far past the skill makes the raider feel.
export function feelingLine(feeling: Feeling): string {
  switch (feeling) {
    case 'unsure':
      return copy('fishing.feel_unsure')
    case 'fairly':
      return copy('fishing.feel_fairly')
    case 'positive':
      return copy('fishing.feel_positive')
  }
}

// The bait's name on the cast button.
export function baitName(bait: Bait): string {
  return itemLabel(bait)
}

// How the line came out of the water, as the valley judged it; the skill
// rising has its own line after (skillUpLine).
export function catchLine(msg: Pick<CatchMessage, 'outcome' | 'kind'>): string {
  switch (msg.outcome) {
    case 'landed':
      return catchableOf(msg.kind ?? '')?.junk
        ? copy('fishing.caught_junk', { item: itemLabel(msg.kind ?? '') })
        : copy('fishing.caught', { item: itemLabel(msg.kind ?? '') })
    case 'skill':
      return copy('fishing.lost_skill')
    case 'snap':
      return copy('fishing.snap')
    case 'gave-up':
      return copy('fishing.gave_up')
  }
}

export function skillUpLine(skill: number): string {
  return copy('fishing.skill_up', { skill: skillText(skill) })
}

// What the log says of the angler as the valley wrote it: nightcrawlers
// dug, the rod out of the box, or nothing for an angler only read.
export function anglerNews(
  msg: Pick<AnglerMessage, 'dug' | 'rod'>
): string | null {
  if (msg.rod) return copy('log.fish_rod')
  if (msg.dug !== undefined) return copy('log.fish_dug', { count: msg.dug })
  return null
}

// Why the valley would not let the raider fish.
export function fishRefusal(reason: string): string {
  switch (reason) {
    case 'no-pond':
    case 'aboard':
      return copy('log.fish_far')
    case 'has-rod':
      return copy('log.fish_has_rod')
    case 'no-rod':
      return copy('log.fish_no_rod')
    case 'no-bait':
      return copy('log.fish_no_bait')
    case 'tired':
      return copy('log.fish_tired')
    case 'too-soon':
      return copy('log.fish_dug_out')
    case 'busy':
    case 'no-line':
      return copy('log.fish_busy')
    case 'not-in-valley':
      return copy('log.fish_offline')
    default:
      return copy('log.fish_refused')
  }
}

// Why the valley would not let the slurm into the jar.
export function jarRefusal(reason: string): string {
  switch (reason) {
    case 'no-jar':
      return copy('log.jar_none')
    case 'jar-full':
      return copy('log.jar_full')
    case 'too-far':
    case 'aboard':
      return copy('log.jar_far')
    case 'gone':
      return copy('log.jar_gone')
    default:
      return copy('log.jar_refused')
  }
}
