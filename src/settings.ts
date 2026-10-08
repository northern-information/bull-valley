// Pure: the raider's settings, kept on the account (PUT /auth/settings) so
// they follow the raider to any browser, as the look and the hotbar do.
// For now one: how loud the valley's music plays, in percent. No three.js,
// no DOM: settingsui.ts draws the slider and musicrig.ts plays the music.

import type { SettingsWire } from './account.ts'

export type Settings = SettingsWire

// The music sits under the valley: a new account hears it at this.
export const DEFAULT_SETTINGS: Settings = { music: 30 }

// The slider's travel and its step, in percent.
export const MUSIC_MAX = 100
export const MUSIC_STEP = 5

// Whether a value off the wire is a whole settings: the music a whole
// number of percent from 0 to MUSIC_MAX.
export function isSettings(value: unknown): value is Settings {
  if (typeof value !== 'object' || value === null) return false
  const { music } = value as Record<string, unknown>
  return (
    typeof music === 'number' &&
    Number.isInteger(music) &&
    music >= 0 &&
    music <= MUSIC_MAX
  )
}

// Stored settings, each one missing or malformed read as its default.
export function toSettings(value: unknown): Settings {
  const music =
    typeof value === 'object' && value !== null
      ? (value as Record<string, unknown>).music
      : undefined
  return {
    music:
      typeof music === 'number' && Number.isFinite(music)
        ? Math.round(Math.min(MUSIC_MAX, Math.max(0, music)))
        : DEFAULT_SETTINGS.music,
  }
}
