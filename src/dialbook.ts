// Bull Valley Dial-Up's Book of Shadows (book.ts, sharedworld.ts rule 20),
// read on a phone: the chapters as chips with each one's tally, the
// chapter's entries down the screen (??? until found), and an entry's page
// in a sheet, its portrait the 3D valley's own model turning
// (bookportraits.ts, drawn by dialshell.ts through dial3d.ts), dark until
// found. The phone writes nothing in it: pages are found in the valley.

import { BOOK, CHAPTERS, entriesOf, tallyOf } from './book.ts'
import { copy } from './copy.ts'
import { el, text } from './dom.ts'
import { wardLine, wardName } from './vitalshud.ts'
import { wardOfEntry } from './wards.ts'
import type { BookEntry, Chapter } from './book.ts'

const CHAPTER_LABEL: Record<Chapter, string> = {
  places: copy('book.places'),
  shadows: copy('book.shadows'),
  folk: copy('book.folk'),
  items: copy('book.items'),
}

export class DialBook {
  readonly root = el('div', 'bv-dial-book')
  private chapter: Chapter = CHAPTERS[0]
  private onOpen: (entry: BookEntry) => void

  constructor(onOpen: (entry: BookEntry) => void) {
    this.onOpen = onOpen
  }

  render(found: ReadonlySet<string>): void {
    const total = BOOK.filter((entry) => found.has(entry.id)).length
    const head = text(
      'p',
      total === BOOK.length
        ? copy('book.found_all')
        : copy('book.tally', { found: total, of: BOOK.length }),
      'bv-dial-book-total'
    )
    const chips = el('div', 'bv-dial-chips')
    for (const chapter of CHAPTERS) {
      const { found: got, of } = tallyOf(found, chapter)
      const chip = text(
        'button',
        `${CHAPTER_LABEL[chapter]} ${copy('book.tally', { found: got, of })}`,
        'bv-dial-chip'
      )
      chip.type = 'button'
      chip.dataset.chapter = chapter
      chip.setAttribute('aria-pressed', String(chapter === this.chapter))
      chip.addEventListener('click', () => {
        this.chapter = chapter
        this.render(found)
      })
      chips.append(chip)
    }
    const list = el('ul', 'bv-dial-entries')
    for (const entry of entriesOf(this.chapter)) {
      const known = found.has(entry.id)
      const li = el('li')
      const row = text(
        'button',
        known ? entry.name : copy('book.unknown'),
        'bv-dial-entry'
      )
      row.type = 'button'
      row.dataset.entry = entry.id
      row.classList.toggle('bv-dial-entry--dark', !known)
      row.addEventListener('click', () => this.onOpen(entry))
      li.append(row)
      list.append(li)
    }
    this.root.replaceChildren(
      text('h2', copy('book.title'), 'bv-dial-book-title'),
      head,
      chips,
      list
    )
  }
}

// An entry's page: its portrait's canvas, its name, the ward that keeps
// its shadow off, its lore.
export function renderPage(
  root: HTMLElement,
  entry: BookEntry,
  known: boolean
): HTMLCanvasElement {
  const canvas = document.createElement('canvas')
  canvas.className = 'bv-dial-page-portrait'
  canvas.width = 240
  canvas.height = 240
  const ward = known ? wardOfEntry(entry.id) : null
  root.replaceChildren(
    canvas,
    text('h3', known ? entry.name : copy('book.unknown'), 'bv-dial-page-name'),
    ...(ward
      ? [
          wardLine(
            'bv-ward-line',
            ward,
            copy('book.warded_by', { ward: wardName(ward) })
          ),
        ]
      : []),
    text(
      'p',
      known ? entry.lore : copy('book.unknown_lore'),
      known ? 'bv-dial-page-lore' : 'bv-dial-page-lore bv-dial-page-lore--dark'
    )
  )
  return canvas
}
