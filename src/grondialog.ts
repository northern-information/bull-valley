// Talking to Gron (sharedworld.ts rule 9): a dialog over the valley that
// changes the name the valley knows you by. Your Name takes a new
// username, checked as you type with the same rules as the first one
// (account.ts) and saved with PUT /auth/username; the caller tells the
// valley. Your character is Moab Coldë's to change (moabdialog.ts,
// lookpanel.ts).

import { isValidUsername, USERNAME_MAX } from './account.ts'
import { availabilityOf, renameUsername, usernameAvailable } from './auth.ts'
import { copy } from './copy.ts'
import { finder, setStatus } from './dom.ts'
import { closesDialog } from './npcdialog.ts'

interface GronDialogOptions {
  username: string
  // The new username is saved; tell the valley.
  onRenamed: (username: string) => void
}

// What Gron says when you walk up; one at random.
const gronSays = () => [
  copy('gron.says_1'),
  copy('gron.says_2'),
  copy('gron.says_3'),
]

// How long typing pauses before the name is checked.
const CHECK_DELAY_MS = 300

// Mounts the dialog over everything and resolves once it is closed.
export function openGronDialog({
  username,
  onRenamed,
}: GronDialogOptions): Promise<void> {
  const root = document.createElement('div')
  root.className = 'bv-account bv-gron'
  root.setAttribute('role', 'dialog')
  root.setAttribute('aria-modal', 'true')
  root.setAttribute('aria-labelledby', 'bv-gron-title')
  root.innerHTML = `
    <div class="bv-account-ui bv-gron-ui">
      <h2 id="bv-gron-title">${copy('outfits.gron')}</h2>
      <p class="bv-account-lede bv-gron-says"></p>
      <form class="bv-gron-part" data-bv="gron-name" novalidate>
        <h3>${copy('gron.your_name')}</h3>
        <label class="bv-field">
          <span>${copy('username.field')}</span>
          <input type="text" data-bv="gron-username" maxlength="${USERNAME_MAX}" autocomplete="off" autocapitalize="off" spellcheck="false" enterkeyhint="done" aria-describedby="bv-gron-name-status">
        </label>
        <p class="bv-account-status" id="bv-gron-name-status" data-bv="gron-name-status" aria-live="polite">${copy('signin.rules')}</p>
        <button type="submit" class="bv-btn" data-bv="gron-rename" disabled>${copy('gron.change_name')}</button>
      </form>
      <button type="button" class="bv-btn" data-bv="gron-close">${copy('gron.close')}</button>
    </div>`
  document.body.appendChild(root)

  const find = finder(root)
  const says = find<HTMLParagraphElement>('.bv-gron-says')
  const nameForm = find<HTMLFormElement>('[data-bv="gron-name"]')
  const input = find<HTMLInputElement>('[data-bv="gron-username"]')
  const nameStatus = find<HTMLParagraphElement>('[data-bv="gron-name-status"]')
  const renameBtn = find<HTMLButtonElement>('[data-bv="gron-rename"]')
  const closeBtn = find<HTMLButtonElement>('[data-bv="gron-close"]')

  const lines = gronSays()
  says.textContent = lines[Math.floor(Math.random() * lines.length)]

  return new Promise<void>((resolve) => {
    // --- Your Name ---------------------------------------------------------

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
        setStatus(nameStatus, copy('gron.name_now'), null)
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
        setStatus(nameStatus, copy('gron.renamed', { name }), 'ok')
        onRenamed(name)
      } else if ('taken' in result) {
        available = false
        setStatus(nameStatus, copy('username.taken'), 'bad')
      } else {
        setStatus(nameStatus, result.error, 'bad')
      }
      refreshName()
    }

    // --- The dialog --------------------------------------------------------

    // The game listens on the document too, and pointer lock is off while
    // Gron talks, so its keys do nothing; E closes the dialog.
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
