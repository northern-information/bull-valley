// The raid state machine, pure and immutable. main.js holds a single `raid`
// value and replaces it through advance(); an illegal event returns the same
// reference so callers can detect the rejection. No three.js, no DOM.

import { CONFIG } from './config.js'

export const STATES = {
  LOADOUT: 'LOADOUT',
  RIDING: 'RIDING',
  ON_FOOT: 'ON_FOOT',
  EXTRACTED: 'EXTRACTED',
}

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
}

export function createRaid(now) {
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

export function carryLimit(raid) {
  return raid.sack ? CONFIG.cabbage.sackCarryLimit : CONFIG.cabbage.carryLimit
}

// detail: EXTRACT_FUEL passes the station name; BOARD_TRUCK from ON_FOOT
// passes { arrived: true } once the called truck is close enough to board.
export function advance(raid, event, now, detail) {
  const { state } = raid
  switch (event) {
    case EVENTS.BOARD_TRUCK:
      if (state === STATES.LOADOUT) return { ...raid, state: STATES.RIDING }
      if (state === STATES.ON_FOOT && raid.truckCalled && detail?.arrived) {
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
        extractName: detail || null,
        endedAt: now,
      }
    case EVENTS.EXTRACT_KEEP:
      if (state !== STATES.ON_FOOT) return raid
      return { ...raid, state: STATES.EXTRACTED, extract: 'keep', endedAt: now }
    default:
      return raid
  }
}

export function summary(raid) {
  return {
    delivered: raid.delivered,
    carrying: raid.carrying,
    durationSeconds:
      raid.endedAt === null ? null : Math.round(raid.endedAt - raid.startedAt),
    extract: raid.extract,
    extractName: raid.extractName,
  }
}
