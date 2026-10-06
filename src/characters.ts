// Who you raid as: the selectable roster, and the pick as the account
// keeps it (account.ts LookWire, PUT /auth/look), so it follows the raider
// to any browser. The bodies themselves are outfits in outfits.ts. The
// name you raid under is your account's username (account.ts), not chosen
// here.

import { DEFAULT_FINISH } from './finishes.ts'
import type { LookWire } from './account.ts'
import type { FinishId } from './finishes.ts'
import type { OutfitId } from './outfits.ts'

// In select-screen order. Marx drives the truck; the shadowmen are not
// selectable.
export const SELECTABLE: readonly OutfitId[] = [
  'player',
  'coleman',
  'kvistad',
  'church',
  'hanson',
  'halatek',
  'jdogg',
]

export const DEFAULT_CHARACTER: OutfitId = 'player'

// The character and guitar finish chosen at the select.
export interface CharacterPick {
  outfit: OutfitId
  finish: FinishId
}

export function isSelectable(id: unknown): id is OutfitId {
  return SELECTABLE.some((entry) => entry === id)
}

// Whether the account has chosen a character, at the select or at Gron. A
// raider who has comes back past the select; Gron changes it from then on.
export function hasChosen(look: LookWire | null | undefined): boolean {
  return !!look?.outfit
}

// The account's pick, with the defaults for what it has not chosen yet.
export function pickOf(look: LookWire | null | undefined): CharacterPick {
  return {
    outfit: look?.outfit ?? DEFAULT_CHARACTER,
    finish: look?.finish ?? DEFAULT_FINISH,
  }
}
