import * as THREE from 'three'
import { lambert } from './assetkit.ts'
import { context2d } from './canvas.ts'
import { CONFIG } from './config.ts'
import {
  boothWalls,
  carSpots,
  DRIVE_IN,
  driveInPlace,
  driveInToWorld,
  PROJECTOR_AT,
  speakerPosts,
} from './drivein.ts'
import {
  buildBurntCar,
  buildDriveInBooth,
  buildDriveInScreen,
  buildProjector,
  buildSpeakerPost,
} from './driveinmodel.ts'
import { buildPayphone } from './payphonemodel.ts'
import { mulberry32 } from './rng.ts'
import { MUD_LIFT } from './worldsurfaces.ts'
import type { PortalPhone } from './citgos.ts'
import type { Ground } from './ground.ts'
import type { HeightAt, Vec3, XZ } from './interfaces.ts'
import type { MazePlace } from './maze.ts'
import type { Walls } from './walls.ts'

// The drive-in stood on the ground past the corn maze's far end
// (drivein.ts lays it out, driveinmodel.ts draws its pieces): the gravel
// lot draped on the terrain and registered on the Ground, the screen, the
// booth on a floor of its own with the projector inside, the portal phone
// beside it, the burnt-out cars and the speaker posts, each walled where it
// blocks. driveinrig.ts
// runs the film on it.

export interface DriveInSite {
  group: THREE.Group
  // The film is drawn on this, and the beam shows while one plays.
  picture: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>
  beam: THREE.Mesh
  // The projector's reels, which turn while a film plays.
  reels: THREE.Object3D[]
  // Where the projector stands, for E (interactions.ts), and the middle
  // of the screen's face, where the sound comes from.
  projector: XZ
  screen: Vec3
  // The portal phone beside the booth (CONFIG.portal.phones.driveIn).
  phone: PortalPhone
}

// The gravel the lot is spread with, a texture this many metres across.
const GRAVEL_METRES = 8
// The lot's sheet is draped every this many metres.
const SHEET_STEP = 2

// Three yaw that turns a model's +Z to drive-in-local direction (dx, dz).
function yawToward(maze: MazePlace, from: XZ, dx: number, dz: number): number {
  const a = driveInToWorld(maze, from)
  const b = driveInToWorld(maze, { x: from.x + dx, z: from.z + dz })
  return Math.atan2(b.x - a.x, b.z - a.z)
}

