// Dealing with Wick, the squatter in Bull Valley Plaza (sharedworld.ts
// rule 24): a small dialog over the valley, opened with E beside him, like
// the stand's. It lists what he sells (dealer.ts DEALER_GOODS), each with
// its price, how many he has left today, and how many the pack holds; a
// button buys one. The caller sends the frame; the dialog reads the game's
// state again every tick, so the valley's answers show as they land.

import { copy } from './copy.ts'
import { DEALER_GOODS, leftOf } from './dealer.ts'
import { itemById } from './items.ts'
import { formatCash } from './store.ts'
import type { DealerStock } from './dealer.ts'
import type { Inventory } from './interfaces.ts'

export interface DealDialogOptions {
  // Read again every tick: his stock today (null when the valley is gone),
  // the pack, the wallet in cents, whether a deal is still unanswered,
  // and the last word on one.
  stock: () => DealerStock | null
  pack: () => Inventory
  cash: () => number
  pending: () => boolean
  said: () => string | null
  onBuy: (kind: string) => void
}

// How often the readout is redrawn.
const TICK_MS = 250

function labelOf(kind: string): string {
  return itemById(kind)?.label ?? kind
}

// Mounts the dialog over everything and resolves once it is closed.
export function openDealDialog(options: DealDialogOptions): Promise<void> {
  const root = document.createElement('div')
  root.className = 'bv-account bv-stand bv-deal'
  root.setAttribute('role', 'dialog')
  root.setAttribute('aria-modal', 'true')
  root.setAttribute('aria-labelledby', 'bv-deal-title')
  const rows = DEALER_GOODS.map(
    (good) => `
        <div class="bv-stand-good" data-good="${good.kind}">
          <p data-bv="deal-line"></p>
          <div class="bv-select-actions">
            <button type="button" class="bv-btn" data-bv="deal-buy">${copy('dealer.buy', { item: labelOf(good.kind), price: formatCash(good.price) })}</button>
          </div>
        </div>`
  ).join('')
  root.innerHTML = `
    <div class="bv-account-ui bv-stand-ui">
      <h2 id="bv-deal-title">${copy('outfits.squatter')}</h2>
      <p class="bv-account-lede bv-stand-says">${copy('dealer.says')}</p>
      ${rows}
      <p data-bv="deal-cash"></p>
      <p class="bv-account-status" data-bv="deal-said" aria-live="polite"></p>
      <button type="button" class="bv-btn" data-bv="deal-close">${copy('dealer.close')}</button>
    </div>`
  document.body.appendChild(root)

  const find = <T extends Element>(selector: string, from: Element = root) => {
    const found = from.querySelector<T>(selector)
    if (!found) throw new Error(`Missing ${selector}`)
    return found
  }
  const cashLine = find<HTMLParagraphElement>('[data-bv="deal-cash"]')
  const said = find<HTMLParagraphElement>('[data-bv="deal-said"]')
  const closeBtn = find<HTMLButtonElement>('[data-bv="deal-close"]')
  const goodRows = DEALER_GOODS.map((good) => {
    const row = find<HTMLDivElement>(`[data-good="${good.kind}"]`)
    return {
      good,
      line: find<HTMLParagraphElement>('[data-bv="deal-line"]', row),
      buy: find<HTMLButtonElement>('[data-bv="deal-buy"]', row),
    }
  })

  const refresh = () => {
    const stock = options.stock()
    const busy = options.pending() || !stock
    said.textContent = stock ? (options.said() ?? '') : copy('log.deal_offline')
    const cash = options.cash()
    const pack = options.pack()
    cashLine.textContent = copy('dealer.cash', { cash: formatCash(cash) })
    for (const row of goodRows) {
      const left = stock ? leftOf(stock, row.good.kind) : 0
      row.line.textContent = copy('dealer.good', {
        item: labelOf(row.good.kind),
        left,
        held: pack[row.good.kind] || 0,
      })
      // He sells no one a second key (dealer.ts deal).
      const held =
        itemById(row.good.kind)?.category === 'key' &&
        (pack[row.good.kind] ?? 0) > 0
      row.buy.disabled = busy || left < 1 || cash < row.good.price || held
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

    for (const row of goodRows) {
      row.buy.addEventListener('click', () => {
        if (!options.pending() && options.stock()) {
          options.onBuy(row.good.kind)
        }
        refresh()
      })
    }
    closeBtn.addEventListener('click', close)
    document.addEventListener('keydown', onKey)

    refresh()
    closeBtn.focus()
  })
}
