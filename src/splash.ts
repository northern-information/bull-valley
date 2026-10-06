// The title cards, ported from revery-prairie: the Northern Information
// colophon, then the Bull Valley Shadow Wars logo. Each is a black card
// whose image fades in/holds/fades out on a triangle wave, with its cue
// under the same envelope, over a backdrop that stays opaque black the
// whole time, so nothing beneath ever bleeds through. Only after the image
// resolves (or a gesture skips) does the backdrop itself tween out and
// reveal what waits beneath. The colophon holds a hint first ("Click to
// Play" — the gesture also satisfies autoplay policy); the logo starts the
// moment the colophon lifts. The timings and latches live in the pure
// machine, splashmachine.ts; this file is the DOM glue.

import { CONFIG } from './config.ts'
import { copy } from './copy.ts'
import { createFog } from './fog.ts'
import { createSplashMachine } from './splashmachine.ts'
import type { BvAudio } from './audio.ts'
import type { FogLayer } from './fog.ts'
import type { SplashTiming } from './splashmachine.ts'

// A card's timings plus what it mounts and plays.
export interface CardConfig extends SplashTiming {
  skipAudioFadeMs: number
  imageSrc: string
  alt: string
  audioSrc: string
}

// A card that waits for a gesture behind a hint.
export interface SplashConfig extends CardConfig {
  hint: string
}

// The Northern Information colophon and the game's own logo: CONFIG's
// timings and files, with their words from COPY.toml. The words stay out of
// config.ts so the pure modules that read CONFIG never load the copy book.
export const COLOPHON: SplashConfig = {
  ...CONFIG.splash,
  alt: copy('titles.colophon_alt'),
  hint: copy('titles.colophon_hint'),
}

export const LOGO: CardConfig = {
  ...CONFIG.logo,
  alt: copy('titles.logo_alt'),
}

export interface CardOptions<C extends CardConfig = CardConfig> {
  audio: BvAudio
  config: C
  // Black fog in waves over the image (fog.ts), at this render downscale.
  fog?: { downscale: number }
}

// A mounted card. A card mounted early sits black and deaf beneath the
// cards above it. listen() arms its click and keys: the first gesture
// starts it, the next skips. start() arms it and starts it at once. done
// resolves once the card has removed itself.
export interface Card {
  root: HTMLDivElement
  listen(): void
  start(): void
  done: Promise<void>
}

// Dev builds skip the title cards with ?skipSplash.
export function skipTitles(): boolean {
  return (
    import.meta.env.DEV &&
    new URLSearchParams(window.location.search).has('skipSplash')
  )
}

// Mounts a black card as the last child of <body>, so DOM order stacks it
// above everything mounted before it, and drives opacity from a RAF loop.
// Audio failures never block the visual.
export function mountCard({ audio, config, fog }: CardOptions): Card {
  const machine = createSplashMachine({
    now: () => performance.now(),
    cfg: config,
  })

  const root = document.createElement('div')
  root.className = 'bv-splash'
  root.style.opacity = '1'
  document.body.appendChild(root)

  let rafId: number | null = null
  let img: HTMLImageElement | null = null
  let fogLayer: FogLayer | null = null
  let listening = false
  let resolveDone = () => {}
  const done = new Promise<void>((resolve) => {
    resolveDone = resolve
  })

  const cleanup = () => {
    if (rafId !== null) cancelAnimationFrame(rafId)
    document.removeEventListener('keydown', onGesture)
    fogLayer?.stop()
    root.remove()
    resolveDone()
  }

  const frame = () => {
    const { imgAlpha, rootAlpha, complete } = machine.tick()
    root.style.opacity = String(rootAlpha)
    if (img) img.style.opacity = String(imgAlpha)
    if (complete) {
      cleanup()
      return
    }
    rafId = requestAnimationFrame(frame)
  }

  const onGesture = () => {
    const action = machine.gesture()
    if (action === 'start') {
      // The colophon's gesture creates the AudioContext; later cards
      // reuse it.
      audio.initContext()
      // One cue plays at a time, and a tail still sounding would swallow
      // this one; clear it first.
      audio.stopOneShot(config.skipAudioFadeMs)
      // Not awaited: the cue catches its own failures.
      void audio.playOneShot(config.audioSrc, {
        fadeInMs: config.fadeInMs,
        holdMs: config.holdMs,
        fadeOutMs: config.fadeOutMs,
      })
      const image = document.createElement('img')
      img = image
      image.src = config.imageSrc
      image.alt = config.alt
      image.style.opacity = '0'
      // A missing PNG must not show the broken-image glyph or stall the
      // card; the timer completes regardless.
      image.addEventListener('error', () => {
        image.style.visibility = 'hidden'
      })
      root.appendChild(image)
      if (fog) {
        fogLayer = createFog(fog.downscale)
        if (fogLayer) root.appendChild(fogLayer.canvas)
      }
      rafId = requestAnimationFrame(frame)
    } else if (action === 'skip') {
      // Cut to black: the image goes at once, the backdrop tweens out
      // fast, the audio tails slightly longer than the visual.
      audio.stopOneShot(config.skipAudioFadeMs)
      if (img) img.remove()
      img = null
    }
  }

  const listen = () => {
    if (listening) return
    listening = true
    root.addEventListener('click', onGesture)
    document.addEventListener('keydown', onGesture)
  }

  const start = () => {
    listen()
    onGesture()
  }

  return { root, listen, start, done }
}

// The colophon: holds its hint until the first gesture starts it.
export function showSplash({
  audio,
  config,
}: CardOptions<SplashConfig>): Promise<void> {
  if (skipTitles()) return Promise.resolve()
  const card = mountCard({ audio, config })
  const hint = document.createElement('span')
  hint.className = 'bv-splash-hint'
  hint.textContent = config.hint
  card.root.appendChild(hint)
  // The first gesture is the start; the hint goes with it.
  const removeHint = () => {
    hint.remove()
    card.root.removeEventListener('click', removeHint)
    document.removeEventListener('keydown', removeHint)
  }
  card.root.addEventListener('click', removeHint)
  document.addEventListener('keydown', removeHint)
  card.listen()
  return card.done
}
