// The main menu, straight after the colophon: the Bull Valley Shadow Wars
// logo under its black fog (fog.ts), its cue playing once, and the options
// below it. Signed out, the one option is Create Account, which hands the
// raider to the account step (signin.ts) beneath it. Signed in: Die (on to
// the character select), Settings (the music and sound volumes, the
// account panel and Sign Out), and
// Quit, which closes the tab, or says to where the browser will not let a
// page close itself. Mounted at boot above the account step and the select,
// so hiding it uncovers them; it never removes itself until titles.ts is
// done with it.

import { copy } from './copy.ts'
import { createFog } from './fog.ts'
import { volumeSliders } from './settingsui.ts'
import type { BvAudio } from './audio.ts'
import type { FogLayer } from './fog.ts'
import type { SettingsStore } from './settingsui.ts'
import type { CardConfig } from './splash.ts'

export interface MainMenuOptions {
  audio: BvAudio
  // The logo's image, cue and timings (splash.ts LOGO).
  config: CardConfig
  // The fog's render downscale, the game's.
  downscale: number
  // The raider's settings, shared with the pause overlay.
  settings: SettingsStore
  // Account was pressed in Settings: the panel opens over the menu.
  onAccount: () => void
  // Sign Out was pressed in Settings.
  onSignOut: () => void
}

// What the raider chose to leave the menu by.
export type MenuChoice = 'create' | 'die'

export interface MainMenu {
  // Shows the menu with the options for a raider signed in or not, and
  // resolves with the one chosen, hiding the menu again.
  choose(signedIn: boolean): Promise<MenuChoice>
  // Takes the menu down for good.
  remove(): void
}

// How long Quit waits for the tab to close before saying it could not.
const QUIT_WAIT_MS = 250

