// Pure: a goal an account works toward, a credit at a time, with a reward
// paid once on the credit that reaches it and never again. The season
// (season.ts) and the daily task (dailytask.ts) are each one of these over
// their own progress shape; this is the counting they share.

export interface Goal<R> {
  // Credits it takes.
  goal: number
  reward: R
}

export interface GoalProgress {
  count: number
  // Whether the reward has been paid.
  claimed: boolean
}

export const NO_GOAL_PROGRESS: GoalProgress = { count: 0, claimed: false }

// One more credit: the progress after it, and the reward when this is the
// one that reaches the goal (paid once, however many follow).
export function advance<R>(
  progress: GoalProgress,
  goal: Goal<R>
): { progress: GoalProgress; reward: R | null } {
  const count = progress.count + 1
  const due = !progress.claimed && count >= goal.goal
  return {
    progress: { count, claimed: progress.claimed || due },
    reward: due ? goal.reward : null,
  }
}

// How far along a tracker reads: never past the goal, never below none.
export function shownProgress(
  progress: GoalProgress,
  goal: Goal<unknown>
): number {
  return Math.min(goal.goal, Math.max(0, progress.count))
}

// What a credit meant to the raider: the one that paid, one more toward
// the goal, or one past a goal already reached.
export type GoalNews = 'paid' | 'nearer' | 'past'

export function goalNews(progress: GoalProgress, rewarded: boolean): GoalNews {
  if (rewarded) return 'paid'
  return progress.claimed ? 'past' : 'nearer'
}
