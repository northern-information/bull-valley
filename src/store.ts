// Pure: the walk-in Citgo. One layout every station shares, in
// station-local space (the pump island at the origin, local +X toward the
// road, local Z along it, y up from the lot), plus what it takes to shop
// there: shelf stock, cash, and which shelf unit the player is looking
// at. assets.ts builds the shell, shelves, lights and signs from
// STORE_LAYOUT, world.ts registers its floor and walls, so what is drawn,
// what blocks, and what E buys can never drift apart. No three.js, no DOM.

import { CONFIG } from './config.ts'
import { isSpirit } from './drinks.ts'
import { ITEMS } from './items.ts'
import type { HeightAt, ShopStock, Vec3, XZ } from './interfaces.ts'
import type { ItemId } from './items.ts'

// A station as the store sees it: its pump island in the world, the yaw
// that turns local +X toward the road, and the height the building stands
// on (storeBase).
export interface StoreOrigin extends XZ {
  yaw: number
  y: number
}

// What a box is drawn in; assets.ts maps each to a material. `light` is a
// lit fluorescent panel, `glass` a storefront window; the coolers have
// their own enamel, glass, lit back and sign strip.
export type StoreFinish =
  | 'floor'
  | 'wall'
  | 'roof'
  | 'shelf'
  | 'counter'
  | 'light'
  | 'glass'
  | 'cooler'
  | 'cooler-glass'
  | 'cooler-inside'
  | 'cooler-glow'
  | 'locker'
  | 'tile'
  | 'porcelain'
  | 'mirror'
  | 'door'
  | 'lining'
  | 'table'
  | 'steel'
  | 'backdoor'
  | 'pad'

// One box of the building or its fixtures, centred at `center` with full
// `size`, both station-local. `blocks` boxes are walls to the player.
interface StoreBox {
  name: string
  center: Vec3
  size: Vec3
  finish: StoreFinish
  blocks: boolean
}

// One item kind on a shelf: where each unit stands (station-local, on the
// shelf top), and the yaw that turns its art (asset +Z) toward the aisle.
export interface Facing {
  kind: ItemId
  slots: Vec3[]
  yaw: number
}

// A facing in the world, for aiming at it: each unit's slot, in order.
export interface WorldFacing {
  kind: ItemId
  units: Vec3[]
}

// The unit the player is looking at: its facing, and its slot there.
interface UnitInView<F extends WorldFacing> {
  facing: F
  unit: number
}

// The advertisements on the shop's walls, and the flag and the notices in
// the back room; adart.ts paints each by id.
export type AdId =
  | 'smokes'
  | 'thanks'
  | 'beer'
  | 'energy'
  | 'flag'
  | 'lift'
  | 'accidents'
  | 'the-law'
  | 'fire'
  | 'restroom'
  | 'wash-hands'
  | 'exit'

// A photograph pinned to a wall: the path of an image under public/.
interface Photo {
  photo: string
}

// One sign on a wall: a flat panel `size` wide and tall, centred at
// `center` just off the wall face, turned by `yaw` so its art (asset +Z)
// faces away from the wall. The art is an advertisement adart.ts paints
// or a photograph. Decoration only: it neither blocks nor sells.
export interface StoreSign {
  name: string
  art: AdId | Photo
  center: Vec3
  size: [number, number]
  yaw: number
  // In the bathroom, lit by the laptop's screen alone (bathglow.ts).
  dark?: true
}

// --- The layout ----------------------------------------------------------

// The building: back to front along local X, side to side along local Z.
// The front wall faces the pumps and meets the lot's back edge
// (FUEL_LAYOUT.lot.back in assets.ts). The shop runs from the partition to
// the front; the back room, where the lockers are, from the back wall to
// the partition.
const BACK = -17.5
const PARTITION = -13.5
const FRONT = -6.5
const HALF_WIDTH = 5.5
const HEIGHT = 3.4
const WALL = 0.2
const FLOOR = 0.1
const DOOR_WIDTH = 1.8
const DOOR_HEIGHT = 2.3
// The doorway through the partition into the back room, at its -Z end,
// against the side wall.
const BACK_DOOR = { z0: -HALF_WIDTH + WALL, width: 1.2 }
const BACK_DOOR_Z1 = BACK_DOOR.z0 + BACK_DOOR.width
// The storefront windows either side of the door: glass from sill to
// header, a jamb's width from the door and a post's width from the
// corner, with one mullion down the middle.
const WINDOW = { sill: 0.9, head: 2.6, jamb: 0.3, post: 0.4, mullion: 0.08 }
const GLASS = 0.04
// The building stands level on a slope: a foundation this deep under the
// floor fills whatever gap the terrain leaves, and the floor clears the
// highest terrain under it by FLOOR_CLEARANCE.
const FOUNDATION = 1.5
const FLOOR_CLEARANCE = 0.08

