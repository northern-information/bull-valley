// Pure: the valley's sound effects. Every sound in one table (SFX): heard
// from where it happens or in the head, once or on a loop, how loud, and
// how many takes have been delivered. A sound with no takes yet plays its
// placeholder, a tone synthesized here (toneSamples), so every trigger is
// heard from the start and a delivered file simply takes its place. The
// takes are streamed from assets.the-rn.info (SFX_BASE), never in the
// bundle or the repo. Which sounds a frame of the valley calls for is read
// here too (shadeCues, keeperCues); sfxrig.ts plays them. No three.js, no
// DOM. What a portal, an XP frame, the geometrie or the wards sound like is
// read here as well (portalCues, xpSound, healSound, wardSound), the same
// for both apps.

import { CONFIG } from './config.ts'
import { levelUp } from './progression.ts'
import type { WardAxis, XZ } from './interfaces.ts'
import type { Portal } from './portals.ts'
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
  | 'caretaker-burned'
  | 'topiary-rustle'
  | 'topiary-burn'
  | 'torch-swing'
  | 'torch-hit'
  | 'slurm-plop'
  | 'slurm-squish'
  | 'bat-smash'
  | 'rod-cast'
  | 'bobber-plop'
  | 'fish-bite'
  | 'reel-click'
  | 'reel-in'
  | 'fish-fanfare'
  | 'line-snap'
  | 'dig'
  | 'jar-clink'
  | 'phone-dial'
  | 'portal-open'
  | 'portal-hum'
  | 'portal-through'
  | 'portal-close'
  | 'fog-through'
  | 'xp-tick'
  | 'level-up'
  | 'task-complete'
  | 'discovery'
  | 'pickup'
  | 'register'
  | 'heal'
  | 'ward-up'
  | 'berry-pick'
  | 'truck-board'
  | 'truck-hop-out'
  | 'ui-open'
  | 'ui-close'
  | 'step-grass'
  | 'step-dirt'
  | 'step-asphalt'
  | 'step-concrete'
  | 'step-tile'
  | 'step-wood'
  | 'step-metal'

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

