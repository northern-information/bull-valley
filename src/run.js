// The run state machine, pure and immutable. main.js holds a single `run`
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

export function createRun(now) {
  return {
    state: STATES.LOADOUT,
    startedAt: now,
    loadoutEndsAt: now + CONFIG.run.loadoutSeconds,
    carrying: 0,
    delivered: 0,
    sack: false,
    truckCalled: false,
    extract: null, // 'truck' | 'fuel' | 'keep'
    extractName: null, // station name for 'fuel'
    endedAt: null,
  }
}

export function carryLimit(run) {
  return run.sack ? CONFIG.cabbage.sackCarryLimit : CONFIG.cabbage.carryLimit
}

// detail: EXTRACT_FUEL passes the station name; BOARD_TRUCK from ON_FOOT
// passes { arrived: true } once the called truck is close enough to board.
export function advance(run, event, now, detail) {
  const { state } = run
  switch (event) {
    case EVENTS.BOARD_TRUCK:
      if (state === STATES.LOADOUT) return { ...run, state: STATES.RIDING }
      if (state === STATES.ON_FOOT && run.truckCalled && detail?.arrived) {
        return {
          ...run,
          state: STATES.EXTRACTED,
          extract: 'truck',
          endedAt: now,
        }
      }
      return run
    case EVENTS.TIMER_EXPIRED:
      if (state !== STATES.LOADOUT) return run
      return { ...run, state: STATES.ON_FOOT }
    case EVENTS.HOP_OUT:
      if (state !== STATES.RIDING) return run
      return { ...run, state: STATES.ON_FOOT }
    case EVENTS.PICK_CABBAGE:
      if (state !== STATES.ON_FOOT) return run
      if (run.carrying >= carryLimit(run)) return run
      return { ...run, carrying: run.carrying + 1 }
    case EVENTS.DELIVER:
      if (state !== STATES.ON_FOOT || run.carrying === 0) return run
      return { ...run, delivered: run.delivered + run.carrying, carrying: 0 }
    case EVENTS.CALL_TRUCK:
      if (state !== STATES.ON_FOOT || run.truckCalled) return run
      return { ...run, truckCalled: true }
    case EVENTS.BUY_SACK:
      if (state !== STATES.LOADOUT || run.sack) return run
      return { ...run, sack: true }
    case EVENTS.EXTRACT_FUEL:
      if (state !== STATES.ON_FOOT) return run
      return {
        ...run,
        state: STATES.EXTRACTED,
        extract: 'fuel',
        extractName: detail || null,
        endedAt: now,
      }
    case EVENTS.EXTRACT_KEEP:
      if (state !== STATES.ON_FOOT) return run
      return { ...run, state: STATES.EXTRACTED, extract: 'keep', endedAt: now }
    default:
      return run
  }
}

export function summary(run) {
  return {
    delivered: run.delivered,
    carrying: run.carrying,
    durationSeconds:
      run.endedAt === null ? null : Math.round(run.endedAt - run.startedAt),
    extract: run.extract,
    extractName: run.extractName,
  }
}
