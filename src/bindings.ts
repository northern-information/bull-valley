// Pure: every key the game answers to, in one place. Each binding carries
// the KeyboardEvent.code values that fire it, the key as players see it,
// and what it does. main.ts and player.ts look actions up here instead of
// comparing raw codes; hud.ts draws the intro table and the pack footer
// from the same entries, so the copy cannot drift from the dispatcher.

export interface Binding {
  // KeyboardEvent.code values. Empty for a control the browser owns (the
  // mouse, and Esc, which drops pointer lock).
  codes: readonly string[]
  // The key, as shown to players.
  key: string
  // What it does, as shown to players.
  label: string
}

// The movement keys, one per direction, so player.ts can turn them into
// an axis.
export const MOVE = {
  forward: 'KeyW',
  left: 'KeyA',
  back: 'KeyS',
  right: 'KeyD',
} as const

// Which way a cycle key turns the pack's ring.
const CYCLE_BACK: readonly string[] = ['ArrowLeft', 'KeyA']
const CYCLE_FORWARD: readonly string[] = ['ArrowRight', 'KeyD']

const smoke: Binding = { codes: ['Digit1'], key: '1', label: 'Smoke' }
const spark: Binding = { codes: ['Digit2'], key: '2', label: 'Spark' }

// In the valley, with the pointer locked and the pack closed. Listed in
// the order the intro table reads them, two to a row.
export const WORLD = {
  move: { codes: Object.values(MOVE), key: 'WASD', label: 'Move' },
  sprint: { codes: ['ShiftLeft', 'ShiftRight'], key: 'Shift', label: 'Sprint' },
  look: { codes: [], key: 'Mouse', label: 'Look' },
  crouch: { codes: ['KeyC'], key: 'C', label: 'Crouch' },
  scope: { codes: ['KeyQ'], key: 'Q', label: 'Scaduscope' },
  inventory: { codes: ['Tab'], key: 'Tab', label: 'Inventory' },
  interact: {
    codes: ['KeyE'],
    key: 'E',
    label: 'Board / Hop Out / Take / Buy / Unload / Extract',
  },
  callTruck: { codes: ['KeyT'], key: 'T', label: 'Call the Truck' },
  smoke,
  spark,
  pause: { codes: [], key: 'Esc', label: 'Pause' },
} as const satisfies Record<string, Binding>

// With the pack open: these drive the carousel and nothing reaches the
// player. Enter is a quiet alias for E.
export const PACK = {
  use: { codes: ['KeyE', 'Enter'], key: 'E', label: 'Use' },
  cycle: {
    codes: [...CYCLE_BACK, ...CYCLE_FORWARD],
    key: '< > / A D',
    label: 'Cycle',
  },
  close: { codes: ['Tab'], key: 'Tab', label: 'Exit' },
  smoke,
  spark,
} as const satisfies Record<string, Binding>

export type WorldAction = keyof typeof WORLD
export type PackAction = keyof typeof PACK

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

// Which way a cycle key steps the ring: -1 back, 1 forward, 0 for a key
// that is not one.
export function cycleStep(code: string): -1 | 0 | 1 {
  if (CYCLE_BACK.includes(code)) return -1
  if (CYCLE_FORWARD.includes(code)) return 1
  return 0
}
