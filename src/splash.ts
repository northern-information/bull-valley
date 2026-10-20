// The title card, ported from revery-prairie: the Northern Information
// colophon, a black card whose image fades in/holds/fades out on a
// triangle wave, with its cue under the same envelope, over a backdrop
// that stays opaque black the whole time, so nothing beneath ever bleeds
// through. Only after the image resolves (or a gesture skips) does the
// backdrop itself tween out and reveal the main menu (mainmenu.ts), which
// carries the Bull Valley Shadow Wars logo. The colophon holds a hint first
// ("Click to Die" — the gesture also satisfies autoplay policy). The
// timings and latches live in the pure machine, splashmachine.ts; this file
// is the DOM glue.

import { CONFIG } from './config.ts'
import { copy } from './copy.ts'
import { createSplashMachine } from './splashmachine.ts'
import type { BvAudio } from './audio.ts'
import type { SplashTiming } from './splashmachine.ts'

// A card's timings.
interface CardTiming extends SplashTiming {
  skipAudioFadeMs: number
}

// A card's timings plus the image it mounts and the cue it plays.
interface CardConfig extends CardTiming {
  imageSrc: string
  alt: string
  audioSrc: string
}

// A card that waits for a gesture behind a hint.
interface SplashConfig extends CardConfig {
  hint: string
}

// A card of one line of text, in silence.
interface EpigraphConfig extends CardTiming {
  text: string
}

// The Northern Information colophon and the game's own logo (the main
// menu's): CONFIG's timings and files, with their words from COPY.toml. The words stay out of
// config.ts so the pure modules that read CONFIG never load the copy book.
export const COLOPHON: SplashConfig = {
  ...CONFIG.splash,
  alt: copy('titles.colophon_alt'),
  hint: copy('titles.colophon_hint'),
}

// The line between the colophon and the main menu.
export const EPIGRAPH: EpigraphConfig = {
  ...CONFIG.epigraph,
  text: copy('titles.epigraph'),
}

// The main menu's logo: no cue of its own, only its image and its fade.
export type LogoConfig = Pick<
  CardConfig,
  'alt' | 'imageSrc' | 'fadeInMs' | 'skipAudioFadeMs'
>

export const LOGO: LogoConfig = {
  ...CONFIG.logo,
  alt: copy('titles.logo_alt'),
}

interface CardOptions {
  audio: BvAudio
  config: CardTiming
  // What the card shows, built on its first gesture, and the cue it plays.
  face: () => HTMLElement
  cue?: string
  // The card's backdrop has begun to lift (skipped, or not): whatever it
  // uncovers goes up beneath it now, so it shows through the fade rather
  // than after it.
  onLift?: (skipped: boolean) => void
}