// Along the partition, from a step past the back doorway to the +Z wall:
// first the liquor's open shelf, then a bank of reach-in coolers, glass
// doors on the shop side and drinks on wire shelves behind them. Each
// door's shelf
// holds one kind, filled top shelf first, door by door; a kind's units
// stand in lanes across the shelf, front to back.
const COOLER = {
  depth: 0.65,
  height: 2.05,
  doors: 5,
  shelves: [1.42, 0.92, 0.42],
  // The kick plate under the doors, and the lit sign strip over them.
  base: 0.15,
  header: 0.2,
  // The steel between doors, and how far a lane and a row sit apart.
  mullion: 0.05,
  lane: 0.2,
  row: 0.11,
  // The most lanes across one shelf; more units go further back.
  lanes: 5,
}
const COOLER_BACK = PARTITION + WALL
const COOLER_FACE = COOLER_BACK + COOLER.depth
const COOLER_X = (COOLER_BACK + COOLER_FACE) / 2
const BOARD = { z0: BACK_DOOR_Z1 + 0.2, z1: HALF_WIDTH - WALL }
const SHELF_BOARD = 0.04
// The liquor's shelf at the run's -Z end: an open wooden unit, a bottle
// kind to a board at the coolers' shelf heights, a cap over the top, and a
// gap before the coolers start.
const LIQUOR = { width: 1.5, depth: 0.4, height: 1.85, gap: 0.1 }
const LIQUOR_FACE = COOLER_BACK + LIQUOR.depth
const LIQUOR_X = (COOLER_BACK + LIQUOR_FACE) / 2
const LIQUOR_Z = BOARD.z0 + LIQUOR.width / 2
const COOLER_Z0 = BOARD.z0 + LIQUOR.width + LIQUOR.gap
// The counter by the door: cigarettes and joints on top.
const COUNTER = { x: -8.6, z0: 1.4, z1: 5.0, depth: 0.6, height: 1.0 }
// Where David Carlsten stands: behind the counter, between it and the
// front wall, facing across it into the room (-X). Yaw turns a figure's
// +Z face that way.
const CLERK = {
  x: -7.6,
  z: (COUNTER.z0 + COUNTER.z1) / 2,
  yaw: -Math.PI / 2,
  // He blocks like a post this wide.
  radius: 0.25,
}
// The fluorescent troffers on the ceiling: two rows across the shop, two
// panels each, long side along Z like the aisle, hung flush under the roof;
// and one in the middle of the back room.
const LIGHT = {
  rows: [-11.75, -8.25],
  along: [-2.75, 2.75],
  size: [0.3, 0.06, 2.4] as Vec3,
  backRoom: [(BACK + PARTITION) / 2, 0] as const,
}
// The lockers: a bank of tall steel lockers against the back wall, facing
// the partition (+X), centred across the room. Every raider's stash is in
// one of them (stash.ts); E in front of the bank opens yours.
const LOCKERS = { count: 8, width: 0.45, height: 1.85, depth: 0.5 }
// The back door, through the back wall to the right of the lockers as you
// face them (-Z), near the corner: a steel door stood open outward onto
// the pad, against the wall.
const BACK_DOOR_OUT = { z: -4.4, width: 1.0 }
// The concrete pad out back, the store's whole width, at the floor's
// height on its own foundation, and the dumpster on it a stride off the
// back wall, its length along the wall.
const PAD = { depth: 4.5 }
const DUMPSTER_SPOT = { x: BACK - 0.6 - 0.65, z: 2.6, yaw: -Math.PI / 2 }
// The dumpster's footprint (plazamodel.ts DUMPSTER, its length along the
// wall), for its wall.
const DUMPSTER_SIZE = { length: 1.9, width: 1.3 }
// The bathroom: the back room's +Z end walled off past the lockers, its
// doorway against the partition. Inside, the toilet against the back wall
// and the sink under its mirror on the +Z wall. Decoration only, though
// you can walk in.
const BATH = {
  // The wall's centreline, and its thickness.
  z: 2.6,
  wall: 0.1,
  // The doorway, from the partition's back face toward the back wall.
  door: 1.0,
  toilet: { z: 4.4 },
  sink: { x: -15.6 },
  // The card table against the +Z wall between the sink and the
  // partition, the laptop on it facing the doorway (-Z).
  table: { x: -14.25, size: 0.72, height: 0.7, top: 0.03, leg: 0.025 },
}
const BATH_INSIDE = BATH.z + BATH.wall / 2
const BATH_DOOR_X0 = PARTITION - BATH.door
// The signs stand this far off their wall, so they never z-fight with it.
const SIGN_DEPTH = 0.04
// The rack on the +Z wall beside the counter: medicine, at eye height.
const MED_RACK = { x0: -12.6, x1: -9.6, height: 1.15, depth: 0.3 }
const MED_RACK_Z = HALF_WIDTH - WALL - MED_RACK.depth / 2

const BOARD_LENGTH = BOARD.z1 - COOLER_Z0
const BOARD_Z = (COOLER_Z0 + BOARD.z1) / 2

function box(
  name: string,
  center: Vec3,
  size: Vec3,
  finish: StoreFinish,
  blocks = false
): StoreBox {
  return { name, center, size, finish, blocks }
}

// One door's width in the cooler bank.
const COOLER_DOOR = BOARD_LENGTH / COOLER.doors

// The liquor's shelf: its kick plate is the footprint that blocks, a back
// against the partition, an upright at each end, a board at each of the
// coolers' shelf heights and a cap over the top, all in the counter's
// wood.
function liquorShelf(): StoreBox[] {
  const bodyY = (FLOOR + LIQUOR.height) / 2
  const bodyH = LIQUOR.height - FLOOR
  const boxes: StoreBox[] = [
    box(
      'liquor-base',
      [LIQUOR_X, FLOOR + COOLER.base / 2, LIQUOR_Z],
      [LIQUOR.depth, COOLER.base, LIQUOR.width],
      'counter',
      true
    ),
    box(
      'liquor-back',
      [COOLER_BACK + 0.01, bodyY, LIQUOR_Z],
      [0.02, bodyH, LIQUOR.width],
      'counter'
    ),
    box(
      'liquor-cap',
      [LIQUOR_X, LIQUOR.height - SHELF_BOARD / 2, LIQUOR_Z],
      [LIQUOR.depth, SHELF_BOARD, LIQUOR.width],
      'counter'
    ),
  ]
  for (const [i, z] of [BOARD.z0, BOARD.z0 + LIQUOR.width].entries()) {
    const inward = i === 0 ? 1 : -1
    boxes.push(
      box(
        `liquor-end-${i}`,
        [LIQUOR_X, bodyY, z + (inward * SHELF_BOARD) / 2],
        [LIQUOR.depth, bodyH, SHELF_BOARD],
        'counter'
      )
    )
  }
  COOLER.shelves.forEach((y, i) => {
    boxes.push(
      box(
        `liquor-board-${i}`,
        [LIQUOR_X, y - SHELF_BOARD / 2, LIQUOR_Z],
        [LIQUOR.depth, SHELF_BOARD, LIQUOR.width],
        'counter'
      )
    )
  })
  return boxes
}

