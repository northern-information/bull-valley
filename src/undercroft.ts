// Pure: the Undercroft, the old stone under Bull Valley Plaza. A trapdoor
// in the Video Vault's office floor (stripmall.ts) lets down a ladder into
// rough-cut rooms older than the plaza, older than the valley's roads: an
// entry chamber, a hall of candles, a flooded room, the room where Erwin's
// chalk triangle was first drawn, an ossuary, and the deep chamber where
// the Warden keeps an altar. The tunnel shades walk it (tunnelshades.ts).
//
// It is laid out like the corn maze, as a grid of stone (`#`) and floor
// (`.`) cells, so the shades walk it with the Caretaker's own pathing
// (caretaker.ts mazeMap, routeTo, clearBetween). In its own metres: x down
// the grid's rows, z along its columns, y up from the floor. The valley
// is a heightfield and nothing can stand under it, so the Undercroft is a
// sealed stone box raised high over a far corner of the survey square
// (CONFIG.undercroft), walled all round so no one walks in from the
// surface; the trapdoor and the ladder carry a raider there and back.
// No three.js, no DOM.

import { mazeMap } from './caretaker.ts'
import { CONFIG } from './config.ts'
import { cellPoint, inMaze, mazeSpans, worldToMaze } from './maze.ts'
import { mulberry32, range } from './rng.ts'
import type { MazeMap } from './caretaker.ts'
import type { Metres, Vec3, XZ } from './interfaces.ts'
import type { PickupKind } from './items.ts'
import type { Cell, MazePlace, MazeSize } from './maze.ts'

// The rooms, row by row (x) and column by column (z):
//   A  the entry chamber, the ladder in its corner   rows 1-7,  cols 1-5
//   B  the candle hall, four pillars                  rows 1-8,  cols 7-15
//   C  the deep chamber, the altar and the Warden     rows 1-8,  cols 17-27
//   D  the flooded room                               rows 10-15, cols 1-5
//   E  the chalk room                                 rows 10-15, cols 7-15
//   F  the ossuary, one pillar                        rows 10-15, cols 17-27
// The way down: A to B, B to E, E to F, F to C; and D off A and E.
export const UNDERCROFT_GRID: readonly string[] = [
  '#############################',
  '#.....#.........#...........#',
  '#.....#.........#...........#',
  '#.....#..#...#..#...........#',
  '#.....#.........#...#...#...#',
  '#...............#...........#',
  '#.....#..#...#..#...........#',
  '#.....#.........#...#...#...#',
  '###.###.........#...........#',
  '###.#######.###########.#####',
  '#.....#.........#...........#',
  '#.....#.........#...........#',
  '#...............#...........#',
  '#.....#.........#.....#.....#',
  '#.....#.....................#',
  '#.....#.........#...........#',
  '#############################',
]

// Metres between cell centres; the stone's thickness and height.
const CELL = 3
const WALL = 0.9
const HEIGHT = 4.2
const ROWS = UNDERCROFT_GRID.length
const COLS = UNDERCROFT_GRID[0].length

export const UNDERCROFT_SIZE: MazeSize = {
  across: (ROWS - 1) * CELL,
  along: (COLS - 1) * CELL,
}

// A cell's middle in the Undercroft's metres.
const at = (row: number, col: number): XZ =>
  cellPoint(UNDERCROFT_GRID, UNDERCROFT_SIZE, { col, row })

// A room, by its cells (inclusive), as metres: the floor between its
// walls' faces.
export interface Room {
  id: 'entry' | 'candles' | 'deep' | 'flooded' | 'chalk' | 'ossuary'
  x0: number
  x1: number
  z0: number
  z1: number
}

function room(
  id: Room['id'],
  [r0, r1]: [number, number],
  [c0, c1]: [number, number]
): Room {
  const lo = at(r0, c0)
  const hi = at(r1, c1)
  const pad = CELL / 2 - WALL / 2
  return { id, x0: lo.x - pad, x1: hi.x + pad, z0: lo.z - pad, z1: hi.z + pad }
}

