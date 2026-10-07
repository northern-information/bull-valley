import { describe, expect, it } from 'vitest'
import { CONFIG } from '../../src/config.ts'
import { heardAt, RADIO_TRACKS, tuneAt } from '../../src/radio.ts'

const TRACKS = [
  { file: 'a.mp3', seconds: 100 },
  { file: 'b.mp3', seconds: 50 },
]

describe('tuneAt', () => {
  it('plays the first mix from the top at the epoch', () => {
    expect(tuneAt(0, TRACKS)).toEqual({ index: 0, offset: 0 })
  })

  it('runs into the next mix when one ends', () => {
    expect(tuneAt(99_000, TRACKS)).toEqual({ index: 0, offset: 99 })
    expect(tuneAt(100_000, TRACKS)).toEqual({ index: 1, offset: 0 })
    expect(tuneAt(120_500, TRACKS)).toEqual({ index: 1, offset: 20.5 })
  })

  it('loops the playlist over and over', () => {
    expect(tuneAt(150_000, TRACKS)).toEqual({ index: 0, offset: 0 })
    expect(tuneAt(150_000 * 1000 + 110_000, TRACKS)).toEqual({
      index: 1,
      offset: 10,
    })
  })

  it('reads an instant before the epoch on the same loop', () => {
    expect(tuneAt(-10_000, TRACKS)).toEqual({ index: 1, offset: 40 })
  })

  it('tunes everyone to the same moment of the real playlist', () => {
    const now = Date.UTC(2026, 9, 7, 21, 0, 0)
    const tuned = tuneAt(now)
    expect(tuned).toEqual(tuneAt(now))
    expect(tuned.offset).toBeGreaterThanOrEqual(0)
    expect(tuned.offset).toBeLessThan(RADIO_TRACKS[tuned.index].seconds)
  })

  it('falls back to the top when rounding runs past the end', () => {
    expect(tuneAt(0, [{ file: 'x.mp3', seconds: 0 }])).toEqual({
      index: 0,
      offset: 0,
    })
  })
})

describe('heardAt', () => {
  const tuning = CONFIG.radio

  it('is full and open close to the cab', () => {
    expect(heardAt(0, false, tuning)).toEqual({
      gain: tuning.volume,
      cutoffHz: tuning.openHz,
    })
    expect(heardAt(tuning.near, false, tuning).gain).toBe(tuning.volume)
  })

  it('fades and muffles with distance, silent past far', () => {
    const mid = heardAt((tuning.near + tuning.far) / 2, false, tuning)
    expect(mid.gain).toBeGreaterThan(0)
    expect(mid.gain).toBeLessThan(tuning.volume)
    expect(mid.cutoffHz).toBeLessThan(tuning.openHz)
    expect(mid.cutoffHz).toBeGreaterThan(tuning.muffledHz)
    const far = heardAt(tuning.far + 10, false, tuning)
    expect(far.gain).toBe(0)
    expect(far.cutoffHz).toBeCloseTo(tuning.muffledHz)
  })

  it('is full but behind the back glass in the bed', () => {
    expect(heardAt(30, true, tuning)).toEqual({
      gain: tuning.volume,
      cutoffHz: tuning.bedHz,
    })
  })
})
