// Bull Valley Dial-Up's shell (sharedworld.ts rule 29), once the modem has
// connected: the top bar (the raider, their level and its bar, the wallet,
// geometrie and the wards going), the tabs along the bottom (Lobby, Pack,
// Expeditions, Social, Book; the last three not on this line yet), the
// lobby's cards (the Cabbage Stand, the locker, the raider) and the sheets
// they open, and a toast for the valley's last word. Space is collapsed:
// no card is anywhere, so every one opens wherever the raider is. The
// state is dialstate.ts's, redrawn whole on every frame.

import { copy } from './copy.ts'
import { DialPack, renderLocker } from './dialpack.ts'
import { el, text } from './dom.ts'
import { AXES } from './geometrie.ts'
import { iconSvg } from './icons.ts'
import { barOf } from './progression.ts'
import { collectable } from './stand.ts'
import { formatCash } from './store.ts'
import type { Opened, PackActions } from './dialpack.ts'
import type { DialState } from './dialstate.ts'
import type { Hotbar } from './hotbar.ts'

export type DialTab = 'lobby' | 'pack' | 'expeditions' | 'social' | 'book'

const TABS: { tab: DialTab; label: string }[] = [
  { tab: 'lobby', label: copy('dialup.tabs.lobby') },
  { tab: 'pack', label: copy('dialup.tabs.pack') },
  { tab: 'expeditions', label: copy('dialup.tabs.expeditions') },
  { tab: 'social', label: copy('dialup.tabs.social') },
  { tab: 'book', label: copy('dialup.tabs.book') },
]

// How long the valley's last word stays up.
const SAID_MS = 4000

interface ShellOptions {
  name: string
  hotbar: Hotbar
  // The valley's clock in ms, for what the stand has banked.
  now: () => number
  pack: PackActions
  // Opens the stand's dialog over the shell.
  openStand: () => void
  // The same page in the 3D valley.
  switchHref: string
}

export class DialShell {
  readonly root: HTMLElement
  private top: HTMLElement
  private view: HTMLElement
  private toast: HTMLElement
  private sheet: HTMLElement
  private sheetBody: HTMLElement
  private sheetTitle: HTMLElement
  private tab: DialTab = 'lobby'
  private sheetOpen: 'locker' | null = null
  private lockerOpen: Opened = { kind: null }
  private pack: DialPack
  private state: DialState | null = null

  private options: ShellOptions

  constructor(parent: HTMLElement, options: ShellOptions) {
    this.options = options
    this.root = el('div', 'bv-dial')
    this.top = el('header', 'bv-dial-top')
    this.view = el('main', 'bv-dial-view')
    this.toast = el('p', 'bv-dial-toast')
    this.toast.setAttribute('role', 'status')
    this.toast.hidden = true
    const tabs = el('nav', 'bv-dial-tabs')
    for (const { tab, label } of TABS) {
      const b = text('button', label, 'bv-dial-tab')
      b.type = 'button'
      b.dataset.tab = tab
      b.addEventListener('click', () => this.show(tab))
      tabs.append(b)
    }
    this.sheet = el('section', 'bv-dial-sheet')
    this.sheet.hidden = true
    const head = el('header', 'bv-dial-sheet-head')
    const back = text('button', copy('dialup.back'), 'bv-dial-btn')
    back.type = 'button'
    back.addEventListener('click', () => this.closeSheet())
    this.sheetTitle = el('h2', 'bv-dial-sheet-title')
    head.append(back, this.sheetTitle)
    this.sheetBody = el('div', 'bv-dial-sheet-body')
    this.sheet.append(head, this.sheetBody)
    this.pack = new DialPack(options.hotbar, options.pack)
    this.root.append(this.top, this.view, this.toast, tabs, this.sheet)
    parent.append(this.root)
  }

  render(s: DialState): void {
    this.state = s
    this.renderTop(s)
    for (const b of this.root.querySelectorAll<HTMLElement>('.bv-dial-tab')) {
      b.setAttribute('aria-current', String(b.dataset.tab === this.tab))
    }
    this.root.dataset.tab = this.tab
    switch (this.tab) {
      case 'lobby':
        this.view.replaceChildren(this.lobby(s))
        break
      case 'pack':
        this.pack.render(s)
        this.view.replaceChildren(this.pack.root)
        break
      default:
        this.view.replaceChildren(
          text('p', copy('dialup.soon'), 'bv-dial-note')
        )
    }
    if (this.sheetOpen === 'locker') {
      renderLocker(this.sheetBody, s, this.options.pack, this.lockerOpen)
    }
    const said = s.said
    const fresh = said && performance.now() - said.at < SAID_MS
    this.toast.hidden = !fresh
    if (said && fresh) this.toast.textContent = said.text
  }

