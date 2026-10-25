// Pure: the mechs, for now a stub. A mech is built on the bones of the
// nephilim or the seraphim, and a raider gets one by digging up the
// weeping angel's grave in the celestial graveyard (celestialyard.ts,
// sharedworld.ts rule 41): the valley rolls which, a gacha weighted by
// rarity (`mechOf`), and it goes into the pack as a key item (items.ts),
// kept by the valley with the pack. What a mech does is its own feature,
// still to come; until then it is something to have, and to dig for
// again. The fanfare when one comes up is the catch's (catchfanfare.ts),
// the same in both apps. No three.js, no DOM.

import { copy } from './copy.ts'
import { itemLabel } from './itemcopy.ts'
import type { Fanfare, FanfareTier } from './catchfanfare.ts'
import type { ItemId } from './items.ts'

export type MechRarity = 'common' | 'rare' | 'legendary'

interface Mech {
  id: ItemId
  rarity: MechRarity
  // Its share of the roll, out of the weights of all of them.
  weight: number
}

// Every mech, commonest first.
export const MECHS: readonly Mech[] = [
  { id: 'mech-grigori', rarity: 'common', weight: 32 },
  { id: 'mech-nephil', rarity: 'common', weight: 32 },
  { id: 'mech-anakim', rarity: 'rare', weight: 15 },
  { id: 'mech-seraph', rarity: 'rare', weight: 15 },
  { id: 'mech-ophanim', rarity: 'legendary', weight: 6 },
]

const TOTAL = MECHS.reduce((sum, mech) => sum + mech.weight, 0)

export function isMech(id: string): boolean {
  return MECHS.some((mech) => mech.id === id)
}

export function mechById(id: string): Mech | null {
  return MECHS.find((mech) => mech.id === id) ?? null
}

// The mech the valley's `roll` (0 to 1) digs up.
export function mechOf(roll: number): ItemId {
  let left = Math.min(Math.max(roll, 0), 1 - 1e-9) * TOTAL
  for (const mech of MECHS) {
    left -= mech.weight
    if (left < 0) return mech.id
  }
  return MECHS[MECHS.length - 1].id
}

// What each rarity is called, over the mech's name.
const RARITY: Record<MechRarity, () => string> = {
  common: () => copy('mechs.common'),
  rare: () => copy('mechs.rare'),
  legendary: () => copy('mechs.legendary'),
}

const TIER: Record<MechRarity, FanfareTier> = {
  common: 'fish',
  rare: 'big',
  legendary: 'legend',
}

// The fanfare for `id` dug up: its rarity over its name, the legendary
// one's banner burning gold; null for anything not a mech.
export function mechFanfare(id: string): Fanfare | null {
  const mech = mechById(id)
  if (!mech) return null
  return {
    kind: id,
    tier: TIER[mech.rarity],
    kicker: RARITY[mech.rarity](),
    headline: itemLabel(id),
    detail: copy('mechs.detail'),
    gold: mech.rarity === 'legendary',
  }
}

// The line in the log when the valley would not let the grave be dug.
export function exhumeRefusal(reason: string): string {
  switch (reason) {
    case 'dug-today':
      return copy('mechs.dug_today')
    case 'no-shovel':
      return copy('mechs.no_shovel')
    case 'too-far':
    case 'aboard':
      return copy('mechs.too_far')
    default:
      return copy('mechs.refused')
  }
}

// The line in the log for `id` dug up.
export function unearthedLine(id: string): string {
  const mech = mechById(id)
  return copy('mechs.unearthed', {
    mech: itemLabel(id),
    rarity: mech ? RARITY[mech.rarity]() : '',
  })
}