// The cooler bank along the partition: the carcass (its kick plate is the
// footprint that blocks, its ends, the lit back inside, the sign strip over
// the doors), a wire shelf at every height, and the glass doors on the
// shop side between their mullions, each with its handle.
function coolers(): StoreBox[] {
  const bottom = FLOOR + COOLER.base
  const top = COOLER.height - COOLER.header
  const doorY = (bottom + top) / 2
  const doorH = top - bottom
  const bodyY = (FLOOR + COOLER.height) / 2
  const bodyH = COOLER.height - FLOOR
  const boxes: StoreBox[] = [
    box(
      'cooler-base',
      [COOLER_X, FLOOR + COOLER.base / 2, BOARD_Z],
      [COOLER.depth, COOLER.base, BOARD_LENGTH],
      'cooler',
      true
    ),
    box(
      'cooler-header',
      [COOLER_X, COOLER.height - COOLER.header / 2, BOARD_Z],
      [COOLER.depth, COOLER.header, BOARD_LENGTH],
      'cooler-glow'
    ),
    box(
      'cooler-back',
      [COOLER_BACK + 0.01, doorY, BOARD_Z],
      [0.02, doorH, BOARD_LENGTH],
      'cooler-inside'
    ),
  ]
  for (const [i, z] of [COOLER_Z0, BOARD.z1].entries()) {
    const inward = i === 0 ? 1 : -1
    boxes.push(
      box(
        `cooler-end-${i}`,
        [COOLER_X, bodyY, z + (inward * COOLER.mullion) / 2],
        [COOLER.depth, bodyH, COOLER.mullion],
        'cooler'
      )
    )
  }
  COOLER.shelves.forEach((y, i) => {
    boxes.push(
      box(
        `cooler-shelf-${i}`,
        [COOLER_X, y - SHELF_BOARD / 2, BOARD_Z],
        [COOLER.depth - 0.04, SHELF_BOARD, BOARD_LENGTH],
        'shelf'
      )
    )
  })
  for (let d = 0; d < COOLER.doors; d++) {
    const z0 = COOLER_Z0 + d * COOLER_DOOR
    const zc = z0 + COOLER_DOOR / 2
    if (d > 0) {
      boxes.push(
        box(
          `cooler-mullion-${d}`,
          [COOLER_FACE - COOLER.mullion / 2, doorY, z0],
          [COOLER.mullion, doorH, COOLER.mullion],
          'cooler'
        )
      )
    }
    boxes.push(
      box(
        `cooler-door-${d}`,
        [COOLER_FACE + 0.01, doorY, zc],
        [0.02, doorH, COOLER_DOOR - COOLER.mullion],
        'cooler-glass'
      ),
      // The handle up the door's +Z edge, where it swings open from.
      box(
        `cooler-handle-${d}`,
        [COOLER_FACE + 0.04, doorY, z0 + COOLER_DOOR - 0.12],
        [0.025, 0.6, 0.025],
        'cooler'
      )
    )
  }
  return boxes
}

// The bathroom in the back room's +Z end: its wall with the doorway
// against the partition and the lintel over it, the door stood open
// against the partition, a tiled floor, the toilet, and the sink under its
// mirror.
function bathroom(wallY: number, wallH: number): StoreBox[] {
  const inner = BACK + WALL
  const sideZ = HALF_WIDTH - WALL
  const depth = sideZ - BATH_INSIDE
  const toilet = BATH.toilet.z
  const sink = BATH.sink.x
  return [
    box(
      'bath-wall',
      [(inner + BATH_DOOR_X0) / 2, wallY, BATH.z],
      [BATH_DOOR_X0 - inner, wallH, BATH.wall],
      'wall',
      true
    ),
    box(
      'bath-lintel',
      [
        (BATH_DOOR_X0 + PARTITION) / 2,
        HEIGHT - (HEIGHT - DOOR_HEIGHT) / 2,
        BATH.z,
      ],
      [BATH.door, HEIGHT - DOOR_HEIGHT, BATH.wall],
      'wall'
    ),
    // Swung in against the partition, a hand off it.
    box(
      'bath-door',
      [PARTITION - 0.04, FLOOR + (DOOR_HEIGHT - 0.02) / 2, BATH_INSIDE + 0.5],
      [0.04, DOOR_HEIGHT - 0.02, 0.9],
      'door'
    ),
    box(
      'bath-floor',
      [(inner + PARTITION) / 2, FLOOR + 0.005, BATH_INSIDE + depth / 2],
      [PARTITION - inner, 0.01, depth],
      'tile'
    ),
    // The toilet: the tank on the wall, the bowl before it, the lid down.
    box(
      'toilet-tank',
      [inner + 0.11, 0.68, toilet],
      [0.22, 0.42, 0.5],
      'porcelain'
    ),
    box(
      'toilet-bowl',
      [inner + 0.45, FLOOR + 0.19, toilet],
      [0.48, 0.38, 0.38],
      'porcelain',
      true
    ),
    box(
      'toilet-lid',
      [inner + 0.45, FLOOR + 0.4, toilet],
      [0.46, 0.04, 0.4],
      'porcelain'
    ),
    // The sink on a pedestal, the mirror over it.
    box(
      'sink-pedestal',
      [sink, FLOOR + 0.36, sideZ - 0.2],
      [0.16, 0.72, 0.16],
      'porcelain',
      true
    ),
    box(
      'sink-basin',
      [sink, 0.88, sideZ - 0.22],
      [0.55, 0.14, 0.44],
      'porcelain'
    ),
    box('mirror', [sink, 1.55, sideZ - 0.01], [0.5, 0.7, 0.02], 'mirror'),
    ...cardTable(sideZ),
    ...lining(inner, sideZ),
  ]
}

