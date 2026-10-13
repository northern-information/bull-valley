// Pure: every key the game answers to, in one place. Each binding carries
// the KeyboardEvent.code values that fire it, the key as players see it,
// and the COPY.toml key for what it does ([keys]). input.ts and player.ts
// look actions up here instead of comparing raw codes; hud.ts draws the
// intro table and the pack card's keys from the same entries, so the copy
// cannot drift from the dispatcher. The words stay in COPY.toml, not here,
// so this table stays importable anywhere (the e2e specs read it).

export interface Binding {
  // KeyboardEvent.code values. Empty for a control the browser owns (the
  // mouse, and Esc, which drops pointer lock), or for another binding's
  // key held with a modifier (Shift+X), which that binding's handler reads.
  codes: readonly string[]
  // The key, as shown to players.
  key: string
  // What it does: a COPY.toml key, shown through copy().
  labelKey: string
}

// The movement keys, one per direction, so player.ts can turn them into
// an axis.
export const MOVE = {
  forward: 'KeyW',
  left: 'KeyA',
  back: 'KeyS',
  right: 'KeyD',
} as const

// The number keys, slot 0 first: each one fires its hotbar slot in the
// valley and assigns to it in the pack.
const HOTBAR_CODES: readonly string[] = Array.from(
  { length: 9 }, // hotbar.ts HOTBAR_SLOTS; that module reads copy, this one cannot
  (_, i) => `Digit${i + 1}`
)

// In the valley, with the pointer locked and the pack closed. Listed in
// the order the intro table reads them, two to a row.
export const WORLD = {
  move: { codes: Object.values(MOVE), key: 'WASD', labelKey: 'keys.move' },
  sprint: {
    codes: ['ShiftLeft', 'ShiftRight'],
    key: 'Shift',
    labelKey: 'keys.sprint',
  },
  look: { codes: [], key: 'Mouse', labelKey: 'keys.look' },
  flashlight: { codes: [], key: 'Left Click', labelKey: 'keys.flashlight' },
  crouch: { codes: ['KeyC'], key: 'C', labelKey: 'keys.crouch' },
  scope: { codes: ['KeyQ'], key: 'Q', labelKey: 'keys.scope' },
  inventory: { codes: ['Tab'], key: 'Tab', labelKey: 'keys.inventory' },
  book: { codes: ['KeyB'], key: 'B', labelKey: 'keys.book' },
  interact: { codes: ['KeyE'], key: 'E', labelKey: 'keys.interact' },
  callTruck: { codes: ['KeyT'], key: 'T', labelKey: 'keys.call_truck' },
  // The last thing used, to the raider in reach in front of you.
  pass: { codes: ['KeyG'], key: 'G', labelKey: 'keys.pass' },
  hotbar: { codes: HOTBAR_CODES, key: '1–9', labelKey: 'keys.hotbar' },
  chat: {
    codes: ['Enter', 'NumpadEnter'],
    key: 'Enter',
    labelKey: 'keys.chat',
  },
  pause: { codes: [], key: 'Esc', labelKey: 'keys.pause' },
} as const satisfies Record<string, Binding>

// With the chat field open every other key types; these scroll the log.
export const CHAT = {
  scrollUp: { codes: ['PageUp'], key: 'PgUp', labelKey: 'keys.chat_scroll_up' },
  scrollDown: {
    codes: ['PageDown'],
    key: 'PgDn',
    labelKey: 'keys.chat_scroll_down',
  },
} as const satisfies Record<string, Binding>

