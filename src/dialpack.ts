// Bull Valley Dial-Up's pack and locker (sharedworld.ts rule 29): the
// pack's tabs as the 3D valley's (packgrid.ts, packtabs.ts), each item a
// row to tap open, with what it can do from a phone: stow one or all into
// the locker (never a key item), and put it on the hotbar (tap the button, then a slot). The
// locker lists what it holds the same way, to take out one or all. Never a
// use or a drop: those take a body. Every move is the valley's to make;
// the screen asks and redraws when the pack frame lands.

import { copy } from './copy.ts'
import { el, text } from './dom.ts'
import { assign, HOTBAR_SLOTS } from './hotbar.ts'
import { itemLabel } from './itemcopy.ts'
import { isKeyItem } from './items.ts'
import { PACK_TABS, packItems, stashItems } from './packgrid.ts'
import { BAG_TABS } from './packtabs.ts'
import { moveAmount } from './stash.ts'
import type { DialState } from './dialstate.ts'
import type { Hotbar } from './hotbar.ts'
import type { PackItem } from './interfaces.ts'
import type { PackTab } from './packgrid.ts'

export interface PackActions {
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
    const list = itemRows(items, BAG_TABS[this.tab].empty, this.open, (item) =>
      this.rowActions(s, item)
    )
    this.root.replaceChildren(tabs, list, this.bar(s))
  }

  private rowActions(s: DialState, item: PackItem): HTMLElement[] {
    const held = s.pack[item.kind] ?? 0
    const busy = s.pending.locker
    // A key item stays in the pack (items.ts isKeyItem).
    const stow = isKeyItem(item.kind)
      ? []
      : [
          button(copy('dialup.pack.stow_one'), busy, () =>
            this.actions.move(
              'stow',
              item.kind,
              moveAmount(item.kind, held, false)
            )
          ),
          button(copy('dialup.pack.stow_all'), busy, () =>
            this.actions.move('stow', item.kind, held)
          ),
        ]
    return [
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
        this.hotbar = assign(this.hotbar, slot, placing)
        this.actions.saveHotbar(
          this.hotbar,
          copy('dialup.pack.hotbar_saved', {
            item: itemLabel(placing),
            slot: slot + 1,
          })
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

// The locker sheet: everything it holds, to take out.
export function renderLocker(
  root: HTMLElement,
  s: DialState,
  actions: PackActions,
  open: Opened
): void {
  const busy = s.pending.locker
  const list = itemRows(
    stashItems(s.stash),
    BAG_TABS.locker.empty,
    open,
    (item) => {
      const held = s.stash[item.kind] ?? 0
      return [
        button(copy('dialup.pack.take_one'), busy, () =>
          actions.move('unstow', item.kind, moveAmount(item.kind, held, false))
        ),
        button(copy('dialup.pack.take_all'), busy, () =>
          actions.move('unstow', item.kind, held)
        ),
      ]
    }
  )
  root.replaceChildren(list)
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

// A list of items, each its label and count, opening to its blurb and its
// buttons when tapped.
function itemRows(
  items: readonly PackItem[],
  empty: string,
  open: Opened,
  actionsOf: (item: PackItem) => HTMLElement[]
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
      text('span', item.label, 'bv-dial-item-name'),
      text(
        'span',
        copy('dialup.pack.count', { count: item.stock }),
        'bv-dial-item-count'
      )
    )
    const body = el('div', 'bv-dial-item-body')
    body.append(text('p', item.blurb, 'bv-dial-item-blurb'))
    const buttons = el('div', 'bv-dial-row')
    buttons.append(...actionsOf(item))
    body.append(buttons)
    head.append(summary, body)
    row.append(head)
    list.append(row)
  }
  return list
}
