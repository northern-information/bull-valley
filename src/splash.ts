// The Northern Information colophon splash, ported from revery-prairie.
// A black threshold before the intro dialog: pre-gesture it holds a hint
// ("Click to Play" — the gesture also satisfies autoplay policy),
// then the colophon fades in/holds/fades out on a triangle wave over a
// backdrop that stays opaque black the whole time, so nothing beneath
// ever bleeds through. Only after the logo resolves (or a second gesture
// skips) does the backdrop itself tween out and reveal the intro. The
// machine below is pure (no DOM, no Three) so the timings and latches are
// unit-testable; showSplash() is the DOM glue.

import type { BvAudio, OneShotEnvelope } from './audio.ts'

export const SPLASH_STATES = {
  PRE_GESTURE: 'PRE_GESTURE',
  RUNNING: 'RUNNING',
  FADING_OUT: 'FADING_OUT',
  DONE: 'DONE',
} as const

export type SplashState = (typeof SPLASH_STATES)[keyof typeof SPLASH_STATES]

// What gesture() tells the caller to do.
export type SplashAction = 'start' | 'skip' | null

// The timings the machine reads. The logo envelope is the audio envelope.
export interface SplashTiming extends OneShotEnvelope {
  skipFadeMs: number
  revealFadeMs: number
}

// CONFIG.splash: the timings plus what showSplash() mounts and plays.
export interface SplashConfig extends SplashTiming {
  skipAudioFadeMs: number
  imageSrc: string
  audioSrc: string
  hint: string
}

// One tick() of the machine. The latches are present only on the tick
// that fires them.
export interface SplashFrame {
  imgAlpha: number
  rootAlpha: number
  fadeOutStart?: true
  complete?: true
}

export interface SplashMachine {
  readonly state: SplashState
  gesture(): SplashAction
  tick(): SplashFrame
}

export interface SplashMachineOptions {
  now: () => number
  cfg: SplashTiming
}

export interface ShowSplashOptions {
  audio: BvAudio
  config: SplashConfig
}

// Triangle wave: 0→1 over fadeInMs, hold at 1, 1→0 over fadeOutMs.
export function splashAlpha(elapsed: number, cfg: OneShotEnvelope): number {
  if (elapsed <= 0) return 0
  if (elapsed < cfg.fadeInMs) return elapsed / cfg.fadeInMs
  const holdEnd = cfg.fadeInMs + cfg.holdMs
  if (elapsed < holdEnd) return 1
  const total = holdEnd + cfg.fadeOutMs
  if (elapsed < total) return 1 - (elapsed - holdEnd) / cfg.fadeOutMs
  return 0
}

// Pure splash state machine with an injected clock. gesture() reports what
// the caller should do ('start' | 'skip' | null); tick() reports the logo
// and backdrop alphas plus fire-once fadeOutStart/complete latches. The
// backdrop holds at 1 through the whole logo envelope and only tweens out
// in FADING_OUT — entered naturally (revealFadeMs) or by skip (skipFadeMs).
export function createSplashMachine({
  now,
  cfg,
}: SplashMachineOptions): SplashMachine {
  let state: SplashState = SPLASH_STATES.PRE_GESTURE
  // Each is set before the state that reads it is entered.
  let startT = 0
  let fadeStartT = 0
  let fadeMs = 0
  let firedFadeOutStart = false
  let firedComplete = false

  const fadeOutStartMs = cfg.fadeInMs + cfg.holdMs
  const totalMs = fadeOutStartMs + cfg.fadeOutMs

  return {
    get state() {
      return state
    },
    gesture() {
      if (state === SPLASH_STATES.PRE_GESTURE) {
        state = SPLASH_STATES.RUNNING
        startT = now()
        return 'start'
      }
      if (state === SPLASH_STATES.RUNNING) {
        state = SPLASH_STATES.FADING_OUT
        fadeStartT = now()
        fadeMs = cfg.skipFadeMs
        // Skipping is the fade-out; the natural crossing must not re-fire.
        firedFadeOutStart = true
        return 'skip'
      }
      return null
    },
    tick() {
      if (state === SPLASH_STATES.PRE_GESTURE)
        return { imgAlpha: 0, rootAlpha: 1 }
      if (state === SPLASH_STATES.DONE) return { imgAlpha: 0, rootAlpha: 0 }
      if (state === SPLASH_STATES.RUNNING) {
        const elapsed = now() - startT
        const result: SplashFrame = {
          imgAlpha: splashAlpha(elapsed, cfg),
          rootAlpha: 1,
        }
        if (elapsed >= fadeOutStartMs && !firedFadeOutStart) {
          firedFadeOutStart = true
          result.fadeOutStart = true
        }
        if (elapsed >= totalMs) {
          state = SPLASH_STATES.FADING_OUT
          fadeStartT = now()
          fadeMs = cfg.revealFadeMs
          result.imgAlpha = 0
        }
        return result
      }
      const elapsed = now() - fadeStartT
      const result: SplashFrame = {
        imgAlpha: 0,
        rootAlpha: Math.max(0, 1 - elapsed / fadeMs),
      }
      if (elapsed >= fadeMs && !firedComplete) {
        state = SPLASH_STATES.DONE
        firedComplete = true
        result.complete = true
      }
      return result
    },
  }
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
        audio.playOneShot(config.audioSrc, {
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
