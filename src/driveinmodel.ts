import * as THREE from 'three'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'
import {
  lambert,
  makeGlowSprite,
  makeGlowTexture,
  mergeStatic,
} from './assetkit.ts'
import { DRIVE_IN } from './drivein.ts'
import { applyPS1 } from './ps1.ts'
import { mulberry32, pick, range } from './rng.ts'
import type { CarKind } from './drivein.ts'

// The drive-in's pieces past the corn maze's far end (drivein.ts lays
// them out, driveinsite.ts stands them on the lot): the screen on its
// steel, the cinder-block booth and its projector, a burnt-out car in
// any of four shapes, a speaker post, and the weeds through the gravel. Each faces +Z with its origin
// on the ground under its middle.

type Box = [number, number, number]

function boxIn(
  parent: THREE.Object3D,
  size: Box,
  at: Box,
  material: THREE.Material,
  turn: Box = [0, 0, 0]
): THREE.Mesh {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(...size), material)
  mesh.position.set(...at)
  mesh.rotation.set(...turn)
  parent.add(mesh)
  return mesh
}

// --- The screen ------------------------------------------------------------

export interface DriveInScreen {
  group: THREE.Group
  // The picture: a plane over the screen's face, facing +Z, that the
  // projector's film is drawn on (driveinrig.ts sets its map). Blank,
  // it shows the screen's own weathered white, barely lit.
  picture: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>
}

// The colour the blank screen shows with no film on it, and the white a
// film is drawn through.
export const SCREEN_BLANK = '#6f6c66'
export const SCREEN_LIT = '#ffffff'

// The screen: a wall of weathered boards on two steel legs, braced behind
// with a lattice of angle iron, its foot DRIVE_IN.screen.lift off the
// grass. Faces +Z.
export function buildDriveInScreen(): DriveInScreen {
  const { width, height, lift, legs, legHalf } = DRIVE_IN.screen
  const group = new THREE.Group()
  group.name = 'drive-in-screen'
  const steel = lambert({ color: '#3a3733' })
  const rust = lambert({ color: '#5c3520' })
  const boards = lambert({ color: '#8d8a83' })
  const top = lift + height
  // The legs: two I-beams from the ground to over the screen's top.
  for (const x of [-legs, legs]) {
    boxIn(
      group,
      [legHalf * 2, top + 0.6, legHalf],
      [x, (top + 0.6) / 2, -0.6],
      steel
    )
    boxIn(
      group,
      [legHalf * 0.5, top + 0.6, legHalf * 2.4],
      [x, (top + 0.6) / 2, -0.6],
      steel
    )
    // A footing of poured concrete.
    boxIn(group, [1.1, 0.4, 1.1], [x, 0.2, -0.6], lambert({ color: '#6c6862' }))
  }
  // The braces behind: rails across, and diagonals between them.
  const rails = 4
  for (let i = 0; i <= rails; i++) {
    const y = lift + (height * i) / rails
    boxIn(group, [width, 0.12, 0.12], [0, y, -0.45], i % 2 ? rust : steel)
  }
  for (let i = 0; i < rails; i++) {
    const y0 = lift + (height * i) / rails
    const rise = height / rails
    for (const side of [-1, 1]) {
      const run = width / 2
      const len = Math.hypot(run, rise)
      boxIn(
        group,
        [len, 0.08, 0.08],
        [(side * run) / 2, y0 + rise / 2, -0.5],
        steel,
        [0, 0, side * Math.atan2(rise, run) * (i % 2 ? -1 : 1)]
      )
    }
  }
  // The face: boards, a frame round them, and a catwalk under it.
  boxIn(group, [width, height, 0.12], [0, lift + height / 2, -0.25], boards)
  for (const y of [lift - 0.12, top + 0.12]) {
    boxIn(group, [width + 0.4, 0.24, 0.3], [0, y, -0.2], steel)
  }
  for (const x of [-width / 2 - 0.1, width / 2 + 0.1]) {
    boxIn(
      group,
      [0.24, height + 0.48, 0.3],
      [x, lift + height / 2, -0.2],
      steel
    )
  }
  boxIn(group, [width * 0.6, 0.06, 0.7], [0, lift - 0.5, -0.1], rust)
  mergeStatic(group)
  // The picture, a hair proud of the boards.
  const picture = new THREE.Mesh(
    new THREE.PlaneGeometry(width, height),
    applyPS1(
      new THREE.MeshBasicMaterial({ color: SCREEN_BLANK, toneMapped: false })
    )
  )
  picture.name = 'drive-in-picture'
  picture.position.set(0, lift + height / 2, -0.17)
  group.add(picture)
  return { group, picture }
}

