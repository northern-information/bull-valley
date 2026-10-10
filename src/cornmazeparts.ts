import * as THREE from 'three'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'
import {
  artTexture,
  lambert,
  makeGlowSprite,
  makeGlowTexture,
  mergeStatic,
} from './assetkit.ts'
import { CONFIG } from './config.ts'
import { spanPieces } from './maze.ts'
import {
  paintCornMazeSign,
  paintCornStalks,
  paintEnterSign,
  paintPortalSwirl,
  STALK_MASS_TOP,
} from './mazeart.ts'
import { applyPS1 } from './ps1.ts'
import { mulberry32 } from './rng.ts'
import type { CanvasArt } from './canvas.ts'
import type { Vec3 } from './interfaces.ts'
import type { Span } from './maze.ts'

// The corn maze as seen (maze.ts lays it out): the walls of corn as
// instanced pieces, the CORN MAZE! and ENTER! signs, and the portal at
// its heart.

// --- Corn maze -----------------------------------------------------------

// One piece of corn wall, a unit long (local X, centred), a unit thick
// (local Z, centred) and a unit tall from its base, scaled per instance: a
// dark opaque core, so nothing shows through, under a card of painted
// stalks on each face whose tassels stand past the core's top for a ragged
// skyline. The core stops under the painted mass so its flat top never
// shows. Each piece's stalks carry their own tint.
const CORN_CORE_TOP = 1 - STALK_MASS_TOP - 0.02
const CORN_TINT_LOW = '#c2b682'
const CORN_TINT_HIGH = '#ffffff'

function cornWallParts() {
  const core = new THREE.BoxGeometry(1, CORN_CORE_TOP, 1)
  core.translate(0, CORN_CORE_TOP / 2, 0)
  const front = new THREE.PlaneGeometry(1, 1)
  front.translate(0, 0.5, 0.51)
  const back = new THREE.PlaneGeometry(1, 1)
  back.rotateY(Math.PI)
  back.translate(0, 0.5, -0.51)
  const stalks = mergeGeometries([front, back])
  return {
    core: {
      name: 'corn-core',
      geometry: core,
      material: lambert({ color: '#2c2e16' }),
    },
    // White under the art: each instance carries its own tint.
    stalks: {
      name: 'corn-stalks',
      geometry: stalks,
      material: lambert({
        map: artTexture(paintCornStalks()),
        alphaTest: 0.5,
      }),
    },
  }
}

// A stretch of corn wall from a to b, both on the ground at its foot.
export interface CornPiece {
  a: Vec3
  b: Vec3
}

export interface CornWallSize {
  height: number
  thickness: number
  // How far the foot sinks under the ground, so a slope across the
  // wall's thickness never shows daylight under it.
  sink: number
}

// The pieces are bucketed into square tiles, one InstancedMesh per part
// per tile, so frustum culling skips the stretches of corn out of view.
const CORN_TILE = 100

// Corn wall pieces as instances: each piece pitched along its slope, its
// foot sunk under the ground, its tint drawn from its own seed.
export function buildCornWalls(
  pieces: readonly CornPiece[],
  { height, thickness, sink }: CornWallSize
): THREE.Group {
  const group = new THREE.Group()
  group.name = 'corn-maze'
  const parts = cornWallParts()
  const tiles = new Map<string, CornPiece[]>()
  for (const piece of pieces) {
    const x = (piece.a[0] + piece.b[0]) / 2
    const z = (piece.a[2] + piece.b[2]) / 2
    const key = `${Math.floor(x / CORN_TILE)},${Math.floor(z / CORN_TILE)}`
    const list = tiles.get(key) ?? []
    list.push(piece)
    tiles.set(key, list)
  }
  const rng = mulberry32(0xc022)
  const low = new THREE.Color(CORN_TINT_LOW)
  const high = new THREE.Color(CORN_TINT_HIGH)
  const tint = new THREE.Color()
  const m = new THREE.Matrix4()
  const q = new THREE.Quaternion()
  const euler = new THREE.Euler(0, 0, 0, 'YXZ')
  const pos = new THREE.Vector3()
  const scale = new THREE.Vector3()
  for (const tile of tiles.values()) {
    const cores = new THREE.InstancedMesh(
      parts.core.geometry,
      parts.core.material,
      tile.length
    )
    const stalks = new THREE.InstancedMesh(
      parts.stalks.geometry,
      parts.stalks.material,
      tile.length
    )
    tile.forEach(({ a, b }, i) => {
      const dx = b[0] - a[0]
      const dy = b[1] - a[1]
      const dz = b[2] - a[2]
      const run = Math.hypot(dx, dz)
      // Turn local +X along the piece, then tip it up its slope.
      euler.set(0, Math.atan2(-dz, dx), Math.atan2(dy, run))
      m.compose(
        pos.set((a[0] + b[0]) / 2, (a[1] + b[1]) / 2 - sink, (a[2] + b[2]) / 2),
        q.setFromEuler(euler),
        scale.set(Math.hypot(run, dy), height + sink, thickness)
      )
      cores.setMatrixAt(i, m)
      stalks.setMatrixAt(i, m)
      stalks.setColorAt(i, tint.copy(low).lerp(high, rng()))
    })
    cores.instanceMatrix.needsUpdate = true
    stalks.instanceMatrix.needsUpdate = true
    if (stalks.instanceColor) stalks.instanceColor.needsUpdate = true
    group.add(cores, stalks)
  }
  return group
}

