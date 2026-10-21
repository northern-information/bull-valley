// Bull Valley Dial-Up's pack and locker (sharedworld.ts rule 29): the
// pack's tabs as the 3D valley's (packgrid.ts, packtabs.ts), each item a
// row to tap open, with what it can do from a phone: stow one or all into
// the locker (never a key item), and put it on the hotbar (tap the button,
// then a slot). The locker's sheet keeps what is on the raider and what is
// in the locker apart, as the 3D valley's pack and its Locker tab do: the
// pack's rows to stow, its key items (which stay on the raider), and the
// locker's rows to take out. Never a use or a drop: those take a body.
// Every move is the valley's to make; the screen asks and redraws when the
// pack frame lands.

import { copy } from './copy.ts'
import { expeditionName, useImpact } from './dialstate.ts'
import { el, text } from './dom.ts'
import { assign, HOTBAR_SLOTS } from './hotbar.ts'
import { itemLabel } from './itemcopy.ts'
import { isKeyItem, isUsable } from './items.ts'
import { statsView } from './itemstatsview.ts'
import { PACK_TABS, packItems, stashItems } from './packgrid.ts'
import { BAG_TABS } from './packtabs.ts'
import { moveAmount } from './stash.ts'
import { grouped, wardName } from './vitalshud.ts'
import type { DialState } from './dialstate.ts'
import type { Hotbar } from './hotbar.ts'
import type { PackItem } from './interfaces.ts'
import type { PackTab } from './packgrid.ts'

export interface PackActions {
  // One of `kind` used (sharedworld.ts rule 27): the valley doses the
  // wards and mends the geometrie.
  use: (kind: string) => void
  // `count` of `kind` into the locker (stow) or out of it.
  move: (type: 'stow' | 'unstow', kind: string, count: number) => void
  // The bar as it now stands, to be kept on the account.
  saveHotbar: (bar: Hotbar, said: string) => void
}

// The pack screen: its tabs over its rows, and the hotbar under them.
export class DialPack {
  readonly root: HTMLElement
  private tab: PackTab = PACK_TABS[0]
  // The row tapped open, kept across redraws.
  private open: Opened = { kind: null }
  // The kind waiting for a slot, after Put on the hotbar.
  private placing: string | null = null

  private hotbar: Hotbar
  private actions: PackActions

  constructor(hotbar: Hotbar, actions: PackActions) {
    this.hotbar = hotbar
    this.actions = actions
    this.root = el('section', 'bv-dial-pack')
  }

  render(s: DialState): void {
    const tabs = el('nav', 'bv-dial-chips')
    for (const tab of PACK_TABS) {
      const chip = text('button', BAG_TABS[tab].label, 'bv-dial-chip')
      chip.type = 'button'
      chip.setAttribute('aria-pressed', String(tab === this.tab))
      chip.addEventListener('click', () => {
        this.tab = tab
        this.open.kind = null
        this.render(s)
      })
      tabs.append(chip)
    }
    const items = packItems(s.pack, this.tab)
    const list = itemRows(
      items,
      BAG_TABS[this.tab].empty,
      this.open,
      (item) => this.rowActions(s, item),
      (item) => (isUsable(item.kind) ? impactView(s, item.kind) : null)
    )
    this.root.replaceChildren(tabs, list, this.bar(s))
  }

  private rowActions(s: DialState, item: PackItem): HTMLElement[] {
    // A key item stays in the pack (items.ts isKeyItem).
    const stow = isKeyItem(item.kind)
      ? []
      : moveButtons(s, item.kind, 'stow', this.actions)
    const use = isUsable(item.kind)
      ? [
          button(copy('dialup.pack.use'), s.pending.use, () =>
            this.actions.use(item.kind)
          ),
        ]
      : []
    return [
      ...use,
      ...stow,
      button(copy('dialup.pack.hotbar'), false, () => {
        this.placing = item.kind
        this.render(s)
      }),
    ]
  }

