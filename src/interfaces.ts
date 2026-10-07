// Shapes that cross module boundaries. Types only: no runtime code, no
// three.js, so the pure modules can import from here freely.

// ---------------------------------------------------------------------------
// World space: three.js metres centred on the survey, +x east, +z south.

export interface XZ {
  x: number
  z: number
}

// The ground height in metres at a world point.
export type HeightAt = (x: number, z: number) => number

// Three numbers as [x, y, z]: a position, a scale, a size, or an Euler
// rotation in radians.
export type Vec3 = [number, number, number]

// ---------------------------------------------------------------------------
// The survey (public/data/bull-valley/geo.json): the game's own map, edited
// by hand. Points are in the unit square: x right/east, y down/south.

export type UnitPoint = [number, number]
export type Ring = UnitPoint[]

export interface Bbox {
  south: number
  west: number
  north: number
  east: number
}

export interface Metres {
  width: number
  height: number
}

export interface TerrainRange {
  size: number
  min: number
  max: number
}

export type RoadClass =
  'primary' | 'secondary' | 'tertiary' | 'residential' | 'unclassified'

export interface Road {
  c: RoadClass
  n: string
  p: Ring
}

export interface Water {
  k: 'area' | 'line'
  n: string
  p: Ring
}

export interface Reserve {
  n: string
  p: Ring
}

export interface Graveyard {
  n: string
  c: UnitPoint
  p: Ring
}

export interface FuelStation {
  n: string
  p: UnitPoint
}

export interface Geo {
  bbox: Bbox
  metres: Metres
  terrain: TerrainRange
  boundary: Ring[]
  roads: Road[]
  water: Water[]
  wetland: Ring[]
  reserves: Reserve[]
  graveyards: Graveyard[]
  fuel: FuelStation[]
}

// ---------------------------------------------------------------------------
// Items (src/items.ts), drink containers (src/drinks.ts), and medicine
// packaging (src/assets.ts).

export type ItemCategory =
  'cigarette' | 'joint' | 'drink' | 'medicine' | 'forage'

// How a medicine is packed: a pill bottle, a folding carton, or a dropper
// bottle. assets.ts builds one shape per form; medart.ts paints its labels.
export type MedicineForm = 'pills' | 'carton' | 'dropper'

export type ContainerKey =
  | 'tall'
  | 'slim'
  | 'can12'
  | 'nos'
  | 'bourbon'
  | 'square'
  | 'goose'
  | 'flask'
  | 'water'
  | 'longneck'

export interface Container {
  // Half the width, in metres.
  radius: number
  height: number
  // Half the front-to-back size of a flat or square bottle.
  depth?: number
}

export interface Item {
  id: string
  category: ItemCategory
  label: string
  blurb: string
  used?: string
  // Items on the Citgo shelves have a price and a bought line; forage
  // has neither, and a collected line instead.
  bought?: string
  collected?: string
  empty?: string
  start?: number
  // How many one container holds (items.ts contentsOf).
  contents?: number
  // Shelf price at every Citgo, in cents.
  price?: number
  // Cigarettes.
  smokeSeconds?: number
  emberSeconds?: number
  // Joints.
  perceptionSeconds?: number
  // Drinks.
  container?: ContainerKey
  // Medicine.
  form?: MedicineForm
}

// Item id -> count. Every inventory kind is present.
export type Inventory = Record<string, number>

// Item id -> each unit's place on one Citgo's shelf this raid, by slot
// (store.ts Facing.slots): true while the unit is still there. A buyer
// picks the unit, so which ones are gone matters, not just how many.
export type ShopStock = Record<string, boolean[]>

// ---------------------------------------------------------------------------
// The raid (src/raid.ts).

export type RaidState = 'LOADOUT' | 'RIDING' | 'ON_FOOT' | 'EXTRACTED'

export type RaidEvent =
  | 'BOARD_TRUCK'
  | 'TIMER_EXPIRED'
  | 'HOP_OUT'
  | 'PICK_CABBAGE'
  | 'DROP_CABBAGE'
  | 'CALL_TRUCK'
  | 'EXTRACT_FUEL'
  | 'EXTRACT_KEEP'
  | 'STRUCK'

export type ExtractKind = 'truck' | 'fuel' | 'keep'

export interface Raid {
  state: RaidState
  startedAt: number
  loadoutEndsAt: number
  carrying: number
  truckCalled: boolean
  extract: ExtractKind | null
  // Station name for a 'fuel' extract.
  extractName: string | null
  endedAt: number | null
  // Times a shadowman's touch put you back at the Citgo.
  deaths: number
}

export interface RaidSummary {
  carrying: number
  durationSeconds: number | null
  extract: ExtractKind | null
  extractName: string | null
  deaths: number
}

// ---------------------------------------------------------------------------
// The scope (src/scope.ts), fed by the shadowmen (src/shadowmen.ts).

// A shadowman on the scope: compass bearing in degrees, distance in metres.
// hunting draws it magenta: it is coming for you.
export interface ScopeContact {
  dist: number
  bearing: number
  hunting: boolean
}

// ---------------------------------------------------------------------------
// The pack grid (src/packgrid.ts).

export interface PackItem {
  // An item id, or 'cabbage' for carried cargo.
  kind: string
  label: string
  blurb: string
  // Containers carried: packs, bottles, boxes, or single items.
  stock: number
  // What is left in the open container, for an item that holds several
  // (items.ts leftInOpen).
  left: number | null
  canUse: boolean
}

// ---------------------------------------------------------------------------
// The title cards (src/splashmachine.ts, src/audio.ts).

// Triangle gain envelope for a one-shot: 0->1, hold, 1->0.
export interface OneShotEnvelope {
  fadeInMs: number
  holdMs: number
  fadeOutMs: number
}
