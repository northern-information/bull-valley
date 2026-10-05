// The account step between the logo and the character select: a black
// overlay that either signs you in or has you choose a username. Mounted at
// boot like the select (black and inert until run), above it in DOM order,
// so it covers the select until it resolves.
//
// Two faces. Sign In lists the server's providers; each is a full-page
// round trip that lands back here with ?auth= (account.ts authReturnOf).
// Choose Your Username takes the handle, checks it as you type, and, for a
// raider who has just arrived (a pending signup), asks for the two gates
// first: 13 or older, and the terms. The account is created only once both
// are checked. The rules and the routes are account.ts's and auth.ts's.

import {
  isValidUsername,
  PROVIDER_COLORS,
  PROVIDER_LABELS,
  signInUrl,
  USERNAME_MAX,
} from './account.ts'
import {
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
  // overlay. `error` is a failed round trip to show on the sign-in face.
  run(me: MeResponse | null, error: string | null): Promise<string>
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
    </div>
    <form class="bv-account-ui" data-face="username" hidden novalidate>
      <h2>${copy('username.title')}</h2>
      <p class="bv-account-lede" data-bv="account-lede"></p>
      <label class="bv-field">
        <span>${copy('username.field')}</span>
        <input type="text" data-bv="account-username" maxlength="${USERNAME_MAX}" autocomplete="off" autocapitalize="off" spellcheck="false" enterkeyhint="go" aria-describedby="bv-account-status">
      </label>
      <p class="bv-account-status" id="bv-account-status" aria-live="polite">${RULES}</p>
      <div class="bv-account-gates" hidden>
        <label class="bv-gate"><input type="checkbox" data-bv="account-age"> ${copy('username.age_gate')}</label>
        <label class="bv-gate"><input type="checkbox" data-bv="account-terms"> ${copy('username.terms_gate')} <a href="/terms.html" target="_blank" rel="noopener" data-bv="account-terms-link">${copy('username.terms_link')}</a></label>
      </div>
      <p class="bv-account-error" role="alert" hidden></p>
      <div class="bv-select-actions">
        <button type="button" class="bv-btn" data-bv="account-cancel">${copy('username.cancel')}</button>
        <button type="submit" class="bv-btn bv-btn--primary" data-bv="account-confirm" disabled>${copy('username.confirm')}</button>
      </div>
      <p class="bv-select-hint">${copy('username.hint')}</p>
    </form>
    <div class="bv-terms" role="dialog" aria-modal="true" aria-label="${copy('username.terms_link')}" hidden>
      <iframe title="${copy('username.terms_link')}" data-bv="account-terms-frame"></iframe>
      <button type="button" class="bv-btn" data-bv="account-terms-close">${copy('username.terms_close')}</button>
    </div>`
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
  const gates = find<HTMLDivElement>('.bv-account-gates')
  const age = find<HTMLInputElement>('[data-bv="account-age"]')
  const terms = find<HTMLInputElement>('[data-bv="account-terms"]')
  const termsLink = find<HTMLAnchorElement>('[data-bv="account-terms-link"]')
  const usernameError = find<HTMLParagraphElement>(
    '[data-face="username"] .bv-account-error'
  )
  const cancelBtn = find<HTMLButtonElement>('[data-bv="account-cancel"]')
  const confirmBtn = find<HTMLButtonElement>('[data-bv="account-confirm"]')
  const termsPanel = find<HTMLDivElement>('.bv-terms')
  const termsFrame = find<HTMLIFrameElement>('[data-bv="account-terms-frame"]')
  const termsClose = find<HTMLButtonElement>('[data-bv="account-terms-close"]')

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

  function run(me: MeResponse | null, error: string | null): Promise<string> {
    return new Promise<string>((resolve) => {
      // Whether the gates still stand between this raider and an account.
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
        (!pending || (age.checked && terms.checked))

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
              if (!answer) {
                say(copy('auth.unreachable'), 'bad')
                return
              }
              if (answer.reason === 'limited') {
                say(copy('username.limited'), 'bad')
                return
              }
              available = answer.available
              say(
                copy(
                  answer.available ? 'username.available' : 'username.taken'
                ),
                answer.available ? 'ok' : 'bad'
              )
              refresh()
            })
          }, CHECK_DELAY_MS)
        }
        refresh()
      }

      const showUsername = () => {
        signInFace.hidden = true
        usernameFace.hidden = false
        gates.hidden = !pending
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

      const cancel = async () => {
        if (submitting) return
        submitting = true
        refresh()
        await signOut()
        submitting = false
        pending = false
        input.value = ''
        age.checked = false
        terms.checked = false
        await showSignIn(null)
      }

      const confirm = async () => {
        if (!ready()) return
        const username = handle()
        submitting = true
        usernameError.hidden = true
        refresh()
        if (pending) {
          const created = await confirmSignup()
          if (!created.ok && created.limited) {
            // Still pending: the raider waits it out here, gates checked.
            submitting = false
            showError(usernameError, created.error)
            refresh()
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
          gates.hidden = true
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

      const openTerms = (e: Event) => {
        e.preventDefault()
        termsFrame.src = '/terms.html'
        termsPanel.hidden = false
        termsClose.focus()
      }

      const closeTerms = () => {
        termsPanel.hidden = true
        termsLink.focus()
      }

      const onSubmit = (e: Event) => {
        e.preventDefault()
        void confirm()
      }

      const onKey = (e: KeyboardEvent) => {
        if (e.code !== 'Escape') return
        e.preventDefault()
        if (!termsPanel.hidden) closeTerms()
        else if (!usernameFace.hidden) void cancel()
      }

      const onCancel = () => void cancel()

      const cleanup = () => {
        if (checking !== null) clearTimeout(checking)
        input.removeEventListener('input', check)
        age.removeEventListener('change', refresh)
        terms.removeEventListener('change', refresh)
        termsLink.removeEventListener('click', openTerms)
        termsClose.removeEventListener('click', closeTerms)
        usernameFace.removeEventListener('submit', onSubmit)
        cancelBtn.removeEventListener('click', onCancel)
        document.removeEventListener('keydown', onKey)
      }

      input.addEventListener('input', check)
      age.addEventListener('change', refresh)
      terms.addEventListener('change', refresh)
      termsLink.addEventListener('click', openTerms)
      termsClose.addEventListener('click', closeTerms)
      usernameFace.addEventListener('submit', onSubmit)
      cancelBtn.addEventListener('click', onCancel)
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
