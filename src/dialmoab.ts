// Moab Coldë on Bull Valley Dial-Up (sharedworld.ts rules 14 and 29): his
// portrait turning (bookportraits.ts, drawn by dialshell.ts through
// dial3d.ts), his one line, and his trade, from wherever the raider is: a
// cosmetic for what the pack holds when he has an offer (cosmetics.ts
// moabOffer), else what he wants, or that the raider wears it already.
// The valley takes the price and writes the cosmetic.

import { copy } from './copy.ts'
import { cosmeticById, MOAB_OFFERS, moabOffer } from './cosmetics.ts'
import { el, text } from './dom.ts'
import { itemLabel } from './itemcopy.ts'
import type { CosmeticId } from './cosmetics.ts'
import type { DialState } from './dialstate.ts'

export class DialMoab {
  readonly root = el('div', 'bv-dial-folk')
  readonly portrait = document.createElement('canvas')
  private status = el('div', 'bv-dial-folk-act')
  private trade: (offer: CosmeticId) => void

  constructor(trade: (offer: CosmeticId) => void) {
    this.trade = trade
    this.portrait.className = 'bv-dial-page-portrait'
    this.portrait.width = 240
    this.portrait.height = 240
    this.root.append(
      this.portrait,
      text('h3', copy('outfits.moab'), 'bv-dial-page-name'),
      text('p', copy('moab.says'), 'bv-dial-page-lore'),
      this.status
    )
  }

  update(s: DialState): void {
    const offer = moabOffer(s.pack, s.cosmetics)
    const cosmetic = cosmeticById(offer ?? MOAB_OFFERS[0])
    if (!cosmetic) return
    const price = {
      count: cosmetic.price.count,
      price: itemLabel(cosmetic.price.kind),
    }
    if (offer) {
      const button = text(
        'button',
        copy('dialup.moab.trade', { ...price, cosmetic: cosmetic.label }),
        'bv-dial-btn bv-dial-btn--hot'
      )
      button.type = 'button'
      button.disabled = s.pending.trade
      button.addEventListener('click', () => this.trade(offer))
      this.status.replaceChildren(
        text('p', copy('moab.offer'), 'bv-dial-folk-says'),
        button
      )
      return
    }
    const owned = s.cosmetics.includes(cosmetic.id as CosmeticId)
    this.status.replaceChildren(
      text(
        'p',
        owned
          ? copy('log.trade_owned', { cosmetic: cosmetic.label })
          : copy('log.trade_short', price),
        'bv-dial-note'
      )
    )
  }
}