// The maze's pieces on flat ground, in maze-local metres.
export function flatCornPieces(spans: readonly Span[]): CornPiece[] {
  const { wallThickness, pieceLength } = CONFIG.maze
  return spans
    .flatMap((span) => spanPieces(span, wallThickness / 2, pieceLength))
    .map(({ a, b }) => ({ a: [a.x, 0, a.z], b: [b.x, 0, b.z] }))
}

export function cornWallSize(): CornWallSize {
  const { wallHeight, wallThickness, wallSink } = CONFIG.maze
  return { height: wallHeight, thickness: wallThickness, sink: wallSink }
}

// The corn maze's signs: painted plywood boards on two posts, their art on
// the +Z face and glowing a little through its own emissiveMap so it reads
// by headlight. Origin at ground level under the middle; the posts sink
// into the ground. The big CORN MAZE! board stands on the verge, the small
// ENTER! board by the gate.
export interface MazeSignSize {
  width: number
  height: number
  bottom: number
  // Each post's distance from the middle.
  postX: number
}

export const CORN_SIGN: MazeSignSize = {
  width: 3,
  height: 2,
  bottom: 0.7,
  postX: 1.25,
}

export const ENTER_SIGN: MazeSignSize = {
  width: 2,
  height: 1.25,
  bottom: 0.6,
  postX: 0.8,
}

const SIGN_POST = 0.1
const SIGN_SINK = 0.5

export function buildCornMazeSign(): THREE.Group {
  return buildMazeSign('corn-maze-sign', paintCornMazeSign(), CORN_SIGN)
}

export function buildEnterSign(): THREE.Group {
  return buildMazeSign('enter-sign', paintEnterSign(), ENTER_SIGN)
}

function buildMazeSign(
  name: string,
  art: CanvasArt,
  { width, height, bottom, postX }: MazeSignSize
): THREE.Group {
  const group = new THREE.Group()
  group.name = name
  const wood = lambert({ color: '#5a4630' })
  const postH = bottom + height + SIGN_SINK
  for (const side of [-1, 1]) {
    const mesh = new THREE.Mesh(
      new THREE.BoxGeometry(SIGN_POST, postH, SIGN_POST),
      wood
    )
    mesh.position.set(
      side * postX,
      postH / 2 - SIGN_SINK,
      -SIGN_POST / 2 - 0.02
    )
    group.add(mesh)
  }
  const texture = artTexture(art)
  const face = lambert({
    map: texture,
    emissive: new THREE.Color('#ffffff'),
    emissiveMap: texture,
    emissiveIntensity: 0.45,
  })
  const back = lambert({ color: '#8a7552' })
  // BoxGeometry face order is +x, -x, +y, -y, +z, -z.
  const board = new THREE.Mesh(new THREE.BoxGeometry(width, height, 0.04), [
    back,
    back,
    back,
    back,
    face,
    back,
  ])
  board.position.y = bottom + height / 2
  group.add(board)
  mergeStatic(group)
  return group
}

// The portal at the maze's heart: a standing ring of pale green light
// round a slow spiral, a halo over it all, the ring breathing. It faces
// +Z and -Z alike; origin at ground level under the middle. Walk into it
// and it puts you back at the gate (loop.ts, maze.ts inPortal).
const PORTAL = {
  radius: 1.2,
  tube: 0.1,
  centre: 1.45,
  color: '#7cf7d4',
  glowScale: 6,
  spin: 0.9,
}

export interface PortalRig {
  group: THREE.Group
  update(t: number): void
}

export function buildPortal(): PortalRig {
  const group = new THREE.Group()
  group.name = 'portal'
  const { radius, tube, centre, color, glowScale, spin } = PORTAL
  const ringMaterial = applyPS1(new THREE.MeshBasicMaterial({ color }))
  const ring = new THREE.Mesh(
    new THREE.TorusGeometry(radius, tube, 6, 24),
    ringMaterial
  )
  ring.position.y = centre
  group.add(ring)
  const swirl = new THREE.Mesh(
    new THREE.CircleGeometry(radius - tube / 2, 24),
    applyPS1(
      new THREE.MeshBasicMaterial({
        map: artTexture(paintPortalSwirl()),
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        transparent: true,
        side: THREE.DoubleSide,
      })
    )
  )
  swirl.position.y = centre
  group.add(swirl)
  const halo = makeGlowSprite(
    makeGlowTexture('rgba(124, 247, 212, 0.55)'),
    glowScale
  )
  halo.position.y = centre
  group.add(halo)
  const base = new THREE.Color(color)
  return {
    group,
    update(t) {
      swirl.rotation.z = -t * spin
      const breath = 0.75 + 0.25 * Math.sin(t * 2.1)
      ringMaterial.color.copy(base).multiplyScalar(breath)
      halo.material.opacity = 0.6 + 0.4 * breath
    },
  }
}