// The card table: a vinyl top on four steel legs. The top's footprint
// blocks; the legs stand under it.
function cardTable(sideZ: number): StoreBox[] {
  const { x, size, height, top, leg } = BATH.table
  const z = sideZ - size / 2 - 0.02
  const legH = height - top
  const off = size / 2 - leg
  const legs = [
    [-1, -1],
    [-1, 1],
    [1, -1],
    [1, 1],
  ].map(([i, j], n) =>
    box(
      `card-table-leg-${n}`,
      [x + i * off, FLOOR + legH / 2, z + j * off],
      [leg, legH, leg],
      'steel'
    )
  )
  return [
    box(
      'card-table',
      [x, FLOOR + height - top / 2, z],
      [size, top, size],
      'table',
      true
    ),
    ...legs,
  ]
}

// The bathroom's own faces a hair inside the walls it shares with the
// rest of the store, the ceiling included, so the screen's light falls on
// them alone (bathglow.ts) and nothing from the back room does.
function lining(inner: number, sideZ: number): StoreBox[] {
  const t = 0.01
  const depth = sideZ - BATH_INSIDE
  const midZ = BATH_INSIDE + depth / 2
  const width = PARTITION - inner
  const wallH = HEIGHT - FLOOR
  const midY = FLOOR + wallH / 2
  const lintelH = HEIGHT - DOOR_HEIGHT
  return [
    box(
      'bath-lining-back',
      [inner + t / 2, midY, midZ],
      [t, wallH, depth],
      'lining'
    ),
    box(
      'bath-lining-partition',
      [PARTITION - t / 2, midY, midZ],
      [t, wallH, depth],
      'lining'
    ),
    box(
      'bath-lining-side',
      [(inner + PARTITION) / 2, midY, sideZ - t / 2],
      [width, wallH, t],
      'lining'
    ),
    box(
      'bath-lining-wall',
      [(inner + BATH_DOOR_X0) / 2, midY, BATH_INSIDE + t / 2],
      [BATH_DOOR_X0 - inner, wallH, t],
      'lining'
    ),
    box(
      'bath-lining-lintel',
      [
        (BATH_DOOR_X0 + PARTITION) / 2,
        HEIGHT - lintelH / 2,
        BATH_INSIDE + t / 2,
      ],
      [PARTITION - BATH_DOOR_X0, lintelH, t],
      'lining'
    ),
    box(
      'bath-lining-ceiling',
      [(inner + PARTITION) / 2, HEIGHT - t / 2, midZ],
      [width, t, depth],
      'lining'
    ),
  ]
}

// Where the laptop sits on the card table, station-local: the middle of
// its base on the tabletop, facing -Z (yaw turns asset +Z that way).
function laptopSpot(): { x: number; y: number; z: number; yaw: number } {
  const sideZ = HALF_WIDTH - WALL
  const { x, size, height } = BATH.table
  return {
    x,
    y: FLOOR + height,
    z: sideZ - size / 2 - 0.02 + 0.06,
    yaw: Math.PI,
  }
}

// The back wall either side of the back door and the lintel over it, the
// door stood open against the wall outside, and the pad it opens onto.
function backWall(wallY: number, wallH: number): StoreBox[] {
  const x = BACK + WALL / 2
  const z0 = BACK_DOOR_OUT.z - BACK_DOOR_OUT.width / 2
  const z1 = BACK_DOOR_OUT.z + BACK_DOOR_OUT.width / 2
  const lintelH = HEIGHT - DOOR_HEIGHT
  const leaf = BACK_DOOR_OUT.width - 0.04
  return [
    box(
      'wall-back-corner',
      [x, wallY, (-HALF_WIDTH + z0) / 2],
      [WALL, wallH, z0 + HALF_WIDTH],
      'wall',
      true
    ),
    box(
      'wall-back',
      [x, wallY, (z1 + HALF_WIDTH) / 2],
      [WALL, wallH, HALF_WIDTH - z1],
      'wall',
      true
    ),
    box(
      'wall-back-lintel',
      [x, HEIGHT - lintelH / 2, BACK_DOOR_OUT.z],
      [WALL, lintelH, BACK_DOOR_OUT.width],
      'wall'
    ),
    // Hinged on the corner side, swung out flat against the wall.
    box(
      'back-door',
      [BACK - 0.03, FLOOR + (DOOR_HEIGHT - 0.02) / 2, z0 - leaf / 2],
      [0.05, DOOR_HEIGHT - 0.02, leaf],
      'backdoor',
      true
    ),
    box(
      'back-door-bar',
      [BACK - 0.08, FLOOR + 1.0, z0 - leaf / 2],
      [0.05, 0.05, leaf * 0.7],
      'steel'
    ),
    box(
      'back-pad',
      [BACK - PAD.depth / 2, (FLOOR - FOUNDATION) / 2, 0],
      [PAD.depth, FLOOR + FOUNDATION, HALF_WIDTH * 2],
      'pad'
    ),
  ]
}

