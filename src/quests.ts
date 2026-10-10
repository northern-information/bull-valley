// Pure: quests (sharedworld.ts rule 25). One for now: Erwin von Dutch's,
// in Bull Valley Plaza. He gives a raider a single rose to lay at the
// heart of the corn maze; laid, he gives them the Video Vault's back-room
// key (keys.ts). The rose and the key are key items (items.ts), never
// dropped. Each quest's stage is the account's, kept by the valley in D1
// with the pack, and a step writes the stage and what it puts into or
// takes out of the pack together. No three.js, no DOM.

import { CONFIG } from './config.ts'
import { copy } from './copy.ts'
import type { Inventory, XZ } from './interfaces.ts'
import type { ItemId } from './items.ts'

export type QuestId = 'rose'

// Where an account stands on a quest: not begun, the rose given, the
// rose laid, the key given.
export type QuestStage = 'none' | 'given' | 'laid' | 'done'

export const QUEST_STAGES: readonly QuestStage[] = [
  'none',
  'given',
  'laid',
  'done',
]

// What the raider does: take the rose from Erwin (again, if it was lost),
// lay it at the heart of the maze, or come back to him for the key.
export type QuestStep = 'accept' | 'lay' | 'reward'

export interface Quest {
  id: QuestId
  // What he gives to begin it, and what the reward is.
  gives: ItemId
  reward: ItemId
}

export const QUESTS: Readonly<Record<QuestId, Quest>> = {
  rose: { id: 'rose', gives: 'rose', reward: 'vault-key' },
}

export function isQuest(id: string): id is QuestId {
  return Object.hasOwn(QUESTS, id)
}

export function isQuestStage(value: unknown): value is QuestStage {
  return (QUEST_STAGES as readonly unknown[]).includes(value)
}

export function isQuestStep(value: unknown): value is QuestStep {
  return value === 'accept' || value === 'lay' || value === 'reward'
}

// Where the raider is, as the valley judges it from their last state
// frame: beside Erwin, or at the heart of the maze.
export interface QuestPlace {
  atDealer: boolean
  atHeart: boolean
}

export type QuestRefusal = 'too-far' | 'not-now'

export type QuestOutcome =
  | {
      ok: true
      // The stage after, and what goes into (positive) or out of the pack.
      stage: QuestStage
      change: { kind: string; delta: number }
    }
  | { ok: false; reason: QuestRefusal }

// One step of `quest` from `stage`, with `pack` and where the raider
// stands.
export function questStep(
  quest: Quest,
  stage: QuestStage,
  step: QuestStep,
  pack: Inventory,
  place: QuestPlace
): QuestOutcome {
  const holds = (pack[quest.gives] ?? 0) > 0
  switch (step) {
    case 'accept':
      if (!place.atDealer) return { ok: false, reason: 'too-far' }
      // Begun, or begun and the rose lost: he gives one.
      if (stage === 'none' || (stage === 'given' && !holds)) {
        return {
          ok: true,
          stage: 'given',
          change: { kind: quest.gives, delta: 1 },
        }
      }
      return { ok: false, reason: 'not-now' }
    case 'lay':
      if (!place.atHeart) return { ok: false, reason: 'too-far' }
      if (stage !== 'given' || !holds) return { ok: false, reason: 'not-now' }
      return {
        ok: true,
        stage: 'laid',
        change: { kind: quest.gives, delta: -1 },
      }
    case 'reward':
      if (!place.atDealer) return { ok: false, reason: 'too-far' }
      if (stage !== 'laid') return { ok: false, reason: 'not-now' }
      return {
        ok: true,
        stage: 'done',
        change: { kind: quest.reward, delta: 1 },
      }
  }
}

// Whether `at` is at the heart of the maze (`heart`) for the valley to
// take the rose: within CONFIG.quests.heartReach, generous as frames lag.
export function atHeart(
  at: XZ | null,
  heart: XZ | null,
  cfg = CONFIG
): boolean {
  if (!at || !heart) return false
  return Math.hypot(at.x - heart.x, at.z - heart.z) <= cfg.quests.heartReach
}

// What Erwin's dialog says of the rose for a raider at `stage` holding
// `pack`, and the button that takes the next step with him, if any.
export function roseLine(
  stage: QuestStage,
  pack: Inventory
): { line: string; button: string | null } {
  const holds = (pack[QUESTS.rose.gives] ?? 0) > 0
  switch (stage) {
    case 'none':
      return {
        line: copy('quests.rose_offer'),
        button: copy('quests.rose_accept'),
      }
    case 'given':
      return holds
        ? { line: copy('quests.rose_waiting'), button: null }
        : { line: copy('quests.rose_lost'), button: copy('quests.rose_again') }
    case 'laid':
      return {
        line: copy('quests.rose_laid'),
        button: copy('quests.rose_reward'),
      }
    case 'done':
      return { line: copy('quests.rose_done'), button: null }
  }
}

// The step his dialog's button takes at `stage`.
export function dealerStep(stage: QuestStage): QuestStep | null {
  if (stage === 'none' || stage === 'given') return 'accept'
  if (stage === 'laid') return 'reward'
  return null
}

// The line in the log when the valley says a step went through.
export function stepNews(step: QuestStep): string {
  switch (step) {
    case 'accept':
      return copy('quests.rose_given')
    case 'lay':
      return copy('quests.rose_placed')
    case 'reward':
      return copy('quests.rose_rewarded')
  }
}

// And when it did not.
export function stepRefusal(reason: string): string {
  return reason === 'too-far' ? copy('quests.too_far') : copy('quests.not_now')
}

// Every quest's stage off the wire: each quest there is, 'none' for one
// missing or unreadable.
export function toQuests(value: unknown): Record<QuestId, QuestStage> {
  const record =
    typeof value === 'object' && value !== null
      ? (value as Record<string, unknown>)
      : {}
  const stages = {} as Record<QuestId, QuestStage>
  for (const id of Object.keys(QUESTS) as QuestId[]) {
    const stage = record[id]
    stages[id] = isQuestStage(stage) ? stage : 'none'
  }
  return stages
}
