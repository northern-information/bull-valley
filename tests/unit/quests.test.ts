import { describe, expect, it } from 'vitest'
import { CONFIG } from '../../src/config.ts'
import { copy } from '../../src/copy.ts'
import { isKeyItem } from '../../src/items.ts'
import { XP } from '../../src/progression.ts'
import {
  atDisk,
  atGron,
  atHeart,
  erwinQuest,
  GRON_QUESTS,
  gronQuest,
  isQuest,
  isQuestStage,
  isQuestStep,
  questCard,
  questNow,
  QUESTS,
  questShown,
  questStep,
  stepNews,
  stepRefusal,
  toQuests,
} from '../../src/quests.ts'
import type { QuestStage, QuestStages } from '../../src/quests.ts'

const rose = QUESTS.rose
const nowhere = {
  atErwin: false,
  atGron: false,
  atHeart: false,
  atDisk: false,
}
const atErwin = { ...nowhere, atErwin: true }
const byGron = { ...nowhere, atGron: true }
const atTheHeart = { ...nowhere, atHeart: true }
const atTheDisk = { ...nowhere, atDisk: true }

// Every quest's stage, `rose` and any others as given.
const stages = (
  roseAt: QuestStage = 'none',
  rest: Partial<QuestStages> = {}
): QuestStages => ({ ...toQuests(null), rose: roseAt, ...rest })

describe('the rose quest', () => {
  it('gives and asks only key items', () => {
    expect(isKeyItem(rose.gives ?? '')).toBe(true)
    expect(isKeyItem(rose.reward ?? '')).toBe(true)
    expect(rose.reward).toBe('vault-key')
  })

  it('goes from the rose given, to laid at the heart, to the key', () => {
    const given = questStep(rose, stages(), 'accept', {}, atErwin)
    expect(given).toEqual({
      ok: true,
      stage: 'given',
      change: { kind: 'rose', delta: 1 },
    })
    const laid = questStep(
      rose,
      stages('given'),
      'lay',
      { rose: 1 },
      atTheHeart
    )
    expect(laid).toEqual({
      ok: true,
      stage: 'laid',
      change: { kind: 'rose', delta: -1 },
    })
    const done = questStep(rose, stages('laid'), 'reward', {}, atErwin)
    expect(done).toEqual({
      ok: true,
      stage: 'done',
      change: { kind: 'vault-key', delta: 1 },
    })
  })

  it('gives another rose for one lost, never a second while one is held', () => {
    expect(questStep(rose, stages('given'), 'accept', {}, atErwin).ok).toBe(
      true
    )
    expect(
      questStep(rose, stages('given'), 'accept', { rose: 1 }, atErwin)
    ).toEqual({ ok: false, reason: 'not-now' })
    expect(questStep(rose, stages('done'), 'accept', {}, atErwin).ok).toBe(
      false
    )
    expect(questStep(rose, stages('laid'), 'accept', {}, atErwin).ok).toBe(
      false
    )
  })

  it('takes each step only in its place and its turn', () => {
    expect(questStep(rose, stages(), 'accept', {}, nowhere)).toEqual({
      ok: false,
      reason: 'too-far',
    })
    expect(questStep(rose, stages(), 'accept', {}, byGron)).toEqual({
      ok: false,
      reason: 'too-far',
    })
    expect(
      questStep(rose, stages('given'), 'lay', { rose: 1 }, atErwin)
    ).toEqual({ ok: false, reason: 'too-far' })
    expect(questStep(rose, stages('given'), 'lay', {}, atTheHeart)).toEqual({
      ok: false,
      reason: 'not-now',
    })
    expect(questStep(rose, stages(), 'lay', { rose: 1 }, atTheHeart).ok).toBe(
      false
    )
    expect(questStep(rose, stages('given'), 'reward', {}, atErwin).ok).toBe(
      false
    )
    expect(questStep(rose, stages('laid'), 'reward', {}, nowhere).ok).toBe(
      false
    )
  })

  it('finds the heart within its reach', () => {
    const heart = { x: 100, z: 100 }
    const reach = CONFIG.quests.heartReach
    expect(atHeart({ x: 100 + reach - 0.1, z: 100 }, heart)).toBe(true)
    expect(atHeart({ x: 100 + reach + 0.1, z: 100 }, heart)).toBe(false)
    expect(atHeart(null, heart)).toBe(false)
    expect(atHeart(heart, null)).toBe(false)
  })

  it("says the rose's line and the button that takes his next step", () => {
    const now = (at: QuestStage, pack = {}) =>
      questNow('rose', stages(at), pack, 'erwin')
    expect(now('none')).toEqual({
      line: copy('quests.rose_offer'),
      button: copy('quests.rose_accept'),
      step: 0,
      next: 'accept',
    })
    expect(now('given', { rose: 1 })).toMatchObject({ button: null, step: 1 })
    expect(now('given')).toMatchObject({
      button: copy('quests.rose_again'),
      step: 0,
      next: 'accept',
    })
    expect(now('laid')).toMatchObject({
      button: copy('quests.rose_reward'),
      step: 2,
      next: 'reward',
    })
    expect(now('done')).toEqual({
      line: copy('quests.rose_done'),
      button: null,
      step: 3,
      next: null,
    })
    expect(questCard('rose').title).toBe(copy('quests.rose_title'))
    expect(stepNews('rose', 'accept')).toBe(copy('quests.rose_given'))
    expect(stepNews('rose', 'lay')).toBe(copy('quests.rose_placed'))
    expect(stepNews('rose', 'reward')).toBe(copy('quests.rose_rewarded'))
    expect(stepRefusal('too-far')).toBe(copy('quests.too_far'))
    expect(stepRefusal('not-now')).toBe(copy('quests.not_now'))
  })
})

