// Pure: a trade made a big deal of, as a fish landed is
// (catchfanfare.ts), the same in both apps and with every trader: his
// banner swept across his trade window (tradewindow.ts) with what was had
// under it, and fireflies bursting over it (catchburst.ts). Moab trades
// for gold, so his banner burns gold and his fireflies are a big fish's.
// No three.js, no DOM.

import { copy } from './copy.ts'
import type { Fanfare } from './catchfanfare.ts'

// Who the trade was with: Moab Coldë, Erwin von Dutch, or a Citgo's
// shelves.
export type Trader = 'moab' | 'dealer' | 'shop'

const KICKER: Record<Trader, () => string> = {
  moab: () => copy('moab.fanfare'),
  dealer: () => copy('dealer.fanfare'),
  shop: () => copy('shop.fanfare'),
}

// The fanfare for a trade with `trader` that had `headline` (what was
// had, by name); `kind` is its id.
export function tradeFanfare(
  trader: Trader,
  kind: string,
  headline: string
): Fanfare {
  const gold = trader === 'moab'
  return {
    kind,
    tier: gold ? 'big' : 'fish',
    kicker: KICKER[trader](),
    headline,
    gold,
  }
}
