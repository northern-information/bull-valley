// The account step between the main menu and the character select: a black
// overlay that either signs you in or has you choose a username. Mounted at
// boot like the select (black and inert until run), above it in DOM order,
// so it covers the select until it resolves, and beneath the menu
// (mainmenu.ts), which Back on the sign-in face returns to.
//
// Two faces. Sign In lists the server's providers; each is a full-page
// round trip that lands back here with ?auth= (account.ts authReturnOf).
// Choose Your Username takes the handle, checks it as you type, and, for a
// raider who has just arrived (a pending signup), asks for the magic word:
// the game is private, and the server creates the account only for the
// right one. The rules and the routes are account.ts's and auth.ts's.

import {
  isValidUsername,
  PROVIDER_COLORS,
  PROVIDER_LABELS,
  signInUrl,
  USERNAME_MAX,
} from './account.ts'
import {
  availabilityOf,
  confirmSignup,
  fetchProviders,
  setUsername,
  signOut,
  usernameAvailable,
} from './auth.ts'
import { copy } from './copy.ts'
import type { MeResponse, Provider } from './account.ts'

export interface AccountStep {
  // Resolves with the username once the raider has one, removing the
  // overlay, or with null when Back on the sign-in face leaves for the
  // menu, the overlay kept for another run. `error` is a failed round trip
  // to show on the sign-in face.
  run(me: MeResponse | null, error: string | null): Promise<string | null>
  // Takes the overlay down unseen, for a raider already signed in.
  remove(): void
}

// How long typing pauses before the handle is checked.
const CHECK_DELAY_MS = 300

const RULES = copy('signin.rules')

