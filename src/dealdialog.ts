// Dealing with Erwin von Dutch, the squatter in Bull Valley Plaza
// (sharedworld.ts rule 25): the trade window (tradewindow.ts), opened with
// E beside him and from Dial-Up's lobby. He takes no cash, so it counts
// each unit at a little under its shelf price (dealer.ts unitWorth) and
// prints that in cents; his goods (dealer.ts DEALER_GOODS) show what he
// has left today; his rose quest (quests.ts) has its tab.

import { CONFIG } from './config.ts'
import { copy } from './copy.ts'
import { DEALER_GOODS, leftOf, unitWorth } from './dealer.ts'
import { itemLabel } from './itemcopy.ts'
import { formatCash } from './store.ts'
import { openTradeWindow } from './tradewindow.ts'
import type { DealerStock } from './dealer.ts'
import type { Inventory } from './interfaces.ts'
import type { TradeCheer } from './tradewindow.ts'

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
  icon: (kind: string) => Promise<string>
  onDeal: (kind: string, offer: Inventory) => void
  onQuest: () => void
  // The last trade made a big deal of, and its cheer (tradewindow.ts).
  fanfare: TradeCheer
}

// Mounts his window over everything and resolves once it is closed.
export function openDealDialog(options: DealDialogOptions): Promise<void> {
  const left = (kind: string) => {
    const stock = options.stock()
    return stock ? leftOf(stock, kind) : 0
  }
  return openTradeWindow({
    name: 'bv-deal',
    title: copy('outfits.squatter'),
    eyebrow: copy('dealer.eyebrow'),
    where: copy('dealer.where'),
    tag: copy('dealer.no_fiat'),
    says: options.says,
    tab: copy('dealer.eyebrow'),
    mineMeta: copy('dealer.pay_rate', {
      percent: Math.round(CONFIG.dealer.rate * 100),
    }),
    hisMeta: copy('trade.restocks'),
    nothing: copy('dealer.nothing_to_pay'),
    nothingHint: copy('dealer.pay_hint'),
    goods: DEALER_GOODS.map((good) => ({
      id: good.kind,
      kind: good.kind,
      label: itemLabel(good.kind),
      worth: good.worth,
      note: () =>
        left(good.kind) < 1
          ? copy('dealer.sold_out_button')
          : copy('trade.in_pack', { count: options.pack()[good.kind] ?? 0 }),
      left: () => ({ now: left(good.kind), of: good.perDay }),
      out: () => (left(good.kind) < 1 ? copy('dealer.sold_out') : null),
    })),
    worthOf: (kind) => unitWorth(kind),
    format: formatCash,
    pick: null,
    open: () => options.stock() !== null,
    pack: options.pack,
    pending: options.pending,
    said: options.said,
    icon: options.icon,
    fanfare: options.fanfare,
    onTrade: options.onDeal,
    quest: {
      title: copy('quests.rose_title'),
      prize: copy('quests.rose_prize'),
      steps: [
        [copy('quests.rose_step_take'), copy('quests.rose_step_take_where')],
        [copy('quests.rose_step_lay'), copy('quests.rose_step_lay_where')],
        [copy('quests.rose_step_key'), copy('quests.rose_step_key_where')],
      ],
      now: options.quest,
      onStep: options.onQuest,
    },
  })
}