// --- The booth -------------------------------------------------------------

export interface DriveInBooth {
  group: THREE.Group
  // The bare bulb over the projector, and its halo.
  bulb: THREE.Sprite
}

// The projection booth: a squat cinder-block hut under a flat tar roof,
// its door (no door left in it) in the back wall, a port in the front wall
// for the beam, a bare bulb inside, and nothing else: the room is empty
// but for the projector (driveinsite.ts stands it there). Faces +Z (the port); sized by
// DRIVE_IN.booth.
export function buildDriveInBooth(): DriveInBooth {
  const { width, depth, height, wallHalf, door } = DRIVE_IN.booth
  const group = new THREE.Group()
  group.name = 'drive-in-booth'
  const block = lambert({ color: '#8b8679' })
  const blockDark = lambert({ color: '#6e695e' })
  const tar = lambert({ color: '#25231f' })
  const floor = lambert({ color: '#57534b' })
  const t = wallHalf * 2
  const hx = width / 2
  const hz = depth / 2
  // The slab, the side walls and the front wall but its port.
  boxIn(group, [width + 0.2, 0.12, depth + 0.2], [0, 0.06, 0], floor)
  for (const x of [-hx, hx]) {
    boxIn(group, [t, height, depth], [x, height / 2, 0], block)
  }
  const port = { w: 0.9, h: 0.6, y: 1.7 }
  const side = (width - port.w) / 2
  for (const s of [-1, 1]) {
    boxIn(
      group,
      [side, height, t],
      [s * (port.w / 2 + side / 2), height / 2, hz],
      block
    )
  }
  boxIn(
    group,
    [port.w, port.y - port.h / 2, t],
    [0, (port.y - port.h / 2) / 2, hz],
    block
  )
  const over = height - (port.y + port.h / 2)
  boxIn(group, [port.w, over, t], [0, height - over / 2, hz], block)
  // The back wall either side of the doorway, and the lintel over it.
  const jamb = (width - door) / 2
  for (const s of [-1, 1]) {
    boxIn(
      group,
      [jamb, height, t],
      [s * (door / 2 + jamb / 2), height / 2, -hz],
      block
    )
  }
  boxIn(group, [door, 0.6, t], [0, height - 0.3, -hz], blockDark)
  // Courses of darker block on the outside faces only, so nothing crosses
  // the empty room, broken at the door and the port; smoke up the front
  // from an old fire; and the roof, lapping the walls, its tar paper
  // curling at the edge.
  const course = 0.05
  const skin = wallHalf + 0.01
  for (let y = 0.4; y < height; y += 0.8) {
    for (const x of [-hx - skin, hx + skin]) {
      boxIn(group, [0.02, course, depth + 0.02], [x, y, 0], blockDark)
    }
    const inPort = Math.abs(y - port.y) < port.h / 2 + course
    const inDoor = y < height - 0.6 + course
    for (const [z, gap] of [
      [hz + skin, inPort ? port.w : 0],
      [-hz - skin, inDoor ? door : 0],
    ]) {
      const run = (width - gap) / 2
      for (const s of gap ? [-1, 1] : [0]) {
        boxIn(
          group,
          [gap ? run : width + 0.02, course, 0.02],
          [s * (gap / 2 + run / 2), y, z],
          blockDark
        )
      }
    }
  }
  boxIn(
    group,
    [port.w + 0.8, 1.1, 0.02],
    [0, port.y + 0.7, hz + wallHalf + 0.01],
    lambert({ color: '#2a2724' })
  )
  boxIn(group, [width + 0.6, 0.18, depth + 0.6], [0, height + 0.09, 0], tar)
  boxIn(
    group,
    [width * 0.4, 0.04, 0.5],
    [hx * 0.4, height + 0.2, -hz],
    tar,
    [0.35, 0, 0]
  )
  mergeStatic(group)
  // The bare bulb on its cord.
  boxIn(group, [0.01, 0.5, 0.01], [0, height - 0.25, -0.3], tar)
  const glass = new THREE.Mesh(
    new THREE.SphereGeometry(0.06, 6, 4),
    lambert({ color: '#fff3c4', emissive: new THREE.Color('#d9b86a') })
  )
  glass.position.set(0, height - 0.55, -0.3)
  group.add(glass)
  const bulb = makeGlowSprite(makeGlowTexture('rgba(255, 214, 140, 0.55)'), 2.2)
  bulb.position.copy(glass.position)
  group.add(bulb)
  return { group, bulb }
}

