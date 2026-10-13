import { describe, expect, it } from 'vitest'
import {
  advance,
  goalNews,
  NO_GOAL_PROGRESS,
  shownProgress,
} from '../../src/goal.ts'

const GOAL = { goal: 3, reward: 'prize' }

describe('a goal', () => {
  it('pays on the credit that reaches it, once', () => {
    let progress = NO_GOAL_PROGRESS
    const rewards = []
    for (let i = 0; i < GOAL.goal + 2; i++) {
      const out = advance(progress, GOAL)
      progress = out.progress
      rewards.push(out.reward)
    }
    expect(rewards).toEqual([null, null, 'prize', null, null])
    expect(progress).toEqual({ count: 5, claimed: true })
  })

  it('never pays progress already claimed, however far it stands', () => {
    expect(advance({ count: 1, claimed: true }, GOAL)).toEqual({
      progress: { count: 2, claimed: true },
      reward: null,
    })
  })

  it('reads a tracker between none and the goal', () => {
    expect(shownProgress({ count: -2, claimed: false }, GOAL)).toBe(0)
    expect(shownProgress({ count: 2, claimed: false }, GOAL)).toBe(2)
    expect(shownProgress({ count: 9, claimed: true }, GOAL)).toBe(3)
  })

  it('says what a credit meant', () => {
    expect(goalNews({ count: 3, claimed: true }, true)).toBe('paid')
    expect(goalNews({ count: 1, claimed: false }, false)).toBe('nearer')
    expect(goalNews({ count: 4, claimed: true }, false)).toBe('past')
  })
})
