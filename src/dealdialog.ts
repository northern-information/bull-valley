// Dealing with Erwin von Dutch, the squatter in Bull Valley Plaza
// (sharedworld.ts rule 25): a dialog over the valley, opened with E beside
// him, in the frame the stand's shares (npcdialog.ts). He takes no cash,
// so 01 is what the pack could pay him with, one picked; 02 his goods
// (dealer.ts DEALER_GOODS), each with how many he has left today, how many
// the pack holds, and what one costs in the payment picked, with a Trade
// button that says what falls short; 03 his quest (quests.ts), its three
// steps lit as they go, when he has one to give or to reward. The
// caller sends the frames; the dialog reads the game's state again every
// tick, so the valley's answers show as they land.

import { CONFIG } from './config.ts'
import { copy } from './copy.ts'
import { costIn, DEALER_GOODS, leftOf, payable } from './dealer.ts'
import { el, finder } from './dom.ts'
import { itemLabel } from './itemcopy.ts'
import { npcFooter, npcHeader, sectionHead, setPips } from './npcdialog.ts'
import type { DealerStock } from './dealer.ts'
import type { Inventory } from './interfaces.ts'

export interface DealDialogOptions {
  // What he says as it opens.
  says: string
  // Read again every tick: his stock today (null when the valley is gone),
  // the pack, whether a deal is still unanswered, the last word on one,
  // and his quest as it stands for this raider (null with none to show):
  // his line, the button that takes the next step, and the step under way
  // (quests.ts roseProgress).
  stock: () => DealerStock | null
  pack: () => Inventory
  pending: () => boolean
  said: () => string | null
  quest: () => { line: string; button: string | null; step: number } | null
  onDeal: (kind: string, pay: string) => void
  onQuest: () => void
}

// How often the readout is redrawn.
const TICK_MS = 250

function labelOf(kind: string): string {
  return itemLabel(kind)
}

