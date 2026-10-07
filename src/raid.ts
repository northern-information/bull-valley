// The raid state machine, pure and immutable. game.ts holds a single `raid`
// value and replaces it through advance(); an illegal event returns the same
// reference so callers can detect the rejection. No three.js, no DOM.

import { CONFIG } from './config.ts'
import type { Raid, RaidEvent, RaidState, RaidSummary } from './interfaces.ts'

export const STATES = {
  LOADOUT: 'LOADOUT',
  RIDING: 'RIDING',
  ON_FOOT: 'ON_FOOT',
  EXTRACTED: 'EXTRACTED',
} as const satisfies Record<RaidState, RaidState>

export const EVENTS = {
  BOARD_TRUCK: 'BOARD_TRUCK',
  TIMER_EXPIRED: 'TIMER_EXPIRED',
  HOP_OUT: 'HOP_OUT',
  PICK_CABBAGE: 'PICK_CABBAGE',
  DROP_CABBAGE: 'DROP_CABBAGE',
  CALL_TRUCK: 'CALL_TRUCK',
  EXTRACT_FUEL: 'EXTRACT_FUEL',
  EXTRACT_KEEP: 'EXTRACT_KEEP',
  STRUCK: 'STRUCK',
} as const satisfies Record<RaidEvent, RaidEvent>

export function createRaid(now: number): Raid {
  return {
    state: STATES.LOADOUT,
    startedAt: now,
    loadoutEndsAt: now + CONFIG.raid.loadoutSeconds,
    carrying: 0,
    truckCalled: false,
    extract: null, // 'truck' | 'fuel' | 'keep'
    extractName: null, // station name for 'fuel'
    endedAt: null,
    deaths: 0,
  }
}

// Whether the arms can take another cabbage: on foot, with room. The valley
// holds a raider to the same limit (sharedraid.ts).
export function canPick(raid: Raid): boolean {
  return (
    raid.state === STATES.ON_FOOT && raid.carrying < CONFIG.cabbage.carryLimit
  )
}

// Whether the lobby clock has run out on a truck still waiting. Played
// alone, the client asks this every frame; in the shared valley the server
// decides when the truck leaves.
export function timedOut(raid: Raid, clock: number): boolean {
  return raid.state === STATES.LOADOUT && clock > raid.loadoutEndsAt
}

type AdvanceDetail = string | { arrived: boolean } | { count: number }

// detail: EXTRACT_FUEL passes the station name; BOARD_TRUCK from ON_FOOT
// passes { arrived: true } once the called truck is close enough to board;
// DROP_CABBAGE passes { count }, the cabbages set down.
export function advance(
  raid: Raid,
  event: RaidEvent,
  now: number,
  detail?: AdvanceDetail
): Raid {
  const { state } = raid
  switch (event) {
    case EVENTS.BOARD_TRUCK:
      if (state === STATES.LOADOUT) return { ...raid, state: STATES.RIDING }
      if (
        state === STATES.ON_FOOT &&
        raid.truckCalled &&
        typeof detail === 'object' &&
        'arrived' in detail &&
        detail.arrived
      ) {
        return {
          ...raid,
          state: STATES.EXTRACTED,
          extract: 'truck',
          endedAt: now,
        }
      }
      return raid
    case EVENTS.TIMER_EXPIRED:
      if (state !== STATES.LOADOUT) return raid
      return { ...raid, state: STATES.ON_FOOT }
    case EVENTS.HOP_OUT:
      if (state !== STATES.RIDING) return raid
      return { ...raid, state: STATES.ON_FOOT }
    case EVENTS.PICK_CABBAGE:
      if (!canPick(raid)) return raid
      return { ...raid, carrying: raid.carrying + 1 }
    case EVENTS.DROP_CABBAGE: {
      const count =
        typeof detail === 'object' && 'count' in detail ? detail.count : 0
      if (state !== STATES.ON_FOOT || count < 1 || count > raid.carrying) {
        return raid
      }
      return { ...raid, carrying: raid.carrying - count }
    }
    case EVENTS.CALL_TRUCK:
      if (state !== STATES.ON_FOOT || raid.truckCalled) return raid
      return { ...raid, truckCalled: true }
    case EVENTS.EXTRACT_FUEL:
      if (state !== STATES.ON_FOOT) return raid
      return {
        ...raid,
        state: STATES.EXTRACTED,
        extract: 'fuel',
        extractName: typeof detail === 'string' ? detail : null,
        endedAt: now,
      }
    case EVENTS.EXTRACT_KEEP:
      if (state !== STATES.ON_FOOT) return raid
      return { ...raid, state: STATES.EXTRACTED, extract: 'keep', endedAt: now }
    case EVENTS.STRUCK:
      // A shadowman's touch. It costs the walk back from the Citgo and
      // nothing else: cargo, pockets and the truck call all survive.
      if (state !== STATES.ON_FOOT) return raid
      return { ...raid, deaths: raid.deaths + 1 }
    default:
      return raid
  }
}

// The loadout countdown as m:ss, rounded up to the whole second and never
// below 0:00.
export function loadoutClock(raid: Raid, now: number): string {
  const left = Math.max(0, Math.ceil(raid.loadoutEndsAt - now))
  return `${Math.floor(left / 60)}:${String(left % 60).padStart(2, '0')}`
}

export function summary(raid: Raid): RaidSummary {
  return {
    carrying: raid.carrying,
    durationSeconds:
      raid.endedAt === null ? null : Math.round(raid.endedAt - raid.startedAt),
    extract: raid.extract,
    extractName: raid.extractName,
    deaths: raid.deaths,
  }
}
