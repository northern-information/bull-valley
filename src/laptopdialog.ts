// The laptop in the Citgo bathroom as used (sharedworld.ts rule 31): E at
// the card table sits the raider down at it, the pointer free and the
// game's keys aside, and its screen fills the view. It opens as it stands
// when no one is at it, the text editor (white on dark blue) with the
// readme up; closing the editor (Esc) shows the desktop under it, the XP
// wallpaper with the readme, My Documents and Documents and Settings on
// it, a window to browse every raider's folder, and the taskbar. Anyone's
// file opens to read; their own open to write, and New Text Document
// makes another. E on the bare desktop, or Turn Off Computer, gets up and
// walks away, and the next one to sit down finds the editor and the readme
// again. The valley keeps the files: the dialog asks with `send` and hears
// the answers through the screen it hands back. Everything a raider wrote
// goes in as text, never as markup.

import { CONFIG } from './config.ts'
import { copy } from './copy.ts'
import { el, finder } from './dom.ts'
import {
  caretOf,
  foldersOf,
  isFileName,
  normalizeBody,
  README_ID,
} from './laptop.ts'
import { closesDialog } from './npcdialog.ts'
import type { LaptopFileInfo, LaptopFolder } from './laptop.ts'
import type { ClientMessage } from './protocol.ts'

// The frames the laptop sends.
type LaptopSend = Extract<
  ClientMessage,
  { type: 'laptop-list' | 'laptop-read' | 'laptop-save' | 'laptop-delete' }
>

interface LaptopOptions {
  // This raider's username: their folder's name.
  me: string
  readme: string
  readmeName: string
  // Whether there is a valley to keep the files; alone, only the readme.
  online: boolean
  send: (msg: LaptopSend) => void
}

// What the valley says, handed to the open screen.
export interface LaptopScreen {
  files(files: LaptopFileInfo[]): void
  file(id: string, body: string): void
  saved(id: string, name: string): void
  refused(reason: string): void
}

// The file open in the editor: the readme, someone's file, or a new one
// of this raider's (id null until it is first saved).
interface Open {
  id: string | null
  name: string
  owner: string
  mine: boolean
  // Waiting on its text from the valley.
  loading: boolean
  // The text as last saved or read, to tell an edit from none.
  kept: string
}

// Why the valley refused, in the status bar's words.
function refusalLine(reason: string): string {
  switch (reason) {
    case 'not-yours':
      return copy('laptop.refused.not_yours')
    case 'name-taken':
      return copy('laptop.refused.name_taken')
    case 'too-many':
      return copy('laptop.refused.too_many', {
        count: CONFIG.laptop.perAccount,
      })
    case 'gone':
      return copy('laptop.refused.gone')
    case 'too-fast':
      return copy('laptop.refused.too_fast')
    case 'no-laptop':
      return copy('laptop.refused.no_laptop')
    default:
      return copy('laptop.refused.other')
  }
}

// A size as the explorer lists it, in whole KB, never under one.
function kb(size: number): string {
  return copy('laptop.kb', { kb: Math.max(1, Math.ceil(size / 1024)) })
}

function when(ms: number): string {
  const d = new Date(ms)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getMonth() + 1}/${d.getDate()}/${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}

