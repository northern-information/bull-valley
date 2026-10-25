// The Akashic's filters: what kind of thing each asset is (`kindOf`, by its
// id), and whether it shows under a kind and a search (`assetMatches`).
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
// The filter: one kind, or every asset.
export type KindFilter = AssetKind | 'all'

export const KIND_LABELS: Record<KindFilter, string> = {
  all: 'All',
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
  'tunnel-shade',
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
  'tunnel-shade-burning',
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
const PLACES = new Set([
  'citgo-station',
  'citgo-interior',
  'corn-maze',
  'lookout',
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
])

// What an asset is, by its id; anything named nowhere is a prop.
export function kindOf(id: string): AssetKind {
  if (id.startsWith('figure-') || CHARACTERS.has(id)) return 'characters'
  if (id.startsWith('emote-') || POSES.has(id)) return 'poses'
  if (ITEMS.has(id) || ITEM_PREFIXES.some((p) => id.startsWith(p))) {
    return 'items'
  }
  if (PLACES.has(id) || /^cabbage-stand-\d+$/.test(id)) return 'places'
  if (EFFECTS.has(id)) return 'effects'
  return 'props'
}

// Shown under the kind and the search: every word of the search found in
// the id or the label, any case.
export function assetMatches(
  asset: { id: string; label: string },
  kind: KindFilter,
  search: string
): boolean {
  if (kind !== 'all' && kindOf(asset.id) !== kind) return false
  const haystack = `${asset.id} ${asset.label}`.toLowerCase()
  return search
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .every((word) => haystack.includes(word))
}
