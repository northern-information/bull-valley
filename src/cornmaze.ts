import * as THREE from 'three'
import {
  buildCornMazeSign,
  buildCornWalls,
  buildEnterSign,
  buildPortal,
  CORN_SIGN,
  ENTER_SIGN,
  mudMaterial,
} from './assets.ts'
import { CONFIG } from './config.ts'
import { projectOnSegment } from './coords.ts'
import {
  cellPoint,
  inMaze,
  mazeGates,
  mazeHeart,
  mazeSpans,
  mazeWalk,
  perimeterSpots,
  SHINING_MAZE,
  spanPieces,
  trailField,
} from './maze.ts'
import { paintTrailField } from './mudart.ts'
import { toWorld } from './store.ts'
import { makeMudAccumulator, MUD_LIFT } from './worldsurfaces.ts'
import type { CornPiece, MazeSignSize } from './assets.ts'
import type { Ground } from './ground.ts'
import type { HeightAt, XZ } from './interfaces.ts'
import type { Cell, TrailField } from './maze.ts'
import type { LampSpot } from './roadside.ts'
import type { StoreOrigin } from './store.ts'
import type { Walls } from './walls.ts'
import type { MazePortal } from './world.ts'

// Where the corn maze lies: maze-local metres (maze.ts, x away from the
// road and z along it) to the world through the spawn station's frame
// (CONFIG.maze.at, station-local), and back.
export interface MazeFrame {
  toWorld(x: number, z: number): XZ
  covers(x: number, z: number, margin: number): boolean
}

export function mazeFrame(station: StoreOrigin): MazeFrame {
  const { at, size } = CONFIG.maze
  const cos = Math.cos(station.yaw)
  const sin = Math.sin(station.yaw)
  return {
    toWorld(x, z) {
      const [wx, , wz] = toWorld(station, [at.x + x, 0, at.z + z])
      return { x: wx, z: wz }
    },
    covers(x, z, margin) {
      // toWorld's turn, undone.
      const dx = x - station.x
      const dz = z - station.z
      const lx = cos * dx + sin * dz
      const lz = -sin * dx + cos * dz
      return inMaze(size, lx - at.x, lz - at.z, margin)
    },
  }
}

// The maze's trail field is sampled every TRAIL_STEP metres, and the sheet
// it is painted on is draped every SHEET_STEP. The sheet lies SHEET_LIFT
// over the terrain: a stain in the dirt, not a deck, too low to stand on,

const TRAIL_STEP = 0.25
const SHEET_STEP = 2
const SHEET_LIFT = 0.1

// One sheet over the whole maze floor, draped on the terrain, with the
// trail field painted on it (mudart.ts paintTrailField) and the grass
// showing through everywhere else. The corn stands through it.
function buildTrailSheet(
  field: TrailField,
  frame: MazeFrame,
  terrain: HeightAt,
  half: number
): THREE.Mesh {
  const { size } = CONFIG.maze
  const along = (field.cols - 1) * field.step
  const across = (field.rows - 1) * field.step
  const nz = Math.ceil(along / SHEET_STEP)
  const nx = Math.ceil(across / SHEET_STEP)
  const positions: number[] = []
  const uvs: number[] = []
  const index: number[] = []
  for (let j = 0; j <= nx; j++) {
    for (let i = 0; i <= nz; i++) {
      const x = Math.min(size.across, (j / nx) * across)
      const z = Math.min(size.along, (i / nz) * along)
      const p = frame.toWorld(x, z)
      positions.push(p.x, terrain(p.x, p.z) + SHEET_LIFT, p.z)
      // Sample centres sit half a pixel in; canvas y runs down, v up.
      uvs.push(
        (z / field.step + 0.5) / field.cols,
        1 - (x / field.step + 0.5) / field.rows
      )
      if (i > 0 && j > 0) {
        const k = j * (nz + 1) + i
        const a = k - nz - 2
        const b = k - nz - 1
        index.push(a, k - 1, b, b, k - 1, k)
      }
    }
  }
  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute(
    'position',
    new THREE.BufferAttribute(new Float32Array(positions), 3)
  )
  geometry.setAttribute(
    'uv',
    new THREE.BufferAttribute(new Float32Array(uvs), 2)
  )
  const normals = new Float32Array(positions.length)
  for (let i = 0; i < normals.length; i += 3) normals[i + 1] = 1
  geometry.setAttribute('normal', new THREE.BufferAttribute(normals, 3))
  geometry.setIndex(index)
  const mesh = new THREE.Mesh(
    geometry,
    mudMaterial(paintTrailField(field, half))
  )
  mesh.name = 'maze-trail'
  return mesh
}

