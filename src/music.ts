// Pure: the valley's music, the Bull Valley Scaduscope theme, looped under
// everything once a raider has begun. Streamed from assets.the-rn.info,
// never in the bundle or the repo. musicrig.ts plays it; the raider's
// music setting (settings.ts) sets how loud.

export const MUSIC_URL =
  'https://assets.the-rn.info/bull-valley/bull-valley-scaduscope/01-bull-valley-scaduscope.mp3'

export interface MusicTuning {
  // The element's volume at the setting's top, 100%.
  volume: number
  // Seconds the music takes to come up from silence when it starts.
  fadeInSeconds: number
}

export interface MusicFrame {
  // The raider's music setting, in percent (settings.ts).
  setting: number
  // Seconds since the music started.
  playedSeconds: number
}

// The element's volume, 0 to 1: the setting, scaled to the tuning's top,
// and faded in from the start.
export function musicVolume(
  { setting, playedSeconds }: MusicFrame,
  tuning: MusicTuning
): number {
  const level = Math.min(1, Math.max(0, setting / 100))
  const fade =
    tuning.fadeInSeconds > 0
      ? Math.min(1, Math.max(0, playedSeconds / tuning.fadeInSeconds))
      : 1
  return Math.min(1, Math.max(0, tuning.volume * level * fade))
}
