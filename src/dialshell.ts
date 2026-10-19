// Bull Valley Dial-Up's shell (sharedworld.ts rule 29), once the modem has
// connected: the top bar (the raider, their level and its bar, the wallet,
// geometrie and the wards going), the tabs along the bottom (Lobby, Pack,
// Expeditions, Social, Book; Expeditions and Social not on this line
// yet), the
// lobby (the raider in their character with their record, and the cards
// for the Cabbage Stand and the locker) and the sheets
// they open, and a toast for the valley's last word. Space is collapsed:
// no card is anywhere, so every one opens wherever the raider is. The
// state is dialstate.ts's, redrawn whole on every frame.

import { entryOf } from './book.ts'
import { copy } from './copy.ts'
import { dayKey } from './daily.ts'
import { DialBook, renderPage } from './dialbook.ts'
import { renderCitgo } from './dialcitgo.ts'
import { DialMoab } from './dialmoab.ts'
import { DialPack, renderLocker } from './dialpack.ts'
import { DialSocial } from './dialsocial.ts'
import { raiderStats } from './dialstate.ts'
import { el, text } from './dom.ts'
import { AXES } from './geometrie.ts'
import { iconSvg } from './icons.ts'
import { OUTFITS } from './outfits.ts'
import { barOf } from './progression.ts'
import { collectable } from './stand.ts'
import { formatCash } from './store.ts'
import { grouped, wardName } from './vitalshud.ts'
import type { AvatarView } from './avatarview.ts'
import type { BookEntry } from './book.ts'
import type { CosmeticId } from './cosmetics.ts'
import type { CitgoActions, CitgoOpen } from './dialcitgo.ts'
import type { Opened, PackActions } from './dialpack.ts'
import type { SocialActions } from './dialsocial.ts'
import type { DialState } from './dialstate.ts'
import type { FinishId } from './finishes.ts'
import type { Hotbar } from './hotbar.ts'
import type { ItemThumbs } from './itemthumbs.ts'
import type { OutfitId } from './outfits.ts'

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
  // The character the raider wears and its guitar's finish
  // (characters.ts pickOf).
  outfit: OutfitId
  finish: FinishId
  // The 3D models, loaded once when first wanted.
  models: () => Promise<typeof import('./dial3d.ts')>
  hotbar: Hotbar
  // The valley's clock in ms, for what the stand has banked.
  now: () => number
  pack: PackActions
  // Opens the stand's dialog over the shell; Erwin's and Gron's too.
  openStand: () => void
  openErwin: () => void
  openGron: () => void
  // Buys off a Citgo's shelf, with every Citgo's name once the survey
  // has loaded (citgomap.ts citgoNames).
  citgo: CitgoActions
  citgoNames: () => Promise<string[]>
  // Trades with Moab.
  trade: (offer: CosmeticId) => void
  // Says a line, and asks or ends a friendship.
  social: SocialActions
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
  private sheetOpen: 'locker' | 'page' | 'citgo' | 'moab' | null = null
  private lockerOpen: Opened = { kind: null }
  private citgoOpen: CitgoOpen = { station: null }
  private names: string[] | null = null
  private pack: DialPack
  private book: DialBook
  private social: DialSocial
  private moab: DialMoab | null = null
  private state: DialState | null = null
  // The raider's turntable: one canvas kept across redraws, and what it
  // last showed them in.
  private portrait: HTMLElement
  private avatarCanvas: HTMLCanvasElement
  private avatar: AvatarView | null = null
  private dressed = ''
  private thumbs: ItemThumbs | null = null
  private models: ReturnType<ShellOptions['models']> | null = null

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
    this.book = new DialBook((entry) => this.openPage(entry))
    this.social = new DialSocial(options.social)
    this.portrait = el('div', 'bv-dial-portrait')
    this.avatarCanvas = document.createElement('canvas')
    this.avatarCanvas.className = 'bv-dial-portrait-canvas'
    this.portrait.append(this.avatarCanvas)
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
      case 'book':
        this.book.render(new Set(s.book))
        this.view.replaceChildren(this.book.root)
        break
      case 'social':
        this.social.render(s, {
          name: this.options.name,
          level: barOf(s.xp).level,
        })
        if (this.social.root.parentElement !== this.view) {
          this.view.replaceChildren(this.social.root)
        }
        break
      default:
        this.view.replaceChildren(
          text('p', copy('dialup.soon'), 'bv-dial-note')
        )
    }
    this.dress(s)
    if (this.sheetOpen === 'locker') {
      renderLocker(this.sheetBody, s, this.options.pack, this.lockerOpen)
    }
    if (this.sheetOpen === 'citgo') {
      renderCitgo(
        this.sheetBody,
        s,
        this.names,
        this.citgoOpen,
        this.options.citgo
      )
    }
    if (this.sheetOpen === 'moab') this.moab?.update(s)
    const said = s.said
    const fresh = said && performance.now() - said.at < SAID_MS
    this.toast.hidden = !fresh
    if (said && fresh) this.toast.textContent = said.text
  }

  // A new name or character from Gron.
  setName(name: string): void {
    this.options = { ...this.options, name }
    if (this.state) this.render(this.state)
  }

  setLook(outfit: OutfitId, finish: FinishId): void {
    this.options = { ...this.options, outfit, finish }
    if (this.state) this.render(this.state)
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

  // The 3D, loaded the first time it is wanted.
  private load(): ReturnType<ShellOptions['models']> {
    this.models ??= this.options.models()
    return this.models
  }

  // The raider turns on the lobby in what they wear; anywhere else the
  // turntable stops.
  private dress(s: DialState): void {
    const look = {
      outfit: this.options.outfit,
      finish: this.options.finish,
      cosmetics: s.cosmetics,
    }
    const key = this.tab === 'lobby' ? JSON.stringify(look) : ''
    if (key === this.dressed) return
    this.dressed = key
    if (!key) {
      this.avatar?.stop()
      return
    }
    void this.load().then((models) => {
      if (this.dressed !== key) return
      this.avatar ??= models.createAvatarView(this.avatarCanvas, {
        drag: true,
      })
      this.avatar.show(look)
    })
  }

  // An entry's page in the sheet, its portrait turning.
  private openPage(entry: BookEntry): void {
    const known = this.state?.book.includes(entry.id) ?? false
    this.sheetOpen = 'page'
    this.sheetTitle.textContent = copy('book.title')
    this.sheet.hidden = false
    const canvas = renderPage(this.sheetBody, entry, known)
    void this.load().then((models) => {
      if (this.sheetOpen !== 'page' || !canvas.isConnected) return
      this.thumbs ??= models.createItemThumbs()
      const { build, fitAs } = models.portraitOf(entry)
      this.thumbs.spinModel(canvas, `book:${entry.id}`, build, !known, fitAs)
    })
  }

  private openCitgo(): void {
    this.sheetOpen = 'citgo'
    this.sheetTitle.textContent = copy('dialup.lobby.citgo')
    this.sheet.hidden = false
    if (!this.names) {
      void this.options.citgoNames().then(
        (names) => {
          this.names = names
          if (this.state) this.render(this.state)
        },
        () => undefined
      )
    }
    if (this.state) this.render(this.state)
  }

  // Moab in the sheet, his portrait turning.
  private openMoab(): void {
    this.sheetOpen = 'moab'
    this.sheetTitle.textContent = copy('outfits.moab')
    this.sheet.hidden = false
    this.moab = new DialMoab(this.options.trade)
    const canvas = this.moab.portrait
    this.sheetBody.replaceChildren(this.moab.root)
    if (this.state) this.render(this.state)
    void this.load().then((models) => {
      const entry = entryOf('moab')
      if (this.sheetOpen !== 'moab' || !canvas.isConnected || !entry) return
      this.thumbs ??= models.createItemThumbs()
      const { build } = models.portraitOf(entry)
      this.thumbs.spinModel(canvas, 'book:moab', build, false)
    })
  }

  private closeSheet(): void {
    if (this.sheetOpen === 'page' || this.sheetOpen === 'moab') {
      this.thumbs?.stop()
    }
    this.moab = null
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
    const points = copy('dialup.geometrie', {
      health: grouped(s.health),
      max: grouped(s.healthMax),
    })
    health.setAttribute('aria-label', points)
    health.append(text('span', points, 'bv-dial-meter-text'))
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
      this.raider(s),
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
      ),
      card(
        'citgo',
        copy('dialup.lobby.citgo'),
        copy('dialup.lobby.citgo_blurb', { count: s.citgos.visited.length }),
        () => this.openCitgo()
      ),
      card(
        'erwin',
        copy('outfits.squatter'),
        copy('dialup.lobby.erwin_blurb'),
        () => this.options.openErwin()
      ),
      card('gron', copy('outfits.gron'), copy('dialup.lobby.gron_blurb'), () =>
        this.options.openGron()
      ),
      card('moab', copy('outfits.moab'), copy('dialup.lobby.moab_blurb'), () =>
        this.openMoab()
      )
    )
    const away = text('a', copy('dialup.switch_valley'), 'bv-dial-switch')
    away.href = this.options.switchHref
    grid.append(away)
    return grid
  }

  // The raider in their character, their level and their record.
  private raider(s: DialState): HTMLElement {
    const { name, outfit } = this.options
    const look = OUTFITS[outfit].label
    const panel = el('section', 'bv-dial-raider')
    panel.dataset.card = 'raider'
    this.avatarCanvas.setAttribute(
      'aria-label',
      copy('dialup.raider.portrait', { name, outfit: look })
    )
    this.avatarCanvas.setAttribute('role', 'img')

    const head = el('div', 'bv-dial-raider-head')
    head.append(
      text('h2', name, 'bv-dial-raider-name'),
      text(
        'p',
        copy('dialup.raider.title', { level: barOf(s.xp).level, outfit: look }),
        'bv-dial-raider-title'
      )
    )
    const stats = el('dl', 'bv-dial-stats')
    for (const stat of raiderStats(s, dayKey(this.options.now()))) {
      const row = el('div', 'bv-dial-stat')
      row.dataset.stat = stat.id
      row.append(
        text('dt', stat.label, 'bv-dial-stat-label'),
        text('dd', stat.value, 'bv-dial-stat-value')
      )
      if (stat.share !== null) row.append(meter('bv-dial-stat-bar', stat.share))
      stats.append(row)
    }
    head.append(stats)

    const wards = el('ul', 'bv-dial-raider-wards')
    for (const axis of AXES) {
      const level = s.wards[axis] || 0
      if (Math.round(level * 100) < 1) continue
      const chip = el('li', 'bv-dial-ward')
      chip.dataset.ward = axis
      chip.innerHTML = iconSvg(axis)
      chip.append(
        text('span', wardName(axis)),
        text('span', `${Math.round(level * 100)}%`, 'bv-dial-ward-level')
      )
      wards.append(chip)
    }
    if (wards.childElementCount === 0) {
      wards.append(
        text('li', copy('dialup.raider.wards'), 'bv-dial-raider-calm')
      )
    }
    panel.append(this.portrait, head, wards)
    return panel
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
