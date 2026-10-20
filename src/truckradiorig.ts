// Matthew Marx's radio heard (truckradio.ts): one AudioContext, built on
// the first frame after Begin as the valley's sounds are, the song fetched
// and decoded once, and played looped through a low-pass and a gain while
// the truck rolls. Each start picks the song up where the engine's clock
// says it is, so everyone near the truck hears the same bar; the mix
// follows the raider's distance every frame. None under e2e, which never
// plays sound.

import { CONFIG } from './config.ts'
import { RADIO_URL, radioMix, radioOffset } from './truckradio.ts'

interface RadioFrame {
  // The player has begun (a click has armed the page's sound).
  started: boolean
  // The raider's music setting, in percent.
  setting: number
  // Seconds since the truck started rolling, or null while it stands.
  engine: number | null
  // Metres from the raider to the truck, and whether they ride in its bed.
  distance: number
  aboard: boolean
}

export interface TruckRadio {
  update(frame: RadioFrame): void
}

// Seconds a change in the mix glides over, so nothing clicks or zips.
const GLIDE = 0.08
// Seconds the song fades out over when the truck stops.
const FADE_OUT = 0.6

// The song, decoded, or null when it never came.
async function load(audio: AudioContext): Promise<AudioBuffer | null> {
  try {
    const res = await fetch(RADIO_URL)
    if (!res.ok) return null
    return await audio.decodeAudioData(await res.arrayBuffer())
  } catch {
    return null
  }
}

interface Playing {
  source: AudioBufferSourceNode
  gain: GainNode
}

export function createTruckRadio(): TruckRadio {
  let ctx: AudioContext | null = null
  let song: AudioBuffer | null = null
  let filter: BiquadFilterNode | null = null
  let playing: Playing | null = null

  const start = (): AudioContext => {
    const audio = new AudioContext()
    filter = audio.createBiquadFilter()
    filter.type = 'lowpass'
    filter.Q.value = 0.7
    filter.frequency.value = audio.sampleRate / 2
    filter.connect(audio.destination)
    void load(audio).then((buffer) => {
      song = buffer
    })
    return audio
  }

  const stop = (audio: AudioContext) => {
    if (!playing) return
    const { source, gain } = playing
    gain.gain.setTargetAtTime(0, audio.currentTime, FADE_OUT / 3)
    source.stop(audio.currentTime + FADE_OUT)
    source.onended = () => {
      source.disconnect()
      gain.disconnect()
    }
    playing = null
  }

  return {
    update({ started, setting, engine, distance, aboard }) {
      if (!started) return
      ctx ??= start()
      if (ctx.state === 'suspended') void ctx.resume()
      if (engine === null || !song || !filter) {
        stop(ctx)
        return
      }
      const mix = radioMix({ distance, aboard, setting }, CONFIG.truck.radio)
      const now = ctx.currentTime
      if (!playing) {
        const source = ctx.createBufferSource()
        source.buffer = song
        source.loop = true
        const gain = ctx.createGain()
        gain.gain.value = 0
        source.connect(gain)
        gain.connect(filter)
        source.start(0, radioOffset(engine, song.duration))
        playing = { source, gain }
      }
      playing.gain.gain.setTargetAtTime(mix.gain, now, GLIDE)
      filter.frequency.setTargetAtTime(
        mix.cutoff ?? ctx.sampleRate / 2,
        now,
        GLIDE
      )
    },
  }
}
