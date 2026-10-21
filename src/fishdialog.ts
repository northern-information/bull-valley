// The tackle box on the firefly pond's landing (sharedworld.ts rule 36): a
// dialog over the valley, opened with E at the box, in the frame Erwin's
// and the stand's share (npcdialog.ts); Dial-Up fishes the pond in a sheet
// of its own (dialfish.ts). It shows the angler (the skill, today's catch
// against the day's limit, the bait in the pack), the buttons that take a
// rod and dig the bank, and the bait the rod casts with, one to pick. The
// cast is the click's, with the rod in the left hand (held.ts), and the
// fight plays over the view (fishhud.ts). The dialog reads the game's
// state again every tick, so the valley's answers show as they land.

import { copy } from './copy.ts'
import { finder } from './dom.ts'
import { BAITS, rodIn, skillText } from './fishing.ts'
import { baitName } from './fishlines.ts'
import { itemLabel } from './itemcopy.ts'
import { npcFooter, npcHeader, sectionHead } from './npcdialog.ts'
import type { AnglerWire, Bait } from './fishing.ts'
import type { Inventory } from './interfaces.ts'

interface FishDialogOptions {
  // Read again every tick: the angler (null until the valley has sent
  // it), the pack, the bait the rod would cast with (null with none),
  // whether a frame is still unanswered, and the last word on one.
  angler: () => AnglerWire | null
  pack: () => Inventory
  bait: () => Bait | null
  pending: () => boolean
  said: () => string | null
  // The valley's clock, ms, for the dig's cooldown.
  serverNow: () => number
  onTackle: () => void
  onDig: () => void
  // A bait picked for the rod.
  onBait: (bait: Bait) => void
}

// How often the readout is redrawn.
const TICK_MS = 50

