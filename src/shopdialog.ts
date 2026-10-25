// A Citgo's shelves (sharedworld.ts rules 7 and 29): the trade window
// (tradewindow.ts), kept by David Carlsten, opened with E at him behind
// the counter, and from Dial-Up's Citgo sheet for any Citgo the account
// has stood at. (E on a shelf unit buys it outright, no window:
// actions.ts.) The Citgo takes cash, so your side is the wallet; his side
// is every kind on the shelves (shop.ts shelfRows), each at its shelf
// price with how many are left today. A trade buys one unit, the first
// still on the shelf; the valley settles it.

import { copy } from './copy.ts'
import { itemLabel } from './itemcopy.ts'
import { shelfRows } from './shop.ts'
import { formatCash } from './store.ts'
import { openTradeWindow } from './tradewindow.ts'
import type { ShopStock } from './interfaces.ts'
import type { TradeCheer, Turntable } from './tradewindow.ts'

interface ShopDialogOptions {
  // The Citgo's name as the map gives it, and what Carlsten says as it
  // opens.
  name: string
  says: string
  // Read again every tick: the shelves as the valley last sent them (null
  // with no valley), the wallet, whether a buy is still unanswered, and
  // the last word on one.
  shelf: () => ShopStock | null
  cash: () => number
  pending: () => boolean
  said: () => string | null
  icon: (kind: string) => Promise<string>
  onBuy: (kind: string, unit: number) => void
  // The last trade made a big deal of, and its cheer (tradewindow.ts).
  fanfare: TradeCheer
  turntable: Turntable
}

// Mounts the Citgo's window over everything and resolves once it is
// closed.
export function openShopDialog(options: ShopDialogOptions): Promise<void> {
  const rowOf = (kind: string) =>
    shelfRows(options.shelf() ?? undefined).find((r) => r.kind === kind)
  const kinds = shelfRows(options.shelf() ?? undefined)
  return openTradeWindow({
    name: 'bv-citgo',
    title: copy('outfits.carlsten'),
    eyebrow: copy('shop.eyebrow'),
    where: options.name ? copy('shop.where', { citgo: options.name }) : '',
    tag: copy('shop.cash_only'),
    says: options.says,
    tab: copy('shop.eyebrow'),
    mineMeta: copy('shop.to_the_cent'),
    hisMeta: copy('trade.restocks'),
    nothing: '',
    nothingHint: '',
    goods: kinds.map((row) => ({
      id: row.kind,
      kind: row.kind,
      label: itemLabel(row.kind),
      worth: row.price,
      note: () => {
        const left = rowOf(row.kind)?.left ?? 0
        return left < 1
          ? copy('shop.sold_out')
          : copy('shop.left', { count: left })
      },
      left: () => null,
      out: () =>
        (rowOf(row.kind)?.left ?? 0) < 1 ? copy('log.sold_out') : null,
    })),
    worthOf: () => 0,
    cash: options.cash,
    format: formatCash,
    pick: null,
    open: () => options.shelf() !== null,
    pack: () => ({}),
    pending: options.pending,
    said: options.said,
    icon: options.icon,
    fanfare: options.fanfare,
    turntable: options.turntable,
    onTrade: (kind) => {
      const unit = rowOf(kind)?.unit ?? null
      if (unit !== null) options.onBuy(kind, unit)
    },
  })
}
