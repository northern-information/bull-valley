// The radio heard: one streaming <audio> through a Three PositionalAudio in
// the truck's cab, held to the valley's moment (radio.ts `tuneAt`). It
// plays only once the player has begun and only while the truck is near
// enough to hear, so a raider across the valley never downloads it.

import * as THREE from 'three'
import { CONFIG } from './config.ts'
import { heardAt, RADIO_BASE, RADIO_TRACKS, tuneAt } from './radio.ts'

export interface RadioFrame {
  // The valley's clock, ms since the epoch.
  serverMs: number
  // Metres from the player to the truck.
  distance: number
  riding: boolean
  // The player has begun (a click has armed the page's sound).
  started: boolean
}

export interface Radio {
  update(frame: RadioFrame): void
}

export function createRadio(camera: THREE.Camera, cab: THREE.Object3D): Radio {
  const tuning = CONFIG.radio
  let listener: THREE.AudioListener | null = null
  let sound: THREE.PositionalAudio | null = null
  let filter: BiquadFilterNode | null = null
  let element: HTMLAudioElement | null = null
  let index = -1
  let playing = false
  // A refused play (no activation yet, or the stream failed) waits this
  // long, in ms of the valley's clock, before it tries again.
  let retryAt = 0

  // Built on the first frame after Begin, inside the page's activation, so
  // the context starts running.
  const build = (): void => {
    listener = new THREE.AudioListener()
    camera.add(listener)
    element = new Audio()
    element.crossOrigin = 'anonymous'
    element.preload = 'none'
    sound = new THREE.PositionalAudio(listener)
    // Panning only: the distance is radio.ts `heardAt`'s.
    sound.setDistanceModel('linear')
    sound.setRolloffFactor(0)
    sound.setMediaElementSource(element)
    filter = listener.context.createBiquadFilter()
    filter.type = 'lowpass'
    sound.setFilter(filter)
    sound.position.set(0, 1.2, 0.6)
    cab.add(sound)
  }

  // A seek deep into a mix takes a few seconds to buffer and lands that
  // far behind; the drift check seeks again, and the second, from what is
  // already buffered nearby, holds within driftSeconds.
  const seek = (el: HTMLAudioElement, offset: number): void => {
    el.currentTime = offset
  }

  const stop = (): void => {
    if (!element || !playing) return
    element.pause()
    playing = false
  }

  return {
    update({ serverMs, distance, riding, started }) {
      const audible = riding || distance < tuning.far + tuning.pauseBeyond
      if (!started || !audible) {
        stop()
        return
      }
      if (!listener) build()
      if (!listener || !sound || !filter || !element) return
      if (listener.context.state === 'suspended') {
        // Fire and forget: a context that will not resume stays silent.
        void listener.context.resume()
      }

      const heard = heardAt(distance, riding, tuning)
      sound.setVolume(heard.gain)
      filter.frequency.value = heard.cutoffHz

      const tuned = tuneAt(serverMs)
      if (tuned.index !== index) {
        index = tuned.index
        element.src = RADIO_BASE + RADIO_TRACKS[index].file
        seek(element, tuned.offset)
        playing = false
      } else if (
        playing &&
        !element.seeking &&
        element.readyState >= HTMLMediaElement.HAVE_FUTURE_DATA &&
        Math.abs(element.currentTime - tuned.offset) > tuning.driftSeconds
      ) {
        seek(element, tuned.offset)
      }
      if (!playing && serverMs >= retryAt) {
        playing = true
        // Back in range: pick up the valley's moment, not where it paused.
        if (Math.abs(element.currentTime - tuned.offset) > tuning.driftSeconds)
          seek(element, tuned.offset)
        element.play().catch(() => {
          playing = false
          retryAt = serverMs + 3000
        })
      }
    },
  }
}
