// Who you raid as: the selectable roster, and the pick as the account
// keeps it (account.ts LookWire, PUT /auth/look), so it follows the raider
// to any browser. The bodies themselves are outfits in outfits.ts. The
// name you raid under is your account's username (account.ts), not chosen
// here.

import { DEFAULT_FINISH } from './finishes.ts'
import type { LookWire } from './account.ts'
import type { CosmeticId } from './cosmetics.ts'
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
  'mathiesen',
  'rich',
  'sam',
  'meyer',
  'anderchuck',
  'lane',
  'terry',
]

export const DEFAULT_CHARACTER: OutfitId = 'player'

// The character and guitar finish chosen at the select.
export interface CharacterPick {
  outfit: OutfitId
  finish: FinishId
}

// The characters an account must trade Moab Coldë for before it may
// raid as them (cosmetics.ts), each by the cosmetic that opens it. They
// follow the free roster at the select, in this order.
export const UNLOCKED_BY: Readonly<Partial<Record<OutfitId, CosmeticId>>> = {
  coleman1: 'coleman-1',
}

// Every character a raider could ever raid as, free or traded for.
export const ROSTER: readonly OutfitId[] = [
  ...SELECTABLE,
  ...(Object.keys(UNLOCKED_BY) as OutfitId[]),
]

// Whether `id` is on the roster at all: never an NPC's or a shadowman's
// outfit. What an account may wear of it is mayRaidAs.
export function isSelectable(id: unknown): id is OutfitId {
  return ROSTER.some((entry) => entry === id)
}

// Whether an account that has `cosmetics` may raid as `id`: anyone on the
// free roster, a traded-for character only once it is the account's.
export function mayRaidAs(
  id: unknown,
  cosmetics: readonly CosmeticId[]
): id is OutfitId {
  if (!isSelectable(id)) return false
  const opens = UNLOCKED_BY[id]
  return !opens || cosmetics.includes(opens)
}

// The roster an account that has `cosmetics` chooses from, in select-screen
// order.
export function rosterFor(cosmetics: readonly CosmeticId[]): OutfitId[] {
  return ROSTER.filter((id) => mayRaidAs(id, cosmetics))
}

// The account's pick, with the defaults for what it has not chosen yet.
export function pickOf(look: LookWire | null | undefined): CharacterPick {
  return {
    outfit: look?.outfit ?? DEFAULT_CHARACTER,
    finish: look?.finish ?? DEFAULT_FINISH,
  }
}
