// The Akashic's filters: what kind of thing each asset is (`kindOf`), where
// in the valley it stands (`placeOf`), which sets it belongs to (`setsOf`),
// all by its id, and whether it shows under a filter (`assetMatches`).
// Pure, so akashic.ts only wires the panel.

export const ASSET_KINDS = [
  'characters',
  'poses',
  'items',
  'places',
  'props',
  'effects',
] as const
export type AssetKind = (typeof ASSET_KINDS)[number]
export const KIND_LABELS: Record<AssetKind, string> = {
  characters: 'Characters',
  poses: 'Poses',
  items: 'Items',
  places: 'Places',
  props: 'Props',
  effects: 'Effects',
}

// Someone standing as they stand in the valley.
const CHARACTERS = new Set([
  'shadowman',
  'caretaker',
  'warden',
  'shadow-spider',
  'spiderling',
  'slurm',
  'skeleton-horse',
  'shadow-rat',
  'tyler-jeep',
  'jericho',
])

// Someone doing something: walking, striking, emoting, lying struck down.
const POSES = new Set([
  'walk',
  'jog',
  'run',
  'corpse',
  'halo-worn',
  'flashlight-up',
  'flashlight-hand',
  'carlsten-smash',
  'shadowman-walking',
  'shadowman-striking',
  'shadow-spider-striking',
  'caretaker-striking',
  'shadowman-burning',
  'shadow-spider-burning',
  'caretaker-burning',
  'shadow-rat-burning',
  'warden-burning',
  'topiary-dying',
])

// Anything a raider can pick up, carry, wear or hold.
const ITEMS = new Set([
  'cabbage',
  'joints',
  'berries',
  'dimes',
  'quarters',
  'mushrooms',
  'vault-key',
  'lsd',
  'adderall',
  'rose',
  'floppy-disk',
  'flashlight-item',
  'citgo-phone',
  'marx-whistle',
  'fishing-rod',
  'zebco-33',
  'ugly-stik',
  'g-loomis',
  'slurm-jar',
  'slurm-caught',
  'torch',
  'nightcrawlers',
  'gold-bullion',
  'empty-can',
  'empty-bottle',
  'empty-plastic',
  'empty-pack',
  'empty-pill-bottle',
  'twenty',
  'flaming-halo',
  'bat',
  'axe',
  'flashlight',
  'guitar',
  'book',
])
const ITEM_PREFIXES = ['pack-', 'drink-', 'med-', 'fish-', 'food-']

// A whole station or building, walked through rather than looked at.
const STATIONS = new Set([
  'citgo-station',
  'citgo-interior',
  'corn-maze',
  'lookout',
  'drive-in-screen',
  'drive-in-booth',
  'castle-entropy',
  'castle-entropy-tomorrow',
  'castle-entropy-crumbling',
  'castle-moat',
  'strip-mall',
  'undercroft',
  'warehouse',
  'cabbage-stand',
  'wreck',
])

// Light, weather and fire more than a thing.
const EFFECTS = new Set([
  'portal',
  'citgo-portal',
  'mist',
  'raincloud',
  'shadow-burst',
  'fire-roots',
  'fog-wall',
])

// What an asset is, by its id; anything named nowhere is a prop.
export function kindOf(id: string): AssetKind {
  if (id.startsWith('figure-') || CHARACTERS.has(id)) return 'characters'
  if (id.startsWith('emote-') || POSES.has(id)) return 'poses'
  if (ITEMS.has(id) || ITEM_PREFIXES.some((p) => id.startsWith(p))) {
    return 'items'
  }
  if (STATIONS.has(id) || /^cabbage-stand-\d+$/.test(id)) return 'places'
  if (EFFECTS.has(id)) return 'effects'
  return 'props'
}

// Where in the valley an asset stands; anything named nowhere is elsewhere
// (in a pack, on a raider, or all over).
export const PLACES = [
  'citgo',
  'corn-maze',
  'drive-in',
  'castle',
  'graveyard',
  'plaza',
  'undercroft',
  'industrial',
  'pond',
  'roadside',
  'elsewhere',
] as const
export type Place = (typeof PLACES)[number]

export const PLACE_LABELS: Record<Place, string> = {
  citgo: 'Citgo & its lot',
  'corn-maze': 'Corn maze',
  'drive-in': 'Drive-in',
  castle: 'Castle Entropy',
  graveyard: 'Celestial graveyard',
  plaza: 'Bull Valley Plaza',
  undercroft: 'Undercroft',
  industrial: 'Industrial park',
  pond: 'Firefly pond',
  roadside: 'Roadside & fields',
  elsewhere: 'Elsewhere',
}

