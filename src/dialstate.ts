// Pure: what Bull Valley Dial-Up knows of the account (sharedworld.ts rule
// 29), read off the valley's frames (`applyFrame`): the pack, the locker
// and the wallet, the Cabbage Stand, the XP, the geometrie and the wards,
// the season, the daily task, the Book of Shadows and the Citgos found,
// and the world as the last snapshot left it; and the raider's record as
// the lobby shows it (`raiderStats`). The phone keeps nothing of
// its own: every number on it is the valley's last word. Each frame may
// also leave a line for the screen to say (`said`), and the stand's and
// the locker's asks wait on an answer (`pending`). dialmain.ts feeds it.

import { BOOK } from './book.ts'
import { isLevels } from './buffs.ts'
import { NO_CITGOS } from './citgos.ts'
import { copy } from './copy.ts'
import { cosmeticById, toCosmetics } from './cosmetics.ts'
import { DAILY_TASK, NO_TASK, shownCount } from './dailytask.ts'
import { BASE_GEOMETRIE } from './health.ts'
import { toInventory } from './inventory.ts'
import { barOf } from './progression.ts'
import { NO_PROGRESS, SEASON, shownKills } from './season.ts'
import { isStandLedger, refusalLine, standNews } from './stand.ts'
import type { CitgoLog } from './citgos.ts'
import type { CosmeticId } from './cosmetics.ts'
import type { TaskProgress } from './dailytask.ts'
import type { Inventory } from './interfaces.ts'
import type { GeometrieLevels, ServerMessage, WorldWire } from './protocol.ts'
import type { SeasonProgress } from './season.ts'
import type { StandLedger } from './stand.ts'

export interface DialState {
  // Our id in the valley, from the welcome; null before it.
  id: string | null
  pack: Inventory
  stash: Inventory
  // Cents.
  cash: number
  cosmetics: CosmeticId[]
  xp: number
  stand: StandLedger | null
  health: number
  healthMax: number
  wards: GeometrieLevels
  season: SeasonProgress
  task: TaskProgress
  // The Book of Shadows entries found (book.ts ids).
  book: string[]
  citgos: CitgoLog
  // The last snapshot of the world, or null when no 3D raider has opened
  // one.
  world: WorldWire | null
  // The last word for the screen, and when (local ms).
  said: { text: string; at: number } | null
  // An ask the valley has not answered yet.
  pending: { stand: boolean; locker: boolean }
}

export const NO_WARDS: GeometrieLevels = {
  high: 0,
  stimulated: 0,
  drunk: 0,
  tripping: 0,
}

export const DIALED: DialState = {
  id: null,
  pack: {},
  stash: {},
  cash: 0,
  cosmetics: [],
  xp: 0,
  stand: null,
  health: BASE_GEOMETRIE,
  healthMax: BASE_GEOMETRIE,
  wards: NO_WARDS,
  season: NO_PROGRESS,
  task: NO_TASK,
  book: [],
  citgos: NO_CITGOS,
  world: null,
  said: null,
  pending: { stand: false, locker: false },
}

// The state with `text` said at `now`.
function saying(s: DialState, text: string | null, now: number): DialState {
  return text ? { ...s, said: { text, at: now } } : s
}

// An ask sent: the stand's or the locker's, waiting on the valley.
export function asked(s: DialState, what: 'stand' | 'locker'): DialState {
  return { ...s, pending: { ...s.pending, [what]: true }, said: null }
}

