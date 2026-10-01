// The Northern Information colophon splash, ported from revery-prairie.
// A black threshold before the intro dialog: pre-gesture it holds a hint
// ("Click to Play" — the gesture also satisfies autoplay policy),
// then the colophon fades in/holds/fades out on a triangle wave over a
// backdrop that stays opaque black the whole time, so nothing beneath
// ever bleeds through. Only after the logo resolves (or a second gesture
// skips) does the backdrop itself tween out and reveal the intro. The
// timings and latches live in the pure machine, splashmachine.ts; this file
// is the DOM glue.

import { createSplashMachine } from './splashmachine.ts'
import type { BvAudio } from './audio.ts'
import type { SplashTiming } from './splashmachine.ts'

// CONFIG.splash: the timings plus what showSplash() mounts and plays.
export interface SplashConfig extends SplashTiming {
  skipAudioFadeMs: number
  imageSrc: string
  audioSrc: string
  hint: string
}

export interface ShowSplashOptions {
  audio: BvAudio
  config: SplashConfig
}

// DOM glue. Mounts the overlay as the last child of <body> so DOM order
// stacks it above the shell, drives opacity from a RAF loop, and resolves
// once the splash removes itself. Audio failures never block the visual.
export function showSplash({
  audio,
  config,
}: ShowSplashOptions): Promise<void> {
  if (
    import.meta.env.DEV &&
    new URLSearchParams(window.location.search).has('skipSplash')
  ) {
    return Promise.resolve()
  }
  return new Promise<void>((resolve) => {
    const machine = createSplashMachine({
      now: () => performance.now(),
      cfg: config,
    })

    const root = document.createElement('div')
    root.className = 'bv-splash'
    root.style.opacity = '1'
    const hint = document.createElement('span')
    hint.className = 'bv-splash-hint'
    hint.textContent = config.hint
    root.appendChild(hint)
    document.body.appendChild(root)

    let rafId: number | null = null
    let img: HTMLImageElement | null = null

    const cleanup = () => {
      if (rafId !== null) cancelAnimationFrame(rafId)
      document.removeEventListener('keydown', onGesture)
      root.remove()
      resolve()
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
        // The gesture creates the AudioContext for the splash cue only.
        audio.initContext()
        // Not awaited: the cue catches its own failures.
        void audio.playOneShot(config.audioSrc, {
          fadeInMs: config.fadeInMs,
          holdMs: config.holdMs,
          fadeOutMs: config.fadeOutMs,
        })
        hint.remove()
        const image = document.createElement('img')
        img = image
        image.src = config.imageSrc
        image.alt = 'Northern Information'
        image.style.opacity = '0'
        // A missing PNG must not show the broken-image glyph or stall the
        // splash; the timer completes regardless.
        image.addEventListener('error', () => {
          image.style.visibility = 'hidden'
        })
        root.appendChild(image)
        rafId = requestAnimationFrame(frame)
      } else if (action === 'skip') {
        // Cut to black: the image goes at once, the backdrop tweens out
        // fast, the audio tails slightly longer than the visual.
        audio.stopOneShot(config.skipAudioFadeMs)
        if (img) img.remove()
        img = null
      }
    }

    root.addEventListener('click', onGesture)
    document.addEventListener('keydown', onGesture)
  })
}
