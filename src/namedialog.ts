// Your Name, from Settings (the main menu's, the pause overlay's, and
// Dial-Up's lobby): a dialog that changes the name the valley knows you
// by. It takes a new username, checked as you type with the same rules as
// the first one (account.ts), and saves it with PUT /auth/username; the
// caller tells the valley (sharedworld.ts rule 9).

import { isValidUsername, USERNAME_MAX } from './account.ts'
import { availabilityOf, renameUsername, usernameAvailable } from './auth.ts'
import { copy } from './copy.ts'
import { finder, setStatus } from './dom.ts'
import { closesDialog } from './npcdialog.ts'

interface NameDialogOptions {
  username: string
  // The new username is saved; tell the valley.
  onRenamed: (username: string) => void
}

// How long typing pauses before the name is checked.
const CHECK_DELAY_MS = 300

// Mounts the dialog over everything and resolves once it is closed.
export function openNameDialog({
  username,
  onRenamed,
}: NameDialogOptions): Promise<void> {
  const root = document.createElement('div')
  root.className = 'bv-account bv-name'
  root.setAttribute('role', 'dialog')
  root.setAttribute('aria-modal', 'true')
  root.setAttribute('aria-labelledby', 'bv-name-title')
  root.innerHTML = `
    <div class="bv-account-ui bv-name-ui">
      <h2 id="bv-name-title">${copy('name.title')}</h2>
      <form class="bv-name-part" data-bv="name-form" novalidate>
        <label class="bv-field">
          <span>${copy('username.field')}</span>
          <input type="text" data-bv="name-username" maxlength="${USERNAME_MAX}" autocomplete="off" autocapitalize="off" spellcheck="false" enterkeyhint="done" aria-describedby="bv-name-status">
        </label>
        <p class="bv-account-status" id="bv-name-status" data-bv="name-status" aria-live="polite">${copy('signin.rules')}</p>
        <button type="submit" class="bv-btn" data-bv="name-rename" disabled>${copy('name.change_name')}</button>
      </form>
      <button type="button" class="bv-btn" data-bv="name-close">${copy('name.close')}</button>
    </div>`
  document.body.appendChild(root)

  const find = finder(root)
  const nameForm = find<HTMLFormElement>('[data-bv="name-form"]')
  const input = find<HTMLInputElement>('[data-bv="name-username"]')
  const nameStatus = find<HTMLParagraphElement>('[data-bv="name-status"]')
  const renameBtn = find<HTMLButtonElement>('[data-bv="name-rename"]')
  const closeBtn = find<HTMLButtonElement>('[data-bv="name-close"]')

  return new Promise<void>((resolve) => {
    let current = username
    let available: boolean | null = null
    let checking: ReturnType<typeof setTimeout> | null = null
    let renaming = false
    input.value = current

    const handle = () => input.value.trim()
    // Only the case of your own name changes: it is yours, so it is free.
    const isOwn = (name: string) => name.toLowerCase() === current.toLowerCase()

    const refreshName = () => {
      const name = handle()
      renameBtn.disabled =
        renaming || name === current || !isValidUsername(name) || !available
    }

    const check = () => {
      const name = handle()
      available = null
      if (checking !== null) clearTimeout(checking)
      checking = null
      if (name === current) {
        setStatus(nameStatus, copy('name.name_now'), null)
      } else if (!isValidUsername(name)) {
        setStatus(nameStatus, copy('signin.rules'), name ? 'bad' : null)
      } else if (isOwn(name)) {
        available = true
        setStatus(nameStatus, copy('username.available'), 'ok')
      } else {
        setStatus(nameStatus, copy('username.checking'), null)
        checking = setTimeout(() => {
          checking = null
          void usernameAvailable(name).then((answer) => {
            if (handle() !== name) return
            const said = availabilityOf(answer)
            available = said.available
            setStatus(nameStatus, said.line, said.tone)
            refreshName()
          })
        }, CHECK_DELAY_MS)
      }
      refreshName()
    }

    const rename = async (e: Event) => {
      e.preventDefault()
      const name = handle()
      if (renameBtn.disabled) return
      renaming = true
      refreshName()
      const result = await renameUsername(name)
      renaming = false
      if (result.ok) {
        current = name
        available = null
        setStatus(nameStatus, copy('name.renamed', { name }), 'ok')
        onRenamed(name)
      } else if ('taken' in result) {
        available = false
        setStatus(nameStatus, copy('username.taken'), 'bad')
      } else {
        setStatus(nameStatus, result.error, 'bad')
      }
      refreshName()
    }

    // The game listens on the document too, and pointer lock is off while
    // the dialog is open, so its keys do nothing; E closes it.
    const onKey = (e: KeyboardEvent) => {
      if (!closesDialog(e)) return
      e.preventDefault()
      close()
    }

    const onSubmit = (e: Event) => void rename(e)

    function close(): void {
      if (checking !== null) clearTimeout(checking)
      document.removeEventListener('keydown', onKey)
      root.remove()
      resolve()
    }

    input.addEventListener('input', check)
    nameForm.addEventListener('submit', onSubmit)
    closeBtn.addEventListener('click', close)
    document.addEventListener('keydown', onKey)

    check()
    closeBtn.focus({ preventScroll: true })
  })
}