export const ROOMS: Readonly<Record<Room['id'], Room>> = {
  entry: room('entry', [1, 7], [1, 5]),
  candles: room('candles', [1, 8], [7, 15]),
  deep: room('deep', [1, 8], [17, 27]),
  flooded: room('flooded', [10, 15], [1, 5]),
  chalk: room('chalk', [10, 15], [7, 15]),
  ossuary: room('ossuary', [10, 15], [17, 27]),
}

export function inRoom(r: Room, p: XZ, margin = 0): boolean {
  return (
    p.x >= r.x0 - margin &&
    p.x <= r.x1 + margin &&
    p.z >= r.z0 - margin &&
    p.z <= r.z1 + margin
  )
}

// What a box is drawn in; assets.ts maps each to a material.
export type CroftFinish =
  | 'stone' // the walls and pillars
  | 'flagstone' // the floor
  | 'vault' // the ceiling
  | 'altar'
  | 'bone'
  | 'wood' // the ladder and the trapdoor
  | 'candle'
  | 'flame'
  | 'water'
  | 'iron'
  | 'cloth'

// One box, in the Undercroft's metres; `turn` (Euler XYZ) tips it. The
// stone blocks (the grid's walls, croftWalls); a fixture that `blocks`
// too never turns, so its wall stays square to it.
export interface CroftBox {
  name: string
  center: Vec3
  size: Vec3
  finish: CroftFinish
  turn?: Vec3
  blocks?: true
}

// A painted panel: on the floor or carved on a wall.
export type CroftArtId = 'sigil' | 'names' | 'warning'

export interface CroftSign {
  name: string
  art: CroftArtId
  center: Vec3
  size: [number, number]
  turn: Vec3
}

function box(
  name: string,
  center: Vec3,
  size: Vec3,
  finish: CroftFinish,
  turn?: Vec3
): CroftBox {
  return turn
    ? { name, center, size, finish, turn }
    : { name, center, size, finish }
}

// A fixture that blocks, square to the grid.
function solid(
  name: string,
  center: Vec3,
  size: Vec3,
  finish: CroftFinish
): CroftBox {
  return { name, center, size, finish, blocks: true }
}

// The stone: one box per wall span, each reaching half the stone's
// thickness past its ends so the corners close; a pillar is a square.
function stone(): CroftBox[] {
  return mazeSpans(UNDERCROFT_GRID, UNDERCROFT_SIZE).map((span, i) => {
    const dx = Math.abs(span.b.x - span.a.x)
    const dz = Math.abs(span.b.z - span.a.z)
    return box(
      `stone-${i}`,
      [(span.a.x + span.b.x) / 2, HEIGHT / 2, (span.a.z + span.b.z) / 2],
      [dx + WALL, HEIGHT, dz + WALL],
      'stone'
    )
  })
}

// Candles in a cluster round (x, z), `count` of them, each its own height.
function candles(
  name: string,
  x: number,
  z: number,
  count: number,
  spread: number,
  seed: number
): CroftBox[] {
  const rng = mulberry32(seed)
  const boxes: CroftBox[] = []
  for (let i = 0; i < count; i++) {
    const a = rng() * Math.PI * 2
    const r = Math.sqrt(rng()) * spread
    const cx = x + Math.cos(a) * r
    const cz = z + Math.sin(a) * r
    const tall = range(rng, 0.08, 0.3)
    boxes.push(
      box(`${name}-${i}`, [cx, tall / 2, cz], [0.06, tall, 0.06], 'candle'),
      box(
        `${name}-flame-${i}`,
        [cx, tall + 0.04, cz],
        [0.03, 0.06, 0.03],
        'flame'
      )
    )
  }
  return boxes
}

