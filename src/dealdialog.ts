// Dealing with Erwin von Dutch, the squatter in Bull Valley Plaza
// (sharedworld.ts rule 25): a dialog over the valley, opened with E beside
// him (and from Dial-Up's lobby), in the frame the stand's shares
// (npcdialog.ts). It is a barter window as trading games lay one out: 01
// your side, what the pack holds that he takes, each with what one counts
// for and a stepper that puts units on the table; 02 his side, his goods,
// one picked, each with what he has left today and what it is worth to
// him; between them the table, what you give against what he asks on one
// meter, what is short or to spare, Even Up (dealer.ts evenUp: the offer
// filled and trimmed for you) and Trade, lit once the offer is even. His
// quest (quests.ts) has a tab of its own beside the barter, marked while
// it has a step to take with him, its three steps lit as they go, when he
// has one to give or to reward. The caller sends the frames; the dialog reads the
// game's state again every tick, so the valley's answers show as they land.

import { CONFIG } from './config.ts'
import { copy } from './copy.ts'
import {
  DEALER_GOODS,
  evenUp,
  goodOf,
  leftOf,
  offerWorth,
  payable,
  spareIn,
  unitWorth,
} from './dealer.ts'
import { el, finder } from './dom.ts'
import { itemLabel } from './itemcopy.ts'
import { npcFooter, npcHeader, sectionHead, setPips } from './npcdialog.ts'
import { formatCash } from './store.ts'
import type { DealerStock } from './dealer.ts'
import type { Inventory } from './interfaces.ts'

interface DealDialogOptions {
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
  // An item's still (itemthumbs.ts), as the pack shows it.
  icon: (kind: string) => Promise<string>
  onDeal: (kind: string, offer: Inventory) => void
  onQuest: () => void
}

// How often the readout is redrawn.
const TICK_MS = 250

// An item's still, filled in once the renderer draws it.
function iconOf(kind: string, icon: DealDialogOptions['icon']): HTMLElement {
  const img = el('img', 'bv-trade-icon')
  img.alt = ''
  img.dataset.kind = kind
  void icon(kind).then(
    (src) => {
      img.src = src
    },
    () => undefined
  )
  return img
}

// An item's name over what the pack holds of it.
function named(kind: string, held: HTMLElement): HTMLElement {
  const box = el('span', 'bv-trade-named')
  box.append(el('span', 'bv-trade-name', itemLabel(kind)), held)
  return box
}

