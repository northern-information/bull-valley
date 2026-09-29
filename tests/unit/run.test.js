import { describe, expect, it } from 'vitest'
import {
  STATES,
  EVENTS,
  createRun,
  advance,
  carryLimit,
  summary,
} from '../../src/run.js'
import { CONFIG } from '../../src/config.js'

describe('run state machine', () => {
  it('starts in LOADOUT with the truck timer set', () => {
    const run = createRun(100)
    expect(run.state).toBe(STATES.LOADOUT)
    expect(run.loadoutEndsAt).toBe(100 + CONFIG.run.loadoutSeconds)
    expect(run.carrying).toBe(0)
    expect(run.delivered).toBe(0)
  })

  it('walks the happy path: board, hop out, pick, deliver, extract', () => {
    let run = createRun(0)
    run = advance(run, EVENTS.BOARD_TRUCK, 10)
    expect(run.state).toBe(STATES.RIDING)
    run = advance(run, EVENTS.HOP_OUT, 60)
    expect(run.state).toBe(STATES.ON_FOOT)
    run = advance(run, EVENTS.PICK_CABBAGE, 100)
    run = advance(run, EVENTS.PICK_CABBAGE, 110)
    expect(run.carrying).toBe(2)
    run = advance(run, EVENTS.DELIVER, 200)
    expect(run.carrying).toBe(0)
    expect(run.delivered).toBe(2)
    run = advance(run, EVENTS.EXTRACT_FUEL, 300, 'Citgo')
    expect(run.state).toBe(STATES.EXTRACTED)
    expect(run.extract).toBe('fuel')
    expect(run.extractName).toBe('Citgo')
    expect(run.endedAt).toBe(300)
  })

  it('drops you on foot when the timer expires', () => {
    let run = createRun(0)
    run = advance(run, EVENTS.TIMER_EXPIRED, 300)
    expect(run.state).toBe(STATES.ON_FOOT)
    // The truck has left; boarding it is no longer legal until called.
    expect(advance(run, EVENTS.BOARD_TRUCK, 301)).toBe(run)
  })

  it('returns the same reference for illegal transitions', () => {
    const run = createRun(0)
    expect(advance(run, EVENTS.HOP_OUT, 1)).toBe(run)
    expect(advance(run, EVENTS.PICK_CABBAGE, 1)).toBe(run)
    expect(advance(run, EVENTS.DELIVER, 1)).toBe(run)
    expect(advance(run, EVENTS.EXTRACT_FUEL, 1)).toBe(run)
    expect(advance(run, EVENTS.CALL_TRUCK, 1)).toBe(run)
  })

  it('rejects cabbages past the carry limit, higher with the sack', () => {
    let run = createRun(0)
    run = advance(run, EVENTS.TIMER_EXPIRED, 300)
    for (let i = 0; i < 10; i++) run = advance(run, EVENTS.PICK_CABBAGE, 310)
    expect(run.carrying).toBe(CONFIG.cabbage.carryLimit)

    let sacked = createRun(0)
    sacked = advance(sacked, EVENTS.BUY_SACK, 10)
    expect(sacked.sack).toBe(true)
    expect(carryLimit(sacked)).toBe(CONFIG.cabbage.sackCarryLimit)
    sacked = advance(sacked, EVENTS.TIMER_EXPIRED, 300)
    for (let i = 0; i < 10; i++)
      sacked = advance(sacked, EVENTS.PICK_CABBAGE, 310)
    expect(sacked.carrying).toBe(CONFIG.cabbage.sackCarryLimit)
  })

  it('only sells the sack during loadout, once', () => {
    let run = createRun(0)
    run = advance(run, EVENTS.BUY_SACK, 1)
    expect(advance(run, EVENTS.BUY_SACK, 2)).toBe(run)
    let onFoot = advance(createRun(0), EVENTS.TIMER_EXPIRED, 300)
    expect(advance(onFoot, EVENTS.BUY_SACK, 301)).toBe(onFoot)
  })

  it('extracts by called truck only after it arrives', () => {
    let run = createRun(0)
    run = advance(run, EVENTS.TIMER_EXPIRED, 300)
    run = advance(run, EVENTS.CALL_TRUCK, 310)
    expect(run.truckCalled).toBe(true)
    // Idempotent call, boarding before arrival is refused.
    expect(advance(run, EVENTS.CALL_TRUCK, 311)).toBe(run)
    expect(advance(run, EVENTS.BOARD_TRUCK, 312)).toBe(run)
    run = advance(run, EVENTS.BOARD_TRUCK, 400, { arrived: true })
    expect(run.state).toBe(STATES.EXTRACTED)
    expect(run.extract).toBe('truck')
  })

  it('summarizes the run', () => {
    let run = createRun(10)
    run = advance(run, EVENTS.TIMER_EXPIRED, 300)
    run = advance(run, EVENTS.PICK_CABBAGE, 310)
    run = advance(run, EVENTS.PICK_CABBAGE, 311)
    run = advance(run, EVENTS.DELIVER, 320)
    run = advance(run, EVENTS.PICK_CABBAGE, 330)
    run = advance(run, EVENTS.EXTRACT_KEEP, 400)
    expect(summary(run)).toEqual({
      delivered: 2,
      carrying: 1,
      durationSeconds: 390,
      extract: 'keep',
      extractName: null,
    })
  })
})
