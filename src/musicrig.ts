// The music heard: one streaming <audio> on a loop (music.ts), its volume
// set every frame from the raider's setting and the radio. Built on the
// first frame after Begin, inside the page's activation, so a raider who
// never begins downloads nothing; none under e2e, which never plays sound.

import { CONFIG } from './config.ts'
import { MUSIC_URL, musicVolume } from './music.ts'

export interface MusicRigFrame {
  // The page's clock, ms.
  now: number
  // The player has begun (a click has armed the page's sound).
  started: boolean
  // The raider's music setting, in percent.
  setting: number
  // How loud Marx's radio is heard now (radio.ts `heardAt`).
  radioGain: number
}

export interface Music {
  update(frame: MusicRigFrame): void
}

export function createMusic(): Music {
  let element: HTMLAudioElement | null = null
  let startedAt = 0
  let playing = false
  // A refused play (no activation yet, or the stream failed) waits this
  // long, in ms, before it tries again.
  let retryAt = 0

  return {
    update({ now, started, setting, radioGain }) {
      if (!started) return
      if (!element) {
        element = new Audio(MUSIC_URL)
        element.loop = true
        element.preload = 'auto'
        element.volume = 0
      }
      const volume = musicVolume(
        {
          setting,
          radioGain,
          radioVolume: CONFIG.radio.volume,
          playedSeconds: playing ? (now - startedAt) / 1000 : 0,
        },
        CONFIG.music
      )
      if (element.volume !== volume) element.volume = volume
      if (!playing && now >= retryAt) {
        playing = true
        startedAt = now
        element.play().catch(() => {
          playing = false
          retryAt = now + 3000
        })
      }
    },
  }
}