// Mounts the menu as the last child of <body>, black and hidden until
// choose(). Mount it after the account step and before the colophon.
export function mountMainMenu({
  audio,
  config,
  downscale,
  settings,
  onAccount,
  onSignOut,
}: MainMenuOptions): MainMenu {
  const root = document.createElement('div')
  root.className = 'bv-menu'
  root.setAttribute('role', 'dialog')
  root.setAttribute('aria-modal', 'true')
  root.setAttribute('aria-label', config.alt)
  root.style.setProperty('--bv-menu-fade', `${config.fadeInMs}ms`)
  root.hidden = true
  root.innerHTML = `
    <img class="bv-menu-logo" alt="">
    <nav class="bv-menu-ui">
      <div class="bv-menu-options" data-face="out">
        <button type="button" class="bv-btn bv-btn--primary" data-bv="menu-create">${copy('menu.create_account')}</button>
      </div>
      <div class="bv-menu-options" data-face="in">
        <button type="button" class="bv-btn bv-btn--primary" data-bv="menu-die">${copy('menu.die')}</button>
        <button type="button" class="bv-btn" data-bv="menu-settings">${copy('menu.settings')}</button>
        <button type="button" class="bv-btn" data-bv="menu-quit">${copy('menu.quit')}</button>
      </div>
      <div class="bv-menu-options" data-face="settings">
        <h2>${copy('menu.settings')}</h2>
        <button type="button" class="bv-btn" data-bv="menu-account">${copy('menu.account')}</button>
        <button type="button" class="bv-btn" data-bv="menu-sign-out">${copy('menu.sign_out')}</button>
        <button type="button" class="bv-btn" data-bv="menu-back">${copy('menu.back')}</button>
      </div>
      <p class="bv-menu-quit" data-face="quit" role="status">${copy('menu.quit_blocked')}</p>
    </nav>`
  document.body.appendChild(root)

  const find = <T extends Element>(selector: string): T => {
    const found = root.querySelector<T>(selector)
    if (!found) throw new Error(`Missing ${selector}`)
    return found
  }
  const logo = find<HTMLImageElement>('.bv-menu-logo')
  const faces = Array.from(root.querySelectorAll<HTMLElement>('[data-face]'))
  const createBtn = find<HTMLButtonElement>('[data-bv="menu-create"]')
  const dieBtn = find<HTMLButtonElement>('[data-bv="menu-die"]')
  const settingsBtn = find<HTMLButtonElement>('[data-bv="menu-settings"]')
  const quitBtn = find<HTMLButtonElement>('[data-bv="menu-quit"]')
  const accountBtn = find<HTMLButtonElement>('[data-bv="menu-account"]')
  const signOutBtn = find<HTMLButtonElement>('[data-bv="menu-sign-out"]')
  const backBtn = find<HTMLButtonElement>('[data-bv="menu-back"]')
  find<HTMLElement>('[data-face="settings"] h2').after(
    ...volumeSliders(settings)
  )

  // A missing PNG must not show the broken-image glyph.
  logo.addEventListener('error', () => {
    logo.style.visibility = 'hidden'
  })
  logo.alt = config.alt
  logo.src = config.imageSrc

  let fog: FogLayer | null = null
  let shown = false

  type Face = 'out' | 'in' | 'settings' | 'quit'
  let face: Face = 'out'

  const show = (next: Face) => {
    face = next
    for (const el of faces) el.hidden = el.dataset.face !== next
    root
      .querySelector<HTMLButtonElement>(`[data-face="${next}"] button`)
      ?.focus()
  }

  // The first showing fades the logo and the options up out of the black
  // and plays the logo's cue once; later ones come back at once.
  const reveal = () => {
    root.hidden = false
    if (shown) return
    shown = true
    fog = createFog(downscale)
    if (fog) root.insertBefore(fog.canvas, root.querySelector('.bv-menu-ui'))
    // The colophon's cue may still be tailing, and one plays at a time.
    audio.stopOneShot(config.skipAudioFadeMs)
    void audio.playOneShot(config.audioSrc, {
      fadeInMs: config.fadeInMs,
      holdMs: config.holdMs,
      fadeOutMs: config.fadeOutMs,
    })
    // On the next frame, so the fade starts from the black.
    requestAnimationFrame(() => root.classList.add('bv-menu--up'))
  }

  // Up and down (or W and S) walk the options, the volume sliders among
  // them, which left and right move; Enter and Space press the one in
  // focus, as buttons do; Escape steps back out of Settings.
  const onKey = (e: KeyboardEvent) => {
    if (root.hidden) return
    if (e.code === 'Escape' && face === 'settings') {
      e.preventDefault()
      show('in')
      return
    }
    const dir =
      e.code === 'ArrowDown' || e.code === 'KeyS'
        ? 1
        : e.code === 'ArrowUp' || e.code === 'KeyW'
          ? -1
          : 0
    if (!dir) return
    e.preventDefault()
    const buttons = Array.from(
      root.querySelectorAll<HTMLElement>(
        `[data-face="${face}"] button, [data-face="${face}"] input`
      )
    )
    if (buttons.length === 0) return
    const at = buttons.indexOf(document.activeElement as HTMLElement)
    const next = at < 0 ? 0 : (at + dir + buttons.length) % buttons.length
    buttons[next].focus()
  }
  document.addEventListener('keydown', onKey)

  const quit = () => {
    window.close()
    // A tab the raider opened themselves will not close for a page; say so.
    setTimeout(() => {
      if (!window.closed) show('quit')
    }, QUIT_WAIT_MS)
  }

  settingsBtn.addEventListener('click', () => show('settings'))
  backBtn.addEventListener('click', () => show('in'))
  accountBtn.addEventListener('click', onAccount)
  signOutBtn.addEventListener('click', () => {
    signOutBtn.disabled = true
    onSignOut()
  })
  quitBtn.addEventListener('click', quit)

  function choose(signedIn: boolean): Promise<MenuChoice> {
    return new Promise<MenuChoice>((resolve) => {
      const leave = (choice: MenuChoice) => {
        createBtn.removeEventListener('click', onCreate)
        dieBtn.removeEventListener('click', onDie)
        root.hidden = true
        resolve(choice)
      }
      const onCreate = () => leave('create')
      const onDie = () => leave('die')
      createBtn.addEventListener('click', onCreate)
      dieBtn.addEventListener('click', onDie)
      reveal()
      show(signedIn ? 'in' : 'out')
    })
  }

  return {
    choose,
    remove() {
      document.removeEventListener('keydown', onKey)
      fog?.stop()
      audio.stopOneShot(config.skipAudioFadeMs)
      root.remove()
    },
  }
}