  // The stand's banked cents tick on the valley's clock; once a second,
  // only the figure moves.
  tick(): void {
    const s = this.state
    const blurb = this.view.querySelector(
      '.bv-dial-card[data-card="stand"] .bv-dial-card-blurb'
    )
    if (!s?.stand || !blurb) return
    const amount = formatCash(collectable(s.stand, this.options.now()))
    blurb.textContent = copy('dialup.lobby.banked', { amount })
  }

  private show(tab: DialTab): void {
    this.tab = tab
    this.closeSheet()
    if (this.state) this.render(this.state)
  }

  private openLocker(): void {
    this.sheetOpen = 'locker'
    this.sheetTitle.textContent = copy('dialup.lobby.locker')
    this.sheet.hidden = false
    if (this.state) this.render(this.state)
  }

  private closeSheet(): void {
    this.sheetOpen = null
    this.sheet.hidden = true
    this.sheetBody.replaceChildren()
  }

  private renderTop(s: DialState): void {
    const bar = barOf(s.xp)
    const share = bar.span === null ? 1 : bar.into / Math.max(1, bar.span)
    const life = s.health / Math.max(1, s.healthMax)
    const who = el('div', 'bv-dial-who')
    who.append(
      text('strong', this.options.name, 'bv-dial-name'),
      text('span', copy('dialup.level', { level: bar.level }), 'bv-dial-lv'),
      text('span', formatCash(s.cash), 'bv-dial-cash')
    )
    const xp = meter('bv-dial-xp', share)
    const health = meter('bv-dial-health', life)
    health.setAttribute(
      'aria-label',
      copy('dialup.geometrie', { health: s.health, max: s.healthMax })
    )
    health.append(
      text(
        'span',
        copy('dialup.geometrie', { health: s.health, max: s.healthMax }),
        'bv-dial-meter-text'
      )
    )
    const wards = el('ol', 'bv-dial-wards')
    for (const axis of AXES) {
      const level = Math.round((s.wards[axis] || 0) * 100)
      if (level < 1) continue
      const chip = el('li', 'bv-dial-ward')
      chip.dataset.ward = axis
      chip.innerHTML = iconSvg(axis)
      chip.append(text('span', `${level}%`))
      wards.append(chip)
    }
    this.top.replaceChildren(who, xp, health, wards)
  }

  private lobby(s: DialState): HTMLElement {
    const grid = el('div', 'bv-dial-lobby')
    const banked = s.stand ? collectable(s.stand, this.options.now()) : 0
    grid.append(
      card(
        'raider',
        copy('dialup.lobby.raider', { name: this.options.name }),
        copy('dialup.lobby.raider_blurb', {
          level: barOf(s.xp).level,
          cash: formatCash(s.cash),
        }),
        null
      ),
      card(
        'stand',
        copy('dialup.lobby.stand'),
        s.stand
          ? copy('dialup.lobby.banked', { amount: formatCash(banked) })
          : copy('dialup.lobby.stand_blurb'),
        () => this.options.openStand()
      ),
      card(
        'locker',
        copy('dialup.lobby.locker'),
        copy('dialup.lobby.locker_blurb'),
        () => this.openLocker()
      )
    )
    const away = text('a', copy('dialup.switch_valley'), 'bv-dial-switch')
    away.href = this.options.switchHref
    grid.append(away)
    return grid
  }
}

function meter(className: string, share: number): HTMLElement {
  const m = el('div', `bv-dial-meter ${className}`)
  m.style.setProperty('--fill', String(Math.max(0, Math.min(1, share))))
  return m
}

function card(
  id: string,
  title: string,
  blurb: string,
  onOpen: (() => void) | null
): HTMLElement {
  const c = el(onOpen ? 'button' : 'div', 'bv-dial-card')
  if (c instanceof HTMLButtonElement) c.type = 'button'
  c.dataset.card = id
  c.append(
    text('span', title, 'bv-dial-card-title'),
    text('span', blurb, 'bv-dial-card-blurb')
  )
  if (onOpen) c.addEventListener('click', onOpen)
  return c
}
