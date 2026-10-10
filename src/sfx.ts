// Pure: the valley's sound effects. Every sound in one table (SFX): heard
// from where it happens or in the head, once or on a loop, how loud, and
// how many takes have been delivered. A sound with no takes yet plays its
// placeholder, a tone synthesized here (toneSamples), so every trigger is
// heard from the start and a delivered file simply takes its place. The
// takes are streamed from assets.the-rn.info (SFX_BASE), never in the
// bundle or the repo. Which sounds a frame of the valley calls for is read
// here too (shadeCues, keeperCues); sfxrig.ts plays them. No three.js, no
// DOM.

import { CONFIG } from './config.ts'
import type { XZ } from './interfaces.ts'
import type { CaretakerWire } from './protocol.ts'
import type { Rng } from './rng.ts'
import type { Burst, ShadeKind } from './shadowmen.ts'

export type SfxId =
  | 'shadow-windup'
  | 'shadow-lunge'
  | 'hit'
  | 'shatter'
  | 'flashlight-on'
  | 'flashlight-off'
  | 'burn-loop'
  | 'shadow-burst'
  | 'spider-windup'
  | 'spider-slam'
  | 'spider-burst'
  | 'spiderling-skitter'
  | 'caretaker-hum'
  | 'caretaker-windup'
  | 'caretaker-lunge'
  | 'caretaker-unmade'

// A placeholder: a wave swept from one pitch to another (Hz) over its
// seconds, or for noise a low-pass swept the same way; `pulse` beats its
// loudness that many times a second.
export interface Tone {
  wave: 'sine' | 'square' | 'sawtooth' | 'triangle' | 'noise'
  from: number
  to: number
  seconds: number
  pulse?: number
}

export interface SfxSpec {
  // Heard from where it happens (mono, placed against the camera), or in
  // the raider's head (UI and their own body).
  positional: boolean
  loop: boolean
  // How many takes have been delivered: 0 plays the placeholder, 1 is
  // `<id>.ogg`, more are `<id>-1.ogg` to `<id>-<n>.ogg`, one drawn at
  // random each time.
  takes: number
  // Its loudness against the others, 0 to 1.
  gain: number
  placeholder: Tone
}

// Where delivered takes are streamed from.
export const SFX_BASE = 'https://assets.the-rn.info/bull-valley/sfx/'

const SHADE_WINDUP = CONFIG.shadowmen.windupSeconds
const KEEPER_WINDUP = CONFIG.caretaker.windupSeconds

export const SFX: Record<SfxId, SfxSpec> = {
  'shadow-windup': {
    positional: true,
    loop: false,
    takes: 0,
    gain: 0.9,
    placeholder: { wave: 'noise', from: 300, to: 4000, seconds: SHADE_WINDUP },
  },
  'shadow-lunge': {
    positional: true,
    loop: false,
    takes: 0,
    gain: 0.9,
    placeholder: { wave: 'noise', from: 5000, to: 400, seconds: 0.3 },
  },
  hit: {
    positional: false,
    loop: false,
    takes: 0,
    gain: 1,
    placeholder: { wave: 'square', from: 160, to: 45, seconds: 0.45 },
  },
  shatter: {
    positional: false,
    loop: false,
    takes: 0,
    gain: 1,
    placeholder: { wave: 'noise', from: 8000, to: 150, seconds: 2 },
  },
  'flashlight-on': {
    positional: false,
    loop: false,
    takes: 0,
    gain: 0.5,
    placeholder: { wave: 'square', from: 1800, to: 1800, seconds: 0.04 },
  },
  'flashlight-off': {
    positional: false,
    loop: false,
    takes: 0,
    gain: 0.5,
    placeholder: { wave: 'square', from: 1200, to: 1200, seconds: 0.04 },
  },
  'burn-loop': {
    positional: true,
    loop: true,
    takes: 0,
    gain: 0.5,
    placeholder: { wave: 'sawtooth', from: 220, to: 220, seconds: 1 },
  },
  'shadow-burst': {
    positional: true,
    loop: false,
    takes: 0,
    gain: 0.9,
    placeholder: { wave: 'noise', from: 2000, to: 80, seconds: 0.9 },
  },
  'spider-windup': {
    positional: true,
    loop: false,
    takes: 0,
    gain: 0.9,
    placeholder: {
      wave: 'sawtooth',
      from: 90,
      to: 400,
      seconds: SHADE_WINDUP,
      pulse: 30,
    },
  },
  'spider-slam': {
    positional: true,
    loop: false,
    takes: 0,
    gain: 1,
    placeholder: { wave: 'square', from: 90, to: 30, seconds: 0.35 },
  },
  'spider-burst': {
    positional: true,
    loop: false,
    takes: 0,
    gain: 1,
    placeholder: { wave: 'noise', from: 3000, to: 60, seconds: 1.4 },
  },
  'spiderling-skitter': {
    positional: true,
    loop: true,
    takes: 0,
    gain: 0.35,
    placeholder: {
      wave: 'noise',
      from: 3500,
      to: 3500,
      seconds: 0.5,
      pulse: 14,
    },
  },
  'caretaker-hum': {
    positional: true,
    loop: true,
    takes: 0,
    gain: 0.6,
    placeholder: { wave: 'sine', from: 110, to: 110, seconds: 2, pulse: 1 },
  },
  'caretaker-windup': {
    positional: true,
    loop: false,
    takes: 0,
    gain: 0.9,
    placeholder: {
      wave: 'triangle',
      from: 200,
      to: 900,
      seconds: KEEPER_WINDUP,
    },
  },
  'caretaker-lunge': {
    positional: true,
    loop: false,
    takes: 0,
    gain: 0.9,
    placeholder: { wave: 'noise', from: 3000, to: 300, seconds: 0.4 },
  },
  'caretaker-unmade': {
    positional: true,
    loop: false,
    takes: 0,
    gain: 1,
    placeholder: { wave: 'sine', from: 300, to: 40, seconds: 2.5 },
  },
}