// What fills each room.
function furnish(): CroftBox[] {
  const boxes: CroftBox[] = [
    box(
      'floor',
      [UNDERCROFT_SIZE.across / 2, -0.25, UNDERCROFT_SIZE.along / 2],
      [UNDERCROFT_SIZE.across + WALL, 0.5, UNDERCROFT_SIZE.along + WALL],
      'flagstone'
    ),
    box(
      'vault',
      [UNDERCROFT_SIZE.across / 2, HEIGHT + 0.25, UNDERCROFT_SIZE.along / 2],
      [UNDERCROFT_SIZE.across + WALL, 0.5, UNDERCROFT_SIZE.along + WALL],
      'vault'
    ),
  ]
  const { entry, candles: hall, deep, flooded, chalk, ossuary } = ROOMS
  // The entry: the ladder's foot, old crates, a coil of rope.
  boxes.push(
    solid(
      'crate-a',
      [entry.x1 - 0.6, 0.35, entry.z1 - 0.6],
      [0.7, 0.7, 0.7],
      'wood'
    ),
    box(
      'crate-b',
      [entry.x1 - 0.5, 0.95, entry.z1 - 0.7],
      [0.5, 0.5, 0.5],
      'wood',
      [0, -0.2, 0]
    ),
    box(
      'rope',
      [entry.x0 + 1.2, 0.06, entry.z1 - 0.8],
      [0.6, 0.12, 0.6],
      'cloth'
    ),
    ...candles('entry-candles', entry.x0 + 1, entry.z0 + 3, 3, 0.3, 0xe1)
  )
  // The candle hall: rows of candles down the floor between the pillars.
  for (let i = 0; i < 5; i++) {
    const x = hall.x0 + 2 + i * 4
    boxes.push(
      ...candles(
        `hall-candles-${i}`,
        x,
        (hall.z0 + hall.z1) / 2,
        9,
        1.2,
        0xc0 + i
      )
    )
  }
  // The flooded room: black water over most of its floor.
  boxes.push(
    box(
      'water',
      [(flooded.x0 + flooded.x1) / 2, 0.03, (flooded.z0 + flooded.z1) / 2],
      [flooded.x1 - flooded.x0 - 0.6, 0.02, flooded.z1 - flooded.z0 - 0.6],
      'water'
    )
  )
  // The chalk room: a ring of candles round the sigil on its floor.
  const cx = (chalk.x0 + chalk.x1) / 2
  const cz = (chalk.z0 + chalk.z1) / 2
  for (let i = 0; i < 9; i++) {
    const a = (i / 9) * Math.PI * 2
    boxes.push(
      ...candles(
        `chalk-candle-${i}`,
        cx + Math.cos(a) * 3.4,
        cz + Math.sin(a) * 3.4,
        1,
        0,
        0xa0 + i
      )
    )
  }
  // The ossuary: skulls in rows on stone ledges along its long walls,
  // bones in heaps.
  const skulls = mulberry32(0x5c11)
  for (const side of [ossuary.x0 + 0.25, ossuary.x1 - 0.25]) {
    for (let shelf = 0; shelf < 3; shelf++) {
      boxes.push(
        box(
          `ledge-${side}-${shelf}`,
          [side, 0.46 + shelf * 0.9, (ossuary.z0 + ossuary.z1) / 2],
          [0.5, 0.08, ossuary.z1 - ossuary.z0],
          'stone'
        )
      )
      for (let i = 0; i < 26; i++) {
        const z = ossuary.z0 + 0.6 + i * 1.08
        if (z > ossuary.z1 - 0.4) break
        boxes.push(
          box(
            `skull-${side}-${shelf}-${i}`,
            [side, 0.6 + shelf * 0.9 + range(skulls, -0.03, 0.03), z],
            [0.22, 0.2, 0.18],
            'bone',
            [0, range(skulls, -0.4, 0.4), 0]
          )
        )
      }
    }
  }
  for (let heap = 0; heap < 4; heap++) {
    const hx = range(skulls, ossuary.x0 + 2, ossuary.x1 - 2)
    const hz = range(skulls, ossuary.z0 + 3, ossuary.z1 - 3)
    for (let i = 0; i < 8; i++) {
      boxes.push(
        box(
          `bones-${heap}-${i}`,
          [
            hx + range(skulls, -0.5, 0.5),
            0.04 + i * 0.02,
            hz + range(skulls, -0.5, 0.5),
          ],
          [0.5, 0.05, 0.06],
          'bone',
          [0, range(skulls, 0, Math.PI), range(skulls, -0.2, 0.2)]
        )
      )
    }
  }
  // The deep chamber: the altar against its far wall under red candles,
  // and iron rings in the stone either side of it.
  const altar = ALTAR
  boxes.push(
    solid('altar', [altar.x, 0.5, altar.z], [1.2, 1.0, 2.4], 'altar'),
    box(
      'altar-cloth',
      [altar.x + 0.05, 1.01, altar.z],
      [1.0, 0.02, 1.6],
      'cloth'
    ),
    ...candles('altar-candles', altar.x - 0.2, altar.z - 0.9, 4, 0.15, 0xa17),
    ...candles('altar-candles-b', altar.x - 0.2, altar.z + 0.9, 4, 0.15, 0xa18),
    box(
      'ring-a',
      [deep.x0 + 0.5, 1.8, altar.z - 2.4],
      [0.06, 0.4, 0.4],
      'iron'
    ),
    box('ring-b', [deep.x0 + 0.5, 1.8, altar.z + 2.4], [0.06, 0.4, 0.4], 'iron')
  )
  // The ladder up to the trapdoor, against the entry's wall.
  const ladder = LADDER
  for (const side of [-0.25, 0.25]) {
    boxes.push(
      box(
        `ladder-rail-${side}`,
        [ladder.x - 0.35, HEIGHT / 2, ladder.z + side],
        [0.06, HEIGHT + 0.4, 0.06],
        'wood'
      )
    )
  }
  for (let i = 0; i < 12; i++) {
    boxes.push(
      box(
        `ladder-rung-${i}`,
        [ladder.x - 0.35, 0.3 + i * 0.36, ladder.z],
        [0.05, 0.05, 0.5],
        'wood'
      )
    )
  }
  return boxes
}

