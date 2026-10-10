// Pure: Bull Valley Plaza, the dead strip mall beside the spawn Citgo. One
// layout in mall-local space (x toward the road, the front wall's outside
// face at x = 0; z along the road, centred on the middle of the row; y up
// from the floor deck), placed by world.ts at CONFIG.stripMall.at in the
// spawn station's frame. Like store.ts it says every box once, so what is
// drawn (assets.ts buildStripMall), what blocks (mallWalls) and what is
// stood on (world.ts registers the deck) can never drift apart. Scenery
// only: nothing here is the valley's to keep. No three.js, no DOM.

import { CONFIG } from './config.ts'
import { mulberry32, range } from './rng.ts'
import { toLocal, toWorld } from './store.ts'
import type { Vec3, XZ } from './interfaces.ts'
import type { PickupKind } from './items.ts'
import type { LockId } from './keys.ts'
import type { StoreOrigin, WallSegment } from './store.ts'

// What a box is drawn in; assets.ts maps each to a material.
export type MallFinish =
  | 'block' // painted cinderblock, the shell and the partitions
  | 'brick' // the storefront piers
  | 'floor' // the tile, gone grey
  | 'concrete' // the walk out front and the foundation
  | 'ceiling' // the roof's underside and the canopy's
  | 'fascia' // the sign band over the walk
  | 'glass'
  | 'plywood'
  | 'steel' // doors, posts, dryers, the range
  | 'fixture' // racks and counters
  | 'enamel' // washers, dryer hoods
  | 'laminate' // tables and the salon counter
  | 'tile' // fallen ceiling tiles and drywall
  | 'tape' // VHS cassettes
  | 'plastic' // the laundromat's chairs
  | 'vending' // the dead soda machine
  | 'mirror'
  | 'mattress'
  | 'blanket'
  | 'candle'
  | 'flame'
  | 'tube' // the one fluorescent tube still lit, flickering
  | 'dead-tube'
  | 'cardboard'
  | 'xxx' // the adult section's tape boxes
  | 'beads' // its curtain
  | 'redlight' // its bulb

// One box, centred at `center` with full `size`, in mall-local space.
// `turn` (an Euler XYZ) tips the box for things fallen or swung open; a
// box that `blocks` never turns, so the walls stay square to it.
export interface MallBox {
  name: string
  center: Vec3
  size: Vec3
  finish: MallFinish
  blocks: boolean
  turn?: Vec3
}

// The painted panels: the shop signs on the fascia, the boards and the
// graffiti inside. mallart.ts paints each by id.
export type MallArtId =
  | 'video-vault'
  | 'suds'
  | 'golden-wok'
  | 'curl-up'
  | 'rewind'
  | 'employees'
  | 'adults-only'
  | 'pinup-a'
  | 'pinup-b'
  | 'pinup-c'
  | 'menu'
  | 'for-lease'
  | 'graffiti-eye'
  | 'graffiti-tag'
  | 'chalk'

// One painted panel: `size` wide and tall, centred at `center` a hair off
// its face, turned by `turn` (an Euler XYZ) so its art (asset +Z) faces
// out. Decoration only.
export interface MallSign {
  name: string
  art: MallArtId
  center: Vec3
  size: [number, number]
  turn: Vec3
}

// What lies round the building, in mall-local space, each stood on
// ground.at by world.ts: the dumpsters in the alley, the carts, the pylon
// sign at the road, and the parking stripes.
export interface MallProp extends XZ {
  yaw: number
  // Tipped onto its side.
  fallen?: boolean
}

// --- The layout ----------------------------------------------------------

// The building: the front wall's outside face at x = 0, the back wall's at
// -DEPTH; four shops UNIT wide side by side along z.
const DEPTH = 14
const UNITS = 4
const UNIT = 9
const LENGTH = UNITS * UNIT
const HALF = LENGTH / 2
const HEIGHT = 4.0
const WALL = 0.25
const ROOF = 0.3
// The covered walk along the front: the deck runs out this far past the
// front wall, under a canopy on posts with the sign band at its edge.
const WALK = 3
const CANOPY_Y = 3.2
const CANOPY = 0.15
const FASCIA = { depth: 0.3, drop: 0.2, rise: 1.1 }
const POST = 0.2
// The slab under the floor and the walk, deep enough that a slope never
// shows daylight under it, and how far the deck stands over the highest
// ground under it and over the lot at the curb.
const FOUNDATION = 2.5
const CLEARANCE = 0.08
const CURB = 0.15
// One storefront, from its -z end: a pier, a window, a jamb, the door, a
// jamb, a window, a pier. Nine metres in all.
const FRONT = {
  pier: 0.5,
  windowA: 3.0,
  jamb: 0.3,
  door: 1.8,
  windowB: 2.6,
}
const SILL = 0.7
const HEAD = 2.7
const DOOR_H = 2.3
const GLASS = 0.04
const LEAF = 0.06
// The back door of each shop, from the unit's -z end, onto the alley.
const BACK_DOOR = { at: 6.5, width: 1.0, height: 2.2 }
// The ragged hole knocked through the wall between the laundromat and the
// Golden Wok, from the front wall back: x from `x0` to `x1`, `height` tall.
const HOLE = { x0: -4.4, x1: -3.0, height: 1.9 }
// The asphalt round the building, mall-local: the lot out front runs from
// LOT_FRONT to the road and from the -z drive to LOT_REACH (the spawn
// Citgo's own lot); the drives at either end and the alley behind are this
// wide.
const ALLEY = 8
const END = 6
const LOT_FRONT = 1.5
const LOT_REACH = 40

// The back room behind the Video Vault: the wall across the shop at
// `wall` (its shop-side face at wall + WALL), and the locked door in it,
// `door` from the unit's -z end, `width` wide. The racks stand clear of it.
// `split` is the wall between the office (the -z side, behind the locked
// door) and the adult section (the +z side, its doorway at ADULT.curtain).
const BACK_ROOM = {
  wall: -10.5,
  door: 2.4,
  width: 1.0,
  height: 2.2,
  split: 4.6,
}
const ADULT = { curtain: 5.8, width: 1.2 }
const RACKS = { x0: -9.5, x1: -4.5 }

export type Window = 'glass' | 'broken' | 'boarded'
export type Door = 'swung' | 'gone' | 'boarded' | 'ajar'

