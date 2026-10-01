// Pure state machine for the Northern Information colophon splash: no DOM,
// no Three, an injected clock. splash.ts is the DOM glue that drives it;
// tests/unit/splashmachine.test.ts runs it in Node.

import type { OneShotEnvelope } from './audio.ts'

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