export function openLaptopDialog(options: LaptopOptions): {
  screen: LaptopScreen
  closed: Promise<void>
} {
  const root = document.createElement('div')
  root.className = 'bv-account bv-laptop'
  root.setAttribute('role', 'dialog')
  root.setAttribute('aria-modal', 'true')
  root.setAttribute('aria-label', copy('laptop.title'))
  root.innerHTML = `
    <div class="bv-laptop-bezel">
      <div class="bv-laptop-screen">
        <div class="bv-xp" data-bv="desktop">
          <div class="bv-xp-icons">
            <button type="button" class="bv-xp-icon" data-bv="icon-readme"><span class="bv-xp-glyph bv-xp-glyph--doc"></span><span data-bv="icon-readme-label"></span></button>
            <button type="button" class="bv-xp-icon" data-bv="icon-mine"><span class="bv-xp-glyph bv-xp-glyph--folder"></span><span>${copy('laptop.my_documents')}</span></button>
            <button type="button" class="bv-xp-icon" data-bv="icon-all"><span class="bv-xp-glyph bv-xp-glyph--folder"></span><span>${copy('laptop.documents')}</span></button>
          </div>
          <section class="bv-xp-window" data-bv="explorer" hidden>
            <header class="bv-xp-title"><span data-bv="explorer-title"></span><button type="button" class="bv-xp-close" data-bv="explorer-close" aria-label="${copy('laptop.close')}">×</button></header>
            <div class="bv-xp-toolbar">
              <button type="button" class="bv-xp-tool" data-bv="up">${copy('laptop.up')}</button>
              <button type="button" class="bv-xp-tool" data-bv="open">${copy('laptop.open')}</button>
              <button type="button" class="bv-xp-tool" data-bv="new">${copy('laptop.new_file')}</button>
              <button type="button" class="bv-xp-tool" data-bv="delete">${copy('laptop.delete')}</button>
            </div>
            <div class="bv-xp-address"><span>${copy('laptop.address')}</span><span data-bv="path"></span></div>
            <div class="bv-xp-list" data-bv="list" role="listbox"></div>
            <footer class="bv-xp-statusbar" data-bv="explorer-said"></footer>
          </section>
          <div class="bv-xp-start" data-bv="start-menu" hidden>
            <div class="bv-xp-start-user" data-bv="start-user"></div>
            <button type="button" class="bv-xp-start-item" data-bv="start-mine">${copy('laptop.my_documents')}</button>
            <button type="button" class="bv-xp-start-item" data-bv="start-new">${copy('laptop.new_file')}</button>
            <button type="button" class="bv-xp-start-item bv-xp-start-off" data-bv="start-off">${copy('laptop.turn_off')}</button>
          </div>
          <footer class="bv-xp-taskbar">
            <button type="button" class="bv-xp-startbtn" data-bv="start">${copy('laptop.start')}</button>
            <span class="bv-xp-task" data-bv="task" hidden></span>
            <span class="bv-xp-tray" data-bv="clock"></span>
          </footer>
        </div>
        <div class="bv-edit" data-bv="editor">
          <div class="bv-edit-menu">
            <button type="button" class="bv-edit-menuitem" data-bv="save">${copy('laptop.save')}</button>
            <button type="button" class="bv-edit-menuitem" data-bv="edit-close">${copy('laptop.close')}</button>
            <span class="bv-edit-hint">${copy('laptop.hint')}</span>
          </div>
          <div class="bv-edit-frame">
            <div class="bv-edit-title"><input class="bv-edit-name" data-bv="name" spellcheck="false" autocomplete="off" maxlength="${CONFIG.laptop.nameMax}" /></div>
            <textarea class="bv-edit-text" data-bv="text" spellcheck="false" autocomplete="off" wrap="off" maxlength="${CONFIG.laptop.bodyMax}"></textarea>
          </div>
          <div class="bv-edit-status"><span data-bv="edit-said"></span><span data-bv="caret"></span></div>
        </div>
      </div>
    </div>`
  document.body.appendChild(root)
  const find = finder(root)
  const desktop = find<HTMLDivElement>('[data-bv="desktop"]')
  const editor = find<HTMLDivElement>('[data-bv="editor"]')
  const explorer = find<HTMLElement>('[data-bv="explorer"]')
  const explorerTitle = find<HTMLSpanElement>('[data-bv="explorer-title"]')
  const path = find<HTMLSpanElement>('[data-bv="path"]')
  const list = find<HTMLDivElement>('[data-bv="list"]')
  const explorerSaid = find<HTMLElement>('[data-bv="explorer-said"]')
  const upBtn = find<HTMLButtonElement>('[data-bv="up"]')
  const openBtn = find<HTMLButtonElement>('[data-bv="open"]')
  const newBtn = find<HTMLButtonElement>('[data-bv="new"]')
  const deleteBtn = find<HTMLButtonElement>('[data-bv="delete"]')
  const startMenu = find<HTMLDivElement>('[data-bv="start-menu"]')
  const task = find<HTMLSpanElement>('[data-bv="task"]')
  const clock = find<HTMLSpanElement>('[data-bv="clock"]')
  const nameField = find<HTMLInputElement>('[data-bv="name"]')
  const textField = find<HTMLTextAreaElement>('[data-bv="text"]')
  const editSaid = find<HTMLSpanElement>('[data-bv="edit-said"]')
  const caret = find<HTMLSpanElement>('[data-bv="caret"]')
  find<HTMLSpanElement>('[data-bv="icon-readme-label"]').textContent =
    options.readmeName
  find<HTMLDivElement>('[data-bv="start-user"]').textContent = options.me

  let files: LaptopFileInfo[] | null = null
  // The folder the explorer shows (an owner), or null for all of them.
  let folder: string | null = null
  let picked: string | null = null
  let deleting: string | null = null
  let open: Open | null = null
  // Esc on an edit not saved warns once before it throws it away.
  let warned = false

  const ask = (msg: LaptopSend) => {
    if (options.online) options.send(msg)
  }

  // --- The editor ---------------------------------------------------------

  // A file not this raider's to write is locked rather than read-only: a
  // read-only text area takes no caret in Chromium, and the readme and
  // others' files must be walked with the keys like any other, wide art
  // and all. Every edit is refused instead (beforeinput, below).
  const locked = () => textField.getAttribute('aria-readonly') === 'true'
  const setLocked = (on: boolean) => {
    textField.setAttribute('aria-readonly', String(on))
  }

  const dirty = () =>
    open !== null && open.mine && textField.value !== open.kept

  const showCaret = () => {
    const { line, col } = caretOf(textField.value, textField.selectionStart)
    caret.textContent = copy('laptop.caret', { line, col })
  }

  const edit = (file: Open, text: string, said = '') => {
    open = file
    warned = false
    editor.hidden = false
    desktop.hidden = true
    nameField.value = file.name
    nameField.readOnly = !file.mine
    textField.value = text
    setLocked(!file.mine || file.loading)
    editor.dataset.mine = String(file.mine)
    editSaid.textContent =
      said ||
      (file.loading
        ? copy('laptop.loading')
        : file.mine
          ? ''
          : copy('laptop.read_only'))
    textField.setSelectionRange(0, 0)
    textField.scrollTop = 0
    textField.focus()
    showCaret()
  }

  const readme = () =>
    edit(
      {
        id: README_ID,
        name: options.readmeName,
        owner: '',
        mine: false,
        loading: false,
        kept: options.readme,
      },
      options.readme
    )

  const save = () => {
    if (!open?.mine) return
    const name = nameField.value.trim()
    if (!isFileName(name)) {
      editSaid.textContent = copy('laptop.bad_name')
      return
    }
    if (!options.online) {
      editSaid.textContent = copy('laptop.offline')
      return
    }
    const body = normalizeBody(textField.value)
    open.name = name
    editSaid.textContent = copy('laptop.saving')
    ask({ type: 'laptop-save', id: open.id, name, body })
    pendingSave = body
  }
  // The text a save sent, kept once the valley says it was.
  let pendingSave: string | null = null

  // Back to the desktop from the editor, warning once on an unsaved edit.
  const leaveEditor = () => {
    if (dirty() && !warned) {
      warned = true
      editSaid.textContent = copy('laptop.unsaved')
      return
    }
    open = null
    editor.hidden = true
    desktop.hidden = false
    drawExplorer()
  }

  // --- The desktop --------------------------------------------------------

  const folders = (): LaptopFolder[] => foldersOf(files ?? [], options.me)

  const row = (
    label: string,
    meta: [string, string],
    kind: 'folder' | 'doc',
    key: string,
    activate: () => void
  ) => {
    const item = el('button', 'bv-xp-row')
    item.type = 'button'
    item.setAttribute('role', 'option')
    item.dataset.key = key
    if (picked === key) item.classList.add('bv-xp-row--picked')
    const name = el('span', 'bv-xp-cell bv-xp-cell--name')
    name.append(
      el('span', `bv-xp-glyph bv-xp-glyph--${kind} bv-xp-glyph--small`)
    )
    name.append(el('span', '', label))
    item.append(
      name,
      el('span', 'bv-xp-cell', meta[0]),
      el('span', 'bv-xp-cell', meta[1])
    )
    item.addEventListener('click', () => {
      picked = key
      deleting = null
      drawExplorer()
    })
    item.addEventListener('dblclick', activate)
    return item
  }

  const openFile = (file: LaptopFileInfo) => {
    edit(
      {
        id: file.id,
        name: file.name,
        owner: file.owner,
        mine: file.mine,
        loading: true,
        kept: '',
      },
      ''
    )
    ask({ type: 'laptop-read', id: file.id })
  }

  const newFile = () => {
    if (!options.online) {
      showExplorer(options.me)
      explorerSaid.textContent = copy('laptop.offline')
      return
    }
    const mine = folders()[0].files
    let n = 1
    let name = copy('laptop.untitled')
    while (mine.some((f) => f.name.toLowerCase() === name.toLowerCase())) {
      n += 1
      name = copy('laptop.untitled_n', { n })
    }
    edit(
      {
        id: null,
        name,
        owner: options.me,
        mine: true,
        loading: false,
        kept: '',
      },
      ''
    )
    nameField.focus()
    nameField.select()
  }

  const drawExplorer = () => {
    if (explorer.hidden) return
    const all = folders()
    const here = folder === null ? null : all.find((f) => f.owner === folder)
    explorerTitle.textContent = folder ?? copy('laptop.documents')
    path.textContent =
      folder === null
        ? copy('laptop.root')
        : copy('laptop.folder_path', { owner: folder })
    task.hidden = false
    task.textContent = explorerTitle.textContent
    upBtn.disabled = folder === null
    const pickedFile = here?.files.find((f) => f.id === picked) ?? null
    openBtn.disabled = folder === null ? picked === null : !pickedFile
    newBtn.disabled = !here?.mine
    deleteBtn.disabled = !pickedFile?.mine
    deleteBtn.textContent =
      deleting && deleting === picked
        ? copy('laptop.delete_confirm')
        : copy('laptop.delete')
    const head = el('div', 'bv-xp-row bv-xp-row--head')
    head.append(
      el('span', 'bv-xp-cell bv-xp-cell--name', copy('laptop.col_name')),
      el(
        'span',
        'bv-xp-cell',
        folder === null ? copy('laptop.col_items') : copy('laptop.col_size')
      ),
      el('span', 'bv-xp-cell', copy('laptop.col_modified'))
    )
    const rows: HTMLElement[] = [head]
    if (!options.online) {
      explorerSaid.textContent = copy('laptop.offline')
    } else if (files === null) {
      explorerSaid.textContent = copy('laptop.loading')
    } else {
      explorerSaid.textContent = ''
    }
    if (folder === null) {
      for (const f of all) {
        const latest = Math.max(0, ...f.files.map((file) => file.updated))
        rows.push(
          row(
            f.owner,
            [
              f.files.length === 1
                ? copy('laptop.item')
                : copy('laptop.items', { count: f.files.length }),
              latest ? when(latest) : '',
            ],
            'folder',
            f.owner,
            () => showExplorer(f.owner)
          )
        )
      }
    } else if (here) {
      for (const file of here.files) {
        rows.push(
          row(
            file.name,
            [kb(file.size), when(file.updated)],
            'doc',
            file.id,
            () => openFile(file)
          )
        )
      }
      if (here.files.length === 0 && files !== null) {
        rows.push(el('p', 'bv-xp-empty', copy('laptop.empty')))
      }
    }
    list.replaceChildren(...rows)
  }

  const showExplorer = (owner: string | null) => {
    explorer.hidden = false
    startMenu.hidden = true
    folder = owner
    picked = null
    deleting = null
    ask({ type: 'laptop-list' })
    drawExplorer()
  }

  const closeExplorer = () => {
    explorer.hidden = true
    task.hidden = true
  }

  const openPicked = () => {
    if (folder === null) {
      if (picked !== null) showExplorer(picked)
      return
    }
    const file = files?.find((f) => f.id === picked)
    if (file) openFile(file)
  }

  const deletePicked = () => {
    const file = files?.find((f) => f.id === picked)
    if (!file?.mine) return
    if (deleting !== file.id) {
      deleting = file.id
      drawExplorer()
      return
    }
    deleting = null
    picked = null
    ask({ type: 'laptop-delete', id: file.id })
  }

  const tick = () => {
    const d = new Date()
    const h = d.getHours()
    const vars = {
      h: h % 12 === 0 ? 12 : h % 12,
      m: String(d.getMinutes()).padStart(2, '0'),
    }
    clock.textContent =
      h < 12 ? copy('laptop.clock_am', vars) : copy('laptop.clock_pm', vars)
  }
  tick()
  const timer = setInterval(tick, 1000)

  // One click opens an icon: a laptop's touchpad is no place for a
  // double-click.
  find<HTMLButtonElement>('[data-bv="icon-readme"]').addEventListener(
    'click',
    readme
  )
  find<HTMLButtonElement>('[data-bv="icon-mine"]').addEventListener(
    'click',
    () => showExplorer(options.me)
  )
  find<HTMLButtonElement>('[data-bv="icon-all"]').addEventListener(
    'click',
    () => showExplorer(null)
  )
  find<HTMLButtonElement>('[data-bv="explorer-close"]').addEventListener(
    'click',
    closeExplorer
  )
  upBtn.addEventListener('click', () => showExplorer(null))
  openBtn.addEventListener('click', openPicked)
  newBtn.addEventListener('click', newFile)
  deleteBtn.addEventListener('click', deletePicked)
  find<HTMLButtonElement>('[data-bv="start"]').addEventListener('click', () => {
    startMenu.hidden = !startMenu.hidden
  })
  find<HTMLButtonElement>('[data-bv="start-mine"]').addEventListener(
    'click',
    () => showExplorer(options.me)
  )
  find<HTMLButtonElement>('[data-bv="start-new"]').addEventListener(
    'click',
    () => {
      startMenu.hidden = true
      newFile()
    }
  )
  find<HTMLButtonElement>('[data-bv="save"]').addEventListener('click', save)
  find<HTMLButtonElement>('[data-bv="edit-close"]').addEventListener(
    'click',
    leaveEditor
  )
  textField.addEventListener('beforeinput', (e) => {
    if (locked()) e.preventDefault()
  })
  textField.addEventListener('keydown', (e) => {
    // A tab is part of the text.
    if (e.key === 'Tab' && !locked()) {
      e.preventDefault()
      textField.setRangeText(
        '\t',
        textField.selectionStart,
        textField.selectionEnd,
        'end'
      )
      showCaret()
    }
  })
  for (const event of ['input', 'click', 'keyup', 'select']) {
    textField.addEventListener(event, () => {
      if (event === 'input') warned = false
      showCaret()
    })
  }

  const screen: LaptopScreen = {
    files(next) {
      files = next
      if (
        picked !== null &&
        folder !== null &&
        !next.some((f) => f.id === picked)
      ) {
        picked = null
      }
      drawExplorer()
    },
    file(id, body) {
      if (!open || open.id !== id || !open.loading) return
      open.loading = false
      open.kept = body
      edit(open, body, open.mine ? '' : copy('laptop.read_only'))
    },
    saved(id, name) {
      if (!open?.mine || pendingSave === null) return
      open.id = id
      open.name = name
      open.kept = pendingSave
      pendingSave = null
      warned = false
      editSaid.textContent = copy('laptop.saved')
    },
    refused(reason) {
      pendingSave = null
      const line = refusalLine(reason)
      if (open) {
        if (open.loading) {
          open.loading = false
          setLocked(!open.mine)
        }
        editSaid.textContent = line
      } else {
        explorerSaid.textContent = line
      }
    },
  }

  const closed = new Promise<void>((resolve) => {
    // The game listens on the document too, and pointer lock is off while
    // the laptop is open, so its keys do nothing here.
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.code === 'KeyS') {
        e.preventDefault()
        save()
        return
      }
      // Esc is the computer's own key, a step back inside it (the
      // editor's status line names it); it never gets up from the table.
      // E does, from the bare desktop, as it closes every dialog.
      if (e.code === 'Escape') {
        e.preventDefault()
        if (!editor.hidden) leaveEditor()
        else if (!startMenu.hidden) startMenu.hidden = true
        else if (!explorer.hidden) closeExplorer()
        return
      }
      if (editor.hidden && startMenu.hidden && explorer.hidden) {
        if (closesDialog(e)) {
          e.preventDefault()
          close()
        }
      }
    }
    document.addEventListener('keydown', onKey)
    find<HTMLButtonElement>('[data-bv="start-off"]').addEventListener(
      'click',
      close
    )

    function close(): void {
      clearInterval(timer)
      document.removeEventListener('keydown', onKey)
      root.remove()
      resolve()
    }
  })

  // Sat down at, it stands as the last one left it: the editor and the
  // readme.
  readme()
  return { screen, closed }
}