// Mounts the dialog over everything and resolves once it is closed.
export function openDealDialog(options: DealDialogOptions): Promise<void> {
  const root = document.createElement('div')
  root.className = 'bv-account bv-npc bv-deal'
  root.setAttribute('role', 'dialog')
  root.setAttribute('aria-modal', 'true')
  root.setAttribute('aria-labelledby', 'bv-deal-title')
  const rows = DEALER_GOODS.map(
    (good) => `
        <div class="bv-npc-grid bv-npc-row" data-good="${good.kind}">
          <span class="bv-npc-good bv-npc-c3">${labelOf(good.kind)}</span>
          <span class="bv-npc-left bv-npc-c2"><span class="bv-npc-pips" data-bv="deal-pips"></span><span class="bv-npc-label" data-bv="deal-left"></span></span>
          <span class="bv-npc-cell bv-npc-c2" data-bv="deal-held"></span>
          <span class="bv-npc-cell bv-npc-strong bv-npc-c2" data-bv="deal-cost"></span>
          <div class="bv-npc-act bv-npc-c3">
            <button type="button" class="bv-btn bv-npc-btn" data-bv="deal-buy"></button>
            <span class="bv-npc-why" data-bv="deal-why"></span>
          </div>
        </div>`
  ).join('')
  // The rose quest's three steps, each a name and where it happens.
  const steps = [
    [copy('quests.rose_step_take'), copy('quests.rose_step_take_where')],
    [copy('quests.rose_step_lay'), copy('quests.rose_step_lay_where')],
    [copy('quests.rose_step_key'), copy('quests.rose_step_key_where')],
  ]
    .map(
      ([name, where]) => `
        <div class="bv-npc-step">
          <span class="bv-npc-label">${name}</span>
          <span class="bv-npc-where">${where}</span>
        </div>`
    )
    .join('')
  root.innerHTML = `
    <div class="bv-npc-ui">
      ${npcHeader({
        titleId: 'bv-deal-title',
        title: copy('outfits.squatter'),
        eyebrow: copy('dealer.eyebrow'),
        where: copy('dealer.where'),
        status: `<span class="bv-npc-eyebrow bv-npc-tag">${copy('dealer.no_fiat')}</span>`,
        speech: true,
      })}
      <section class="bv-npc-section">
        ${sectionHead(1, copy('dealer.pay_with'), 'deal-rate')}
        <div class="bv-npc-chips" role="radiogroup" aria-label="${copy('dealer.pay_with')}" data-bv="deal-pay"></div>
        <div class="bv-npc-empty" data-bv="deal-none">
          <p class="bv-npc-say">${copy('dealer.nothing_to_pay')}</p>
          <span class="bv-npc-label">${copy('dealer.pay_hint')}</span>
        </div>
      </section>
      <section class="bv-npc-section">
        ${sectionHead(2, copy('dealer.goods'), 'deal-restocks')}
        <div class="bv-npc-table">
          <div class="bv-npc-grid bv-npc-row bv-npc-row--head">
            <span class="bv-npc-label bv-npc-c3">${copy('dealer.good')}</span>
            <span class="bv-npc-label bv-npc-c2">${copy('dealer.left')}</span>
            <span class="bv-npc-label bv-npc-cell bv-npc-c2">${copy('dealer.held')}</span>
            <span class="bv-npc-label bv-npc-cell bv-npc-c2">${copy('dealer.costs')}</span>
          </div>
          ${rows}
        </div>
      </section>
      <section class="bv-npc-section" data-bv="deal-quest">
        ${sectionHead(3, copy('quests.rose_title'), 'deal-prize')}
        <div class="bv-npc-steps" data-bv="deal-steps">${steps}</div>
        <div class="bv-npc-grid">
          <p class="bv-npc-say bv-npc-c8" data-bv="deal-quest-line"></p>
          <button type="button" class="bv-btn bv-npc-btn bv-btn--primary bv-npc-c4" data-bv="deal-quest-go"></button>
        </div>
      </section>
      ${npcFooter('deal-said', 'deal-close', copy('dealer.close'))}
    </div>`
  document.body.appendChild(root)

  const find = finder(root)
  find<HTMLParagraphElement>('[data-bv="npc-lede"]').textContent = options.says
  find<HTMLElement>('[data-bv="deal-rate"]').textContent = copy(
    'dealer.pay_rate',
    { percent: Math.round(CONFIG.dealer.rate * 100) }
  )
  find<HTMLElement>('[data-bv="deal-restocks"]').textContent =
    copy('dealer.restocks')
  find<HTMLElement>('[data-bv="deal-prize"]').textContent =
    copy('quests.rose_prize')
  const payRow = find<HTMLDivElement>('[data-bv="deal-pay"]')
  const payNone = find<HTMLDivElement>('[data-bv="deal-none"]')
  const said = find<HTMLParagraphElement>('[data-bv="deal-said"]')
  const questBox = find<HTMLElement>('[data-bv="deal-quest"]')
  const questSteps = find<HTMLDivElement>('[data-bv="deal-steps"]')
  const questLine = find<HTMLParagraphElement>('[data-bv="deal-quest-line"]')
  const questGo = find<HTMLButtonElement>('[data-bv="deal-quest-go"]')
  const closeBtn = find<HTMLButtonElement>('[data-bv="deal-close"]')
  const goodRows = DEALER_GOODS.map((good) => {
    const row = find<HTMLDivElement>(`[data-good="${good.kind}"]`)
    return {
      good,
      row,
      pips: find<HTMLElement>('[data-bv="deal-pips"]', row),
      left: find<HTMLElement>('[data-bv="deal-left"]', row),
      held: find<HTMLElement>('[data-bv="deal-held"]', row),
      cost: find<HTMLElement>('[data-bv="deal-cost"]', row),
      buy: find<HTMLButtonElement>('[data-bv="deal-buy"]', row),
      why: find<HTMLElement>('[data-bv="deal-why"]', row),
    }
  })
  for (const row of goodRows) row.buy.textContent = copy('dealer.trade')

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
    // The payment chips, rebuilt only when what the pack holds changes.
    const key = kinds.join(',')
    if (key !== shown) {
      shown = key
      payRow.replaceChildren(
        ...kinds.map((kind) => {
          const button = el('button', 'bv-npc-chip')
          button.type = 'button'
          button.setAttribute('role', 'radio')
          button.dataset.bv = 'deal-pay-kind'
          button.dataset.kind = kind
          button.append(el('b', '', labelOf(kind)), el('small'))
          button.addEventListener('click', () => {
            pay = kind
            refresh()
          })
          return button
        })
      )
    }
    payRow.hidden = kinds.length === 0
    payNone.hidden = kinds.length > 0
    for (const button of payRow.querySelectorAll<HTMLButtonElement>('button')) {
      const kind = button.dataset.kind ?? ''
      find<HTMLElement>('small', button).textContent = copy('dealer.pay_held', {
        count: pack[kind] ?? 0,
      })
      button.setAttribute('aria-checked', String(kind === pay))
      button.disabled = options.pending()
    }
    for (const row of goodRows) {
      const left = stock ? leftOf(stock, row.good.kind) : 0
      setPips(row.pips, left, row.good.perDay)
      row.left.textContent = String(left)
      row.held.textContent = String(pack[row.good.kind] || 0)
      const cost = pay === null ? null : costIn(row.good, pay)
      const held = pay === null ? 0 : (pack[pay] ?? 0)
      const short = cost !== null && held < cost ? cost - held : 0
      row.cost.textContent =
        cost === null ? copy('dealer.no_cost') : String(cost)
      row.cost.classList.toggle('bv-npc-short', short > 0 && left > 0)
      row.row.classList.toggle('bv-npc-row--out', left < 1)
      row.buy.textContent =
        left < 1 ? copy('dealer.sold_out_button') : copy('dealer.trade')
      row.why.textContent =
        short > 0 && left > 0 ? copy('dealer.short_by', { count: short }) : ''
      row.buy.disabled = busy || left < 1 || cost === null || short > 0
    }
    const quest = options.quest()
    questBox.hidden = quest === null
    if (quest) {
      Array.from(questSteps.children).forEach((step, i) => {
        step.classList.toggle('bv-npc-step--done', i < quest.step)
        step.classList.toggle('bv-npc-step--now', i === quest.step)
      })
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
