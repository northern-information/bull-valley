// Bull Valley Dial-Up's Expeditions tab (sharedworld.ts rule 30): the run
// out, if any, with how far along it is and the time left on the valley's
// clock (`tickExpeditions`, moved in place each second), and Bring It Home
// once its time is up; then every run there is, each with how long it
// takes, the level it opens at, the ward that keeps it safe and how much
// yours does now (expeditions.ts riskOf), what it may bring home, and
// Send. The last haul home stays under it.

import { CONFIG } from './config.ts'
import { copy } from './copy.ts'
import { expeditionName, haulLine } from './dialstate.ts'
import { el, text } from './dom.ts'
import { isCash } from './drops.ts'
import {
  EXPEDITION_IDS,
  isHome,
  progressOf,
  riskOf,
  wardOf,
} from './expeditions.ts'
import { itemLabel } from './itemcopy.ts'
import { barOf } from './progression.ts'
import { wardName } from './vitalshud.ts'
import type { DialState } from './dialstate.ts'
import type { ExpeditionId } from './expeditions.ts'

export interface ExpeditionActions {
  send(kind: ExpeditionId): void
  claim(): void
}

// What a run is about, as the card says it.
function blurbOf(id: ExpeditionId): string {
  switch (id) {
    case 'ride':
      return copy('dialup.expeditions.ride_blurb')
    case 'corn':
      return copy('dialup.expeditions.corn_blurb')
    case 'undercroft':
      return copy('dialup.expeditions.undercroft_blurb')
  }
}

// A span of ms as the card says it: hours and minutes, or minutes and
// seconds under the hour.
export function spanOf(ms: number): string {
  const s = Math.max(0, Math.ceil(ms / 1000))
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  if (h > 0) return copy('dialup.expeditions.hours', { h, m })
  return copy('dialup.expeditions.minutes', {
    m,
    s: String(s % 60).padStart(2, '0'),
  })
}

export function renderExpeditions(
  root: HTMLElement,
  s: DialState,
  now: number,
  actions: ExpeditionActions
): void {
  const level = barOf(s.xp).level
  const out = s.expedition
  const parts: HTMLElement[] = []
  if (out) {
    const card = el('section', 'bv-dial-run')
    card.dataset.run = out.id
    const claim = text(
      'button',
      copy('dialup.expeditions.claim'),
      'bv-dial-btn bv-dial-btn--hot'
    )
    claim.type = 'button'
    claim.addEventListener('click', () => actions.claim())
    card.append(
      text('p', copy('dialup.expeditions.out_now'), 'bv-dial-social-head'),
      text('h3', expeditionName(out.id), 'bv-dial-run-name'),
      el('div', 'bv-dial-meter bv-dial-run-bar'),
      el('p', 'bv-dial-run-left'),
      claim
    )
    parts.push(card)
  }
  const list = el('ul', 'bv-dial-items')
  for (const id of EXPEDITION_IDS) {
    const run = CONFIG.expeditions.runs[id]
    const li = el('li', 'bv-dial-item bv-dial-expedition')
    li.dataset.expedition = id
    const head = el('div', 'bv-dial-shelf-head')
    head.append(
      text('span', expeditionName(id), 'bv-dial-shelf-name'),
      text('span', spanOf(run.minutes * 60_000), 'bv-dial-shelf-price')
    )
    const ward = wardOf(id)
    const risk = Math.round(riskOf(id, ward ? s.wards[ward] : 0) * 100)
    const facts = el('p', 'bv-dial-item-blurb')
    facts.textContent = [
      blurbOf(id),
      ward
        ? copy('dialup.expeditions.risk_warded', {
            risk,
            ward: wardName(ward),
          })
        : copy('dialup.expeditions.safe'),
      copy('dialup.expeditions.loot', {
        loot: [
          ...new Set(
            run.loot.map((roll) =>
              isCash(roll.kind)
                ? copy('dialup.expeditions.cash')
                : itemLabel(roll.kind)
            )
          ),
        ].join(', '),
      }),
    ].join(' ')
    const locked = level < run.level
    const send = text(
      'button',
      locked
        ? copy('dialup.expeditions.locked', { level: run.level })
        : copy('dialup.expeditions.send'),
      'bv-dial-btn'
    )
    send.type = 'button'
    send.disabled = locked || out !== null || s.pending.expedition
    send.addEventListener('click', () => actions.send(id))
    li.append(head, facts, send)
    list.append(li)
  }
  parts.push(
    text('h2', copy('dialup.tabs.expeditions'), 'bv-dial-book-title'),
    list
  )
  if (s.haul) {
    parts.push(text('p', haulLine(s.haul), 'bv-dial-note bv-dial-haul'))
  }
  root.replaceChildren(...parts)
  tickExpeditions(root, s, now)
}

// What moves on the valley's clock alone, moved in place: the run's bar,
// its time left, and Bring It Home once it is back. The rest waits on a
// frame, so a tap never lands on a node being replaced.
export function tickExpeditions(
  root: HTMLElement,
  s: DialState,
  now: number
): void {
  const out = s.expedition
  const card = root.querySelector<HTMLElement>('.bv-dial-run')
  if (!out || !card) return
  const home = isHome(out, now)
  card
    .querySelector<HTMLElement>('.bv-dial-run-bar')
    ?.style.setProperty('--fill', String(progressOf(out, now)))
  const left = card.querySelector('.bv-dial-run-left')
  if (left) {
    left.textContent = home
      ? copy('dialup.expeditions.home_now')
      : copy('dialup.expeditions.left', { time: spanOf(out.endsAt - now) })
  }
  const claim = card.querySelector<HTMLButtonElement>('.bv-dial-btn')
  if (claim) claim.disabled = !home || s.pending.expedition
}
