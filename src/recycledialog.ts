// The Recycling Center (sharedworld.ts rule 33): a dialog over the valley,
// opened with E beside the recycling machine on the spawn Citgo's lot (and
// from Dial-Up's lobby), in the frame Erwin's and the stand's share
// (npcdialog.ts). It shows the empties in the pack, then each research
// line: its level, what it does now and at the next level, what that
// costs against what you have, and the button that buys it, saying what
// falls short. The caller sends the
// frames; the dialog reads the game's state again every tick, so the
// valley's answers show as they land.

import { copy } from './copy.ts'
import { el, finder } from './dom.ts'
import { itemLabel } from './itemcopy.ts'
import { ITEMS } from './items.ts'
import { closesDialog, npcFooter, npcHeader, sectionHead } from './npcdialog.ts'
import {
  affordsResearch,
  dimesChance,
  priceOf,
  RESEARCH_LINES,
} from './recycling.ts'
import { lineBlurb, lineName } from './researchlines.ts'
import type { Inventory } from './interfaces.ts'
import type { Research, ResearchLine } from './recycling.ts'

interface RecycleDialogOptions {
  // Read again every tick: the research (null until the valley has sent
  // it), the pack, whether a change is still unanswered, and the last word
  // on one.
  research: () => Research | null
  pack: () => Inventory
  pending: () => boolean
  said: () => string | null
  onRecycle: (line: ResearchLine) => void
}

// How often the readout is redrawn.
const TICK_MS = 250

// The empties, in ITEMS order.
const MATERIALS = ITEMS.filter((item) => item.category === 'material').map(
  (item) => item.id
)

// What a line does at `research`, as the dialog shows it.
function effectOf(line: ResearchLine, research: Research): string {
  switch (line) {
    case 'dimes':
      return copy('recycling.chance_value', {
        pct: Math.round(dimesChance(research) * 100),
      })
  }
}

