import { describe, expect, it } from 'vitest'
import { CONFIG } from '../../src/config.ts'
import {
  advance,
  canPick,
  createRaid,
  EVENTS,
  loadoutClock,
  STATES,
  summary,
  timedOut,
} from '../../src/raid.ts'

describe('raid state machine', () => {
  it('starts in LOADOUT with the truck timer set', () => {
    const raid = createRaid(100)
    expect(raid.state).toBe(STATES.LOADOUT)
    expect(raid.loadoutEndsAt).toBe(100 + CONFIG.raid.loadoutSeconds)
    expect(raid.carrying).toBe(0)
  })

  it('walks the happy path: board, hop out, pick, extract', () => {
    let raid = createRaid(0)
    raid = advance(raid, EVENTS.BOARD_TRUCK, 10)
    expect(raid.state).toBe(STATES.RIDING)
    raid = advance(raid, EVENTS.HOP_OUT, 60)
    expect(raid.state).toBe(STATES.ON_FOOT)
    raid = advance(raid, EVENTS.PICK_CABBAGE, 100)
    raid = advance(raid, EVENTS.PICK_CABBAGE, 110)
    expect(raid.carrying).toBe(2)
    raid = advance(raid, EVENTS.EXTRACT_FUEL, 300, 'Citgo')
    expect(raid.state).toBe(STATES.EXTRACTED)
    expect(raid.extract).toBe('fuel')
    expect(raid.extractName).toBe('Citgo')
    expect(raid.endedAt).toBe(300)
  })

  it('drops you on foot when the timer expires', () => {
    let raid = createRaid(0)
    raid = advance(raid, EVENTS.TIMER_EXPIRED, 300)
    expect(raid.state).toBe(STATES.ON_FOOT)
    // The truck has left; boarding it is no longer legal until called.
    expect(advance(raid, EVENTS.BOARD_TRUCK, 301)).toBe(raid)
  })

  it('returns the same reference for illegal transitions', () => {
    const raid = createRaid(0)
    expect(advance(raid, EVENTS.HOP_OUT, 1)).toBe(raid)
    expect(advance(raid, EVENTS.PICK_CABBAGE, 1)).toBe(raid)
    expect(advance(raid, EVENTS.EXTRACT_FUEL, 1)).toBe(raid)
    expect(advance(raid, EVENTS.CALL_TRUCK, 1)).toBe(raid)
  })

  it('lets the timer expire only in LOADOUT', () => {
    let raid = createRaid(0)
    raid = advance(raid, EVENTS.BOARD_TRUCK, 10)
    expect(advance(raid, EVENTS.TIMER_EXPIRED, 300)).toBe(raid)
    raid = advance(raid, EVENTS.HOP_OUT, 60)
    expect(advance(raid, EVENTS.TIMER_EXPIRED, 300)).toBe(raid)
  })

  it('extracts at the Keep only on foot', () => {
    let raid = createRaid(0)
    expect(advance(raid, EVENTS.EXTRACT_KEEP, 1)).toBe(raid)
    raid = advance(raid, EVENTS.BOARD_TRUCK, 10)
    expect(advance(raid, EVENTS.EXTRACT_KEEP, 11)).toBe(raid)
  })

  it('extracts at a station with no name when the detail is not a name', () => {
    let raid = createRaid(0)
    raid = advance(raid, EVENTS.TIMER_EXPIRED, 300)
    const out = advance(raid, EVENTS.EXTRACT_FUEL, 400, { arrived: true })
    expect(out.state).toBe(STATES.EXTRACTED)
    expect(out.extract).toBe('fuel')
    expect(out.extractName).toBeNull()
    expect(advance(raid, EVENTS.EXTRACT_FUEL, 400).extractName).toBeNull()
  })

  it('ignores an event it does not know', () => {
    const raid = createRaid(0)
    // An event from outside the table, as a stale or corrupt caller might send.
    const unknown = 'DANCE' as unknown as Parameters<typeof advance>[1]
    expect(advance(raid, unknown, 1)).toBe(raid)
  })

  it('rejects cabbages past the carry limit', () => {
    let raid = createRaid(0)
    raid = advance(raid, EVENTS.TIMER_EXPIRED, 300)
    for (let i = 0; i < 10; i++) raid = advance(raid, EVENTS.PICK_CABBAGE, 310)
    expect(raid.carrying).toBe(CONFIG.cabbage.carryLimit)
  })

  it('extracts by called truck only after it arrives', () => {
    let raid = createRaid(0)
    raid = advance(raid, EVENTS.TIMER_EXPIRED, 300)
    raid = advance(raid, EVENTS.CALL_TRUCK, 310)
    expect(raid.truckCalled).toBe(true)
    // Idempotent call, boarding before arrival is refused.
    expect(advance(raid, EVENTS.CALL_TRUCK, 311)).toBe(raid)
    expect(advance(raid, EVENTS.BOARD_TRUCK, 312)).toBe(raid)
    raid = advance(raid, EVENTS.BOARD_TRUCK, 400, { arrived: true })
    expect(raid.state).toBe(STATES.EXTRACTED)
    expect(raid.extract).toBe('truck')
  })

  it('summarizes the raid', () => {
    let raid = createRaid(10)
    raid = advance(raid, EVENTS.TIMER_EXPIRED, 300)
    raid = advance(raid, EVENTS.PICK_CABBAGE, 310)
    raid = advance(raid, EVENTS.PICK_CABBAGE, 311)
    raid = advance(raid, EVENTS.EXTRACT_KEEP, 400)
    expect(summary(raid)).toEqual({
      carrying: 2,
      durationSeconds: 390,
      extract: 'keep',
      extractName: null,
      deaths: 0,
    })
  })

  it('gives no duration for a raid still under way', () => {
    let raid = createRaid(10)
    raid = advance(raid, EVENTS.TIMER_EXPIRED, 300)
    expect(summary(raid)).toEqual({
      carrying: 0,
      durationSeconds: null,
      extract: null,
      extractName: null,
      deaths: 0,
    })
  })

  it("counts a shadowman's touch and takes nothing else", () => {
    let raid = createRaid(0)
    expect(advance(raid, EVENTS.STRUCK, 1)).toBe(raid)
    raid = advance(raid, EVENTS.BOARD_TRUCK, 10)
    expect(advance(raid, EVENTS.STRUCK, 11)).toBe(raid)
    raid = advance(raid, EVENTS.HOP_OUT, 60)
    raid = advance(raid, EVENTS.PICK_CABBAGE, 100)
    raid = advance(raid, EVENTS.CALL_TRUCK, 110)
    const struck = advance(raid, EVENTS.STRUCK, 120)
    expect(struck).toEqual({ ...raid, deaths: 1 })
    expect(advance(struck, EVENTS.STRUCK, 130).deaths).toBe(2)
    const out = advance(struck, EVENTS.EXTRACT_KEEP, 200)
    expect(advance(out, EVENTS.STRUCK, 201)).toBe(out)
    expect(summary(out).deaths).toBe(1)
  })

  it('shows the loadout countdown as m:ss, rounded up, never below 0:00', () => {
    const raid = createRaid(0)
    const end = raid.loadoutEndsAt
    expect(loadoutClock(raid, end - 65)).toBe('1:05')
    expect(loadoutClock(raid, end - 9.2)).toBe('0:10')
    expect(loadoutClock(raid, end + 3)).toBe('0:00')
  })
})

describe('canPick', () => {
  it('takes a cabbage only on foot with room in the arms', () => {
    let raid = createRaid(0)
    expect(canPick(raid)).toBe(false)
    raid = advance(raid, EVENTS.TIMER_EXPIRED, 1)
    for (let i = 0; i < CONFIG.cabbage.carryLimit; i++) {
      expect(canPick(raid)).toBe(true)
      raid = advance(raid, EVENTS.PICK_CABBAGE, 2)
    }
    expect(canPick(raid)).toBe(false)
  })
})

describe('timedOut', () => {
  it('runs out only past the lobby clock, and only in the lobby', () => {
    const raid = createRaid(0)
    expect(timedOut(raid, raid.loadoutEndsAt)).toBe(false)
    expect(timedOut(raid, raid.loadoutEndsAt + 0.01)).toBe(true)
    const riding = advance(raid, EVENTS.BOARD_TRUCK, 1)
    expect(timedOut(riding, riding.loadoutEndsAt + 1)).toBe(false)
  })
})
