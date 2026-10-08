// The raider's settings in the page: one store shared by the main menu's
// Settings and the pause overlay, so both sliders always agree, and the
// music slider they each draw. A change is heard at once (the music reads
// the store every frame) and saved to the account once the slider has been
// let go and left a moment (auth.ts `saveSettings`), so an arrow key held
// down saves once; never to the browser.

import { saveSettings } from './auth.ts'
import { copy } from './copy.ts'
import {
  DEFAULT_SETTINGS,
  MUSIC_MAX,
  MUSIC_STEP,
  toSettings,
} from './settings.ts'
import type { Settings } from './settings.ts'

export interface SettingsStore {
  readonly current: Settings
  // The account's settings, as /auth/me read them; nothing is saved.
  load(raw: unknown): void
  // The raider moved a slider: heard at once, and saved a moment after the
  // last `commit`.
  setMusic(music: number, commit: boolean): void
  // Called with the settings whenever they change.
  subscribe(listener: (settings: Settings) => void): void
}

// How long a let-go slider waits for the next change before it saves.
const SAVE_AFTER_MS = 600

export function createSettingsStore(
  save: (settings: Settings) => Promise<unknown> = saveSettings,
  saveAfterMs = SAVE_AFTER_MS
): SettingsStore {
  let current: Settings = DEFAULT_SETTINGS
  let pending: ReturnType<typeof setTimeout> | null = null
  const listeners: ((settings: Settings) => void)[] = []
  const set = (next: Settings) => {
    current = next
    for (const listener of listeners) listener(current)
  }
  return {
    get current() {
      return current
    },
    load(raw) {
      set(toSettings(raw))
    },
    setMusic(music, commit) {
      set(toSettings({ ...current, music }))
      if (!commit) return
      if (pending !== null) clearTimeout(pending)
      pending = setTimeout(() => {
        pending = null
        void save(current)
      }, saveAfterMs)
    },
    subscribe(listener) {
      listeners.push(listener)
    },
  }
}

// A labelled music slider kept in step with the store: dragging it is
// heard as it moves, and letting it go saves.
export function musicSlider(store: SettingsStore): HTMLElement {
  const row = document.createElement('label')
  row.className = 'bv-setting'
  const name = document.createElement('span')
  name.className = 'bv-setting-name'
  name.textContent = copy('menu.music')
  const input = document.createElement('input')
  input.type = 'range'
  input.className = 'bv-setting-range'
  input.min = '0'
  input.max = String(MUSIC_MAX)
  input.step = String(MUSIC_STEP)
  input.dataset.bv = 'setting-music'
  const level = document.createElement('span')
  level.className = 'bv-setting-level'
  const show = ({ music }: Settings) => {
    if (input.value !== String(music)) input.value = String(music)
    level.textContent = copy('menu.music_level', { percent: String(music) })
  }
  show(store.current)
  store.subscribe(show)
  input.addEventListener('input', () =>
    store.setMusic(Number(input.value), false)
  )
  input.addEventListener('change', () =>
    store.setMusic(Number(input.value), true)
  )
  row.append(name, input, level)
  return row
}
