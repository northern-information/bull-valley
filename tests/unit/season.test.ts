import { describe, expect, it } from 'vitest'
import { contentsOf } from '../../src/items.ts'
import {
  newsOf,
  NO_PROGRESS,
  SEASON,
  shownKills,
  tally,
} from '../../src/season.ts'

describe('Season One: The Caretaker', () => {
  it('asks for five unmakings and pays $100 and a carton of Reds', () => {
    expect(SEASON.goal).toBe(5)
    expect(SEASON.reward).toEqual({
      cash: 100_00,
      kind: 'marlboro',
      // Ten packs of twenty.
      count: 10 * contentsOf('marlboro'),
    })
    expect(SEASON.reward.count).toBe(200)
  })

  it('pays the reward on the unmaking that reaches the goal, once', () => {
    let progress = NO_PROGRESS
    const rewards = []
    for (let i = 0; i < SEASON.goal + 3; i++) {
      const out = tally(progress)
      progress = out.progress
      rewards.push(out.reward)
    }
    expect(progress).toEqual({ kills: SEASON.goal + 3, claimed: true })
    expect(rewards.filter(Boolean)).toEqual([SEASON.reward])
    expect(rewards[SEASON.goal - 1]).toEqual(SEASON.reward)
    expect(rewards.slice(0, SEASON.goal - 1).every((r) => r === null)).toBe(
      true
    )
  })

  it('counts on toward the goal before it pays', () => {
    expect(tally({ kills: 2, claimed: false })).toEqual({
      progress: { kills: 3, claimed: false },
      reward: null,
    })
  })

  it('reads the tracker no further than the goal', () => {
    expect(shownKills(NO_PROGRESS)).toBe(0)
    expect(shownKills({ kills: 3, claimed: false })).toBe(3)
    expect(shownKills({ kills: 40, claimed: true })).toBe(SEASON.goal)
    expect(shownKills({ kills: -1, claimed: false })).toBe(0)
  })

  it('says what an unmaking means to the raider', () => {
    expect(newsOf({ kills: 2, claimed: false }, false)).toBe('unmade')
    expect(newsOf({ kills: 5, claimed: true }, true)).toBe('complete')
    expect(newsOf({ kills: 6, claimed: true }, false)).toBe('again')
  })
})