interface SfxSpec {
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
const PHONE_DIAL = CONFIG.portal.dialSeconds

// A footstep: placed, once, quiet against the valley.
function step(placeholder: Tone): SfxSpec {
  return { positional: true, loop: false, takes: 0, gain: 0.4, placeholder }
}

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
  'caretaker-burned': {
    positional: true,
    loop: false,
    takes: 0,
    gain: 1,
    placeholder: { wave: 'sine', from: 300, to: 40, seconds: 2.5 },
  },
  // A topiary in the corn maze come to stand somewhere new, unseen
  // (topiaries.ts): the hedge shaking itself still.
  'topiary-rustle': {
    positional: true,
    loop: false,
    takes: 0,
    gain: 0.8,
    placeholder: { wave: 'noise', from: 2400, to: 300, seconds: 0.9, pulse: 9 },
  },
  // A topiary burned away by a torch: the hedge going up like a haystack.
  'topiary-burn': {
    positional: true,
    loop: false,
    takes: 0,
    gain: 1,
    placeholder: { wave: 'noise', from: 900, to: 120, seconds: 2.4, pulse: 5 },
  },
  // The torch swung (held.ts swingPose), in the raider's own hand: a
  // whoosh of fire.
  'torch-swing': {
    positional: false,
    loop: false,
    takes: 0,
    gain: 0.6,
    placeholder: { wave: 'noise', from: 400, to: 1600, seconds: 0.3 },
  },
  // A swing landing on a topiary: fire into wet leaves.
  'torch-hit': {
    positional: true,
    loop: false,
    takes: 0,
    gain: 0.9,
    placeholder: { wave: 'noise', from: 3000, to: 200, seconds: 0.45 },
  },
  // A slurm landing on the lot off the dripline (slurms.ts).
  'slurm-plop': {
    positional: true,
    loop: false,
    takes: 0,
    gain: 0.6,
    placeholder: { wave: 'sine', from: 180, to: 60, seconds: 0.18 },
  },
  // A raider's foot coming down on one.
  'slurm-squish': {
    positional: true,
    loop: false,
    takes: 0,
    gain: 0.7,
    placeholder: { wave: 'noise', from: 600, to: 40, seconds: 0.25 },
  },
  // Carlsten's bat coming down on one.
  'bat-smash': {
    positional: true,
    loop: false,
    takes: 0,
    gain: 0.9,
    placeholder: { wave: 'noise', from: 1800, to: 90, seconds: 0.35 },
  },
  // Fishing (fishing.ts, fishplay.ts), every one in the angler's head, in
  // both apps: the rod's swing through the air.
  'rod-cast': {
    positional: false,
    loop: false,
    takes: 0,
    gain: 0.6,
    placeholder: { wave: 'noise', from: 3000, to: 500, seconds: 0.35 },
  },
  // The bobber landing on the water.
  'bobber-plop': {
    positional: false,
    loop: false,
    takes: 0,
    gain: 0.6,
    placeholder: { wave: 'sine', from: 420, to: 110, seconds: 0.15 },
  },
  // Something takes the bait and the bobber goes under.
  'fish-bite': {
    positional: false,
    loop: false,
    takes: 0,
    gain: 0.8,
    placeholder: { wave: 'noise', from: 1400, to: 120, seconds: 0.4 },
  },
  // The reel's handle cranked, an arrow answered.
  'reel-click': {
    positional: false,
    loop: false,
    takes: 0,
    gain: 0.45,
    placeholder: {
      wave: 'square',
      from: 2400,
      to: 2400,
      seconds: 0.08,
      pulse: 40,
    },
  },
  // A spent fish reeled in and out of the water.
  'reel-in': {
    positional: false,
    loop: false,
    takes: 0,
    gain: 0.7,
    placeholder: {
      wave: 'square',
      from: 1600,
      to: 1600,
      seconds: 0.6,
      pulse: 30,
    },
  },
  // A fish landed (catchfanfare.ts): the little fanfare under the banner.
  'fish-fanfare': {
    positional: false,
    loop: false,
    takes: 0,
    gain: 0.75,
    placeholder: {
      wave: 'triangle',
      from: 523,
      to: 1568,
      seconds: 1.1,
      pulse: 7,
    },
  },
  // The line gives: snapped, or a fish lost.
  'line-snap': {
    positional: false,
    loop: false,
    takes: 0,
    gain: 0.8,
    placeholder: { wave: 'sawtooth', from: 2200, to: 300, seconds: 0.12 },
  },
  // A spade into the bank, for nightcrawlers.
  dig: {
    positional: false,
    loop: false,
    takes: 0,
    gain: 0.7,
    placeholder: { wave: 'noise', from: 500, to: 80, seconds: 0.3 },
  },
  // A slurm dropped into the glass jar, and the lid screwed down.
  'jar-clink': {
    positional: false,
    loop: false,
    takes: 0,
    gain: 0.6,
    placeholder: { wave: 'triangle', from: 2600, to: 2400, seconds: 0.2 },
  },
  // The phone (Q) dialing a Citgo portal, for as long as the dial takes.
  'phone-dial': {
    positional: false,
    loop: false,
    takes: 0,
    gain: 0.5,
    placeholder: {
      wave: 'square',
      from: 950,
      to: 950,
      seconds: PHONE_DIAL,
      pulse: 8,
    },
  },
  // A Citgo portal opening, heard at each of its ends (portalCues).
  'portal-open': {
    positional: true,
    loop: false,
    takes: 0,
    gain: 0.9,
    placeholder: {
      wave: 'sine',
      from: 120,
      to: 900,
      seconds: 1.2,
      pulse: 9,
    },
  },
  // Every open portal end, and the one at the maze's heart, while near.
  'portal-hum': {
    positional: true,
    loop: true,
    takes: 0,
    gain: 0.45,
    placeholder: { wave: 'sine', from: 70, to: 70, seconds: 2, pulse: 3 },
  },
  // Through a portal, or set down by fast travel: in the head.
  'portal-through': {
    positional: false,
    loop: false,
    takes: 0,
    gain: 0.8,
    placeholder: { wave: 'noise', from: 6000, to: 300, seconds: 0.6 },
  },
  // A Citgo portal closing, at each of its ends.
  'portal-close': {
    positional: true,
    loop: false,
    takes: 0,
    gain: 0.8,
    placeholder: { wave: 'sine', from: 900, to: 90, seconds: 0.9 },
  },
  // Through the fog wall into the Warden's chamber (fogwall.ts), in the
  // head: a long low rush, the fog closing over and behind.
  'fog-through': {
    positional: false,
    loop: false,
    takes: 0,
    gain: 0.85,
    placeholder: { wave: 'noise', from: 900, to: 90, seconds: 1.6, pulse: 2 },
  },
  // Progress (xpSound), in the head in both apps: XP earned short of a
  // new level, under the bar's flash.
  'xp-tick': {
    positional: false,
    loop: false,
    takes: 0,
    gain: 0.4,
    placeholder: { wave: 'sine', from: 1320, to: 1760, seconds: 0.12 },
  },
  // A new level, under its banner.
  'level-up': {
    positional: false,
    loop: false,
    takes: 0,
    gain: 0.8,
    placeholder: {
      wave: 'triangle',
      from: 392,
      to: 1568,
      seconds: 1.4,
      pulse: 6,
    },
  },
  // The daily task done, under its gold banner.
  'task-complete': {
    positional: false,
    loop: false,
    takes: 0,
    gain: 0.8,
    placeholder: {
      wave: 'triangle',
      from: 523,
      to: 2093,
      seconds: 1.6,
      pulse: 8,
    },
  },
  // A page written in the Book of Shadows, or a Citgo stood at the first
  // time.
  discovery: {
    positional: false,
    loop: false,
    takes: 0,
    gain: 0.7,
    placeholder: {
      wave: 'sine',
      from: 660,
      to: 1320,
      seconds: 0.9,
      pulse: 4,
    },
  },
  // Something taken up into the pack or the wallet: a pickup or a drop.
  pickup: {
    positional: false,
    loop: false,
    takes: 0,
    gain: 0.5,
    placeholder: { wave: 'triangle', from: 600, to: 1100, seconds: 0.1 },
  },
  // A purchase, a deal or a trade gone through, at any trader.
  register: {
    positional: false,
    loop: false,
    takes: 0,
    gain: 0.6,
    placeholder: {
      wave: 'square',
      from: 2000,
      to: 1500,
      seconds: 0.35,
      pulse: 18,
    },
  },
  // Geometrie given back (healSound).
  heal: {
    positional: false,
    loop: false,
    takes: 0,
    gain: 0.6,
    placeholder: { wave: 'sine', from: 300, to: 700, seconds: 0.7 },
  },
  // A ward come up (wardSound).
  'ward-up': {
    positional: false,
    loop: false,
    takes: 0,
    gain: 0.55,
    placeholder: {
      wave: 'sawtooth',
      from: 200,
      to: 500,
      seconds: 0.5,
      pulse: 12,
    },
  },
  // Today's berry off a bush.
  'berry-pick': {
    positional: false,
    loop: false,
    takes: 0,
    gain: 0.5,
    placeholder: { wave: 'sine', from: 900, to: 500, seconds: 0.09 },
  },
  // Up into Marx's truck bed, and down off it.
  'truck-board': {
    positional: false,
    loop: false,
    takes: 0,
    gain: 0.7,
    placeholder: { wave: 'noise', from: 900, to: 120, seconds: 0.3 },
  },
  'truck-hop-out': {
    positional: false,
    loop: false,
    takes: 0,
    gain: 0.6,
    placeholder: { wave: 'noise', from: 1200, to: 200, seconds: 0.25 },
  },
  // The 3D valley's panels opened from the keys (the pack, the Book, the
  // map) and closed. What opens on a click, a dialog or a Dial-Up sheet,
  // already ticks under the finger (tapfeedback.ts).
  'ui-open': {
    positional: false,
    loop: false,
    takes: 0,
    gain: 0.35,
    placeholder: { wave: 'triangle', from: 700, to: 1000, seconds: 0.06 },
  },
  'ui-close': {
    positional: false,
    loop: false,
    takes: 0,
    gain: 0.35,
    placeholder: { wave: 'triangle', from: 1000, to: 700, seconds: 0.06 },
  },
  // Footsteps (footsteps.ts), every raider's at their feet, one for each
  // tread (ground.ts): the bare terrain's grass, a shoulder's or a trail's
  // dirt, a road's asphalt, a lot's concrete, a store's tile, a deck's
  // wood and a fire escape's steel.
  'step-grass': step({ wave: 'noise', from: 1800, to: 500, seconds: 0.09 }),
  'step-dirt': step({ wave: 'noise', from: 1200, to: 250, seconds: 0.08 }),
  'step-asphalt': step({ wave: 'noise', from: 2600, to: 500, seconds: 0.06 }),
  'step-concrete': step({
    wave: 'noise',
    from: 3600,
    to: 700,
    seconds: 0.05,
  }),
  'step-tile': step({ wave: 'noise', from: 5000, to: 1200, seconds: 0.05 }),
  'step-wood': step({ wave: 'triangle', from: 180, to: 90, seconds: 0.08 }),
  'step-metal': step({
    wave: 'square',
    from: 420,
    to: 380,
    seconds: 0.12,
    pulse: 40,
  }),
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

interface SfxTuning {
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

// A sound to play once where it happened, at a playback rate (pitch):
// at a height of its own (`y`), or over the ground there; at a loudness
// against the sound's own (`gain`, 0 to 1), or its own.
export interface Cue {
  id: SfxId
  x: number
  y?: number
  z: number
  rate: number
  gain?: number
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

interface CueTuning {
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

// The windups that began between one frame of the valley and the next: read as the frames land, not as they are
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
// valley's frames land), and where it was burned.
export function keeperCues(
  begun: boolean,
  lunged: boolean,
  shown: Pick<CaretakerWire, 'x' | 'z' | 'target'> | null,
  burned: readonly XZ[],
  player: XZ,
  tuning: CueTuning
): ShadeCues {
  const cues: Cue[] = []
  const holds: Hold[] = []
  for (const at of burned) {
    if (near(at, player, tuning.hearing)) {
      cues.push({ id: 'caretaker-burned', x: at.x, z: at.z, rate: 1 })
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

// The Citgo portals as one frame hears them: each opened since the last
// (and still fresh, so the portals a raider finds open on joining make no
// sound) and each closed, at both of its ends; every end near humming, and
// the portal at the maze's heart (`standing`) with them. `open` is what
// the next frame compares against.
export function portalCues(
  was: ReadonlyMap<number, Pick<Portal, 'field' | 'citgo'>>,
  shown: readonly Portal[],
  standing: XZ | null,
  now: number,
  player: XZ,
  tuning: Pick<CueTuning, 'hearing'>,
  portal: { lifeSeconds: number; freshSeconds: number } = {
    lifeSeconds: CONFIG.portal.lifeSeconds,
    freshSeconds: CONFIG.sfx.portalFreshSeconds,
  }
): ShadeCues & { open: Map<number, Pick<Portal, 'field' | 'citgo'>> } {
  const cues: Cue[] = []
  const holds: Hold[] = []
  const open = new Map(shown.map((p) => [p.id, p]))
  const at = (id: Cue['id'], end: XZ) => {
    if (near(end, player, tuning.hearing)) {
      cues.push({ id, x: end.x, z: end.z, rate: 1 })
    }
  }
  const freshFrom = (portal.lifeSeconds - portal.freshSeconds) * 1000
  for (const p of shown) {
    if (!was.has(p.id) && p.closes - now >= freshFrom) {
      at('portal-open', p.field)
      at('portal-open', p.citgo)
    }
    for (const side of ['field', 'citgo'] as const) {
      const end = p[side]
      if (!near(end, player, tuning.hearing)) continue
      holds.push({
        key: `portal:${p.id}:${side}`,
        id: 'portal-hum',
        x: end.x,
        z: end.z,
        rate: 1,
        gain: 1,
      })
    }
  }
  for (const [id, p] of was) {
    if (open.has(id)) continue
    at('portal-close', p.field)
    at('portal-close', p.citgo)
  }
  if (standing && near(standing, player, tuning.hearing)) {
    holds.push({
      key: 'portal:maze',
      id: 'portal-hum',
      x: standing.x,
      z: standing.z,
      rate: 1,
      gain: 1,
    })
  }
  return { cues, holds, open }
}

// What XP going from `before` to `after` sounds like: a new level, or a
// tick for XP short of one, or nothing for XP that did not grow.
export function xpSound(before: number, after: number): SfxId | null {
  if (after <= before) return null
  return levelUp(before, after) === null ? 'xp-tick' : 'level-up'
}

// Geometrie given back, at the same whole. A larger whole (a new level)
// is the level's news, and a touch's loss is the hit's.
export function healSound(
  was: { health: number; max: number },
  now: { health: number; max: number }
): SfxId | null {
  return now.max === was.max && now.health > was.health ? 'heal' : null
}

// A ward come up: any level above where it had faded to, by more than the
// `margin` that a frame's own fading could account for.
export function wardSound(
  was: Readonly<Record<WardAxis, number>>,
  now: Readonly<Record<WardAxis, number>>,
  margin = 0.02
): SfxId | null {
  const axes: WardAxis[] = ['high', 'stimulated', 'drunk', 'tripping']
  return axes.some((axis) => now[axis] - was[axis] > margin) ? 'ward-up' : null
}
