// Pure: the raider's settings, kept on the account (PUT /auth/settings) so
// they follow the raider to any browser, as the look and the hotbar do.
// For now two volumes, in percent: the valley's music, and its sounds. No
// three.js, no DOM: settingsui.ts draws the sliders, musicrig.ts plays the
// music and sfxrig.ts the sounds.

import type { SettingsWire } from './account.ts'

export type Settings = SettingsWire

// The volumes a raider sets, each a slider.
export type Volume = keyof Settings
export const VOLUMES: readonly Volume[] = ['music', 'sfx']

// The music sits under the valley; the sounds sit over it.
export const DEFAULT_SETTINGS: Settings = { music: 30, sfx: 70 }

// Each slider's travel and its step, in percent.
export const MUSIC_MAX = 100
export const MUSIC_STEP = 5

const isVolume = (value: unknown): value is number =>
  typeof value === 'number' &&
  Number.isInteger(value) &&
  value >= 0 &&
  value <= MUSIC_MAX

// Whether a value off the wire is a whole settings: each volume a whole
// number of percent from 0 to MUSIC_MAX. The sounds may be missing (a page
// from before they were kept), and are then read as their default.
export function isSettings(value: unknown): value is Partial<Settings> & {
  music: number
} {
  if (typeof value !== 'object' || value === null) return false
  const { music, sfx } = value as Record<string, unknown>
  return isVolume(music) && (sfx === undefined || isVolume(sfx))
}

// One stored volume, missing or malformed read as its default.
function volumeOf(raw: Record<string, unknown> | null, key: Volume): number {
  const value = raw?.[key]
  return typeof value === 'number' && Number.isFinite(value)
    ? Math.round(Math.min(MUSIC_MAX, Math.max(0, value)))
    : DEFAULT_SETTINGS[key]
}

// Stored settings, each one missing or malformed read as its default.
export function toSettings(value: unknown): Settings {
  const raw =
    typeof value === 'object' && value !== null
      ? (value as Record<string, unknown>)
      : null
  return { music: volumeOf(raw, 'music'), sfx: volumeOf(raw, 'sfx') }
}
