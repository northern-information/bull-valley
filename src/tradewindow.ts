// The trade window, one for every trader (Erwin von Dutch's barter,
// dealdialog.ts; Moab Coldë's, moabdialog.ts): a dialog over the valley,
// in the frame the stand's shares (npcdialog.ts), laid out as trading
// games lay one out. Your side lists what the pack holds that the trader
// takes, each with its still, what one unit counts for and a stepper that
// puts units on the table (Shift for five); his side lists his goods, one
// picked, each with a note under its name, what he has left today when he
// keeps a stock, and its worth; between them the table weighs what you
// give against what he asks on one meter, says what is short or to spare
// (no trader makes change: barter.ts), and offers Clear, Even Up (the
// offer filled out of the pack and trimmed) and Trade, lit once the offer
// is even. A trader with a quest has it on a tab beside the trade, marked
// while it has a step to take with him; a trader with more to do than
// trade has it on a tab of its own (Moab's Your Character, lookpanel.ts). The caller sends the frames; the
// window reads the game's state again every tick, so the valley's answers
// show as they land. The item picked, or the row under the pointer,
// turns in the table as the pack's card turns the hovered one
// (itemthumbs.ts). Every trade is a big deal (tradefanfare.ts): its
// banner swept across the window and fireflies burst over it, as a fish
// landed has (catchfanfare.ts, catchburst.ts).

import { evenUp, offerWorth, payable, spareIn } from './barter.ts'
import { burst } from './catchburst.ts'
import { copy } from './copy.ts'
import { el, finder } from './dom.ts'
import { itemLabel } from './itemcopy.ts'
import {
  closesDialog,
  npcFooter,
  npcHeader,
  questParts,
  questSection,
  sectionHead,
  setPips,
  showQuest,
} from './npcdialog.ts'
import type { WorthOf } from './barter.ts'
import type { Fanfare } from './catchfanfare.ts'
import type { Inventory } from './interfaces.ts'
import type { QuestShown } from './npcdialog.ts'

// One of the trader's goods.
export interface TradeGood {
  id: string
  label: string
  // The item whose still it shows, if it is one.
  kind?: string
  // What he asks for it, in his measure (TradeWindowOptions.worthOf).
  worth: number
  // Read every tick: the line under its name, what he has left of it
  // today (null for a good he never runs out of), and why it cannot be
  // had now (sold out, already yours), or null.
  note: () => string
  left: () => { now: number; of: number } | null
  out: () => string | null
}

// The trader's quest, as its tab shows it: read every tick (null with
// none to show), so the quest he speaks of can change while it is open.
interface TradeQuest {
  now: () => QuestShown | null
  onStep: () => void
}

// A tab of the trader's own beside the trade: its name, and what fills
// its box the first time it is picked, returning what takes it down as the
// window closes (a promise, for a panel loaded on its own: dial3d.ts).
export interface TradePanel {
  tab: string
  mount: (box: HTMLElement) => Promise<() => void>
}

export interface TradeWindowOptions {
  // The root's own class, beside .bv-trade (bv-deal, bv-moab).
  name: string
  title: string
  eyebrow: string
  where: string
  tag: string
  // What he says as it opens.
  says: string
  // The trade's tab, and the meta lines of the two sides.
  tab: string
  mineMeta: string
  hisMeta: string
  // What shows when the pack holds nothing he takes.
  nothing: string
  nothingHint: string
  goods: readonly TradeGood[]
  // What one unit counts for with him (zero: he does not take it), and
  // that measure as the window prints it.
  worthOf: WorthOf
  // A trader paid in cash (a Citgo's shelves): read every tick, the
  // wallet, in his measure. Your side is then the wallet alone, and the
  // table weighs it against his price: cash pays to the cent, so there is
  // nothing to put down, clear or even up.
  cash?: () => number
  format: (worth: number) => string
  // The good picked as it opens, or null for the first to be had.
  pick: string | null
  // Read again every tick: whether he is there to trade (the valley is),
  // the pack, whether an ask is still unanswered, and the last word.
  open: () => boolean
  pack: () => Inventory
  pending: () => boolean
  said: () => string | null
  // An item's still (itemthumbs.ts), as the pack shows it.
  icon: (kind: string) => Promise<string>
  onTrade: (good: string, offer: Inventory) => void
  quest?: TradeQuest
  panel?: TradePanel
  // The last trade made a big deal of: a new one sweeps its banner
  // across the window, bursts fireflies over it and is cheered. One
  // already there as the window opens is old news.
  fanfare: TradeCheer
  // The renderer that turns an item on a canvas, the pack card's
  // (itemthumbs.ts spin and stop).
  turntable: Turntable
}

