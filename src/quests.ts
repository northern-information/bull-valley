// Pure: quests (sharedworld.ts rule 26). Erwin von Dutch's, in Bull
// Valley Plaza: he gives a raider a single rose to lay at the heart of the
// corn maze; laid, he gives them the Video Vault's back-room key
// (keys.ts). And Gron's, by the berry bush, one after another: bring him
// a berry off a bush, seek out Erwin next door at the Golden Wok, then
// bring him the construction data on a 3.5" floppy disk, found in the
// burned-out building's office in the industrial park (industrial.ts
// DISK). The rose, the key and the disk are key items
// (items.ts), never dropped. Each quest's stage is the account's, kept by
// the valley in D1 with the pack, and a step writes the stage and what it
// puts into or takes out of the pack together. Each quest finished earns
// quest XP (progression.ts). No three.js, no DOM.

import { CONFIG } from './config.ts'
import { copy } from './copy.ts'
import { XP } from './progression.ts'
import type { Inventory, XZ } from './interfaces.ts'
import type { ItemId } from './items.ts'

export type QuestId = 'rose' | 'gron-berries' | 'gron-erwin' | 'gron-floppy'

// Where an account stands on a quest: not begun, begun, the rose laid
// (the rose's alone), finished.
export type QuestStage = 'none' | 'given' | 'laid' | 'done'

const QUEST_STAGES: readonly QuestStage[] = ['none', 'given', 'laid', 'done']

// What the raider does: take the quest on (take the rose again, if it was
// lost), lay the rose at the heart of the maze, find what was asked where
// it lies (the floppy disk), or finish it.
export type QuestStep = 'accept' | 'lay' | 'find' | 'reward'

// Who a step is taken with.
export type QuestGiver = 'erwin' | 'gron'

interface Quest {
  id: QuestId
  // Who gives it, and who finishes it.
  giver: QuestGiver
  finisher: QuestGiver
  // The quest that must be finished before this one is given.
  after?: QuestId
  // What he gives to begin it, what he takes to finish it, and what he
  // gives for it.
  gives?: ItemId
  bring?: ItemId
  reward?: ItemId
  // Whether it is laid somewhere between (the rose, at the heart of the
  // maze).
  lays?: boolean
  // What is found where it lies, each raider their own (the floppy disk,
  // in the industrial park), while the quest is under way.
  finds?: ItemId
}

export const QUESTS: Readonly<Record<QuestId, Quest>> = {
  rose: {
    id: 'rose',
    giver: 'erwin',
    finisher: 'erwin',
    gives: 'rose',
    reward: 'vault-key',
    lays: true,
  },
  'gron-berries': {
    id: 'gron-berries',
    giver: 'gron',
    finisher: 'gron',
    bring: 'berries',
  },
  'gron-erwin': {
    id: 'gron-erwin',
    giver: 'gron',
    finisher: 'erwin',
    after: 'gron-berries',
  },
  'gron-floppy': {
    id: 'gron-floppy',
    giver: 'gron',
    finisher: 'gron',
    after: 'gron-erwin',
    finds: 'floppy-disk',
    bring: 'floppy-disk',
  },
}

// Gron's quests, in the order he gives them.
export const GRON_QUESTS: readonly QuestId[] = [
  'gron-berries',
  'gron-erwin',
  'gron-floppy',
]

export type QuestStages = Record<QuestId, QuestStage>

export function isQuest(id: string): id is QuestId {
  return Object.hasOwn(QUESTS, id)
}

export function isQuestStage(value: unknown): value is QuestStage {
  return (QUEST_STAGES as readonly unknown[]).includes(value)
}

export function isQuestStep(value: unknown): value is QuestStep {
  return (
    value === 'accept' ||
    value === 'lay' ||
    value === 'find' ||
    value === 'reward'
  )
}

