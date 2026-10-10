// The pack as seen (packgrid.ts): the grid of items over the valley with
// the pointer free, its tabs, the item card beside the hovered cell, the
// right-click menu, a drag onto the hotbar, and the hotbar itself along
// the bottom. Hud builds it as hud.pack and delegates to it; actions.ts
// fills the grid and hears the mouse, input.ts reads the hovered item for
// the keys, and loop.ts feeds the hotbar every frame.

import { PACK, PACK_MOUSE } from './bindings.ts'
import { copy } from './copy.ts'
import { el, text } from './dom.ts'
import { HOTBAR_SLOTS } from './hotbar.ts'
import { bagTabs, LOCKER_TAB, PACK_TABS } from './packgrid.ts'
import type { Binding, MouseBinding } from './bindings.ts'
import type { Cooldown } from './hotbar.ts'
import type { PackItem } from './interfaces.ts'
import type { BagAction, BagTab } from './packgrid.ts'

// One hotbar slot as setHotbar draws it: slot 0 is key 1. icon is the
// item's still (itemthumbs.ts).
export interface HotbarSlotView {
  slot: number
  item: PackItem
  icon: string
  cooldown: Cooldown | null
}

// The line along the foot of the pack grid.
export interface BagStatus {
  // Formatted, like "$40.00".
  cash: string
}

// The gap between a grid cell and the item card beside it, and the card's
// least distance from the edge of the screen, in CSS pixels.
const CARD_GAP = 8
// The card's turntable, in CSS pixels; styles.css sizes it to match.
const CARD_VIEW_PX = 144
// Cells a row in the pack grid (styles.css .bv-bag-grid); the last row is
// filled out with empty slots.
const BAG_COLUMNS = 8

// How far the cursor moves, in px, before a press on an item is a drag.
const DRAG_START = 6

// Where a pointer event is, as a drag remembers its start.
function at(e: PointerEvent): { x: number; y: number } {
  return { x: e.clientX, y: e.clientY }
}

// Each pack tab's label, and the line its grid shows when empty.
const BAG_TABS: Record<BagTab, { label: string; empty: string }> = {
  consumables: {
    label: copy('inventory.tab_consumables'),
    empty: copy('inventory.empty_consumables'),
  },
  loot: {
    label: copy('inventory.tab_loot'),
    empty: copy('inventory.empty_loot'),
  },
  materials: {
    label: copy('inventory.tab_materials'),
    empty: copy('inventory.empty_materials'),
  },
  locker: {
    label: copy('inventory.tab_locker'),
    empty: copy('inventory.empty_locker'),
  },
}

// How many of an item the pack holds, and what is left in the open pack or
// bottle when it holds several.
function quantity({ stock, left }: PackItem): string {
  return left === null
    ? copy('inventory.quantity', { count: stock })
    : copy('inventory.quantity_left', { count: stock, left })
}

export class PackHud {
  // The shell (hud.ts root): its classes say the pack or the hotbar is
  // up, and the drag's ghost rides over it.
  shell: HTMLElement
  bag: HTMLElement
  tabs: Map<BagTab, HTMLButtonElement>
  grid: HTMLDivElement
  empty: HTMLParagraphElement
  cash: HTMLElement
  // The tab the grid shows.
  tab: BagTab = PACK_TABS[0]
  // Opened at the locker: the Locker tab shows, and F moves an item into
  // the locker or out of it.
  atLocker = false
  // Told when a tab is clicked, to fill the grid with it.
  onTab: ((tab: BagTab) => void) | null = null
  items: PackItem[] = []
  key = ''
  // The item under the cursor (or focus) in the grid, whose card shows.
  hovered: PackItem | null = null
  // Told whenever the hovered item changes, to spin it on the card.
  onHover: ((item: PackItem | null) => void) | null = null
  // The item clicked in the grid: its card stays, and the keys act on it,
  // whenever the cursor is over no other item.
  selected: string | null = null
  // Told what the mouse did in the pack or on the hotbar (actions.ts).
  onAction: ((action: BagAction) => void) | null = null
  // The right-click menu over an item, and the item it is for.
  menu: HTMLDivElement
  menuKind: string | null = null
  // A drag under way, from the grid (from null) or off a hotbar slot; the
  // ghost follows the cursor once it has moved far enough to be a drag.
  private drag: {
    kind: string
    from: number | null
    icon: string
    x: number
    y: number
    ghost: HTMLImageElement | null
  } | null = null
  card: HTMLDivElement
  cardCanvas: HTMLCanvasElement
  cardName: HTMLElement
  cardBlurb: HTMLElement
  cardQuantity: HTMLElement
  // E and the double-click, dimmed for an item that is not used.
  cardUse: HTMLElement[]
  // The pack's own keys on the card, and the locker's: the label beside F
  // says which way it moves.
  cardPackKeys: HTMLElement[]
  cardStowKeys: HTMLElement[]
  cardStowLabels: HTMLElement[]
  hotbar: HTMLOListElement
  hotbarKey = ''
  hotbarSlots: { li: HTMLLIElement; cd: HTMLElement; view: string }[] = []

