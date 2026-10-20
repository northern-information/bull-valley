// Tending your Cabbage Stand (sharedworld.ts rule 23): a dialog over the
// valley, opened with E beside the stand, in the frame Erwin's shares
// (npcdialog.ts). It shows your ledger as it stands this second (stand.ts,
// against the valley's clock) in three sections: 01 the till (banked,
// earning, when it fills, and Collect), 02 the table (its slots, each good
// out and in the pack, and the buttons that put them out), 03 the next
// level (what it changes, what it costs against what you have, and
// Upgrade, saying what falls short). The caller sends the frames; the dialog reads
// the game's state again every tick, so the valley's answers show as
// they land.

import { copy } from './copy.ts'
import { el, finder } from './dom.ts'
import { itemLabel } from './itemcopy.ts'
import { npcFooter, npcHeader, sectionHead, setPips } from './npcdialog.ts'
import {
  accruedAt,
  affordsUpgrade,
  capOf,
  collectable,
  fullAt,
  levelOf,
  ratePerHour,
  shelfRoom,
  stocked,
  topLevel,
  upgradePrice,
  upgradeShortfall,
} from './stand.ts'
import { formatCash } from './store.ts'
import type { Inventory } from './interfaces.ts'
import type { StandLedger, StandPrice } from './stand.ts'

interface StandDialogOptions {
  // The goods that go out on the table (CONFIG.stand.goods).
  goods: readonly string[]
  // Read again every tick: the ledger (null when the valley is gone), the
  // pack, the wallet in cents, the valley's clock in ms, whether a change
  // is still unanswered, and the last word on one.
  ledger: () => StandLedger | null
  pack: () => Inventory
  cash: () => number
  now: () => number
  pending: () => boolean
  said: () => string | null
  onStock: (kind: string, count: number) => void
  onCollect: () => void
  onUpgrade: () => void
}

// How often the readout is redrawn.
const TICK_MS = 250

const MINUTE_MS = 60 * 1000

// A span as hours and minutes, rounded up to the minute.
function spanText(ms: number): string {
  const minutes = Math.max(1, Math.ceil(ms / MINUTE_MS))
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  return h > 0 ? copy('stand.hours', { h, m }) : copy('stand.minutes', { m })
}

function labelOf(kind: string): string {
  return itemLabel(kind)
}