// Where the trail leaves the maze and runs to the road, station-local:

function trailOutLine(): XZ[] {
  const [gate] = mazeGates(SHINING_MAZE)
  const g = cellPoint(SHINING_MAZE, CONFIG.maze.size, gate)
  const { at } = CONFIG.maze
  return [{ x: at.x + g.x, z: at.z + g.z }, ...CONFIG.maze.trailOut]
}

// Sodium lamps round the outside of the maze, their arms reaching over the
// corn, kept clear of the gate, the signs and the trail out.
export function mazeLamps(frame: MazeFrame, station: StoreOrigin): LampSpot[] {
  const { at, size, sign, enterSign, lamps } = CONFIG.maze
  const line = trailOutLine()
  const clearOf = (x: number, z: number) =>
    [sign, enterSign].every(
      (s) => Math.hypot(x - s.x, z - s.z) > lamps.clear
    ) &&
    line.every((a, i) => {
      const b = line[i + 1]
      if (!b) return Math.hypot(x - a.x, z - a.z) > lamps.clear
      return projectOnSegment(x, z, a.x, a.z, b.x, b.z).dist > lamps.clear
    })
  return perimeterSpots(size, lamps.out, lamps.spacing)
    .filter((spot) => clearOf(at.x + spot.x, at.z + spot.z))
    .map((spot) => {
      const p = frame.toWorld(spot.x, spot.z)
      const [ix, , iz] = toWorld(station, [
        at.x + spot.x + spot.inX,
        0,
        at.z + spot.z + spot.inZ,
      ])
      // A lamp's yaw turns its local +X (the arm) to (cos, -sin).
      return { x: p.x, z: p.z, yaw: Math.atan2(-(iz - p.z), ix - p.x) }
    })
}

// The corn maze across the road from the spawn Citgo, after the hedge
// maze in The Shining (maze.ts). Each wall stands on the ground in pieces
// short enough to follow it and blocks as one capsule along its
// centreline. The CORN MAZE! sign stands on the verge by the near corner