  constructor(shell: HTMLElement, ui: HTMLElement) {
    this.shell = shell

    // The pack: a grid of items over the valley, with the pointer free. The
    // card beside the hovered cell spins the item on a canvas of its own
    // (itemthumbs.ts draws it).
    this.bag = el('section', 'bv-bag')
    this.bag.setAttribute('role', 'dialog')
    this.bag.setAttribute('aria-label', copy('inventory.label'))
    this.bag.hidden = true
    // The right-click menu: every way to move an item, by name. It goes in
    // after the card, over it.
    this.menu = el('div', 'bv-bag-menu')
    this.menu.setAttribute('role', 'menu')
    this.menu.hidden = true
    // The tabs over the grid, which is their one panel.
    const tabs = el('div', 'bv-bag-tabs')
    tabs.setAttribute('role', 'tablist')
    tabs.setAttribute('aria-label', copy('inventory.label'))
    this.tabs = new Map(
      bagTabs(true).map((tab) => {
        const button = text('button', BAG_TABS[tab].label, 'bv-bag-tab')
        button.type = 'button'
        button.id = `bv-bag-tab-${tab}`
        button.setAttribute('role', 'tab')
        button.setAttribute('aria-controls', 'bv-bag-panel')
        button.addEventListener('click', () => this.onTab?.(tab))
        button.hidden = tab === LOCKER_TAB
        tabs.appendChild(button)
        return [tab, button]
      })
    )
    this.grid = el('div', 'bv-bag-grid')
    this.grid.id = 'bv-bag-panel'
    this.grid.setAttribute('role', 'tabpanel')
    this.empty = el('p', 'bv-bag-empty')
    const status = el('dl', 'bv-bag-status')
    const stat = (label: string) => {
      const dd = document.createElement('dd')
      const pair = el('div')
      pair.append(text('dt', label), dd)
      status.appendChild(pair)
      return dd
    }
    this.cash = stat(copy('inventory.cash'))
    this.cash.dataset.bv = 'inv-cash'
    // Along the foot: the status, and the keys that switch tabs and close
    // the pack.
    const foot = el('div', 'bv-bag-foot')
    const footKeys = el('p', 'bv-bag-keys')
    footKeys.append(
      text('kbd', PACK.prevTab.key),
      ' ',
      text('kbd', PACK.nextTab.key),
      ` ${copy(PACK.nextTab.labelKey)} `,
      text('kbd', PACK.clearSlot.key),
      ` ${copy(PACK.clearSlot.labelKey)} `,
      text('kbd', PACK.close.key),
      ` ${copy(PACK.close.labelKey)}`
    )
    foot.append(status, footKeys)
    // The empty line lies over the grid's empty row, so switching to an
    // empty tab never changes the pack's height.
    const panel = el('div', 'bv-bag-panel')
    panel.append(this.grid, this.empty)
    this.bag.append(tabs, panel, foot)
    this.selectTab(this.tab)
    // Moving across the gaps between cells keeps the card; leaving the
    // grid drops it.
    const hoverFrom = (target: EventTarget | null) => {
      const cell =
        target instanceof Element
          ? target.closest<HTMLElement>('.bv-bag-cell')
          : null
      if (cell) this.hoverCell(cell)
    }
    this.grid.addEventListener('pointerover', (e) => hoverFrom(e.target))
    this.grid.addEventListener('focusin', (e) => hoverFrom(e.target))
    this.grid.addEventListener('pointerleave', () => {
      if (!this.grid.contains(document.activeElement)) this.hoverCell(null)
    })
    this.grid.addEventListener('focusout', (e) => {
      if (!this.grid.contains(e.relatedTarget as Node | null)) {
        this.hoverCell(null)
      }
    })
    ui.appendChild(this.bag)

    // The card lives in the pack, so it reads as part of the dialog; it is
    // placed against the pack's own box.
    this.card = el('div', 'bv-bag-card')
    this.card.hidden = true
    this.cardCanvas = el('canvas', 'bv-bag-card-view')
    // Drawn at the screen's own density; the stylesheet sets its CSS size.
    this.cardCanvas.width = this.cardCanvas.height = Math.round(
      CARD_VIEW_PX * window.devicePixelRatio
    )
    this.cardCanvas.setAttribute('aria-hidden', 'true')
    this.cardName = el('h3', 'bv-bag-card-name')
    this.cardBlurb = el('p', 'bv-bag-card-blurb')
    this.cardQuantity = el('p', 'bv-bag-card-quantity')
    const keys = el('ul', 'bv-bag-card-keys')
    const keyItem = ({ key, labelKey }: Binding) => {
      const li = document.createElement('li')
      const label = text('span', copy(labelKey))
      li.append(text('kbd', key), ' ', label)
      keys.appendChild(li)
      return { li, label }
    }
    // The mouse's buttons, named as the keys are.
    const mouseItem = ({ buttonKey, labelKey }: MouseBinding) =>
      keyItem({ codes: [], key: copy(buttonKey), labelKey })
    const use = keyItem(PACK.use).li
    const assign = keyItem(PACK.assign).li
    const drop = [keyItem(PACK.drop).li, keyItem(PACK.dropAll).li]
    const useMouse = mouseItem(PACK_MOUSE.use).li
    this.cardUse = [use, useMouse]
    this.cardPackKeys = [
      use,
      assign,
      ...drop,
      useMouse,
      mouseItem(PACK_MOUSE.assign).li,
    ]
    const stow = [
      keyItem(PACK.stow),
      keyItem(PACK.stowAll),
      mouseItem(PACK_MOUSE.moveAll),
    ]
    this.cardStowKeys = stow.map(({ li }) => li)
    this.cardStowLabels = stow.map(({ label }) => label)
    mouseItem(PACK_MOUSE.menu)
    this.card.append(
      this.cardCanvas,
      this.cardName,
      this.cardBlurb,
      this.cardQuantity,
      keys
    )
    this.bag.appendChild(this.card)

    this.bag.appendChild(this.menu)

    // The hotbar: the assigned slots, in number order, along the bottom.
    this.hotbar = el('ol', 'bv-hotbar')
    this.hotbar.setAttribute('aria-label', copy('inventory.hotbar_label'))
    this.hotbar.hidden = true
    ui.appendChild(this.hotbar)
    this.wireMouse()
  }

