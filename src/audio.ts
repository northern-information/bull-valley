// Procedural WebAudio: wind, radio static that scales with presence,
// Geiger-style contact ticks, footsteps, a heartbeat that arrives with the
// nerves, and item sounds. One exception to the no-audio-files rule ships
// with the game: the Northern Information splash mp3, played via playOneShot.

export class BvAudio {
  constructor() {
    this.ctx = null
    this.muted = false
    this.bedsStarted = false
    this.oneShot = null
    this.oneShotSeq = 0
    this.tickTimer = 1
    this.heartTimer = 0
    this.presence = 0
    this.heartbeat = 0
  }

  // Context + master gain only, no ambient beds. Must be called from a
  // user gesture. The splash uses this so its cue can play without wind
  // and static arriving early; init() layers the beds on top.
  initContext() {
    if (this.ctx) {
      this.ctx.resume()
      return
    }
    const ctx = new (window.AudioContext || window.webkitAudioContext)()
    this.ctx = ctx
    this.master = ctx.createGain()
    this.master.gain.value = this.muted ? 0 : 0.8
    this.master.connect(ctx.destination)

    const noiseBuffer = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate)
    const data = noiseBuffer.getChannelData(0)
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1
    this.noiseBuffer = noiseBuffer
  }

  // Must be called from a user gesture.
  init() {
    this.initContext()
    if (this.bedsStarted) return
    this.bedsStarted = true
    const ctx = this.ctx

    // Wind: looped noise through a slow-wobbling lowpass.
    const wind = ctx.createBufferSource()
    wind.buffer = this.noiseBuffer
    wind.loop = true
    const windFilter = ctx.createBiquadFilter()
    windFilter.type = 'lowpass'
    windFilter.frequency.value = 320
    const windGain = ctx.createGain()
    windGain.gain.value = 0.05
    wind.connect(windFilter).connect(windGain).connect(this.master)
    wind.start()
    const lfo = ctx.createOscillator()
    lfo.frequency.value = 0.11
    const lfoGain = ctx.createGain()
    lfoGain.gain.value = 140
    lfo.connect(lfoGain).connect(windFilter.frequency)
    lfo.start()

    // Static bed: gain driven by shadowman presence.
    const stat = ctx.createBufferSource()
    stat.buffer = this.noiseBuffer
    stat.loop = true
    const statFilter = ctx.createBiquadFilter()
    statFilter.type = 'highpass'
    statFilter.frequency.value = 1400
    this.staticGain = ctx.createGain()
    this.staticGain.gain.value = 0
    stat.connect(statFilter).connect(this.staticGain).connect(this.master)
    stat.start()
  }

  setMuted(muted) {
    this.muted = muted
    if (this.master) this.master.gain.value = muted ? 0 : 0.8
  }

  // One-shot file playback with a triangle gain envelope (the splash cue).
  // Routed through the master gain so the mute toggle stays authoritative.
  // Fetch/decode failures are swallowed: the visual is authoritative and a
  // missing mp3 must never block the splash.
  async playOneShot(url, { fadeInMs, holdMs, fadeOutMs }) {
    if (!this.ctx) return
    const ctx = this.ctx
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
      gain.connect(this.master)
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

  stopOneShot(fadeMs) {
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

  burst({ duration, filterType, frequency, gain, sweepTo }) {
    if (!this.ctx) return
    const ctx = this.ctx
    const src = ctx.createBufferSource()
    src.buffer = this.noiseBuffer
    const filter = ctx.createBiquadFilter()
    filter.type = filterType
    filter.frequency.value = frequency
    if (sweepTo) {
      filter.frequency.linearRampToValueAtTime(
        sweepTo,
        ctx.currentTime + duration
      )
    }
    const env = ctx.createGain()
    env.gain.setValueAtTime(gain, ctx.currentTime)
    env.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration)
    src.connect(filter).connect(env).connect(this.master)
    src.start(ctx.currentTime, Math.random(), duration + 0.05)
  }

  tone({ frequency, duration, gain, type = 'sine', sweepTo }) {
    if (!this.ctx) return
    const ctx = this.ctx
    const osc = ctx.createOscillator()
    osc.type = type
    osc.frequency.value = frequency
    if (sweepTo) {
      osc.frequency.exponentialRampToValueAtTime(
        sweepTo,
        ctx.currentTime + duration
      )
    }
    const env = ctx.createGain()
    env.gain.setValueAtTime(gain, ctx.currentTime)
    env.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration)
    osc.connect(env).connect(this.master)
    osc.start()
    osc.stop(ctx.currentTime + duration + 0.05)
  }

  step(sprinting) {
    this.burst({
      duration: 0.07,
      filterType: 'lowpass',
      frequency: 260,
      gain: sprinting ? 0.16 : 0.1,
    })
  }

  use(kind, { crackle = false } = {}) {
    // Lighter flick ×2, then the joint gets a longer crackle and a clove
    // kretek a run of short pops.
    this.burst({
      duration: 0.03,
      filterType: 'highpass',
      frequency: 2400,
      gain: 0.2,
    })
    setTimeout(
      () =>
        this.burst({
          duration: 0.05,
          filterType: 'highpass',
          frequency: 2000,
          gain: 0.25,
        }),
      120
    )
    if (crackle) {
      for (const at of [380, 470, 600, 690, 850]) {
        setTimeout(
          () =>
            this.burst({
              duration: 0.02,
              filterType: 'highpass',
              frequency: 3200,
              gain: 0.14,
            }),
          at
        )
      }
    }
    if (kind === 'joints') {
      setTimeout(
        () =>
          this.burst({
            duration: 0.5,
            filterType: 'bandpass',
            frequency: 900,
            gain: 0.12,
          }),
        350
      )
    }
  }

  pickup() {
    this.tone({ frequency: 660, duration: 0.09, gain: 0.08, type: 'square' })
    this.tone({ frequency: 880, duration: 0.14, gain: 0.06, type: 'square' })
  }

  strike() {
    this.burst({
      duration: 1.1,
      filterType: 'highpass',
      frequency: 600,
      gain: 0.5,
    })
    this.tone({
      frequency: 220,
      sweepTo: 38,
      duration: 1.2,
      gain: 0.3,
      type: 'sawtooth',
    })
  }

  setPresence(presence) {
    this.presence = Math.max(0, Math.min(1, presence))
    if (this.staticGain) {
      this.staticGain.gain.value = this.presence * 0.22
    }
  }

  setHeartbeat(intensity) {
    this.heartbeat = Math.max(0, Math.min(1, intensity))
  }

  update(dt) {
    if (!this.ctx) return
    // Contact ticks, Geiger-paced by presence.
    this.tickTimer -= dt * (0.15 + this.presence * 7)
    if (this.tickTimer <= 0) {
      this.tone({ frequency: 1700, duration: 0.03, gain: 0.05, type: 'square' })
      this.tickTimer = 0.6 + Math.random()
    }
    // Heartbeat: lub-dub, faster as intensity climbs.
    if (this.heartbeat > 0.2) {
      this.heartTimer -= dt
      if (this.heartTimer <= 0) {
        this.tone({ frequency: 52, duration: 0.11, gain: 0.3 })
        setTimeout(
          () => this.tone({ frequency: 48, duration: 0.09, gain: 0.2 }),
          180
        )
        this.heartTimer = 1.25 - this.heartbeat * 0.7
      }
    }
  }
}
