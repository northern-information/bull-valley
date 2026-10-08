// Shadowmen's names, pure: the folklore names the Bull Valley Scaduscope
// gives the shadowmen it tags (forgotten-industries,
// src/assets/js/bull-valley-scaduscope/names.js), carried over word for
// word. A shadowman is nameless until it is burnt; then it is named for
// its tombstone (graves.ts).
//
// The places are real public features of Bull Valley: roads, creeks,
// cemeteries, and conservation areas. The titles and epithets are invented,
// in the register of antiquarian ghost stories, folk horror, and Zone
// fiction. The name space is finite on purpose (about seven thousand), so
// names recur. These are painted on the stones, like trade dress, so they
// live here and not in COPY.toml.

import type { Rng } from './rng.ts'

export const PLACES = [
  'Boone Creek',
  'Powers Creek',
  'Boger Bog',
  'Dufield Pond',
  'Wolf Oak',
  'Windy Knoll',
  'Boloria Meadow',
  'Fairview',
  'Ostend',
  'Holcombville',
  'Thompson Road',
  'McConnell Road',
  'Mason Hill',
  'Crystal Springs',
  'Greenwood',
  'Country Club',
  'Cherry Valley',
  'Fleming Road',
  'Draper Road',
  'Curran Road',
  'Bull Valley Road',
] as const

// Short forms for "Title Place" names ("Mother Ostend", "Old Man Draper").
export const SHORT_PLACES = [
  'Boone',
  'Powers',
  'Boger',
  'Dufield',
  'Ostend',
  'Fairview',
  'Holcombville',
  'Thompson',
  'McConnell',
  'Mason',
  'Fleming',
  'Draper',
  'Curran',
  'Greenwood',
] as const

export const TITLES = [
  'Mother',
  'Old Man',
  'Widow',
  'Brother',
  'Sister',
  'Deacon',
  'Grandfather',
  'Little',
  'Pale',
  'Old',
  'Parson',
  'Aunt',
  'Uncle',
  'Squire',
  'Canon',
  'Father',
  'Cousin',
  'Granny',
] as const

export const NOUNS = [
  'Mourner',
  'Walker',
  'Watcher',
  'Lantern',
  'Drifter',
  'Tenant',
  'Surveyor',
  'Hitchhiker',
  'Sleepwalker',
  'Mile Man',
  'Night Clerk',
  'Ditch Saint',
  'Crossing Guard',
  'Gleaner',
  'Late Guest',
  'Hollow',
  'Stranger',
  'Lodger',
  'Sexton',
  'Verger',
  'Antiquary',
  'Revenant',
  'Stalker',
  'Warden',
  'Reeve',
  'Toll Keeper',
  'Hedge Priest',
  'Lamplighter',
  'Bellringer',
  'Pilgrim',
  'Visitor',
  'Bound Beater',
  'Straw Man',
  'Well Keeper',
  'Whistler',
  'Chorister',
] as const

export const EPITHETS = [
  'Hollow',
  'Quiet',
  'Crooked',
  'Grey',
  'Gentle',
  'Tall',
  'Lantern',
  'Barefoot',
  'Patient',
  'Rust',
  'Ash',
  'Hush',
  'Hooded',
  'Salt',
  'Wicker',
  'Thorn',
] as const

export const GIVEN = [
  'Jack',
  'Ada',
  'Silas',
  'Mae',
  'Ezra',
  'Opal',
  'Amos',
  'Iris',
  'Otis',
  'Wren',
  'Abel',
  'June',
  'Agnes',
  'Tobias',
  'Hester',
  'Jasper',
  'Martha',
  'Eli',
] as const

const pick = (list: readonly string[], rng: Rng) =>
  list[Math.floor(rng() * list.length) % list.length]

// A folklore name: "The Boone Creek Sexton", "Mother Ostend", "Hush Wren
// of Draper Road".
export function generateName(rng: Rng): string {
  const pattern = rng()
  if (pattern < 0.45) return `The ${pick(PLACES, rng)} ${pick(NOUNS, rng)}`
  if (pattern < 0.75) return `${pick(TITLES, rng)} ${pick(SHORT_PLACES, rng)}`
  return `${pick(EPITHETS, rng)} ${pick(GIVEN, rng)} of ${pick(PLACES, rng)}`
}

// How many distinct names the lists can produce.
export const NAME_SPACE =
  PLACES.length * NOUNS.length +
  TITLES.length * SHORT_PLACES.length +
  EPITHETS.length * GIVEN.length * PLACES.length
