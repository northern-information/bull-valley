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
// right one. Coach makes no round trip: its face takes a Coach key to sign
// in with, or makes a new one, shown once (coachkey.ts) before the raider
// goes on to Choose Your Username like any new raider. The rules and the
// routes are account.ts's and auth.ts's.

import {
  COACH_KEY_LENGTH,
  coachKeyOf,
  isValidUsername,
  PROVIDER_COLORS,
  PROVIDER_LABELS,
  signInUrl,
  USERNAME_MAX,
} from './account.ts'
import {
  availabilityOf,
  coachSignIn,
  confirmSignup,
  fetchMe,
  fetchProviders,
  newCoachKey,
  setUsername,
  signOut,
  usernameAvailable,
} from './auth.ts'
import { revealCoachKey } from './coachkey.ts'
import { copy } from './copy.ts'
import { finder, setStatus } from './dom.ts'
import type { MeResponse, Provider } from './account.ts'
import type { Tone } from './dom.ts'

interface AccountStep {
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
    </form>
    <form class="bv-account-ui" data-face="coach" hidden novalidate>
      <h2>${copy('coach.title')}</h2>
      <p class="bv-account-lede">${copy('coach.lede')}</p>
      <label class="bv-field">
        <span>${copy('coach.key_field')}</span>
        <textarea class="bv-coach-key" data-bv="coach-key-in" rows="5" maxlength="${COACH_KEY_LENGTH * 2}" autocomplete="off" autocapitalize="off" spellcheck="false"></textarea>
      </label>
      <p class="bv-account-error" role="alert" hidden></p>
      <div class="bv-select-actions">
        <button type="button" class="bv-btn" data-bv="coach-back">${copy('menu.back')}</button>
        <button type="submit" class="bv-btn bv-btn--primary" data-bv="coach-sign-in" disabled>${copy('coach.sign_in')}</button>
      </div>
      <button type="button" class="bv-btn bv-provider" data-bv="coach-create">${copy('coach.create')}</button>
      <p class="bv-select-hint">${copy('coach.hint')}</p>
    </form>
    <div class="bv-account-ui" data-face="coach-key" hidden></div>`
  document.body.appendChild(root)

  const find = finder(root)
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
  const coachFace = find<HTMLFormElement>('[data-face="coach"]')
  const coachKeyFace = find<HTMLDivElement>('[data-face="coach-key"]')
  const coachInput = find<HTMLTextAreaElement>('[data-bv="coach-key-in"]')
  const coachError = find<HTMLParagraphElement>(
    '[data-face="coach"] .bv-account-error'
  )
  const coachBack = find<HTMLButtonElement>('[data-bv="coach-back"]')
  const coachSignInBtn = find<HTMLButtonElement>('[data-bv="coach-sign-in"]')
  const coachCreate = find<HTMLButtonElement>('[data-bv="coach-create"]')
  coachFace.style.setProperty('--provider', PROVIDER_COLORS.coach)

  // What the Coach button does: set by run(), which owns the faces.
  let openCoach = () => {}

  const showError = (el: HTMLElement, message: string | null) => {
    el.textContent = message ?? ''
    el.hidden = !message
  }

  // The way back from a provider: this page, query and all.
  const here = () => window.location.pathname + window.location.search

  async function showSignIn(error: string | null): Promise<void> {
    usernameFace.hidden = true
    coachFace.hidden = true
    coachKeyFace.hidden = true
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
      if (provider === 'coach') openCoach()
      else window.location.assign(signInUrl(provider, here()))
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

      const say = (text: string, tone: Tone = null) =>
        setStatus(status, text, tone)

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
        coachFace.hidden = true
        coachKeyFace.hidden = true
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

      // --- Coach ---------------------------------------------------------

      const coachReady = () => !submitting && coachKeyOf(coachInput.value)

      const coachRefresh = () => {
        coachSignInBtn.disabled = !coachReady()
        coachCreate.disabled = submitting
        coachBack.disabled = submitting
      }

      const showCoach = () => {
        signInFace.hidden = true
        coachFace.hidden = false
        showError(coachError, null)
        coachInput.value = ''
        coachRefresh()
        coachInput.focus()
      }
      openCoach = showCoach

      const onCoachInput = () => {
        showError(coachError, null)
        coachRefresh()
      }

      // Enter signs in, as in a one-line field; a pasted key's own line
      // breaks are forgiven (coachKeyOf).
      const onCoachEnter = (e: KeyboardEvent) => {
        if (e.key !== 'Enter' || e.shiftKey) return
        e.preventDefault()
        coachFace.requestSubmit()
      }

      // Signed in by the key: straight through with a username, or on to
      // choose one for an account that has none yet.
      const coachSubmit = async (e: Event) => {
        e.preventDefault()
        const key = coachKeyOf(coachInput.value)
        if (!key || submitting) return
        submitting = true
        coachRefresh()
        const signed = await coachSignIn(key)
        const after = signed.ok ? await fetchMe() : null
        submitting = false
        coachRefresh()
        if (!signed.ok || !after?.account) {
          showError(
            coachError,
            signed.ok ? copy('auth.sign_in_failed') : signed.error
          )
          coachInput.select()
          return
        }
        coachInput.value = ''
        if (after.account.username) {
          finish(after.account.username)
          return
        }
        me = after
        pending = false
        showUsername()
      }

      // A new key, held as a pending signup: shown once, then the magic
      // word and a username like any new raider.
      const coachNew = async () => {
        if (submitting) return
        submitting = true
        coachRefresh()
        const made = await newCoachKey('create')
        submitting = false
        coachRefresh()
        if (!made.ok) {
          showError(coachError, made.error)
          return
        }
        coachInput.value = ''
        coachFace.hidden = true
        coachKeyFace.hidden = false
        await revealCoachKey(coachKeyFace, made.key)
        me = await fetchMe()
        pending = me !== null && me.account === null && me.pending !== null
        if (me?.account || pending) showUsername()
        else await showSignIn(copy('auth.expired'))
      }

      const onCoachBack = () => {
        if (submitting) return
        coachFace.hidden = true
        void showSignIn(null)
      }

      const onCoachCreate = () => void coachNew()
      const onCoachSubmit = (e: Event) => void coachSubmit(e)

      const onKey = (e: KeyboardEvent) => {
        if (e.code !== 'Escape') return
        e.preventDefault()
        if (!usernameFace.hidden) void cancel()
        else if (!coachFace.hidden) onCoachBack()
        // The key's one showing is never dismissed by a stray Escape.
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
        coachInput.removeEventListener('input', onCoachInput)
        coachInput.removeEventListener('keydown', onCoachEnter)
        coachFace.removeEventListener('submit', onCoachSubmit)
        coachBack.removeEventListener('click', onCoachBack)
        coachCreate.removeEventListener('click', onCoachCreate)
        openCoach = () => {}
      }

      input.addEventListener('input', check)
      magicWord.addEventListener('input', onMagic)
      usernameFace.addEventListener('submit', onSubmit)
      cancelBtn.addEventListener('click', onCancel)
      backBtn.addEventListener('click', back)
      document.addEventListener('keydown', onKey)
      coachInput.addEventListener('input', onCoachInput)
      coachInput.addEventListener('keydown', onCoachEnter)
      coachFace.addEventListener('submit', onCoachSubmit)
      coachBack.addEventListener('click', onCoachBack)
      coachCreate.addEventListener('click', onCoachCreate)

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
