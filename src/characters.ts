// Who you raid as: the selectable roster, and a localStorage adapter for
// the last pick and the last name. The storage handle is injected so tests
// can pass a stub; every touch of real storage is wrapped in try/catch
// (private windows, blocked site data). The bodies themselves are outfits
// in outfits.ts; the name rules are the wire's, in protocol.ts.

import { isValidName, normalizeName } from './protocol.ts'
import type { OutfitId } from './outfits.ts'

// The slice of the Storage API the adapter needs, so tests can stub it.
export type CharacterStorage = Pick<Storage, 'getItem' | 'setItem'>

// In select-screen order. Marx drives the truck; the shadowmen are not
// selectable.
export const SELECTABLE: readonly OutfitId[] = [
  'player',
  'coleman',
  'kvistad',
  'church',
  'hanson',
]

export const DEFAULT_CHARACTER: OutfitId = 'player'

const KEY = 'bull-valley-shadow-wars:v1:character'
const NAME_KEY = 'bull-valley-shadow-wars:v1:name'

// The name a dev build raids under when the titles are skipped and none is
// saved. The select itself never falls back: a name is required there.
export const FALLBACK_NAME = 'Raider'

// The outfit and the name chosen at the select.
export interface CharacterPick {
  outfit: OutfitId
  name: string
}

export function isSelectable(id: unknown): id is OutfitId {
  return SELECTABLE.some((entry) => entry === id)
}

// The last pick, or the default when there is none, it is no longer on the
// roster, or storage is unavailable.
export function loadCharacter(storage: CharacterStorage): OutfitId {
  try {
    const raw = storage.getItem(KEY)
    return isSelectable(raw) ? raw : DEFAULT_CHARACTER
  } catch {
    return DEFAULT_CHARACTER
  }
}

export function saveCharacter(storage: CharacterStorage, id: OutfitId): void {
  try {
    storage.setItem(KEY, id)
  } catch {
    // Storage can be unavailable; the pick simply doesn't persist.
  }
}

// The last name typed, or '' when there is none, it no longer passes the
// rules, or storage is unavailable.
export function loadName(storage: CharacterStorage): string {
  try {
    const raw = storage.getItem(NAME_KEY)
    if (typeof raw !== 'string') return ''
    const name = normalizeName(raw)
    return isValidName(name) ? name : ''
  } catch {
    return ''
  }
}

export function saveName(storage: CharacterStorage, name: string): void {
  try {
    storage.setItem(NAME_KEY, name)
  } catch {
    // Storage can be unavailable; the name simply doesn't persist.
  }
}