  // At the locker or not: the Locker tab shows, and the card's keys say
  // what F does.
  setLocker(open: boolean): void {
    this.atLocker = open
    const locker = this.tabs.get(LOCKER_TAB)
    if (locker) locker.hidden = !open
  }

  // Marks `tab` as the one the grid shows; set fills it.
  selectTab(tab: BagTab): void {
    this.tab = tab
    this.selected = null
    this.closeMenu()
    for (const [one, button] of this.tabs) {
      const selected = one === tab
      button.setAttribute('aria-selected', String(selected))
      button.tabIndex = selected ? 0 : -1
    }
    this.grid.setAttribute('aria-labelledby', `bv-bag-tab-${tab}`)
    this.empty.textContent = BAG_TABS[tab].empty
  }

  // The shown tab's items (packgrid.ts entries) as grid cells. The cells
  // are rebuilt only when the tab, a kind or a count changes; the card
  // follows.
  set(items: PackItem[], iconOf: (kind: string) => string): void {
    const key = [
      this.tab,
      ...items.map((item) => `${item.kind}:${item.stock}:${item.left}`),
    ].join(',')
    if (key === this.key) return
    this.key = key
    this.items = items
    const has = (kind: string | null) => items.some((one) => one.kind === kind)
    if (!has(this.selected)) this.selected = null
    if (!has(this.menuKind)) this.closeMenu()
    const hovered = this.hovered?.kind
    const focused =
      document.activeElement instanceof HTMLElement
        ? document.activeElement.dataset.kind
        : undefined
    this.grid.replaceChildren(
      ...items.map((item) => {
        const cell = el('button', 'bv-bag-cell')
        cell.type = 'button'
        cell.dataset.kind = item.kind
        cell.classList.toggle(
          'bv-bag-cell--selected',
          item.kind === this.selected
        )
        cell.setAttribute('aria-label', `${item.label}, ${quantity(item)}`)
        const img = el('img')
        img.src = iconOf(item.kind)
        img.alt = ''
        img.draggable = false
        cell.appendChild(img)
        if (item.stock > 1) {
          cell.appendChild(text('span', String(item.stock), 'bv-bag-count'))
        }
        return cell
      }),
      ...Array.from(
        {
          length:
            Math.max(
              BAG_COLUMNS,
              Math.ceil(items.length / BAG_COLUMNS) * BAG_COLUMNS
            ) - items.length,
        },
        () => {
          const slot = el('span', 'bv-bag-cell bv-bag-cell--empty')
          slot.setAttribute('aria-hidden', 'true')
          return slot
        }
      )
    )
    this.empty.hidden = items.length > 0
    if (focused) this.cellOf(focused)?.focus()
    const again = hovered ? this.cellOf(hovered) : null
    this.hoverCell(again)
  }