// Mounts the dialog over everything and resolves once it is closed.
export function openDealDialog(options: DealDialogOptions): Promise<void> {
  const root = document.createElement('div')
  root.className = 'bv-account bv-npc bv-deal'
  root.setAttribute('role', 'dialog')
  root.setAttribute('aria-modal', 'true')
  root.setAttribute('aria-labelledby', 'bv-deal-title')
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
    <div class="bv-npc-ui bv-npc-ui--wide">
      ${npcHeader({
        titleId: 'bv-deal-title',
        title: copy('outfits.squatter'),
        eyebrow: copy('dealer.eyebrow'),
        where: copy('dealer.where'),
        status: `<span class="bv-npc-eyebrow bv-npc-tag">${copy('dealer.no_fiat')}</span>`,
        speech: true,
      })}
      <div class="bv-bag-tabs bv-deal-tabs" role="tablist" aria-label="${copy('outfits.squatter')}">
        <button type="button" class="bv-bag-tab" role="tab" data-bv="deal-tab-barter">${copy('dealer.tab_barter')}</button>
        <button type="button" class="bv-bag-tab" role="tab" data-bv="deal-tab-quest">${copy('dealer.tab_quest')}<span class="bv-deal-due" data-bv="deal-due"></span></button>
      </div>
      <section class="bv-npc-section" data-bv="deal-mine">
        ${sectionHead(copy('dealer.your_side'), 'deal-rate')}
        <div class="bv-trade-list" data-bv="deal-offer"></div>
        <div class="bv-npc-empty" data-bv="deal-none">
          <p class="bv-npc-say">${copy('dealer.nothing_to_pay')}</p>
          <span class="bv-npc-label">${copy('dealer.pay_hint')}</span>
        </div>
      </section>
      <section class="bv-npc-section bv-npc-side" data-bv="deal-his">
        ${sectionHead(copy('dealer.his_side'), 'deal-restocks')}
        <div class="bv-trade-list" role="radiogroup" aria-label="${copy('dealer.his_side')}" data-bv="deal-goods"></div>
        <div class="bv-trade-table" data-bv="deal-table">
          <div class="bv-trade-sums">
            <span class="bv-trade-sum">
              <span class="bv-npc-label">${copy('dealer.you_give')}</span>
              <b data-bv="deal-give"></b>
            </span>
            <span class="bv-trade-sum bv-npc-cell">
              <span class="bv-npc-label">${copy('dealer.he_asks')}</span>
              <b data-bv="deal-ask"></b>
            </span>
          </div>
          <div class="bv-trade-meter"><span data-bv="deal-meter"></span></div>
          <p class="bv-trade-state" data-bv="deal-state"></p>
          <div class="bv-trade-acts">
            <button type="button" class="bv-btn bv-npc-btn" data-bv="deal-clear">${copy('dealer.clear')}</button>
            <button type="button" class="bv-btn bv-npc-btn" data-bv="deal-even">${copy('dealer.even_up')}</button>
            <button type="button" class="bv-btn bv-npc-btn bv-btn--primary" data-bv="deal-go">${copy('dealer.trade')}</button>
          </div>
        </div>
      </section>
      <section class="bv-npc-section bv-deal-quest" data-bv="deal-quest">
        ${sectionHead(copy('quests.rose_title'), 'deal-prize')}
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
  const offerList = find<HTMLDivElement>('[data-bv="deal-offer"]')
  const payNone = find<HTMLDivElement>('[data-bv="deal-none"]')
  const goodsList = find<HTMLDivElement>('[data-bv="deal-goods"]')
  const give = find<HTMLElement>('[data-bv="deal-give"]')
  const ask = find<HTMLElement>('[data-bv="deal-ask"]')
  const meter = find<HTMLElement>('[data-bv="deal-meter"]')
  const table = find<HTMLElement>('[data-bv="deal-table"]')
  const state = find<HTMLParagraphElement>('[data-bv="deal-state"]')
  const clearBtn = find<HTMLButtonElement>('[data-bv="deal-clear"]')
  const evenBtn = find<HTMLButtonElement>('[data-bv="deal-even"]')
  const goBtn = find<HTMLButtonElement>('[data-bv="deal-go"]')
  const said = find<HTMLParagraphElement>('[data-bv="deal-said"]')
  const questBox = find<HTMLElement>('[data-bv="deal-quest"]')
  const questSteps = find<HTMLDivElement>('[data-bv="deal-steps"]')
  const questLine = find<HTMLParagraphElement>('[data-bv="deal-quest-line"]')
  const questGo = find<HTMLButtonElement>('[data-bv="deal-quest-go"]')
  const closeBtn = find<HTMLButtonElement>('[data-bv="deal-close"]')
  const barterTab = find<HTMLButtonElement>('[data-bv="deal-tab-barter"]')
  const questTab = find<HTMLButtonElement>('[data-bv="deal-tab-quest"]')
  const due = find<HTMLElement>('[data-bv="deal-due"]')
  const mine = find<HTMLElement>('[data-bv="deal-mine"]')
  const his = find<HTMLElement>('[data-bv="deal-his"]')
  // The barter, or his quest: one shows at a time.
  let tab: 'barter' | 'quest' = 'barter'
  barterTab.addEventListener('click', () => {
    tab = 'barter'
    refresh()
  })
  questTab.addEventListener('click', () => {
    tab = 'quest'
    refresh()
  })

  // His side: a row per good, picked as a radio.
  const goodRows = DEALER_GOODS.map((good) => {
    const row = el('button', 'bv-trade-row bv-trade-row--good')
    row.type = 'button'
    row.setAttribute('role', 'radio')
    row.dataset.good = good.kind
    const pips = el('span', 'bv-npc-pips')
    const held = el('small', 'bv-npc-label')
    row.append(
      iconOf(good.kind, options.icon),
      named(good.kind, held),
      pips,
      el('b', 'bv-trade-worth', formatCash(good.worth))
    )
    row.addEventListener('click', () => {
      want = good.kind
      refresh()
    })
    goodsList.append(row)
    return { good, row, pips, held }
  })

  // Your side: a row per kind the pack could pay with, rebuilt only when
  // that list changes.
  interface OfferRow {
    kind: string
    row: HTMLElement
    held: HTMLElement
    count: HTMLElement
    less: HTMLButtonElement
    more: HTMLButtonElement
  }
  let offerRows: OfferRow[] = []
  const stepper = (label: string, bv: string, step: number, kind: string) => {
    const button = el('button', 'bv-trade-step', label)
    button.type = 'button'
    button.dataset.bv = bv
    button.addEventListener('click', (e) => {
      const by = e.shiftKey ? step * 5 : step
      const held = options.pack()[kind] ?? 0
      const next = Math.max(0, Math.min(held, (offer[kind] ?? 0) + by))
      if (next > 0) offer[kind] = next
      else delete offer[kind]
      refresh()
    })
    return button
  }
  const buildOffer = (kinds: string[]) => {
    offerRows = kinds.map((kind) => {
      const row = el('div', 'bv-trade-row')
      row.dataset.kind = kind
      const held = el('small', 'bv-npc-label')
      const count = el('b', 'bv-trade-count')
      count.dataset.bv = 'deal-count'
      const less = stepper('−', 'deal-less', -1, kind)
      const more = stepper('+', 'deal-more', 1, kind)
      less.setAttribute('aria-label', copy('dealer.take_back'))
      more.setAttribute('aria-label', copy('dealer.put_down'))
      const steps = el('span', 'bv-trade-steps')
      steps.append(less, count, more)
      row.append(
        iconOf(kind, options.icon),
        named(kind, held),
        el('span', 'bv-trade-each', formatCash(unitWorth(kind))),
        steps
      )
      return { kind, row, held, count, less, more }
    })
    offerList.replaceChildren(...offerRows.map((r) => r.row))
  }

  // What is wanted, and what is on the table for it.
  let want: string = DEALER_GOODS[0].kind
  let offer: Inventory = {}
  let shown: string | null = null

  const refresh = () => {
    const stock = options.stock()
    const pending = options.pending()
    const busy = pending || !stock
    said.textContent = stock ? (options.said() ?? '') : copy('log.deal_offline')
    const pack = options.pack()
    const kinds = payable(pack)
    // The table never holds more than the pack does.
    for (const kind of Object.keys(offer)) {
      const count = Math.min(
        offer[kind] ?? 0,
        kinds.includes(kind) ? (pack[kind] ?? 0) : 0
      )
      if (count > 0) offer[kind] = count
      else delete offer[kind]
    }
    const key = kinds.join(',')
    if (key !== shown) {
      shown = key
      buildOffer(kinds)
    }
    offerList.hidden = kinds.length === 0
    payNone.hidden = kinds.length > 0

    // His side: the good picked, moved off one gone today.
    const left = (kind: string) => (stock ? leftOf(stock, kind) : 0)
    if (left(want) < 1) {
      want = DEALER_GOODS.find((g) => left(g.kind) > 0)?.kind ?? want
    }
    for (const row of goodRows) {
      const n = left(row.good.kind)
      setPips(row.pips, n, row.good.perDay)
      row.held.textContent =
        n < 1
          ? copy('dealer.sold_out_button')
          : copy('dealer.pay_held', { count: pack[row.good.kind] ?? 0 })
      row.row.classList.toggle('bv-npc-row--out', n < 1)
      row.row.setAttribute('aria-checked', String(row.good.kind === want))
      row.row.disabled = n < 1
    }

    // The table.
    const good = goodOf(want)
    const need = good?.worth ?? 0
    const worth = offerWorth(offer)
    const even = good !== null && worth >= need - 1e-6
    const spare = good && even ? spareIn(good, offer) : []
    const fill = good ? evenUp(good, pack, offer) : null
    give.textContent = formatCash(worth)
    ask.textContent = formatCash(need)
    meter.style.width = `${need > 0 ? Math.min(100, (worth / need) * 100) : 0}%`
    table.classList.toggle('bv-trade-table--even', even && spare.length === 0)
    table.classList.toggle('bv-trade-table--over', spare.length > 0)
    if (left(want) < 1) state.textContent = copy('dealer.sold_out')
    else if (worth <= 0) {
      state.textContent = fill
        ? copy('dealer.table_empty', { item: itemLabel(want) })
        : copy('dealer.cannot_cover', { item: itemLabel(want) })
    } else if (!even) {
      state.textContent = copy('dealer.table_short', {
        amount: formatCash(need - worth),
      })
    } else if (spare.length > 0) {
      state.textContent = copy('dealer.table_over', {
        item: itemLabel(spare[0]),
      })
    } else
      state.textContent = copy('dealer.table_even', { item: itemLabel(want) })

    for (const row of offerRows) {
      const held = pack[row.kind] ?? 0
      const on = offer[row.kind] ?? 0
      row.held.textContent = copy('dealer.pay_held', { count: held - on })
      row.count.textContent = String(on)
      row.row.classList.toggle('bv-trade-row--on', on > 0)
      row.less.disabled = busy || on < 1
      row.more.disabled = busy || on >= held || even
    }
    const same =
      fill !== null &&
      JSON.stringify(Object.entries(fill).sort()) ===
        JSON.stringify(Object.entries(offer).sort())
    clearBtn.disabled = busy || worth <= 0
    evenBtn.disabled = busy || fill === null || same || left(want) < 1
    goBtn.disabled = busy || !even || spare.length > 0 || left(want) < 1

    // His quest, on its own tab, marked while it has a step to take here.
    const quest = options.quest()
    if (quest === null) tab = 'barter'
    questTab.hidden = quest === null
    due.hidden = quest?.button == null
    barterTab.setAttribute('aria-selected', String(tab === 'barter'))
    questTab.setAttribute('aria-selected', String(tab === 'quest'))
    mine.hidden = tab !== 'barter'
    his.hidden = tab !== 'barter'
    questBox.hidden = tab !== 'quest'
    if (quest) {
      Array.from(questSteps.children).forEach((step, i) => {
        step.classList.toggle('bv-npc-step--done', i < quest.step)
        step.classList.toggle('bv-npc-step--now', i === quest.step)
      })
      questLine.textContent = quest.line
      questGo.hidden = quest.button === null
      questGo.textContent = quest.button ?? ''
      questGo.disabled = pending
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

    clearBtn.addEventListener('click', () => {
      offer = {}
      refresh()
    })
    evenBtn.addEventListener('click', () => {
      const good = goodOf(want)
      const fill = good ? evenUp(good, options.pack(), offer) : null
      if (fill) offer = fill
      refresh()
    })
    goBtn.addEventListener('click', () => {
      // The offer goes out and the table clears for the next.
      if (!options.pending() && options.stock()) {
        options.onDeal(want, offer)
        offer = {}
      }
      refresh()
    })
    questGo.addEventListener('click', () => {
      if (!options.pending()) options.onQuest()
      refresh()
    })
    closeBtn.addEventListener('click', close)
    document.addEventListener('keydown', onKey)

    refresh()
    closeBtn.focus({ preventScroll: true })
  })
}
