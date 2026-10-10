// The Book of Shadows as the raider reads it (book.ts): B opens it over the
// valley with the pointer free, as the pack is. Tabs for the chapters, each
// with how much of it is found; down the left the chapter's entries (a
// name once found, ??? until then); on the right the open page, the entry
// turning on a canvas (bookthumbs, through onPage), its name and its lore,
// or its dark shape and the line that says it is still out there. Hud
// builds it; actions.ts opens it and turns its pages.

import { BOOK as BOOK_KEYS } from './bindings.ts'
import { BOOK, CHAPTERS, entriesOf, tallyOf } from './book.ts'
import { copy } from './copy.ts'
import type { BookEntry, Chapter } from './book.ts'

// The portrait's CSS size; it is drawn at the screen's own density.
const PORTRAIT_PX = 220

// How long the toast holds when something new is written, in ms;
// styles.css's bv-book-toast animation runs the same length.
const TOAST_MS = 4000

// More new pages at once than this, and the toast counts them instead of
// naming them.
const TOAST_NAMES = 3

const CHAPTER_LABEL: Record<Chapter, string> = {
  places: copy('book.places'),
  shadows: copy('book.shadows'),
  folk: copy('book.folk'),
  items: copy('book.items'),
}

const UNKNOWN = copy('book.unknown')
const UNKNOWN_LORE = copy('book.unknown_lore')

function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className: string,
  content?: string
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag)
  node.className = className
  if (content !== undefined) node.textContent = content
  return node
}

export class BookHud {
  readonly root: HTMLElement
  readonly portrait: HTMLCanvasElement
  chapter: Chapter = CHAPTERS[0]
  // The open page: an entry of the shown chapter.
  selected: BookEntry = entriesOf(CHAPTERS[0])[0]
  // A tab clicked, or a row: actions.ts turns to it.
  onChapter?: (chapter: Chapter) => void
  onSelect?: (id: string) => void
  // The page turned (or what is found changed under it): draw its
  // portrait, dark while it is not found.
  onPage?: (entry: BookEntry, found: boolean) => void
  // The line that says something new was written, over the view.
  readonly toast: HTMLElement
  private readonly toastNews: HTMLElement
  private toastTimer: ReturnType<typeof setTimeout> | null = null
  private found: ReadonlySet<string> = new Set()
  private readonly total: HTMLElement
  private readonly tabs = new Map<Chapter, HTMLButtonElement>()
  private readonly list: HTMLOListElement
  private readonly name: HTMLElement
  private readonly lore: HTMLElement

  constructor(ui: HTMLElement) {
    this.root = el('section', 'bv-book')
    this.root.setAttribute('role', 'dialog')
    this.root.setAttribute('aria-label', copy('book.title'))
    this.root.hidden = true

    const head = el('header', 'bv-book-head')
    this.total = el('p', 'bv-book-total')
    this.total.dataset.bv = 'book-total'
    head.append(el('h2', 'bv-book-title', copy('book.title')), this.total)

    const tabs = el('div', 'bv-book-tabs')
    tabs.setAttribute('role', 'tablist')
    for (const chapter of CHAPTERS) {
      const button = el('button', 'bv-book-tab')
      button.type = 'button'
      button.id = `bv-book-tab-${chapter}`
      button.setAttribute('role', 'tab')
      button.setAttribute('aria-controls', 'bv-book-panel')
      button.addEventListener('click', () => this.onChapter?.(chapter))
      tabs.appendChild(button)
      this.tabs.set(chapter, button)
    }

    this.list = el('ol', 'bv-book-list')
    this.list.addEventListener('click', (e) => {
      const row =
        e.target instanceof Element
          ? e.target.closest<HTMLElement>('.bv-book-row')
          : null
      if (row?.dataset.entry) this.onSelect?.(row.dataset.entry)
    })

    const page = el('article', 'bv-book-page')
    this.portrait = el('canvas', 'bv-book-portrait')
    this.portrait.width = this.portrait.height = Math.round(
      PORTRAIT_PX * window.devicePixelRatio
    )
    this.portrait.setAttribute('aria-hidden', 'true')
    this.name = el('h3', 'bv-book-name')
    this.name.dataset.bv = 'book-name'
    this.lore = el('p', 'bv-book-lore')
    page.append(this.portrait, this.name, this.lore)

    const panel = el('div', 'bv-book-panel')
    panel.id = 'bv-book-panel'
    panel.setAttribute('role', 'tabpanel')
    panel.append(this.list, page)

    const keys = el('p', 'bv-book-keys')
    const key = (k: string) => el('kbd', '', k)
    keys.append(
      key(BOOK_KEYS.prevChapter.key),
      ' ',
      key(BOOK_KEYS.nextChapter.key),
      ` ${copy(BOOK_KEYS.nextChapter.labelKey)} `,
      key(BOOK_KEYS.prevEntry.key),
      ' ',
      key(BOOK_KEYS.nextEntry.key),
      ` ${copy(BOOK_KEYS.nextEntry.labelKey)} `,
      key(BOOK_KEYS.close.key),
      ` ${copy(BOOK_KEYS.close.labelKey)}`
    )

    this.root.append(head, tabs, panel, keys)
    ui.appendChild(this.root)

    this.toast = el('div', 'bv-book-toast')
    this.toast.setAttribute('role', 'status')
    this.toast.hidden = true
    this.toastNews = el('p', 'bv-book-toast-news')
    this.toastNews.dataset.bv = 'book-toast'
    this.toast.append(
      el('p', 'bv-book-toast-kicker', copy('book.toast')),
      this.toastNews,
      el('p', 'bv-book-toast-hint', copy('book.toast_hint'))
    )
    ui.appendChild(this.toast)
    this.render()
  }

