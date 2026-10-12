// The valley's sounds heard (sfx.ts): one AudioContext, built on the first
// frame after Begin, inside the page's activation, as the music is. Every
// sound starts as its placeholder, synthesized here into a buffer, and a
// delivered take replaces it once it has loaded. A placed sound is panned
// and faded against the camera, which the listener follows every frame;
// loops are held frame by frame under a key and stopped the first frame
// that does not hold them. None under e2e, which never plays sound.
//
// Dev builds can audition files before they are delivered: with
// `?sfx=local` every sound is looked for in `public/sfx/` (gitignored) as
// `<id>.ogg`, or `<id>-1.ogg`, `<id>-2.ogg`… for takes.

import { CONFIG } from './config.ts'
import { mulberry32 } from './rng.ts'
import {
  SFX,
  SFX_BASE,
  SFX_IDS,
  sfxGain,
  takeUrls,
  toneSamples,
} from './sfx.ts'
import type { Cue, Hold, SfxId } from './sfx.ts'
import type { Camera } from 'three'

export interface SfxFrame {
  // The player has begun (a click has armed the page's sound).
  started: boolean
  // The raider's sounds setting, in percent.
  setting: number
  // Where the raider hears from.
  listener: Camera
}

export interface XYZ {
  x: number
  y: number
  z: number
}

export interface Sfx {
  update(frame: SfxFrame): void
  // A sound once: at a place in the valley, or in the head without one.
  play(id: SfxId, at?: XYZ | null, rate?: number): void
  // One frame's cues, played, and its loops, held; `heightAt` stands each
  // on the ground at the height it sounds from.
  hear(
    cues: readonly Cue[],
    holds: readonly Hold[],
    heightAt: (x: number, z: number) => number
  ): void
}

export interface SfxOptions {
  // Where takes stream from.
  base?: string
  // Look for every sound's takes in `base` whatever the table says (dev).
  probe?: boolean
}

// How high off the ground a placed sound sounds from, in metres.
const SOUND_HEIGHT = 1.2

interface Held {
  id: SfxId
  source: AudioBufferSourceNode
  gain: GainNode
  panner: PannerNode
}

// The takes a probe looks for: one file, or numbered ones up to this many.
const PROBE_TAKES = 8

