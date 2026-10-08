// Pure: the valley's music, the Bull Valley Scaduscope theme, looped under
// everything once a raider has begun. Streamed from assets.the-rn.info
// like Marx's radio (radio.ts), never in the bundle or the repo.
// musicrig.ts plays it; the raider's music setting (settings.ts) sets how
// loud, and it ducks under the radio while the radio is heard.

export const MUSIC_URL =
  'https://assets.the-rn.info/bull-valley/bull-valley-scaduscope/01-bull-valley-scaduscope.mp3'

export interface MusicTuning {
  // The element's volume at the setting's top, 100%.
  volume: number
  // How much of the music the radio takes away at its loudest: 0 never
  // ducks, 1 goes silent under it.
  duck: number
  // Seconds the music takes to come up from silence when it starts.
  fadeInSeconds: number
}

export interface MusicFrame {
  // The raider's music setting, in percent (settings.ts).
  setting: number
  // How loud the radio is heard now (radio.ts `heardAt`), and at its
  // loudest (CONFIG.radio.volume).
  radioGain: number
  radioVolume: number
  // Seconds since the music started.
  playedSeconds: number
}

// The element's volume, 0 to 1: the setting, scaled to the tuning's top,
// ducked under the radio, and faded in from the start.
export function musicVolume(
  { setting, radioGain, radioVolume, playedSeconds }: MusicFrame,
  tuning: MusicTuning
): number {
  const level = Math.min(1, Math.max(0, setting / 100))
  const heard =
    radioVolume > 0 ? Math.min(1, Math.max(0, radioGain / radioVolume)) : 0
  const duck = 1 - tuning.duck * heard
  const fade =
    tuning.fadeInSeconds > 0
      ? Math.min(1, Math.max(0, playedSeconds / tuning.fadeInSeconds))
      : 1
  return Math.min(1, Math.max(0, tuning.volume * level * duck * fade))
}
