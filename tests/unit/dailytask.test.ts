import { describe, expect, it } from 'vitest'
import {
  DAILY_TASK,
  NO_TASK,
  onDay,
  shownCount,
  tallyTask,
  taskNews,
} from '../../src/dailytask.ts'
import type { TaskProgress } from '../../src/dailytask.ts'

const DAY = '2026-10-07'
const NEXT = '2026-10-08'

// Burns `n` shadowmen on `day`, from `from`; the rewards paid on the way.
function burn(n: number, day: string, from: TaskProgress = NO_TASK) {
  let progress = from
  const rewards: number[] = []
  for (let i = 0; i < n; i++) {
    const out = tallyTask(progress, day)
    progress = out.progress
    if (out.reward !== null) rewards.push(out.reward)
  }
  return { progress, rewards }
}

describe('the daily task', () => {
  it('asks for five shadowmen burned and pays into the wallet', () => {
    expect(DAILY_TASK.goal).toBe(5)
    expect(DAILY_TASK.reward).toBeGreaterThan(0)
  })

  it('counts each burn, and pays once on the burn that reaches the goal', () => {
    const four = burn(DAILY_TASK.goal - 1, DAY)
    expect(four.progress).toEqual({ day: DAY, count: 4, claimed: false })
    expect(four.rewards).toEqual([])
    const fifth = tallyTask(four.progress, DAY)
    expect(fifth.progress).toEqual({ day: DAY, count: 5, claimed: true })
    expect(fifth.reward).toBe(DAILY_TASK.reward)
    // More that day count on, and pay nothing.
    const more = burn(3, DAY, fifth.progress)
    expect(more.progress).toEqual({ day: DAY, count: 8, claimed: true })
    expect(more.rewards).toEqual([])
  })

  it('starts afresh when the day turns, and pays again', () => {
    const done = burn(DAILY_TASK.goal, DAY).progress
    const first = tallyTask(done, NEXT)
    expect(first.progress).toEqual({ day: NEXT, count: 1, claimed: false })
    expect(burn(DAILY_TASK.goal, NEXT, done).rewards).toEqual([
      DAILY_TASK.reward,
    ])
  })

  it("reads an earlier day's progress as nothing done", () => {
    const done = burn(7, DAY).progress
    expect(onDay(done, DAY)).toBe(done)
    expect(onDay(done, NEXT)).toEqual({ day: NEXT, count: 0, claimed: false })
    expect(shownCount(done, DAY)).toBe(DAILY_TASK.goal)
    expect(shownCount(done, NEXT)).toBe(0)
    expect(shownCount(NO_TASK, DAY)).toBe(0)
  })

  it('says what a burn meant to the raider', () => {
    const { progress } = burn(1, DAY)
    expect(taskNews(progress, false)).toBe('burned')
    const done = burn(DAILY_TASK.goal, DAY).progress
    expect(taskNews(done, true)).toBe('done')
    expect(taskNews(done, false)).toBe('past')
  })
})