export function createSfx({
  base = SFX_BASE,
  probe = false,
}: SfxOptions = {}): Sfx {
  let ctx: AudioContext | null = null
  let master: GainNode | null = null
  const buffers = new Map<SfxId, AudioBuffer[]>()
  const held = new Map<string, Held>()
  const jitter = mulberry32(0x5f8)

  const load = async (
    audio: AudioContext,
    url: string
  ): Promise<AudioBuffer | null> => {
    try {
      const res = await fetch(url)
      if (!res.ok) return null
      return await audio.decodeAudioData(await res.arrayBuffer())
    } catch {
      return null
    }
  }

  // The delivered takes, or (probing) whatever is there.
  const takesOf = async (
    audio: AudioContext,
    id: SfxId
  ): Promise<AudioBuffer[]> => {
    const urls = takeUrls(id, SFX[id].takes, base)
    if (!probe) {
      const loaded = await Promise.all(urls.map((url) => load(audio, url)))
      return loaded.filter((b): b is AudioBuffer => b !== null)
    }
    const one = await load(audio, `${base}${id}.ogg`)
    if (one) return [one]
    const takes: AudioBuffer[] = []
    for (let i = 1; i <= PROBE_TAKES; i++) {
      const take = await load(audio, `${base}${id}-${i}.ogg`)
      if (!take) break
      takes.push(take)
    }
    return takes
  }

  const start = (): AudioContext => {
    const audio = new AudioContext()
    master = audio.createGain()
    master.connect(audio.destination)
    SFX_IDS.forEach((id, i) => {
      const spec = SFX[id]
      const samples = toneSamples(
        spec.placeholder,
        audio.sampleRate,
        spec.loop,
        mulberry32(0x5f80 + i)
      )
      const buffer = audio.createBuffer(1, samples.length, audio.sampleRate)
      buffer.copyToChannel(samples, 0)
      buffers.set(id, [buffer])
      void takesOf(audio, id).then((takes) => {
        if (takes.length) buffers.set(id, takes)
      })
    })
    return audio
  }

  const pannerAt = (audio: AudioContext, at: XYZ): PannerNode => {
    const panner = audio.createPanner()
    panner.panningModel = 'HRTF'
    panner.distanceModel = 'inverse'
    panner.refDistance = CONFIG.sfx.refDistance
    panner.rolloffFactor = CONFIG.sfx.rolloff
    place(panner, at)
    return panner
  }

  const source = (audio: AudioContext, id: SfxId): AudioBufferSourceNode => {
    const takes = buffers.get(id) ?? []
    const node = audio.createBufferSource()
    node.buffer = takes[Math.floor(jitter() * takes.length)] ?? null
    node.loop = SFX[id].loop
    return node
  }

  const wander = (rate: number) =>
    rate * (1 + CONFIG.sfx.jitter * (jitter() * 2 - 1))

  const play: Sfx['play'] = (id, at = null, rate = 1) => {
    if (!ctx || !master) return
    const node = source(ctx, id)
    node.playbackRate.value = wander(rate)
    const gain = ctx.createGain()
    gain.gain.value = SFX[id].gain
    node.connect(gain)
    if (at && SFX[id].positional) {
      const panner = pannerAt(ctx, at)
      gain.connect(panner)
      panner.connect(master)
    } else {
      gain.connect(master)
    }
    node.start()
  }

  return {
    update({ started, setting, listener }) {
      if (!started) return
      ctx ??= start()
      if (ctx.state === 'suspended') void ctx.resume()
      if (master) master.gain.value = sfxGain(setting, { gain: 1 }, CONFIG.sfx)
      // The listener stands at the camera, facing as it faces.
      listener.updateMatrixWorld()
      const m = listener.matrixWorld.elements
      const ear = ctx.listener
      if (ear.positionX) {
        ear.positionX.value = m[12]
        ear.positionY.value = m[13]
        ear.positionZ.value = m[14]
        ear.forwardX.value = -m[8]
        ear.forwardY.value = -m[9]
        ear.forwardZ.value = -m[10]
        ear.upX.value = m[4]
        ear.upY.value = m[5]
        ear.upZ.value = m[6]
      } else {
        ear.setPosition(m[12], m[13], m[14])
        ear.setOrientation(-m[8], -m[9], -m[10], m[4], m[5], m[6])
      }
    },

    play,

    hear(cues, holds, heightAt) {
      if (!ctx || !master) return
      const at = (x: number, z: number): XYZ => ({
        x,
        y: heightAt(x, z) + SOUND_HEIGHT,
        z,
      })
      for (const cue of cues) play(cue.id, at(cue.x, cue.z), cue.rate)
      const kept = new Set<string>()
      for (const hold of holds) {
        kept.add(hold.key)
        let loop = held.get(hold.key)
        if (!loop) {
          const node = source(ctx, hold.id)
          const gain = ctx.createGain()
          const panner = pannerAt(ctx, at(hold.x, hold.z))
          node.connect(gain)
          gain.connect(panner)
          panner.connect(master)
          node.start(0, jitter() * (node.buffer?.duration ?? 0))
          loop = { id: hold.id, source: node, gain, panner }
          held.set(hold.key, loop)
        }
        loop.source.playbackRate.value = hold.rate
        loop.gain.gain.value = SFX[hold.id].gain * hold.gain
        place(loop.panner, at(hold.x, hold.z))
      }
      for (const [key, loop] of held) {
        if (kept.has(key)) continue
        loop.source.stop()
        loop.source.disconnect()
        loop.panner.disconnect()
        held.delete(key)
      }
    },
  }
}

function place(panner: PannerNode, { x, y, z }: XYZ): void {
  if (panner.positionX) {
    panner.positionX.value = x
    panner.positionY.value = y
    panner.positionZ.value = z
  } else {
    panner.setPosition(x, y, z)
  }
}