// Mounts the dialog over everything and resolves once it is closed.
export function openStandDialog(options: StandDialogOptions): Promise<void> {
  const { goods } = options
  const root = document.createElement('div')
  root.className = 'bv-account bv-npc bv-stand'
  root.setAttribute('role', 'dialog')
  root.setAttribute('aria-modal', 'true')
  root.setAttribute('aria-labelledby', 'bv-stand-title')
  const stat = (label: string, value: string) => `
    <div class="bv-npc-stat bv-npc-c4">
      <span class="bv-npc-label">${label}</span>
      <span class="bv-npc-numeral" data-bv="${value}"></span>
    </div>`
  const rows = goods
    .map(
      (kind) => `
        <div class="bv-npc-grid bv-npc-row" data-good="${kind}">
          <span class="bv-npc-good bv-npc-c4"><span class="bv-npc-swatch" data-good="${kind}"></span>${labelOf(kind)}</span>
          <span class="bv-npc-cell bv-npc-c2" data-bv="stand-out"></span>
          <span class="bv-npc-cell bv-npc-c2" data-bv="stand-held"></span>
          <div class="bv-npc-pair bv-npc-c4">
            <button type="button" class="bv-btn bv-npc-btn" data-bv="stand-stock-one">${copy('stand.stock_one')}</button>
            <button type="button" class="bv-btn bv-npc-btn" data-bv="stand-stock-all"></button>
          </div>
        </div>`
    )
    .join('')
  const compare = (label: string, bv: string) => `
    <span class="bv-npc-label">${label}</span>
    <span class="bv-npc-was" data-bv="${bv}-now"></span>
    <span class="bv-npc-arrow">→</span>
    <span class="bv-npc-then" data-bv="${bv}-then"></span>`
  root.innerHTML = `
    <div class="bv-npc-ui bv-npc-ui--wide">
      ${npcHeader({
        titleId: 'bv-stand-title',
        title: copy('stand.title'),
        eyebrow: copy('stand.eyebrow'),
        where: copy('stand.where'),
        status: `<span class="bv-npc-eyebrow" data-bv="stand-level"></span><span class="bv-npc-pips" data-bv="stand-pips"></span>`,
        speech: false,
      })}
      <section class="bv-npc-section">
        ${sectionHead(copy('stand.till'), 'stand-cap')}
        <div class="bv-npc-grid">
          ${stat(copy('stand.banked'), 'stand-banked')}
          <div class="bv-npc-stat bv-npc-c4">
            <span class="bv-npc-label">${copy('stand.earning')}</span>
            <span class="bv-npc-numeral"><span data-bv="stand-earning"></span><small>${copy('stand.per_hour')}</small></span>
          </div>
          ${stat(copy('stand.full_in'), 'stand-full')}
          <div class="bv-npc-meter-box bv-npc-c8">
            <div class="bv-npc-meter"><div data-bv="stand-fill"></div></div>
            <div class="bv-npc-legend">
              <span class="bv-npc-label" data-bv="stand-meter"></span>
              <span class="bv-npc-label" data-bv="stand-percent"></span>
            </div>
          </div>
          <button type="button" class="bv-btn bv-npc-btn bv-btn--primary bv-npc-c4" data-bv="stand-collect"></button>
          <p class="bv-npc-hint bv-npc-c12" data-bv="stand-idle"></p>
        </div>
      </section>
      <section class="bv-npc-section">
        ${sectionHead(copy('stand.table'), 'stand-slots')}
        <div class="bv-npc-slots" data-bv="stand-strip"></div>
        <div class="bv-npc-table">
          <div class="bv-npc-grid bv-npc-row bv-npc-row--head">
            <span class="bv-npc-label bv-npc-c4">${copy('stand.good')}</span>
            <span class="bv-npc-label bv-npc-cell bv-npc-c2">${copy('stand.out')}</span>
            <span class="bv-npc-label bv-npc-cell bv-npc-c2">${copy('stand.held')}</span>
          </div>
          ${rows}
        </div>
        <p class="bv-npc-hint" data-bv="stand-table-full"></p>
      </section>
      <section class="bv-npc-section bv-npc-side">
        ${sectionHead('', 'stand-next')}
        <div class="bv-npc-grid bv-npc-grid--top" data-bv="stand-next-body">
          <div class="bv-npc-compare bv-npc-c6">
            ${compare(copy('stand.holds'), 'stand-holds')}
            ${compare(copy('stand.earns'), 'stand-rate')}
            ${compare(copy('stand.banks'), 'stand-banks')}
          </div>
          <div class="bv-npc-costs bv-npc-c6">
            <span class="bv-npc-label">${copy('stand.costs')}</span>
            <span class="bv-npc-label bv-npc-cell">${copy('stand.need')}</span>
            <span class="bv-npc-label bv-npc-cell">${copy('stand.have')}</span>
            <div class="bv-npc-cost-rows" data-bv="stand-costs"></div>
          </div>
          <div class="bv-npc-act bv-npc-c6 bv-npc-right">
            <button type="button" class="bv-btn bv-npc-btn bv-btn--primary" data-bv="stand-upgrade"></button>
            <span class="bv-npc-why" data-bv="stand-short"></span>
          </div>
        </div>
      </section>
      ${npcFooter('stand-said', 'stand-close', copy('stand.close'))}
    </div>`
  document.body.appendChild(root)

  const find = finder(root)
  find<HTMLParagraphElement>('[data-bv="npc-lede"]').textContent =
    copy('stand.says')
  const text = (name: string) => find<HTMLElement>(`[data-bv="${name}"]`)
  const level = text('stand-level')
  const pips = text('stand-pips')
  const cap = text('stand-cap')
  const banked = text('stand-banked')
  const earning = text('stand-earning')
  const full = text('stand-full')
  const fill = text('stand-fill')
  const meter = text('stand-meter')
  const percent = text('stand-percent')
  const idle = text('stand-idle')
  const slots = text('stand-slots')
  const strip = text('stand-strip')
  const tableFull = text('stand-table-full')
  const nextName = text('stand-next-name')
  const nextMeta = text('stand-next')
  const nextBody = text('stand-next-body')
  const costs = text('stand-costs')
  const short = text('stand-short')
  const collectBtn = find<HTMLButtonElement>('[data-bv="stand-collect"]')
  const upgradeBtn = find<HTMLButtonElement>('[data-bv="stand-upgrade"]')
  const said = find<HTMLParagraphElement>('[data-bv="stand-said"]')
  const closeBtn = find<HTMLButtonElement>('[data-bv="stand-close"]')
  const goodRows = goods.map((kind) => {
    const row = find<HTMLDivElement>(`.bv-npc-row[data-good="${kind}"]`)
    return {
      kind,
      out: find<HTMLElement>('[data-bv="stand-out"]', row),
      held: find<HTMLElement>('[data-bv="stand-held"]', row),
      one: find<HTMLButtonElement>('[data-bv="stand-stock-one"]', row),
      all: find<HTMLButtonElement>('[data-bv="stand-stock-all"]', row),
    }
  })

  // How many of `kind` one press puts out: one, or as many as the pack
  // holds and the table takes.
  const stockCount = (ledger: StandLedger, kind: string, all: boolean) => {
    const held = options.pack()[kind] || 0
    const fits = Math.min(held, shelfRoom(ledger))
    return all ? fits : Math.min(1, fits)
  }

  // The table as a strip of slots, each good's in its own color, the
  // empty ones after.
  const drawStrip = (ledger: StandLedger, shelf: number) => {
    if (strip.childElementCount !== shelf) {
      strip.replaceChildren(
        ...Array.from({ length: shelf }, () => el('span', 'bv-npc-slot'))
      )
    }
    const filled = goods.flatMap((kind) =>
      Array.from<string>({ length: ledger.stock[kind] || 0 }).fill(kind)
    )
    Array.from(strip.children).forEach((slot, i) => {
      const kind = filled[i]
      if (kind) (slot as HTMLElement).dataset.good = kind
      else delete (slot as HTMLElement).dataset.good
    })
  }

  // The next level's price, a row a part: what it needs, what you have,
  // and whether that covers it.
  const drawCosts = (price: StandPrice, cash: number, pack: Inventory) => {
    const parts: [string, string, string, boolean][] = [
      [
        copy('stand.cash'),
        formatCash(price.cash),
        formatCash(cash),
        cash >= price.cash,
      ],
    ]
    for (const [kind, count] of Object.entries(price.items)) {
      if (count < 1) continue
      const held = pack[kind] || 0
      parts.push([labelOf(kind), String(count), String(held), held >= count])
    }
    costs.replaceChildren(
      ...parts.flatMap(([name, need, have, ok]) => {
        const haveCell = el('span', 'bv-npc-cell', `${have} ${ok ? '✓' : '✕'}`)
        if (!ok) haveCell.classList.add('bv-npc-short')
        return [el('span', '', name), el('span', 'bv-npc-cell', need), haveCell]
      })
    )
  }

  const refresh = () => {
    const ledger = options.ledger()
    const busy = options.pending() || !ledger
    said.textContent = ledger
      ? (options.said() ?? '')
      : copy('log.stand_offline')
    if (!ledger) {
      for (const button of root.querySelectorAll<HTMLButtonElement>(
        '[data-bv^="stand-"]:not([data-bv="stand-close"])'
      )) {
        button.disabled = true
      }
      return
    }
    const now = options.now()
    const pack = options.pack()
    const cash = options.cash()
    const { shelf } = levelOf(ledger)
    level.textContent = copy('stand.level', {
      level: ledger.level,
      top: topLevel(),
    })
    setPips(pips, ledger.level, topLevel())

    // 01, the till: what is banked, what it earns, when it fills.
    const rate = ratePerHour(ledger)
    const capCents = capOf(ledger)
    const bank = Math.floor(accruedAt(ledger, now))
    const fills = fullAt(ledger, now)
    const isFull = fills !== null && fills <= now
    root.classList.toggle('bv-stand--full', isFull)
    cap.textContent = isFull
      ? copy('stand.full')
      : copy('stand.cap', { cap: formatCash(capCents) })
    banked.textContent = formatCash(bank)
    earning.textContent = formatCash(isFull ? 0 : Math.floor(rate))
    full.textContent =
      fills === null
        ? copy('stand.never')
        : isFull
          ? copy('stand.now')
          : spanText(fills - now)
    const share = capCents > 0 ? Math.min(1, bank / capCents) : 0
    fill.style.width = `${share * 100}%`
    meter.textContent = copy('stand.meter', {
      amount: formatCash(bank),
      cap: formatCash(capCents),
    })
    percent.textContent = `${Math.floor(share * 100)}%`
    idle.textContent = rate > 0 ? '' : copy('stand.idle')
    const cents = collectable(ledger, now)
    collectBtn.textContent = copy('stand.collect', {
      amount: formatCash(cents),
    })
    collectBtn.disabled = busy || cents < 1

    // 02, the table and what goes out on it.
    slots.textContent = copy('stand.slots', { count: stocked(ledger), shelf })
    drawStrip(ledger, shelf)
    tableFull.textContent =
      shelfRoom(ledger) > 0 ? '' : copy('stand.table_full')
    for (const row of goodRows) {
      row.out.textContent = String(ledger.stock[row.kind] || 0)
      row.held.textContent = String(pack[row.kind] || 0)
      const all = stockCount(ledger, row.kind, true)
      row.all.textContent =
        all > 0
          ? copy('stand.stock_all', { count: all })
          : copy('stand.stock_none')
      row.one.disabled = busy || stockCount(ledger, row.kind, false) < 1
      row.all.disabled = busy || all < 1
    }

    // 03, the next level, or the top.
    const price = upgradePrice(ledger)
    nextBody.hidden = price === null
    if (!price) {
      nextName.textContent = copy('stand.top')
      nextMeta.textContent = copy('stand.top_meta', {
        shelf,
        rate: formatCash(levelOf(ledger).rate),
        hours: levelOf(ledger).capHours,
      })
      upgradeBtn.disabled = true
      return
    }
    const here = levelOf(ledger)
    const up = levelOf({ ...ledger, level: ledger.level + 1 })
    nextName.textContent = copy('stand.next', { level: ledger.level + 1 })
    nextMeta.textContent = copy('stand.upgrade_meta')
    const pair = (bv: string, now: string, then: string) => {
      text(`${bv}-now`).textContent = now
      text(`${bv}-then`).textContent = then
    }
    pair('stand-holds', String(here.shelf), String(up.shelf))
    pair('stand-rate', formatCash(here.rate), formatCash(up.rate))
    pair(
      'stand-banks',
      copy('stand.banks_hours', { hours: here.capHours }),
      copy('stand.banks_hours', { hours: up.capHours })
    )
    drawCosts(price, cash, pack)
    upgradeBtn.textContent = copy('stand.upgrade', { level: ledger.level + 1 })
    upgradeBtn.disabled = busy || !affordsUpgrade(ledger, cash, pack)
    const lack = upgradeShortfall(ledger, cash, pack)
    short.textContent = !lack
      ? ''
      : lack.kind === 'cash'
        ? copy('stand.short_cash', { amount: formatCash(lack.count) })
        : copy('stand.short_item', {
            count: lack.count,
            item: labelOf(lack.kind),
          })
  }

  return new Promise<void>((resolve) => {
    const stock = (kind: string, all: boolean) => {
      const ledger = options.ledger()
      if (!ledger || options.pending()) return
      const count = stockCount(ledger, kind, all)
      if (count > 0) options.onStock(kind, count)
      refresh()
    }
    const onCollect = () => {
      if (!options.pending()) options.onCollect()
      refresh()
    }
    const onUpgrade = () => {
      if (!options.pending()) options.onUpgrade()
      refresh()
    }
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

    for (const row of goodRows) {
      row.one.addEventListener('click', () => stock(row.kind, false))
      row.all.addEventListener('click', () => stock(row.kind, true))
    }
    collectBtn.addEventListener('click', onCollect)
    upgradeBtn.addEventListener('click', onUpgrade)
    closeBtn.addEventListener('click', close)
    document.addEventListener('keydown', onKey)

    refresh()
    closeBtn.focus({ preventScroll: true })
  })
}
