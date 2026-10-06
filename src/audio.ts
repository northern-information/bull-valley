// The title-card cues (the Northern Information colophon and the Bull
// Valley Shadow Wars logo), played through WebAudio via playOneShot. The
// game has no other sound.

import type { OneShotEnvelope } from './interfaces.ts'

// Older Safari has only the prefixed constructor.
interface WebkitAudioWindow {
  AudioContext: typeof AudioContext
  webkitAudioContext?: typeof AudioContext
}

interface OneShot {
  src: AudioBufferSourceNode
  gain: GainNode
}

export class BvAudio {
  ctx: AudioContext | null
  master: GainNode | null = null
  muted: boolean
  oneShot: OneShot | null
  oneShotSeq: number

  constructor() {
    this.ctx = null
    this.muted = false
    this.oneShot = null
    this.oneShotSeq = 0
  }

  // The context and its master gain. Must be called from a user gesture.
  initContext(): void {
    if (this.ctx) {
      // Fire and forget: a context that will not resume stays silent.
      void this.ctx.resume()
      return
    }
    const win: WebkitAudioWindow = window
    const ctx = new (win.AudioContext || win.webkitAudioContext)()
    this.ctx = ctx
    this.master = ctx.createGain()
    this.master.gain.value = this.muted ? 0 : 0.8
    this.master.connect(ctx.destination)
  }

  setMuted(muted: boolean): void {
    this.muted = muted
    if (this.master) this.master.gain.value = muted ? 0 : 0.8
  }

  // One-shot file playback with a triangle gain envelope (the splash cue).
  // Routed through the master gain so the mute toggle stays authoritative.
  // Fetch/decode failures are swallowed: the visual is authoritative and a
  // missing mp3 must never block the splash.
  async playOneShot(
    url: string,
    { fadeInMs, holdMs, fadeOutMs }: OneShotEnvelope
  ): Promise<void> {
    if (!this.ctx || !this.master) return
    const ctx = this.ctx
    const master = this.master
    // stopOneShot can race the fetch/decode (skip before the cue loads); the
    // token invalidates the in-flight request so a dismissed cue never starts.
    const seq = ++this.oneShotSeq
    try {
      const response = await fetch(url)
      const buffer = await ctx.decodeAudioData(await response.arrayBuffer())
      if (seq !== this.oneShotSeq || this.oneShot) return
      const gain = ctx.createGain()
      const t0 = ctx.currentTime
      gain.gain.setValueAtTime(0, t0)
      gain.gain.linearRampToValueAtTime(1, t0 + fadeInMs / 1000)
      gain.gain.setValueAtTime(1, t0 + (fadeInMs + holdMs) / 1000)
      gain.gain.linearRampToValueAtTime(
        0,
        t0 + (fadeInMs + holdMs + fadeOutMs) / 1000
      )
      gain.connect(master)
      const src = ctx.createBufferSource()
      src.buffer = buffer
      src.connect(gain)
      this.oneShot = { src, gain }
      src.onended = () => {
        if (this.oneShot && this.oneShot.src === src) this.oneShot = null
        src.disconnect()
        gain.disconnect()
      }
      src.start()
    } catch {
      // Silent: no cue, splash carries on.
    }
  }

  stopOneShot(fadeMs: number): void {
    this.oneShotSeq++
    const shot = this.oneShot
    this.oneShot = null
    if (!shot || !this.ctx) return
    const t0 = this.ctx.currentTime
    shot.gain.gain.cancelScheduledValues(t0)
    shot.gain.gain.setValueAtTime(shot.gain.gain.value, t0)
    shot.gain.gain.linearRampToValueAtTime(0, t0 + fadeMs / 1000)
    shot.src.stop(t0 + fadeMs / 1000)
  }
}
