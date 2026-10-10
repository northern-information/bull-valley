import { describe, expect, it } from 'vitest'
import { CONFIG } from '../../src/config.ts'
import { mulberry32 } from '../../src/rng.ts'
import {
  isSfxId,
  keeperCues,
  SFX,
  SFX_BASE,
  SFX_IDS,
  sfxGain,
  shadeCues,
  takeUrls,
  toneSamples,
  windupsBegun,
} from '../../src/sfx.ts'
import type { ShadeHeard, Tone } from '../../src/sfx.ts'

const tuning = { hearing: 60, skitters: 2 }
const me = { x: 0, z: 0 }

describe('the sound table', () => {
  it('names every sound, each with a placeholder that plays', () => {
    expect(SFX_IDS.length).toBeGreaterThan(0)
    for (const id of SFX_IDS) {
      expect(isSfxId(id)).toBe(true)
      const { placeholder, gain } = SFX[id]
      expect(placeholder.seconds).toBeGreaterThan(0)
      expect(gain).toBeGreaterThan(0)
      expect(gain).toBeLessThanOrEqual(1)
    }
    expect(isSfxId('kazoo')).toBe(false)
    expect(isSfxId(7)).toBe(false)
  })

  it('times each windup to the windup it sounds', () => {
    expect(SFX['shadow-windup'].placeholder.seconds).toBe(
      CONFIG.shadowmen.windupSeconds
    )
    expect(SFX['caretaker-windup'].placeholder.seconds).toBe(
      CONFIG.caretaker.windupSeconds
    )
  })

  it('streams one take by its id and more by number', () => {
    expect(takeUrls('hit', 0)).toEqual([])
    expect(takeUrls('hit', 1)).toEqual([`${SFX_BASE}hit.ogg`])
    expect(takeUrls('hit', 2, '/sfx/')).toEqual([
      '/sfx/hit-1.ogg',
      '/sfx/hit-2.ogg',
    ])
  })
})

describe('sfxGain', () => {
  it('scales the setting to the top and the sound', () => {
    expect(sfxGain(100, { gain: 1 }, { volume: 0.8 })).toBeCloseTo(0.8)
    expect(sfxGain(50, { gain: 0.5 }, { volume: 0.8 })).toBeCloseTo(0.2)
    expect(sfxGain(0, { gain: 1 }, { volume: 0.8 })).toBe(0)
    expect(sfxGain(500, { gain: 1 }, { volume: 2 })).toBe(1)
    expect(sfxGain(-5, { gain: 1 }, { volume: 1 })).toBe(0)
  })
})

describe('toneSamples', () => {
  const rate = 8000
  const peakOf = (samples: Float32Array) =>
    samples.reduce((top, v) => Math.max(top, Math.abs(v)), 0)

  it('lasts its seconds and stays under its peak, every wave', () => {
    for (const wave of [
      'sine',
      'square',
      'sawtooth',
      'triangle',
      'noise',
    ] as const) {
      const tone: Tone = { wave, from: 400, to: 100, seconds: 0.25 }
      const samples = toneSamples(tone, rate, false, mulberry32(1), 0.5)
      expect(samples.length).toBe(2000)
      expect(peakOf(samples)).toBeLessThanOrEqual(0.5)
      expect(peakOf(samples)).toBeGreaterThan(0)
    }
  })

  it('dies away as a one-shot, and holds level as a loop', () => {
    const tone: Tone = { wave: 'square', from: 200, to: 200, seconds: 0.5 }
    const once = toneSamples(tone, rate, false, mulberry32(1))
    const tail = once.slice(-100)
    expect(peakOf(tail)).toBeLessThan(0.01)
    const loop = toneSamples(tone, rate, true, mulberry32(1))
    expect(peakOf(loop.slice(-100))).toBeCloseTo(0.5)
  })

  it('cuts a loop to whole cycles of its wave, or of its pulse', () => {
    // 220 Hz at 8 kHz: 220 cycles in a second come to 8000 samples.
    const tone: Tone = { wave: 'sawtooth', from: 220, to: 220, seconds: 1 }
    expect(toneSamples(tone, rate, true, mulberry32(1)).length).toBe(8000)
    const pulsed: Tone = {
      wave: 'noise',
      from: 3000,
      to: 3000,
      seconds: 0.52,
      pulse: 10,
    }
    // Five beats of a 10 Hz pulse.
    expect(toneSamples(pulsed, rate, true, mulberry32(1)).length).toBe(4000)
    // Noise with no pulse loops at its own length.
    const hiss: Tone = { wave: 'noise', from: 3000, to: 3000, seconds: 0.3 }
    expect(toneSamples(hiss, rate, true, mulberry32(1)).length).toBe(2400)
  })
})