export function buildDriveIn(
  maze: MazePlace,
  terrain: HeightAt,
  ground: Ground,
  walls: Walls
): DriveInSite {
  const group = new THREE.Group()
  group.name = 'drive-in'
  const place = driveInPlace(maze)
  const cos = Math.cos(place.yaw)
  const sin = Math.sin(place.yaw)
  const { half } = CONFIG.driveIn
  const world = (p: XZ) => driveInToWorld(maze, p)

  // The lot: gravel draped on the terrain, a patch on the Ground. A
  // patch runs `along` its (cos, sin) axis, which is drive-in-local x.
  ground.addPatch(place.x, place.z, cos, sin, -half.x, half.x, half.z, MUD_LIFT)
  group.add(buildLot(maze, terrain))

  // The screen at the far end, facing back down the lot, its legs walled.
  const screen = buildDriveInScreen()
  const screenAt = world({ x: 0, z: DRIVE_IN.screen.z })
  screen.group.position.set(
    screenAt.x,
    ground.at(screenAt.x, screenAt.z),
    screenAt.z
  )
  screen.group.rotation.y = yawToward(
    maze,
    { x: 0, z: DRIVE_IN.screen.z },
    0,
    -1
  )
  group.add(screen.group)
  for (const x of [-DRIVE_IN.screen.legs, DRIVE_IN.screen.legs]) {
    const leg = world({ x, z: DRIVE_IN.screen.z + 0.6 })
    walls.addWall(leg, leg, DRIVE_IN.screen.legHalf * 2)
  }

  // The booth at the near end, on a slab as high as the highest ground
  // under it, a skirt of block down to the lowest, its port to the screen.
  const { booth: b } = DRIVE_IN
  const corners = [
    [-b.width / 2, b.z - b.depth / 2],
    [b.width / 2, b.z - b.depth / 2],
    [b.width / 2, b.z + b.depth / 2],
    [-b.width / 2, b.z + b.depth / 2],
    [0, b.z],
  ].map(([x, z]) => {
    const p = world({ x, z })
    return ground.at(p.x, p.z)
  })
  const low = Math.min(...corners)
  const base = Math.max(...corners)
  const booth = buildDriveInBooth()
  const boothAt = world({ x: 0, z: b.z })
  booth.group.position.set(boothAt.x, base, boothAt.z)
  booth.group.rotation.y = yawToward(maze, { x: 0, z: b.z }, 0, 1)
  group.add(booth.group)
  if (base - low > 0.05) {
    const skirt = new THREE.Mesh(
      new THREE.BoxGeometry(b.width + 0.2, base - low + 0.3, b.depth + 0.2),
      lambert({ color: '#6e695e' })
    )
    skirt.position.y = -(base - low + 0.3) / 2
    booth.group.add(skirt)
  }
  const slab = base + 0.12
  ground.addFloor(
    boothAt.x,
    boothAt.z,
    cos,
    sin,
    -b.width / 2,
    b.width / 2,
    b.depth / 2,
    slab
  )
  for (const w of boothWalls()) walls.addWall(world(w.a), world(w.b), w.half)

  // The projector inside, on the slab, its lens to the port.
  const projector = buildProjector()
  const projectorAt = world(PROJECTOR_AT)
  projector.group.position.set(projectorAt.x, slab, projectorAt.z)
  projector.group.rotation.y = booth.group.rotation.y
  group.add(projector.group)
  walls.addWall(projectorAt, projectorAt, 0.4)

  // The portal phone beside the booth, its face across the lot
  // (drive-in-local +x), on the gravel.
  const { phones } = CONFIG.portal
  const phoneAt = world(phones.driveIn)
  const across = world({ x: phones.driveIn.x + 1, z: phones.driveIn.z })
  const phoneYaw = Math.atan2(across.z - phoneAt.z, across.x - phoneAt.x)
  const phone = buildPayphone()
  phone.position.set(phoneAt.x, ground.at(phoneAt.x, phoneAt.z), phoneAt.z)
  phone.rotation.y = -phoneYaw
  group.add(phone)
  walls.addWall(phoneAt, phoneAt, phones.radius)

  // The burnt-out cars, each nosed at the screen and walled down its
  // length, and the speaker posts between them.
  for (const car of carSpots()) {
    const model = buildBurntCar(car.kind, car.seed)
    const at = world(car)
    model.position.set(at.x, ground.at(at.x, at.z), at.z)
    const dx = Math.sin(car.yaw)
    const dz = Math.cos(car.yaw)
    model.rotation.y = yawToward(maze, car, dx, dz)
    group.add(model)
    const reach = DRIVE_IN.carHalf
    walls.addWall(
      world({ x: car.x - dx * reach, z: car.z - dz * reach }),
      world({ x: car.x + dx * reach, z: car.z + dz * reach }),
      DRIVE_IN.carRadius
    )
  }
  const rng = mulberry32(DRIVE_IN.seed ^ 0x5eaf)
  for (const post of speakerPosts()) {
    const model = buildSpeakerPost(Math.floor(rng() * 0xffff))
    const at = world(post)
    model.position.set(at.x, ground.at(at.x, at.z), at.z)
    model.rotation.y = yawToward(maze, post, 0, 1)
    group.add(model)
    walls.addWall(at, at, 0.12, undefined, true)
  }

  // The beam from the lens to the picture's corners, faint, seen only in
  // the fog and only while a film plays.
  group.updateMatrixWorld(true)
  const apex = projector.lens.getWorldPosition(new THREE.Vector3())
  const { width, height } = DRIVE_IN.screen
  const corner = (x: number, y: number) =>
    screen.picture.localToWorld(new THREE.Vector3(x, y, 0))
  const beam = buildBeam(apex, [
    corner(-width / 2, -height / 2),
    corner(width / 2, -height / 2),
    corner(width / 2, height / 2),
    corner(-width / 2, height / 2),
  ])
  beam.visible = false
  group.add(beam)

  const middle = screen.picture.getWorldPosition(new THREE.Vector3())
  return {
    group,
    picture: screen.picture,
    beam,
    reels: projector.reels,
    projector: projectorAt,
    screen: [middle.x, middle.y, middle.z],
    phone: { x: phoneAt.x, z: phoneAt.z, yaw: phoneYaw, site: 'drive-in' },
  }
}