export const SFX_IDS = Object.keys(SFX) as SfxId[]

export function isSfxId(value: unknown): value is SfxId {
  return typeof value === 'string' && value in SFX
}

// Where each take of a sound is streamed from; none while it has none.
export function takeUrls(id: SfxId, takes: number, base = SFX_BASE): string[] {
  if (takes <= 0) return []
  if (takes === 1) return [`${base}${id}.ogg`]
  return Array.from({ length: takes }, (_, i) => `${base}${id}-${i + 1}.ogg`)
}

export interface SfxTuning {
  // The loudness at the setting's top, 100%.
  volume: number
}

// A sound's loudness, 0 to 1: the raider's sounds setting (percent),
// scaled to the tuning's top and the sound's own gain.
export function sfxGain(
  setting: number,
  spec: Pick<SfxSpec, 'gain'>,
  tuning: SfxTuning
): number {
  const level = Math.min(1, Math.max(0, setting / 100))
  return Math.min(1, Math.max(0, tuning.volume * level * spec.gain))
}

// The placeholder's samples at `sampleRate`, peaking at `peak`. A one-shot
// comes up at once and dies away; a loop holds level and is cut to whole
// cycles of its wave and its pulse, so it loops without a click.
export function toneSamples(
  tone: Tone,
  sampleRate: number,
  loop: boolean,
  rng: Rng,
  peak = 0.5
): Float32Array<ArrayBuffer> {
  let length = Math.max(1, Math.round(tone.seconds * sampleRate))
  if (loop) {
    const beat = tone.pulse ?? (tone.wave === 'noise' ? 0 : tone.from)
    if (beat > 0) {
      const cycles = Math.max(1, Math.round(tone.seconds * beat))
      length = Math.max(1, Math.round((cycles * sampleRate) / beat))
    }
  }
  const out = new Float32Array(length)
  const attack = Math.max(1, Math.round(0.005 * sampleRate))
  let phase = 0
  let low = 0
  for (let i = 0; i < length; i++) {
    const t = i / length
    // The sweep is exponential, as pitch is heard.
    const hz = tone.from * Math.pow(tone.to / tone.from, loop ? 0 : t)
    let v: number
    if (tone.wave === 'noise') {
      // A one-pole low-pass on white noise, its corner at `hz`.
      const k = 1 - Math.exp((-2 * Math.PI * hz) / sampleRate)
      low += (rng() * 2 - 1 - low) * k
      v = low * 2
    } else {
      phase = (phase + hz / sampleRate) % 1
      v =
        tone.wave === 'sine'
          ? Math.sin(2 * Math.PI * phase)
          : tone.wave === 'square'
            ? phase < 0.5
              ? 1
              : -1
            : tone.wave === 'sawtooth'
              ? 2 * phase - 1
              : 1 - 4 * Math.abs(phase - 0.5)
    }
    const envelope = loop ? 1 : Math.min(1, i / attack) * (1 - t) * (1 - t)
    const pulse =
      tone.pulse === undefined
        ? 1
        : 0.5 + 0.5 * Math.sin((2 * Math.PI * tone.pulse * i) / sampleRate)
    out[i] = Math.max(-1, Math.min(1, v * envelope * pulse)) * peak
  }
  return out
}

// A sound to play once where it happened, at a playback rate (pitch).
export interface Cue {
  id: SfxId
  x: number
  z: number
  rate: number
}

// A loop to hold this frame, under a key that names what it follows: kept
// playing while a frame holds it, stopped the first frame that does not.
export interface Hold {
  key: string
  id: SfxId
  x: number
  z: number
  rate: number
  // Its loudness against the sound's own, 0 to 1.
  gain: number
}

export interface CueTuning {
  // Nothing further from the raider than this, in metres, is heard.
  hearing: number
  // At most this many spiderlings skitter at once, the nearest.
  skitters: number
}

// A shadowman as a frame shows it.
export interface ShadeHeard {
  id: number
  kind?: ShadeKind
  x: number
  z: number
  // How far through its burn, and through its windup (each 0 to 1).
  burn: number
  windup?: number
}

