import { describe, expect, it } from 'vitest'
import {
  connected,
  HANDSHAKE_MS,
  HOLD_MS,
  IDLE,
  noCarrier,
  SCRIPT,
  signedOut,
  tap,
  view,
} from '../../src/modem.ts'

const T = 1000

describe('the modem', () => {
  it('waits for a tap before it dials', () => {
    expect(view(IDLE, 0)).toEqual({
      waiting: true,
      lines: [],
      cues: [],
      done: false,
      login: false,
    })
  })

  it('types the handshake out on its clock, each cue as it comes due', () => {
    const m = tap(IDLE, T)
    expect(view(m, T).lines).toEqual(['atz'])
    expect(view(m, T + 400).lines).toEqual(['atz', 'ok'])
    const all = view(m, T + HANDSHAKE_MS)
    expect(all.lines).toEqual(
      SCRIPT.flatMap((step) => (step.line ? [step.line] : []))
    )
    expect(all.cues.map((c) => c.cue)).toEqual([
      'dialtone',
      'dtmf',
      'ring',
      'answer',
      'train',
    ])
    expect(all.cues[0].at).toBe(T + 700)
    // Through the script, it waits on the line.
    expect(all.done).toBe(false)
  })

  it('connects only once the welcome has come, after the script', () => {
    let m = tap(IDLE, T)
    // The welcome may beat the script; CONNECT waits for it.
    m = connected(m, T + 100)
    expect(view(m, T + 200).lines).not.toContain('connect')
    const at = T + HANDSHAKE_MS
    const v = view(m, at)
    expect(v.lines.at(-1)).toBe('connect')
    expect(v.cues.at(-1)).toEqual({ cue: 'hush', at })
    expect(v.done).toBe(false)
    expect(view(m, at + HOLD_MS)).toMatchObject({ done: true, login: false })
    // Only the first answer counts.
    expect(signedOut(m, at)).toBe(m)
    expect(connected(m, at)).toBe(m)
    expect(noCarrier(m, at)).toBe(m)
  })

  it('skips the rest of the script on a second tap, printed but not heard', () => {
    let m = tap(IDLE, T)
    m = tap(m, T + 800)
    const v = view(m, T + 800)
    expect(v.lines).toContain('compression')
    expect(v.cues.map((c) => c.cue)).toEqual(['dialtone'])
    // A third tap, or one after the script, changes nothing.
    expect(tap(m, T + 900)).toBe(m)
    expect(tap(tap(IDLE, T), T + HANDSHAKE_MS + 1).skippedAt).toBeNull()
    m = connected(m, T + 900)
    expect(view(m, T + 900 + HOLD_MS).done).toBe(true)
  })

  it('says NO CARRIER for each failure, and redials', () => {
    let m = tap(IDLE, T)
    m = noCarrier(m, T + 9000)
    const v = view(m, T + 9000)
    expect(v.lines.slice(-2)).toEqual(['no_carrier', 'redial'])
    expect(v.cues.at(-1)).toEqual({ cue: 'click', at: T + 9000 })
    // Not before it happened.
    expect(view(m, T + 8000).lines).not.toContain('no_carrier')
    m = connected(m, T + 12000)
    expect(view(m, T + 12000).lines.slice(-3)).toEqual([
      'no_carrier',
      'redial',
      'connect',
    ])
  })

  it('answers a phone no one is signed in on with a login', () => {
    const m = signedOut(tap(IDLE, T), T)
    const v = view(m, T + HANDSHAKE_MS + HOLD_MS)
    expect(v.lines.slice(-2)).toEqual(['connect', 'login'])
    expect(v).toMatchObject({ done: true, login: true })
  })

  it('holds an answer the line gives before the script is through', () => {
    const m = connected(tap(IDLE, T), T + HANDSHAKE_MS + 500)
    expect(view(m, T + HANDSHAKE_MS + 200).lines).not.toContain('connect')
  })
})