// --- The projector ---------------------------------------------------------

export interface Projector {
  group: THREE.Group
  // The feed and take-up reels, which turn while a film plays (about
  // their own x axis), and the lens's mouth, the beam's apex.
  reels: THREE.Object3D[]
  lens: THREE.Object3D
}

// A 35mm carbon-arc projector on its pedestal: the lamp house behind, the
// head with its lens out front (+Z), a reel on an arm over each end.
export function buildProjector(): Projector {
  const group = new THREE.Group()
  group.name = 'projector'
  const enamel = lambert({ color: '#4b5048' })
  const black = lambert({ color: '#161616' })
  const chrome = lambert({ color: '#9ea2a3' })
  const reelMetal = lambert({ color: '#8a8c88' })
  // The pedestal, splayed at its foot.
  boxIn(group, [0.7, 0.08, 0.9], [0, 0.04, 0], black)
  boxIn(group, [0.3, 1.0, 0.36], [0, 0.55, 0], enamel)
  // The lamp house behind, with its chimney, and the head ahead of it.
  boxIn(group, [0.42, 0.5, 0.6], [0, 1.3, -0.3], enamel)
  boxIn(group, [0.12, 0.3, 0.12], [0, 1.7, -0.4], black)
  for (let i = 0; i < 4; i++) {
    boxIn(group, [0.43, 0.03, 0.04], [0, 1.18 + i * 0.07, -0.05], black)
  }
  boxIn(group, [0.3, 0.42, 0.4], [0, 1.28, 0.18], enamel)
  // The lens barrel out the front.
  const barrel = new THREE.Mesh(
    new THREE.CylinderGeometry(0.06, 0.07, 0.28, 10),
    chrome
  )
  barrel.rotation.x = Math.PI / 2
  barrel.position.set(0, 1.3, 0.52)
  group.add(barrel)
  const lens = new THREE.Object3D()
  lens.position.set(0, 1.3, 0.67)
  group.add(lens)
  // The reel arms, and the reels on them, open-spoked.
  const reels: THREE.Object3D[] = []
  for (const [z, y] of [
    [0.32, 1.95],
    [-0.15, 0.95],
  ] as const) {
    boxIn(
      group,
      [0.04, Math.abs(y - 1.3) + 0.1, 0.04],
      [0.17, (y + 1.3) / 2, z],
      black
    )
    const reel = new THREE.Group()
    reel.position.set(0.2, y, z)
    for (const x of [-0.04, 0.04]) {
      const flange = new THREE.Mesh(
        new THREE.CylinderGeometry(0.32, 0.32, 0.01, 14),
        reelMetal
      )
      flange.rotation.z = Math.PI / 2
      flange.position.x = x
      reel.add(flange)
    }
    const film = new THREE.Mesh(
      new THREE.CylinderGeometry(0.22, 0.22, 0.07, 14),
      black
    )
    film.rotation.z = Math.PI / 2
    reel.add(film)
    for (let i = 0; i < 3; i++) {
      boxIn(reel, [0.1, 0.58, 0.04], [0, 0, 0], chrome, [
        (i * Math.PI) / 3,
        0,
        0,
      ])
    }
    group.add(reel)
    reels.push(reel)
  }
  return { group, reels, lens }
}

// --- A burnt-out car -----------------------------------------------------

// The shapes, each as a car's length, width, how high its waist and roof
// stand, and where its cabin starts and ends along it (from its middle,
// +Z the nose). A pickup's bed runs behind its cabin, open.
const SHAPES: Record<
  CarKind,
  {
    length: number
    width: number
    waist: number
    roof: number
    cabin: [number, number]
    bed?: boolean
  }
> = {
  sedan: {
    length: 4.7,
    width: 1.8,
    waist: 0.85,
    roof: 1.35,
    cabin: [-1.1, 0.7],
  },
  wagon: {
    length: 4.9,
    width: 1.85,
    waist: 0.85,
    roof: 1.4,
    cabin: [-2.1, 0.7],
  },
  pickup: {
    length: 5.1,
    width: 1.9,
    waist: 0.95,
    roof: 1.6,
    cabin: [-0.2, 1.0],
    bed: true,
  },
  coupe: {
    length: 4.5,
    width: 1.75,
    waist: 0.75,
    roof: 1.2,
    cabin: [-0.8, 0.5],
  },
}