// Mounts the overlay as the last child of <body>, black and inert until
// run(). Mount it after the select and before the title cards.
export function mountAccountStep(): AccountStep {
  const root = document.createElement('div')
  root.className = 'bv-account'
  root.setAttribute('role', 'dialog')
  root.setAttribute('aria-modal', 'true')
  root.setAttribute('aria-labelledby', 'bv-account-title')
  root.innerHTML = `
    <div class="bv-account-ui" data-face="sign-in" hidden>
      <h2 id="bv-account-title">${copy('signin.title')}</h2>
      <p class="bv-account-lede">${copy('signin.lede')}</p>
      <div class="bv-account-providers"></div>
      <p class="bv-account-error" role="alert" hidden></p>
      <button type="button" class="bv-btn" data-bv="account-back">${copy('menu.back')}</button>
    </div>
    <form class="bv-account-ui" data-face="username" hidden novalidate>
      <h2>${copy('username.title')}</h2>
      <p class="bv-account-lede" data-bv="account-lede"></p>
      <label class="bv-field">
        <span>${copy('username.field')}</span>
        <input type="text" data-bv="account-username" maxlength="${USERNAME_MAX}" autocomplete="off" autocapitalize="off" spellcheck="false" enterkeyhint="go" aria-describedby="bv-account-status">
      </label>
      <p class="bv-account-status" id="bv-account-status" aria-live="polite">${RULES}</p>
      <label class="bv-field" data-bv="account-magic" hidden>
        <span>${copy('username.magic_word')}</span>
        <input type="text" data-bv="account-magic-word" autocomplete="off" autocapitalize="off" spellcheck="false" enterkeyhint="go">
      </label>
      <p class="bv-account-error" role="alert" hidden></p>
      <div class="bv-select-actions">
        <button type="button" class="bv-btn" data-bv="account-cancel">${copy('username.cancel')}</button>
        <button type="submit" class="bv-btn bv-btn--primary" data-bv="account-confirm" disabled>${copy('username.confirm')}</button>
      </div>
      <p class="bv-select-hint">${copy('username.hint')}</p>
    </form>`
  document.body.appendChild(root)

  const find = <T extends Element>(selector: string): T => {
    const found = root.querySelector<T>(selector)
    if (!found) throw new Error(`Missing ${selector}`)
    return found
  }
  const signInFace = find<HTMLDivElement>('[data-face="sign-in"]')
  const usernameFace = find<HTMLFormElement>('[data-face="username"]')
  const providerRow = find<HTMLDivElement>('.bv-account-providers')
  const signInError = find<HTMLParagraphElement>(
    '[data-face="sign-in"] .bv-account-error'
  )
  const lede = find<HTMLParagraphElement>('[data-bv="account-lede"]')
  const input = find<HTMLInputElement>('[data-bv="account-username"]')
  const status = find<HTMLParagraphElement>('.bv-account-status')
  const magic = find<HTMLLabelElement>('[data-bv="account-magic"]')
  const magicWord = find<HTMLInputElement>('[data-bv="account-magic-word"]')
  const usernameError = find<HTMLParagraphElement>(
    '[data-face="username"] .bv-account-error'
  )
  const cancelBtn = find<HTMLButtonElement>('[data-bv="account-cancel"]')
  const confirmBtn = find<HTMLButtonElement>('[data-bv="account-confirm"]')
  const backBtn = find<HTMLButtonElement>('[data-bv="account-back"]')

  const showError = (el: HTMLElement, message: string | null) => {
    el.textContent = message ?? ''
    el.hidden = !message
  }

  // The way back from a provider: this page, query and all.
  const here = () => window.location.pathname + window.location.search

  async function showSignIn(error: string | null): Promise<void> {
    usernameFace.hidden = true
    signInFace.hidden = false
    showError(signInError, error)
    const providers = await fetchProviders()
    providerRow.replaceChildren(...providers.map(providerButton))
    if (providers.length === 0) {
      showError(signInError, error ?? copy('signin.unavailable'))
    }
    providerRow.querySelector<HTMLButtonElement>('button')?.focus()
  }

  function providerButton(provider: Provider): HTMLButtonElement {
    const button = document.createElement('button')
    button.type = 'button'
    button.className = 'bv-btn bv-provider'
    button.dataset.provider = provider
    button.style.setProperty('--provider', PROVIDER_COLORS[provider])
    button.textContent = copy('signin.provider', {
      provider: PROVIDER_LABELS[provider],
    })
    button.addEventListener('click', () => {
      window.location.assign(signInUrl(provider, here()))
    })
    return button
  }

  function run(
    me: MeResponse | null,
    error: string | null
  ): Promise<string | null> {
    return new Promise<string | null>((resolve) => {
      // Whether the magic word still stands between this raider and an
      // account.
      let pending = me !== null && me.account === null && me.pending !== null
      let available: boolean | null = null
      let checking: ReturnType<typeof setTimeout> | null = null
      let asked = ''
      let submitting = false

      const handle = () => input.value.trim()

      const ready = () =>
        !submitting &&
        isValidUsername(handle()) &&
        available === true &&
        (!pending || magicWord.value.trim() !== '')

      const refresh = () => {
        confirmBtn.disabled = !ready()
        cancelBtn.disabled = submitting
      }

      const say = (text: string, tone: 'ok' | 'bad' | null = null) => {
        status.textContent = text
        if (tone) status.dataset.tone = tone
        else delete status.dataset.tone
      }

      const check = () => {
        const name = handle()
        available = null
        usernameError.hidden = true
        if (checking !== null) clearTimeout(checking)
        checking = null
        if (!name) {
          say(RULES)
        } else if (!isValidUsername(name)) {
          say(RULES, 'bad')
        } else {
          say(copy('username.checking'))
          checking = setTimeout(() => {
            checking = null
            asked = name
            void usernameAvailable(name).then((answer) => {
              // Typing moved on while the valley answered.
              if (asked !== handle()) return
              const said = availabilityOf(answer)
              available = said.available
              say(said.line, said.tone)
              refresh()
            })
          }, CHECK_DELAY_MS)
        }
        refresh()
      }

      const showUsername = () => {
        signInFace.hidden = true
        usernameFace.hidden = false
        magic.hidden = !pending
        const who = me?.account?.displayName ?? me?.pending?.displayName
        const via = me?.pending?.provider ?? me?.account?.providers[0]?.provider
        lede.textContent =
          who && via
            ? copy('username.lede_as', { who, provider: PROVIDER_LABELS[via] })
            : copy('username.lede')
        check()
        input.focus()
      }

      const finish = (username: string) => {
        cleanup()
        root.remove()
        resolve(username)
      }

      // Back to the menu, signed out; the overlay waits for the next run.
      const back = () => {
        if (submitting) return
        cleanup()
        signInFace.hidden = true
        resolve(null)
      }

      const cancel = async () => {
        if (submitting) return
        submitting = true
        refresh()
        await signOut()
        submitting = false
        pending = false
        input.value = ''
        magicWord.value = ''
        await showSignIn(null)
      }

      const confirm = async () => {
        if (!ready()) return
        const username = handle()
        submitting = true
        usernameError.hidden = true
        refresh()
        if (pending) {
          const created = await confirmSignup(magicWord.value)
          if (!created.ok && (created.limited || created.retry)) {
            // Still pending: the raider waits it out, or tries another word.
            submitting = false
            showError(usernameError, created.error)
            refresh()
            if (created.retry) magicWord.select()
            return
          }
          if (!created.ok) {
            submitting = false
            pending = false
            await showSignIn(created.error)
            return
          }
          // The account exists now; a failed username below keeps it.
          pending = false
          magic.hidden = true
        }
        const set = await setUsername(username)
        submitting = false
        if (set.ok) {
          finish(username)
          return
        }
        if ('taken' in set) {
          available = false
          say(copy('username.taken'), 'bad')
        } else {
          showError(usernameError, set.error)
        }
        refresh()
        input.focus()
      }

      const onSubmit = (e: Event) => {
        e.preventDefault()
        void confirm()
      }

      const onKey = (e: KeyboardEvent) => {
        if (e.code !== 'Escape') return
        e.preventDefault()
        if (!usernameFace.hidden) void cancel()
        else if (!signInFace.hidden) back()
      }

      const onCancel = () => void cancel()

      const onMagic = () => {
        usernameError.hidden = true
        refresh()
      }

      const cleanup = () => {
        if (checking !== null) clearTimeout(checking)
        input.removeEventListener('input', check)
        magicWord.removeEventListener('input', onMagic)
        usernameFace.removeEventListener('submit', onSubmit)
        cancelBtn.removeEventListener('click', onCancel)
        backBtn.removeEventListener('click', back)
        document.removeEventListener('keydown', onKey)
      }

      input.addEventListener('input', check)
      magicWord.addEventListener('input', onMagic)
      usernameFace.addEventListener('submit', onSubmit)
      cancelBtn.addEventListener('click', onCancel)
      backBtn.addEventListener('click', back)
      document.addEventListener('keydown', onKey)

      if (me?.account?.username) {
        finish(me.account.username)
      } else if (me?.account || pending) {
        showUsername()
      } else {
        void showSignIn(error ?? (me ? null : copy('signin.unreachable')))
      }
    })
  }

  return { run, remove: () => root.remove() }
}