  private cellOf(kind: string): HTMLElement | null {
    return (
      [...this.grid.querySelectorAll<HTMLElement>('.bv-bag-cell')].find(
        (cell) => cell.dataset.kind === kind
      ) ?? null
    )
  }

  // The card beside a cell, or none. It sits to the right of the cell, or
  // to the left where the right would run off the screen.
  private hoverCell(hovered: HTMLElement | null): void {
    // Off every item, the selected one keeps its card.
    const cell = hovered ?? (this.selected ? this.cellOf(this.selected) : null)
    const item = cell
      ? (this.items.find((one) => one.kind === cell.dataset.kind) ?? null)
      : null
    const changed = item?.kind !== this.hovered?.kind
    this.hovered = item
    this.card.hidden = !item
    if (cell && item) {
      this.cardName.textContent = item.label
      this.cardBlurb.textContent = item.blurb
      this.cardQuantity.textContent = quantity(item)
      for (const li of this.cardUse) {
        li.classList.toggle('bv-bag-card-key--dim', !item.canUse)
      }
      // In the locker only F moves it; at the locker F moves the pack's
      // items in too.
      const inLocker = this.tab === LOCKER_TAB
      for (const li of this.cardPackKeys) li.hidden = inLocker
      for (const li of this.cardStowKeys) li.hidden = !this.atLocker
      const [one, all, allMouse] = this.cardStowLabels
      one.textContent = copy(inLocker ? 'keys.unstow' : PACK.stow.labelKey)
      all.textContent = copy(
        inLocker ? 'keys.unstow_all' : PACK.stowAll.labelKey
      )
      allMouse.textContent = all.textContent
      const at = cell.getBoundingClientRect()
      const box = this.bag.getBoundingClientRect()
      const width = this.card.offsetWidth
      const height = this.card.offsetHeight
      const right = at.right + CARD_GAP
      const left =
        right + width <= window.innerWidth - CARD_GAP
          ? right
          : Math.max(CARD_GAP, at.left - CARD_GAP - width)
      const top = Math.max(
        CARD_GAP,
        Math.min(at.top, window.innerHeight - height - CARD_GAP)
      )
      this.card.style.left = `${left - box.left}px`
      this.card.style.top = `${top - box.top}px`
    }
    if (changed) this.onHover?.(item)
  }

