// The season: the valley run as a live service, one challenge at a time,
// each with a reward for the account that sees it through. Season One is
// The Caretaker: unmake him (caretaker.ts, two beams at once) SEASON.goal
// times and the wallet takes $100 and the pack a carton of Marlboro Reds.
// Every raider whose beam was on him when he came apart is credited
// (sharedworld.ts rule 15).
//
// Pure, no Three. The progress is the account's, kept in D1 by the valley
// (worker/packs.ts); this says what an unmaking does to it.

import { contentsOf } from './items.ts'

// What finishing the season pays: cents into the wallet, units of one kind
// into the pack.
export interface SeasonReward {
  cash: number
  kind: string
  count: number
}

export interface Season {
  // The key the account's progress is kept under.
  id: string
  number: number
  // Unmakings it takes.
  goal: number
  reward: SeasonReward
}

// A carton is ten packs.
const CARTON = 10

export const SEASON: Season = {
  id: 'caretaker',
  number: 1,
  goal: 5,
  reward: {
    cash: 100_00,
    kind: 'marlboro',
    count: CARTON * contentsOf('marlboro'),
  },
}

// One account's progress through a season: the Caretaker unmade with their
// beam on him, and whether the reward has been paid.
export interface SeasonProgress {
  kills: number
  claimed: boolean
}

export const NO_PROGRESS: SeasonProgress = { kills: 0, claimed: false }

// One more unmaking: the progress after it, and the reward when this is
// the one that finishes the season (paid once, however many follow).
export function tally(
  progress: SeasonProgress,
  season: Season = SEASON
): { progress: SeasonProgress; reward: SeasonReward | null } {
  const kills = progress.kills + 1
  const due = !progress.claimed && kills >= season.goal
  return {
    progress: { kills, claimed: progress.claimed || due },
    reward: due ? season.reward : null,
  }
}

// How far along the tracker reads: never past the goal.
export function shownKills(
  progress: SeasonProgress,
  season: Season = SEASON
): number {
  return Math.min(season.goal, Math.max(0, progress.kills))
}

// What a credited unmaking means to the raider: the one that paid the
// reward, one more toward the goal, or one past a season already done.
export type SeasonNews = 'complete' | 'unmade' | 'again'

export function newsOf(
  progress: SeasonProgress,
  rewarded: boolean
): SeasonNews {
  if (rewarded) return 'complete'
  return progress.claimed ? 'again' : 'unmade'
}
