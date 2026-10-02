// Who you raid as: the selectable roster and a localStorage adapter for the
// last pick. The storage handle is injected so tests can pass a stub; every
// touch of real storage is wrapped in try/catch (private windows, blocked
// site data). The bodies themselves are outfits in outfits.ts.

import type { OutfitId } from './outfits.ts'

// The slice of the Storage API the adapter needs, so tests can stub it.
export type CharacterStorage = Pick<Storage, 'getItem' | 'setItem'>

// In select-screen order. Marx drives the truck; the shadowmen are parked.
export const SELECTABLE: readonly OutfitId[] = [
  'player',
  'coleman',
  'kvistad',
  'church',
  'hanson',
]

export const DEFAULT_CHARACTER: OutfitId = 'player'

const KEY = 'bull-valley-shadow-wars:v1:character'

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