function buildBoxes(): StoreBox[] {
  const depth = FRONT - BACK
  const midX = (FRONT + BACK) / 2
  const wallY = FLOOR + (HEIGHT - FLOOR) / 2
  const wallH = HEIGHT - FLOOR
  // The front wall either side of the door, and the lintel over it.
  const frontX = FRONT - WALL / 2
  const lintelH = HEIGHT - DOOR_HEIGHT
  // One side of the storefront, from the door jamb to the corner post:
  // the jamb, the post, and between them a sill, a header, the glass, and
  // a mullion. The jamb, post and glass block, and together cover the
  // side's whole footprint; the rest stand over the glass.
  const frontWall = (name: string, dir: 1 | -1): StoreBox[] => {
    const inner = DOOR_WIDTH / 2
    const outer = HALF_WIDTH
    const glass0 = inner + WINDOW.jamb
    const glass1 = outer - WINDOW.post
    const glassLen = glass1 - glass0
    const glassZ = dir * ((glass0 + glass1) / 2)
    const glassH = WINDOW.head - WINDOW.sill
    const sillH = WINDOW.sill - FLOOR
    const headH = HEIGHT - WINDOW.head
    const vertical = (
      part: string,
      z: number,
      len: number,
      blocks: boolean
    ): StoreBox =>
      box(
        `wall-front-${name}-${part}`,
        [frontX, wallY, z],
        [WALL, wallH, len],
        'wall',
        blocks
      )
    return [
      vertical('jamb', dir * (inner + WINDOW.jamb / 2), WINDOW.jamb, true),
      vertical('post', dir * (outer - WINDOW.post / 2), WINDOW.post, true),
      vertical('mullion', glassZ, WINDOW.mullion, false),
      box(
        `wall-front-${name}-sill`,
        [frontX, FLOOR + sillH / 2, glassZ],
        [WALL, sillH, glassLen],
        'wall'
      ),
      box(
        `wall-front-${name}-header`,
        [frontX, HEIGHT - headH / 2, glassZ],
        [WALL, headH, glassLen],
        'wall'
      ),
      box(
        `window-${name}`,
        [frontX, WINDOW.sill + glassH / 2, glassZ],
        [GLASS, glassH, glassLen],
        'glass',
        true
      ),
    ]
  }
  const boxes = [
    box(
      'foundation',
      [midX, -FOUNDATION / 2, 0],
      [depth, FOUNDATION, HALF_WIDTH * 2],
      'wall'
    ),
    box('floor', [midX, FLOOR / 2, 0], [depth, FLOOR, HALF_WIDTH * 2], 'floor'),
    box('roof', [midX, HEIGHT + 0.1, 0], [depth, 0.2, HALF_WIDTH * 2], 'roof'),
    ...backWall(wallY, wallH),
    // The partition between the shop and the back room, from the doorway
    // to the +Z wall, and the lintel over the doorway.
    box(
      'partition',
      [PARTITION + WALL / 2, wallY, (BACK_DOOR_Z1 + HALF_WIDTH - WALL) / 2],
      [WALL, wallH, HALF_WIDTH - WALL - BACK_DOOR_Z1],
      'wall',
      true
    ),
    box(
      'partition-lintel',
      [
        PARTITION + WALL / 2,
        HEIGHT - (HEIGHT - DOOR_HEIGHT) / 2,
        BACK_DOOR.z0 + BACK_DOOR.width / 2,
      ],
      [WALL, HEIGHT - DOOR_HEIGHT, BACK_DOOR.width],
      'wall'
    ),
    // The bank of lockers; locker doors are drawn over its face
    // (assets.ts buildLockerDoors).
    box(
      'lockers',
      [BACK + WALL + LOCKERS.depth / 2, FLOOR + LOCKERS.height / 2, 0],
      [LOCKERS.depth, LOCKERS.height, LOCKERS.count * LOCKERS.width],
      'locker',
      true
    ),
    ...bathroom(wallY, wallH),
    box(
      'wall-left',
      [midX, wallY, -HALF_WIDTH + WALL / 2],
      [depth, wallH, WALL],
      'wall',
      true
    ),
    box(
      'wall-right',
      [midX, wallY, HALF_WIDTH - WALL / 2],
      [depth, wallH, WALL],
      'wall',
      true
    ),
    ...frontWall('left', -1),
    ...frontWall('right', 1),
    box(
      'lintel',
      [frontX, HEIGHT - lintelH / 2, 0],
      [WALL, lintelH, DOOR_WIDTH],
      'wall'
    ),
    ...liquorShelf(),
    ...coolers(),
    box(
      'counter',
      [COUNTER.x, COUNTER.height / 2, (COUNTER.z0 + COUNTER.z1) / 2],
      [COUNTER.depth, COUNTER.height, COUNTER.z1 - COUNTER.z0],
      'counter',
      true
    ),
    // One board on the wall; the units stand on its top.
    box(
      'med-rack',
      [
        (MED_RACK.x0 + MED_RACK.x1) / 2,
        MED_RACK.height - SHELF_BOARD / 2,
        MED_RACK_Z,
      ],
      [MED_RACK.x1 - MED_RACK.x0, SHELF_BOARD, MED_RACK.depth],
      'shelf',
      true
    ),
  ]
  LIGHT.rows.forEach((x, r) => {
    LIGHT.along.forEach((z, a) => {
      boxes.push(
        box(
          `light-${r}-${a}`,
          [x, HEIGHT - LIGHT.size[1] / 2, z],
          LIGHT.size,
          'light'
        )
      )
    })
  })
  boxes.push(
    box(
      'light-back-room',
      [LIGHT.backRoom[0], HEIGHT - LIGHT.size[1] / 2, LIGHT.backRoom[1]],
      LIGHT.size,
      'light'
    )
  )
  return boxes
}

