import { afterEach, describe, expect, it, vi } from 'vitest'
import { DEFAULT_SETTINGS } from '../../src/settings.ts'
import { createSettingsStore } from '../../src/settingsui.ts'
import type { Settings } from '../../src/settings.ts'

const recording = () => {
  const saved: Settings[] = []
  const store = createSettingsStore((s) => {
    saved.push(s)
    return Promise.resolve()
  }, 600)
  return { saved, store }
}

afterEach(() => {
  vi.useRealTimers()
})

describe('createSettingsStore', () => {
  it('hears a slider at once and saves once it has been let go a moment', () => {
    vi.useFakeTimers()
    const { saved, store } = recording()
    const heard: number[] = []
    store.subscribe((s) => heard.push(s.music))
    expect(store.current).toEqual(DEFAULT_SETTINGS)
    store.setMusic(55, false)
    store.setMusic(60, false)
    vi.advanceTimersByTime(1000)
    expect(saved).toEqual([])
    // An arrow key held down commits every step, and saves once.
    store.setMusic(65, true)
    vi.advanceTimersByTime(300)
    store.setMusic(70, true)
    vi.advanceTimersByTime(599)
    expect(saved).toEqual([])
    vi.advanceTimersByTime(1)
    expect(saved).toEqual([{ music: 70 }])
    expect(heard).toEqual([55, 60, 65, 70])
  })

  it('loads the account settings without saving them', () => {
    vi.useFakeTimers()
    const { saved, store } = recording()
    store.load({ music: 80 })
    expect(store.current).toEqual({ music: 80 })
    store.load(undefined)
    expect(store.current).toEqual(DEFAULT_SETTINGS)
    vi.advanceTimersByTime(1000)
    expect(saved).toEqual([])
  })
})