// The four shops, -z first (the far end from the Citgo).
export interface Unit {
  id: 'video' | 'laundromat' | 'wok' | 'salon'
  windows: [Window, Window]
  door: Door
  // Whether the back door onto the alley stands open.
  backOpen: boolean
  sign: MallArtId
}

export const UNIT_LIST: readonly Unit[] = [
  {
    id: 'video',
    windows: ['broken', 'glass'],
    door: 'swung',
    backOpen: false,
    sign: 'video-vault',
  },
  {
    id: 'laundromat',
    windows: ['glass', 'broken'],
    door: 'gone',
    backOpen: false,
    sign: 'suds',
  },
  // Boarded up out front: the way in is the alley, or the hole from the
  // laundromat.
  {
    id: 'wok',
    windows: ['boarded', 'boarded'],
    door: 'boarded',
    backOpen: true,
    sign: 'golden-wok',
  },
  {
    id: 'salon',
    windows: ['broken', 'boarded'],
    door: 'ajar',
    backOpen: false,
    sign: 'curl-up',
  },
]

function box(
  name: string,
  center: Vec3,
  size: Vec3,
  finish: MallFinish,
  blocks = false,
  turn?: Vec3
): MallBox {
  return turn
    ? { name, center, size, finish, blocks, turn }
    : { name, center, size, finish, blocks }
}

