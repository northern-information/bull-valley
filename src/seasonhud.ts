// The season as the raider sees it (season.ts): the card on the intro and
// pause overlay that says what the season asks and pays, the tracker in
// the upper right (out of sight but for a few seconds after the season's,
// the daily task's or the level's count goes up), and the banners that
// sweep across the view when the season goes live, when the raider helps
// unmake the Caretaker, and when the season is done. Hud builds it;
// valleysync.ts and input.ts feed it.

import { copy } from './copy.ts'
import { newsOf, SEASON, shownKills } from './season.ts'
import { formatCash } from './store.ts'
import type { SeasonProgress } from './season.ts'

// How long one banner holds the view, in ms; styles.css's bv-banner
// animation runs the same length.
export const BANNER_MS = 5200

export interface Banner {
  kicker: string
  headline: string
  detail?: string
  // The finished season's banner burns gold, not Citgo red.
  gold?: boolean
}

function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className: string,
  content?: string
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag)
  node.className = className
  if (content !== undefined) node.textContent = content
  return node
}

// A row of one pip per unmaking the season asks for.
function pips(): { row: HTMLElement; pips: HTMLElement[] } {
  const row = el('span', 'bv-season-pips')
  row.setAttribute('aria-hidden', 'true')
  const all = Array.from({ length: SEASON.goal }, () =>
    row.appendChild(el('span', 'bv-season-pip'))
  )
  return { row, pips: all }
}

// The season's own words, filled with its numbers.
export const SEASON_COPY = {
  kicker: copy('season.kicker'),
  title: copy('season.title'),
  live: copy('season.live'),
  challenge: copy('season.challenge', { goal: SEASON.goal }),
  reward: copy('season.reward', { cash: formatCash(SEASON.reward.cash) }),
}

export class SeasonHud {
  tracker: HTMLElement
  card: HTMLElement
  banner: HTMLElement
  private readonly counts: HTMLElement[] = []
  private readonly pipRows: HTMLElement[][] = []
  private readonly queue: Banner[] = []
  private showing = false

  constructor(ui: HTMLElement) {
    // The tracker, upper right.
    this.tracker = el('div', 'bv-season')
    this.tracker.setAttribute('role', 'status')
    const head = el('p', 'bv-season-head')
    head.append(
      el('span', 'bv-season-kicker', SEASON_COPY.kicker),
      ' ',
      el('b', 'bv-season-title', SEASON_COPY.title)
    )
    this.tracker.append(head, this.progressRow())
    ui.appendChild(this.tracker)

    // The card, for the intro and pause overlay (Hud places it).
    this.card = el('section', 'bv-season-card')
    this.card.setAttribute('aria-label', SEASON_COPY.kicker)
    const strip = el('p', 'bv-season-card-strip')
    strip.append(
      el('span', '', SEASON_COPY.kicker),
      el('span', 'bv-season-card-live', SEASON_COPY.live)
    )
    this.card.append(
      strip,
      el('h3', 'bv-season-card-title', SEASON_COPY.title),
      el('p', 'bv-season-card-text', SEASON_COPY.challenge),
      el('p', 'bv-season-card-reward', SEASON_COPY.reward),
      this.progressRow()
    )

    // The banner, swept across the upper view.
    this.banner = el('div', 'bv-banner')
    this.banner.setAttribute('role', 'status')
    this.banner.hidden = true
    ui.appendChild(this.banner)

    this.set({ kills: 0, claimed: false })
  }

  // The pips and the count, for the tracker and the card alike.
  private progressRow(): HTMLElement {
    const row = el('p', 'bv-season-progress')
    const { row: pipRow, pips: all } = pips()
    const count = el('span', 'bv-season-count')
    row.append(pipRow, count)
    this.pipRows.push(all)
    this.counts.push(count)
    return row
  }

  // The account's progress, on the tracker and the card.
  set(progress: SeasonProgress): void {
    const kills = shownKills(progress)
    const done = progress.claimed
    const text = done
      ? copy('season.complete')
      : copy('season.progress', { kills, goal: SEASON.goal })
    for (const count of this.counts) {
      if (count.textContent !== text) count.textContent = text
    }
    for (const row of this.pipRows) {
      row.forEach((pip, i) =>
        pip.classList.toggle('bv-season-pip--lit', i < kills)
      )
    }
    this.tracker.classList.toggle('bv-season--done', done)
    this.card.classList.toggle('bv-season-card--done', done)
    this.tracker.setAttribute(
      'aria-label',
      copy('season.tracker_label', { kills, goal: SEASON.goal })
    )
  }

  // The tracker shows for a moment and fades out again: the count just
  // went up. styles.css's bv-tracker animation runs the length.
  flash(): void {
    const t = this.tracker
    t.classList.remove('bv-season--flash')
    void t.offsetWidth
    t.classList.add('bv-season--flash')
  }

  // A banner across the view, after any already showing.
  announce(banner: Banner): void {
    this.queue.push(banner)
    if (!this.showing) this.next()
  }

  private next(): void {
    const banner = this.queue.shift()
    if (!banner) {
      this.showing = false
      this.banner.hidden = true
      return
    }
    this.showing = true
    const b = this.banner
    b.replaceChildren(
      el('p', 'bv-banner-kicker', banner.kicker),
      el('p', 'bv-banner-headline', banner.headline)
    )
    if (banner.detail) b.append(el('p', 'bv-banner-detail', banner.detail))
    b.classList.toggle('bv-banner--gold', banner.gold === true)
    // Restart the sweep: off, a reflow, on.
    b.hidden = false
    b.classList.remove('bv-banner--on')
    void b.offsetWidth
    b.classList.add('bv-banner--on')
    setTimeout(() => this.next(), BANNER_MS)
  }

  // The season going live, the first time the raider begins.
  live(): void {
    this.announce({
      kicker: `${SEASON_COPY.kicker} · ${SEASON_COPY.live}`,
      headline: SEASON_COPY.title,
      detail: SEASON_COPY.reward,
    })
  }

  // The raider was credited with unmaking the Caretaker: the banner for it,
  // the tracker flashed up when the count moved, and the line it says in
  // the log.
  unmade(progress: SeasonProgress, rewarded: boolean): string {
    const kills = shownKills(progress)
    const cash = formatCash(SEASON.reward.cash)
    const news = newsOf(progress, rewarded)
    if (news !== 'again') this.flash()
    switch (news) {
      case 'complete':
        this.announce({
          kicker: `${SEASON_COPY.kicker} · ${SEASON_COPY.title}`,
          headline: copy('season.banner_complete'),
          detail: copy('season.banner_paid', { cash }),
          gold: true,
        })
        return copy('log.season_reward', { cash })
      case 'unmade':
        this.announce({
          kicker: `${SEASON_COPY.kicker} · ${SEASON_COPY.title}`,
          headline: copy('season.banner_unmade', { kills, goal: SEASON.goal }),
        })
        return copy('log.season_unmade', { kills, goal: SEASON.goal })
      case 'again':
        this.announce({
          kicker: `${SEASON_COPY.kicker} · ${SEASON_COPY.title}`,
          headline: copy('season.banner_unmade_again'),
        })
        return copy('log.season_unmade_again')
    }
  }
}
