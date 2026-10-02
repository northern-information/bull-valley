import { describe, expect, it } from 'vitest'
import { CONFIG } from '../../src/config.ts'
import { getItem } from '../../src/items.ts'
import {
  advance,
  carryLimit,
  createRaid,
  EVENTS,
  loadoutClock,
  STATES,
  summary,
} from '../../src/raid.ts'

describe('raid state machine', () => {
  it('starts in LOADOUT with the truck timer set', () => {
    const raid = createRaid(100)
    expect(raid.state).toBe(STATES.LOADOUT)
    expect(raid.loadoutEndsAt).toBe(100 + CONFIG.raid.loadoutSeconds)
    expect(raid.carrying).toBe(0)
    expect(raid.delivered).toBe(0)
  })

  it('walks the happy path: board, hop out, pick, deliver, extract', () => {
    let raid = createRaid(0)
    raid = advance(raid, EVENTS.BOARD_TRUCK, 10)
    expect(raid.state).toBe(STATES.RIDING)
    raid = advance(raid, EVENTS.HOP_OUT, 60)
    expect(raid.state).toBe(STATES.ON_FOOT)
    raid = advance(raid, EVENTS.PICK_CABBAGE, 100)
    raid = advance(raid, EVENTS.PICK_CABBAGE, 110)
    expect(raid.carrying).toBe(2)
    raid = advance(raid, EVENTS.DELIVER, 200)
    expect(raid.carrying).toBe(0)
    expect(raid.delivered).toBe(2)
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
    expect(advance(raid, EVENTS.DELIVER, 1)).toBe(raid)
    expect(advance(raid, EVENTS.EXTRACT_FUEL, 1)).toBe(raid)
    expect(advance(raid, EVENTS.CALL_TRUCK, 1)).toBe(raid)
  })

  it('rejects cabbages past the carry limit, higher with the sack', () => {
    let raid = createRaid(0)
    raid = advance(raid, EVENTS.TIMER_EXPIRED, 300)
    for (let i = 0; i < 10; i++) raid = advance(raid, EVENTS.PICK_CABBAGE, 310)
    expect(raid.carrying).toBe(CONFIG.cabbage.carryLimit)

    let sacked = createRaid(0)
    sacked = advance(sacked, EVENTS.BUY_SACK, 10)
    expect(sacked.sack).toBe(true)
    expect(carryLimit(sacked)).toBe(getItem('sack').carryLimit)
    sacked = advance(sacked, EVENTS.TIMER_EXPIRED, 300)
    for (let i = 0; i < 10; i++)
      sacked = advance(sacked, EVENTS.PICK_CABBAGE, 310)
    expect(sacked.carrying).toBe(getItem('sack').carryLimit)
  })

  it('only sells the sack during loadout, once', () => {
    let raid = createRaid(0)
    raid = advance(raid, EVENTS.BUY_SACK, 1)
    expect(advance(raid, EVENTS.BUY_SACK, 2)).toBe(raid)
    const onFoot = advance(createRaid(0), EVENTS.TIMER_EXPIRED, 300)
    expect(advance(onFoot, EVENTS.BUY_SACK, 301)).toBe(onFoot)
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
    raid = advance(raid, EVENTS.DELIVER, 320)
    raid = advance(raid, EVENTS.PICK_CABBAGE, 330)
    raid = advance(raid, EVENTS.EXTRACT_KEEP, 400)
    expect(summary(raid)).toEqual({
      delivered: 2,
      carrying: 1,
      durationSeconds: 390,
      extract: 'keep',
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