// The state after one frame from the valley, at local `now`.
export function applyFrame(
  s: DialState,
  msg: ServerMessage,
  now: number
): DialState {
  switch (msg.type) {
    case 'welcome':
      return {
        ...s,
        id: msg.id,
        pack: toInventory(msg.pack),
        stash: toInventory(msg.stash),
        cash: msg.cash,
        cosmetics: toCosmetics(msg.cosmetics),
        xp: msg.xp,
        stand: isStandLedger(msg.stand) ? msg.stand : null,
        health: msg.health,
        healthMax: msg.healthMax,
        wards: isLevels(msg.geometrie) ? msg.geometrie : NO_WARDS,
        season: { kills: msg.season.kills, claimed: msg.season.claimed },
        task: {
          day: msg.task.day,
          count: msg.task.count,
          claimed: msg.task.claimed,
        },
        book: [...msg.book],
        citgos: msg.citgos,
        world: msg.world,
        pending: { stand: false, locker: false },
      }
    case 'pack':
      return {
        ...s,
        pack: toInventory(msg.pack),
        stash: toInventory(msg.stash),
        cash: msg.cash,
        cosmetics: toCosmetics(msg.cosmetics),
        pending: { ...s.pending, locker: false },
      }
    case 'stand': {
      if (!isStandLedger(msg.stand)) return s
      const next = {
        ...s,
        stand: msg.stand,
        pending: { ...s.pending, stand: false },
      }
      return saying(next, standNews(msg, s.stand), now)
    }
    case 'xp':
      return { ...s, xp: Math.max(s.xp, msg.xp) }
    case 'health':
      return { ...s, health: msg.health, healthMax: msg.max }
    case 'geometrie':
      return isLevels(msg.geometrie) ? { ...s, wards: msg.geometrie } : s
    case 'world':
      return msg.world ? { ...s, world: msg.world } : s
    case 'season':
      return {
        ...s,
        season: { kills: msg.season.kills, claimed: msg.season.claimed },
      }
    case 'task':
      return {
        ...s,
        task: {
          day: msg.task.day,
          count: msg.task.count,
          claimed: msg.task.claimed,
        },
      }
    case 'book':
      return {
        ...s,
        book: [...s.book, ...msg.found.filter((id) => !s.book.includes(id))],
      }
    case 'citgos':
      return { ...s, citgos: msg.citgos }
    case 'nack':
      switch (msg.re) {
        case 'stand-stock':
        case 'stand-collect':
        case 'stand-upgrade':
          return saying(
            { ...s, pending: { ...s.pending, stand: false } },
            refusalLine(msg.reason),
            now
          )
        case 'stow':
        case 'unstow':
          return saying(
            { ...s, pending: { ...s.pending, locker: false } },
            copy('log.locker_refused'),
            now
          )
        default:
          return s
      }
    default:
      return s
  }
}

// One line of the raider's record: what it counts, how far along, and how
// full its bar reads (0 to 1), or null where it has none.
export interface RaiderStat {
  id: 'xp' | 'season' | 'task' | 'book' | 'citgos' | 'worn'
  label: string
  value: string
  share: number | null
}

// The raider's record as the lobby shows it, on the Central `day`
// (daily.ts dayKey) for the daily task.
export function raiderStats(s: DialState, day: string): RaiderStat[] {
  const bar = barOf(s.xp)
  const kills = shownKills(s.season)
  const burned = shownCount(s.task, day)
  const found = new Set(s.book).size
  const worn = s.cosmetics.map((id) => cosmeticById(id)?.label ?? id)
  const stats: RaiderStat[] = [
    {
      id: 'xp',
      label: copy('dialup.raider.xp'),
      value:
        bar.span === null
          ? copy('dialup.raider.xp_max')
          : copy('dialup.raider.of', { done: bar.into, goal: bar.span }),
      share: bar.span === null ? 1 : bar.into / Math.max(1, bar.span),
    },
    {
      id: 'season',
      label: copy('dialup.raider.season'),
      value: s.season.claimed
        ? copy('dialup.raider.done')
        : copy('dialup.raider.of', { done: kills, goal: SEASON.goal }),
      share: kills / SEASON.goal,
    },
    {
      id: 'task',
      label: copy('dialup.raider.task'),
      value:
        s.task.day === day && s.task.claimed
          ? copy('dialup.raider.done')
          : copy('dialup.raider.of', { done: burned, goal: DAILY_TASK.goal }),
      share: burned / DAILY_TASK.goal,
    },
    {
      id: 'book',
      label: copy('dialup.raider.book'),
      value: copy('dialup.raider.of', { done: found, goal: BOOK.length }),
      share: found / BOOK.length,
    },
    {
      id: 'citgos',
      label: copy('dialup.raider.citgos'),
      value: String(s.citgos.visited.length),
      share: null,
    },
  ]
  if (worn.length > 0) {
    stats.push({
      id: 'worn',
      label: copy('dialup.raider.worn'),
      value: worn.join(', '),
      share: null,
    })
  }
  return stats
}