  // Says what was just written: the names, or how many when there are
  // more. A newer one takes the place of one still showing.
  announce(names: readonly string[]): void {
    if (names.length === 0) return
    this.toastNews.textContent =
      names.length > TOAST_NAMES
        ? copy('book.toast_many', { count: names.length })
        : names.join(' · ')
    this.toast.hidden = false
    // Restart the fade from the top.
    this.toast.classList.remove('bv-book-toast--on')
    void this.toast.offsetWidth
    this.toast.classList.add('bv-book-toast--on')
    if (this.toastTimer !== null) clearTimeout(this.toastTimer)
    this.toastTimer = setTimeout(() => {
      this.toast.hidden = true
      this.toast.classList.remove('bv-book-toast--on')
      this.toastTimer = null
    }, TOAST_MS)
  }

  get open(): boolean {
    return !this.root.hidden
  }

  show(open: boolean): boolean {
    this.root.hidden = !open
    if (open) this.render()
    return open
  }

  // What the account has found; the shown book follows.
  setFound(found: ReadonlySet<string>): void {
    this.found = found
    if (this.open) this.render()
  }

  // Turns to `chapter`, on its first entry.
  showChapter(chapter: Chapter): void {
    this.chapter = chapter
    this.selected = entriesOf(chapter)[0]
    this.render()
  }

  // Turns to entry `id`, whatever chapter it is in.
  select(id: string): void {
    const entry = entriesOf(this.chapter).find((one) => one.id === id)
    if (!entry) return
    this.selected = entry
    this.render()
  }

  // The entry `step` rows from the open one, wrapping round the chapter.
  step(step: number): void {
    const all = entriesOf(this.chapter)
    const at = all.indexOf(this.selected)
    this.selected = all[(at + step + all.length * 2) % all.length]
    this.render()
  }

  private render(): void {
    const total = BOOK.filter((entry) => this.found.has(entry.id))
    this.total.textContent =
      total.length === BOOK.length
        ? copy('book.found_all')
        : copy('book.tally', { found: total.length, of: BOOK.length })
    for (const [chapter, button] of this.tabs) {
      const { found, of } = tallyOf(this.found, chapter)
      const shown = chapter === this.chapter
      button.textContent = `${CHAPTER_LABEL[chapter]} ${copy('book.tally', { found, of })}`
      button.setAttribute('aria-selected', String(shown))
      button.tabIndex = shown ? 0 : -1
    }
    this.list.replaceChildren(
      ...entriesOf(this.chapter).map((entry) => {
        const known = this.found.has(entry.id)
        const li = el('li', '')
        const row = el(
          'button',
          known ? 'bv-book-row' : 'bv-book-row bv-book-row--dark',
          known ? entry.name : UNKNOWN
        )
        row.type = 'button'
        row.dataset.entry = entry.id
        if (entry === this.selected) row.setAttribute('aria-current', 'true')
        li.appendChild(row)
        return li
      })
    )
    const known = this.found.has(this.selected.id)
    this.name.textContent = known ? this.selected.name : UNKNOWN
    this.lore.textContent = known ? this.selected.lore : UNKNOWN_LORE
    this.lore.classList.toggle('bv-book-lore--dark', !known)
    if (this.open) this.onPage?.(this.selected, known)
  }
}
