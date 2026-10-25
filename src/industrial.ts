// Pure: the industrial park behind Bull Valley Plaza, past the Golden
// Wok's alley. A dozen big one-story buildings gone dark on one sheet of
// asphalt: parking striped out front of each, a truck court behind with
// the loading bays, sodium lamps along the drives between them. Like
// stripmall.ts it says every box once, so what is drawn
// (industrialmodel.ts), what blocks (worksWalls) and what is stood on
// (industrialsite.ts registers each floor) can never drift apart.
//
// Two frames. The park's own (`parkOrigin`): the spawn station's frame
// moved to CONFIG.industrial.at, turned the same way, +x toward the plaza
// and the road, the park reaching back into -x and -z from its corner at
// the origin. And each building's: its middle on the floor deck, turned
// as the park is, its front (the office, the doors, the parking) to +z
// and its loading bays to -z. The rows run down -z; the columns back -x.
//
// The loot is the day's, back with it like every pickup (sharedworld.ts
// rule 6); the lurks are where the shadowmen that keep to the buildings
// drift (shadowmen.ts lurkers), which the hello carries. Everything else
// is scenery. No three.js, no DOM.

import { CONFIG } from './config.ts'
import { mulberry32, range } from './rng.ts'
import { isLow, toLocal, toWorld } from './store.ts'
import type { Vec3, XZ } from './interfaces.ts'
import type { PickupKind } from './items.ts'
import type { StoreOrigin, WallSegment } from './store.ts'
import type { MallArtId } from './stripmall.ts'

// What a box is drawn in; industrialmodel.ts maps each to a material.
export type WorksFinish =
  | 'slab' // the foundation and the aprons
  | 'floor' // the stained concrete inside
  | 'siding' // the corrugated metal walls
  | 'block' // the split-face wainscot outside
  | 'roof' // the deck's underside and its top
  | 'trim' // the parapet cap and the door frames
  | 'joist' // the bar joists under the roof
  | 'door' // the steel man-doors
  | 'rollup' // the loading bays' doors
  | 'glass'
  | 'plywood'
  | 'steel' // posts, housings, cabinets, conveyors
  | 'upright' // the racking's blue frames
  | 'beam' // the racking's orange beams
  | 'cardboard'
  | 'wrap' // shrink-wrapped loads
  | 'pallet'
  | 'machine' // the machine tools' green
  | 'hazard' // safety yellow: bollards, the forklift
  | 'rubber' // the dock bumpers and the tyres
  | 'insulated' // the cold rooms' white panels
  | 'tank' // stainless tanks
  | 'paper' // the press room's rolls
  | 'debris' // rubble, char, what came down
  | 'drum' // the blue drums
  | 'office' // drywall
  | 'ceiling' // the office's drop ceiling
  | 'desk'
  | 'mattress'
  | 'blanket'
  | 'flame'
  | 'tube' // a high bay still lit, flickering
  | 'dead-tube'
  | 'puddle'
  | 'trailer' // the semi trailers' white
  | 'car-red'
  | 'car-blue'
  | 'car-white'
  | 'car-burnt'

// One box, centred at `center` with full `size`. `turn` (an Euler XYZ)
// tips a box for things fallen or hung loose; a box that `blocks` never
// turns, so the walls stay square to it.
export interface WorksBox {
  name: string
  center: Vec3
  size: Vec3
  finish: WorksFinish
  blocks: boolean
  turn?: Vec3
}

// The painted panels: each building's sign, the bay numbers, the notices,
// and the plaza's graffiti (mallart.ts) sprayed out here too.
export type WorksArtId =
  | 'nippersink'
  | 'hollis'
  | 'valley-freight'
  | 'coral-canning'
  | 'box-carton'
  | 'prairie-litho'
  | 'for-lease'
  | 'greenwood-motor'
  | 'feed-seed'
  | 'thornwood'
  | 'shadow-brook'
  | 'scorched'
  | 'no-trespassing'
  | 'bay-1'
  | 'bay-2'
  | 'bay-3'
  | 'bay-4'
  | 'bay-5'
  | 'park-sign'
  | Extract<MallArtId, 'graffiti-eye' | 'graffiti-tag'>

// One painted panel, `size` wide and tall, centred at `center` a hair off
// its face, turned by `turn` so its art (asset +Z) faces out.
export interface WorksSign {
  name: string
  art: WorksArtId
  center: Vec3
  size: [number, number]
  turn: Vec3
}

// The way through a man-door: hung open, gone, or shut and blocking.
export type ManDoor = 'open' | 'gone' | 'shut'
// A loading bay's roll-up door: down and blocking, rolled all the way up,
// stuck halfway (over a raider's head), or torn off its track and hanging.
export type BayDoor = 'shut' | 'up' | 'half' | 'bent'

// What fills the floor.
export type Works =
  | 'racks' // pallet racking in rows
  | 'freight' // stacked pallets
  | 'machines' // machine tools
  | 'print' // presses and paper rolls
  | 'cannery' // tanks and conveyors
  | 'cold' // a cold room, and racks
  | 'empty' // nothing left, and someone camping

// Where a pickup or a lurk keeps in a building (`spotOf`): the office, the
// open floor by the front door, an aisle in the racks (by its number), the
// aisle along the bays, the cold room.
export type Spot = 'office' | 'front' | 'aisle-0' | 'aisle-1' | 'dock' | 'room'

interface Loot {
  at: Spot
  kind: PickupKind
  count: number
}

export interface Building {
  id: string
  sign: WorksArtId
  works: Works
  // Its footprint across (x) and deep (z), and its walls' height.
  w: number
  d: number
  h: number
  // The office door and the floor's own door, both in the front wall, and
  // the door in the -x wall.
  doors: { office: ManDoor; floor: ManDoor; side: ManDoor }
  bays: readonly BayDoor[]
  // Windows in the office's front, left of its door and right.
  windows: readonly [
    'glass' | 'broken' | 'boarded',
    'glass' | 'broken' | 'boarded',
  ]
  // The roof's panels (across x, each ROOF_PANEL wide or near it) fallen in.
  holes: readonly number[]
  // The one high bay still lit, by its index in the grid, if any.
  lit?: number
  loot: readonly Loot[]
  seed: number
}

// --- The buildings -------------------------------------------------------

const WALL = 0.25
const FOUNDATION = 2.5
const ROOF = 0.35
const PARAPET = 0.6
// The office at the +x end of the front, its partitions this tall under a
// drop ceiling, and its door.
const OFFICE = { w: 8, d: 6, h: 3.0, door: 1.0 }
const MAN_DOOR = { width: 1.0, height: 2.2 }
const WINDOW = { width: 1.6, sill: 0.9, head: 2.2 }
const BAY = { width: 3.2, height: 3.6 }
// The floor kept clear: along the side walls, along the bays, before the
// office; and the aisles between rows, the cross aisle down the middle.
const SIDE_AISLE = 2.6
const DOCK_AISLE = 5
const FRONT_AISLE = 2.5
const AISLE = 3
const ROOF_PANEL = 6
// The high bays hang on a grid this far apart, this far under the roof.
const HIGH_BAY = { every: 8, drop: 1.4 }
// Pickups keep this far in from the outside walls, out of reach through
// them (CONFIG.player.pickupReach).
export const LOOT_INSET = 3