// Each place's ids, and the prefixes its families share.
const PLACE_IDS: Record<Exclude<Place, 'elsewhere'>, readonly string[]> = {
  citgo: [
    'citgo-station',
    'citgo-interior',
    'pump',
    'trash-can',
    'locker-doors',
    'recycler',
    'payphone',
    'bath-laptop',
    'citgo-portal',
    'dish',
    'slurm',
    'carlsten-smash',
    'figure-carlsten',
    'figure-moab',
    'skeleton-horse',
    'scroll',
    'scythe',
    'figure-tyler',
    'tyler-jeep',
    'jeep',
    'radar-dish',
    'laptop',
    'truck',
    'figure-marx',
    'ad-',
  ],
  'corn-maze': [
    'corn-wall',
    'corn-maze',
    'corn-maze-sign',
    'enter-sign',
    'portal',
    'lookout',
    'torch',
    'toolbox',
    'caretaker',
    'topiary-',
  ],
  'drive-in': [
    'drive-in-screen',
    'drive-in-booth',
    'projector',
    'speaker-post',
    'burnt-',
    'weed-tuft',
  ],
  castle: [
    'castle-entropy',
    'castle-moat',
    'moat-crane',
    'light-tower',
    'jericho',
    'spomenik-',
    'yard-',
  ],
  graveyard: ['weeping-angel', 'shovel', 'giant-'],
  plaza: [
    'strip-mall',
    'plaza-sign',
    'dumpster',
    'dumpster-fallen',
    'shopping-cart',
  ],
  undercroft: ['undercroft', 'trapdoor', 'shadow-rat', 'warden', 'fog-wall'],
  industrial: [
    'warehouse',
    'park-sign',
    'forklift',
    'pallet-load',
    'chain-link',
    'semi-trailer',
  ],
  pond: [
    'campfire',
    'picnic-table',
    'tackle-box',
    'nightcrawlers',
    'stringer',
    'leaning-rod',
    'oil-lantern',
    'bobber',
    'fishing-rod',
    'zebco-33',
    'ugly-stik',
    'g-loomis',
    'fish-',
    'food-',
  ],
  roadside: [
    'pole',
    'streetlight',
    'reeds',
    'gravestone',
    'beacon-keep',
    'waypoint-pillar',
    'wreck',
    'traffic-',
    'berry-bush',
    'raincloud',
    'figure-gron',
    'cabbage-stand',
    'tree-',
  ],
}

// An id under a name: the name itself, a family (`ad-` and its kin), or
// the name doing something (`warden-burning`, `zebco-33-racked`).
function namedBy(id: string, name: string): boolean {
  if (name.endsWith('-')) return id.startsWith(name)
  return id === name || id.startsWith(`${name}-`)
}

export function placeOf(id: string): Place {
  // The longest name wins: `castle-moat` is the castle's, though
  // `castle-entropy` would take it too.
  let best: Place = 'elsewhere'
  let length = 0
  for (const place of PLACES) {
    if (place === 'elsewhere') continue
    for (const name of PLACE_IDS[place]) {
      if (name.length > length && namedBy(id, name)) {
        best = place
        length = name.length
      }
    }
  }
  return best
}

// A set: assets of a family, gathered across kinds and places.
export const ASSET_SETS = [
  'figures',
  'emotes',
  'strides',
  'shadows',
  'striking',
  'burning',
  'packs',
  'drinks',
  'medicine',
  'empties',
  'fish',
  'food',
  'rods',
  'mechs',
  'trees',
  'topiaries',
  'signs',
  'cars',
  'spomeniks',
  'yard',
  'giants',
  'stands',
] as const
export type AssetSet = (typeof ASSET_SETS)[number]

export const SET_LABELS: Record<AssetSet, string> = {
  figures: 'Figures',
  emotes: 'Emotes',
  strides: 'Walk, jog, run',
  shadows: 'Shadows & shades',
  striking: 'Striking',
  burning: 'Burning',
  packs: 'Cigarette packs',
  drinks: 'Drinks',
  medicine: 'Medicine',
  empties: 'Empties',
  fish: 'Fish',
  food: 'Food',
  rods: 'Rods',
  mechs: 'Mechs',
  trees: 'Trees',
  topiaries: 'Topiaries',
  signs: 'Citgo signs',
  cars: 'Burnt cars',
  spomeniks: 'Spomeniks',
  yard: 'Castle yard clutter',
  giants: 'Giant stones',
  stands: 'Cabbage stands',
}

const SET_NAMES: Record<AssetSet, readonly string[]> = {
  figures: ['figure-'],
  emotes: ['emote-'],
  strides: ['walk', 'jog', 'run'],
  shadows: [
    'shadowman',
    'shadow-spider',
    'spiderling',
    'shadow-burst',
    'caretaker',
    'shadow-rat',
    'warden',
    'figure-shadow',
  ],
  striking: [],
  burning: [],
  packs: ['pack-'],
  drinks: ['drink-'],
  medicine: ['med-'],
  empties: ['empty-'],
  fish: ['fish-'],
  food: ['food-'],
  rods: ['fishing-rod', 'zebco-33', 'ugly-stik', 'g-loomis', 'leaning-rod'],
  mechs: ['mech-'],
  trees: ['tree-'],
  topiaries: ['topiary-'],
  signs: ['ad-'],
  cars: ['burnt-'],
  spomeniks: ['spomenik-'],
  yard: ['yard-'],
  giants: ['giant-'],
  stands: ['cabbage-stand'],
}

export function inSet(id: string, set: AssetSet): boolean {
  if (set === 'striking') return id.endsWith('-striking')
  if (set === 'burning') return id.endsWith('-burning')
  return SET_NAMES[set].some((name) => namedBy(id, name))
}

export function setsOf(id: string): AssetSet[] {
  return ASSET_SETS.filter((set) => inSet(id, set))
}

// What the panel asks: the kinds ticked (none ticked, every kind), a
// place and a set (null, any), and a search.
export interface AssetFilter {
  kinds: readonly AssetKind[]
  place: Place | null
  set: AssetSet | null
  search: string
}

export const NO_FILTER: AssetFilter = {
  kinds: [],
  place: null,
  set: null,
  search: '',
}

// Shown under every part of the filter: one of the kinds, the place, the
// set, and every word of the search found in the id or the label, any case.
export function assetMatches(
  asset: { id: string; label: string },
  filter: AssetFilter
): boolean {
  const { kinds, place, set, search } = filter
  if (kinds.length && !kinds.includes(kindOf(asset.id))) return false
  if (place && placeOf(asset.id) !== place) return false
  if (set && !inSet(asset.id, set)) return false
  const haystack = `${asset.id} ${asset.label}`.toLowerCase()
  return search
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .every((word) => haystack.includes(word))
}
