// Shapes that cross module boundaries. Types only: no runtime code, no
// three.js, so the pure modules can import from here freely.

// ---------------------------------------------------------------------------
// The survey (public/data/bull-valley/geo.json), written by
// scripts/fetch_bull_valley.cjs. Points are in the unit square: x right/east,
// y down/south.

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

export interface TrafficCount {
  n: string
  v: number
  y: number
  h: number
  p: Ring
}

export interface Geo {
  fetched: string
  trafficFetched: string
  trafficBbox: Bbox
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
  traffic: TrafficCount[]
  sources: { osm: string; traffic: string; terrain: string }
}

// ---------------------------------------------------------------------------
// Items (src/items.ts) and drink containers (src/drinks.ts).

export type ItemCategory = 'cigarette' | 'joint' | 'drink' | 'gear'

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
  bought: string
  empty?: string
  start?: number
  shopCap?: number
  // Cigarettes.
  smokeSeconds?: number
  emberSeconds?: number
  crackle?: boolean
  // Joints.
  perceptionSeconds?: number
  // Drinks.
  container?: ContainerKey
  // Gear.
  carryLimit?: number
}

// Item id -> count. Every inventory kind is present.
export type Inventory = Record<string, number>

// Item id -> tailgate stock for this raid.
export type ShopStock = Record<string, number>

// ---------------------------------------------------------------------------
// The raid (src/raid.ts).

export type RaidState = 'LOADOUT' | 'RIDING' | 'ON_FOOT' | 'EXTRACTED'

export type RaidEvent =
  | 'BOARD_TRUCK'
  | 'TIMER_EXPIRED'
  | 'HOP_OUT'
  | 'PICK_CABBAGE'
  | 'DELIVER'
  | 'CALL_TRUCK'
  | 'BUY_SACK'
  | 'EXTRACT_FUEL'
  | 'EXTRACT_KEEP'

export type ExtractKind = 'truck' | 'fuel' | 'keep'

export interface Raid {
  state: RaidState
  startedAt: number
  loadoutEndsAt: number
  carrying: number
  delivered: number
  sack: boolean
  truckCalled: boolean
  extract: ExtractKind | null
  // Station name for a 'fuel' extract.
  extractName: string | null
  endedAt: number | null
}

export interface RaidSummary {
  delivered: number
  carrying: number
  durationSeconds: number | null
  extract: ExtractKind | null
  extractName: string | null
}

// ---------------------------------------------------------------------------
// The inventory carousel (src/carousel.ts).

export interface RingItem {
  // An item id, or 'cabbage' for carried cargo.
  kind: string
  label: string
  blurb: string
  stock: number
  // Tailgate stock, or null away from the tailgate.
  tailgate: number | null
  canUse: boolean
  canBuy: boolean
}
