// The Coach key's one showing: a new Coach account's key (account.ts
// COACH_KEY_LENGTH characters) laid out to copy, under a warning that it
// will never be shown again and that nothing gets the account back without
// it. Continue stays disabled until the raider says they saved it. The
// sign-in step (signin.ts, a new account) and the account panel
// (accountpanel.ts, a key linked to an account) show the same card, so
// both apps say it the same way.

import { PROVIDER_COLORS } from './account.ts'
import { copy } from './copy.ts'
import { finder, setStatus } from './dom.ts'

// Fills `host` with the card and resolves once Continue is pressed,
// emptying it again. Escape does nothing here: the caller ignores it while
// the card is up, since the key cannot be shown twice.
export function revealCoachKey(host: HTMLElement, key: string): Promise<void> {
  host.innerHTML = `
    <h2>${copy('coach.reveal_title')}</h2>
    <p class="bv-coach-once" role="alert">${copy('coach.reveal_once')}</p>
    <p class="bv-account-lede">${copy('coach.reveal_warn')}</p>
    <textarea class="bv-coach-key" data-bv="coach-key" readonly rows="5" spellcheck="false" autocomplete="off" aria-label="${copy('coach.key_field')}"></textarea>
    <button type="button" class="bv-btn" data-bv="coach-copy">${copy('coach.copy')}</button>
    <p class="bv-account-status" data-bv="coach-status" aria-live="polite">${copy('coach.reveal_save')}</p>
    <label class="bv-coach-saved">
      <input type="checkbox" data-bv="coach-saved">
      <span>${copy('coach.saved')}</span>
    </label>
    <button type="button" class="bv-btn bv-btn--primary" data-bv="coach-continue" disabled>${copy('coach.continue')}</button>`
  const find = finder(host)
  const field = find<HTMLTextAreaElement>('[data-bv="coach-key"]')
  const copyBtn = find<HTMLButtonElement>('[data-bv="coach-copy"]')
  const status = find<HTMLParagraphElement>('[data-bv="coach-status"]')
  const saved = find<HTMLInputElement>('[data-bv="coach-saved"]')
  const continueBtn = find<HTMLButtonElement>('[data-bv="coach-continue"]')
  field.value = key
  field.style.setProperty('--provider', PROVIDER_COLORS.coach)

  const selectAll = () => field.select()

  const onCopy = () => {
    selectAll()
    // No clipboard on an insecure page: the key is selected to copy by hand.
    void Promise.resolve()
      .then(() => navigator.clipboard.writeText(key))
      .then(() => setStatus(status, copy('coach.copied'), 'ok'))
      .catch(() => setStatus(status, copy('coach.copy_failed'), 'bad'))
  }

  const onSaved = () => {
    continueBtn.disabled = !saved.checked
  }

  field.addEventListener('focus', selectAll)
  copyBtn.addEventListener('click', onCopy)
  saved.addEventListener('change', onSaved)
  copyBtn.focus()

  return new Promise<void>((resolve) => {
    continueBtn.addEventListener('click', () => {
      if (!saved.checked) return
      field.removeEventListener('focus', selectAll)
      copyBtn.removeEventListener('click', onCopy)
      saved.removeEventListener('change', onSaved)
      field.value = ''
      host.replaceChildren()
      resolve()
    })
  })
}
