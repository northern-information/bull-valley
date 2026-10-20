// The modem heard (modem.ts's cues): a 56k handshake synthesized in Web
// Audio, so no recording sits in the repo or the bundle. The dial tone
// (350 and 440 Hz), the number as DTMF, the ring (440 and 480 Hz), the
// answer tone (2100 Hz with its phase flips) and the bong, then training:
// bursts of band-passed noise and sweeping chirps, until the speaker is
// cut on connect (the hush). Built on the tap that dials, since a phone
// plays nothing before one; none under e2e.

import type { ModemCue } from './modem.ts'

// The number dialed, 1-815-BULL-VLY, as the keypad sends it.
const NUMBER = '18152855859'

// Each key's low and high tone (Hz).
const DTMF: Record<string, [number, number]> = {
  '1': [697, 1209],
  '2': [697, 1336],
  '3': [697, 1477],
  '4': [770, 1209],
  '5': [770, 1336],
  '6': [770, 1477],
  '7': [852, 1209],
  '8': [852, 1336],
  '9': [852, 1477],
  '0': [941, 1336],
}

export class ModemAudio {
  private ctx: AudioContext
  private out: GainNode
  private noise: AudioBuffer
  private live: AudioScheduledSourceNode[] = []

  // `volume` from 0 to 1 (the raider's Sounds setting).
  constructor(volume: number) {
    this.ctx = new AudioContext()
    this.out = this.ctx.createGain()
    this.out.gain.value = Math.max(0, Math.min(1, volume)) * 0.35
    this.out.connect(this.ctx.destination)
    const length = this.ctx.sampleRate * 2
    this.noise = this.ctx.createBuffer(1, length, this.ctx.sampleRate)
    const data = this.noise.getChannelData(0)
    for (let i = 0; i < length; i++) data[i] = Math.random() * 2 - 1
    void this.ctx.resume()
  }

  // Plays `cue` `delay` seconds from now.
  play(cue: ModemCue, delay = 0): void {
    const t = this.ctx.currentTime + Math.max(0, delay)
    switch (cue) {
      case 'dialtone':
        this.tones([350, 440], t, 1)
        return
      case 'dtmf':
        ;[...NUMBER].forEach((digit, i) => {
          this.tones(DTMF[digit], t + i * 0.12, 0.07)
        })
        return
      case 'ring':
        this.tones([440, 480], t, 1.2)
        return
      case 'answer':
        this.answer(t)
        return
      case 'train':
        this.train(t)
        return
      case 'hush':
        this.hush(t)
        return
      case 'click':
        this.burst(t, 0.03, 2000, 0.6)
        return
    }
  }

  // Everything stops, and the context goes.
  close(): void {
    this.hush(this.ctx.currentTime)
    void this.ctx.close()
  }

  private keep(node: AudioScheduledSourceNode, start: number, end: number) {
    node.start(start)
    node.stop(end)
    this.live.push(node)
    node.onended = () => {
      this.live = this.live.filter((n) => n !== node)
    }
  }

  private envelope(start: number, length: number, level = 1): GainNode {
    const g = this.ctx.createGain()
    g.gain.setValueAtTime(0, start)
    g.gain.linearRampToValueAtTime(level, start + 0.01)
    g.gain.setValueAtTime(level, start + Math.max(0.01, length - 0.02))
    g.gain.linearRampToValueAtTime(0, start + length)
    g.connect(this.out)
    return g
  }

  private tones(freqs: readonly number[], start: number, length: number) {
    const g = this.envelope(start, length, 0.5)
    for (const f of freqs) {
      const osc = this.ctx.createOscillator()
      osc.frequency.value = f
      osc.connect(g)
      this.keep(osc, start, start + length)
    }
  }

  // 2100 Hz with a phase flip every 450 ms (heard as a click), then the
  // bong: the calling modem's answer, a low tone falling away.
  private answer(start: number) {
    for (let i = 0; i < 2; i++) {
      this.tones([2100], start + i * 0.45, 0.43)
    }
    const g = this.envelope(start + 0.95, 0.35, 0.6)
    const osc = this.ctx.createOscillator()
    osc.frequency.setValueAtTime(980, start + 0.95)
    osc.frequency.exponentialRampToValueAtTime(600, start + 1.3)
    osc.connect(g)
    this.keep(osc, start + 0.95, start + 1.3)
  }

  // Training: noise in shifting bands and chirps sweeping over it.
  private train(start: number) {
    const bands = [1800, 1200, 2400, 1000, 3000, 1600]
    bands.forEach((band, i) => {
      this.burst(start + i * 0.26, 0.24, band, 0.5)
    })
    for (let i = 0; i < 3; i++) {
      const at = start + 0.1 + i * 0.5
      const g = this.envelope(at, 0.3, 0.3)
      const osc = this.ctx.createOscillator()
      osc.type = 'square'
      osc.frequency.setValueAtTime(600, at)
      osc.frequency.exponentialRampToValueAtTime(3000, at + 0.3)
      osc.connect(g)
      this.keep(osc, at, at + 0.3)
    }
  }

  private burst(start: number, length: number, band: number, level: number) {
    const src = this.ctx.createBufferSource()
    src.buffer = this.noise
    const filter = this.ctx.createBiquadFilter()
    filter.type = 'bandpass'
    filter.frequency.value = band
    filter.Q.value = 1.5
    src.connect(filter)
    filter.connect(this.envelope(start, length, level))
    this.keep(src, start, start + length)
  }

  // The speaker cut: whatever is still sounding stops.
  private hush(at: number) {
    for (const node of this.live) {
      try {
        node.stop(at)
      } catch {
        // Already stopped.
      }
    }
  }
}