// A box from its x and z extents, standing from y0 to y1.
function span(
  name: string,
  [x0, x1]: [number, number],
  [y0, y1]: [number, number],
  [z0, z1]: [number, number],
  finish: MallFinish,
  blocks = false
): MallBox {
  return box(
    name,
    [(x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2],
    [x1 - x0, y1 - y0, z1 - z0],
    finish,
    blocks
  )
}

// Where unit `u` starts along z.
const unitZ = (u: number) => -HALF + u * UNIT

// The inside of the shell.
const IN_BACK = -DEPTH + WALL
const IN_FRONT = -WALL

// The shell: the slab, the roof, the back and end walls, the walk, its
// canopy and posts, and the sign band.
function shell(): MallBox[] {
  const boxes: MallBox[] = [
    span(
      'foundation',
      [-DEPTH, WALK],
      [-FOUNDATION, 0],
      [-HALF, HALF],
      'concrete'
    ),
    span(
      'roof',
      [-DEPTH, 0],
      [HEIGHT, HEIGHT + ROOF],
      [-HALF, HALF],
      'ceiling'
    ),
    // A low parapet round the back and ends of the roof.
    span(
      'parapet-back',
      [-DEPTH, -DEPTH + WALL],
      [HEIGHT + ROOF, HEIGHT + ROOF + 0.5],
      [-HALF, HALF],
      'block'
    ),
    span(
      'wall-end-a',
      [-DEPTH, 0],
      [0, HEIGHT],
      [-HALF, -HALF + WALL],
      'block',
      true
    ),
    span(
      'wall-end-b',
      [-DEPTH, 0],
      [0, HEIGHT],
      [HALF - WALL, HALF],
      'block',
      true
    ),
    span(
      'canopy',
      [0, WALK],
      [CANOPY_Y, CANOPY_Y + CANOPY],
      [-HALF, HALF],
      'ceiling'
    ),
    span(
      'fascia',
      [WALK - FASCIA.depth, WALK],
      [CANOPY_Y - FASCIA.drop, CANOPY_Y + FASCIA.rise],
      [-HALF - 0.1, HALF + 0.1],
      'fascia'
    ),
  ]
  // The posts under the canopy's edge, one at each end and one at every
  // wall between shops, clear of the doors.
  for (let u = 0; u <= UNITS; u++) {
    const z = Math.max(-HALF + POST, Math.min(HALF - POST, unitZ(u)))
    boxes.push(
      box(
        `post-${u}`,
        [WALK - FASCIA.depth - POST / 2, CANOPY_Y / 2, z],
        [POST, CANOPY_Y, POST],
        'steel',
        true
      )
    )
  }
  // One panel of the canopy's soffit, come down at one end and hanging.
  boxes.push(
    box(
      'soffit-hanging',
      [1.6, CANOPY_Y - 0.55, 2.2],
      [1.2, 0.03, 1.2],
      'tile',
      false,
      [0.9, 0, 0.2]
    )
  )
  // The back wall, broken only where a back door stands open.
  const x: [number, number] = [-DEPTH, -DEPTH + WALL]
  let from = -HALF
  UNIT_LIST.forEach((unit, u) => {
    const z0 = unitZ(u) + BACK_DOOR.at
    const z1 = z0 + BACK_DOOR.width
    // Every back door, open or shut: a steel leaf on the alley side, and
    // the dead lamp over it.
    boxes.push(
      span(
        `back-lamp-${u}`,
        [-DEPTH - 0.2, -DEPTH],
        [BACK_DOOR.height + 0.3, BACK_DOOR.height + 0.5],
        [z0 + 0.3, z1 - 0.3],
        'dead-tube'
      )
    )
    if (!unit.backOpen) {
      boxes.push(
        span(
          `back-door-${u}`,
          [-DEPTH - LEAF, -DEPTH],
          [0, BACK_DOOR.height],
          [z0, z1],
          'steel'
        )
      )
      return
    }
    boxes.push(
      span(`wall-back-${u}`, x, [0, HEIGHT], [from, z0], 'block', true),
      span(
        `back-lintel-${u}`,
        x,
        [BACK_DOOR.height, HEIGHT],
        [z0, z1],
        'block'
      ),
      // The leaf swung out flat against the wall, toward the far end.
      box(
        `back-door-${u}`,
        [-DEPTH - 0.2, BACK_DOOR.height / 2, z0 - 0.5],
        [BACK_DOOR.width, BACK_DOOR.height, LEAF],
        'steel',
        false,
        [0, -1.25, 0]
      )
    )
    from = z1
  })
  boxes.push(span('wall-back-end', x, [0, HEIGHT], [from, HALF], 'block', true))
  return boxes
}

// One storefront: the piers and jambs, the windows, and the door.
function storefront(unit: Unit, u: number): MallBox[] {
  const z = unitZ(u)
  const x: [number, number] = [-WALL, 0]
  const name = (part: string) => `front-${unit.id}-${part}`
  const boxes: MallBox[] = []
  const pier = (part: string, z0: number, z1: number) =>
    boxes.push(span(name(part), x, [0, HEIGHT], [z0, z1], 'brick', true))
  const window = (part: string, z0: number, z1: number, kind: Window) => {
    // The sill always blocks: broken or not, the way in is the door.
    boxes.push(
      span(name(`${part}-sill`), x, [0, SILL], [z0, z1], 'brick', true),
      span(name(`${part}-header`), x, [HEAD, HEIGHT], [z0, z1], 'brick')
    )
    const mid = (z0 + z1) / 2
    const len = z1 - z0
    if (kind === 'glass') {
      boxes.push(
        span(
          name(`${part}-glass`),
          [-WALL / 2 - GLASS / 2, -WALL / 2 + GLASS / 2],
          [SILL, HEAD],
          [z0, z1],
          'glass'
        )
      )
    } else if (kind === 'broken') {
      // A jagged tooth left in the sill, one hanging from the head, and
      // the rest of it on the floor inside.
      boxes.push(
        box(
          name(`${part}-shard-low`),
          [-WALL / 2, SILL + 0.22, z0 + len * 0.22],
          [GLASS, 0.5, len * 0.4],
          'glass',
          false,
          [0.35, 0, 0]
        ),
        box(
          name(`${part}-shard-high`),
          [-WALL / 2, HEAD - 0.25, z1 - len * 0.18],
          [GLASS, 0.6, len * 0.3],
          'glass',
          false,
          [-0.5, 0, 0]
        )
      )
      for (let i = 0; i < 4; i++) {
        boxes.push(
          box(
            name(`${part}-glass-floor-${i}`),
            [-0.8 - i * 0.35, 0.01, mid + (i - 1.5) * 0.5],
            [0.3, 0.01, 0.22],
            'glass',
            false,
            [0, i * 0.9, 0]
          )
        )
      }
    } else {
      boxes.push(
        span(
          name(`${part}-board`),
          [0, 0.03],
          [SILL - 0.1, HEAD + 0.1],
          [z0 - 0.05, z1 + 0.05],
          'plywood'
        )
      )
    }
  }
  let at = z
  pier('pier-a', at, at + FRONT.pier)
  at += FRONT.pier
  window('window-a', at, at + FRONT.windowA, unit.windows[0])
  at += FRONT.windowA
  pier('jamb-a', at, at + FRONT.jamb)
  at += FRONT.jamb
  const d0 = at
  const d1 = at + FRONT.door
  boxes.push(span(name('transom'), x, [DOOR_H, HEIGHT], [d0, d1], 'brick'))
  const leaf = FRONT.door / 2
  if (unit.door === 'swung') {
    // One leaf swung out onto the walk and left there; the other gone.
    boxes.push(
      box(
        name('leaf'),
        [0.45, DOOR_H / 2, d0 + 0.08],
        [leaf, DOOR_H, LEAF],
        'steel',
        false,
        [0, -0.25, 0]
      )
    )
  } else if (unit.door === 'boarded') {
    boxes.push(
      span(
        name('door-board'),
        [0, 0.04],
        [0, DOOR_H + 0.1],
        [d0 - 0.05, d1 + 0.05],
        'plywood',
        true
      )
    )
  } else if (unit.door === 'ajar') {
    // One leaf still shut, the other hung open on one hinge.
    boxes.push(
      span(
        name('leaf-shut'),
        [-WALL / 2 - LEAF / 2, -WALL / 2 + LEAF / 2],
        [0, DOOR_H],
        [d1 - leaf, d1],
        'steel',
        true
      ),
      box(
        name('leaf-ajar'),
        [-WALL - 0.43, DOOR_H / 2 - 0.05, d0 + 0.15],
        [leaf, DOOR_H, LEAF],
        'steel',
        false,
        [0, 0.3, 0.04]
      )
    )
  }
  at = d1
  pier('jamb-b', at, at + FRONT.jamb)
  at += FRONT.jamb
  window('window-b', at, at + FRONT.windowB, unit.windows[1])
  at += FRONT.windowB
  pier('pier-b', at, z + UNIT)
  return boxes
}

// The walls between shops, the one by the Golden Wok broken through.
function partitions(): MallBox[] {
  const boxes: MallBox[] = []
  for (let u = 1; u < UNITS; u++) {
    const z: [number, number] = [unitZ(u) - WALL / 2, unitZ(u) + WALL / 2]
    if (UNIT_LIST[u].id !== 'wok') {
      boxes.push(
        span(
          `partition-${u}`,
          [IN_BACK, IN_FRONT],
          [0, HEIGHT],
          z,
          'block',
          true
        )
      )
      continue
    }
    boxes.push(
      span(
        `partition-${u}-back`,
        [IN_BACK, HOLE.x0],
        [0, HEIGHT],
        z,
        'block',
        true
      ),
      span(
        `partition-${u}-front`,
        [HOLE.x1, IN_FRONT],
        [0, HEIGHT],
        z,
        'block',
        true
      ),
      span(
        `partition-${u}-over`,
        [HOLE.x0, HOLE.x1],
        [HOLE.height, HEIGHT],
        z,
        'block'
      )
    )
    // What came out of the wall, on both sides of it.
    for (let i = 0; i < 6; i++) {
      const side = i % 2 === 0 ? -1 : 1
      boxes.push(
        box(
          `partition-${u}-rubble-${i}`,
          [HOLE.x0 + 0.2 + i * 0.22, 0.04, unitZ(u) + side * (0.5 + i * 0.12)],
          [0.5, 0.06, 0.4],
          'tile',
          false,
          [0.15 * side, i * 0.7, 0.1]
        )
      )
    }
  }
  return boxes
}

// The floor and the ceiling of every shop: the tile, the dead troffers
// (one still lit in the laundromat, flickering), and the drop ceiling come
// down in places.
function ceilings(): MallBox[] {
  const boxes: MallBox[] = [
    span('floor', [IN_BACK, IN_FRONT], [-0.02, 0], [-HALF, HALF], 'floor'),
  ]
  UNIT_LIST.forEach((unit, u) => {
    const zc = unitZ(u) + UNIT / 2
    for (const [r, x] of [-10.5, -4].entries()) {
      for (const [a, dz] of [-2, 2].entries()) {
        const lit = unit.id === 'laundromat' && r === 1 && a === 0
        // One troffer in each shop hangs down by one end.
        const hanging = r === 0 && a === u % 2
        boxes.push(
          box(
            `troffer-${unit.id}-${r}-${a}`,
            hanging ? [x, HEIGHT - 0.65, zc + dz] : [x, HEIGHT - 0.04, zc + dz],
            [0.3, 0.06, 2.2],
            lit ? 'tube' : 'dead-tube',
            false,
            hanging ? [0.55, 0, 0] : undefined
          )
        )
      }
    }
    // Ceiling tiles on the floor, and one still hanging by a corner.
    const rng = mulberry32(0x7113 + u)
    for (let i = 0; i < 5; i++) {
      boxes.push(
        box(
          `fallen-tile-${unit.id}-${i}`,
          [
            range(rng, -12.5, -1.5),
            0.02 + i * 0.01,
            range(rng, zc - 3.5, zc + 3.5),
          ],
          [0.6, 0.015, 1.2],
          'tile',
          false,
          [range(rng, -0.08, 0.08), range(rng, 0, Math.PI), 0]
        )
      )
    }
    boxes.push(
      box(
        `hanging-tile-${unit.id}`,
        [-7, HEIGHT - 0.6, zc - 1],
        [0.6, 0.015, 1.2],
        'tile',
        false,
        [1.1, 0.3, 0]
      )
    )
  })
  return boxes
}

// The Video Vault's back of house, behind the wall across the shop: the
// office on the -z side, behind the locked door (a gate, keys.ts, drawn
// on its own by assets.ts), with the safe stood open and empty but for
// what the day leaves in it, the manager's desk and its set, and a shelf
// of boxed tapes; and on the +z side, through a beaded curtain, the adult
// section: racks of tapes in their loud boxes, a red bulb, and the
// posters. A wall between the two.
function backRoom(video: number): MallBox[] {
  const x: [number, number] = [BACK_ROOM.wall, BACK_ROOM.wall + WALL]
  const d0 = video + BACK_ROOM.door
  const d1 = d0 + BACK_ROOM.width
  const c0 = video + ADULT.curtain
  const c1 = c0 + ADULT.width
  const split = video + BACK_ROOM.split
  const boxes: MallBox[] = [
    span(
      'back-room-wall-a',
      x,
      [0, HEIGHT],
      [video + WALL / 2, d0],
      'block',
      true
    ),
    span('back-room-lintel', x, [BACK_ROOM.height, HEIGHT], [d0, d1], 'block'),
    span('back-room-wall-b', x, [0, HEIGHT], [d1, c0], 'block', true),
    span('adult-lintel', x, [BACK_ROOM.height, HEIGHT], [c0, c1], 'block'),
    span(
      'back-room-wall-c',
      x,
      [0, HEIGHT],
      [c1, video + UNIT - WALL / 2],
      'block',
      true
    ),
    span(
      'back-room-divider',
      [IN_BACK, BACK_ROOM.wall],
      [0, HEIGHT],
      [split - WALL / 2, split + WALL / 2],
      'block',
      true
    ),
    // The office.
    span(
      'back-room-shelf',
      [IN_BACK + 0.3, BACK_ROOM.wall - 0.6],
      [0, 1.9],
      [video + WALL / 2, video + WALL / 2 + 0.4],
      'fixture',
      true
    ),
    span(
      'back-room-safe',
      [IN_BACK, IN_BACK + 0.7],
      [0, 0.9],
      [video + 1.0, video + 1.7],
      'steel',
      true
    ),
    box(
      'back-room-safe-door',
      [IN_BACK + 0.95, 0.45, video + 1.85],
      [0.06, 0.8, 0.6],
      'steel',
      false,
      [0, -1.0, 0]
    ),
    span(
      'back-room-desk',
      [IN_BACK, IN_BACK + 0.8],
      [0, 0.75],
      [video + 2.5, video + 4.1],
      'laminate',
      true
    ),
    box(
      'back-room-set',
      [IN_BACK + 0.35, 0.95, video + 3.1],
      [0.4, 0.4, 0.45],
      'tape'
    ),
    box(
      'back-room-chair',
      [IN_BACK + 1.3, 0.25, video + 3.5],
      [0.5, 0.5, 0.5],
      'blanket',
      false,
      [0, 0.4, 0]
    ),
    // The adult section: racks against the back wall and the laundromat's,
    // under one red bulb on its cord.
    span(
      'adult-rack-back',
      [IN_BACK, IN_BACK + 0.5],
      [0, 1.9],
      [split + 0.5, video + UNIT - 0.6],
      'fixture',
      true
    ),
    span(
      'adult-rack-side',
      [IN_BACK + 0.9, BACK_ROOM.wall - 0.4],
      [0, 1.6],
      [video + UNIT - WALL / 2 - 0.45, video + UNIT - WALL / 2],
      'fixture',
      true
    ),
    box(
      'adult-cord',
      [
        (IN_BACK + BACK_ROOM.wall) / 2,
        HEIGHT - 0.35,
        (split + video + UNIT) / 2,
      ],
      [0.01, 0.7, 0.01],
      'tape'
    ),
    box(
      'adult-bulb',
      [
        (IN_BACK + BACK_ROOM.wall) / 2,
        HEIGHT - 0.75,
        (split + video + UNIT) / 2,
      ],
      [0.12, 0.14, 0.12],
      'redlight'
    ),
  ]
  // The boxes on the racks, face out, a few tumbled to the floor.
  const loud = mulberry32(0xadd)
  for (let shelf = 0; shelf < 3; shelf++) {
    for (let i = 0; i < 14; i++) {
      const z = split + 0.7 + i * 0.25
      if (z > video + UNIT - 0.8) break
      boxes.push(
        box(
          `adult-tape-back-${shelf}-${i}`,
          [IN_BACK + 0.52, 0.5 + shelf * 0.55, z],
          [0.03, 0.19, 0.105],
          'xxx'
        )
      )
    }
    for (let i = 0; i < 8; i++) {
      boxes.push(
        box(
          `adult-tape-side-${shelf}-${i}`,
          [
            IN_BACK + 1.1 + i * 0.25,
            0.45 + shelf * 0.5,
            video + UNIT - WALL / 2 - 0.47,
          ],
          [0.105, 0.19, 0.03],
          'xxx'
        )
      )
    }
  }
  for (let i = 0; i < 7; i++) {
    boxes.push(
      box(
        `adult-tape-floor-${i}`,
        [
          range(loud, IN_BACK + 0.8, BACK_ROOM.wall - 0.4),
          0.015,
          range(loud, split + 0.5, video + UNIT - 1),
        ],
        [0.19, 0.025, 0.105],
        'xxx',
        false,
        [0, range(loud, 0, Math.PI), 0]
      )
    )
  }
  // The beaded curtain across its doorway, strand by strand.
  const strands = Math.floor(ADULT.width / 0.08)
  for (let i = 0; i < strands; i++) {
    const z = c0 + 0.04 + i * 0.08
    const sway = Math.sin(i * 1.7) * 0.05
    boxes.push(
      box(
        `adult-beads-${i}`,
        [BACK_ROOM.wall + WALL / 2, BACK_ROOM.height / 2 + 0.05, z],
        [0.012, BACK_ROOM.height - 0.1, 0.012],
        'beads',
        false,
        [sway, 0, 0]
      )
    )
  }
  return boxes
}

// What each shop left behind.
function contents(): MallBox[] {
  const boxes: MallBox[] = []
  const [video, laundromat, wok, salon] = [0, 1, 2, 3].map(unitZ)

  // Video Vault: the counter by the door, racks run front to back with one
  // pushed over, and the tapes all over the floor. The aisle between the
  // first rack and the fallen one leads back to the locked door; behind it,
  // the back room (BACK_ROOM): the safe, the desk, the shelf of tapes no
  // one was meant to rent.
  boxes.push(
    span(
      'video-counter',
      [-3.3, -2.7],
      [0, 1.0],
      [video + 0.6, video + 2.6],
      'fixture',
      true
    ),
    span(
      'video-rack-a',
      [RACKS.x0, RACKS.x1],
      [0, 1.8],
      [video + 1.0, video + 1.6],
      'fixture',
      true
    ),
    span(
      'video-rack-c',
      [RACKS.x0, RACKS.x1],
      [0, 1.8],
      [video + 7.4, video + 8.0],
      'fixture',
      true
    ),
    // The middle rack, flat on its back across the aisle.
    span(
      'video-rack-fallen',
      [RACKS.x0, RACKS.x1],
      [0, 0.6],
      [video + 4.4, video + 6.2],
      'fixture',
      true
    ),
    box(
      'video-standee',
      [-1.2, 0.9, video + 1.2],
      [0.05, 1.8, 0.8],
      'cardboard',
      false,
      [0, 0.5, -0.12]
    ),
    ...backRoom(video)
  )
  const tapes = mulberry32(0x7a9e)
  for (let i = 0; i < 36; i++) {
    boxes.push(
      box(
        `video-tape-${i}`,
        [
          range(tapes, BACK_ROOM.wall + 0.6, -1.5),
          0.015 + (i % 3) * 0.03,
          range(tapes, video + 0.5, video + 8.5),
        ],
        [0.19, 0.025, 0.105],
        'tape',
        false,
        [0, range(tapes, 0, Math.PI * 2), 0]
      )
    )
  }

  // Suds 'n' Duds: washers down one wall with their lids up, dryers along
  // the back, the folding table, the chairs by the window, and the soda
  // machine, dark.
  const washerZ: [number, number] = [
    laundromat + WALL / 2,
    laundromat + WALL / 2 + 0.75,
  ]
  boxes.push(
    span('washers', [-12, -3], [0, 0.95], washerZ, 'enamel', true),
    span(
      'dryers',
      [IN_BACK, IN_BACK + 0.8],
      [0, 1.9],
      [laundromat + 1.5, laundromat + 7.5],
      'steel',
      true
    ),
    span(
      'folding-table',
      [-8.5, -5.5],
      [0, 0.9],
      [laundromat + 5.0, laundromat + 6.0],
      'laminate',
      true
    ),
    span(
      'soda-machine',
      [-1.4, -0.5],
      [0, 1.9],
      [laundromat + 7.6, laundromat + 8.6],
      'vending',
      true
    )
  )
  for (let i = 0; i < 12; i++) {
    const x = -11.6 + i * 0.75
    // The portholes on the washers' faces, one hanging open.
    boxes.push(
      box(
        `washer-port-${i}`,
        i === 7
          ? [x + 0.2, 0.5, washerZ[1] + 0.22]
          : [x, 0.5, washerZ[1] + 0.02],
        [0.42, 0.42, 0.03],
        'tape',
        false,
        i === 7 ? [0, -1.1, 0] : undefined
      )
    )
  }
  for (let i = 0; i < 8; i++) {
    const row = i % 2
    const z = laundromat + 1.9 + Math.floor(i / 2) * 1.5
    boxes.push(
      box(
        `dryer-port-${i}`,
        [IN_BACK + 0.82, 0.5 + row * 0.95, z],
        [0.03, 0.5, 0.5],
        'tape'
      )
    )
  }
  for (let i = 0; i < 4; i++) {
    boxes.push(
      box(
        `chair-${i}`,
        [
          -1.4 + (i === 2 ? -0.6 : 0),
          i === 2 ? 0.25 : 0.4,
          laundromat + 1.0 + i * 0.75,
        ],
        [0.45, 0.8, 0.45],
        'plastic',
        false,
        i === 2 ? [Math.PI / 2, 0.4, 0] : [0, (i - 1.5) * 0.25, 0]
      )
    )
  }

  // The Golden Wok: the counter across the room with the kitchen behind
  // it and the menu over it. Someone has been sleeping out front, behind
  // the boards: a mattress, a blanket, candles round a chalk triangle.
  boxes.push(
    span(
      'wok-counter',
      [-6.35, -5.65],
      [0, 1.05],
      [wok + WALL / 2, wok + 6.0],
      'fixture',
      true
    ),
    span(
      'wok-range',
      [IN_BACK, IN_BACK + 0.8],
      [0, 0.95],
      [wok + 1.0, wok + 5.0],
      'steel',
      true
    ),
    span(
      'wok-hood',
      [IN_BACK, IN_BACK + 1.0],
      [2.0, 2.6],
      [wok + 0.9, wok + 5.1],
      'steel'
    ),
    box(
      'wok-mattress',
      [-2.4, 0.1, wok + 7.2],
      [1.0, 0.2, 1.95],
      'mattress',
      false,
      [0, 0.12, 0]
    ),
    box(
      'wok-blanket',
      [-2.5, 0.22, wok + 7.5],
      [1.1, 0.05, 1.1],
      'blanket',
      false,
      [0.04, 0.5, 0]
    )
  )
  // The candles: a ring of them round the chalk on the floor.
  for (let i = 0; i < 7; i++) {
    const a = (i / 7) * Math.PI * 2
    const cx = -3.4 + Math.cos(a) * 1.1
    const cz = wok + 3.2 + Math.sin(a) * 1.1
    const tall = 0.1 + (i % 3) * 0.05
    boxes.push(
      box(`candle-${i}`, [cx, tall / 2, cz], [0.06, tall, 0.06], 'candle'),
      box(`flame-${i}`, [cx, tall + 0.04, cz], [0.03, 0.06, 0.03], 'flame')
    )
  }
  const trash = mulberry32(0x70c0)
  for (let i = 0; i < 9; i++) {
    boxes.push(
      box(
        `wok-carton-${i}`,
        [range(trash, -5.2, -1), 0.06, range(trash, wok + 0.6, wok + 8.4)],
        [0.12, 0.12, 0.1],
        'tile',
        false,
        [0, range(trash, 0, Math.PI), i % 4 === 0 ? Math.PI / 2 : 0]
      )
    )
  }

  // Curl Up & Dye: the counter under the mirrors, the chairs before them
  // (one over on its side), the hood dryers along the back, the desk by
  // the door.
  const mirrorZ = salon + WALL / 2
  boxes.push(
    span(
      'salon-counter',
      [-10.4, -3.0],
      [0, 0.85],
      [mirrorZ, mirrorZ + 0.5],
      'laminate',
      true
    ),
    span(
      'salon-desk',
      [-2.7, -2.1],
      [0, 1.0],
      [salon + 6.0, salon + 8.2],
      'laminate',
      true
    )
  )
  for (const [i, x] of [-9.2, -6.7, -4.2].entries()) {
    boxes.push(
      box(
        `salon-mirror-${i}`,
        [x, 1.6, mirrorZ + 0.02],
        [1.6, 1.1, 0.02],
        'mirror',
        false,
        i === 1 ? [0, 0, 0.08] : undefined
      )
    )
    const z = salon + 1.9
    if (i === 2) {
      // Tipped over, its seat to the door.
      boxes.push(
        box(
          `salon-chair-${i}`,
          [x + 0.3, 0.32, z + 0.4],
          [0.6, 0.6, 0.65],
          'blanket',
          false,
          [Math.PI / 2, 0.6, 0]
        )
      )
      continue
    }
    boxes.push(
      span(
        `salon-chair-${i}-base`,
        [x - 0.2, x + 0.2],
        [0, 0.45],
        [z - 0.2, z + 0.2],
        'steel',
        true
      ),
      box(`salon-chair-${i}-seat`, [x, 0.55, z], [0.62, 0.18, 0.62], 'blanket'),
      box(
        `salon-chair-${i}-back`,
        [x, 0.95, z + 0.3],
        [0.62, 0.7, 0.1],
        'blanket',
        false,
        [-0.12, 0, 0]
      )
    )
  }
  for (let i = 0; i < 3; i++) {
    const z = salon + 3.0 + i * 1.6
    boxes.push(
      span(
        `salon-dryer-${i}-seat`,
        [IN_BACK + 0.1, IN_BACK + 0.8],
        [0, 0.5],
        [z - 0.35, z + 0.35],
        'blanket',
        true
      ),
      box(
        `salon-dryer-${i}-hood`,
        [IN_BACK + 0.55, 1.35, z],
        [0.6, 0.5, 0.6],
        'enamel',
        false,
        [0, 0, i === 1 ? -0.5 : -0.15]
      )
    )
  }
  return boxes
}

// The painted panels.
function buildSigns(): MallSign[] {
  const face = WALK + 0.02
  const signs: MallSign[] = UNIT_LIST.map((unit, u) => ({
    name: `sign-${unit.id}`,
    art: unit.sign,
    center: [face, CANOPY_Y + 0.45, unitZ(u) + UNIT / 2],
    size: [6.4, 0.95],
    turn: [0, Math.PI / 2, 0],
  }))
  const [video, , wok, salon] = [0, 1, 2, 3].map(unitZ)
  signs.push(
    // On the back room's door, the shop side.
    {
      name: 'sign-employees',
      art: 'employees',
      center: [
        BACK_ROOM.wall + WALL + 0.08,
        1.55,
        unitZ(0) + BACK_ROOM.door + BACK_ROOM.width / 2,
      ],
      size: [0.6, 0.3],
      turn: [0, Math.PI / 2, 0],
    },
    // Over the curtain into the adult section, the shop side.
    {
      name: 'sign-adults-only',
      art: 'adults-only',
      center: [
        BACK_ROOM.wall + WALL + 0.03,
        2.75,
        unitZ(0) + ADULT.curtain + ADULT.width / 2,
      ],
      size: [1.3, 0.42],
      turn: [0, Math.PI / 2, 0],
    },
    // And inside it, the posters: one on the wall from the office, one by
    // the curtain, one over the back rack.
    {
      name: 'sign-pinup-a',
      art: 'pinup-a',
      center: [
        (IN_BACK + BACK_ROOM.wall) / 2,
        1.7,
        unitZ(0) + BACK_ROOM.split + WALL / 2 + 0.02,
      ],
      size: [0.9, 1.3],
      turn: [0, 0, 0.03],
    },
    {
      name: 'sign-pinup-b',
      art: 'pinup-b',
      center: [BACK_ROOM.wall - 0.02, 1.7, unitZ(0) + 7.65],
      size: [0.8, 1.2],
      turn: [0, -Math.PI / 2, -0.04],
    },
    {
      name: 'sign-pinup-c',
      art: 'pinup-c',
      center: [IN_BACK + 0.02, 2.65, unitZ(0) + (BACK_ROOM.split + UNIT) / 2],
      size: [1.5, 0.9],
      turn: [0, Math.PI / 2, 0],
    },
    // Inside the Video Vault, over the counter.
    {
      name: 'sign-rewind',
      art: 'rewind',
      center: [-3.0, 2.4, video + WALL / 2 + 0.02],
      size: [1.6, 0.5],
      turn: [0, 0, 0],
    },
    // Over the Golden Wok's counter, facing the room.
    {
      name: 'sign-menu',
      art: 'menu',
      center: [-6.38, 2.55, wok + 3.0],
      size: [3.0, 0.9],
      turn: [0, Math.PI / 2, 0.03],
    },
    // Taped to the boards over the Golden Wok's windows, outside.
    {
      name: 'sign-for-lease',
      art: 'for-lease',
      center: [0.05, 1.7, wok + 2.0],
      size: [1.2, 0.8],
      turn: [0, Math.PI / 2, 0],
    },
    // Sprayed on the wall inside, over the mattress.
    {
      name: 'sign-graffiti-eye',
      art: 'graffiti-eye',
      center: [-2.6, 1.8, salon - WALL / 2 - 0.02],
      size: [2.4, 1.6],
      turn: [0, Math.PI, 0],
    },
    // And on the alley side of the back wall.
    {
      name: 'sign-graffiti-tag',
      art: 'graffiti-tag',
      center: [-DEPTH - 0.02, 1.4, unitZ(1) + 3],
      size: [3.2, 1.2],
      turn: [0, -Math.PI / 2, 0],
    },
    // The chalk on the floor inside the candles.
    {
      name: 'sign-chalk',
      art: 'chalk',
      center: [-3.4, 0.01, wok + 3.2],
      size: [2.0, 2.0],
      turn: [-Math.PI / 2, 0, 0],
    }
  )
  return signs
}

// The ways in, mall-local, each where a raider passes through its wall:
// every front door not boarded (the open half of one hung ajar), every
// back door standing open, and the hole into the Golden Wok. The ways
// shut (a boarded door, a back door closed) are listed too, for the tests
// and anyone wondering why it will not open.
export interface Way extends XZ {
  name: string
  open: boolean
}

function ways(): Way[] {
  const list: Way[] = []
  UNIT_LIST.forEach((unit, u) => {
    const d0 = unitZ(u) + FRONT.pier + FRONT.windowA + FRONT.jamb
    const z = unit.door === 'ajar' ? d0 + FRONT.door / 4 : d0 + FRONT.door / 2
    list.push({
      name: `${unit.id}-front`,
      x: -WALL / 2,
      z,
      open: unit.door !== 'boarded',
    })
    list.push({
      name: `${unit.id}-back`,
      x: -DEPTH + WALL / 2,
      z: unitZ(u) + BACK_DOOR.at + BACK_DOOR.width / 2,
      open: unit.backOpen,
    })
  })
  const wok = UNIT_LIST.findIndex((unit) => unit.id === 'wok')
  list.push({
    name: 'wok-hole',
    x: (HOLE.x0 + HOLE.x1) / 2,
    z: unitZ(wok),
    open: true,
  })
  // Through the beaded curtain into the adult section.
  list.push({
    name: 'adult-curtain',
    x: BACK_ROOM.wall + WALL / 2,
    z: unitZ(0) + ADULT.curtain + ADULT.width / 2,
    open: true,
  })
  // Locked: open only to whoever carries the key (keys.ts).
  list.push({
    name: 'vault-back-room',
    x: BACK_ROOM.wall + WALL / 2,
    z: unitZ(0) + BACK_ROOM.door + BACK_ROOM.width / 2,
    open: false,
  })
  return list
}

// The locked door into the Video Vault's back room: the gate across its
// opening (from `a` to `b`, `half` either side), and the leaf hung on its
// hinge at the -z jamb, `width` wide and `height` tall, swinging into the
// shop.
function lockedDoor() {
  const x = BACK_ROOM.wall + WALL / 2
  const z0 = unitZ(0) + BACK_ROOM.door
  return {
    id: 'vault-back-room' as const,
    a: { x, z: z0 + WALL / 2 },
    b: { x, z: z0 + BACK_ROOM.width - WALL / 2 },
    half: WALL / 2,
    hinge: { x: BACK_ROOM.wall + WALL, z: z0 },
    width: BACK_ROOM.width,
    height: BACK_ROOM.height,
  }
}

// What the plaza leaves lying every day, mall-local (a pickup each, back
// with the day like every other, sharedworld.ts rule 6): quarters in the
// laundromat, cabbages in the Golden Wok's kitchen, a pack or a can where
// someone left it, and, behind the locked door, a $20 in the open safe
// and a bottle by the desk. First to take each has it.
export interface MallLoot extends XZ {
  kind: PickupKind
  count: number
}

const LOOT: readonly MallLoot[] = [
  // The back room.
  { kind: 'twenty', count: 1, x: IN_BACK + 1.0, z: unitZ(0) + 1.35 },
  { kind: 'wild-turkey', count: 1, x: IN_BACK + 2.2, z: unitZ(0) + 3.9 },
  // The Video Vault, by the counter.
  { kind: 'camel', count: 20, x: -2.0, z: unitZ(0) + 3.2 },
  // Suds 'n' Duds: in front of the dryers, and under the soda machine.
  { kind: 'quarters', count: 8, x: IN_BACK + 1.2, z: unitZ(1) + 4.5 },
  { kind: 'quarters', count: 4, x: -1.0, z: unitZ(1) + 7.2 },
  // The Golden Wok's kitchen.
  { kind: 'cabbage', count: 1, x: -10, z: unitZ(2) + 6.5 },
  { kind: 'cabbage', count: 1, x: -8, z: unitZ(2) + 7.8 },
  // Curl Up & Dye, by the desk.
  { kind: 'newport', count: 20, x: -1.6, z: unitZ(3) + 7.0 },
  // The alley, by the tipped dumpster, and the lot, by the cart.
  { kind: 'pbr', count: 1, x: -DEPTH - 3.4, z: 3.8 },
  { kind: 'red-bull', count: 1, x: 8.2, z: 8.0 },
]

// Where the squatter keeps himself (dealer.ts): in the Golden Wok's
// front room at the foot of his mattress, facing the candles and the
// hole he came in by.
const DEALER = {
  x: -2.2,
  z: unitZ(2) + 5.9,
  face: { x: -3.5, z: unitZ(2) + 2 },
}

const PROPS: {
  dumpsters: readonly MallProp[]
  carts: readonly MallProp[]
  pylon: MallProp
} = {
  dumpsters: [
    { x: -DEPTH - 1.6, z: -5.5, yaw: 0 },
    { x: -DEPTH - 2.2, z: 2.0, yaw: 0.3, fallen: true },
  ],
  carts: [
    { x: 9, z: 9, yaw: 0.7 },
    { x: 15, z: -11, yaw: 2.2, fallen: true },
    { x: -DEPTH - 3.5, z: 12, yaw: -0.4 },
  ],
  // The pylon at the road by the -z drive, its faces up and down the road.
  pylon: { x: 17, z: -HALF - 2, yaw: Math.PI / 2 },
}

export const STRIP_MALL = {
  depth: DEPTH,
  length: LENGTH,
  height: HEIGHT,
  walk: WALK,
  canopyY: CANOPY_Y,
  units: UNIT_LIST,
  unitWidth: UNIT,
  boxes: [
    ...shell(),
    ...UNIT_LIST.flatMap(storefront),
    ...partitions(),
    ...ceilings(),
    ...contents(),
  ],
  signs: buildSigns(),
  ways: ways(),
  lock: lockedDoor(),
  loot: LOOT,
  dealer: DEALER,
  // The asphalt round the building, mall-local: [x0, x1] by [z0, z1]. The
  // lot out front reaches the road, which world.ts finds strip by strip;
  // `lot` gives where it starts and its z extent.
  lot: { x0: LOT_FRONT, z0: -HALF - END, z1: LOT_REACH },
  asphalt: [
    // The drive round the +z end, toward the Citgo.
    { x: [-DEPTH - ALLEY, LOT_FRONT], z: [HALF, HALF + END] },
    // The drive round the -z end.
    { x: [-DEPTH - ALLEY, LOT_FRONT], z: [-HALF - END, -HALF] },
    // The alley behind.
    { x: [-DEPTH - ALLEY, -DEPTH], z: [-HALF, HALF] },
  ] as readonly { x: [number, number]; z: [number, number] }[],
  props: PROPS,
  // The stalls painted out front, square to the building: each stripe from
  // x0 to x1 at one z.
  stripes: {
    x0: 6,
    x1: 11,
    z: Array.from({ length: 13 }, (_, i) => -HALF + i * 3),
  },
} as const

// --- Space ---------------------------------------------------------------

// Where the plaza stands: the spawn station's frame moved to CONFIG
// .stripMall.at (station-local), turned the same way, at the deck's height.
export function mallOrigin(station: StoreOrigin, deck: number): StoreOrigin {
  const { at } = CONFIG.stripMall
  const [x, , z] = toWorld(station, [at.x, 0, at.z])
  return { x, z, yaw: station.yaw, y: deck }
}

// The height the deck stands at: a curb over the lot at the front, or
// higher where the ground under the building would poke through the
// floor. `terrain` is the raw heightfield.
export function mallDeck(
  origin: XZ & { yaw: number },
  lotY: number,
  terrain: (x: number, z: number) => number
): number {
  const at: StoreOrigin = { ...origin, y: 0 }
  let highest = -Infinity
  for (let x = -DEPTH; x <= WALK; x += 1) {
    for (let z = -HALF; z <= HALF; z += 1) {
      const [wx, , wz] = toWorld(at, [x, 0, z])
      highest = Math.max(highest, terrain(wx, wz))
    }
  }
  return Math.max(lotY + CURB, highest + CLEARANCE)
}

// Whether a world point is on the plaza's grounds (the building and its
// asphalt as far as the road), or within `margin` metres of them: trees
// keep off.
export function onMallGrounds(
  origin: StoreOrigin,
  x: number,
  z: number,
  margin = 0
): boolean {
  const p = toLocal(origin, x, z)
  return (
    p.x > -DEPTH - ALLEY - margin &&
    p.x < LOT_REACH + margin &&
    p.z > -HALF - END - margin &&
    p.z < LOT_REACH + margin
  )
}

// Whether a world point stands in the Video Vault's office, behind its
// locked door.
export function inBackRoom(origin: StoreOrigin, x: number, z: number): boolean {
  const p = toLocal(origin, x, z)
  const video = unitZ(0)
  return (
    p.x > -DEPTH &&
    p.x < BACK_ROOM.wall + WALL / 2 &&
    p.z > video &&
    p.z < video + BACK_ROOM.split
  )
}

// Whether a world point stands in the Video Vault's adult section, through
// the curtain.
export function inAdultSection(
  origin: StoreOrigin,
  x: number,
  z: number
): boolean {
  const p = toLocal(origin, x, z)
  const video = unitZ(0)
  return (
    p.x > -DEPTH &&
    p.x < BACK_ROOM.wall + WALL / 2 &&
    p.z > video + BACK_ROOM.split &&
    p.z < video + UNIT
  )
}

// Whether a world point stands inside the building's walls.
export function insideMall(origin: StoreOrigin, x: number, z: number): boolean {
  const p = toLocal(origin, x, z)
  return p.x > -DEPTH && p.x < 0 && Math.abs(p.z) < HALF
}

// The middle of the building in the world, for the Book of Shadows.
export function mallCenter(origin: StoreOrigin): XZ {
  const [x, , z] = toWorld(origin, [-DEPTH / 2, 0, 0])
  return { x, z }
}

// The middle of the lot out front in the world, for the poles along the
// road to keep off.
export function plazaLotMiddle(origin: StoreOrigin): XZ {
  const [x, , z] = toWorld(origin, [12, 0, (-HALF - END + LOT_REACH) / 2])
  return { x, z }
}

// A blocking box as a wall: its centreline along its long side, in the
// world, and half its thickness, the capsule pulled in so it covers the
// box exactly.
export function boxWall(
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
  return { a: { x: ax, z: az }, b: { x: ex, z: ez }, half }
}

// The locked door's gate in the world (walls.ts addGate): a wall for
// whoever its lock does not let through.
export function mallGate(origin: StoreOrigin): WallSegment & { gate: LockId } {
  const { lock } = STRIP_MALL
  const [ax, , az] = toWorld(origin, [lock.a.x, 0, lock.a.z])
  const [bx, , bz] = toWorld(origin, [lock.b.x, 0, lock.b.z])
  return {
    a: { x: ax, z: az },
    b: { x: bx, z: bz },
    half: lock.half,
    gate: lock.id,
  }
}

// Every wall the building puts up, in the world.
export function mallWalls(origin: StoreOrigin): WallSegment[] {
  return STRIP_MALL.boxes.filter((b) => b.blocks).map((b) => boxWall(origin, b))
}