// With the pack open: these act on the item under the cursor or switch
// the tab, and nothing reaches the player. Enter is a quiet alias for E,
// the arrows for A and D, and Esc for Tab, since the pointer is free and
// Esc no longer drops a lock.
export const PACK = {
  use: { codes: ['KeyE', 'Enter'], key: 'E', labelKey: 'keys.use' },
  // The item to the raider in reach in front of you.
  pass: { codes: ['KeyG'], key: 'G', labelKey: 'keys.pass_item' },
  assign: { codes: HOTBAR_CODES, key: '1–9', labelKey: 'keys.assign' },
  // The same keys with nothing under the cursor empty that slot (input.ts
  // reads the hover).
  clearSlot: { codes: [], key: '1–9', labelKey: 'keys.clear_slot' },
  // One of the item; with Shift, the whole stack (input.ts reads Shift).
  drop: { codes: ['KeyX'], key: 'X', labelKey: 'keys.drop' },
  dropAll: { codes: [], key: 'Shift+X', labelKey: 'keys.drop_all' },
  // At the locker: one into it off a pack tab, or out of it on the Locker
  // tab; with Shift, the whole stack (input.ts reads Shift).
  stow: { codes: ['KeyF'], key: 'F', labelKey: 'keys.stow' },
  stowAll: { codes: [], key: 'Shift+F', labelKey: 'keys.stow_all' },
  prevTab: {
    codes: ['KeyA', 'ArrowLeft'],
    key: 'A',
    labelKey: 'keys.switch_tab',
  },
  nextTab: {
    codes: ['KeyD', 'ArrowRight'],
    key: 'D',
    labelKey: 'keys.switch_tab',
  },
  close: { codes: ['Tab', 'Escape'], key: 'Tab', labelKey: 'keys.close' },
} as const satisfies Record<string, Binding>

// The mouse in the open pack (hud.ts), as its card names it: buttonKey is
// the COPY.toml key of the button's name, since a mouse has no key label.
export interface MouseBinding {
  buttonKey: string
  labelKey: string
}

// A click pins an item's card, a double-click uses it, a drag puts it on a
// hotbar slot (and a slot dragged off the bar, or right-clicked, empties
// it), a right-click opens its menu, and at the locker a Shift-click moves
// the stack the other way.
export const PACK_MOUSE = {
  use: { buttonKey: 'keys.mouse_double', labelKey: 'keys.use' },
  assign: { buttonKey: 'keys.mouse_drag', labelKey: 'keys.to_hotbar' },
  menu: { buttonKey: 'keys.mouse_right', labelKey: 'keys.more' },
  moveAll: { buttonKey: 'keys.mouse_shift_click', labelKey: 'keys.stow_all' },
} as const satisfies Record<string, MouseBinding>

// With the Book of Shadows open (bookhud.ts): A and D switch the chapter,
// W and S turn to the entry above or below, and B or Esc closes it. The
// arrows are quiet aliases, as in the pack.
export const BOOK = {
  prevChapter: {
    codes: ['KeyA', 'ArrowLeft'],
    key: 'A',
    labelKey: 'keys.switch_tab',
  },
  nextChapter: {
    codes: ['KeyD', 'ArrowRight'],
    key: 'D',
    labelKey: 'keys.switch_tab',
  },
  prevEntry: {
    codes: ['KeyW', 'ArrowUp'],
    key: 'W',
    labelKey: 'keys.turn_page',
  },
  nextEntry: {
    codes: ['KeyS', 'ArrowDown'],
    key: 'S',
    labelKey: 'keys.turn_page',
  },
  close: { codes: ['KeyB', 'Escape'], key: 'B', labelKey: 'keys.close' },
} as const satisfies Record<string, Binding>

// The pack's keys the controls table lists too, under the valley's: only
// the ones that act on an item, since the rest are the pack's own way
// round (its tabs, closing it).
export const PACK_IN_MENU: readonly Binding[] = [PACK.drop, PACK.dropAll]

// The action a code fires in a table, or null when the table does not
// bind it.
export function actionOf<T extends Record<string, Binding>>(
  table: T,
  code: string
): keyof T | null {
  for (const action in table) {
    if (table[action].codes.includes(code)) return action
  }
  return null
}

// Whether any of a binding's keys is down.
export function isHeld(held: ReadonlySet<string>, binding: Binding): boolean {
  return binding.codes.some((code) => held.has(code))
}

// The movement axis from the keys held: x is right, z is forward, each
// -1, 0, or 1. Opposite keys cancel.
export function moveAxis(held: ReadonlySet<string>): { x: number; z: number } {
  const x = (held.has(MOVE.right) ? 1 : 0) - (held.has(MOVE.left) ? 1 : 0)
  const z = (held.has(MOVE.forward) ? 1 : 0) - (held.has(MOVE.back) ? 1 : 0)
  return { x, z }
}

// The hotbar slot a number key stands for, 0 for 1 through 8 for 9; null
// for any other key.
export function hotbarSlot(code: string): number | null {
  const slot = HOTBAR_CODES.indexOf(code)
  return slot < 0 ? null : slot
}