const BUILDING_LIST: readonly Building[] = [
  {
    id: 'nippersink',
    sign: 'nippersink',
    works: 'machines',
    w: 34,
    d: 22,
    h: 6.5,
    doors: { office: 'open', floor: 'shut', side: 'gone' },
    bays: ['shut', 'up', 'shut'],
    windows: ['broken', 'boarded'],
    holes: [],
    loot: [
      { at: 'office', kind: 'quarters', count: 6 },
      { at: 'aisle-0', kind: 'rip-it', count: 1 },
      { at: 'dock', kind: 'marlboro', count: 20 },
    ],
    seed: 0x1d01,
  },
  {
    id: 'hollis',
    sign: 'hollis',
    works: 'cold',
    w: 36,
    d: 24,
    h: 7.5,
    doors: { office: 'shut', floor: 'open', side: 'shut' },
    bays: ['shut', 'bent', 'shut', 'up'],
    windows: ['glass', 'broken'],
    holes: [4],
    loot: [
      { at: 'room', kind: 'ice-mountain', count: 1 },
      { at: 'office', kind: 'aspirin', count: 1 },
      { at: 'aisle-1', kind: 'pbr', count: 1 },
      { at: 'front', kind: 'quarters', count: 4 },
    ],
    seed: 0x1d02,
  },
  {
    id: 'valley-freight',
    sign: 'valley-freight',
    works: 'freight',
    w: 36,
    d: 26,
    h: 7.5,
    doors: { office: 'open', floor: 'open', side: 'shut' },
    bays: ['shut', 'shut', 'up', 'half', 'shut'],
    windows: ['broken', 'broken'],
    holes: [],
    lit: 3,
    loot: [
      { at: 'office', kind: 'twenty', count: 1 },
      { at: 'aisle-0', kind: 'red-bull', count: 1 },
      { at: 'aisle-1', kind: 'camel', count: 20 },
      { at: 'dock', kind: 'high-life', count: 1 },
    ],
    seed: 0x1d03,
  },
  {
    id: 'coral-canning',
    sign: 'coral-canning',
    works: 'cannery',
    w: 32,
    d: 24,
    h: 7,
    doors: { office: 'shut', floor: 'gone', side: 'open' },
    bays: ['up', 'shut', 'shut'],
    windows: ['boarded', 'boarded'],
    holes: [2],
    loot: [
      { at: 'aisle-0', kind: 'cabbage', count: 1 },
      { at: 'dock', kind: 'modelo', count: 1 },
      { at: 'front', kind: 'empty-can', count: 1 },
    ],
    seed: 0x1d04,
  },
  {
    id: 'box-carton',
    sign: 'box-carton',
    works: 'racks',
    w: 36,
    d: 24,
    h: 8,
    doors: { office: 'open', floor: 'shut', side: 'shut' },
    bays: ['shut', 'half', 'shut', 'shut'],
    windows: ['glass', 'glass'],
    holes: [],
    loot: [
      { at: 'office', kind: 'newport', count: 20 },
      { at: 'aisle-0', kind: 'quarters', count: 8 },
      { at: 'aisle-1', kind: 'monster', count: 1 },
      { at: 'dock', kind: 'ibuprofen', count: 1 },
    ],
    seed: 0x1d05,
  },
  {
    id: 'prairie-litho',
    sign: 'prairie-litho',
    works: 'print',
    w: 34,
    d: 22,
    h: 6.5,
    doors: { office: 'gone', floor: 'open', side: 'shut' },
    bays: ['shut', 'bent'],
    windows: ['broken', 'glass'],
    holes: [1],
    loot: [
      { at: 'office', kind: 'eye-drops', count: 1 },
      { at: 'aisle-0', kind: 'parliament', count: 20 },
      { at: 'front', kind: 'four-loko-punch', count: 1 },
    ],
    seed: 0x1d06,
  },
  {
    id: 'vacant-west',
    sign: 'for-lease',
    works: 'empty',
    w: 30,
    d: 22,
    h: 6,
    doors: { office: 'open', floor: 'gone', side: 'gone' },
    bays: ['up', 'bent', 'shut'],
    windows: ['boarded', 'broken'],
    holes: [1, 2],
    loot: [
      { at: 'front', kind: 'joints', count: 2 },
      { at: 'aisle-0', kind: 'md-2020', count: 1 },
      { at: 'office', kind: 'benadryl', count: 1 },
    ],
    seed: 0x1d07,
  },
  {
    id: 'greenwood-motor',
    sign: 'greenwood-motor',
    works: 'machines',
    w: 36,
    d: 24,
    h: 7,
    doors: { office: 'shut', floor: 'open', side: 'open' },
    bays: ['shut', 'up', 'shut'],
    windows: ['glass', 'boarded'],
    holes: [],
    lit: 1,
    loot: [
      { at: 'aisle-0', kind: 'quarters', count: 6 },
      { at: 'aisle-1', kind: 'nos', count: 1 },
      { at: 'office', kind: 'jim-beam', count: 1 },
      { at: 'dock', kind: 'empty-bottle', count: 1 },
    ],
    seed: 0x1d08,
  },
  {
    id: 'feed-seed',
    sign: 'feed-seed',
    works: 'freight',
    w: 34,
    d: 26,
    h: 7,
    doors: { office: 'open', floor: 'shut', side: 'gone' },
    bays: ['shut', 'shut', 'half', 'shut'],
    windows: ['broken', 'glass'],
    holes: [3],
    loot: [
      { at: 'aisle-0', kind: 'cabbage', count: 1 },
      { at: 'aisle-1', kind: 'nightcrawlers', count: 1 },
      { at: 'office', kind: 'djarum', count: 20 },
      { at: 'front', kind: 'rockstar', count: 1 },
    ],
    seed: 0x1d09,
  },
  {
    id: 'thornwood',
    sign: 'thornwood',
    works: 'racks',
    w: 36,
    d: 24,
    h: 8,
    doors: { office: 'gone', floor: 'shut', side: 'open' },
    bays: ['up', 'shut', 'shut', 'bent'],
    windows: ['broken', 'broken'],
    holes: [5],
    loot: [
      { at: 'aisle-0', kind: 'monster-ultra', count: 1 },
      { at: 'aisle-1', kind: 'twenty', count: 1 },
      { at: 'office', kind: 'marlboro', count: 20 },
      { at: 'dock', kind: 'quarters', count: 4 },
    ],
    seed: 0x1d0a,
  },
  {
    id: 'shadow-brook',
    sign: 'shadow-brook',
    works: 'cold',
    w: 34,
    d: 22,
    h: 6.5,
    doors: { office: 'open', floor: 'shut', side: 'shut' },
    bays: ['shut', 'up', 'shut'],
    windows: ['glass', 'glass'],
    holes: [],
    loot: [
      { at: 'room', kind: 'gold-bullion', count: 1 },
      { at: 'office', kind: 'grey-goose', count: 1 },
      { at: 'aisle-1', kind: 'four-loko-blue', count: 1 },
    ],
    seed: 0x1d0b,
  },
  {
    id: 'scorched',
    sign: 'scorched',
    works: 'empty',
    w: 36,
    d: 26,
    h: 7,
    doors: { office: 'gone', floor: 'gone', side: 'shut' },
    bays: ['bent', 'shut', 'up', 'shut', 'bent'],
    windows: ['broken', 'broken'],
    holes: [0, 2, 3],
    loot: [
      { at: 'front', kind: 'wild-turkey', count: 1 },
      { at: 'aisle-0', kind: 'quarters', count: 8 },
      { at: 'dock', kind: 'empty-pack', count: 1 },
    ],
    seed: 0x1d0c,
  },
]

// The building's own measures, from its size: the floor kept for rows of
// whatever it held (x from x0 to x1, z from z0 to z1, the cross aisle at
// `mid`), the z of each row, and the x of each bay.
interface Plan {
  x0: number
  x1: number
  z0: number
  z1: number
  mid: number
  rows: number[]
  depth: number
  bays: number[]
  // The office's +x end is the wall; it reaches back to `back`, across to
  // `side`.
  office: { side: number; back: number; door: number }
  floorDoor: number
  // The cold room: x from x0 to x1 (the field's -x half).
  room: { x0: number; x1: number; door: number }
}

const ROW_DEPTH: Record<Works, number> = {
  racks: 1.2,
  freight: 1.4,
  machines: 1.8,
  print: 2.6,
  cannery: 2.4,
  cold: 1.2,
  empty: 1.2,
}

function planOf(b: Building): Plan {
  const x0 = -b.w / 2 + SIDE_AISLE
  const x1 = b.w / 2 - SIDE_AISLE
  const z0 = -b.d / 2 + DOCK_AISLE
  const z1 = b.d / 2 - OFFICE.d - FRONT_AISLE
  const depth = ROW_DEPTH[b.works]
  const rows: number[] = []
  for (let z = z0 + depth / 2; z + depth / 2 <= z1; z += depth + AISLE) {
    rows.push(z)
  }
  const n = b.bays.length
  const span = b.w - 8
  const bays = Array.from({ length: n }, (_, i) =>
    n === 1 ? 0 : -span / 2 + (span * i) / (n - 1)
  )
  const side = b.w / 2 - OFFICE.w
  return {
    x0,
    x1,
    z0,
    z1,
    mid: (x0 + x1) / 2,
    rows,
    depth,
    bays,
    office: { side, back: b.d / 2 - OFFICE.d, door: side + OFFICE.w / 2 },
    floorDoor: -b.w / 4,
    room: { x0, x1: (x0 + x1) / 2 - AISLE / 2, door: (x0 + (x0 + x1) / 2) / 2 },
  }
}

function box(
  name: string,
  center: Vec3,
  size: Vec3,
  finish: WorksFinish,
  blocks = false,
  turn?: Vec3
): WorksBox {
  return turn
    ? { name, center, size, finish, blocks, turn }
    : { name, center, size, finish, blocks }
}