// Where things are, in the Undercroft's metres.
// The ladder's foot, by the entry's first corner, and the way a raider
// climbing down faces: into the room.
const LADDER = { x: at(1, 1).x - 0.4, z: at(1, 2).z, face: { x: 12, z: 9 } }
// The altar, against the deep chamber's far (low-x) wall, its long side
// across the room.
const ALTAR = { x: ROOMS.deep.x0 + 0.7, z: (ROOMS.deep.z0 + ROOMS.deep.z1) / 2 }

function signs(): CroftSign[] {
  const { chalk, ossuary, deep } = ROOMS
  return [
    {
      name: 'sigil',
      art: 'sigil',
      center: [(chalk.x0 + chalk.x1) / 2, 0.012, (chalk.z0 + chalk.z1) / 2],
      size: [5.6, 5.6],
      turn: [-Math.PI / 2, 0, 0],
    },
    // The shadowmen's names cut into the ossuary's end wall.
    {
      name: 'names',
      art: 'names',
      center: [(ossuary.x0 + ossuary.x1) / 2, 2.2, ossuary.z0 + 0.02],
      size: [6, 3],
      turn: [0, 0, 0],
    },
    // Over the way into the deep chamber, on its ossuary side.
    {
      name: 'warning',
      art: 'warning',
      center: [ossuary.x0 + 0.02, 3.1, at(9, 23).z + 2.6],
      size: [2.2, 0.7],
      turn: [0, Math.PI / 2, 0],
    },
    // And the same sigil, red, on the wall over the altar.
    {
      name: 'altar-sigil',
      art: 'sigil',
      center: [deep.x0 + 0.02, 2.6, ALTAR.z],
      size: [2.2, 2.2],
      turn: [0, Math.PI / 2, 0],
    },
  ]
}