  // The mouse in the open pack: a click selects an item (again, or past
  // every item, lets it go), Shift-click at the locker moves the stack, a
  // double-click uses it, a right-click opens its menu, and a drag puts it
  // on a hotbar slot. On the bar, a slot dragged off or right-clicked
  // empties. The document hears the pointer only while a drag is under way
  // (dragMove, dragEnd) or the menu is open (pressOutside).
  private wireMouse(): void {
    const itemCell = (target: EventTarget | null) =>
      target instanceof Element
        ? target.closest<HTMLElement>('.bv-bag-cell:not(.bv-bag-cell--empty)')
        : null
    const slotOf = (target: EventTarget | null) =>
      target instanceof Element
        ? target.closest<HTMLElement>('.bv-hot-slot')
        : null
    this.bag.addEventListener('click', (e) => {
      const cell = itemCell(e.target)
      const kind = cell?.dataset.kind
      if (!cell || !kind) {
        if (!this.menu.contains(e.target as Node)) this.selectItem(null)
        return
      }
      if (e.shiftKey) {
        if (this.atLocker) this.onAction?.({ type: 'move', kind, all: true })
        return
      }
      // The second click of a double-click is the double-click's.
      if (e.detail > 1) return
      this.selectItem(this.selected === kind ? null : kind, cell)
    })
    this.grid.addEventListener('dblclick', (e) => {
      const kind = itemCell(e.target)?.dataset.kind
      const item = this.items.find((one) => one.kind === kind)
      if (!item?.canUse || e.shiftKey || this.tab === LOCKER_TAB) return
      this.onAction?.({ type: 'use', kind: item.kind })
    })
    this.bag.addEventListener('contextmenu', (e) => {
      e.preventDefault()
      const cell = itemCell(e.target)
      const item = this.items.find((one) => one.kind === cell?.dataset.kind)
      if (!cell || !item) return
      this.selectItem(item.kind, cell)
      this.openMenu(item, e.clientX, e.clientY)
    })
    this.grid.addEventListener('pointerdown', (e) => {
      const cell = itemCell(e.target)
      const kind = cell?.dataset.kind
      if (e.button !== 0 || e.shiftKey || !kind) return
      if (this.tab === LOCKER_TAB) return
      const icon = cell.querySelector('img')?.src ?? ''
      this.startDrag({ kind, from: null, icon, ...at(e), ghost: null })
    })
    this.hotbar.addEventListener('pointerdown', (e) => {
      const li = slotOf(e.target)
      const kind = li?.dataset.kind
      if (e.button !== 0 || this.bag.hidden || !li || !kind) return
      const icon = li.querySelector('img')?.src ?? ''
      const from = Number(li.dataset.slot)
      this.startDrag({ kind, from, icon, ...at(e), ghost: null })
    })
    this.hotbar.addEventListener('contextmenu', (e) => {
      if (this.bag.hidden) return
      e.preventDefault()
      const li = slotOf(e.target)
      if (li?.dataset.kind) {
        this.onAction?.({ type: 'clear', slot: Number(li.dataset.slot) })
      }
    })
  }

  // A press anywhere past the menu closes it.
  private readonly pressOutside = (e: PointerEvent): void => {
    if (!this.menu.contains(e.target as Node)) this.closeMenu()
  }

  private startDrag(drag: NonNullable<PackHud['drag']>): void {
    this.drag = drag
    document.addEventListener('pointermove', this.dragMove)
    document.addEventListener('pointerup', this.dragEnd)
  }

  private readonly dragMove = (e: PointerEvent): void => {
    const drag = this.drag
    if (!drag) return
    if (!drag.ghost) {
      if (Math.hypot(e.clientX - drag.x, e.clientY - drag.y) < DRAG_START) {
        return
      }
      drag.ghost = el('img', 'bv-drag-ghost')
      drag.ghost.src = drag.icon
      drag.ghost.alt = ''
      this.shell.appendChild(drag.ghost)
    }
    drag.ghost.style.left = `${e.clientX}px`
    drag.ghost.style.top = `${e.clientY}px`
    const target = this.slotAt(e.clientX, e.clientY)
    for (const li of this.hotbar.children) {
      li.classList.toggle(
        'bv-hot-slot--target',
        li instanceof HTMLElement && Number(li.dataset.slot) === target
      )
    }
  }

