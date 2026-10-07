// The radio in Matthew Marx's cab: DJ Stuxnet's Curse Series, played in
// order and over again on the valley's one clock, so everyone near the
// truck hears the same moment. Nothing is sent and nothing is kept: the
// moment is the clock. The mixes stream from their own host, never the
// bundle. Pure; radiorig.ts plays it.

export interface RadioTrack {
  file: string
  // The mix's length, in seconds (ffprobe).
  seconds: number
}

export const RADIO_BASE = 'https://assets.the-rn.info/dj-stuxnet/curse-series/'

export const RADIO_TRACKS: readonly RadioTrack[] = [
  { file: '01-cursebreaker-parabolic.mp3', seconds: 5786.488 },
  { file: '02-cursemaker-sigmoidal.mp3', seconds: 6666.344 },
  { file: '03-cursetaker-hyperbolic.mp3', seconds: 8713.613 },
  { file: '04-cursequaker-logistic.mp3', seconds: 4517.851 },
  { file: '05-curseshaker-bayesian.mp3', seconds: 6642.024 },
  { file: '06-cursebaker-toroidal.mp3', seconds: 5367.066 },
  { file: '07-cursefaker-gaussian.mp3', seconds: 4655.256 },
  { file: '08-cursewaker-julia.mp3', seconds: 4937.509 },
  { file: '09-curse-triangulator.mp3', seconds: 3588.885 },
  { file: '10-curse-donator.mp3', seconds: 4934.478 },
]

export interface Tuned {
  // Index into the tracks.
  index: number
  // Seconds into it.
  offset: number
}

// What is playing at a shared instant (ms since the epoch, the valley's
// clock): the playlist has run end to end, over and over, since the epoch.
export function tuneAt(
  ms: number,
  tracks: readonly RadioTrack[] = RADIO_TRACKS
): Tuned {
  const total = tracks.reduce((sum, t) => sum + t.seconds, 0)
  let at = (((ms / 1000) % total) + total) % total
  for (const [index, track] of tracks.entries()) {
    if (at < track.seconds) return { index, offset: at }
    at -= track.seconds
  }
  // Floating point at the very end of the loop: the top of the first.
  return { index: 0, offset: 0 }
}

// How loud and how muffled the radio is at a distance from the cab, for
// the tuning in CONFIG.radio: full at `near` metres and silent past `far`,
// the treble falling away from `openHz` to `muffledHz` as it fades. In the
// bed it is right behind the back glass: full, but muffled to `bedHz`.
export interface RadioTuning {
  volume: number
  near: number
  far: number
  openHz: number
  muffledHz: number
  bedHz: number
}

export interface Heard {
  gain: number
  cutoffHz: number
}

export function heardAt(
  distance: number,
  riding: boolean,
  tuning: RadioTuning
): Heard {
  if (riding) return { gain: tuning.volume, cutoffHz: tuning.bedHz }
  const span = Math.max(1e-6, tuning.far - tuning.near)
  const t = Math.min(1, Math.max(0, (distance - tuning.near) / span))
  // Quadratic, so it carries a little before it thins out.
  const fade = (1 - t) * (1 - t)
  return {
    gain: tuning.volume * fade,
    // Geometric, as the ear hears pitch.
    cutoffHz: tuning.openHz * Math.pow(tuning.muffledHz / tuning.openHz, t),
  }
}