// Mounts the dialog over everything and resolves once it is closed.
export function openRecycleDialog(
  options: RecycleDialogOptions
): Promise<void> {
  const root = document.createElement('div')
  root.className = 'bv-account bv-npc bv-recycle'
  root.setAttribute('role', 'dialog')
  root.setAttribute('aria-modal', 'true')
  root.setAttribute('aria-labelledby', 'bv-recycle-title')
  const materials = MATERIALS.map(
    (kind) => `
      <div class="bv-npc-stat bv-npc-c4">
        <span class="bv-npc-label">${itemLabel(kind)}</span>
        <span class="bv-npc-numeral" data-material="${kind}"></span>
      </div>`
  ).join('')
  const lines = RESEARCH_LINES.map(
    (line) => `
      <section class="bv-npc-section" data-line="${line}">
        ${sectionHead(lineName(line), `recycle-${line}`)}
        <p class="bv-npc-hint">${lineBlurb(line)}</p>
        <div class="bv-npc-grid bv-npc-grid--top">
          <div class="bv-npc-compare bv-npc-c6">
            <span class="bv-npc-label">${copy('recycling.chance')}</span>
            <span class="bv-npc-was" data-bv="recycle-now"></span>
            <span class="bv-npc-arrow" data-bv="recycle-arrow">→</span>
            <span class="bv-npc-then" data-bv="recycle-then"></span>
          </div>
          <div class="bv-npc-costs bv-npc-c6" data-bv="recycle-price">
            <span class="bv-npc-label">${copy('recycling.costs')}</span>
            <span class="bv-npc-label bv-npc-cell">${copy('recycling.need')}</span>
            <span class="bv-npc-label bv-npc-cell">${copy('recycling.have')}</span>
            <div class="bv-npc-cost-rows" data-bv="recycle-costs"></div>
          </div>
          <div class="bv-npc-act bv-npc-c12 bv-npc-right">
            <button type="button" class="bv-btn bv-npc-btn bv-btn--primary" data-bv="recycle-buy"></button>
            <span class="bv-npc-why" data-bv="recycle-short"></span>
          </div>
        </div>
      </section>`
  ).join('')
  root.innerHTML = `
    <div class="bv-npc-ui bv-npc-ui--wide">
      ${npcHeader({
        titleId: 'bv-recycle-title',
        title: copy('recycling.title'),
        eyebrow: copy('recycling.eyebrow'),
        where: copy('recycling.where'),
        status: '',
        speech: false,
      })}
      <section class="bv-npc-section">
        ${sectionHead(copy('recycling.materials'), 'recycle-materials')}
        <div class="bv-npc-grid">${materials}</div>
      </section>
      ${lines}
      ${npcFooter('recycle-said', 'recycle-close', copy('recycling.close'))}
    </div>`
  document.body.appendChild(root)

  const find = finder(root)
  find<HTMLParagraphElement>('[data-bv="npc-lede"]').textContent =
    copy('recycling.says')
  find<HTMLElement>('[data-bv="recycle-materials"]').textContent = copy(
    'recycling.materials_meta'
  )
  const counts = MATERIALS.map((kind) => ({
    kind,
    cell: find<HTMLElement>(`[data-material="${kind}"]`),
  }))
  const said = find<HTMLParagraphElement>('[data-bv="recycle-said"]')
  const closeBtn = find<HTMLButtonElement>('[data-bv="recycle-close"]')
  const sections = RESEARCH_LINES.map((line) => {
    const section = find<HTMLElement>(`section[data-line="${line}"]`)
    const part = (name: string) =>
      find<HTMLElement>(`[data-bv="${name}"]`, section)
    return {
      line,
      meta: find<HTMLElement>(`[data-bv="recycle-${line}"]`, section),
      now: part('recycle-now'),
      then: part('recycle-then'),
      price: part('recycle-price'),
      costs: part('recycle-costs'),
      buy: find<HTMLButtonElement>('[data-bv="recycle-buy"]', section),
      short: part('recycle-short'),
    }
  })

  // A price, a row a part: what it needs, what you have, and whether that
  // covers it.
  const drawCosts = (row: HTMLElement, price: Inventory, pack: Inventory) => {
    row.replaceChildren(
      ...Object.entries(price).flatMap(([kind, need]) => {
        const held = pack[kind] || 0
        const ok = held >= need
        const have = el('span', 'bv-npc-cell', `${held} ${ok ? '✓' : '✕'}`)
        if (!ok) have.classList.add('bv-npc-short')
        return [
          el('span', '', itemLabel(kind)),
          el('span', 'bv-npc-cell', String(need)),
          have,
        ]
      })
    )
  }

  const refresh = () => {
    const research = options.research()
    const pack = options.pack()
    const busy = options.pending() || !research
    said.textContent =
      options.said() ?? (research ? '' : copy('recycling.reading'))
    for (const { kind, cell } of counts)
      cell.textContent = String(pack[kind] || 0)
    for (const part of sections) {
      const { line } = part
      const level = research?.[line] ?? 0
      part.meta.textContent = copy('recycling.level', { level })
      const now = research ?? { dimes: 0 }
      part.now.textContent = effectOf(line, now)
      const price = research ? priceOf(research, line) : null
      part.price.hidden = price === null
      part.then.textContent = effectOf(line, { ...now, [line]: level + 1 })
      part.buy.textContent = copy('recycling.research', { level: level + 1 })
      if (!price) {
        part.buy.disabled = true
        continue
      }
      drawCosts(part.costs, price, pack)
      part.buy.disabled = busy || !affordsResearch(pack, price)
      const lack = Object.entries(price).find(
        ([kind, need]) => (pack[kind] || 0) < need
      )
      part.short.textContent = lack
        ? copy('recycling.short_item', {
            count: lack[1] - (pack[lack[0]] || 0),
            item: itemLabel(lack[0]),
          })
        : ''
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

    for (const part of sections) {
      part.buy.addEventListener('click', () => {
        const research = options.research()
        if (!research || options.pending()) return
        const price = priceOf(research, part.line)
        if (price && affordsResearch(options.pack(), price)) {
          options.onRecycle(part.line)
        }
        refresh()
      })
    }
    closeBtn.addEventListener('click', close)
    document.addEventListener('keydown', onKey)

    refresh()
    closeBtn.focus({ preventScroll: true })
  })
}