// The char, the rust coming through it, and the ash left inside, each car
// drawn from these.
const CHAR = ['#1f1c19', '#262220', '#2d2824']
const RUST = ['#5f331b', '#6e3c1f', '#7d4724', '#4f2c19']

// A car burned out where it was parked and left to the weather: no glass,
// no tyres, the paint gone to char and rust, sat down on its rims. Some
// have the hood sprung, the roof caved, a door fallen off beside them.
// Faces +Z; `seed` draws what is left.
export function buildBurntCar(kind: CarKind, seed = 1): THREE.Group {
  const rng = mulberry32(seed)
  const shape = SHAPES[kind]
  const { length, width, waist, roof, cabin } = shape
  const group = new THREE.Group()
  group.name = `burnt-${kind}`
  const char = lambert({ color: pick(rng, CHAR) })
  const rust = lambert({ color: pick(rng, RUST) })
  const rustDark = lambert({ color: '#3d2416' })
  const ash = lambert({ color: '#4a4641' })
  const black = lambert({ color: '#0f0e0d' })
  const rim = lambert({ color: '#3b3936' })
  const body = new THREE.Group()
  // Down on its rims, one corner lower where a hub gave way.
  const sill = 0.22
  body.rotation.set(range(rng, -0.03, 0.03), 0, range(rng, -0.05, 0.05))
  group.add(body)
  const hl = length / 2
  const hw = width / 2
  // The tub from the sill to the waist, in rust and char patches.
  const patches = 4
  for (let i = 0; i < patches; i++) {
    const z0 = -hl + (length * i) / patches
    boxIn(
      body,
      [width, waist - sill, length / patches + 0.01],
      [0, (sill + waist) / 2, z0 + length / patches / 2],
      rng() < 0.55 ? rust : char
    )
  }
  // The hood: shut, or sprung and standing open.
  const hoodLength = hl - cabin[1]
  const sprung = rng() < 0.35
  const hood = boxIn(
    body,
    [width - 0.05, 0.04, hoodLength],
    [0, waist + 0.02, cabin[1] + hoodLength / 2],
    rng() < 0.5 ? rust : char
  )
  if (sprung) {
    hood.position.set(
      0,
      waist + 0.02 + Math.sin(0.7) * hoodLength * 0.5,
      cabin[1] + Math.cos(0.7) * hoodLength * 0.5
    )
    hood.rotation.x = -0.7
    // The engine bay, burned to nothing but black.
    boxIn(
      body,
      [width - 0.2, 0.08, hoodLength - 0.2],
      [0, waist - 0.1, cabin[1] + hoodLength / 2],
      black
    )
  }
  // The cabin: pillars and a roof, the glass long gone, seat frames
  // inside. A caved roof sags at its middle.
  const cabinLength = cabin[1] - cabin[0]
  const caved = rng() < 0.3
  const roofY = caved ? roof - 0.12 : roof
  boxIn(
    body,
    [width - 0.14, 0.05, cabinLength - 0.4],
    [0, roofY, (cabin[0] + cabin[1]) / 2 - 0.05],
    char,
    [caved ? 0.05 : 0, 0, 0]
  )
  for (const x of [-1, 1]) {
    for (const z of [
      cabin[1] - 0.15,
      (cabin[0] + cabin[1]) / 2,
      cabin[0] + 0.12,
    ]) {
      if (cabinLength < 1.6 && z === (cabin[0] + cabin[1]) / 2) continue
      boxIn(
        body,
        [0.07, roof - waist, 0.08],
        [x * (hw - 0.08), (waist + roof) / 2, z],
        char
      )
    }
  }
  boxIn(
    body,
    [width - 0.3, 0.06, cabinLength - 0.3],
    [0, sill + 0.15, (cabin[0] + cabin[1]) / 2],
    ash
  )
  for (const z of [cabin[1] - 0.5, cabin[0] + 0.5]) {
    if (z < cabin[0] || z > cabin[1]) continue
    boxIn(
      body,
      [width - 0.5, 0.5, 0.06],
      [0, waist + 0.05, z - 0.2],
      rustDark,
      [-0.2, 0, 0]
    )
  }
  // A pickup's bed: its floor and its walls, open at the back.
  if (shape.bed) {
    const bedFront = cabin[0] - 0.05
    const bedLength = bedFront + hl
    boxIn(
      body,
      [width - 0.1, 0.05, bedLength],
      [0, waist - 0.25, bedFront - bedLength / 2],
      rustDark
    )
  }
  // The trunk lid, or the wagon's tailgate.
  if (!shape.bed && cabin[0] > -hl + 0.3) {
    const trunk = cabin[0] + hl
    boxIn(
      body,
      [width - 0.05, 0.04, trunk],
      [0, waist + 0.02, -hl + trunk / 2],
      rng() < 0.5 ? rust : char
    )
  }
  // The bumpers, gone to rust, one hanging at a slant.
  boxIn(body, [width + 0.04, 0.14, 0.1], [0, sill + 0.12, hl + 0.03], rustDark)
  boxIn(
    body,
    [width + 0.04, 0.14, 0.1],
    [0, sill + 0.06, -hl - 0.03],
    rustDark,
    [0, 0, range(rng, -0.2, 0.2)]
  )
  // Bare rims at the corners, sunk into the grass.
  const rimGeometry = new THREE.CylinderGeometry(0.22, 0.22, 0.14, 8)
  rimGeometry.rotateZ(Math.PI / 2)
  for (const x of [-hw + 0.1, hw - 0.1]) {
    for (const z of [hl - 0.85, -hl + 0.85]) {
      if (rng() < 0.12) continue
      const wheel = new THREE.Mesh(rimGeometry, rim)
      wheel.position.set(x, 0.17, z)
      group.add(wheel)
    }
  }
  // A door fallen off, lying in the grass beside it.
  if (rng() < 0.3) {
    const side = rng() < 0.5 ? -1 : 1
    boxIn(
      group,
      [1.1, 0.06, 0.9],
      [side * (hw + 0.8), 0.04, cabin[1] - 0.6],
      rng() < 0.5 ? rust : char,
      [0, range(rng, -0.6, 0.6), side * 0.08]
    )
  }
  mergeStatic(group)
  return group
}