// Mounts the dialog over everything and resolves once it is closed.
export function openFishDialog(options: FishDialogOptions): Promise<void> {
  const root = document.createElement('div')
  root.className = 'bv-account bv-npc bv-fish'
  root.setAttribute('role', 'dialog')
  root.setAttribute('aria-modal', 'true')
  root.setAttribute('aria-labelledby', 'bv-fish-title')
  const baits = BAITS.map(
    (bait) => `
      <div class="bv-npc-act bv-npc-c4">
        <button type="button" class="bv-btn bv-npc-btn" data-bait-pick="${bait}"></button>
        <span class="bv-npc-why" data-bait-why="${bait}"></span>
      </div>`
  ).join('')
  root.innerHTML = `
    <div class="bv-npc-ui">
      ${npcHeader({
        titleId: 'bv-fish-title',
        title: copy('fishing.title'),
        eyebrow: copy('fishing.eyebrow'),
        where: copy('fishing.where'),
        status: '',
        speech: false,
      })}
      <section class="bv-npc-section" data-bv="fish-tackle">
        ${sectionHead(copy('fishing.angler'), 'fish-angler')}
        <div class="bv-npc-grid">
          <div class="bv-npc-stat bv-npc-c3">
            <span class="bv-npc-label">${copy('fishing.skill')}</span>
            <span class="bv-npc-numeral" data-bv="fish-skill"></span>
          </div>
          <div class="bv-npc-stat bv-npc-c3">
            <span class="bv-npc-label">${copy('fishing.today')}</span>
            <span class="bv-npc-numeral" data-bv="fish-today"></span>
          </div>
          ${BAITS.map(
            (bait) => `
          <div class="bv-npc-stat bv-npc-c2">
            <span class="bv-npc-label">${baitName(bait)}</span>
            <span class="bv-npc-numeral" data-bait="${bait}"></span>
          </div>`
          ).join('')}
          <div class="bv-npc-act bv-npc-c6">
            <button type="button" class="bv-btn bv-npc-btn" data-bv="fish-rod"></button>
          </div>
          <div class="bv-npc-act bv-npc-c6">
            <button type="button" class="bv-btn bv-npc-btn" data-bv="fish-dig"></button>
          </div>
        </div>
      </section>
      <section class="bv-npc-section" data-bv="fish-baits">
        ${sectionHead(copy('fishing.bait'), 'fish-bait')}
        <div class="bv-npc-grid bv-npc-grid--top">${baits}</div>
        <p class="bv-npc-hint">${copy('fishing.how')}</p>
      </section>
      ${npcFooter('fish-said', 'fish-close', copy('fishing.close'))}
    </div>`
  document.body.appendChild(root)

  const find = finder(root)
  find<HTMLParagraphElement>('[data-bv="npc-lede"]').textContent =
    copy('fishing.says')
  const skill = find<HTMLElement>('[data-bv="fish-skill"]')
  const today = find<HTMLElement>('[data-bv="fish-today"]')
  const baitCounts = BAITS.map((bait) => ({
    bait,
    cell: find<HTMLElement>(`[data-bait="${bait}"]`),
  }))
  const rodBtn = find<HTMLButtonElement>('[data-bv="fish-rod"]')
  const digBtn = find<HTMLButtonElement>('[data-bv="fish-dig"]')
  const baitBtns = BAITS.map((bait) => ({
    bait,
    btn: find<HTMLButtonElement>(`[data-bait-pick="${bait}"]`),
    why: find<HTMLElement>(`[data-bait-why="${bait}"]`),
  }))
  const said = find<HTMLParagraphElement>('[data-bv="fish-said"]')
  const closeBtn = find<HTMLButtonElement>('[data-bv="fish-close"]')

  const refresh = () => {
    const angler = options.angler()
    const pack = options.pack()
    const picked = options.bait()
    const busy = options.pending() || !angler
    said.textContent = options.said() ?? (angler ? '' : copy('fishing.reading'))
    const rod = rodIn(pack)
    const tired = angler !== null && angler.caught >= angler.perDay
    skill.textContent = angler ? skillText(angler.skill) : '—'
    today.textContent = angler
      ? copy('fishing.today_value', {
          caught: angler.caught,
          limit: angler.perDay,
        })
      : '—'
    for (const { bait, cell } of baitCounts) {
      cell.textContent = String(pack[bait] ?? 0)
    }
    rodBtn.textContent = rod
      ? copy('fishing.has_rod', { rod: itemLabel(rod) })
      : copy('fishing.take_rod')
    rodBtn.disabled = busy || rod !== null
    const digIn = angler
      ? Math.ceil((angler.digAt - options.serverNow()) / 1000)
      : 0
    digBtn.textContent =
      digIn > 0
        ? copy('fishing.dig_wait', { seconds: digIn })
        : copy('fishing.dig')
    digBtn.disabled = busy || digIn > 0
    for (const { bait, btn, why } of baitBtns) {
      const chosen = bait === picked
      btn.textContent = chosen
        ? copy('fishing.bait_on', { bait: baitName(bait) })
        : baitName(bait)
      btn.classList.toggle('bv-btn--primary', chosen)
      btn.setAttribute('aria-pressed', String(chosen))
      const reason =
        (pack[bait] ?? 0) < 1
          ? copy('fishing.why_bait', { bait: baitName(bait) })
          : tired
            ? copy('fishing.why_tired')
            : ''
      why.textContent = reason
      btn.disabled = (pack[bait] ?? 0) < 1
    }
  }

  return new Promise<void>((resolve) => {
    // The game listens on the document too, and pointer lock is off while
    // the dialog is open, so its keys do nothing; Escape closes it.
    const onKey = (e: KeyboardEvent) => {
      if (e.code !== 'Escape') return
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

    rodBtn.addEventListener('click', () => {
      if (!options.pending()) options.onTackle()
      refresh()
    })
    digBtn.addEventListener('click', () => {
      if (!options.pending()) options.onDig()
      refresh()
    })
    for (const { bait, btn } of baitBtns) {
      btn.addEventListener('click', () => {
        options.onBait(bait)
        refresh()
      })
    }
    closeBtn.addEventListener('click', close)
    document.addEventListener('keydown', onKey)

    refresh()
    closeBtn.focus({ preventScroll: true })
  })
}
