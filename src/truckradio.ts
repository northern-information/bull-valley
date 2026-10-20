// Pure: Matthew Marx's radio. From the moment the truck starts rolling
// until it stops, Day of Justice plays out of the cab, looped, streamed
// from assets.the-rn.info like the valley's music (never in the bundle or
// the repo). truckradiorig.ts plays it. In the bed it is the song as cut;
// out of the bed it fades with the distance and loses its highs, so from
// the Citgo, with him at his donuts across the road, only the low end
// carries.

import { clamp01 } from './math.ts'

export const RADIO_URL =
  'https://assets.the-rn.info/bull-valley/bull-valley-shadow-wars/day-of-justice.mp3'

export interface RadioTuning {
  // The loudness in the bed, at the music setting's top.
  volume: number
  // Within this many metres of the cab the song is loud and open.
  near: number
  // Past `near` the loudness falls away this fast (an inverse model, as
  // Web Audio's), and the cutoff slides down to `floorHz` by `far`.
  rolloff: number
  far: number
  // The low-pass cutoff at `near` and from `far` on, in Hz.
  openHz: number
  floorHz: number
  // Nothing past this far is heard; the last `fade` metres fade out.
  hearing: number
  fade: number
}

interface RadioFrame {
  // Metres from the raider to the truck.
  distance: number
  // In the bed: the song as cut, no filter.
  aboard: boolean
  // The raider's music setting, in percent (settings.ts).
  setting: number
}

export interface RadioMix {
  // The gain, 0 to 1.
  gain: number
  // The low-pass cutoff in Hz, or null for none at all.
  cutoff: number | null
}

// How the radio sounds from where the raider is.
export function radioMix(
  { distance, aboard, setting }: RadioFrame,
  tuning: RadioTuning
): RadioMix {
  const level = clamp01(setting / 100) * tuning.volume
  if (aboard) return { gain: clamp01(level), cutoff: null }
  const past = Math.max(0, distance - tuning.near)
  const falloff = tuning.near / (tuning.near + tuning.rolloff * past)
  const edge =
    tuning.fade > 0
      ? clamp01((tuning.hearing - distance) / tuning.fade)
      : distance <= tuning.hearing
        ? 1
        : 0
  // The cutoff slides evenly in pitch (log Hz) from open to the floor.
  const span = Math.max(1e-6, tuning.far - tuning.near)
  const t = clamp01(past / span)
  const cutoff = Math.exp(
    Math.log(tuning.openHz) * (1 - t) + Math.log(tuning.floorHz) * t
  )
  return { gain: clamp01(level * falloff * edge), cutoff }
}

// Where in a song `duration` seconds long the radio is, `seconds` after
// the engine started: every client that drives the same leg against the
// same clock hears the same bar.
export function radioOffset(seconds: number, duration: number): number {
  if (!(duration > 0)) return 0
  return Math.max(0, seconds) % duration
}