// The signs, each hung on a wall face. The front wall's inside face is at
// FRONT - WALL and the side walls' at ±(HALF_WIDTH - WALL); the back
// wall's outside face is at BACK and its inside face at BACK + WALL; the
// partition's back face is at PARTITION. A sign's centre sits half its
// depth off its face.
function buildSigns(): StoreSign[] {
  const frontX = FRONT - WALL - SIGN_DEPTH / 2
  const rearX = BACK - SIGN_DEPTH / 2
  const backX = BACK + WALL + SIGN_DEPTH / 2
  const partitionX = PARTITION - SIGN_DEPTH / 2
  const sideZ = HALF_WIDTH - WALL - SIGN_DEPTH / 2
  return [
    // The photo on the outside of the back wall, facing away from the
    // pumps.
    {
      name: 'sign-mind',
      art: { photo: '/textures/mind.jpg' },
      center: [rearX, 2.0, 0],
      size: [2.0, 1.79],
      yaw: -Math.PI / 2,
    },
    // The cigarette price board behind the counter, over the clerk's head.
    {
      name: 'sign-smokes',
      art: 'smokes',
      center: [frontX, 2.45, (COUNTER.z0 + COUNTER.z1) / 2],
      size: [1.4, 1.0],
      yaw: -Math.PI / 2,
    },
    // Over the door on the way out.
    {
      name: 'sign-thanks',
      art: 'thanks',
      center: [frontX, 2.85, 0],
      size: [1.2, 0.5],
      yaw: -Math.PI / 2,
    },
    // On the -Z wall.
    {
      name: 'sign-beer',
      art: 'beer',
      center: [-9.8, 2.0, -sideZ],
      size: [1.6, 1.0],
      yaw: 0,
    },
    // On the +Z wall, across from it.
    {
      name: 'sign-energy',
      art: 'energy',
      center: [-10.5, 2.0, sideZ],
      size: [1.6, 1.0],
      yaw: Math.PI,
    },
    // The back room. The flag over the lockers, on the back wall's inside
    // face.
    {
      name: 'sign-flag',
      art: 'flag',
      center: [backX, 2.6, 0],
      size: [1.52, 0.8],
      yaw: Math.PI / 2,
    },
    // Beside the lockers, on the same wall.
    {
      name: 'sign-lift',
      art: 'lift',
      center: [backX, 1.6, -2.85],
      size: [0.6, 0.8],
      yaw: Math.PI / 2,
    },
    // Over the back door, inside.
    {
      name: 'sign-exit',
      art: 'exit',
      center: [backX, 2.62, BACK_DOOR_OUT.z],
      size: [0.5, 0.2],
      yaw: Math.PI / 2,
    },
    // On the -Z wall, between the back wall and the doorway.
    {
      name: 'sign-accidents',
      art: 'accidents',
      center: [-16.3, 1.75, -sideZ],
      size: [0.9, 0.6],
      yaw: 0,
    },
    {
      name: 'sign-the-law',
      art: 'the-law',
      center: [-15.0, 1.6, -sideZ],
      size: [0.6, 0.8],
      yaw: 0,
    },
    // On the partition's back face, looking at the lockers.
    {
      name: 'sign-fire',
      art: 'fire',
      center: [partitionX, 1.6, -1.2],
      size: [0.6, 0.8],
      yaw: -Math.PI / 2,
    },
    // On the bathroom wall's outside face, beside its doorway.
    {
      name: 'sign-restroom',
      art: 'restroom',
      center: [
        BATH_DOOR_X0 - 0.4,
        1.6,
        BATH.z - BATH.wall / 2 - SIGN_DEPTH / 2,
      ],
      size: [0.3, 0.3],
      yaw: Math.PI,
    },
    // In the bathroom, over the sink's shoulder.
    {
      name: 'sign-wash-hands',
      art: 'wash-hands',
      center: [BATH.sink.x + 0.75, 1.55, sideZ - 0.01],
      size: [0.4, 0.3],
      yaw: Math.PI,
      dark: true,
    },
  ]
}

// Units of one kind sit this far apart along their run.
const UNIT_GAP = { counter: 0.12, medicine: 0.11 }

// `count` units centred on `at`, spread along local Z (or local X for the
// medicine rack, which runs along a side wall).
function row(at: Vec3, gap: number, axis: 'x' | 'z'): Vec3[] {
  const slots: Vec3[] = []
  const n = CONFIG.store.perItem
  for (let i = 0; i < n; i++) {
    const off = (i - (n - 1) / 2) * gap
    slots.push(
      axis === 'z' ? [at[0], at[1], at[2] + off] : [at[0] + off, at[1], at[2]]
    )
  }
  return slots
}

// The units of `kind` on a shelf whose front edge (at a cooler's glass) is
// `at`: in lanes across the shelf centred on it, as many as fit up to
// COOLER.lanes, then row after row going back. Unit 0 is at the front.
function inLanes(at: Vec3, kind: ItemId): Vec3[] {
  const n = unitsOf(kind)
  const lanes = Math.min(n, COOLER.lanes)
  const slots: Vec3[] = []
  for (let i = 0; i < n; i++) {
    const lane = i % lanes
    const rank = Math.floor(i / lanes)
    slots.push([
      at[0] - COOLER.row * (rank + 1),
      at[1],
      at[2] + (lane - (lanes - 1) / 2) * COOLER.lane,
    ])
  }
  return slots
}

function buildFacings(): Facing[] {
  const facings: Facing[] = []
  // In the coolers: drinks in ITEMS order, one to a door's shelf, top shelf
  // first and door by door, art facing out through the glass (+X). The
  // liquor is never chilled: it stands on its own shelf, a kind to a
  // board, top board first.
  const drinks = ITEMS.filter((item) => item.category === 'drink')
  const chilled = drinks.filter((item) => !isSpirit(item.id))
  chilled.forEach((item, i) => {
    const shelf = Math.floor(i / COOLER.doors)
    const door = i % COOLER.doors
    const z = COOLER_Z0 + COOLER_DOOR * (door + 0.5)
    const y = COOLER.shelves[shelf]
    if (y === undefined) throw new Error(`no cooler shelf for ${item.id}`)
    facings.push({
      kind: item.id,
      slots: inLanes([COOLER_FACE, y, z], item.id),
      yaw: Math.PI / 2,
    })
  })
  drinks
    .filter((item) => isSpirit(item.id))
    .forEach((item, i) => {
      const y = COOLER.shelves[i]
      if (y === undefined) throw new Error(`no liquor board for ${item.id}`)
      facings.push({
        kind: item.id,
        slots: inLanes([LIQUOR_FACE, y, LIQUOR_Z], item.id),
        yaw: Math.PI / 2,
      })
    })
  // The counter: cigarettes then joints, art toward the room side (-X),
  // where the customer stands.
  const smokes = ITEMS.filter(
    (item) => item.category === 'cigarette' || item.category === 'joint'
  )
  const counterPitch = (COUNTER.z1 - COUNTER.z0) / smokes.length
  smokes.forEach((item, i) => {
    const z = COUNTER.z0 + counterPitch * (i + 0.5)
    facings.push({
      kind: item.id,
      slots: row([COUNTER.x, COUNTER.height, z], UNIT_GAP.counter, 'z'),
      yaw: -Math.PI / 2,
    })
  })
  // The rack: medicine in ITEMS order from the back wall toward the door,
  // art facing across the room (-Z).
  const medicine = ITEMS.filter((item) => item.category === 'medicine')
  const rackPitch = (MED_RACK.x1 - MED_RACK.x0) / medicine.length
  medicine.forEach((item, i) => {
    const x = MED_RACK.x0 + rackPitch * (i + 0.5)
    facings.push({
      kind: item.id,
      slots: row([x, MED_RACK.height, MED_RACK_Z], UNIT_GAP.medicine, 'x'),
      yaw: Math.PI,
    })
  })
  return facings
}

