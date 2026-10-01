// The raid state machine, pure and immutable. main.ts holds a single `raid`
// value and replaces it through advance(); an illegal event returns the same
// reference so callers can detect the rejection. No three.js, no DOM.

import { CONFIG } from './config.ts'
import { getItem } from './items.ts'
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
  DELIVER: 'DELIVER',
  CALL_TRUCK: 'CALL_TRUCK',
  BUY_SACK: 'BUY_SACK',
  EXTRACT_FUEL: 'EXTRACT_FUEL',
  EXTRACT_KEEP: 'EXTRACT_KEEP',
} as const satisfies Record<RaidEvent, RaidEvent>

export function createRaid(now: number): Raid {
  return {
    state: STATES.LOADOUT,
    startedAt: now,
    loadoutEndsAt: now + CONFIG.raid.loadoutSeconds,
    carrying: 0,
    delivered: 0,
    sack: false,
    truckCalled: false,
    extract: null, // 'truck' | 'fuel' | 'keep'
    extractName: null, // station name for 'fuel'
    endedAt: null,
  }
}

export function carryLimit(raid: Raid): number {
  return raid.sack ? getItem('sack').carryLimit : CONFIG.cabbage.carryLimit
}

type AdvanceDetail = string | { arrived: boolean }

// detail: EXTRACT_FUEL passes the station name; BOARD_TRUCK from ON_FOOT
// passes { arrived: true } once the called truck is close enough to board.
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
      if (state !== STATES.ON_FOOT) return raid
      if (raid.carrying >= carryLimit(raid)) return raid
      return { ...raid, carrying: raid.carrying + 1 }
    case EVENTS.DELIVER:
      if (state !== STATES.ON_FOOT || raid.carrying === 0) return raid
      return { ...raid, delivered: raid.delivered + raid.carrying, carrying: 0 }
    case EVENTS.CALL_TRUCK:
      if (state !== STATES.ON_FOOT || raid.truckCalled) return raid
      return { ...raid, truckCalled: true }
    case EVENTS.BUY_SACK:
      if (state !== STATES.LOADOUT || raid.sack) return raid
      return { ...raid, sack: true }
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
    delivered: raid.delivered,
    carrying: raid.carrying,
    durationSeconds:
      raid.endedAt === null ? null : Math.round(raid.endedAt - raid.startedAt),
    extract: raid.extract,
    extractName: raid.extractName,
  }
}
