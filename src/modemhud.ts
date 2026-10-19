// The modem as seen and heard (modem.ts): a terminal, eggshell on black,
// under the game's logo in its black fog (fog.ts) and over the Northern
// Information colophon, all under the title cards' film grain, that
// says TAP TO DIAL, then types the handshake out line by line, playing
// each cue as it comes due (modemaudio.ts), until the line answers. The
// caller tells it how the line answered (connected, signedOut, noCarrier)
// and waits on `done`, which says whether a login is wanted.

import { CONFIG } from './config.ts'
import { copy } from './copy.ts'
import { el } from './dom.ts'
import { createFog } from './fog.ts'
import { connected, IDLE, noCarrier, signedOut, tap, view } from './modem.ts'
import { ModemAudio } from './modemaudio.ts'
import { COLOPHON, LOGO } from './splash.ts'
import type { Modem, ModemLine } from './modem.ts'

const LINES: Record<ModemLine, string> = {
  atz: copy('dialup.modem.atz'),
  ok: copy('dialup.modem.ok'),
  dial: copy('dialup.modem.dial'),
  ring: copy('dialup.modem.ring'),
  carrier: copy('dialup.modem.carrier'),
  protocol: copy('dialup.modem.protocol'),
  compression: copy('dialup.modem.compression'),
  connect: copy('dialup.modem.connect'),
  login: copy('dialup.modem.login'),
  no_carrier: copy('dialup.modem.no_carrier'),
  redial: copy('dialup.modem.redial'),
}

interface ModemOptions {
  // How loud, 0 to 1, or null for silence (e2e).
  volume: number | null
  // The first tap: begin connecting.
  onDial: () => void
}

export interface ModemScreen {
  connected(): void
  signedOut(): void
  noCarrier(): void
  // Resolves when the modem gives way: true when a login is wanted.
  done: Promise<boolean>
}

export function mountModem(
  parent: HTMLElement,
  { volume, onDial }: ModemOptions
): ModemScreen {
  const root = el('section', 'bv-modem')
  root.setAttribute('aria-live', 'polite')
  const logo = el('div', 'bv-modem-logo')
  logo.append(image('bv-modem-logo-img', LOGO.imageSrc, LOGO.alt))
  const fog = createFog(CONFIG.render.downscale)
  if (fog) logo.append(fog.canvas)
  const brand = el('h1', 'bv-modem-brand', copy('dialup.title'))
  const screen = el('pre', 'bv-modem-screen')
  const prompt = el('p', 'bv-modem-prompt', copy('dialup.tap'))
  const colophon = image('bv-modem-colophon', COLOPHON.imageSrc, COLOPHON.alt)
  root.append(logo, brand, screen, prompt, colophon)
  parent.append(root)

  let modem: Modem = IDLE
  let audio: ModemAudio | null = null
  let shown = ''
  // Cues played, each by its name and when it was due.
  const heard = new Set<string>()
  let resolve: (login: boolean) => void = () => {}
  const done = new Promise<boolean>((r) => {
    resolve = r
  })

  const onTap = () => {
    const first = modem.dialedAt === null
    modem = tap(modem, performance.now())
    if (first) {
      if (volume !== null) audio = new ModemAudio(volume)
      onDial()
    }
  }
  root.addEventListener('pointerdown', onTap)

  const frame = () => {
    const now = performance.now()
    const v = view(modem, now)
    prompt.textContent = v.waiting
      ? copy('dialup.tap')
      : v.lines.length > 0 && !v.done
        ? copy('dialup.skip')
        : ''
    const text = v.lines.map((line) => LINES[line]).join('\n')
    if (text !== shown) {
      shown = text
      screen.textContent = text
      root.dataset.lines = String(v.lines.length)
    }
    for (const { cue, at } of v.cues) {
      const key = `${cue}@${at}`
      if (heard.has(key)) continue
      heard.add(key)
      audio?.play(cue, (at - now) / 1000)
    }
    if (v.done) {
      audio?.close()
      fog?.stop()
      root.removeEventListener('pointerdown', onTap)
      root.remove()
      resolve(v.login)
      return
    }
    requestAnimationFrame(frame)
  }
  requestAnimationFrame(frame)

  return {
    connected: () => {
      modem = connected(modem, performance.now())
    },
    signedOut: () => {
      modem = signedOut(modem, performance.now())
    },
    noCarrier: () => {
      modem = noCarrier(modem, performance.now())
    },
    done,
  }
}

function image(className: string, src: string, alt: string): HTMLImageElement {
  const img = document.createElement('img')
  img.className = className
  img.src = src
  img.alt = alt
  return img
}
