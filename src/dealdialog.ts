// Dealing with Erwin von Dutch, the squatter in Bull Valley Plaza
// (sharedworld.ts rule 24): a small dialog over the valley, opened with E
// beside him, like the stand's. He takes no cash, so it starts with what
// the pack could pay him with: pick one, and each of his goods (dealer.ts
// DEALER_GOODS) shows how many of it he wants, how many he has left
// today, and how many the pack holds; a button trades for one. Below his
// goods, his quest (quests.ts), when he has one to give or to reward. The
// caller sends the frames; the dialog reads the game's state again every
// tick, so the valley's answers show as they land.

import { copy } from './copy.ts'
import { costIn, DEALER_GOODS, leftOf, payable } from './dealer.ts'
import { containersOf, itemById } from './items.ts'
import type { DealerStock } from './dealer.ts'
import type { Inventory } from './interfaces.ts'

export interface DealDialogOptions {
  // What he says as it opens.
  says: string
  // Read again every tick: his stock today (null when the valley is gone),
  // the pack, whether a deal is still unanswered, the last word on one,
  // and his quest as it stands for this raider (null with none to show).
  stock: () => DealerStock | null
  pack: () => Inventory
  pending: () => boolean
  said: () => string | null
  quest: () => { line: string; button: string | null } | null
  onDeal: (kind: string, pay: string) => void
  onQuest: () => void
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
            <button type="button" class="bv-btn" data-bv="deal-buy"></button>
          </div>
        </div>`
  ).join('')
  root.innerHTML = `
    <div class="bv-account-ui bv-stand-ui">
      <h2 id="bv-deal-title">${copy('outfits.squatter')}</h2>
      <p class="bv-account-lede bv-stand-says" data-bv="deal-says"></p>
      <h3>${copy('dealer.pay_with')}</h3>
      <div class="bv-select-actions" data-bv="deal-pay"></div>
      ${rows}
      <div data-bv="deal-quest">
        <p data-bv="deal-quest-line"></p>
        <button type="button" class="bv-btn bv-btn--primary" data-bv="deal-quest-go"></button>
      </div>
      <p class="bv-account-status" data-bv="deal-said" aria-live="polite"></p>
      <button type="button" class="bv-btn" data-bv="deal-close">${copy('dealer.close')}</button>
    </div>`
  document.body.appendChild(root)

  const find = <T extends Element>(selector: string, from: Element = root) => {
    const found = from.querySelector<T>(selector)
    if (!found) throw new Error(`Missing ${selector}`)
    return found
  }
  find<HTMLParagraphElement>('[data-bv="deal-says"]').textContent = options.says
  const payRow = find<HTMLDivElement>('[data-bv="deal-pay"]')
  const said = find<HTMLParagraphElement>('[data-bv="deal-said"]')
  const questBox = find<HTMLDivElement>('[data-bv="deal-quest"]')
  const questLine = find<HTMLParagraphElement>('[data-bv="deal-quest-line"]')
  const questGo = find<HTMLButtonElement>('[data-bv="deal-quest-go"]')
  const closeBtn = find<HTMLButtonElement>('[data-bv="deal-close"]')
  const goodRows = DEALER_GOODS.map((good) => {
    const row = find<HTMLDivElement>(`[data-good="${good.kind}"]`)
    return {
      good,
      line: find<HTMLParagraphElement>('[data-bv="deal-line"]', row),
      buy: find<HTMLButtonElement>('[data-bv="deal-buy"]', row),
    }
  })

  // What pays: the kind picked, kept while the pack still holds it, else
  // the first it holds.
  let pay: string | null = null
  let shown: string | null = null
  const refresh = () => {
    const stock = options.stock()
    const busy = options.pending() || !stock
    said.textContent = stock ? (options.said() ?? '') : copy('log.deal_offline')
    const pack = options.pack()
    const kinds = payable(pack)
    if (pay === null || !kinds.includes(pay)) pay = kinds[0] ?? null
    // The payment buttons, rebuilt only when what the pack holds changes.
    const key = kinds.join(',')
    if (key !== shown) {
      shown = key
      payRow.replaceChildren(
        ...kinds.map((kind) => {
          const button = document.createElement('button')
          button.type = 'button'
          button.className = 'bv-btn'
          button.dataset.bv = 'deal-pay-kind'
          button.dataset.kind = kind
          button.addEventListener('click', () => {
            pay = kind
            refresh()
          })
          return button
        })
      )
      if (kinds.length === 0) {
        const none = document.createElement('p')
        none.textContent = copy('dealer.nothing_to_pay')
        payRow.append(none)
      }
    }
    for (const button of payRow.querySelectorAll<HTMLButtonElement>('button')) {
      const kind = button.dataset.kind ?? ''
      button.textContent = copy('dealer.pay_kind', {
        item: labelOf(kind),
        count: containersOf(kind, pack[kind] ?? 0),
      })
      button.setAttribute('aria-pressed', String(kind === pay))
      button.disabled = options.pending()
    }
    for (const row of goodRows) {
      const left = stock ? leftOf(stock, row.good.kind) : 0
      row.line.textContent = copy('dealer.good', {
        item: labelOf(row.good.kind),
        left,
        held: pack[row.good.kind] || 0,
      })
      const cost = pay === null ? null : costIn(row.good, pay)
      row.buy.textContent =
        pay === null || cost === null
          ? copy('dealer.trade_nothing', { item: labelOf(row.good.kind) })
          : copy('dealer.trade', {
              item: labelOf(row.good.kind),
              count: cost,
              pay: labelOf(pay),
            })
      const held = pay === null ? 0 : (pack[pay] ?? 0)
      row.buy.disabled = busy || left < 1 || cost === null || held < cost
    }
    const quest = options.quest()
    questBox.hidden = quest === null
    if (quest) {
      questLine.textContent = quest.line
      questGo.hidden = quest.button === null
      questGo.textContent = quest.button ?? ''
      questGo.disabled = options.pending()
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
        if (pay && !options.pending() && options.stock()) {
          options.onDeal(row.good.kind, pay)
        }
        refresh()
      })
    }
    questGo.addEventListener('click', () => {
      if (!options.pending()) options.onQuest()
      refresh()
    })
    closeBtn.addEventListener('click', close)
    document.addEventListener('keydown', onKey)

    refresh()
    closeBtn.focus()
  })
}