describe('windupsBegun', () => {
  it('names a windup as it begins, once', () => {
    const first = windupsBegun(new Map(), [{ id: 1, windup: 0.3 }, { id: 2 }])
    expect(first.begun).toEqual([1])
    const next = windupsBegun(first.windups, [{ id: 1, windup: 0.6 }])
    expect(next.begun).toEqual([])
    // Done, and begun again.
    const rest = windupsBegun(next.windups, [{ id: 1 }])
    expect(windupsBegun(rest.windups, [{ id: 1, windup: 0.2 }]).begun).toEqual([
      1,
    ])
  })
})

describe('shadeCues', () => {
  const man = (over: Partial<ShadeHeard> = {}): ShadeHeard => ({
    id: 1,
    x: 5,
    z: 0,
    burn: 0,
    ...over,
  })
  const none = new Map<number, ShadeHeard>()

  it('hears a windup begun where it stands', () => {
    const { cues } = shadeCues([1], [], [man()], none, [], me, tuning)
    expect(cues).toEqual([{ id: 'shadow-windup', x: 5, z: 0, rate: 1 }])
  })

  it('tells a spider from a shadowman, and a spiderling higher', () => {
    const shown = [
      man({ id: 1, kind: 'spider' }),
      man({ id: 2, kind: 'spiderling' }),
    ]
    const { cues } = shadeCues([1, 2], [1, 2], shown, none, [], me, tuning)
    expect(cues.map((c) => [c.id, c.rate])).toEqual([
      ['spider-windup', 1],
      ['spider-windup', 1.7],
      ['spider-slam', 1],
      ['spider-slam', 1.7],
    ])
  })

  it('hears a lunge and a burst, each of its kind', () => {
    const { cues } = shadeCues(
      [],
      [1, 99],
      [man()],
      none,
      [
        { id: 2, kind: 'man', x: 1, z: 1 },
        { id: 3, kind: 'spider', x: 2, z: 2 },
        { id: 4, kind: 'spiderling', x: 3, z: 3 },
      ],
      me,
      tuning
    )
    expect(cues.map((c) => [c.id, c.rate])).toEqual([
      ['shadow-lunge', 1],
      ['shadow-burst', 1],
      ['spider-burst', 1],
      ['shadow-burst', 1.7],
    ])
  })

  it('places a lunge that struck where the valley last had it', () => {
    // A lunge that lands takes the shadowman with it.
    const known = new Map([[7, man({ id: 7, x: 2, z: 3 })]])
    const { cues } = shadeCues([], [7], [], known, [], me, tuning)
    expect(cues).toEqual([{ id: 'shadow-lunge', x: 2, z: 3, rate: 1 }])
  })

  it('holds a burn rising in pitch, and the nearest spiderlings', () => {
    const { holds } = shadeCues(
      [],
      [],
      [
        man({ id: 1, burn: 0.5 }),
        man({ id: 2, kind: 'spiderling', x: 30 }),
        man({ id: 3, kind: 'spiderling', x: 10 }),
        man({ id: 4, kind: 'spiderling', x: 20 }),
      ],
      none,
      [],
      me,
      tuning
    )
    expect(holds.map((h) => [h.key, h.rate])).toEqual([
      ['burn:1', 1.5],
      ['skitter:3', 1],
      ['skitter:4', 1],
    ])
  })

  it('hears nothing out of earshot', () => {
    const far = man({ x: 500, burn: 0.3 })
    const { cues, holds } = shadeCues(
      [1],
      [1],
      [far],
      none,
      [{ id: 2, kind: 'man', x: 500, z: 0 }],
      me,
      tuning
    )
    expect(cues).toEqual([])
    expect(holds).toEqual([])
  })
})

describe('keeperCues', () => {
  const keeper = { x: 3, z: 4, target: null as string | null }

  it('hums while formed, louder while it hunts', () => {
    expect(keeperCues(false, false, keeper, [], me, tuning).holds).toEqual([
      { key: 'caretaker', id: 'caretaker-hum', x: 3, z: 4, rate: 1, gain: 0.5 },
    ])
    const hunting = { ...keeper, target: 'me' }
    expect(
      keeperCues(false, false, hunting, [], me, tuning).holds[0].gain
    ).toBe(1)
    expect(keeperCues(false, false, null, [], me, tuning).holds).toEqual([])
  })

  it('hears its windup begin, its lunge, and where it was unmade', () => {
    const { cues } = keeperCues(
      true,
      true,
      keeper,
      [{ x: 1, z: 1 }],
      me,
      tuning
    )
    expect(cues.map((c) => c.id)).toEqual([
      'caretaker-unmade',
      'caretaker-windup',
      'caretaker-lunge',
    ])
    expect(keeperCues(false, false, keeper, [], me, tuning).cues).toEqual([])
  })

  it('is not heard out of earshot', () => {
    const far = { ...keeper, x: 900 }
    const out = keeperCues(true, true, far, [{ x: 900, z: 0 }], me, tuning)
    expect(out.cues).toEqual([])
    expect(out.holds).toEqual([])
  })
})
