// The daily task: one small job a Central day for every account, beside
// the season (season.ts). Today's is to burn DAILY_TASK.goal shadowmen;
// every raider whose beam was on a shadowman as it burst is credited with
// it (sharedworld.ts rule 16), and the burn that finishes the task pays
// its reward into the wallet, once a day. The day turns at midnight
// Central (daily.ts), and the count with it.
//
// Pure, no Three. The progress is the account's, kept in D1 by the valley
// (worker/packs.ts); this says what a burn does to it.

export interface DailyTask {
  // The key the account's progress is kept under.
  id: string
  // Shadowmen it takes.
  goal: number
  // Cents into the wallet when it is done.
  reward: number
}

export const DAILY_TASK: DailyTask = {
  id: 'burn-shadowmen',
  goal: 5,
  reward: 5_00,
}

// One account's progress on the task on one day (a daily.ts dayKey):
// shadowmen burned with their beam on them, and whether the reward is paid.
export interface TaskProgress {
  day: string
  count: number
  claimed: boolean
}

// Nothing done, on no day.
export const NO_TASK: TaskProgress = { day: '', count: 0, claimed: false }

// The progress as it stands on `day`: kept progress from an earlier day
// counts for nothing.
export function onDay(progress: TaskProgress, day: string): TaskProgress {
  return progress.day === day ? progress : { day, count: 0, claimed: false }
}

// One more shadowman burned on `day`: the progress after it, and the
// reward in cents when this is the burn that finishes the task (paid once
// a day, however many follow).
export function tallyTask(
  progress: TaskProgress,
  day: string,
  task: DailyTask = DAILY_TASK
): { progress: TaskProgress; reward: number | null } {
  const today = onDay(progress, day)
  const count = today.count + 1
  const due = !today.claimed && count >= task.goal
  return {
    progress: { day, count, claimed: today.claimed || due },
    reward: due ? task.reward : null,
  }
}

// How far along the tracker reads on `day`: never past the goal.
export function shownCount(
  progress: TaskProgress,
  day: string,
  task: DailyTask = DAILY_TASK
): number {
  return Math.min(task.goal, Math.max(0, onDay(progress, day).count))
}

// What a credited burn means to the raider: the one that paid the day's
// reward, one more toward the goal, or one past a task already done today.
export type TaskNews = 'done' | 'burned' | 'past'

export function taskNews(progress: TaskProgress, rewarded: boolean): TaskNews {
  if (rewarded) return 'done'
  return progress.claimed ? 'past' : 'burned'
}