export function buildCornMaze(
  frame: MazeFrame,
  station: StoreOrigin,
  terrain: HeightAt,
  ground: Ground,
  walls: Walls
): { group: THREE.Group; portal: MazePortal } {
  const { size, wallHeight, wallThickness, wallSink, pieceLength } = CONFIG.maze
  const half = wallThickness / 2
  const spans = mazeSpans(SHINING_MAZE, size)
  const pieces: CornPiece[] = []
  for (const span of spans) {
    const a = frame.toWorld(span.a.x, span.a.z)
    const b = frame.toWorld(span.b.x, span.b.z)
    walls.addWall(a, b, half)
    for (const piece of spanPieces(span, half, pieceLength)) {
      const pa = frame.toWorld(piece.a.x, piece.a.z)
      const pb = frame.toWorld(piece.b.x, piece.b.z)
      pieces.push({
        a: [pa.x, ground.at(pa.x, pa.z), pa.z],
        b: [pb.x, ground.at(pb.x, pb.z), pb.z],
      })
    }
  }
  const group = buildCornWalls(pieces, {
    height: wallHeight,
    thickness: wallThickness,
    sink: wallSink,
  })

  // The worn trail down the middle of every path in the maze (maze.ts
  // trailField), painted on a sheet draped over the maze floor.
  const width = CONFIG.maze.trailWidth
  const field = trailField(SHINING_MAZE, size, wallThickness, TRAIL_STEP)
  group.add(buildTrailSheet(field, frame, terrain, width / 2))

  // The trail out: from the gate across the verge to the road by the sign,
  // shoulder mud, each leg its own strip pushed out half a width at both
  // ends so the corners close, and registered on the ground.
  const out = trailOutLine().map((p) => {
    const [x, , z] = toWorld(station, [p.x, 0, p.z])
    return { x, z }
  })
  const mud = makeMudAccumulator(terrain)
  for (let i = 0; i < out.length - 1; i++) {
    const a = out[i]
    const b = out[i + 1]
    const len = Math.hypot(b.x - a.x, b.z - a.z) || 1
    const ux = ((b.x - a.x) / len) * (width / 2)
    const uz = ((b.z - a.z) / len) * (width / 2)
    mud.strip(
      [
        { x: a.x - ux, z: a.z - uz },
        { x: b.x + ux, z: b.z + uz },
      ],
      -width / 2,
      width / 2
    )
  }
  ground.addTrail(out, width, MUD_LIFT)
  group.add(mud.build('maze-trail-out'))

  // The portal at the heart, turned to face the way the shortest walk
  // from the gate comes in, and where it puts you: on the trail outside
  // the gate, facing the gate.
  const [gate] = mazeGates(SHINING_MAZE)
  const heartCell = mazeHeart(SHINING_MAZE)
  const walk = mazeWalk(SHINING_MAZE, heartCell, gate)
  const cellAt = (cell: Cell) => {
    const p = cellPoint(SHINING_MAZE, size, cell)
    return frame.toWorld(p.x, p.z)
  }
  const heart = cellAt(heartCell)
  const toward = walk[1] ? cellAt(walk[1]) : { x: heart.x, z: heart.z + 1 }
  const rig = buildPortal()
  rig.group.position.set(heart.x, ground.at(heart.x, heart.z), heart.z)
  rig.group.rotation.y = Math.atan2(toward.x - heart.x, toward.z - heart.z)
  group.add(rig.group)
  const [ex, , ez] = toWorld(station, [
    CONFIG.maze.portal.exit.x,
    0,
    CONFIG.maze.portal.exit.z,
  ])
  const gateAt = out[0]
  const portal: MazePortal = {
    at: { x: heart.x, z: heart.z },
    // The camera looks along (-sin yaw, -cos yaw).
    exit: { x: ex, z: ez, yaw: Math.atan2(-(gateAt.x - ex), -(gateAt.z - ez)) },
    rig,
  }

  // A sign at a station-local spot, its board (which faces +Z) turned to
  // the world direction `face` gives from where it stands, blocking post
  // to post.
  const plant = (
    sign: THREE.Group,
    size: MazeSignSize,
    at: { x: number; z: number },
    face: (x: number, z: number) => XZ
  ) => {
    const [x, , z] = toWorld(station, [at.x, 0, at.z])
    const f = face(x, z)
    const yaw = Math.atan2(f.x, f.z)
    sign.position.set(x, ground.at(x, z), z)
    sign.rotation.y = yaw
    group.add(sign)
    // Its local +X, along the board, after the turn.
    const dx = Math.cos(yaw) * size.postX
    const dz = -Math.sin(yaw) * size.postX
    walls.addWall(
      { x: x - dx, z: z - dz },
      { x: x + dx, z: z + dz },
      CONFIG.maze.signRadius
    )
  }
  // CORN MAZE! faces the pump island at the origin; ENTER! faces back down
  // the road (station-local -Z), toward the end raiders come from.
  plant(buildCornMazeSign(), CORN_SIGN, CONFIG.maze.sign, (x, z) => ({
    x: station.x - x,
    z: station.z - z,
  }))
  plant(buildEnterSign(), ENTER_SIGN, CONFIG.maze.enterSign, () => ({
    x: Math.sin(station.yaw),
    z: -Math.cos(station.yaw),
  }))
  return { group, portal }
}
