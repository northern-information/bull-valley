// Tending your Cabbage Stand (sharedworld.ts rule 23): a small dialog
// over the valley, opened with E beside the stand, like Gron's. It shows
// your ledger as it stands this second (stand.ts, against the valley's
// clock): the level, the table, what it earns and has banked, and when it
// fills; its buttons put goods out of the pack, collect into the wallet,
// and buy the next level. The caller sends the frames; the dialog reads
// the game's state again every tick, so the valley's answers show as
// they land.

import { copy } from './copy.ts'
import { finder } from './dom.ts'
import { itemLabel } from './itemcopy.ts'
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
} from './stand.ts'
import { formatCash } from './store.ts'
import type { Inventory } from './interfaces.ts'
import type { StandLedger, StandPrice } from './stand.ts'

export interface StandDialogOptions {
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

function priceText(price: StandPrice): string {
  const parts = [formatCash(price.cash)]
  for (const [kind, count] of Object.entries(price.items)) {
    if (count > 0) {
      parts.push(copy('stand.price_item', { count, item: labelOf(kind) }))
    }
  }
  return parts.join(', ')
}

// Mounts the dialog over everything and resolves once it is closed.
export function openStandDialog(options: StandDialogOptions): Promise<void> {
  const { goods } = options
  const root = document.createElement('div')
  root.className = 'bv-account bv-stand'
  root.setAttribute('role', 'dialog')
  root.setAttribute('aria-modal', 'true')
  root.setAttribute('aria-labelledby', 'bv-stand-title')
  const rows = goods
    .map(
      (kind) => `
        <div class="bv-stand-good" data-good="${kind}">
          <p data-bv="stand-good-line"></p>
          <div class="bv-select-actions">
            <button type="button" class="bv-btn" data-bv="stand-stock-one">${copy('stand.stock_one', { item: labelOf(kind) })}</button>
            <button type="button" class="bv-btn" data-bv="stand-stock-all">${copy('stand.stock_all')}</button>
          </div>
        </div>`
    )
    .join('')
  root.innerHTML = `
    <div class="bv-account-ui bv-stand-ui">
      <h2 id="bv-stand-title">${copy('stand.title')}</h2>
      <p class="bv-account-lede bv-stand-says">${copy('stand.says')}</p>
      <p data-bv="stand-level"></p>
      <h3 data-bv="stand-table"></h3>
      ${rows}
      <p data-bv="stand-earning"></p>
      <p data-bv="stand-banked"></p>
      <p data-bv="stand-full"></p>
      <button type="button" class="bv-btn bv-btn--primary" data-bv="stand-collect"></button>
      <p data-bv="stand-next"></p>
      <button type="button" class="bv-btn" data-bv="stand-upgrade"></button>
      <p class="bv-account-status" data-bv="stand-said" aria-live="polite"></p>
      <button type="button" class="bv-btn" data-bv="stand-close">${copy('stand.close')}</button>
    </div>`
  document.body.appendChild(root)

  const find = finder(root)
  const level = find<HTMLParagraphElement>('[data-bv="stand-level"]')
  const table = find<HTMLHeadingElement>('[data-bv="stand-table"]')
  const earning = find<HTMLParagraphElement>('[data-bv="stand-earning"]')
  const banked = find<HTMLParagraphElement>('[data-bv="stand-banked"]')
  const full = find<HTMLParagraphElement>('[data-bv="stand-full"]')
  const collectBtn = find<HTMLButtonElement>('[data-bv="stand-collect"]')
  const next = find<HTMLParagraphElement>('[data-bv="stand-next"]')
  const upgradeBtn = find<HTMLButtonElement>('[data-bv="stand-upgrade"]')
  const said = find<HTMLParagraphElement>('[data-bv="stand-said"]')
  const closeBtn = find<HTMLButtonElement>('[data-bv="stand-close"]')
  const goodRows = goods.map((kind) => {
    const row = find<HTMLDivElement>(`[data-good="${kind}"]`)
    return {
      kind,
      line: find<HTMLParagraphElement>('[data-bv="stand-good-line"]', row),
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
    const { shelf } = levelOf(ledger)
    level.textContent = copy('stand.level', {
      level: ledger.level,
      top: topLevel(),
    })
    table.textContent = copy('stand.table', { count: stocked(ledger), shelf })
    for (const row of goodRows) {
      row.line.textContent = copy('stand.good', {
        item: labelOf(row.kind),
        out: ledger.stock[row.kind] || 0,
        held: pack[row.kind] || 0,
      })
      row.one.disabled = busy || stockCount(ledger, row.kind, false) < 1
      row.all.disabled = busy || stockCount(ledger, row.kind, true) < 1
    }
    const rate = ratePerHour(ledger)
    earning.textContent =
      rate > 0
        ? copy('stand.earning', {
            rate: formatCash(Math.floor(rate)),
            cap: formatCash(capOf(ledger)),
          })
        : copy('stand.idle')
    banked.textContent = copy('stand.banked', {
      amount: formatCash(Math.floor(accruedAt(ledger, now))),
    })
    const fills = fullAt(ledger, now)
    full.textContent =
      fills === null
        ? ''
        : fills <= now
          ? copy('stand.full')
          : copy('stand.full_in', { time: spanText(fills - now) })
    const cents = collectable(ledger, now)
    collectBtn.textContent = copy('stand.collect', {
      amount: formatCash(cents),
    })
    collectBtn.disabled = busy || cents < 1
    const price = upgradePrice(ledger)
    if (price) {
      const up = levelOf({ ...ledger, level: ledger.level + 1 })
      next.textContent = copy('stand.next', {
        level: ledger.level + 1,
        shelf: up.shelf,
        rate: formatCash(up.rate),
        hours: up.capHours,
      })
      upgradeBtn.textContent = copy('stand.upgrade', {
        price: priceText(price),
      })
      upgradeBtn.disabled =
        busy || !affordsUpgrade(ledger, options.cash(), pack)
    } else {
      next.textContent = ''
      upgradeBtn.textContent = copy('stand.top')
      upgradeBtn.disabled = true
    }
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
    closeBtn.focus()
  })
}
