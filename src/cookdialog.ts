// The campfire by the firefly pond (sharedworld.ts rule 40): a dialog over
// the valley, opened with E beside the fire (and from Dial-Up's lobby), in
// the frame the Recycling Center's and the stand's share (npcdialog.ts).
// It shows each raw fish in the pack, what it cooks into and how much more
// that gives back, and the buttons that cook one or all of them; under
// that, what has been cooked and is still in the pack. The caller sends
// the frames; the dialog reads the game's state again every tick, so the
// valley's answers show as they land.

import { COOKED, cookedOf } from './cooking.ts'
import { copy } from './copy.ts'
import { finder } from './dom.ts'
import { itemLabel } from './itemcopy.ts'
import { healsOf, ITEMS } from './items.ts'
import { closesDialog, npcFooter, npcHeader, sectionHead } from './npcdialog.ts'
import type { Inventory } from './interfaces.ts'

interface CookDialogOptions {
  // Read again every tick: the pack, whether a cook is still unanswered,
  // and the last word on one.
  pack: () => Inventory
  pending: () => boolean
  said: () => string | null
  onCook: (kind: string, count: number) => void
}

// How often the readout is redrawn.
const TICK_MS = 250

// Every fish that cooks, in ITEMS order, and what each cooks into.
const RAW = ITEMS.flatMap((item) => {
  const into = cookedOf(item.id)
  return into ? [{ kind: item.id, into }] : []
})

// What the fire makes, in COOKED order.
const FOODS = Object.values(COOKED)

// Mounts the dialog over everything and resolves once it is closed.
export function openCookDialog(options: CookDialogOptions): Promise<void> {
  const root = document.createElement('div')
  root.className = 'bv-account bv-npc bv-cook'
  root.setAttribute('role', 'dialog')
  root.setAttribute('aria-modal', 'true')
  root.setAttribute('aria-labelledby', 'bv-cook-title')
  // What each gives back, as a share of whole.
  const pct = (kind: string) =>
    copy('cooking.heals', { pct: healsOf(kind, 100) })
  const rows = RAW.map(({ kind, into }) => {
    return `
      <div class="bv-npc-grid bv-npc-grid--top" data-fish="${kind}">
        <div class="bv-npc-stat bv-npc-c4">
          <span class="bv-npc-label">${itemLabel(kind)}</span>
          <span class="bv-npc-numeral" data-bv="cook-count"></span>
        </div>
        <div class="bv-npc-compare bv-npc-c4">
          <span class="bv-npc-label">${itemLabel(into)}</span>
          <span class="bv-npc-was">${pct(kind)}</span>
          <span class="bv-npc-arrow">→</span>
          <span class="bv-npc-then">${pct(into)}</span>
        </div>
        <div class="bv-npc-act bv-npc-c4 bv-npc-right">
          <button type="button" class="bv-btn bv-npc-btn" data-bv="cook-one">${copy('cooking.cook_one')}</button>
          <button type="button" class="bv-btn bv-npc-btn bv-btn--primary" data-bv="cook-all">${copy('cooking.cook_all')}</button>
        </div>
      </div>`
  }).join('')
  const foods = FOODS.map(
    (kind) => `
      <div class="bv-npc-stat bv-npc-c6">
        <span class="bv-npc-label">${itemLabel(kind)}</span>
        <span class="bv-npc-numeral" data-food="${kind}"></span>
      </div>`
  ).join('')
  root.innerHTML = `
    <div class="bv-npc-ui bv-npc-ui--wide">
      ${npcHeader({
        titleId: 'bv-cook-title',
        title: copy('cooking.title'),
        eyebrow: copy('cooking.eyebrow'),
        where: copy('cooking.where'),
        status: '',
        speech: false,
      })}
      <section class="bv-npc-section">
        ${sectionHead(copy('cooking.raw'), 'cook-raw')}
        <p class="bv-npc-hint" data-bv="cook-none">${copy('cooking.none')}</p>
        ${rows}
      </section>
      <section class="bv-npc-section">
        ${sectionHead(copy('cooking.cooked'), 'cook-cooked')}
        <div class="bv-npc-grid">${foods}</div>
      </section>
      ${npcFooter('cook-said', 'cook-close', copy('cooking.close'))}
    </div>`
  document.body.appendChild(root)

  const find = finder(root)
  find<HTMLParagraphElement>('[data-bv="npc-lede"]').textContent =
    copy('cooking.says')
  find<HTMLElement>('[data-bv="cook-raw"]').textContent =
    copy('cooking.raw_meta')
  find<HTMLElement>('[data-bv="cook-cooked"]').textContent = copy(
    'cooking.cooked_meta'
  )
  const none = find<HTMLParagraphElement>('[data-bv="cook-none"]')
  const said = find<HTMLParagraphElement>('[data-bv="cook-said"]')
  const closeBtn = find<HTMLButtonElement>('[data-bv="cook-close"]')
  const fishRows = RAW.map(({ kind }) => {
    const row = find<HTMLElement>(`[data-fish="${kind}"]`)
    return {
      kind,
      row,
      count: find<HTMLElement>('[data-bv="cook-count"]', row),
      one: find<HTMLButtonElement>('[data-bv="cook-one"]', row),
      all: find<HTMLButtonElement>('[data-bv="cook-all"]', row),
    }
  })
  const foodCounts = FOODS.map((kind) => ({
    kind,
    cell: find<HTMLElement>(`[data-food="${kind}"]`),
  }))

  const refresh = () => {
    const pack = options.pack()
    const busy = options.pending()
    said.textContent = options.said() ?? ''
    let any = false
    for (const { kind, row, count, one, all } of fishRows) {
      const held = pack[kind] || 0
      row.hidden = held < 1
      if (held > 0) any = true
      count.textContent = String(held)
      one.disabled = busy || held < 1
      all.disabled = busy || held < 1
    }
    none.hidden = any
    for (const { kind, cell } of foodCounts)
      cell.textContent = String(pack[kind] || 0)
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

    for (const { kind, one, all } of fishRows) {
      const cook = (every: boolean) => {
        const held = options.pack()[kind] || 0
        if (options.pending() || held < 1) return
        options.onCook(kind, every ? held : 1)
        refresh()
      }
      one.addEventListener('click', () => cook(false))
      all.addEventListener('click', () => cook(true))
    }
    closeBtn.addEventListener('click', close)
    document.addEventListener('keydown', onKey)

    refresh()
    closeBtn.focus({ preventScroll: true })
  })
}
