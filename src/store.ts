// Pure: the walk-in Citgo. One layout every station shares, in
// station-local space (the pump island at the origin, local +X toward the
// road, local Z along it, y up from the lot), plus what it takes to shop
// there: shelf stock, cash, and which shelf facing the player is looking
// at. assets.ts builds the shell, shelves, lights and signs from
// STORE_LAYOUT, world.ts registers its floor and walls, so what is drawn,
// what blocks, and what E buys can never drift apart. No three.js, no DOM.

import { CONFIG } from './config.ts'
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
// lit fluorescent panel.
export type StoreFinish =
  'floor' | 'wall' | 'roof' | 'shelf' | 'counter' | 'light'

// One box of the building or its fixtures, centred at `center` with full
// `size`, both station-local. `blocks` boxes are walls to the player.
export interface StoreBox {
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

// A facing in the world, for aiming at it.
export interface WorldFacing {
  kind: ItemId
  center: Vec3
}

// The advertisements on the walls; adart.ts paints each by id.
export type AdId = 'smokes' | 'thanks' | 'beer' | 'energy'

// One sign on a wall: a flat panel `size` wide and tall, centred at
// `center` just off the wall face, turned by `yaw` so its art (asset +Z)
// faces into the room. Decoration only: it neither blocks nor sells.
export interface StoreSign {
  name: string
  art: AdId
  center: Vec3
  size: [number, number]
  yaw: number
}

// --- The layout ----------------------------------------------------------

// The building: back to front along local X, side to side along local Z.
// The front wall faces the pumps and meets the lot's back edge
// (FUEL_LAYOUT.lot.back in assets.ts).
const BACK = -13.5
const FRONT = -6.5
const HALF_WIDTH = 5.5
const HEIGHT = 3.4
const WALL = 0.2
const FLOOR = 0.1
const DOOR_WIDTH = 1.8
const DOOR_HEIGHT = 2.3
// The building stands level on a slope: a foundation this deep under the
// floor fills whatever gap the terrain leaves, and the floor clears the
// highest terrain under it by FLOOR_CLEARANCE.
const FOUNDATION = 1.5
const FLOOR_CLEARANCE = 0.08

// The back-wall shelving: two boards, drinks on both.
const SHELF_DEPTH = 0.5
const SHELF_X = BACK + WALL + SHELF_DEPTH / 2
const SHELF_TOPS = [0.6, 1.3]
const SHELF_BOARD = 0.04
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
// The low shelf by the -Z wall: sacks.
const SACK_SHELF = { x0: -11.0, x1: -8.6, height: 0.3, depth: 0.6 }
// The fluorescent troffers on the ceiling: two rows across the room, two
// panels each, long side along Z like the aisle, hung flush under the roof.
const LIGHT = {
  rows: [-11.75, -8.25],
  along: [-2.75, 2.75],
  size: [0.3, 0.06, 2.4] as Vec3,
}
// The signs stand this far off their wall, so they never z-fight with it.
const SIGN_DEPTH = 0.04

const BOARD_LENGTH = HALF_WIDTH * 2 - WALL * 2

function box(
  name: string,
  center: Vec3,
  size: Vec3,
  finish: StoreFinish,
  blocks = false
): StoreBox {
  return { name, center, size, finish, blocks }
}

function buildBoxes(): StoreBox[] {
  const depth = FRONT - BACK
  const midX = (FRONT + BACK) / 2
  const wallY = FLOOR + (HEIGHT - FLOOR) / 2
  const wallH = HEIGHT - FLOOR
  // The front wall either side of the door, and the lintel over it.
  const sideLen = HALF_WIDTH - DOOR_WIDTH / 2
  const sideZ = DOOR_WIDTH / 2 + sideLen / 2
  const frontX = FRONT - WALL / 2
  const lintelH = HEIGHT - DOOR_HEIGHT
  const boxes = [
    box(
      'foundation',
      [midX, -FOUNDATION / 2, 0],
      [depth, FOUNDATION, HALF_WIDTH * 2],
      'wall'
    ),
    box('floor', [midX, FLOOR / 2, 0], [depth, FLOOR, HALF_WIDTH * 2], 'floor'),
    box('roof', [midX, HEIGHT + 0.1, 0], [depth, 0.2, HALF_WIDTH * 2], 'roof'),
    box(
      'wall-back',
      [BACK + WALL / 2, wallY, 0],
      [WALL, wallH, HALF_WIDTH * 2],
      'wall',
      true
    ),
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
    box(
      'wall-front-left',
      [frontX, wallY, -sideZ],
      [WALL, wallH, sideLen],
      'wall',
      true
    ),
    box(
      'wall-front-right',
      [frontX, wallY, sideZ],
      [WALL, wallH, sideLen],
      'wall',
      true
    ),
    box(
      'lintel',
      [frontX, HEIGHT - lintelH / 2, 0],
      [WALL, lintelH, DOOR_WIDTH],
      'wall'
    ),
    // The shelving unit's footprint blocks; the boards are drawn on it.
    box(
      'shelf-back',
      [SHELF_X - SHELF_DEPTH / 2 + 0.02, wallY, 0],
      [0.04, wallH, BOARD_LENGTH],
      'shelf',
      false
    ),
    box(
      'shelf-unit',
      [SHELF_X, FLOOR + 0.02, 0],
      [SHELF_DEPTH, 0.04, BOARD_LENGTH],
      'shelf',
      true
    ),
    box(
      'counter',
      [COUNTER.x, COUNTER.height / 2, (COUNTER.z0 + COUNTER.z1) / 2],
      [COUNTER.depth, COUNTER.height, COUNTER.z1 - COUNTER.z0],
      'counter',
      true
    ),
    box(
      'sack-shelf',
      [
        (SACK_SHELF.x0 + SACK_SHELF.x1) / 2,
        SACK_SHELF.height / 2,
        -HALF_WIDTH + WALL + SACK_SHELF.depth / 2,
      ],
      [SACK_SHELF.x1 - SACK_SHELF.x0, SACK_SHELF.height, SACK_SHELF.depth],
      'shelf',
      true
    ),
  ]
  SHELF_TOPS.forEach((top, i) => {
    boxes.push(
      box(
        `shelf-board-${i}`,
        [SHELF_X, top - SHELF_BOARD / 2, 0],
        [SHELF_DEPTH, SHELF_BOARD, BOARD_LENGTH],
        'shelf'
      )
    )
  })
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
  return boxes
}

// The advertisements, each hung on an inside wall face. The front wall's
// inside face is at FRONT - WALL and the side walls' at ±(HALF_WIDTH -
// WALL); a sign's centre sits half its depth inside that.
function buildSigns(): StoreSign[] {
  const frontX = FRONT - WALL - SIGN_DEPTH / 2
  const sideZ = HALF_WIDTH - WALL - SIGN_DEPTH / 2
  return [
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
    // Over the sack shelf on the -Z wall.
    {
      name: 'sign-beer',
      art: 'beer',
      center: [(SACK_SHELF.x0 + SACK_SHELF.x1) / 2, 2.0, -sideZ],
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
  ]
}

// Units of one kind sit this far apart along their run.
const UNIT_GAP = { drink: 0.26, counter: 0.12, sack: 0.6 }

// `count` units centred on `at`, spread along local Z (or local X for the
// sack shelf, which runs along the side wall).
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

function buildFacings(): Facing[] {
  const facings: Facing[] = []
  const drinks = ITEMS.filter((item) => item.category === 'drink')
  const perBoard = Math.ceil(drinks.length / SHELF_TOPS.length)
  const pitch = BOARD_LENGTH / perBoard
  // Back wall: drinks left to right in ITEMS order, top board first, art
  // facing into the room (+X).
  drinks.forEach((item, i) => {
    const board = Math.floor(i / perBoard)
    const col = i % perBoard
    const z = -BOARD_LENGTH / 2 + pitch * (col + 0.5)
    const top = SHELF_TOPS[SHELF_TOPS.length - 1 - board]
    facings.push({
      kind: item.id,
      slots: row([SHELF_X, top, z], UNIT_GAP.drink, 'z'),
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
  // The sacks on their low shelf, facing across the room (+Z).
  facings.push({
    kind: 'sack',
    slots: row(
      [
        (SACK_SHELF.x0 + SACK_SHELF.x1) / 2,
        SACK_SHELF.height,
        -HALF_WIDTH + WALL + SACK_SHELF.depth / 2,
      ],
      UNIT_GAP.sack,
      'x'
    ),
    yaw: 0,
  })
  return facings
}

export const STORE_LAYOUT = {
  back: BACK,
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
} as const

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
// island, or higher where the terrain under the footprint would poke
// through the floor. `terrain` is the raw heightfield. Sampled every metre
// or so, corners and edges included.
export function storeBase(
  station: XZ & { yaw: number },
  lotY: number,
  terrain: HeightAt
): number {
  const origin: StoreOrigin = { ...station, y: 0 }
  const nx = Math.ceil(FRONT - BACK)
  const nz = Math.ceil(HALF_WIDTH * 2)
  let highest = -Infinity
  for (let i = 0; i <= nx; i++) {
    for (let j = 0; j <= nz; j++) {
      const lx = BACK + ((FRONT - BACK) * i) / nx
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

// Whether a world point stands inside the building's walls.
export function insideStore(
  origin: StoreOrigin,
  x: number,
  z: number
): boolean {
  const p = toLocal(origin, x, z)
  return p.x > BACK && p.x < FRONT && Math.abs(p.z) < HALF_WIDTH
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
    walls.push({ a: { x: ax, z: az }, b: { x: ex, z: ez }, half })
  }
  // The clerk: a zero-length wall is a disc.
  const [cx, , cz] = toWorld(origin, [CLERK.x, 0, CLERK.z])
  walls.push({ a: { x: cx, z: cz }, b: { x: cx, z: cz }, half: CLERK.radius })
  return walls
}

// Every facing at one station, in the world, aimed at by its middle unit.
export function worldFacings(origin: StoreOrigin): WorldFacing[] {
  return STORE_LAYOUT.facings.map((facing) => {
    const mid = facing.slots[Math.floor(facing.slots.length / 2)]
    return { kind: facing.kind, center: toWorld(origin, mid) }
  })
}

// --- Shopping ------------------------------------------------------------

// Full shelves at every station, for a new raid.
export function freshStock(stationCount: number): ShopStock[] {
  const full: ShopStock = {}
  for (const facing of STORE_LAYOUT.facings) {
    full[facing.kind] = CONFIG.store.perItem
  }
  return Array.from({ length: stationCount }, () => ({ ...full }))
}

// The facing the player is looking at: in stock, within reach of the eye,
// inside the aim cone, and the closest to the view ray among those. `dir`
// is the unit look direction, pitch included, so looking at a board picks
// it. Null when nothing qualifies.
export function facingInView<F extends WorldFacing>(
  facings: readonly F[],
  stock: ShopStock,
  eye: Vec3,
  dir: Vec3
): F | null {
  const { reach, aimCone } = CONFIG.store
  let best: F | null = null
  let bestAngle = aimCone
  for (const facing of facings) {
    if (!(stock[facing.kind] > 0)) continue
    const dx = facing.center[0] - eye[0]
    const dy = facing.center[1] - eye[1]
    const dz = facing.center[2] - eye[2]
    const d = Math.hypot(dx, dy, dz)
    if (d > reach || d < 1e-6) continue
    const cos = (dx * dir[0] + dy * dir[1] + dz * dir[2]) / d
    const angle = Math.acos(Math.max(-1, Math.min(1, cos)))
    if (angle <= bestAngle) {
      bestAngle = angle
      best = facing
    }
  }
  return best
}

// Cents as dollars: 549 -> "$5.49".
export function formatCash(cents: number): string {
  const whole = Math.max(0, Math.round(cents))
  return `$${Math.floor(whole / 100)}.${String(whole % 100).padStart(2, '0')}`
}
