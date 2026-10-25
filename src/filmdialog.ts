// The projector in the drive-in's booth (sharedworld.ts rule 41): a
// dialog over the valley, opened with E at the projector, in the frame the
// campfire's and the Recycling Center's share (npcdialog.ts). It shows
// what is on the screen now and every film in the bucket (worker/films.ts),
// each with a button that threads it, from its start, for everyone. The
// caller sends the frame; the dialog reads the game's state again every
// tick, so the valley's answer shows as it lands.

import { copy } from './copy.ts'
import { el, finder } from './dom.ts'
import { FILMS_PATH, filmTitle, isFilmName } from './drivein.ts'
import { closesDialog, npcFooter, npcHeader, sectionHead } from './npcdialog.ts'

interface FilmDialogOptions {
  // Every film in the bucket, in order; null while the list is coming,
  // and an empty list when it never came or there are none.
  films: () => readonly string[] | null
  // Read again every tick: the film on the screen (null for none),
  // whether a thread is still unanswered, and the last word on one.
  showing: () => string | null
  pending: () => boolean
  said: () => string | null
  onThread: (film: string) => void
}

// Every film in the bucket, as the Worker lists them; none when the list
// never came.
export async function fetchFilms(): Promise<string[]> {
  try {
    const res = await fetch(FILMS_PATH)
    if (!res.ok) return []
    const body = (await res.json()) as { films?: unknown }
    return Array.isArray(body.films) ? body.films.filter(isFilmName) : []
  } catch {
    return []
  }
}

// How often the readout is redrawn.
const TICK_MS = 250

// Mounts the dialog over everything and resolves once it is closed.
export function openFilmDialog(options: FilmDialogOptions): Promise<void> {
  const root = document.createElement('div')
  root.className = 'bv-account bv-npc bv-films'
  root.setAttribute('role', 'dialog')
  root.setAttribute('aria-modal', 'true')
  root.setAttribute('aria-labelledby', 'bv-films-title')
  root.innerHTML = `
    <div class="bv-npc-ui bv-npc-ui--wide">
      ${npcHeader({
        titleId: 'bv-films-title',
        title: copy('drive_in.title'),
        eyebrow: copy('drive_in.eyebrow'),
        where: copy('drive_in.where'),
        status: '',
        speech: false,
      })}
      <section class="bv-npc-section">
        ${sectionHead(copy('drive_in.showing'), 'films-showing')}
        <div class="bv-npc-grid">
          <div class="bv-npc-stat bv-npc-c12">
            <span class="bv-npc-numeral" data-bv="films-now"></span>
          </div>
        </div>
      </section>
      <section class="bv-npc-section">
        ${sectionHead(copy('drive_in.films'), 'films-list')}
        <p class="bv-npc-hint" data-bv="films-none"></p>
        <div data-bv="films-rows"></div>
      </section>
      ${npcFooter('films-said', 'films-close', copy('drive_in.close'))}
    </div>`
  document.body.appendChild(root)

  const find = finder(root)
  find<HTMLParagraphElement>('[data-bv="npc-lede"]').textContent =
    copy('drive_in.says')
  find<HTMLElement>('[data-bv="films-showing"]').textContent = copy(
    'drive_in.showing_meta'
  )
  const meta = find<HTMLElement>('[data-bv="films-list"]')
  const now = find<HTMLElement>('[data-bv="films-now"]')
  const none = find<HTMLParagraphElement>('[data-bv="films-none"]')
  const list = find<HTMLElement>('[data-bv="films-rows"]')
  const said = find<HTMLParagraphElement>('[data-bv="films-said"]')
  const closeBtn = find<HTMLButtonElement>('[data-bv="films-close"]')
  // The rows, built once the list has come, each film's button by name.
  let rows: { film: string; button: HTMLButtonElement }[] | null = null

  const build = (films: readonly string[]) => {
    const built = films.map((film) => {
      const row = el('div', 'bv-npc-grid bv-npc-grid--top')
      row.dataset.film = film
      const name = el('div', 'bv-npc-stat bv-npc-c8')
      name.append(el('span', 'bv-npc-label', filmTitle(film)))
      const act = el('div', 'bv-npc-act bv-npc-c4 bv-npc-right')
      const button = el('button', 'bv-btn bv-npc-btn bv-btn--primary')
      button.type = 'button'
      button.dataset.bv = 'film-thread'
      button.addEventListener('click', () => {
        if (options.pending()) return
        options.onThread(film)
        refresh()
      })
      act.append(button)
      row.append(name, act)
      return { film, button, row }
    })
    list.replaceChildren(...built.map(({ row }) => row))
    rows = built
  }

  const refresh = () => {
    const films = options.films()
    if (films && !rows) build(films)
    const busy = options.pending()
    const showing = options.showing()
    now.textContent = showing
      ? filmTitle(showing)
      : copy('drive_in.nothing_showing')
    said.textContent = options.said() ?? ''
    none.hidden = films !== null && films.length > 0
    none.textContent =
      films === null ? copy('drive_in.loading') : copy('drive_in.none')
    meta.textContent = films
      ? copy('drive_in.films_meta', { count: films.length })
      : ''
    for (const { film, button } of rows ?? []) {
      button.disabled = busy
      button.textContent =
        film === showing ? copy('drive_in.rethread') : copy('drive_in.thread')
    }
  }

  return new Promise<void>((resolve) => {
    // The game listens on the document too, and pointer lock is off while
    // the dialog is open, so its keys do nothing; E closes it.
    const onKey = (e: KeyboardEvent) => {
      if (!closesDialog(e)) return
      e.preventDefault()
      close()
    }
    const timer = setInterval(refresh, TICK_MS)

    function close(): void {
      clearInterval(timer)
      document.removeEventListener('keydown', onKey)
      root.remove()
      resolve()
    }

    closeBtn.addEventListener('click', close)
    document.addEventListener('keydown', onKey)

    refresh()
    closeBtn.focus({ preventScroll: true })
  })
}
