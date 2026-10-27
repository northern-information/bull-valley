// The boss's bar, as Dark Souls lays one along the bottom of the view: the
// Warden's name over a long thin bar, a dull gilt hairline round a dark
// well filled in deep crimson, the yellow trail of what a hit took holding
// a beat and draining after it, as our own geometrie's does (vitalshud.ts).
// It stays up the whole time a raider is in the deep chamber with the
// Warden standing, hurt or whole, and goes once they leave or it bursts.
// The loop hands it the Warden every frame (undercroftfoesrig.ts); it touches the
// page only when the share or whether it shows changes.

import { copy } from './copy.ts'
import { el } from './dom.ts'

export class BossHud {
  readonly root: HTMLDivElement
  private readonly bar: HTMLDivElement
  private readonly fill: HTMLDivElement
  private readonly lost: HTMLDivElement
  private percent = 100
  private view = ''

  constructor(parent: HTMLElement) {
    this.root = el('div', 'bv-boss')
    this.root.hidden = true
    this.root.append(el('p', 'bv-boss-name', copy('book.warden.name')))
    this.bar = el('div', 'bv-boss-bar')
    this.bar.setAttribute('role', 'meter')
    this.bar.setAttribute('aria-valuemin', '0')
    this.bar.setAttribute('aria-valuemax', '100')
    this.lost = el('div', 'bv-vitals-lost')
    this.fill = el('div', 'bv-vitals-fill')
    this.bar.append(this.lost, this.fill)
    this.root.append(this.bar)
    parent.append(this.root)
  }

  // The Warden with `share` (0 to 1) of it left, or null to put it away.
  set(share: number | null): void {
    if (share === null) {
      if (!this.root.hidden) this.root.hidden = true
      this.view = ''
      return
    }
    const left = Math.round(Math.max(0, Math.min(1, share)) * 1000) / 10
    const view = String(left)
    if (view === this.view) return
    const shown = !this.root.hidden
    this.view = view
    this.root.hidden = false
    // Lost: the trail holds, then drains (styles.css); first shown, or
    // given back, both stand where they are at once.
    this.lost.classList.toggle(
      'bv-vitals-lost--drain',
      shown && left < this.percent
    )
    this.percent = left
    this.fill.style.width = `${left}%`
    this.lost.style.width = `${left}%`
    this.bar.setAttribute('aria-valuenow', String(Math.round(left)))
    this.bar.setAttribute(
      'aria-label',
      copy('hud.boss_label', {
        name: copy('book.warden.name'),
        share: Math.round(left),
      })
    )
  }
}
