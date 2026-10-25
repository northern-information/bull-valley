// Trading with Moab Coldë under a Citgo sign (sharedworld.ts rule 14): the
// trade window (tradewindow.ts), opened with E beside him and from
// Dial-Up's lobby. He counts gold by the troy ounce (cosmetics.ts
// moabWorth), so the window prints ounces; his goods are his cosmetics
// (MOAB_OFFERS), each yours for good once had. The valley takes the price
// and writes the cosmetic, and the trade is made a big deal of
// (tradefanfare.ts) as a fish landed is.

import { copy } from './copy.ts'
import {
  cosmeticById,
  MOAB_OFFERS,
  moabOffer,
  moabWants,
  moabWorth,
} from './cosmetics.ts'
import { openTradeWindow } from './tradewindow.ts'
import type { CosmeticId } from './cosmetics.ts'
import type { Inventory } from './interfaces.ts'
import type { TradeCheer } from './tradewindow.ts'

interface MoabDialogOptions {
  // Read again every tick: whether the valley is there to trade with, the
  // pack, what the account has of his already, whether a trade is still
  // unanswered, and the last word on one.
  open: () => boolean
  pack: () => Inventory
  owned: () => readonly CosmeticId[]
  pending: () => boolean
  said: () => string | null
  icon: (kind: string) => Promise<string>
  onTrade: (offer: CosmeticId) => void
  // The last trade made a big deal of, and its cheer (tradewindow.ts).
  fanfare: TradeCheer
}

// What he says as the window opens: his offer for what the pack holds,
// else his one line.
export function moabSays(
  pack: Inventory,
  owned: readonly CosmeticId[]
): string {
  const offer = moabOffer(pack, owned)
  return (offer && cosmeticById(offer)?.offer) ?? copy('moab.says')
}

// Mounts his window over everything and resolves once it is closed.
export function openMoabDialog(options: MoabDialogOptions): Promise<void> {
  const pack = options.pack()
  const owned = options.owned()
  return openTradeWindow({
    name: 'bv-moab',
    title: copy('outfits.moab'),
    eyebrow: copy('moab.eyebrow'),
    where: copy('moab.where'),
    tag: copy('moab.gold_only'),
    says: moabSays(pack, owned),
    tab: copy('moab.eyebrow'),
    mineMeta: copy('moab.by_the_ounce'),
    hisMeta: copy('moab.for_good'),
    nothing: copy('moab.nothing_to_pay'),
    nothingHint: copy('moab.pay_hint'),
    goods: MOAB_OFFERS.flatMap((id) => {
      const cosmetic = cosmeticById(id)
      if (!cosmetic) return []
      const had = () => options.owned().includes(id)
      return [
        {
          id,
          label: cosmetic.label,
          worth: cosmetic.price.count,
          note: () => (had() ? copy('moab.yours') : ''),
          left: () => null,
          out: () =>
            had()
              ? copy('log.trade_owned', { cosmetic: cosmetic.label })
              : null,
        },
      ]
    }),
    worthOf: moabWorth,
    format: (count) => copy('moab.ounces', { count }),
    pick: moabOffer(pack, owned) ?? moabWants(owned),
    open: options.open,
    pack: options.pack,
    pending: options.pending,
    said: options.said,
    icon: options.icon,
    fanfare: options.fanfare,
    onTrade: (id) => {
      const cosmetic = cosmeticById(id)
      if (cosmetic) options.onTrade(cosmetic.id as CosmeticId)
    },
  })
}