// The lot's gravel, a sheet over it draped every SHEET_STEP metres a
// little over the terrain, as the patch the Ground registers it.
function buildLot(maze: MazePlace, terrain: HeightAt): THREE.Mesh {
  const { half } = CONFIG.driveIn
  const nx = Math.ceil((half.x * 2) / SHEET_STEP)
  const nz = Math.ceil((half.z * 2) / SHEET_STEP)
  const positions: number[] = []
  const uvs: number[] = []
  const index: number[] = []
  for (let j = 0; j <= nz; j++) {
    for (let i = 0; i <= nx; i++) {
      const x = -half.x + (i / nx) * half.x * 2
      const z = -half.z + (j / nz) * half.z * 2
      const p = driveInToWorld(maze, { x, z })
      positions.push(p.x, terrain(p.x, p.z) + MUD_LIFT, p.z)
      uvs.push(x / GRAVEL_METRES, z / GRAVEL_METRES)
      if (i > 0 && j > 0) {
        const k = j * (nx + 1) + i
        const a = k - nx - 2
        const c = k - nx - 1
        index.push(a, k - 1, c, c, k - 1, k)
      }
    }
  }
  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute(
    'position',
    new THREE.Float32BufferAttribute(positions, 3)
  )
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2))
  geometry.setIndex(index)
  geometry.computeVertexNormals()
  const lot = new THREE.Mesh(geometry, lambert({ map: gravelTexture() }))
  lot.name = 'drive-in-lot'
  lot.receiveShadow = true
  return lot
}

// Grey-brown gravel with weeds through it, tiled.
function gravelTexture(): THREE.CanvasTexture {
  const size = 64
  const canvas = document.createElement('canvas')
  canvas.width = size
  canvas.height = size
  const ctx = context2d(canvas)
  ctx.fillStyle = '#4d4840'
  ctx.fillRect(0, 0, size, size)
  const rng = mulberry32(0x9a7e1)
  const stones = ['#5f5950', '#3c3832', '#6b655b', '#2f2c28']
  for (let i = 0; i < 700; i++) {
    ctx.fillStyle = stones[Math.floor(rng() * stones.length)]
    ctx.fillRect(Math.floor(rng() * size), Math.floor(rng() * size), 1, 1)
  }
  ctx.fillStyle = '#3d4a2c'
  for (let i = 0; i < 40; i++) {
    ctx.fillRect(Math.floor(rng() * size), Math.floor(rng() * size), 1, 2)
  }
  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  texture.wrapS = THREE.RepeatWrapping
  texture.wrapT = THREE.RepeatWrapping
  texture.magFilter = THREE.NearestFilter
  texture.minFilter = THREE.NearestFilter
  texture.generateMipmaps = false
  return texture
}

// A four-sided pyramid of faint light from `apex` to `corners`, open at
// the wide end.
function buildBeam(apex: THREE.Vector3, corners: THREE.Vector3[]): THREE.Mesh {
  const positions: number[] = []
  for (let i = 0; i < corners.length; i++) {
    const a = corners[i]
    const b = corners[(i + 1) % corners.length]
    positions.push(apex.x, apex.y, apex.z, a.x, a.y, a.z, b.x, b.y, b.z)
  }
  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute(
    'position',
    new THREE.Float32BufferAttribute(positions, 3)
  )
  const beam = new THREE.Mesh(
    geometry,
    new THREE.MeshBasicMaterial({
      color: '#bcd2ff',
      transparent: true,
      opacity: 0.07,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.DoubleSide,
    })
  )
  beam.name = 'projector-beam'
  return beam
}