// What the Undercroft leaves lying every day (a pickup each, back with the
// day, sharedworld.ts rule 6): growth in the candle hall, a tab in the
// chalk, a bottle in the water, dimes among the bones, and on the altar a
// bar of gold and a bill for whoever reaches it first.
export interface CroftLoot extends XZ {
  kind: PickupKind
  count: number
}

const LOOT: readonly CroftLoot[] = [
  { kind: 'mushrooms', count: 1, ...at(2, 14) },
  {
    kind: 'lsd',
    count: 1,
    x: (ROOMS.chalk.x0 + ROOMS.chalk.x1) / 2,
    z: (ROOMS.chalk.z0 + ROOMS.chalk.z1) / 2,
  },
  { kind: 'jim-beam', count: 1, ...at(14, 2) },
  { kind: 'dimes', count: 15, ...at(14, 26) },
  { kind: 'gold-bullion', count: 1, x: ALTAR.x + 0.95, z: ALTAR.z - 0.4 },
  { kind: 'twenty', count: 1, x: ALTAR.x + 0.95, z: ALTAR.z + 0.4 },
]

// Where each tunnel shade keeps to (tunnelshades.ts), and the Warden's
// place before the altar.
const LAIRS: readonly XZ[] = [
  at(4, 11),
  at(12, 3),
  at(12, 11),
  at(11, 20),
  at(14, 24),
]
const WARDEN: XZ = { x: ALTAR.x + 3.5, z: ALTAR.z }

export const UNDERCROFT = {
  grid: UNDERCROFT_GRID,
  size: UNDERCROFT_SIZE,
  cell: CELL,
  wall: WALL,
  height: HEIGHT,
  rooms: ROOMS,
  boxes: [...stone(), ...furnish()],
  signs: signs(),
  loot: LOOT,
  ladder: LADDER,
  altar: ALTAR,
  lairs: LAIRS,
  warden: WARDEN,
} as const

let built: MazeMap | null = null

// The Undercroft as the shades walk it, worked out once.
export function theUndercroft(): MazeMap {
  built ??= mazeMap(UNDERCROFT_GRID, UNDERCROFT_SIZE, WALL)
  return built
}

// Where the Undercroft lies: its corner `CONFIG.undercroft.inset` metres in
// from the survey square's low corner, unturned.
export function undercroftPlace(metres: Metres): MazePlace {
  const { inset } = CONFIG.undercroft
  return { x: -metres.width / 2 + inset, z: -metres.height / 2 + inset, yaw: 0 }
}

// Whether a world point is in the Undercroft (within `margin` of it).
export function inUndercroft(place: MazePlace, p: XZ, margin = 0): boolean {
  const local = worldToMaze(place, p)
  return inMaze(UNDERCROFT_SIZE, local.x, local.z, margin)
}

// The cell a point is in, for the tests.
export function cellAt(p: XZ): Cell {
  return { row: Math.round(p.x / CELL), col: Math.round(p.z / CELL) }
}

// Every wall the Undercroft puts up, in its own metres: its stone along the
// grid's spans, half the stone's thickness either side, and the fixtures
// that block.
export function croftWalls(): { a: XZ; b: XZ; half: number }[] {
  const walls = mazeSpans(UNDERCROFT_GRID, UNDERCROFT_SIZE).map((span) => ({
    a: span.a,
    b: span.b,
    half: WALL / 2,
  }))
  for (const b of UNDERCROFT.boxes) {
    if (!b.blocks) continue
    const [cx, , cz] = b.center
    const [sx, , sz] = b.size
    const alongX = sx >= sz
    const half = (alongX ? sz : sx) / 2
    const reach = Math.max(0, (alongX ? sx : sz) / 2 - half)
    walls.push({
      a: alongX ? { x: cx - reach, z: cz } : { x: cx, z: cz - reach },
      b: alongX ? { x: cx + reach, z: cz } : { x: cx, z: cz + reach },
      half,
    })
  }
  return walls
}