// The canopy over the pump island, centred on it: `width` along local X,
// `depth` along Z, its slab `thickness` deep and centred at `height`.
// assets.ts draws it; the slurms (slurms.ts) drip off its edges.
export const CANOPY = { width: 9, thickness: 0.45, depth: 6.5, height: 4.6 }

export const STORE_LAYOUT = {
  back: BACK,
  partition: PARTITION,
  front: FRONT,
  halfWidth: HALF_WIDTH,
  height: HEIGHT,
  floor: FLOOR,
  doorWidth: DOOR_WIDTH,
  boxes: buildBoxes(),
  facings: buildFacings(),
  signs: buildSigns(),
  signDepth: SIGN_DEPTH,
  clerk: CLERK,
  lockers: {
    ...LOCKERS,
    // The bank's front face, station-local, and the z it is centred on.
    face: BACK + WALL + LOCKERS.depth,
    z: 0,
    floor: FLOOR,
  },
  // The pad out back, from the back wall out to `back`, and the dumpster
  // on it.
  pad: { back: BACK - PAD.depth },
  dumpster: DUMPSTER_SPOT,
  // The bathroom wall's centreline, and the doorway through it; the
  // laptop on its card table, and the room's inside (x0..x1 by z0..z1,
  // station-local), where only the screen gives light.
  bathroom: {
    z: BATH.z,
    door: [BATH_DOOR_X0, PARTITION] as const,
    laptop: laptopSpot(),
    inside: {
      x0: BACK + WALL,
      x1: PARTITION,
      z0: BATH_INSIDE,
      z1: HALF_WIDTH - WALL,
    },
  },
} as const

// Where E sits a raider down at the laptop at a station: its spot on the
// card table, in the world.
export function laptopAt(origin: StoreOrigin): XZ {
  const { x, z } = STORE_LAYOUT.bathroom.laptop
  const [wx, , wz] = toWorld(origin, [x, 0, z])
  return { x: wx, z: wz }
}

// Where E opens the lockers at a station: in front of the middle of the
// bank, in the world.
export function lockerSpot(origin: StoreOrigin): XZ {
  const { face, z } = STORE_LAYOUT.lockers
  const [x, , wz] = toWorld(origin, [face + 0.3, 0, z])
  return { x, z: wz }
}

// --- Space ---------------------------------------------------------------

// A station-local point in the world. Matches how world.ts places every
// station part: local +X along (cos, sin), local +Z along (-sin, cos).
export function toWorld(origin: StoreOrigin, [lx, ly, lz]: Vec3): Vec3 {
  const cos = Math.cos(origin.yaw)
  const sin = Math.sin(origin.yaw)
  return [
    origin.x + cos * lx - sin * lz,
    origin.y + ly,
    origin.z + sin * lx + cos * lz,
  ]
}

// The height a station's store stands on: the lot height at the pump
// island, or higher where the terrain under the footprint (the pad out
// back included) would poke through the floor. `terrain` is the raw heightfield. Sampled every metre
// or so, corners and edges included.
export function storeBase(
  station: XZ & { yaw: number },
  lotY: number,
  terrain: HeightAt
): number {
  const origin: StoreOrigin = { ...station, y: 0 }
  const back = BACK - PAD.depth
  const nx = Math.ceil(FRONT - back)
  const nz = Math.ceil(HALF_WIDTH * 2)
  let highest = -Infinity
  for (let i = 0; i <= nx; i++) {
    for (let j = 0; j <= nz; j++) {
      const lx = back + ((FRONT - back) * i) / nx
      const lz = -HALF_WIDTH + (HALF_WIDTH * 2 * j) / nz
      const [x, , z] = toWorld(origin, [lx, 0, lz])
      highest = Math.max(highest, terrain(x, z))
    }
  }
  return Math.max(lotY, highest + FLOOR_CLEARANCE - FLOOR)
}

// A world point in station-local space (x and z only).
export function toLocal(origin: StoreOrigin, x: number, z: number): XZ {
  const cos = Math.cos(origin.yaw)
  const sin = Math.sin(origin.yaw)
  const dx = x - origin.x
  const dz = z - origin.z
  return { x: dx * cos + dz * sin, z: -dx * sin + dz * cos }
}

// Whether a world point stands inside the building's walls (the back room
// included), or within `margin` metres of them.
export function insideStore(
  origin: StoreOrigin,
  x: number,
  z: number,
  margin = 0
): boolean {
  const p = toLocal(origin, x, z)
  return (
    p.x > BACK - margin &&
    p.x < FRONT + margin &&
    Math.abs(p.z) < HALF_WIDTH + margin
  )
}

// Whether a world point stands on the store or the pad out back, or within
// `margin` metres of them: what the trees keep off.
export function onStoreGrounds(
  origin: StoreOrigin,
  x: number,
  z: number,
  margin = 0
): boolean {
  const p = toLocal(origin, x, z)
  return (
    p.x > BACK - PAD.depth - margin &&
    p.x < FRONT + margin &&
    Math.abs(p.z) < HALF_WIDTH + margin
  )
}

