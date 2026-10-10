// The raider's level as the raider sees it (progression.ts): a row under
// the daily task in the upper-right tracker, the level and a bar filling
// toward the next. Hidden played alone, where nothing is kept. Hud builds
// it; loop.ts feeds it the account's XP, and valleysync.ts says the news.

import { copy } from './copy.ts'
import { el } from './dom.ts'
import { barOf } from './progression.ts'

export class LevelHud {
  row: HTMLElement
  private readonly title: HTMLElement
  private readonly fill: HTMLElement
  private readonly count: HTMLElement
  private shown: number | null = null

  constructor(tracker: HTMLElement) {
    this.row = el('div', 'bv-level')
    this.row.hidden = true
    const head = el('p', 'bv-season-head')
    this.title = el('b', 'bv-season-title')
    head.append(el('span', 'bv-season-kicker', copy('level.kicker')), ' ')
    head.append(this.title)
    const progress = el('p', 'bv-season-progress')
    const bar = el('span', 'bv-level-bar')
    bar.setAttribute('aria-hidden', 'true')
    this.fill = bar.appendChild(el('span', 'bv-level-fill'))
    this.count = el('span', 'bv-level-count')
    progress.append(bar, this.count)
    this.row.append(head, progress)
    tracker.appendChild(this.row)
  }

  // Called every frame with the account's XP in all, or null to hide; the
  // row is touched only when it changes.
  set(xp: number | null): void {
    if (xp === this.shown) return
    this.shown = xp
    this.row.hidden = xp === null
    if (xp === null) return
    const { level, into, span } = barOf(xp)
    this.title.textContent = copy('level.title', { level })
    this.count.textContent =
      span === null ? copy('level.max') : copy('level.progress', { into, span })
    this.fill.style.width = `${span === null ? 100 : (100 * into) / span}%`
    this.row.setAttribute(
      'aria-label',
      span === null
        ? copy('level.tracker_label_max', { level })
        : copy('level.tracker_label', { level, into, span })
    )
  }
}
