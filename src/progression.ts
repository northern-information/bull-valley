// The raider's level: one XP bar for the account that everything a raider
// does feeds (sharedworld.ts rule 22). Burning a shadowman, a ride with
// Marx, a berry, a pickup, something passed to another raider, a unit bought, a drop the valley left taken up, a Citgo or the Keep found,
// what the Cabbage Stand pays out when collected, and the Caretaker
// burned (a big jump) each grant the XP below; the curve
// that turns XP into a level is CONFIG.progression.
//
// Pure, no Three. The XP is the account's, kept in D1 by the valley
// (worker/packs.ts); the reducer names who earned what (XpGrant), and this
// says what it is worth. Every later track feeds the bar the same way: a
// new XpSource, its XP here, and the reducer naming it.

import { CONFIG } from './config.ts'

type ProgressionConfig = typeof CONFIG.progression

// What earned the XP.
export type XpSource =
  | 'burn'
  | 'spider'
  | 'caretaker'
  | 'ride'
  | 'berry'
  | 'pickup'
  | 'purchase'
  | 'drop'
  | 'stand'
  | 'quest'
  | 'warden'
  | 'share'
  | 'citgo'
  | 'landmark'
  | 'expedition'

// The XP each grants: every grant in one table.
export const XP: Readonly<Record<XpSource, number>> = {
  // A shadowman burst in the raider's beam, and a shadow spider (twice as
  // long to burn).
  burn: 10,
  spider: 20,
  // The Caretaker burned with the raider's beam on it.
  caretaker: 250,
  // In the bed when Marx gets home (the joyride, or the ride home from a
  // whistle) or lets them off where the first one in picked (a charter).
  ride: 25,
  // The day's berry off a bush.
  berry: 5,
  // A pickup taken, a cabbage included.
  pickup: 5,
  // A unit bought off a Citgo shelf.
  purchase: 2,
  // A drop the valley left (dimes, a spider's bill, gold bullion) taken
  // up; never a raider's own drop, which could be set down and taken up
  // again for ever.
  drop: 2,
  // Each whole CONFIG.stand.xpCents the Cabbage Stand pays out when
  // collected (stand.ts standXp), so collecting often earns no more than
  // collecting once.
  stand: 1,
  // A quest finished (quests.ts): the rose laid and the key given. Once
  // an account, so it stays well under the Caretaker.
  quest: 25,
  // The Warden burst in the Undercroft, in the raider's beam.
  warden: 25,
  // Something smoked, drunk or swallowed passed to another raider (rule
  // 25). It costs the giver the unit, so it is never free to farm.
  share: 5,
  // A Citgo stood at for the first time, and a landmark's page first
  // written in the Book of Shadows (Mt. Coleman's Keep), each once an
  // account (CONFIG.bounties pays cash beside it).
  citgo: 10,
  landmark: 25,
  // An expedition home (expeditions.ts, rule 30), once for each of its
  // run's CONFIG.expeditions xp: a long run earns more than a short one,
  // and never more than burning shadows for the same hours would.
  expedition: 10,
}

export interface XpGrant {
  account: string
  source: XpSource
  // How many of the source's XP, when more than one (the stand's).
  times?: number
}

// The XP in all at which `level` begins; level 1 at none.
export function xpToReach(
  level: number,
  cfg: ProgressionConfig = CONFIG.progression
): number {
  if (level <= 1) return 0
  return Math.round(cfg.base * (level - 1) ** cfg.power)
}

// The level `xp` in all reaches, 1 to maxLevel.
export function levelOf(
  xp: number,
  cfg: ProgressionConfig = CONFIG.progression
): number {
  let level = 1
  while (level < cfg.maxLevel && xpToReach(level + 1, cfg) <= xp) level++
  return level
}

// Where `xp` in all stands on the bar: the level, the XP into it, and the
// XP the whole level takes (null at maxLevel, where the bar is full).
interface LevelBar {
  level: number
  into: number
  span: number | null
}

export function barOf(
  xp: number,
  cfg: ProgressionConfig = CONFIG.progression
): LevelBar {
  const level = levelOf(xp, cfg)
  const from = xpToReach(level, cfg)
  return {
    level,
    into: xp - from,
    span: level >= cfg.maxLevel ? null : xpToReach(level + 1, cfg) - from,
  }
}

// The XP each account earned by `grants`, summed, in the order the
// accounts first earned.
export function totals(grants: readonly XpGrant[]): Map<string, number> {
  const sums = new Map<string, number>()
  for (const { account, source, times = 1 } of grants) {
    sums.set(account, (sums.get(account) ?? 0) + XP[source] * times)
  }
  return sums
}

// The level reached, when going from `before` XP to `after` crossed into a
// new one; null when it did not.
export function levelUp(
  before: number,
  after: number,
  cfg: ProgressionConfig = CONFIG.progression
): number | null {
  const level = levelOf(after, cfg)
  return level > levelOf(before, cfg) ? level : null
}