describe("Gron's quests", () => {
  const berries = QUESTS['gron-berries']
  const errand = QUESTS['gron-erwin']
  const floppy = QUESTS['gron-floppy']

  it('come in order: a berry, Erwin next door, the floppy disk', () => {
    expect(GRON_QUESTS).toEqual(['gron-berries', 'gron-erwin', 'gron-floppy'])
    expect(gronQuest(stages())).toBe('gron-berries')
    expect(gronQuest(stages('none', { 'gron-berries': 'done' }))).toBe(
      'gron-erwin'
    )
    const all = {
      'gron-berries': 'done',
      'gron-erwin': 'done',
      'gron-floppy': 'done',
    } as const
    expect(gronQuest(stages('none', all))).toBe('gron-floppy')
    expect(isKeyItem(floppy.bring ?? '')).toBe(true)
  })

  it('gives each beside him once the last is done, and takes what was asked', () => {
    expect(questStep(berries, stages(), 'accept', {}, byGron)).toEqual({
      ok: true,
      stage: 'given',
      change: null,
    })
    expect(questStep(berries, stages(), 'accept', {}, atErwin).ok).toBe(false)
    expect(questStep(errand, stages(), 'accept', {}, byGron)).toEqual({
      ok: false,
      reason: 'not-now',
    })
    const given = stages('none', { 'gron-berries': 'given' })
    expect(questStep(berries, given, 'reward', {}, byGron)).toEqual({
      ok: false,
      reason: 'not-now',
    })
    expect(questStep(berries, given, 'reward', { berries: 3 }, byGron)).toEqual(
      {
        ok: true,
        stage: 'done',
        change: { kind: 'berries', delta: -1 },
      }
    )
    const sent = stages('none', {
      'gron-berries': 'done',
      'gron-erwin': 'given',
    })
    expect(questStep(errand, sent, 'reward', {}, byGron).ok).toBe(false)
    expect(questStep(errand, sent, 'reward', {}, atErwin)).toEqual({
      ok: true,
      stage: 'done',
      change: null,
    })
    expect(questStep(errand, sent, 'lay', {}, atTheHeart).ok).toBe(false)
    const out = stages('none', {
      'gron-berries': 'done',
      'gron-erwin': 'done',
      'gron-floppy': 'given',
    })
    expect(
      questStep(floppy, out, 'reward', { 'floppy-disk': 1 }, byGron)
    ).toEqual({
      ok: true,
      stage: 'done',
      change: { kind: 'floppy-disk', delta: -1 },
    })
  })

  it('gives each raider on the last quest the floppy disk where it lies', () => {
    const out = stages('none', {
      'gron-berries': 'done',
      'gron-erwin': 'done',
      'gron-floppy': 'given',
    })
    expect(questStep(floppy, out, 'find', {}, atTheDisk)).toEqual({
      ok: true,
      stage: 'given',
      change: { kind: 'floppy-disk', delta: 1 },
    })
    expect(questStep(floppy, out, 'find', {}, byGron)).toEqual({
      ok: false,
      reason: 'too-far',
    })
    // One at a time, and only while the quest is under way.
    expect(
      questStep(floppy, out, 'find', { 'floppy-disk': 1 }, atTheDisk).ok
    ).toBe(false)
    expect(questStep(floppy, stages(), 'find', {}, atTheDisk).ok).toBe(false)
    expect(questStep(berries, out, 'find', {}, atTheDisk).ok).toBe(false)
    expect(stepNews('gron-floppy', 'find')).toBe(copy('quests.floppy_found'))
    const disk = { x: -3, z: 9 }
    const reach = CONFIG.quests.findReach
    expect(atDisk({ x: -3 + reach - 0.1, z: 9 }, disk)).toBe(true)
    expect(atDisk({ x: -3 + reach + 0.1, z: 9 }, disk)).toBe(false)
    expect(atDisk(null, disk)).toBe(false)
  })

  it('finds Gron within his quest reach', () => {
    const gron = { x: 5, z: 5 }
    const reach = CONFIG.gron.questReach
    expect(atGron({ x: 5 + reach - 0.1, z: 5 }, gron)).toBe(true)
    expect(atGron({ x: 5 + reach + 0.1, z: 5 }, gron)).toBe(false)
    expect(atGron(null, gron)).toBe(false)
    expect(atGron(gron, null)).toBe(false)
  })

  it('says each where he stands, the button only where its step is taken', () => {
    expect(questNow('gron-berries', stages(), {}, 'gron')).toEqual({
      line: copy('quests.berries_offer'),
      button: copy('quests.berries_accept'),
      step: 0,
      next: 'accept',
    })
    const picking = stages('none', { 'gron-berries': 'given' })
    expect(questNow('gron-berries', picking, {}, 'gron')).toEqual({
      line: copy('quests.berries_waiting'),
      button: null,
      step: 1,
      next: null,
    })
    expect(questNow('gron-berries', picking, { berries: 1 }, 'gron')).toEqual({
      line: copy('quests.berries_ready'),
      button: copy('quests.berries_reward'),
      step: 2,
      next: 'reward',
    })
    const sent = stages('none', {
      'gron-berries': 'done',
      'gron-erwin': 'given',
    })
    expect(questNow('gron-erwin', sent, {}, 'gron')).toMatchObject({
      line: copy('quests.erwin_waiting'),
      button: null,
    })
    expect(questNow('gron-erwin', sent, {}, 'erwin')).toEqual({
      line: copy('quests.erwin_ready'),
      button: copy('quests.erwin_reward'),
      step: 1,
      next: 'reward',
    })
    const all = stages('none', {
      'gron-berries': 'done',
      'gron-erwin': 'done',
      'gron-floppy': 'done',
    })
    expect(questNow('gron-floppy', all, {}, 'gron')).toEqual({
      line: copy('quests.floppy_done'),
      button: null,
      step: 3,
      next: null,
    })
  })

  it("puts Gron's errand on Erwin's tab while it is under way", () => {
    expect(erwinQuest(stages())).toBe('rose')
    const sent = stages('given', {
      'gron-berries': 'done',
      'gron-erwin': 'given',
    })
    expect(erwinQuest(sent)).toBe('gron-erwin')
    expect(questShown('gron-erwin', sent, {}, 'erwin')).toMatchObject({
      title: copy('quests.erwin_title'),
      prize: copy('quests.xp_prize', { xp: XP.quest }),
      steps: [
        [copy('quests.gron_step_word'), copy('quests.gron_step_word_where')],
        [copy('quests.erwin_step_find'), copy('quests.erwin_step_find_where')],
      ],
    })
    expect(erwinQuest(stages('none', { 'gron-erwin': 'done' }))).toBe('rose')
  })

  it('says each step in the log', () => {
    expect(stepNews('gron-berries', 'accept')).toBe(
      copy('quests.berries_given')
    )
    expect(stepNews('gron-berries', 'reward')).toBe(
      copy('quests.berries_finished')
    )
    expect(stepNews('gron-erwin', 'reward')).toBe(copy('quests.erwin_finished'))
    expect(stepNews('gron-floppy', 'accept')).toBe(copy('quests.floppy_given'))
    expect(questCard('gron-floppy').steps).toHaveLength(3)
  })
})

describe('the wire', () => {
  it('reads every quest there', () => {
    expect(isQuest('rose')).toBe(true)
    expect(isQuest('gron-floppy')).toBe(true)
    expect(isQuest('lily')).toBe(false)
    expect(isQuestStage('laid')).toBe(true)
    expect(isQuestStage('lost')).toBe(false)
    expect(isQuestStep('lay')).toBe(true)
    expect(isQuestStep('find')).toBe(true)
    expect(isQuestStep('pick')).toBe(false)
    expect(toQuests({ rose: 'laid' })).toEqual(stages('laid'))
    expect(toQuests({ rose: 'eaten', 'gron-erwin': 'given' })).toEqual(
      stages('none', { 'gron-erwin': 'given' })
    )
    expect(toQuests(null)).toEqual({
      rose: 'none',
      'gron-berries': 'none',
      'gron-erwin': 'none',
      'gron-floppy': 'none',
    })
  })
})