export interface Turntable {
  spin: (canvas: HTMLCanvasElement, kind: string) => void
  stop: () => void
}

// Read every tick: the last trade made a big deal of (tradefanfare.ts),
// or null; and its cheer (the fanfare, a phone's buzz).
export interface TradeCheer {
  now: () => Fanfare | null
  cheer: (fanfare: Fanfare) => void
}

// The turntable's size, CSS px: the pack card's (packhud.ts).
const VIEW_PX = 112

// How often the readout is redrawn.
const TICK_MS = 250

// An item's still, filled in once the renderer draws it; an empty frame
// for a good that is not an item.
function iconOf(
  kind: string | undefined,
  icon: TradeWindowOptions['icon']
): HTMLElement {
  const img = el('img', 'bv-trade-icon')
  img.alt = ''
  if (!kind) return img
  img.dataset.kind = kind
  void icon(kind).then(
    (src) => {
      img.src = src
    },
    () => undefined
  )
  return img
}

// A name over a note.
function named(name: string, note: HTMLElement): HTMLElement {
  const box = el('span', 'bv-trade-named')
  box.append(el('span', 'bv-trade-name', name), note)
  return box
}

// The same units, in any order.
function sameOffer(a: Inventory, b: Inventory): boolean {
  const keys = Object.keys(a)
  return (
    keys.length === Object.keys(b).length &&
    keys.every((kind) => a[kind] === b[kind])
  )
}