// A box from its x, y and z extents.
function span(
  name: string,
  [x0, x1]: [number, number],
  [y0, y1]: [number, number],
  [z0, z1]: [number, number],
  finish: WorksFinish,
  blocks = false
): WorksBox {
  return box(
    name,
    [(x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2],
    [x1 - x0, y1 - y0, z1 - z0],
    finish,
    blocks
  )
}

// An opening in a wall run: `at` its middle along the run, `width` wide,
// from `bottom` (a window's sill; 0 for a door) to `top`.
interface Gap {
  at: number
  width: number
  bottom: number
  top: number
}

// A wall along x (at z = `fixed`, its middle) or along z (at x =
// `fixed`), from `from` to `to`, `h` tall, broken by its gaps: the
// pieces between them block, the lintel over each does not, and a sill
// under a window does. `skin` adds the split-face wainscot on the side
// `out` (+1 or -1 along the wall's normal).
function wallRun(
  name: string,
  along: 'x' | 'z',
  fixed: number,
  [from, to]: [number, number],
  h: number,
  gaps: readonly Gap[],
  finish: WorksFinish,
  out = 0
): WorksBox[] {
  const boxes: WorksBox[] = []
  const t: [number, number] = [fixed - WALL / 2, fixed + WALL / 2]
  const piece = (
    part: string,
    a: number,
    b: number,
    y: [number, number],
    blocks: boolean,
    f: WorksFinish = finish
  ) => {
    if (b - a < 0.01) return
    boxes.push(
      along === 'x'
        ? span(`${name}-${part}`, [a, b], y, t, f, blocks)
        : span(`${name}-${part}`, t, y, [a, b], f, blocks)
    )
  }
  const sorted = [...gaps].sort((p, q) => p.at - q.at)
  let at = from
  sorted.forEach((gap, i) => {
    const a = gap.at - gap.width / 2
    const b = gap.at + gap.width / 2
    piece(`${i}`, at, a, [0, h], true)
    piece(`${i}-lintel`, a, b, [gap.top, h], false)
    if (gap.bottom > 0) piece(`${i}-sill`, a, b, [0, gap.bottom], true)
    at = b
  })
  piece('end', at, to, [0, h], true)
  if (out !== 0) {
    // The wainscot, a hair proud of the outside face, the length of the
    // run under its openings' bottoms.
    const face = fixed + out * (WALL / 2 + 0.03)
    const s: [number, number] = [face - 0.03, face + 0.03]
    const y: [number, number] = [0, 1.2]
    let w0 = from
    for (const gap of sorted) {
      const a = gap.at - gap.width / 2
      if (a > w0) {
        boxes.push(
          along === 'x'
            ? span(`${name}-skin-${a}`, [w0, a], y, s, 'block')
            : span(`${name}-skin-${a}`, s, y, [w0, a], 'block')
        )
      }
      w0 = gap.bottom > 0 ? a : gap.at + gap.width / 2
    }
    if (to > w0) {
      boxes.push(
        along === 'x'
          ? span(`${name}-skin-end`, [w0, to], y, s, 'block')
          : span(`${name}-skin-end`, s, y, [w0, to], 'block')
      )
    }
  }
  return boxes
}

// A man-door in a wall's opening: its leaf swung out flat against the
// wall, gone, or shut across the opening (and blocking). `out` is the
// outside along the wall's normal.
function manDoor(
  name: string,
  along: 'x' | 'z',
  fixed: number,
  at: number,
  state: ManDoor,
  out: 1 | -1
): WorksBox[] {
  const { width, height } = MAN_DOOR
  const leaf = 0.06
  if (state === 'gone') return []
  if (state === 'shut') {
    return [
      along === 'x'
        ? box(
            name,
            [at, height / 2, fixed],
            [width, height, leaf],
            'door',
            true
          )
        : box(
            name,
            [fixed, height / 2, at],
            [leaf, height, width],
            'door',
            true
          ),
    ]
  }
  // Open: out past the wall, turned back nearly flat beside the opening.
  const o = fixed + out * 0.55
  return [
    along === 'x'
      ? box(
          name,
          [at + width * 0.55, height / 2, o],
          [width, height, leaf],
          'door',
          false,
          [0, out * 1.25, 0]
        )
      : box(
          name,
          [o, height / 2, at + width * 0.55],
          [leaf, height, width],
          'door',
          false,
          [0, out * 1.25, 0]
        ),
  ]
}

// The shell: the slab, the four walls with their openings, the man-doors,
// the bays and what stands round them, the roof in its panels (less the
// ones fallen in, which lie on the floor), the joists and the parapet.
function shell(b: Building, plan: Plan): WorksBox[] {
  const { w, d, h } = b
  const hw = w / 2
  const hd = d / 2
  const boxes: WorksBox[] = [
    span('slab', [-hw, hw], [-FOUNDATION, 0], [-hd, hd], 'slab'),
    span(
      'floor',
      [-hw + WALL, hw - WALL],
      [0, 0.01],
      [-hd + WALL, hd - WALL],
      'floor'
    ),
  ]
  const door = (at: number): Gap => ({
    at,
    width: MAN_DOOR.width,
    bottom: 0,
    top: MAN_DOOR.height,
  })
  const window = (at: number): Gap => ({
    at,
    width: WINDOW.width,
    bottom: WINDOW.sill,
    top: WINDOW.head,
  })
  const office = plan.office.door
  const panes = [office - 2.4, office + 2.4]
  // The front, its doors and the office's windows.
  boxes.push(
    ...wallRun(
      'front',
      'x',
      hd - WALL / 2,
      [-hw, hw],
      h,
      [door(office), door(plan.floorDoor), window(panes[0]), window(panes[1])],
      'siding',
      1
    ),
    ...manDoor('door-office', 'x', hd - WALL / 2, office, b.doors.office, 1),
    ...manDoor(
      'door-floor',
      'x',
      hd - WALL / 2,
      plan.floorDoor,
      b.doors.floor,
      1
    )
  )
  b.windows.forEach((kind, i) => {
    const at = panes[i]
    const z = hd - WALL / 2
    const x: [number, number] = [at - WINDOW.width / 2, at + WINDOW.width / 2]
    if (kind === 'glass') {
      boxes.push(
        span(
          `pane-${i}`,
          x,
          [WINDOW.sill, WINDOW.head],
          [z - 0.02, z + 0.02],
          'glass'
        )
      )
    } else if (kind === 'boarded') {
      boxes.push(
        span(
          `board-${i}`,
          [x[0] - 0.05, x[1] + 0.05],
          [WINDOW.sill - 0.1, WINDOW.head + 0.1],
          [hd, hd + 0.03],
          'plywood'
        )
      )
    } else {
      boxes.push(
        box(
          `shard-${i}`,
          [at - 0.4, WINDOW.sill + 0.2, z],
          [0.5, 0.4, 0.03],
          'glass',
          false,
          [0, 0, 0.5]
        ),
        box(
          `shard-floor-${i}`,
          [at, 0.02, z - 0.9],
          [0.6, 0.02, 0.4],
          'glass',
          false,
          [0, 0.7, 0]
        )
      )
    }
  })
  // The side door, in the -x wall.
  boxes.push(
    ...wallRun(
      'side-w',
      'z',
      -hw + WALL / 2,
      [-hd + WALL, hd - WALL],
      h,
      [door(0)],
      'siding',
      -1
    ),
    ...manDoor('door-side', 'z', -hw + WALL / 2, 0, b.doors.side, -1),
    ...wallRun(
      'side-e',
      'z',
      hw - WALL / 2,
      [-hd + WALL, hd - WALL],
      h,
      [],
      'siding',
      1
    )
  )
  // The back and its bays.
  const bayGap = (at: number): Gap => ({
    at,
    width: BAY.width,
    bottom: 0,
    top: BAY.height,
  })
  boxes.push(
    ...wallRun(
      'back',
      'x',
      -hd + WALL / 2,
      [-hw, hw],
      h,
      plan.bays.map(bayGap),
      'siding',
      -1
    )
  )
  plan.bays.forEach((x, i) => {
    boxes.push(...bay(b.bays[i], x, -hd, i))
  })
  // The roof in panels across x, each from the top of the walls; the
  // ones fallen in lie broken on the floor under the hole.
  const panels = Math.max(1, Math.round(w / ROOF_PANEL))
  const pw = w / panels
  for (let i = 0; i < panels; i++) {
    const p0 = -hw + i * pw
    const p1 = p0 + pw
    if (b.holes.includes(i)) {
      const mid = (p0 + p1) / 2
      boxes.push(
        box(
          `fallen-${i}-a`,
          [mid - pw * 0.15, 0.6, -d * 0.12],
          [pw * 0.7, 0.12, d * 0.35],
          'roof',
          false,
          [0.35, 0.2, 0.1]
        ),
        box(
          `fallen-${i}-b`,
          [mid + pw * 0.1, 0.3, d * 0.15],
          [pw * 0.6, 0.12, d * 0.28],
          'roof',
          false,
          [-0.2, -0.3, 0.12]
        ),
        box(
          `fallen-${i}-joist`,
          [mid, 0.4, 0],
          [0.25, 0.3, d * 0.6],
          'joist',
          false,
          [0.1, 0.5, 0.3]
        ),
        box(
          `rubble-${i}`,
          [mid + 0.8, 0.1, -d * 0.02],
          [2.2, 0.2, 1.6],
          'debris',
          false,
          [0, 0.4, 0]
        )
      )
      continue
    }
    boxes.push(span(`roof-${i}`, [p0, p1], [h, h + ROOF], [-hd, hd], 'roof'))
  }
  // The bar joists across under the roof at every panel's edge.
  for (let i = 1; i < panels; i++) {
    const x = -hw + i * pw
    boxes.push(
      span(
        `joist-${i}`,
        [x - 0.12, x + 0.12],
        [h - 0.5, h],
        [-hd + WALL, hd - WALL],
        'joist'
      )
    )
  }
  // The parapet round the roof's edge, capped.
  const top: [number, number] = [h + ROOF, h + ROOF + PARAPET]
  boxes.push(
    span('parapet-front', [-hw, hw], top, [hd - WALL, hd], 'siding'),
    span('parapet-back', [-hw, hw], top, [-hd, -hd + WALL], 'siding'),
    span('parapet-w', [-hw, -hw + WALL], top, [-hd, hd], 'siding'),
    span('parapet-e', [hw - WALL, hw], top, [-hd, hd], 'siding'),
    span(
      'cap-front',
      [-hw - 0.05, hw + 0.05],
      [top[1], top[1] + 0.08],
      [hd - WALL - 0.05, hd + 0.05],
      'trim'
    ),
    span(
      'cap-back',
      [-hw - 0.05, hw + 0.05],
      [top[1], top[1] + 0.08],
      [-hd - 0.05, -hd + WALL + 0.05],
      'trim'
    )
  )
  return boxes
}

// One loading bay in the back wall (at z = `back`, the outside face): its
// roll-up door as it hangs, the housing over it inside, the bumpers and
// the bollards outside, the dead lamp on its arm.
function bay(state: BayDoor, x: number, back: number, i: number): WorksBox[] {
  const { width, height } = BAY
  const z = back + WALL / 2
  const boxes: WorksBox[] = [
    span(
      `bay-${i}-housing`,
      [x - width / 2 - 0.1, x + width / 2 + 0.1],
      [height, height + 0.5],
      [z + 0.15, z + 0.6],
      'steel'
    ),
  ]
  const door = (y0: number, y1: number, blocks: boolean) =>
    span(
      `bay-${i}-door`,
      [x - width / 2, x + width / 2],
      [y0, y1],
      [z - 0.05, z + 0.05],
      'rollup',
      blocks
    )
  if (state === 'shut') boxes.push(door(0, height, true))
  else if (state === 'up') boxes.push(door(height - 0.5, height, false))
  else if (state === 'half') boxes.push(door(2.0, height, false))
  else {
    // Off its track at one side: hanging slant, the bottom corner on the
    // floor out on the lot.
    boxes.push(
      box(
        `bay-${i}-door`,
        [x + 0.2, height * 0.55, z - 0.6],
        [width * 0.95, height * 0.75, 0.08],
        'rollup',
        false,
        [0.35, 0.1, 0.25]
      )
    )
  }
  for (const s of [-1, 1]) {
    const edge = x + s * (width / 2 + 0.3)
    boxes.push(
      span(
        `bay-${i}-bumper-${s}`,
        [edge - 0.12, edge + 0.12],
        [0.25, 0.85],
        [back - 0.15, back],
        'rubber'
      ),
      box(
        `bay-${i}-bollard-${s}`,
        [x + s * (width / 2 + 0.7), 0.6, back - 0.7],
        [0.22, 1.2, 0.22],
        'hazard',
        true
      )
    )
  }
  boxes.push(
    span(
      `bay-${i}-lamp`,
      [x + width / 2 + 0.4, x + width / 2 + 0.8],
      [height + 0.6, height + 0.75],
      [back - 0.7, back],
      'steel'
    ),
    span(
      `bay-${i}-lens`,
      [x + width / 2 + 0.45, x + width / 2 + 0.75],
      [height + 0.45, height + 0.6],
      [back - 0.65, back - 0.4],
      'dead-tube'
    )
  )
  return boxes
}

// The office: its partitions under a drop ceiling (a tile or two down),
// its door, the desk, the cabinets, the safe.
function office(b: Building, plan: Plan, rng: () => number): WorksBox[] {
  const hw = b.w / 2
  const hd = b.d / 2
  const { side, back, door } = plan.office
  const boxes: WorksBox[] = [
    ...wallRun(
      'office-side',
      'z',
      side + WALL / 2,
      [back, hd - WALL],
      OFFICE.h,
      [],
      'office'
    ),
    ...wallRun(
      'office-back',
      'x',
      back + WALL / 2,
      [side, hw - WALL],
      OFFICE.h,
      [{ at: door, width: OFFICE.door, bottom: 0, top: 2.2 }],
      'office'
    ),
    span(
      'office-ceiling',
      [side, hw - WALL],
      [OFFICE.h, OFFICE.h + 0.05],
      [back, hd - WALL],
      'ceiling'
    ),
    box(
      'office-tile',
      [door + 1.5, 0.03, back + 2.2],
      [0.6, 0.02, 0.6],
      'ceiling',
      false,
      [0, 0.6, 0]
    ),
    // The desk against the side partition, the cabinets in the corner.
    span(
      'office-desk',
      [side + 0.4, side + 1.2],
      [0, 0.75],
      [back + 1.5, back + 3.3],
      'desk',
      true
    ),
    span(
      'office-cabinets',
      [hw - 0.8, hw - WALL],
      [0, 1.4],
      [back + 0.4, back + 1.6],
      'steel',
      true
    ),
    box(
      'office-chair',
      [side + 1.6, 0.25, back + 2.2],
      [0.5, 0.5, 0.5],
      'steel',
      false,
      [0, 0, 1.4]
    ),
    box(
      'office-papers',
      [side + 2.4, 0.01, back + 3.4],
      [0.9, 0.01, 0.6],
      'paper',
      false,
      [0, range(rng, 0, 3), 0]
    ),
  ]
  return boxes
}

// What filled the floor, kind by kind, in rows along x either side of the
// cross aisle.
function works(b: Building, plan: Plan, rng: () => number): WorksBox[] {
  const boxes: WorksBox[] = []
  const segments: [number, number][] = [
    [plan.x0, plan.mid - AISLE / 2],
    [plan.mid + AISLE / 2, plan.x1],
  ]
  const fill = (fn: (x0: number, x1: number, z: number, tag: string) => void) =>
    plan.rows.forEach((z, r) =>
      segments.forEach(([x0, x1], s) => fn(x0, x1, z, `${r}-${s}`))
    )
  const dd = plan.depth
  const racks = (x0: number, x1: number, z: number, tag: string) => {
    const tall = Math.min(b.h - 2, 5)
    const levels = [1.5, 3.0, 4.5].filter((y) => y < tall)
    boxes.push(
      span(
        `rack-${tag}-base`,
        [x0, x1],
        [0, 0.15],
        [z - dd / 2, z + dd / 2],
        'pallet',
        true
      )
    )
    const n = Math.max(1, Math.ceil((x1 - x0) / 2.8))
    const step = (x1 - x0) / n
    for (let i = 0; i <= n; i++) {
      const x = Math.min(x1 - 0.05, Math.max(x0 + 0.05, x0 + i * step))
      for (const s of [-1, 1]) {
        boxes.push(
          box(
            `rack-${tag}-up-${i}-${s}`,
            [x, tall / 2, z + (s * (dd - 0.1)) / 2],
            [0.1, tall, 0.1],
            'upright'
          )
        )
      }
    }
    for (const y of levels) {
      for (const s of [-1, 1]) {
        boxes.push(
          span(
            `rack-${tag}-beam-${y}-${s}`,
            [x0, x1],
            [y - 0.12, y],
            [z + (s * dd) / 2 - 0.06, z + (s * dd) / 2 + 0.06],
            'beam'
          )
        )
      }
    }
    for (let i = 0; i < n; i++) {
      const bx0 = x0 + i * step + 0.15
      const bx1 = x0 + (i + 1) * step - 0.15
      for (const y of [0.15, ...levels]) {
        if (rng() < 0.3) continue
        const top = Math.min(1.1, range(rng, 0.6, 1.2))
        boxes.push(
          span(
            `rack-${tag}-load-${i}-${y}`,
            [bx0, bx1],
            [y, y + top],
            [z - dd / 2 + 0.1, z + dd / 2 - 0.1],
            rng() < 0.6 ? 'cardboard' : 'wrap'
          )
        )
      }
    }
  }
  const freight = (x0: number, x1: number, z: number, tag: string) => {
    for (let x = x0; x + 1.2 <= x1; x += 1.4) {
      const top = range(rng, 0.8, 2.4)
      boxes.push(
        span(
          `stack-${tag}-${x.toFixed(1)}-pallet`,
          [x, x + 1.2],
          [0, 0.14],
          [z - 0.6, z + 0.6],
          'pallet'
        ),
        span(
          `stack-${tag}-${x.toFixed(1)}`,
          [x, x + 1.2],
          [0.14, 0.14 + top],
          [z - 0.6, z + 0.6],
          rng() < 0.5 ? 'wrap' : 'cardboard',
          true
        )
      )
    }
  }
  const machines = (x0: number, x1: number, z: number, tag: string) => {
    let x = x0
    for (let i = 0; ; i++) {
      const len = range(rng, 1.6, 2.6)
      if (x + len > x1) break
      const deep = range(rng, 1.2, dd)
      const tall = range(rng, 1.4, 2.2)
      boxes.push(
        span(
          `machine-${tag}-${i}`,
          [x, x + len],
          [0, tall],
          [z - deep / 2, z + deep / 2],
          'machine',
          true
        ),
        span(
          `machine-${tag}-${i}-panel`,
          [x + len * 0.6, x + len * 0.6 + 0.4],
          [tall, tall + 0.5],
          [z - 0.2, z + 0.2],
          'steel'
        ),
        span(
          `machine-${tag}-${i}-stripe`,
          [x - 0.05, x + len + 0.05],
          [0.1, 0.2],
          [z - deep / 2 - 0.02, z + deep / 2 + 0.02],
          'hazard'
        )
      )
      x += len + 1.4
    }
  }
  const presses = (x0: number, x1: number, z: number, tag: string) => {
    const len = x1 - x0 - 2
    boxes.push(
      span(
        `press-${tag}`,
        [x0 + 1, x0 + 1 + len],
        [0, 2.2],
        [z - dd / 2 + 0.2, z + dd / 2 - 0.2],
        'machine',
        true
      ),
      span(
        `press-${tag}-rollers`,
        [x0 + 1.4, x0 + len],
        [2.2, 2.7],
        [z - 0.5, z + 0.5],
        'steel'
      ),
      span(
        `press-${tag}-feed`,
        [x0 + 1 + len - 0.1, x0 + 1 + len + 0.6],
        [0.8, 1.6],
        [z - 0.8, z + 0.8],
        'paper',
        true
      )
    )
  }
  const cannery = (x0: number, x1: number, z: number, tag: string) => {
    if (tag.startsWith('0') || tag.startsWith('2')) {
      for (let x = x0; x + 2.2 <= x1; x += 3.2) {
        boxes.push(
          span(
            `tank-${tag}-${x.toFixed(1)}`,
            [x, x + 2.2],
            [0, 4.2],
            [z - 1.1, z + 1.1],
            'tank',
            true
          ),
          span(
            `tank-${tag}-${x.toFixed(1)}-legs`,
            [x + 0.3, x + 1.9],
            [4.2, 4.5],
            [z - 0.8, z + 0.8],
            'steel'
          )
        )
      }
    } else {
      boxes.push(
        span(
          `conveyor-${tag}`,
          [x0, x1],
          [0, 0.85],
          [z - 0.45, z + 0.45],
          'steel',
          true
        ),
        span(
          `conveyor-${tag}-belt`,
          [x0, x1],
          [0.85, 0.9],
          [z - 0.4, z + 0.4],
          'rubber'
        )
      )
    }
  }
  const camp = () => {
    // Someone has been sleeping in here: a mattress by a fire in a drum,
    // pallets stood up round them against the wind through the holes.
    const x = plan.mid + 2
    const z = (plan.z0 + plan.z1) / 2
    boxes.push(
      span(
        'camp-mattress',
        [x - 1, x + 1],
        [0, 0.25],
        [z - 0.7, z + 1.3],
        'mattress'
      ),
      box(
        'camp-blanket',
        [x - 0.2, 0.27, z + 0.4],
        [1.4, 0.04, 1.2],
        'blanket',
        false,
        [0, 0.3, 0]
      ),
      box('camp-drum', [x + 2.2, 0.45, z - 0.2], [0.6, 0.9, 0.6], 'drum', true),
      box(
        'camp-flame',
        [x + 2.2, 1.05, z - 0.2],
        [0.35, 0.35, 0.35],
        'flame',
        false,
        [0.4, 0.6, 0.2]
      ),
      box(
        'camp-pallet-a',
        [x - 1.8, 0.6, z + 0.3],
        [0.14, 1.2, 1.2],
        'pallet',
        true
      ),
      box('camp-pallet-b', [x, 0.6, z + 2.2], [1.2, 1.2, 0.14], 'pallet', true)
    )
    for (let i = 0; i < 5; i++) {
      boxes.push(
        box(
          `junk-${i}`,
          [
            range(rng, plan.x0 + 1, plan.x1 - 1),
            0.08,
            range(rng, plan.z0, plan.z1),
          ],
          [range(rng, 0.6, 1.4), 0.16, range(rng, 0.5, 1.2)],
          i % 2 ? 'debris' : 'pallet',
          false,
          [0, range(rng, 0, 3), 0]
        )
      )
    }
  }
  const coldRoom = () => {
    // The cold room on the -x half of the floor, its door to the front
    // aisle and its strip curtain hanging in it.
    const { x0, x1, door } = plan.room
    const z0 = plan.z0
    const z1 = plan.z1
    const tall = 3.4
    boxes.push(
      ...wallRun(
        'room-back',
        'x',
        z0 + WALL / 2,
        [x0, x1],
        tall,
        [],
        'insulated'
      ),
      ...wallRun(
        'room-front',
        'x',
        z1 - WALL / 2,
        [x0, x1],
        tall,
        [{ at: door, width: 1.6, bottom: 0, top: 2.4 }],
        'insulated'
      ),
      ...wallRun(
        'room-w',
        'z',
        x0 + WALL / 2,
        [z0 + WALL, z1 - WALL],
        tall,
        [],
        'insulated'
      ),
      ...wallRun(
        'room-e',
        'z',
        x1 - WALL / 2,
        [z0 + WALL, z1 - WALL],
        tall,
        [],
        'insulated'
      ),
      span('room-top', [x0, x1], [tall, tall + 0.15], [z0, z1], 'insulated')
    )
    for (let i = 0; i < 6; i++) {
      boxes.push(
        span(
          `room-strip-${i}`,
          [door - 0.8 + i * 0.27, door - 0.8 + i * 0.27 + 0.2],
          [0.5, 2.4],
          [z1 - 0.02, z1],
          'wrap'
        )
      )
    }
    // Hooks along the back and crates by the walls inside.
    for (let x = x0 + 1; x < x1 - 1; x += 1.2) {
      boxes.push(
        box(
          `room-hook-${x.toFixed(1)}`,
          [x, 2.4, z0 + 0.8],
          [0.04, 0.4, 0.04],
          'steel'
        )
      )
    }
    boxes.push(
      span(
        'room-crates',
        [x0 + WALL, x0 + 1.4],
        [0, 1.0],
        [z0 + 1.4, z1 - 1.6],
        'pallet',
        true
      )
    )
  }
  switch (b.works) {
    case 'racks':
      fill(racks)
      break
    case 'freight':
      fill(freight)
      break
    case 'machines':
      fill(machines)
      break
    case 'print':
      fill(presses)
      break
    case 'cannery':
      fill(cannery)
      break
    case 'cold':
      coldRoom()
      plan.rows.forEach((z, r) =>
        racks(plan.mid + AISLE / 2, plan.x1, z, `${r}-1`)
      )
      break
    case 'empty':
      camp()
      break
  }
  // A dead forklift on the open floor inside the front door, forks to
  // the back; and where there are bays enough, another in the aisle
  // along them, parked between the last two.
  const burnt = b.id === 'scorched'
  boxes.push(
    ...forklift('forklift-front', {
      x: -b.w / 2 + 4.5,
      z: b.d / 2 - 4.5,
      along: 'z',
      ahead: -1,
      burnt,
      loaded: b.seed % 3 === 0,
      flat: 'rear-left',
    })
  )
  if (plan.bays.length >= 3) {
    const n = plan.bays.length
    boxes.push(
      ...forklift('forklift-dock', {
        x: (plan.bays[n - 2] + plan.bays[n - 1]) / 2 - 0.4,
        z: -b.d / 2 + 2.6,
        along: 'x',
        ahead: 1,
        burnt,
        loaded: b.seed % 2 === 0,
        flat: 'front-right',
      })
    )
  }
  // A pallet jack left out, a drum or two by the bays, a puddle under a
  // hole: what every floor kept.
  boxes.push(
    box(
      'jack',
      [plan.bays[0] + 2.2, 0.15, -b.d / 2 + 2.6],
      [0.6, 0.3, 1.5],
      'hazard',
      false,
      [0, range(rng, -0.6, 0.6), 0]
    ),
    box(
      'drum-a',
      [-b.w / 2 + 0.8, 0.45, -b.d / 2 + 1.0],
      [0.6, 0.9, 0.6],
      'drum',
      true
    ),
    box(
      'drum-b',
      [-b.w / 2 + 1.6, 0.45, -b.d / 2 + 0.9],
      [0.6, 0.9, 0.6],
      'drum',
      true
    ),
    box(
      'drum-down',
      [-b.w / 2 + 1.4, 0.3, -b.d / 2 + 2.2],
      [0.6, 0.9, 0.6],
      'drum',
      false,
      [Math.PI / 2, 0.4, 0]
    )
  )
  for (const hole of b.holes) {
    const panels = Math.max(1, Math.round(b.w / ROOF_PANEL))
    const x = -b.w / 2 + (hole + 0.5) * (b.w / panels)
    boxes.push(
      span(
        `puddle-${hole}`,
        [x - 2, x + 1.5],
        [0.012, 0.02],
        [-b.d * 0.3, b.d * 0.05],
        'puddle'
      )
    )
  }
  return boxes
}

// A forklift dead where it was left (`x`, `z` its body's middle, its
// length `along` x or z, its forks `ahead` that way): forks dropped to the
// floor, a tyre gone flat, the hood up, the mast leaning, a pallet still
// on the forks if `loaded`, charred black if `burnt`. Its body blocks,
// square, from the counterweight to the mast; nothing else of it does.
export const FORKLIFT = { back: 1.3, front: 0.7, forks: 2.15, half: 0.55 }

export function forklift(
  name: string,
  {
    x,
    z,
    along,
    ahead,
    burnt,
    loaded,
    flat,
  }: {
    x: number
    z: number
    along: 'x' | 'z'
    ahead: 1 | -1
    burnt: boolean
    loaded: boolean
    flat: 'rear-left' | 'front-right'
  }
): WorksBox[] {
  // Its own frame: u forward (to the forks), v across, y up; each box is
  // given there and laid into the building's.
  const paint: WorksFinish = burnt ? 'debris' : 'hazard'
  const metal: WorksFinish = burnt ? 'debris' : 'steel'
  const at = (u: number, v: number): [number, number] =>
    along === 'x'
      ? [x + ahead * u, z + ahead * v]
      : [x + ahead * v, z + ahead * u]
  const part = (
    tag: string,
    [u0, u1]: [number, number],
    [y0, y1]: [number, number],
    [v0, v1]: [number, number],
    finish: WorksFinish,
    blocks = false,
    tip = 0
  ): WorksBox => {
    const [cx, cz] = at((u0 + u1) / 2, (v0 + v1) / 2)
    const lu = u1 - u0
    const lv = v1 - v0
    const size: Vec3 = along === 'x' ? [lu, y1 - y0, lv] : [lv, y1 - y0, lu]
    // A tip leans it forward about its across axis.
    const turn: Vec3 | undefined =
      tip === 0
        ? undefined
        : along === 'x'
          ? [0, 0, -ahead * tip]
          : [ahead * tip, 0, 0]
    return box(
      `${name}-${tag}`,
      [cx, (y0 + y1) / 2, cz],
      size,
      finish,
      blocks,
      turn
    )
  }
  const { back, front, forks, half } = FORKLIFT
  const boxes: WorksBox[] = [
    part('body', [-back, front], [0.2, 1.15], [-half, half], paint, true),
    part('weight', [-back, -back + 0.4], [1.15, 1.3], [-half, half], metal),
    part('seat', [-0.55, -0.15], [1.15, 1.5], [-0.25, 0.25], 'rubber'),
    part('hood', [-1.0, -0.3], [1.3, 1.36], [-0.45, 0.45], paint, false, 0.6),
    part('roof', [-0.8, 0.55], [2.15, 2.22], [-half, half], metal),
    part(
      'mast-l',
      [0.75, 0.85],
      [0.1, 2.3],
      [-0.42, -0.32],
      metal,
      false,
      0.08
    ),
    part('mast-r', [0.75, 0.85], [0.1, 2.3], [0.32, 0.42], metal, false, 0.08),
    part('carriage', [0.85, 0.95], [0.05, 0.6], [-0.42, 0.42], metal),
    part('fork-l', [0.95, forks], [0, 0.05], [-0.36, -0.24], metal),
    part('fork-r', [0.95, forks], [0, 0.05], [0.24, 0.36], metal),
  ]
  for (const u of [-0.75, 0.5]) {
    for (const v of [-0.5, 0.5]) {
      boxes.push(
        part(
          `guard-${u}-${v}`,
          [u - 0.03, u + 0.03],
          [1.15, 2.15],
          [v - 0.03, v + 0.03],
          metal
        )
      )
    }
  }
  // The tyres, one of them flat.
  for (const [u, end] of [
    [-0.85, 'rear'],
    [0.45, 'front'],
  ] as const) {
    for (const [v, side] of [
      [-half, 'left'],
      [half, 'right'],
    ] as const) {
      const down = flat === `${end}-${side}`
      const top = down ? 0.32 : 0.55
      boxes.push(
        part(
          `tyre-${end}-${side}`,
          [u - 0.27, u + 0.27],
          [0, top],
          [v - 0.12, v + 0.12],
          'rubber'
        )
      )
    }
  }
  if (loaded) {
    boxes.push(
      part('pallet', [0.98, forks], [0.05, 0.19], [-0.6, 0.6], 'pallet'),
      part(
        'load',
        [1.05, forks - 0.05],
        [0.19, 1.05],
        [-0.55, 0.55],
        burnt ? 'debris' : 'cardboard'
      )
    )
  }
  return boxes
}

// The high bays on their grid under the roof, every one dead but `lit`;
// none over a hole.
function highBays(b: Building): WorksBox[] {
  const boxes: WorksBox[] = []
  const nx = Math.max(1, Math.floor(b.w / HIGH_BAY.every))
  const nz = Math.max(1, Math.floor(b.d / HIGH_BAY.every))
  const panels = Math.max(1, Math.round(b.w / ROOF_PANEL))
  const y = b.h - HIGH_BAY.drop
  let i = 0
  for (let ix = 0; ix < nx; ix++) {
    for (let iz = 0; iz < nz; iz++) {
      const x = -b.w / 2 + (ix + 0.5) * (b.w / nx)
      const z = -b.d / 2 + (iz + 0.5) * (b.d / nz)
      const panel = Math.floor((x + b.w / 2) / (b.w / panels))
      const n = i++
      if (b.holes.includes(panel)) continue
      boxes.push(
        box(
          `highbay-${n}-chain`,
          [x, y + HIGH_BAY.drop / 2, z],
          [0.03, HIGH_BAY.drop, 0.03],
          'steel'
        ),
        box(
          `highbay-${n}`,
          [x, y, z],
          [0.5, 0.18, 1.3],
          n === b.lit ? 'tube' : 'dead-tube'
        )
      )
    }
  }
  return boxes
}

// A building's painted panels: its sign over the office, the notice on
// its front door, a number over each bay, and a tag on the side.
function signs(b: Building, plan: Plan): WorksSign[] {
  const hd = b.d / 2
  const list: WorksSign[] = [
    {
      name: 'sign',
      art: b.sign,
      center: [plan.office.door, b.h - 1.3, hd + 0.03],
      size: [7.4, 1.5],
      turn: [0, 0, 0],
    },
    {
      name: 'notice',
      art: 'no-trespassing',
      center: [plan.floorDoor + 1.4, 1.5, hd + 0.03],
      size: [0.9, 0.6],
      turn: [0, 0, 0],
    },
    {
      name: 'tag',
      art: b.seed % 2 ? 'graffiti-eye' : 'graffiti-tag',
      center: [-b.w / 2 - 0.05, 1.8, -hd / 2],
      size: [3.2, 1.8],
      turn: [0, -Math.PI / 2, 0],
    },
  ]
  plan.bays.forEach((x, i) => {
    list.push({
      name: `bay-${i}`,
      art: `bay-${Math.min(5, i + 1)}` as WorksArtId,
      center: [x, BAY.height + 0.75, -hd - 0.03],
      size: [0.9, 0.7],
      turn: [0, Math.PI, 0],
    })
  })
  return list
}

// Where in a building a spot is, building-local.
export function spotOf(b: Building, at: Spot, n = 0): XZ {
  const plan = planOf(b)
  const aisle = (i: number): XZ => {
    // Between rows (or before the first, with only one), out from the
    // cross aisle.
    const rows = plan.rows
    const z =
      rows.length > 1
        ? (rows[Math.min(i, rows.length - 2)] +
            rows[Math.min(i, rows.length - 2) + 1]) /
          2
        : (plan.z0 + plan.z1) / 2
    const x = i % 2 === 0 ? plan.mid - 4 - n : plan.mid + 4 + n
    return { x, z }
  }
  switch (at) {
    case 'office':
      return {
        x: b.w / 2 - LOOT_INSET - 0.4 - n,
        z: b.d / 2 - LOOT_INSET - 0.4,
      }
    case 'front':
      return { x: plan.floorDoor + 1.5 + n, z: b.d / 2 - LOOT_INSET - 1 }
    case 'aisle-0':
      return aisle(0)
    case 'aisle-1':
      return aisle(1)
    case 'dock':
      return {
        x: plan.bays[Math.min(1, plan.bays.length - 1)] + 1 + n,
        z: -b.d / 2 + LOOT_INSET + 0.2,
      }
    case 'room':
      return { x: plan.room.door + n, z: (plan.z0 + plan.z1) / 2 }
  }
}

// Where the shadowmen that keep to a building drift (shadowmen.ts): the
// aisle along the bays, the open floor at the front, and among its rows.
function lurksOf(b: Building): XZ[] {
  const plan = planOf(b)
  return [
    { x: 0, z: -b.d / 2 + 2.6 },
    { x: plan.floorDoor, z: plan.z1 + 1.4 },
    spotOf(b, 'aisle-1', 2),
  ]
}

// --- The park ------------------------------------------------------------

// The buildings in three columns back from the plaza (their middles' x,
// park-local) and four rows down -z, ROW apart; each row's parking runs
// PARKING deep in front of its buildings, a metre's walk off their front
// walls, and its truck court behind, to the next row's parking.
const COLUMNS = [-30, -86, -142]
const ROW = 66
const PARKING = 20
// The asphalt, park-local: from the alley behind the plaza back past the
// last column, and down past the last row's truck court.
const PAD = { x0: -170, x1: 0, z0: -266, z1: 0 }
// Where the drives' lamps stand: down the edges of the pad and between
// the columns, every LAMP_STEP along z.
const LAMP_X = [-5, -58, -114, -165]
const LAMP_STEP = 33
const STALL = { width: 2.8, length: 5 }

// Where building `i` stands in the park (its middle, park-local), its
// row and its column.
function placeOf(i: number, b: Building): XZ & { row: number; col: number } {
  const row = Math.floor(i / COLUMNS.length)
  const col = i % COLUMNS.length
  const front = -row * ROW - PARKING - 1
  return { x: COLUMNS[col], z: front - b.d / 2, row, col }
}

interface Paint {
  // From a to b, park-local.
  a: XZ
  b: XZ
  width: number
  color: string
}

// What stands round the buildings, park-local: the park's sign out
// front, the semi trailers backed against bays that are shut, the cars
// left in the stalls, a dumpster at each building's west wall by its back
// corner, empty pallets heaped and drums out by the bays, and pallets of
// boxes left in the truck courts.
export interface WorksProp extends XZ {
  kind: 'sign' | 'trailer' | 'car' | 'dumpster' | 'pallets' | 'drums' | 'load'
  // rotation.y in the park's frame: the prop's own +Z turned to (sin, cos).
  yaw: number
  color?: 'red' | 'blue' | 'white' | 'burnt'
  fallen?: boolean
  // A load's layers of cartons, and whether it went under shrink-wrap.
  layers?: number
  wrapped?: boolean
}

const STRIPE = '#5e5c55'
const BAY_LINE = '#8a7a2a'

function paintOf(): Paint[] {
  const paint: Paint[] = []
  BUILDING_LIST.forEach((b, i) => {
    const p = placeOf(i, b)
    const front = p.z + b.d / 2
    const back = p.z - b.d / 2
    // Two rows of stalls before the front, nose in and nose out.
    for (const [z0, z1] of [
      [front + 1.5, front + 1.5 + STALL.length],
      [front + 13, front + 13 + STALL.length],
    ]) {
      for (let x = p.x - b.w / 2; x <= p.x + b.w / 2 + 0.01; x += STALL.width) {
        paint.push({
          a: { x, z: z0 },
          b: { x, z: z1 },
          width: 0.12,
          color: STRIPE,
        })
      }
    }
    // The guide lines out from each bay across the truck court.
    planOf(b).bays.forEach((bx) => {
      for (const s of [-1, 1]) {
        const x = p.x + bx + s * (BAY.width / 2 + 0.6)
        paint.push({
          a: { x, z: back - 1 },
          b: { x, z: back - 14 },
          width: 0.15,
          color: BAY_LINE,
        })
      }
    })
  })
  return paint
}

const CAR_COLORS = ['red', 'blue', 'white', 'burnt'] as const

// The park's sign out front: at the edge of the asphalt where the
// plaza's alley comes in, between the edge drive's lamps, its faces
// turned (yaw) to look up the alley and out toward the plaza at once.
const PARK_SIGN_AT = { x: -3, z: -56, yaw: -Math.PI / 4 }

function propsOf(): WorksProp[] {
  const props: WorksProp[] = [{ kind: 'sign', ...PARK_SIGN_AT }]
  const rng = mulberry32(0x1d0ff)
  BUILDING_LIST.forEach((b, i) => {
    const p = placeOf(i, b)
    const plan = planOf(b)
    const front = p.z + b.d / 2
    const back = p.z - b.d / 2
    // A trailer against every other shut bay, nose out across the court.
    let shut = 0
    b.bays.forEach((state, k) => {
      if (state !== 'shut' || shut++ % 2 === 1) return
      props.push({
        kind: 'trailer',
        x: p.x + plan.bays[k],
        z: back - 0.6 - TRAILER.length / 2,
        yaw: 0,
      })
    })
    // A car or two in the stalls, nose to the building or away.
    const stalls = Math.floor(b.w / STALL.width)
    for (let n = 0; n < 2; n++) {
      if (rng() < 0.3) continue
      const k = Math.floor(rng() * stalls)
      const x = p.x - b.w / 2 + (k + 0.5) * STALL.width
      const nose = rng() < 0.5
      props.push({
        kind: 'car',
        x,
        z: nose
          ? front + 1.5 + STALL.length / 2
          : front + 13 + STALL.length / 2,
        yaw: (nose ? 0 : Math.PI) + range(rng, -0.12, 0.12),
        color: CAR_COLORS[Math.floor(rng() * CAR_COLORS.length)],
      })
    }
    props.push(
      {
        kind: 'dumpster',
        x: p.x - b.w / 2 - 1.4,
        z: back + 4,
        yaw: 0,
        fallen: rng() < 0.25,
      },
      {
        kind: 'pallets',
        x: p.x + b.w / 2 - 2,
        z: back - 2.5,
        yaw: range(rng, -0.4, 0.4),
      },
      {
        kind: 'drums',
        x: p.x + b.w / 2 + 1.6,
        z: back + 2,
        yaw: range(rng, 0, Math.PI),
      }
    )
  })
  props.push(...loadsOf())
  return props
}

// The pallets of boxes left in the truck courts, on their own seed so the
// rest stay where they were: between a building's bays (never in front of
// one, and clear of the trailers backed into them), a few metres out
// across the court, one now and then with another beside it.
function loadsOf(): WorksProp[] {
  const loads: WorksProp[] = []
  const rng = mulberry32(0x1d10ad)
  BUILDING_LIST.forEach((b, i) => {
    const p = placeOf(i, b)
    const back = p.z - b.d / 2
    const bays = planOf(b).bays
    for (let k = 0; k + 1 < bays.length; k++) {
      if (rng() < 0.3) continue
      const x = p.x + (bays[k] + bays[k + 1]) / 2 + range(rng, -0.4, 0.4)
      const z = back - range(rng, 4, 10)
      const load = (dz: number): WorksProp => ({
        kind: 'load',
        x,
        z: z - dz,
        yaw: range(rng, -0.25, 0.25),
        layers: 1 + Math.floor(rng() * 3),
        wrapped: rng() < 0.35,
      })
      loads.push(load(0))
      if (rng() < 0.4) loads.push(load(LOAD.length + 0.3))
    }
  })
  return loads
}

// The props' sizes: what each covers on the ground, along its own z.
export const TRAILER = { width: 2.6, length: 13.6, height: 4.0, deck: 1.25 }
export const CAR = { width: 1.9, length: 4.8, height: 1.4 }
export const PALLET_HEAP = { width: 1.3, length: 1.3, height: 1.2 }
// A pallet of boxes: the pallet, and each layer of cartons on it.
export const LOAD = { width: 1.2, length: 1.2, deck: 0.14, layer: 0.42 }
export const DRUMS = { radius: 1.0 }
// The park's sign: a panel between two block piers on a concrete base,
// `length` along its own z, `width` through, `height` to its cap.
export const PARK_SIGN = {
  width: 0.7,
  length: 4.8,
  height: 2.6,
  panel: { length: 3.8, bottom: 0.8, top: 2.3 },
}

// Every prop as boxes in its own frame (its middle on the ground, its
// length along +Z), for industrialmodel.ts to draw.
export function propBoxes(prop: WorksProp): WorksBox[] {
  switch (prop.kind) {
    case 'trailer': {
      const { width, length, height, deck } = TRAILER
      const hw = width / 2
      const hl = length / 2
      const boxes: WorksBox[] = [
        span('body', [-hw, hw], [deck, height], [-hl, hl], 'trailer'),
        span(
          'rails',
          [-hw - 0.02, hw + 0.02],
          [deck - 0.25, deck],
          [-hl, hl],
          'steel'
        ),
        span(
          'doors',
          [-hw + 0.05, hw - 0.05],
          [deck + 0.05, height - 0.05],
          [hl, hl + 0.03],
          'steel'
        ),
        span(
          'legs',
          [-hw + 0.3, hw - 0.3],
          [0, deck - 0.25],
          [-hl + 2.5, -hl + 2.8],
          'steel'
        ),
      ]
      for (const z of [hl - 1.4, hl - 2.6]) {
        for (const s of [-1, 1]) {
          boxes.push(
            span(
              `tyre-${z}-${s}`,
              s < 0 ? [-hw, -hw + 0.6] : [hw - 0.6, hw],
              [0, 1.0],
              [z - 0.5, z + 0.5],
              'rubber'
            )
          )
        }
      }
      return boxes
    }
    case 'car': {
      const { width, length, height } = CAR
      const hw = width / 2
      const hl = length / 2
      const paint = `car-${prop.color ?? 'white'}` as WorksFinish
      const boxes: WorksBox[] = [
        span('body', [-hw, hw], [0.3, 0.85], [-hl, hl], paint),
        span(
          'cabin',
          [-hw + 0.12, hw - 0.12],
          [0.85, height],
          [-hl + 1.3, hl - 1.1],
          paint
        ),
        span(
          'glass',
          [-hw + 0.1, hw - 0.1],
          [0.9, height - 0.08],
          [-hl + 1.25, hl - 1.05],
          prop.color === 'burnt' ? 'debris' : 'glass'
        ),
      ]
      for (const z of [-hl + 0.8, hl - 0.8]) {
        for (const s of [-1, 1]) {
          boxes.push(
            span(
              `tyre-${z}-${s}`,
              s < 0 ? [-hw - 0.02, -hw + 0.25] : [hw - 0.25, hw + 0.02],
              [0, 0.6],
              [z - 0.3, z + 0.3],
              'rubber'
            )
          )
        }
      }
      return boxes
    }
    case 'load': {
      const { width, deck, layer } = LOAD
      const layers = prop.layers ?? 1
      const boxes: WorksBox[] = [
        box('pallet', [0, deck / 2, 0], [width, deck, width], 'pallet'),
      ]
      if (prop.wrapped) {
        boxes.push(
          box(
            'wrapped',
            [0, deck + (layers * layer) / 2, 0],
            [width - 0.04, layers * layer, width - 0.04],
            'wrap'
          )
        )
        return boxes
      }
      // Four cartons a layer, each a little askew; the top one short a
      // carton, which lies fallen beside it.
      const c = width / 2 - 0.02
      for (let l = 0; l < layers; l++) {
        for (const [n, [x, z]] of [
          [c / 2, c / 2],
          [-c / 2, c / 2],
          [c / 2, -c / 2],
          [-c / 2, -c / 2],
        ].entries()) {
          if (l === layers - 1 && layers > 1 && n === 3) continue
          boxes.push(
            box(
              `carton-${l}-${n}`,
              [x, deck + layer * (l + 0.5), z],
              [c - 0.03, layer - 0.02, c - 0.03],
              'cardboard',
              false,
              [0, ((l + n) % 3) * 0.04 - 0.04, 0]
            )
          )
        }
      }
      if (layers > 1) {
        boxes.push(
          box(
            'carton-fallen',
            [-c, (c - 0.03) / 2, -width / 2 - 0.35],
            [c - 0.03, layer - 0.02, c - 0.03],
            'cardboard',
            false,
            [Math.PI / 2, 0.5, 0]
          )
        )
      }
      return boxes
    }
    case 'pallets': {
      const boxes: WorksBox[] = []
      for (let i = 0; i < 8; i++) {
        boxes.push(
          box(
            `pallet-${i}`,
            [0, 0.07 + i * 0.15, 0],
            [1.2, 0.14, 1.2],
            'pallet',
            false,
            [0, (i % 3) * 0.08, 0]
          )
        )
      }
      return boxes
    }
    case 'drums':
      return [
        box('drum-a', [-0.4, 0.45, 0], [0.6, 0.9, 0.6], 'drum'),
        box('drum-b', [0.35, 0.45, 0.2], [0.6, 0.9, 0.6], 'drum'),
        box('drum-c', [0, 0.3, -0.7], [0.6, 0.9, 0.6], 'drum', false, [
          Math.PI / 2,
          0.3,
          0,
        ]),
      ]
    case 'sign': {
      const { width, length, height, panel } = PARK_SIGN
      const hl = length / 2
      const pier = (length - panel.length) / 2
      return [
        span(
          'base',
          [-width / 2 - 0.15, width / 2 + 0.15],
          [0, 0.3],
          [-hl - 0.15, hl + 0.15],
          'slab'
        ),
        span(
          'pier-a',
          [-width / 2, width / 2],
          [0, height],
          [-hl, -hl + pier],
          'block'
        ),
        span(
          'pier-b',
          [-width / 2, width / 2],
          [0, height],
          [hl - pier, hl],
          'block'
        ),
        span(
          'panel',
          [-0.15, 0.15],
          [panel.bottom, panel.top],
          [-hl + pier, hl - pier],
          'trim'
        ),
        span(
          'cap',
          [-width / 2 - 0.05, width / 2 + 0.05],
          [height, height + 0.12],
          [-hl - 0.05, hl + 0.05],
          'slab'
        ),
      ]
    }
    case 'dumpster':
      // Drawn by plazamodel.ts buildDumpster, the plaza's own.
      return []
  }
}

// A prop's painted panels in its own frame: the park's sign reads on both
// faces; nothing else is painted.
export function propSigns(prop: WorksProp): WorksSign[] {
  if (prop.kind !== 'sign') return []
  const { panel } = PARK_SIGN
  const y = (panel.bottom + panel.top) / 2
  const size: [number, number] = [
    panel.length - 0.1,
    panel.top - panel.bottom - 0.1,
  ]
  return [
    {
      name: 'park-sign-out',
      art: 'park-sign',
      center: [0.16, y, 0],
      size,
      turn: [0, Math.PI / 2, 0],
    },
    {
      name: 'park-sign-in',
      art: 'park-sign',
      center: [-0.16, y, 0],
      size,
      turn: [0, -Math.PI / 2, 0],
    },
  ]
}

function lampsOf(): (XZ & { toward: XZ })[] {
  const lamps: (XZ & { toward: XZ })[] = []
  LAMP_X.forEach((x, k) => {
    // The edge lamps lean in over the pad; between the columns, they
    // take turns leaning either way.
    for (let z = -6, n = 0; z > PAD.z0; z -= LAMP_STEP, n++) {
      const side = k === 0 ? -1 : k === LAMP_X.length - 1 ? 1 : n % 2 ? 1 : -1
      lamps.push({ x, z, toward: { x: x + side, z } })
    }
  })
  return lamps
}

export const INDUSTRIAL = {
  buildings: BUILDING_LIST,
  // Each building's place in the park, park-local.
  places: BUILDING_LIST.map((b, i) => placeOf(i, b)),
  pad: PAD,
  paint: paintOf(),
  props: propsOf(),
  lamps: lampsOf(),
  wall: WALL,
  door: MAN_DOOR,
  bay: BAY,
  office: OFFICE,
} as const

// Every box of a building, building-local.
export function buildingBoxes(b: Building): WorksBox[] {
  const plan = planOf(b)
  const rng = mulberry32(b.seed)
  return [
    ...shell(b, plan),
    ...office(b, plan, rng),
    ...works(b, plan, rng),
    ...highBays(b),
  ]
}

export function buildingSigns(b: Building): WorksSign[] {
  return signs(b, planOf(b))
}

// What a building leaves lying, building-local.
export function buildingLoot(
  b: Building
): (XZ & { kind: PickupKind; count: number })[] {
  const seen: Record<string, number> = {}
  return b.loot.map((l) => {
    const n = (seen[l.at] = (seen[l.at] ?? -1) + 1)
    return { ...spotOf(b, l.at, n * 1.5), kind: l.kind, count: l.count }
  })
}

export function buildingLurks(b: Building): XZ[] {
  return lurksOf(b)
}

// The ways in, building-local, each where a raider passes through its
// wall, and whether it is open: the front doors, the side door, the bays.
export function waysOf(b: Building): (XZ & { name: string; open: boolean })[] {
  const plan = planOf(b)
  const hd = b.d / 2
  const hw = b.w / 2
  const passes = (s: ManDoor) => s !== 'shut'
  return [
    {
      name: 'office',
      x: plan.office.door,
      z: hd - WALL / 2,
      open: passes(b.doors.office),
    },
    {
      name: 'floor',
      x: plan.floorDoor,
      z: hd - WALL / 2,
      open: passes(b.doors.floor),
    },
    { name: 'side', x: -hw + WALL / 2, z: 0, open: passes(b.doors.side) },
    ...plan.bays.map((x, i) => ({
      name: `bay-${i}`,
      x,
      z: -hd + WALL / 2,
      open: b.bays[i] !== 'shut',
    })),
  ]
}

// --- Space ---------------------------------------------------------------

// The park's frame: the spawn station's moved to CONFIG.industrial.at
// (station-local), turned the same way.
export function parkOrigin(station: StoreOrigin): StoreOrigin {
  const { at } = CONFIG.industrial
  const [x, , z] = toWorld(station, [at.x, 0, at.z])
  return { x, z, yaw: station.yaw, y: 0 }
}

// Building `i`'s frame at its deck.
export function buildingOrigin(
  park: StoreOrigin,
  i: number,
  deck: number
): StoreOrigin {
  const p = INDUSTRIAL.places[i]
  const [x, , z] = toWorld(park, [p.x, 0, p.z])
  return { x, z, yaw: park.yaw, y: deck }
}

// The height a building's floor stands at: a curb over the lot at its
// front, or higher where the ground under it would poke through.
// `terrain` is the raw heightfield.
export function buildingDeck(
  origin: StoreOrigin,
  b: Building,
  lotY: number,
  terrain: (x: number, z: number) => number
): number {
  let highest = -Infinity
  for (let x = -b.w / 2; x <= b.w / 2; x += 1) {
    for (let z = -b.d / 2; z <= b.d / 2; z += 1) {
      const [wx, , wz] = toWorld({ ...origin, y: 0 }, [x, 0, z])
      highest = Math.max(highest, terrain(wx, wz))
    }
  }
  return Math.max(lotY + 0.15, highest + 0.08)
}

// Whether a world point is on the park's asphalt, or within `margin`
// metres of it: trees keep off.
export function onParkGrounds(
  park: StoreOrigin,
  x: number,
  z: number,
  margin = 0
): boolean {
  const p = toLocal(park, x, z)
  return (
    p.x > PAD.x0 - margin &&
    p.x < PAD.x1 + margin &&
    p.z > PAD.z0 - margin &&
    p.z < PAD.z1 + margin
  )
}

// The park's middle in the world and how far its corners reach from it:
// the lair the spiders keep (lairs.ts) and the Book of Shadows' reach.
export function parkMiddle(park: StoreOrigin): XZ & { radius: number } {
  const mx = (PAD.x0 + PAD.x1) / 2
  const mz = (PAD.z0 + PAD.z1) / 2
  const [x, , z] = toWorld(park, [mx, 0, mz])
  return { x, z, radius: Math.hypot(PAD.x1 - mx, PAD.z1 - mz) }
}

// Where the Book of Shadows finds the park: three points down its middle,
// each reaching half its width and CONFIG.book.reach.industrial past.
export function parkRings(park: StoreOrigin): (XZ & { radius: number })[] {
  const mx = (PAD.x0 + PAD.x1) / 2
  const long = PAD.z1 - PAD.z0
  const radius = (PAD.x1 - PAD.x0) / 2 + CONFIG.book.reach.industrial
  return [1 / 6, 1 / 2, 5 / 6].map((part) => ({
    ...parkToWorld(park, { x: mx, z: PAD.z1 - long * part }),
    radius,
  }))
}

// Whether a world point is inside building `i`'s walls, at the park
// standing at `park`.
export function inBuilding(
  park: StoreOrigin,
  i: number,
  x: number,
  z: number
): boolean {
  const b = INDUSTRIAL.buildings[i]
  const p = toLocal(buildingOrigin(park, i, 0), x, z)
  return Math.abs(p.x) < b.w / 2 && Math.abs(p.z) < b.d / 2
}

// A blocking box as a wall in the world: its centreline along its long
// side and half its thickness, the capsule pulled in to cover the box.
export function worksWall(
  origin: StoreOrigin,
  b: { center: Vec3; size: Vec3 }
): WallSegment {
  const [cx, , cz] = b.center
  const [sx, , sz] = b.size
  const alongX = sx >= sz
  const half = (alongX ? sz : sx) / 2
  const reach = Math.max(0, (alongX ? sx : sz) / 2 - half)
  const a: Vec3 = alongX ? [cx - reach, 0, cz] : [cx, 0, cz - reach]
  const e: Vec3 = alongX ? [cx + reach, 0, cz] : [cx, 0, cz + reach]
  const [ax, , az] = toWorld(origin, a)
  const [ex, , ez] = toWorld(origin, e)
  const wall: WallSegment = { a: { x: ax, z: az }, b: { x: ex, z: ez }, half }
  if (isLow(b)) wall.low = true
  return wall
}

// Every wall a building puts up, in the world.
export function worksWalls(origin: StoreOrigin, b: Building): WallSegment[] {
  return buildingBoxes(b)
    .filter((box) => box.blocks)
    .map((box) => worksWall(origin, box))
}

// The world point of a park-local one.
export function parkToWorld(park: StoreOrigin, p: XZ): XZ {
  const [x, , z] = toWorld(park, [p.x, 0, p.z])
  return { x, z }
}

// Every pickup the park leaves lying, in the world, building by building.
export function parkLoot(
  park: StoreOrigin
): (XZ & { kind: PickupKind; count: number })[] {
  return INDUSTRIAL.buildings.flatMap((b, i) => {
    const origin = buildingOrigin(park, i, 0)
    return buildingLoot(b).map((l) => {
      const [x, , z] = toWorld(origin, [l.x, 0, l.z])
      return { x, z, kind: l.kind, count: l.count }
    })
  })
}

// Every lurk in the park, in the world (the hello's `lurks`).
export function parkLurks(park: StoreOrigin): XZ[] {
  return INDUSTRIAL.buildings.flatMap((b, i) => {
    const origin = buildingOrigin(park, i, 0)
    return buildingLurks(b).map((l) => {
      const [x, , z] = toWorld(origin, [l.x, 0, l.z])
      return { x, z }
    })
  })
}