  private readonly dragEnd = (e: PointerEvent): void => {
    const drag = this.drag
    if (!drag?.ghost) {
      this.endDrag()
      return
    }
    const target = this.slotAt(e.clientX, e.clientY)
    this.endDrag()
    // The click a drag ends in selects nothing and closes nothing.
    const swallow = (click: Event) => click.stopPropagation()
    window.addEventListener('click', swallow, { capture: true, once: true })
    setTimeout(() => window.removeEventListener('click', swallow, true))
    if (target !== null) {
      if (target !== drag.from) {
        this.onAction?.({ type: 'place', slot: target, kind: drag.kind })
      }
    } else if (drag.from !== null) {
      this.onAction?.({ type: 'clear', slot: drag.from })
    }
  }

  // The hotbar slot under a point on the screen, or null.
  private slotAt(x: number, y: number): number | null {
    const hit = document.elementFromPoint(x, y)
    const li = hit?.closest<HTMLElement>('.bv-hot-slot')
    return li && this.hotbar.contains(li) ? Number(li.dataset.slot) : null
  }

  private endDrag(): void {
    this.drag?.ghost?.remove()
    this.drag = null
    document.removeEventListener('pointermove', this.dragMove)
    document.removeEventListener('pointerup', this.dragEnd)
    for (const li of this.hotbar.children) {
      li.classList.remove('bv-hot-slot--target')
    }
  }

  // Selects kind in the grid, or none; its card shows (or the one under
  // the cursor, `hovered`).
  private selectItem(kind: string | null, hovered?: HTMLElement): void {
    this.selected = kind
    for (const cell of this.grid.querySelectorAll<HTMLElement>(
      '.bv-bag-cell'
    )) {
      cell.classList.toggle(
        'bv-bag-cell--selected',
        kind !== null && cell.dataset.kind === kind
      )
    }
    this.hoverCell(hovered ?? null)
  }

  // The right-click menu for item, at the cursor: use, put on a slot, drop
  // one or the stack, and at the locker move one or the stack the other
  // way. In the locker only the moves.
  private openMenu(item: PackItem, x: number, y: number): void {
    const { kind } = item
    const inLocker = this.tab === LOCKER_TAB
    const button = (label: string, action: BagAction, className: string) => {
      const one = text('button', label, className)
      one.type = 'button'
      one.setAttribute('role', 'menuitem')
      one.addEventListener('click', () => {
        this.closeMenu()
        this.onAction?.(action)
      })
      return one
    }
    const entry = (labelKey: string, action: BagAction) =>
      button(copy(labelKey), action, 'bv-bag-menu-item')
    const entries: HTMLElement[] = []
    if (!inLocker) {
      if (item.canUse)
        entries.push(entry(PACK.use.labelKey, { type: 'use', kind }))
      const slots = el('div', 'bv-bag-menu-slots')
      slots.append(text('span', copy(PACK.assign.labelKey)))
      for (let slot = 0; slot < HOTBAR_SLOTS; slot++) {
        slots.append(
          button(
            String(slot + 1),
            { type: 'place', slot, kind },
            'bv-bag-menu-slot'
          )
        )
      }
      entries.push(
        slots,
        entry(PACK.drop.labelKey, { type: 'drop', kind, all: false }),
        entry(PACK.dropAll.labelKey, { type: 'drop', kind, all: true })
      )
    }
    if (this.atLocker) {
      entries.push(
        entry(inLocker ? 'keys.unstow' : PACK.stow.labelKey, {
          type: 'move',
          kind,
          all: false,
        }),
        entry(inLocker ? 'keys.unstow_all' : PACK.stowAll.labelKey, {
          type: 'move',
          kind,
          all: true,
        })
      )
    }
    if (entries.length < 1) return
    this.menu.replaceChildren(...entries)
    this.menu.hidden = false
    this.menuKind = kind
    document.addEventListener('pointerdown', this.pressOutside, true)
    const box = this.bag.getBoundingClientRect()
    const left = Math.min(
      x,
      window.innerWidth - this.menu.offsetWidth - CARD_GAP
    )
    const top = Math.min(
      y,
      window.innerHeight - this.menu.offsetHeight - CARD_GAP
    )
    this.menu.style.left = `${left - box.left}px`
    this.menu.style.top = `${top - box.top}px`
  }