export interface ShadeCues {
  cues: Cue[]
  holds: Hold[]
}

// A spiderling sounds like a spider, higher.
const SPIDERLING_RATE = 1.7

const near = (at: XZ, player: XZ, hearing: number) =>
  Math.hypot(at.x - player.x, at.z - player.z) <= hearing

// The windups that began between one frame of the valley (or one step
// played alone) and the next: read as the frames land, not as they are
// drawn, so a windup shorter than a drawn frame is still heard.
export function windupsBegun(
  was: ReadonlyMap<number, number>,
  now: readonly Pick<ShadeHeard, 'id' | 'windup'>[]
): { begun: number[]; windups: Map<number, number> } {
  const begun: number[] = []
  const windups = new Map<number, number>()
  for (const { id, windup = 0 } of now) {
    windups.set(id, windup)
    if (windup > 0 && (was.get(id) ?? 0) <= 0) begun.push(id)
  }
  return { begun, windups }
}

// What one drawn frame of the shadowmen sounds like: each windup begun and
// each lunge since the last (found where `shown` or, for one already gone,
// as when the valley last placed it, `known`), each burst; a burn held in
// a beam rising in pitch as it nears bursting, and the nearest spiderlings
// skittering.
export function shadeCues(
  begun: readonly number[],
  lunged: readonly number[],
  shown: readonly ShadeHeard[],
  known: ReadonlyMap<number, ShadeHeard>,
  bursts: readonly Burst[],
  player: XZ,
  tuning: CueTuning
): ShadeCues {
  const cues: Cue[] = []
  const holds: Hold[] = []
  const byId = new Map(shown.map((s) => [s.id, s]))
  const find = (id: number) => byId.get(id) ?? known.get(id)
  const rateOf = (kind: ShadeKind | undefined) =>
    kind === 'spiderling' ? SPIDERLING_RATE : 1
  const spidery = (kind: ShadeKind | undefined) =>
    kind === 'spider' || kind === 'spiderling'
  for (const id of begun) {
    const s = find(id)
    if (!s || !near(s, player, tuning.hearing)) continue
    cues.push({
      id: spidery(s.kind) ? 'spider-windup' : 'shadow-windup',
      x: s.x,
      z: s.z,
      rate: rateOf(s.kind),
    })
  }
  for (const id of lunged) {
    const s = find(id)
    if (!s || !near(s, player, tuning.hearing)) continue
    cues.push({
      id: spidery(s.kind) ? 'spider-slam' : 'shadow-lunge',
      x: s.x,
      z: s.z,
      rate: rateOf(s.kind),
    })
  }
  for (const b of bursts) {
    if (!near(b, player, tuning.hearing)) continue
    cues.push({
      id: b.kind === 'spider' ? 'spider-burst' : 'shadow-burst',
      x: b.x,
      z: b.z,
      rate: b.kind === 'spiderling' ? SPIDERLING_RATE : 1,
    })
  }
  for (const s of shown) {
    if (s.burn <= 0 || !near(s, player, tuning.hearing)) continue
    holds.push({
      key: `burn:${s.id}`,
      id: 'burn-loop',
      x: s.x,
      z: s.z,
      rate: 1 + Math.min(1, s.burn),
      gain: 1,
    })
  }
  const lings = shown
    .filter((s) => s.kind === 'spiderling' && near(s, player, tuning.hearing))
    .sort(
      (a, b) =>
        Math.hypot(a.x - player.x, a.z - player.z) -
        Math.hypot(b.x - player.x, b.z - player.z)
    )
    .slice(0, tuning.skitters)
  for (const s of lings) {
    holds.push({
      key: `skitter:${s.id}`,
      id: 'spiderling-skitter',
      x: s.x,
      z: s.z,
      rate: 1,
      gain: 1,
    })
  }
  return { cues, holds }
}

// The Caretaker's hum while it is formed, louder while it hunts; its
// windup begun and its lunge since the last drawn frame (each read as the
// valley's frames land), and where it was unmade.
export function keeperCues(
  begun: boolean,
  lunged: boolean,
  shown: Pick<CaretakerWire, 'x' | 'z' | 'target'> | null,
  unmade: readonly XZ[],
  player: XZ,
  tuning: CueTuning
): ShadeCues {
  const cues: Cue[] = []
  const holds: Hold[] = []
  for (const at of unmade) {
    if (near(at, player, tuning.hearing)) {
      cues.push({ id: 'caretaker-unmade', x: at.x, z: at.z, rate: 1 })
    }
  }
  if (!shown || !near(shown, player, tuning.hearing)) return { cues, holds }
  const { x, z } = shown
  holds.push({
    key: 'caretaker',
    id: 'caretaker-hum',
    x,
    z,
    rate: 1,
    gain: shown.target === null ? 0.5 : 1,
  })
  if (begun) cues.push({ id: 'caretaker-windup', x, z, rate: 1 })
  if (lunged) cues.push({ id: 'caretaker-lunge', x, z, rate: 1 })
  return { cues, holds }
}