// A mounted card. A card mounted early sits black and deaf beneath the
// cards above it. listen() arms its click and keys: the first gesture
// starts it, the next skips. start() arms it and starts it at once. done
// resolves once the card has removed itself.
interface Card {
  root: HTMLDivElement
  listen(): void
  start(): void
  // Takes the card down at once, unseen.
  remove(): void
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
function mountCard({ audio, config, face, cue, onLift }: CardOptions): Card {
  const machine = createSplashMachine({
    now: () => performance.now(),
    cfg: config,
  })

  const root = document.createElement('div')
  root.className = 'bv-splash'
  root.style.opacity = '1'
  document.body.appendChild(root)

  let rafId: number | null = null
  let shown: HTMLElement | null = null
  let listening = false
  let lifted = false
  let skipped = false
  let resolveDone = () => {}
  const done = new Promise<void>((resolve) => {
    resolveDone = resolve
  })

  const cleanup = () => {
    if (rafId !== null) cancelAnimationFrame(rafId)
    document.removeEventListener('keydown', onGesture)
    root.remove()
    resolveDone()
  }

  const frame = () => {
    const { imgAlpha, rootAlpha, complete } = machine.tick()
    if (rootAlpha < 1 && !lifted) {
      lifted = true
      onLift?.(skipped)
    }
    root.style.opacity = String(rootAlpha)
    if (shown) shown.style.opacity = String(imgAlpha)
    if (complete) {
      cleanup()
      return
    }
    rafId = requestAnimationFrame(frame)
  }

  const onGesture = () => {
    const action = machine.gesture()
    if (action === 'start') {
      // The colophon's gesture creates the AudioContext; a later card's
      // cue reuses it.
      audio.initContext()
      if (cue) {
        // One cue plays at a time, and a tail still sounding would swallow
        // this one; clear it first.
        audio.stopOneShot(config.skipAudioFadeMs)
        // Not awaited: the cue catches its own failures.
        void audio.playOneShot(cue, {
          fadeInMs: config.fadeInMs,
          holdMs: config.holdMs,
          fadeOutMs: config.fadeOutMs,
        })
      }
      shown = face()
      shown.style.opacity = '0'
      root.appendChild(shown)
      rafId = requestAnimationFrame(frame)
    } else if (action === 'skip') {
      // Cut to black: the image goes at once, the backdrop tweens out
      // fast, the audio tails slightly longer than the visual.
      skipped = true
      if (cue) audio.stopOneShot(config.skipAudioFadeMs)
      shown?.remove()
      shown = null
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

  return { root, listen, start, remove: cleanup, done }
}

// The colophon's image: a missing PNG must not show the broken-image
// glyph or stall the card; the timer completes regardless.
function imageFace(config: CardConfig): () => HTMLElement {
  return () => {
    const image = document.createElement('img')
    image.src = config.imageSrc
    image.alt = config.alt
    image.addEventListener('error', () => {
      image.style.visibility = 'hidden'
    })
    return image
  }
}

// The epigraph's line.
function textFace(config: EpigraphConfig): () => HTMLElement {
  return () => {
    const line = document.createElement('p')
    line.className = 'bv-splash-epigraph'
    line.textContent = config.text
    return line
  }
}

interface SplashOptions {
  audio: BvAudio
  config: SplashConfig
  epigraph: EpigraphConfig
  // The last card has begun to lift: the menu goes up beneath it.
  onLift?: () => void
}

// The colophon, then the epigraph. The colophon holds its hint until the
// first gesture starts it; the epigraph waits black beneath it and starts
// as it goes. Skipping the colophon skips the epigraph too.
export async function showSplash({
  audio,
  config,
  epigraph,
  onLift,
}: SplashOptions): Promise<void> {
  if (skipTitles()) return
  let skipped = false
  // Mounted first, so the colophon stacks over it.
  const after = mountCard({
    audio,
    config: epigraph,
    face: textFace(epigraph),
    onLift: () => onLift?.(),
  })
  const card = mountCard({
    audio,
    config,
    face: imageFace(config),
    cue: config.audioSrc,
    // Its black and grain are the epigraph's, so the colophon lifts over
    // it unseen; skipped, it lifts straight onto the menu.
    onLift: (wasSkipped) => {
      if (!wasSkipped) return
      skipped = true
      after.remove()
      onLift?.()
    },
  })
  const hint = document.createElement('span')
  hint.className = 'bv-splash-hint'
  hint.textContent = config.hint
  card.root.appendChild(hint)
  // While it waits for a click the card glows the free-pointer edge.
  card.root.classList.add('bv-splash--waiting')
  // The first gesture is the start; the hint and the edge go with it.
  const removeHint = () => {
    hint.remove()
    card.root.classList.remove('bv-splash--waiting')
    card.root.removeEventListener('click', removeHint)
    document.removeEventListener('keydown', removeHint)
  }
  card.root.addEventListener('click', removeHint)
  document.addEventListener('keydown', removeHint)
  card.listen()
  await card.done
  if (skipped) return
  after.start()
  await after.done
}