// Mounts the window over everything and resolves once it is closed.
export function openTradeWindow(options: TradeWindowOptions): Promise<void> {
  const { worthOf, format, quest, panel } = options
  const root = document.createElement('div')
  root.className = `bv-account bv-npc bv-trade ${options.name}`
  if (options.cash) root.classList.add('bv-trade--cash')
  root.setAttribute('role', 'dialog')
  root.setAttribute('aria-modal', 'true')
  root.setAttribute('aria-labelledby', 'bv-trade-title')
  const questTab = quest
    ? `<button type="button" class="bv-bag-tab" role="tab" data-bv="trade-tab-quest">${copy('trade.tab_quest')}<span class="bv-trade-due" data-bv="trade-due"></span></button>`
    : ''
  const questBox = quest ? questSection('trade') : ''
  const panelTab = panel
    ? `<button type="button" class="bv-bag-tab" role="tab" data-bv="trade-tab-panel">${panel.tab}</button>`
    : ''
  const panelSection = panel
    ? `<section class="bv-npc-section bv-trade-panel" data-bv="trade-panel" hidden></section>`
    : ''
  root.innerHTML = `
    <div class="bv-npc-ui bv-npc-ui--wide">
      ${npcHeader({
        titleId: 'bv-trade-title',
        title: options.title,
        eyebrow: options.eyebrow,
        where: options.where,
        status: `<span class="bv-npc-eyebrow bv-npc-tag">${options.tag}</span>`,
        speech: true,
      })}
      <div class="bv-bag-tabs bv-trade-tabs" role="tablist" aria-label="${options.title}">
        <button type="button" class="bv-bag-tab" role="tab" data-bv="trade-tab-trade">${options.tab}</button>
        ${questTab}
        ${panelTab}
      </div>
      <section class="bv-npc-section" data-bv="trade-mine">
        ${sectionHead(copy('trade.your_side'), 'trade-mine-meta')}
        <div class="bv-trade-list" data-bv="trade-offer"></div>
        <div class="bv-trade-wallet" data-bv="trade-wallet-box">
          <span class="bv-npc-label">${copy('trade.wallet')}</span>
          <b data-bv="trade-wallet"></b>
        </div>
        <div class="bv-npc-empty" data-bv="trade-none">
          <p class="bv-npc-say">${options.nothing}</p>
          <span class="bv-npc-label">${options.nothingHint}</span>
        </div>
      </section>
      <section class="bv-npc-section bv-npc-side" data-bv="trade-his">
        ${sectionHead(copy('trade.his_side'), 'trade-his-meta')}
        <div class="bv-trade-list" role="radiogroup" aria-label="${copy('trade.his_side')}" data-bv="trade-goods"></div>
        <div class="bv-trade-table" data-bv="trade-table">
          <canvas class="bv-trade-view" data-bv="trade-view" aria-hidden="true"></canvas>
          <div class="bv-trade-sums">
            <span class="bv-trade-sum">
              <span class="bv-npc-label">${copy('trade.you_give')}</span>
              <b data-bv="trade-give"></b>
            </span>
            <span class="bv-trade-sum bv-npc-cell">
              <span class="bv-npc-label">${copy('trade.he_asks')}</span>
              <b data-bv="trade-ask"></b>
            </span>
          </div>
          <div class="bv-trade-meter"><span data-bv="trade-meter"></span></div>
          <p class="bv-trade-state" data-bv="trade-state"></p>
          <div class="bv-trade-acts">
            <button type="button" class="bv-btn bv-npc-btn" data-bv="trade-clear">${copy('trade.clear')}</button>
            <button type="button" class="bv-btn bv-npc-btn" data-bv="trade-even">${copy('trade.even_up')}</button>
            <button type="button" class="bv-btn bv-npc-btn bv-btn--primary" data-bv="trade-go">${copy('trade.trade')}</button>
          </div>
        </div>
      </section>
      ${questBox}
      ${panelSection}
      ${npcFooter('trade-said', 'trade-close', copy('trade.close'))}
    </div>`
  // The banner a big deal sweeps across the window (fanfare).
  const banner = el('div', 'bv-banner')
  banner.setAttribute('role', 'status')
  banner.hidden = true
  root.append(banner)
  document.body.appendChild(root)

  const find = finder(root)
  find<HTMLParagraphElement>('[data-bv="npc-lede"]').textContent = options.says
  find<HTMLElement>('[data-bv="trade-mine-meta"]').textContent =
    options.mineMeta
  find<HTMLElement>('[data-bv="trade-his-meta"]').textContent = options.hisMeta
  const offerList = find<HTMLDivElement>('[data-bv="trade-offer"]')
  const payNone = find<HTMLDivElement>('[data-bv="trade-none"]')
  const walletBox = find<HTMLElement>('[data-bv="trade-wallet-box"]')
  const wallet = find<HTMLElement>('[data-bv="trade-wallet"]')
  const cash = options.cash
  walletBox.hidden = !cash
  const goodsList = find<HTMLDivElement>('[data-bv="trade-goods"]')
  const give = find<HTMLElement>('[data-bv="trade-give"]')
  const ask = find<HTMLElement>('[data-bv="trade-ask"]')
  const meter = find<HTMLElement>('[data-bv="trade-meter"]')
  const table = find<HTMLElement>('[data-bv="trade-table"]')
  const state = find<HTMLParagraphElement>('[data-bv="trade-state"]')
  const clearBtn = find<HTMLButtonElement>('[data-bv="trade-clear"]')
  const evenBtn = find<HTMLButtonElement>('[data-bv="trade-even"]')
  const goBtn = find<HTMLButtonElement>('[data-bv="trade-go"]')
  const said = find<HTMLParagraphElement>('[data-bv="trade-said"]')
  // Drawn at the screen's own density; the stylesheet sets its CSS size.
  const view = find<HTMLCanvasElement>('[data-bv="trade-view"]')
  view.width = view.height = Math.round(VIEW_PX * window.devicePixelRatio)
  const closeBtn = find<HTMLButtonElement>('[data-bv="trade-close"]')
  const tradeTab = find<HTMLButtonElement>('[data-bv="trade-tab-trade"]')
  const mine = find<HTMLElement>('[data-bv="trade-mine"]')
  const his = find<HTMLElement>('[data-bv="trade-his"]')

  // The trade, his quest, or his own tab: one shows at a time.
  let tab: 'trade' | 'quest' | 'panel' = 'trade'
  tradeTab.addEventListener('click', () => {
    tab = 'trade'
    refresh()
  })
  const questBits = quest && {
    tab: find<HTMLButtonElement>('[data-bv="trade-tab-quest"]'),
    due: find<HTMLElement>('[data-bv="trade-due"]'),
    parts: questParts(root, 'trade'),
  }
  if (quest && questBits) {
    questBits.tab.addEventListener('click', () => {
      tab = 'quest'
      refresh()
    })
    questBits.parts.go.addEventListener('click', () => {
      if (!options.pending()) quest.onStep()
      refresh()
    })
  }

  // His own tab, filled the first time it is picked and taken down as the
  // window closes, even if it is still loading then.
  let closed = false
  let unmount: (() => void) | null = null
  const panelParts = panel && {
    tab: find<HTMLButtonElement>('[data-bv="trade-tab-panel"]'),
    box: find<HTMLElement>('[data-bv="trade-panel"]'),
  }
  if (panel && panelParts) {
    let mounting = false
    panelParts.tab.addEventListener('click', () => {
      tab = 'panel'
      refresh()
      if (mounting) return
      mounting = true
      void panel.mount(panelParts.box).then((down) => {
        if (closed) down()
        else unmount = down
      })
    })
  }

  // The item under the pointer turns in place of the one picked. A row
  // taken off the page (the pay side redrawn after a trade) never hears
  // the pointer leave, so it turns nothing once it is gone.
  let hovered: { row: HTMLElement; kind: string } | null = null
  const turnsOnHover = (row: HTMLElement, kind: string | undefined) => {
    if (!kind) return
    row.addEventListener('pointerenter', () => {
      hovered = { row, kind }
      refresh()
    })
    row.addEventListener('pointerleave', () => {
      if (hovered?.row === row) hovered = null
      refresh()
    })
  }
  const hoveredKind = () => (hovered?.row.isConnected ? hovered.kind : null)

  // His side: a row per good, picked as a radio.
  const goodRows = options.goods.map((good) => {
    const row = el('button', 'bv-trade-row bv-trade-row--good')
    row.type = 'button'
    row.setAttribute('role', 'radio')
    row.dataset.good = good.id
    const note = el('small', 'bv-npc-label')
    const pips = el('span', 'bv-npc-pips')
    row.append(
      iconOf(good.kind, options.icon),
      named(good.label, note),
      pips,
      el('b', 'bv-trade-worth', format(good.worth))
    )
    row.addEventListener('click', () => {
      want = good.id
      refresh()
    })
    turnsOnHover(row, good.kind)
    goodsList.append(row)
    return { good, row, pips, note }
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
      count.dataset.bv = 'trade-count'
      const less = stepper('−', 'trade-less', -1, kind)
      const more = stepper('+', 'trade-more', 1, kind)
      less.setAttribute('aria-label', copy('trade.take_back'))
      more.setAttribute('aria-label', copy('trade.put_down'))
      const steps = el('span', 'bv-trade-steps')
      steps.append(less, count, more)
      row.append(
        iconOf(kind, options.icon),
        named(itemLabel(kind), held),
        el('span', 'bv-trade-each', format(worthOf(kind))),
        steps
      )
      turnsOnHover(row, kind)
      return { kind, row, held, count, less, more }
    })
    offerList.replaceChildren(...offerRows.map((r) => r.row))
  }

  // What is wanted, and what is on the table for it: nothing, when he has
  // no goods at all (a shelf not yet heard of).
  const firstOpen = () =>
    options.goods.find((g) => g.out() === null)?.id ??
    options.goods[0]?.id ??
    ''
  let want: string = options.pick ?? firstOpen()
  let offer: Inventory = {}
  let shown: string | null = null
  let cheered = options.fanfare.now() ?? null

  // A trade made a big deal of, as dialfish.ts makes a fish landed.
  const celebrate = (fanfare: Fanfare) => {
    banner.replaceChildren(
      el('p', 'bv-banner-kicker', fanfare.kicker),
      el('p', 'bv-banner-headline', fanfare.headline)
    )
    if (fanfare.detail) {
      banner.append(el('p', 'bv-banner-detail', fanfare.detail))
    }
    banner.classList.toggle('bv-banner--gold', fanfare.gold)
    banner.hidden = false
    // Restart the sweep, for a second trade before the first's is done.
    banner.classList.remove('bv-banner--on')
    void banner.offsetWidth
    banner.classList.add('bv-banner--on')
    burst(root, fanfare)
    options.fanfare.cheer(fanfare)
  }

  // What the turntable shows (undefined until the first refresh), started
  // again only when it changes; a good that is no item (a cosmetic)
  // leaves it empty.
  let turning: string | null | undefined
  const turn = (kind: string | null) => {
    if (kind === turning) return
    turning = kind
    view.hidden = kind === null
    if (kind) options.turntable.spin(view, kind)
    else options.turntable.stop()
  }

  const refresh = () => {
    const fanfare = options.fanfare.now() ?? null
    if (fanfare && fanfare !== cheered) {
      cheered = fanfare
      celebrate(fanfare)
    }
    const open = options.open()
    const pending = options.pending()
    const busy = pending || !open
    said.textContent = open ? (options.said() ?? '') : copy('trade.offline')
    const pack = options.pack()
    const kinds = payable(pack, worthOf)
    // The table never holds more than the pack does.
    for (const kind of Object.keys(offer)) {
      const count = kinds.includes(kind)
        ? Math.min(offer[kind] ?? 0, pack[kind] ?? 0)
        : 0
      if (count > 0) offer[kind] = count
      else delete offer[kind]
    }
    const key = kinds.join(',')
    if (key !== shown) {
      shown = key
      buildOffer(kinds)
    }
    offerList.hidden = !!cash || kinds.length === 0
    payNone.hidden = !!cash || kinds.length > 0
    const held = cash?.() ?? 0
    if (cash) wallet.textContent = format(held)

    // His side: the good picked, moved off one that cannot be had.
    const picked = options.goods.find((g) => g.id === want)
    if (!picked || picked.out() !== null) want = firstOpen()
    for (const row of goodRows) {
      const left = row.good.left()
      row.pips.hidden = left === null
      if (left) setPips(row.pips, left.now, left.of)
      const out = row.good.out()
      row.note.textContent = row.good.note()
      row.row.classList.toggle('bv-npc-row--out', out !== null)
      row.row.setAttribute('aria-checked', String(row.good.id === want))
      row.row.disabled = out !== null
    }

    // The table, the item in it turning.
    const good = options.goods.find((g) => g.id === want) ?? null
    turn(hoveredKind() ?? good?.kind ?? null)
    const out = good?.out() ?? null
    const need = good?.worth ?? 0
    const worth = cash ? Math.min(held, need) : offerWorth(offer, worthOf)
    const even = good !== null && worth >= need - 1e-6
    const spare = even && !cash ? spareIn(need, offer, worthOf) : []
    const fill = good && !cash ? evenUp(need, pack, offer, worthOf) : null
    const label = good?.label ?? ''
    give.textContent = format(worth)
    ask.textContent = format(need)
    meter.style.width = `${need > 0 ? Math.min(100, (worth / need) * 100) : 0}%`
    table.classList.toggle('bv-trade-table--even', even && spare.length === 0)
    table.classList.toggle('bv-trade-table--over', spare.length > 0)
    if (out !== null) state.textContent = out
    else if (worth <= 0 && !cash) {
      state.textContent = fill
        ? copy('trade.table_empty', { item: label })
        : copy('trade.cannot_cover', { item: label })
    } else if (!even) {
      state.textContent = copy('trade.table_short', {
        amount: format(need - worth),
      })
    } else if (spare.length > 0) {
      state.textContent = copy('trade.table_over', {
        item: itemLabel(spare[0]),
      })
    } else state.textContent = copy('trade.table_even', { item: label })

    for (const row of offerRows) {
      const held = pack[row.kind] ?? 0
      const on = offer[row.kind] ?? 0
      row.held.textContent = copy('trade.in_pack', { count: held - on })
      row.count.textContent = String(on)
      row.row.classList.toggle('bv-trade-row--on', on > 0)
      row.less.disabled = busy || on < 1
      row.more.disabled = busy || on >= held || even
    }
    clearBtn.hidden = !!cash
    evenBtn.hidden = !!cash
    clearBtn.disabled = busy || worth <= 0
    evenBtn.disabled =
      busy || fill === null || sameOffer(fill, offer) || out !== null
    goBtn.disabled = busy || !even || spare.length > 0 || out !== null

    // His quest, on its own tab, marked while it has a step to take here.
    const now = quest?.now() ?? null
    if (now === null && tab === 'quest') tab = 'trade'
    tradeTab.setAttribute('aria-selected', String(tab === 'trade'))
    mine.hidden = tab !== 'trade'
    his.hidden = tab !== 'trade'
    if (questBits) {
      questBits.tab.hidden = now === null
      questBits.due.hidden = now?.button == null
      questBits.tab.setAttribute('aria-selected', String(tab === 'quest'))
      questBits.parts.box.hidden = tab !== 'quest'
      if (now) showQuest(questBits.parts, now, pending)
    }
    if (panelParts) {
      panelParts.tab.setAttribute('aria-selected', String(tab === 'panel'))
      panelParts.box.hidden = tab !== 'panel'
    }
  }

  return new Promise<void>((resolve) => {
    // The game listens on the document too, and pointer lock is off while
    // the window is open, so its keys do nothing; E, the key that opened
    // it, closes it, as every dialog's does (npcdialog.ts closesDialog).
    const onKey = (e: KeyboardEvent) => {
      if (!closesDialog(e)) return
      e.preventDefault()
      close()
    }
    const timer = setInterval(refresh, TICK_MS)

    function close(): void {
      clearInterval(timer)
      options.turntable.stop()
      closed = true
      unmount?.()
      document.removeEventListener('keydown', onKey)
      root.remove()
      resolve()
    }

    clearBtn.addEventListener('click', () => {
      offer = {}
      refresh()
    })
    evenBtn.addEventListener('click', () => {
      const good = options.goods.find((g) => g.id === want)
      const fill = good
        ? evenUp(good.worth, options.pack(), offer, worthOf)
        : null
      if (fill) offer = fill
      refresh()
    })
    goBtn.addEventListener('click', () => {
      // The offer goes out and the table clears for the next.
      if (!options.pending() && options.open()) {
        options.onTrade(want, offer)
        offer = {}
      }
      refresh()
    })
    closeBtn.addEventListener('click', close)
    document.addEventListener('keydown', onKey)

    refresh()
    // The good picked as it opens is in view in his list.
    const picked = goodRows.find((row) => row.good.id === want)?.row
    if (picked) {
      goodsList.scrollTop =
        picked.offsetTop - (goodsList.clientHeight - picked.offsetHeight) / 2
    }
    closeBtn.focus({ preventScroll: true })
  })
}
