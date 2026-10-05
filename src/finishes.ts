// Pure: the guitar finishes in one table and the random draw. A finish
// colors the guitar's gloss (assets.ts buildGuitar); the character select
// offers the row for any character with a guitar on their back, and the
// account keeps the pick with the character (characters.ts pickOf). Edit
// finishes here.

import { copy } from './copy.ts'

export interface Finish {
  id: string
  label: string
  // The gloss color, as a hex string.
  color: string
}

// In swatch-row order. Black and Olympic White are the EX-400's own
// catalogue finishes; the rest are the classic solid colors of the era.
export const FINISHES = [
  { id: 'black', label: copy('finishes.black'), color: '#121214' },
  {
    id: 'olympic-white',
    label: copy('finishes.olympic-white'),
    color: '#e8e6df',
  },
  { id: 'blood-red', label: copy('finishes.blood-red'), color: '#7a1016' },
  { id: 'cherry', label: copy('finishes.cherry'), color: '#b3202c' },
  { id: 'tangerine', label: copy('finishes.tangerine'), color: '#d9641e' },
  { id: 'gold-top', label: copy('finishes.gold-top'), color: '#c9a227' },
  { id: 'forest', label: copy('finishes.forest'), color: '#1f5a36' },
  { id: 'seafoam', label: copy('finishes.seafoam'), color: '#78b3a1' },
  { id: 'pelham-blue', label: copy('finishes.pelham-blue'), color: '#3b6ea5' },
  { id: 'midnight', label: copy('finishes.midnight'), color: '#1b2340' },
  { id: 'grape', label: copy('finishes.grape'), color: '#5a2a7a' },
  { id: 'hot-pink', label: copy('finishes.hot-pink'), color: '#d94f8a' },
  { id: 'gunmetal', label: copy('finishes.gunmetal'), color: '#6f7479' },
] as const satisfies readonly Finish[]

export type FinishId = (typeof FINISHES)[number]['id']

export const DEFAULT_FINISH: FinishId = 'black'

export function isFinish(id: unknown): id is FinishId {
  return FINISHES.some((finish) => finish.id === id)
}

export function finishById(id: FinishId): Finish {
  const found: Finish | undefined = FINISHES.find((finish) => finish.id === id)
  if (!found) throw new Error(`Unknown finish: ${id}`)
  return found
}

// A finish other than `current`, chosen by `roll` in [0, 1): the caller
// supplies the randomness, so this stays pure.
export function randomFinish(current: FinishId, roll: number): FinishId {
  const others = FINISHES.filter((finish) => finish.id !== current)
  const at = Math.floor(Math.min(Math.max(roll, 0), 0.999999) * others.length)
  return others[at].id
}