// Where the raider is, as the valley judges it from their last state
// frame: beside Erwin, beside Gron, at the heart of the maze, or where
// the floppy disk lies.
export interface QuestPlace {
  atErwin: boolean
  atGron: boolean
  atHeart: boolean
  atDisk: boolean
}

type QuestRefusal = 'too-far' | 'not-now'

type QuestOutcome =
  | {
      ok: true
      // The stage after, and what goes into (positive) or out of the pack,
      // if anything.
      stage: QuestStage
      change: { kind: string; delta: number } | null
    }
  | { ok: false; reason: QuestRefusal }

const holds = (pack: Inventory, kind: ItemId | undefined) =>
  kind !== undefined && (pack[kind] ?? 0) > 0

const at = (place: QuestPlace, who: QuestGiver) =>
  who === 'erwin' ? place.atErwin : place.atGron

// One step of `quest`, with every quest's stage on the account, the pack
// and where the raider stands.
export function questStep(
  quest: Quest,
  stages: QuestStages,
  step: QuestStep,
  pack: Inventory,
  place: QuestPlace
): QuestOutcome {
  const stage = stages[quest.id]
  switch (step) {
    case 'accept': {
      if (!at(place, quest.giver)) return { ok: false, reason: 'too-far' }
      if (quest.after && stages[quest.after] !== 'done') {
        return { ok: false, reason: 'not-now' }
      }
      // Begun, or begun and what he gave lost: he gives it again.
      const lost = stage === 'given' && quest.gives && !holds(pack, quest.gives)
      if (stage !== 'none' && !lost) return { ok: false, reason: 'not-now' }
      return {
        ok: true,
        stage: 'given',
        change: quest.gives ? { kind: quest.gives, delta: 1 } : null,
      }
    }
    case 'lay':
      if (!quest.lays || !quest.gives) return { ok: false, reason: 'not-now' }
      if (!place.atHeart) return { ok: false, reason: 'too-far' }
      if (stage !== 'given' || !holds(pack, quest.gives)) {
        return { ok: false, reason: 'not-now' }
      }
      return {
        ok: true,
        stage: 'laid',
        change: { kind: quest.gives, delta: -1 },
      }
    case 'find':
      if (!quest.finds) return { ok: false, reason: 'not-now' }
      if (!place.atDisk) return { ok: false, reason: 'too-far' }
      if (stage !== 'given' || holds(pack, quest.finds)) {
        return { ok: false, reason: 'not-now' }
      }
      return {
        ok: true,
        stage: 'given',
        change: { kind: quest.finds, delta: 1 },
      }
    case 'reward': {
      if (!at(place, quest.finisher)) return { ok: false, reason: 'too-far' }
      if (stage !== (quest.lays ? 'laid' : 'given')) {
        return { ok: false, reason: 'not-now' }
      }
      if (quest.bring && !holds(pack, quest.bring)) {
        return { ok: false, reason: 'not-now' }
      }
      return {
        ok: true,
        stage: 'done',
        change: quest.reward
          ? { kind: quest.reward, delta: 1 }
          : quest.bring
            ? { kind: quest.bring, delta: -1 }
            : null,
      }
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

// Whether `at` is beside Gron (`gron`) for the valley to take a step of
// his quests: within CONFIG.gron.questReach.
export function atGron(at: XZ | null, gron: XZ | null, cfg = CONFIG): boolean {
  if (!at || !gron) return false
  return Math.hypot(at.x - gron.x, at.z - gron.z) <= cfg.gron.questReach
}

// Whether `at` is where the floppy disk lies (`disk`) for the valley to
// give it: within CONFIG.quests.findReach.
export function atDisk(at: XZ | null, disk: XZ | null, cfg = CONFIG): boolean {
  if (!at || !disk) return false
  return Math.hypot(at.x - disk.x, at.z - disk.z) <= cfg.quests.findReach
}

// --- As the dialogs show them ----------------------------------------------

// A quest as its section shows it: its title, what it pays, and each
// step's name and where it happens.
export interface QuestCard {
  title: string
  prize: string
  steps: readonly (readonly [string, string])[]
}

// Where a raider stands on it, said by the one they are talking to: his
// line, the button that takes the next step with him (null for none
// here), the step under way (all of them once done), and the step the
// button takes.
export interface QuestNow {
  line: string
  button: string | null
  step: number
  next: QuestStep | null
}

// Each step's name and where it happens.
const ROSE_STEPS = () =>
  [
    [copy('quests.rose_step_take'), copy('quests.rose_step_take_where')],
    [copy('quests.rose_step_lay'), copy('quests.rose_step_lay_where')],
    [copy('quests.rose_step_key'), copy('quests.rose_step_key_where')],
  ] as const
const GRON_WORD = () =>
  [copy('quests.gron_step_word'), copy('quests.gron_step_word_where')] as const
const GRON_BACK = () =>
  [copy('quests.gron_step_back'), copy('quests.gron_step_back_where')] as const

export function questCard(id: QuestId): QuestCard {
  const xp = copy('quests.xp_prize', { xp: XP.quest })
  switch (id) {
    case 'rose':
      return {
        title: copy('quests.rose_title'),
        prize: copy('quests.rose_prize'),
        steps: ROSE_STEPS(),
      }
    case 'gron-berries':
      return {
        title: copy('quests.berries_title'),
        prize: xp,
        steps: [
          GRON_WORD(),
          [
            copy('quests.berries_step_pick'),
            copy('quests.berries_step_pick_where'),
          ],
          GRON_BACK(),
        ],
      }
    case 'gron-erwin':
      return {
        title: copy('quests.erwin_title'),
        prize: xp,
        steps: [
          GRON_WORD(),
          [
            copy('quests.erwin_step_find'),
            copy('quests.erwin_step_find_where'),
          ],
        ],
      }
    case 'gron-floppy':
      return {
        title: copy('quests.floppy_title'),
        prize: xp,
        steps: [
          GRON_WORD(),
          [
            copy('quests.floppy_step_find'),
            copy('quests.floppy_step_find_where'),
          ],
          GRON_BACK(),
        ],
      }
  }
}

// One of Gron's quests' lines, by where the raider stands on it, and its
// buttons.
interface Lines {
  offer: string
  accept: string
  waiting: string
  ready: string
  reward: string
  done: string
}

function gronLines(id: Exclude<QuestId, 'rose'>): Lines {
  switch (id) {
    case 'gron-berries':
      return {
        offer: copy('quests.berries_offer'),
        accept: copy('quests.berries_accept'),
        waiting: copy('quests.berries_waiting'),
        ready: copy('quests.berries_ready'),
        reward: copy('quests.berries_reward'),
        done: copy('quests.berries_done'),
      }
    case 'gron-erwin':
      return {
        offer: copy('quests.erwin_offer'),
        accept: copy('quests.erwin_accept'),
        waiting: copy('quests.erwin_waiting'),
        ready: copy('quests.erwin_ready'),
        reward: copy('quests.erwin_reward'),
        done: copy('quests.erwin_done'),
      }
    case 'gron-floppy':
      return {
        offer: copy('quests.floppy_offer'),
        accept: copy('quests.floppy_accept'),
        waiting: copy('quests.floppy_waiting'),
        ready: copy('quests.floppy_ready'),
        reward: copy('quests.floppy_reward'),
        done: copy('quests.floppy_done'),
      }
  }
}

// Where a raider at `stages` holding `pack` stands on `id`, as `who` says
// it: a button only for a step taken with him.
export function questNow(
  id: QuestId,
  stages: QuestStages,
  pack: Inventory,
  who: QuestGiver
): QuestNow {
  const quest = QUESTS[id]
  const stage = stages[id]
  const button = (label: string, next: QuestStep, taker: QuestGiver) =>
    who === taker ? { button: label, next } : { button: null, next: null }
  const quiet = { button: null, next: null }
  if (id === 'rose') {
    switch (stage) {
      case 'none':
        return {
          line: copy('quests.rose_offer'),
          step: 0,
          ...button(copy('quests.rose_accept'), 'accept', 'erwin'),
        }
      case 'given':
        return holds(pack, quest.gives)
          ? { line: copy('quests.rose_waiting'), step: 1, ...quiet }
          : {
              line: copy('quests.rose_lost'),
              step: 0,
              ...button(copy('quests.rose_again'), 'accept', 'erwin'),
            }
      case 'laid':
        return {
          line: copy('quests.rose_laid'),
          step: 2,
          ...button(copy('quests.rose_reward'), 'reward', 'erwin'),
        }
      case 'done':
        return { line: copy('quests.rose_done'), step: 3, ...quiet }
    }
  }
  const lines = gronLines(id)
  const last = questCard(id).steps.length
  switch (stage) {
    case 'none':
      return {
        line: lines.offer,
        step: 0,
        ...button(lines.accept, 'accept', quest.giver),
      }
    case 'given':
    case 'laid': {
      const ready = quest.bring ? holds(pack, quest.bring) : true
      const there = who === quest.finisher
      if (ready && (quest.bring || there)) {
        return {
          line: there ? lines.ready : lines.waiting,
          step: last - 1,
          ...button(lines.reward, 'reward', quest.finisher),
        }
      }
      return { line: lines.waiting, step: 1, ...quiet }
    }
    case 'done':
      return { line: lines.done, step: last, ...quiet }
  }
}

// A quest as `who` shows it: its card, and where the raider stands on it.
export function questShown(
  id: QuestId,
  stages: QuestStages,
  pack: Inventory,
  who: QuestGiver
): QuestCard & QuestNow {
  return { ...questCard(id), ...questNow(id, stages, pack, who) }
}

// The quest Erwin's tab shows: Gron's errand while the raider is on it,
// else his rose.
export function erwinQuest(stages: QuestStages): QuestId {
  return stages['gron-erwin'] === 'given' ? 'gron-erwin' : 'rose'
}

// The quest Gron speaks of: the first of his not finished, else his last.
export function gronQuest(stages: QuestStages): QuestId {
  return (
    GRON_QUESTS.find((id) => stages[id] !== 'done') ??
    GRON_QUESTS[GRON_QUESTS.length - 1]
  )
}

// The line in the log when the valley says a step went through.
export function stepNews(quest: QuestId, step: QuestStep): string {
  if (quest === 'rose') {
    switch (step) {
      case 'accept':
        return copy('quests.rose_given')
      case 'lay':
      case 'find':
        return copy('quests.rose_placed')
      case 'reward':
        return copy('quests.rose_rewarded')
    }
  }
  switch (quest) {
    case 'gron-berries':
      return step === 'accept'
        ? copy('quests.berries_given')
        : copy('quests.berries_finished')
    case 'gron-erwin':
      return step === 'accept'
        ? copy('quests.erwin_given')
        : copy('quests.erwin_finished')
    case 'gron-floppy':
      if (step === 'find') return copy('quests.floppy_found')
      return step === 'accept'
        ? copy('quests.floppy_given')
        : copy('quests.floppy_finished')
  }
}

// And when it did not.
export function stepRefusal(reason: string): string {
  return reason === 'too-far' ? copy('quests.too_far') : copy('quests.not_now')
}

// Every quest's stage off the wire: each quest there is, 'none' for one
// missing or unreadable.
export function toQuests(value: unknown): QuestStages {
  const record =
    typeof value === 'object' && value !== null
      ? (value as Record<string, unknown>)
      : {}
  const stages = {} as QuestStages
  for (const id of Object.keys(QUESTS) as QuestId[]) {
    const stage = record[id]
    stages[id] = isQuestStage(stage) ? stage : 'none'
  }
  return stages
}
