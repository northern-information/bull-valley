import { describe, expect, it } from 'vitest'
import { CONFIG } from '../../src/config.ts'
import { copy } from '../../src/copy.ts'
import { isKeyItem } from '../../src/items.ts'
import {
  atHeart,
  dealerStep,
  isQuest,
  isQuestStage,
  isQuestStep,
  QUESTS,
  questStep,
  roseLine,
  stepNews,
  stepRefusal,
  toQuests,
} from '../../src/quests.ts'

const rose = QUESTS.rose
const atErwin = { atDealer: true, atHeart: false }
const atTheHeart = { atDealer: false, atHeart: true }
const nowhere = { atDealer: false, atHeart: false }

describe('the rose quest', () => {
  it('gives and asks only key items', () => {
    expect(isKeyItem(rose.gives)).toBe(true)
    expect(isKeyItem(rose.reward)).toBe(true)
    expect(rose.reward).toBe('vault-key')
  })

  it('goes from the rose given, to laid at the heart, to the key', () => {
    const given = questStep(rose, 'none', 'accept', {}, atErwin)
    expect(given).toEqual({
      ok: true,
      stage: 'given',
      change: { kind: 'rose', delta: 1 },
    })
    const laid = questStep(rose, 'given', 'lay', { rose: 1 }, atTheHeart)
    expect(laid).toEqual({
      ok: true,
      stage: 'laid',
      change: { kind: 'rose', delta: -1 },
    })
    const done = questStep(rose, 'laid', 'reward', {}, atErwin)
    expect(done).toEqual({
      ok: true,
      stage: 'done',
      change: { kind: 'vault-key', delta: 1 },
    })
  })

  it('gives another rose for one lost, never a second while one is held', () => {
    expect(questStep(rose, 'given', 'accept', {}, atErwin).ok).toBe(true)
    expect(questStep(rose, 'given', 'accept', { rose: 1 }, atErwin)).toEqual({
      ok: false,
      reason: 'not-now',
    })
    expect(questStep(rose, 'done', 'accept', {}, atErwin).ok).toBe(false)
    expect(questStep(rose, 'laid', 'accept', {}, atErwin).ok).toBe(false)
  })

  it('takes each step only in its place and its turn', () => {
    expect(questStep(rose, 'none', 'accept', {}, nowhere)).toEqual({
      ok: false,
      reason: 'too-far',
    })
    expect(questStep(rose, 'given', 'lay', { rose: 1 }, atErwin)).toEqual({
      ok: false,
      reason: 'too-far',
    })
    expect(questStep(rose, 'given', 'lay', {}, atTheHeart)).toEqual({
      ok: false,
      reason: 'not-now',
    })
    expect(questStep(rose, 'none', 'lay', { rose: 1 }, atTheHeart).ok).toBe(
      false
    )
    expect(questStep(rose, 'given', 'reward', {}, atErwin).ok).toBe(false)
    expect(questStep(rose, 'laid', 'reward', {}, nowhere).ok).toBe(false)
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
    expect(roseLine('none', {})).toEqual({
      line: copy('quests.rose_offer'),
      button: copy('quests.rose_accept'),
    })
    expect(roseLine('given', { rose: 1 }).button).toBeNull()
    expect(roseLine('given', {}).button).toBe(copy('quests.rose_again'))
    expect(roseLine('laid', {}).button).toBe(copy('quests.rose_reward'))
    expect(roseLine('done', {})).toEqual({
      line: copy('quests.rose_done'),
      button: null,
    })
    expect(dealerStep('none')).toBe('accept')
    expect(dealerStep('given')).toBe('accept')
    expect(dealerStep('laid')).toBe('reward')
    expect(dealerStep('done')).toBeNull()
    expect(stepNews('accept')).toBe(copy('quests.rose_given'))
    expect(stepNews('lay')).toBe(copy('quests.rose_placed'))
    expect(stepNews('reward')).toBe(copy('quests.rose_rewarded'))
    expect(stepRefusal('too-far')).toBe(copy('quests.too_far'))
    expect(stepRefusal('not-now')).toBe(copy('quests.not_now'))
  })

  it('reads the wire, every quest there', () => {
    expect(isQuest('rose')).toBe(true)
    expect(isQuest('lily')).toBe(false)
    expect(isQuestStage('laid')).toBe(true)
    expect(isQuestStage('lost')).toBe(false)
    expect(isQuestStep('lay')).toBe(true)
    expect(isQuestStep('pick')).toBe(false)
    expect(toQuests({ rose: 'laid' })).toEqual({ rose: 'laid' })
    expect(toQuests({ rose: 'eaten' })).toEqual({ rose: 'none' })
    expect(toQuests(null)).toEqual({ rose: 'none' })
  })
})