  // The nine slots; while a kind waits for one, a tap puts it there.
  private bar(s: DialState): HTMLElement {
    const wrap = el('div', 'bv-dial-hotbar')
    if (this.placing) {
      wrap.append(
        text(
          'p',
          copy('dialup.pack.hotbar_pick', { item: itemLabel(this.placing) }),
          'bv-dial-note'
        )
      )
    }
    const row = el('ol', 'bv-dial-slots')
    for (let slot = 0; slot < HOTBAR_SLOTS; slot++) {
      const kind = this.hotbar[slot]
      const cell = el('li')
      const tap = text(
        'button',
        kind ? itemLabel(kind) : String(slot + 1),
        'bv-dial-slot'
      )
      tap.type = 'button'
      tap.dataset.slot = String(slot)
      tap.addEventListener('click', () => {
        const placing = this.placing
        if (!placing) return
        this.placing = null
        // Onto the slot that holds it already takes it off (hotbar.ts
        // assign), and says so.
        const off = this.hotbar[slot] === placing
        this.hotbar = assign(this.hotbar, slot, placing)
        const words = { item: itemLabel(placing), slot: slot + 1 }
        this.actions.saveHotbar(
          this.hotbar,
          off
            ? copy('dialup.pack.hotbar_cleared', words)
            : copy('dialup.pack.hotbar_saved', words)
        )
        this.render(s)
      })
      cell.append(tap)
      row.append(cell)
    }
    wrap.append(row)
    return wrap
  }
}

// Which row is open, kept by its screen across redraws.
export interface Opened {
  kind: string | null
}

// The locker sheet's three lists, each with its own row open.
export interface LockerOpen {
  pack: Opened
  keys: Opened
  locker: Opened
}

// The locker sheet: what the raider carries that can go in, then the key
// items they carry, which never go in (items.ts isKeyItem), then
// everything the locker holds, to take out.
export function renderLocker(
  root: HTMLElement,
  s: DialState,
  actions: PackActions,
  open: LockerOpen
): void {
  const carried = stashItems(s.pack)
  const keys = carried.filter((item) => isKeyItem(item.kind))
  root.replaceChildren(
    section(
      'pack',
      copy('dialup.pack.on_you'),
      itemRows(
        carried.filter((item) => !isKeyItem(item.kind)),
        copy('dialup.pack.nothing_to_stow'),
        open.pack,
        (item) => moveButtons(s, item.kind, 'stow', actions)
      )
    ),
    section(
      'keys',
      BAG_TABS['key-items'].label,
      itemRows(keys, BAG_TABS['key-items'].empty, open.keys, () => [])
    ),
    section(
      'locker',
      copy('dialup.pack.in_locker'),
      itemRows(
        stashItems(s.stash),
        BAG_TABS.locker.empty,
        open.locker,
        (item) => moveButtons(s, item.kind, 'unstow', actions)
      )
    )
  )
}

function section(
  name: string,
  heading: string,
  list: HTMLElement
): HTMLElement {
  const wrap = el('section', 'bv-dial-locker-part')
  wrap.dataset.section = name
  wrap.append(text('h3', heading, 'bv-dial-locker-head'), list)
  return wrap
}

// One or all of `kind` into the locker (stow) or out of it.
function moveButtons(
  s: DialState,
  kind: string,
  type: 'stow' | 'unstow',
  actions: PackActions
): HTMLButtonElement[] {
  const stow = type === 'stow'
  const held = (stow ? s.pack : s.stash)[kind] ?? 0
  const busy = s.pending.locker
  const one = stow ? copy('dialup.pack.stow_one') : copy('dialup.pack.take_one')
  const all = stow ? copy('dialup.pack.stow_all') : copy('dialup.pack.take_all')
  return [
    button(one, busy, () =>
      actions.move(type, kind, moveAmount(kind, held, false))
    ),
    button(all, busy, () => actions.move(type, kind, held)),
  ]
}