  closeMenu(): void {
    this.menu.hidden = true
    this.menuKind = null
    document.removeEventListener('pointerdown', this.pressOutside, true)
  }

  setStatus({ cash }: BagStatus): void {
    if (this.cash.textContent !== cash) this.cash.textContent = cash
  }

  show(show: boolean): boolean {
    this.bag.hidden = !show
    this.shell.classList.toggle('bv-shell--inventory', show)
    if (!show) {
      this.selected = null
      this.closeMenu()
      this.endDrag()
      this.hoverCell(null)
    }
    return show
  }

  // The loop calls this every frame. The slots are rebuilt only when what
  // they hold changes; the cooldown sweeps are touched only when they move.
  // With the pack open every slot shows, the empty ones too, so an item
  // can be dragged onto any of them.
  setHotbar(slots: HotbarSlotView[]): void {
    const open = !this.bag.hidden
    const key = [
      open ? 'open' : 'shut',
      ...slots.map(
        ({ slot, item }) => `${slot}:${item.kind}:${item.stock}:${item.left}`
      ),
    ].join(',')
    if (key !== this.hotbarKey) {
      this.hotbarKey = key
      const views = new Map(slots.map((view) => [view.slot, view]))
      const shown = open
        ? Array.from({ length: HOTBAR_SLOTS }, (_, slot) => slot)
        : slots.map(({ slot }) => slot)
      const lis: HTMLLIElement[] = []
      this.hotbarSlots = []
      for (const slot of shown) {
        const view = views.get(slot)
        if (!view) {
          const li = el('li', 'bv-hot-slot bv-hot-slot--empty')
          li.dataset.slot = String(slot)
          li.setAttribute(
            'aria-label',
            `${slot + 1}: ${copy('inventory.hotbar_empty')}`
          )
          li.append(text('span', String(slot + 1), 'bv-hot-key'))
          lis.push(li)
          continue
        }
        const { item, icon } = view
        const li = el('li', 'bv-hot-slot')
        li.dataset.slot = String(slot)
        li.dataset.kind = item.kind
        li.classList.toggle('bv-hot-slot--out', item.stock < 1)
        li.setAttribute(
          'aria-label',
          `${slot + 1}: ${item.label}, ${quantity(item)}`
        )
        const img = el('img')
        img.src = icon
        img.alt = ''
        img.draggable = false
        const cd = el('span', 'bv-hot-cd')
        cd.setAttribute('aria-hidden', 'true')
        li.append(
          img,
          cd,
          text('span', String(slot + 1), 'bv-hot-key'),
          text('span', String(item.stock), 'bv-hot-count')
        )
        this.hotbarSlots.push({ li, cd, view: '' })
        lis.push(li)
      }
      this.hotbar.replaceChildren(...lis)
      this.hotbar.hidden = lis.length < 1
      this.shell.classList.toggle('bv-shell--hotbar', lis.length > 0)
    }
    slots.forEach(({ cooldown }, i) => {
      const shown = this.hotbarSlots[i]
      const view = cooldown
        ? `${cooldown.phase}:${cooldown.fraction.toFixed(3)}:${cooldown.seconds}`
        : ''
      if (view === shown.view) return
      shown.view = view
      shown.li.dataset.cooldown = cooldown?.phase ?? ''
      shown.li.style.setProperty('--cd', cooldown ? view.split(':')[1] : '0')
      shown.cd.textContent = cooldown ? String(cooldown.seconds) : ''
    })
  }
}