// --- A speaker post --------------------------------------------------------

// A speaker post between two stalls: a pipe, a junction box at its top,
// and a speaker hung each side for the cars either way, one of them
// fallen and dangling on its cord.
export function buildSpeakerPost(seed = 1): THREE.Group {
  const rng = mulberry32(seed)
  const group = new THREE.Group()
  group.name = 'speaker-post'
  const pipe = lambert({ color: '#4a4844' })
  const speaker = lambert({ color: '#5d5a52' })
  const grille = lambert({ color: '#1a1918' })
  boxIn(group, [0.07, 1.25, 0.07], [0, 0.625, 0], pipe)
  boxIn(group, [0.18, 0.14, 0.12], [0, 1.28, 0], pipe)
  const fallen = rng() < 0.5 ? -1 : 1
  for (const side of [-1, 1]) {
    const down = side === fallen && rng() < 0.5
    const y = down ? 0.55 : 1.18
    boxIn(group, [0.12, 0.2, 0.22], [side * 0.15, y, 0], speaker, [
      0,
      0,
      down ? side * 0.4 : 0,
    ])
    boxIn(group, [0.01, 0.14, 0.16], [side * 0.215, y, 0], grille, [
      0,
      0,
      down ? side * 0.4 : 0,
    ])
  }
  mergeStatic(group)
  return group
}

// --- Weeds -----------------------------------------------------------------

// A tuft of weeds come up through the gravel: a few blades fanned out from
// one root, in a dry green, some gone to straw. One geometry for every tuft
// on the lot (driveinsite.ts instances it); stands on its root.
export function buildWeedTuft(seed = 1): THREE.Mesh {
  const rng = mulberry32(seed)
  const blades: THREE.BufferGeometry[] = []
  const greens = ['#4f5a2e', '#5d6634', '#6f6a3a', '#7d7046']
  const colour = new THREE.Color()
  const count = 10
  for (let i = 0; i < count; i++) {
    const tall = range(rng, 0.25, 0.6)
    const blade = new THREE.PlaneGeometry(0.07, tall)
    blade.translate(0, tall / 2, 0)
    blade.rotateX(range(rng, -0.7, 0.7))
    blade.rotateY((i / count) * Math.PI + range(rng, -0.2, 0.2))
    colour.set(pick(rng, greens))
    const colours: number[] = []
    for (let v = 0; v < blade.attributes.position.count; v++) {
      colours.push(colour.r, colour.g, colour.b)
    }
    blade.setAttribute('color', new THREE.Float32BufferAttribute(colours, 3))
    blades.push(blade)
  }
  const material = lambert({ vertexColors: true, side: THREE.DoubleSide })
  const tuft = new THREE.Mesh(mergeGeometries(blades), material)
  tuft.name = 'weed-tuft'
  return tuft
}