// What using `kind` now would do (dialstate.ts useImpact): each ward it
// moves, each expedition's risk with it, and the geometrie it mends.
function impactView(s: DialState, kind: string): HTMLElement | null {
  const impact = useImpact(s, kind, performance.now())
  const pct = (level: number) => Math.round(level * 100)
  const lines = [
    ...impact.wards.map(({ axis, from, to }) =>
      text(
        'li',
        copy('dialup.pack.impact_ward', {
          ward: wardName(axis),
          from: pct(from),
          to: pct(to),
        })
      )
    ),
    ...impact.risks.map(({ id, from, to }) =>
      text(
        'li',
        copy('dialup.pack.impact_risk', {
          run: expeditionName(id),
          from: pct(from),
          to: pct(to),
        })
      )
    ),
    ...(impact.health
      ? [
          text(
            'li',
            copy('dialup.pack.impact_health', {
              from: grouped(impact.health.from),
              to: grouped(impact.health.to),
            })
          ),
        ]
      : []),
  ]
  if (lines.length === 0) return null
  const wrap = el('div', 'bv-dial-impact')
  const list = el('ul')
  list.append(...lines)
  wrap.append(
    text('h4', copy('dialup.pack.impact'), 'bv-dial-impact-head'),
    list
  )
  return wrap
}

function button(
  label: string,
  disabled: boolean,
  onClick: () => void
): HTMLButtonElement {
  const b = text('button', label, 'bv-dial-btn')
  b.type = 'button'
  b.disabled = disabled
  b.addEventListener('click', onClick)
  return b
}

// An item's still, drawn by the shell once the 3D has loaded
// (dialshell.ts showItems, itemthumbs.ts icon): empty until then.
export function itemIcon(kind: string): HTMLImageElement {
  const img = el('img', 'bv-dial-item-icon')
  img.dataset.kind = kind
  img.alt = ''
  return img
}

// The opened row's turntable, in canvas pixels: twice its CSS size.
const SPIN_PX = 256

// A list of items, each its still, label and count, opening to its
// turntable, its blurb, its stats (itemstatsview.ts, as the 3D valley's pack card shows them) and
// its buttons when tapped.
function itemRows(
  items: readonly PackItem[],
  empty: string,
  open: Opened,
  actionsOf: (item: PackItem) => HTMLElement[],
  // What else the opened row says, above its buttons.
  detailOf: (item: PackItem) => HTMLElement | null = () => null
): HTMLElement {
  const list = el('ul', 'bv-dial-items')
  if (items.length === 0) {
    list.append(text('li', empty, 'bv-dial-note'))
    return list
  }
  for (const item of items) {
    const row = el('li', 'bv-dial-item')
    row.dataset.kind = item.kind
    const head = el('details')
    head.open = open.kind === item.kind
    head.addEventListener('toggle', () => {
      if (head.open) open.kind = item.kind
      else if (open.kind === item.kind) open.kind = null
    })
    const summary = el('summary', 'bv-dial-item-head')
    summary.append(
      itemIcon(item.kind),
      text('span', item.label, 'bv-dial-item-name'),
      text(
        'span',
        copy('dialup.pack.count', { count: item.stock }),
        'bv-dial-item-count'
      )
    )
    const body = el('div', 'bv-dial-item-body')
    const spin = el('canvas', 'bv-dial-item-spin')
    spin.dataset.kind = item.kind
    spin.width = SPIN_PX
    spin.height = SPIN_PX
    body.append(
      spin,
      text('p', item.blurb, 'bv-dial-item-blurb'),
      ...statsView(item.kind)
    )
    const detail = detailOf(item)
    if (detail) body.append(detail)
    // A key item in the locker sheet has nothing a phone can do with it.
    const actions = actionsOf(item)
    if (actions.length > 0) {
      const buttons = el('div', 'bv-dial-row')
      buttons.append(...actions)
      body.append(buttons)
    }
    head.append(summary, body)
    row.append(head)
    list.append(row)
  }
  return list
}