// The building's middle in the world, for "which store is nearest".
export function storeCenter(origin: StoreOrigin): XZ {
  const [x, , z] = toWorld(origin, [(BACK + FRONT) / 2, 0, 0])
  return { x, z }
}

// A blocking box as a wall: the centreline along its long side, in the
// world, and half its thickness. walls.ts takes it from there.
export interface WallSegment {
  a: XZ
  b: XZ
  half: number
  // Under the eye and the hand (walls.ts): it stands between nothing.
  low?: boolean
}

// A fixture whose top is under this, in metres over the floor, is low: a
// counter the eye and the hand pass over.
export const LOW_FIXTURE = 1.3

// Whether a box is a low fixture.
export function isLow(b: { center: Vec3; size: Vec3 }): boolean {
  return b.center[1] + b.size[1] / 2 < LOW_FIXTURE
}

export function storeWalls(origin: StoreOrigin): WallSegment[] {
  const walls: WallSegment[] = []
  for (const b of STORE_LAYOUT.boxes) {
    if (!b.blocks) continue
    const [cx, , cz] = b.center
    const [sx, , sz] = b.size
    const alongX = sx >= sz
    const half = (alongX ? sz : sx) / 2
    // The capsule's round ends reach `half` past the segment, so pull the
    // ends in by that much and the capsule covers the box exactly.
    const reach = Math.max(0, (alongX ? sx : sz) / 2 - half)
    const a: Vec3 = alongX ? [cx - reach, 0, cz] : [cx, 0, cz - reach]
    const e: Vec3 = alongX ? [cx + reach, 0, cz] : [cx, 0, cz + reach]
    const [ax, , az] = toWorld(origin, a)
    const [ex, , ez] = toWorld(origin, e)
    const wall: WallSegment = { a: { x: ax, z: az }, b: { x: ex, z: ez }, half }
    if (isLow(b)) wall.low = true
    walls.push(wall)
  }
  // The dumpster on the pad out back, its length along the wall.
  {
    const { x, z } = DUMPSTER_SPOT
    const half = DUMPSTER_SIZE.width / 2
    const reach = DUMPSTER_SIZE.length / 2 - half
    const [ax, , az] = toWorld(origin, [x, 0, z - reach])
    const [bx, , bz] = toWorld(origin, [x, 0, z + reach])
    walls.push({ a: { x: ax, z: az }, b: { x: bx, z: bz }, half })
  }
  // The clerk: a zero-length wall is a disc.
  const [cx, , cz] = toWorld(origin, [CLERK.x, 0, CLERK.z])
  walls.push({ a: { x: cx, z: cz }, b: { x: cx, z: cz }, half: CLERK.radius })
  return walls
}

// Every facing at one station, in the world, each unit aimed at by its
// own slot.
export function worldFacings(origin: StoreOrigin): WorldFacing[] {
  return STORE_LAYOUT.facings.map((facing) => ({
    kind: facing.kind,
    units: facing.slots.map((slot) => toWorld(origin, slot)),
  }))
}

// --- Shopping ------------------------------------------------------------

// How many units of `kind` each Citgo stocks when the day turns.
export function unitsOf(kind: string): number {
  return CONFIG.store.stock[kind] ?? CONFIG.store.perItem
}

// Full shelves at every station, for a new day.
export function freshStock(stationCount: number): ShopStock[] {
  return Array.from({ length: stationCount }, () => {
    const full: ShopStock = {}
    for (const facing of STORE_LAYOUT.facings) {
      full[facing.kind] = facing.slots.map(() => true)
    }
    return full
  })
}

// Whether unit `unit` of `kind` is still on the shelf.
export function onShelf(
  shelf: ShopStock | undefined,
  kind: string,
  unit: number
): boolean {
  return shelf?.[kind]?.[unit] === true
}

// A shelf with one unit gone, as a new value.
export function takeUnit(
  shelf: ShopStock,
  kind: string,
  unit: number
): ShopStock {
  return { ...shelf, [kind]: shelf[kind].map((on, i) => on && i !== unit) }
}

// The unit the player is looking at: still on the shelf, within reach of
// the eye, inside the aim cone, and the closest to the view ray among
// those. Units sit a hand's width apart, so the one under the crosshair
// wins. `dir` is the unit look direction, pitch included, so looking at a
// board picks it. A unit with a wall between it and the eye (`walled`,
// walls.ts between: the partition, from the back room) is never in view.
// Null when nothing qualifies.
export function unitInView<F extends WorldFacing>(
  facings: readonly F[],
  stock: ShopStock,
  eye: Vec3,
  dir: Vec3,
  walled?: (from: XZ, to: XZ) => boolean
): UnitInView<F> | null {
  const { reach, aimCone } = CONFIG.store
  let best: UnitInView<F> | null = null
  let bestAngle = aimCone
  for (const facing of facings) {
    for (const [unit, at] of facing.units.entries()) {
      if (!onShelf(stock, facing.kind, unit)) continue
      const dx = at[0] - eye[0]
      const dy = at[1] - eye[1]
      const dz = at[2] - eye[2]
      const d = Math.hypot(dx, dy, dz)
      if (d > reach || d < 1e-6) continue
      const cos = (dx * dir[0] + dy * dir[1] + dz * dir[2]) / d
      const angle = Math.acos(Math.max(-1, Math.min(1, cos)))
      if (
        angle <= bestAngle &&
        !walled?.({ x: eye[0], z: eye[2] }, { x: at[0], z: at[2] })
      ) {
        bestAngle = angle
        best = { facing, unit }
      }
    }
  }
  return best
}

// Cents as dollars: 549 -> "$5.49".
export function formatCash(cents: number): string {
  const whole = Math.max(0, Math.round(cents))
  return `$${Math.floor(whole / 100)}.${String(whole % 100).padStart(2, '0')}`
}
