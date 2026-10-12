// The music heard: one streaming <audio> on a loop (music.ts), its volume
// set every frame from the raider's setting. Built when the main menu
// shows (mainmenu.ts drives it until the menu comes down, loop.ts after),
// the colophon's click having armed the page's sound; once started it keeps
// playing through the select and the intro. None under e2e, which never
// plays sound.

import { CONFIG } from './config.ts'
import { MUSIC_URL, musicVolume } from './music.ts'

export interface MusicRigFrame {
  // The page's clock, ms.
  now: number
  // The music may start: the main menu is up, or the player has begun.
  // Once started, it plays on whatever later frames say.
  started: boolean
  // The raider's music setting, in percent.
  setting: number
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
    update({ now, started, setting }) {
      if (!started && !element) return
      if (!element) {
        element = new Audio(MUSIC_URL)
        element.loop = true
        element.preload = 'auto'
        element.volume = 0
      }
      const volume = musicVolume(
        {
          setting,
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
