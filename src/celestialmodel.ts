import * as THREE from 'three'
import {
  artTexture,
  isMesh,
  lambert,
  makeGlowSprite,
  makeGlowTexture,
  memo,
  mergeStatic,
} from './assetkit.ts'
import { canvas } from './canvas.ts'
import {
  angelOf,
  candelabraOf,
  facing,
  fenceOf,
  gatePiersOf,
  graveOf,
  shovelOf,
  STONE_RADIUS,
  stonesOf,
} from './celestialyard.ts'
import { CONFIG } from './config.ts'
import { buildFlames } from './fire.ts'
import { mulberry32, range } from './rng.ts'
import type { PickupOptions } from './assetkit.ts'
import type { GiantStone, StoneKind } from './celestialyard.ts'
import type { FlameSpot } from './fire.ts'
import type { Ground } from './ground.ts'
import type { XZ } from './interfaces.ts'
import type { MazePlace } from './maze.ts'
import type { Walls } from './walls.ts'

// The celestial graveyard as it stands (celestialyard.ts lays it out):
// the nephilim and the seraphim buried at four times a raider's size, and
// the gothic gone as far over the top as it goes. A spiked iron fence
// three storeys high round the precinct, its gate under a pointed stone
// arch between two piers with braziers burning on them; an avenue of iron
// candelabra taller than a house; monuments strewn everywhere, lancet
// headstones, Celtic crosses, obelisks, box tombs, broken columns and
// mourning angels with their wings folded, mossed and tear-streaked; and
// at the end of the avenue, on a stepped plinth, the weeping angel, her
// face in her hands and her wings raised behind her higher than the
// fence, white tears running down out of her fingers and a shaft of pale
// light falling on her out of the sky. Her grave lies at her feet,
// railed with a kerb of stone, and in a heap of earth by the gate stands
// the shovel (sharedworld.ts rule 42). Everything stands on the ground
// (world.ground.at); the monuments, the fence, the piers, the plinth and
// the candelabra are walls.

export interface CelestialRig {
  group: THREE.Group
  place: MazePlace
  // Where E takes the shovel, and where it digs.
  shovel: XZ
  grave: XZ
  // `t` seconds, for the flames.
  update(t: number): void
}

// --- Stone -----------------------------------------------------------------

// Weathered granite: grey mottled lighter and darker, lichen in patches,
// and dark streaks run down it where the rain (or the tears) went.
const graniteArt = memo((id) => {
  const dark = id === 'granite-dark'
  const art = canvas([64, 128], dark ? '#575853' : '#8d8c86')
  const { ctx, w, h } = art
  const rng = mulberry32(dark ? 0x9a71 : 0x9a70)
  for (let i = 0; i < 700; i++) {
    const shade = (dark ? 70 : 120) + Math.floor(rng() * 34)
    ctx.fillStyle = `rgb(${shade}, ${shade}, ${shade - 4})`
    ctx.fillRect(Math.floor(rng() * w), Math.floor(rng() * h), 2, 2)
  }
  for (let i = 0; i < 9; i++) {
    ctx.fillStyle = 'rgba(96, 116, 64, 0.35)'
    const x = Math.floor(rng() * w)
    const y = Math.floor(rng() * h)
    ctx.fillRect(x, y, 4 + Math.floor(rng() * 10), 3 + Math.floor(rng() * 6))
  }
  for (let i = 0; i < 14; i++) {
    ctx.fillStyle = 'rgba(30, 30, 34, 0.28)'
    const x = Math.floor(rng() * w)
    const y = Math.floor(rng() * h * 0.5)
    ctx.fillRect(x, y, 1 + Math.floor(rng() * 2), 20 + Math.floor(rng() * 60))
  }
  const texture = artTexture(art)
  texture.wrapS = THREE.RepeatWrapping
  texture.wrapT = THREE.RepeatWrapping
  return texture
})

interface Mats {
  stone: THREE.Material
  dark: THREE.Material
  iron: THREE.Material
  earth: THREE.Material
  wax: THREE.Material
  tears: THREE.Material
  marble: THREE.Material
}

const mats = memo((): Mats => ({
  stone: lambert({ map: graniteArt('granite') }),
  dark: lambert({ map: graniteArt('granite-dark') }),
  iron: lambert({ color: '#1d1b1f' }),
  earth: lambert({ color: '#3b2c20' }),
  wax: lambert({ color: '#efe6cf', emissive: '#3a3020' }),
  tears: lambert({
    color: '#e8f4ff',
    emissive: '#b8dcff',
    emissiveIntensity: 1,
  }),
  marble: lambert({
    color: '#e4e2da',
    emissive: '#4a4e5e',
    emissiveIntensity: 0.5,
  }),
}))

function box(
  material: THREE.Material,
  size: [number, number, number],
  at: [number, number, number]
): THREE.Mesh {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(...size), material)
  mesh.position.set(...at)
  return mesh
}

// A slab cut to a pointed (lancet) top: `w` across, `h` to the point, `d`
// thick, standing on y = 0 with its face toward +x.
function lancet(
  material: THREE.Material,
  w: number,
  h: number,
  d: number
): THREE.Mesh {
  const shape = new THREE.Shape()
  const shoulder = h - w * 0.8
  shape.moveTo(-w / 2, 0)
  shape.lineTo(w / 2, 0)
  shape.lineTo(w / 2, shoulder)
  shape.quadraticCurveTo(w / 2, shoulder + w * 0.55, 0, h)
  shape.quadraticCurveTo(-w / 2, shoulder + w * 0.55, -w / 2, shoulder)
  shape.closePath()
  const geometry = new THREE.ExtrudeGeometry(shape, {
    depth: d,
    bevelEnabled: false,
    curveSegments: 4,
  })
  geometry.translate(0, 0, -d / 2)
  geometry.rotateY(Math.PI / 2)
  return new THREE.Mesh(geometry, material)
}

// --- The angels ------------------------------------------------------------

// A wing of stone, its root at the origin, rising to `height` and
// reaching `span` back (-x), its lower edge scalloped into feathers, `d`
// thick, in the x-y plane.
function wingGeometry(
  span: number,
  height: number,
  d: number
): THREE.ExtrudeGeometry {
  const shape = new THREE.Shape()
  shape.moveTo(0, 0)
  shape.quadraticCurveTo(-span * 0.2, height * 0.9, -span * 0.55, height)
  shape.quadraticCurveTo(-span * 0.9, height * 0.95, -span, height * 0.7)
  // The long feathers down the trailing edge, then back in to the root.
  const feathers = 7
  for (let k = 1; k <= feathers; k++) {
    const t = k / feathers
    const x = -span * (1 - t * 0.85)
    const y = height * 0.7 * (1 - t) - height * 0.12 * Math.sin(t * Math.PI)
    const mid = -span * (1 - (t - 0.5 / feathers) * 0.85)
    shape.quadraticCurveTo(mid, y - height * 0.12, x, y + height * 0.04)
  }
  shape.lineTo(0, 0)
  const geometry = new THREE.ExtrudeGeometry(shape, {
    depth: d,
    bevelEnabled: false,
    curveSegments: 3,
  })
  geometry.translate(0, 0, -d / 2)
  return geometry
}

// An angel in stone, `tall` from her hem to the top of her head, her
// face toward +x and bowed into her hands, on the origin. `raised` wings
// go up behind her higher than she stands; folded ones lie close down her
// back. `weeping` runs her tears in light down out of her fingers.
function buildAngel(
  m: Mats,
  tall: number,
  raised: boolean,
  weeping: boolean
): THREE.Group {
  const group = new THREE.Group()
  const k = tall / 9
  // She is pale marble, lit in her shaft of light; the mourners granite.
  const stone = raised ? m.marble : m.stone
  const robe = new THREE.Mesh(
    new THREE.LatheGeometry(
      [
        [1.9, 0],
        [1.75, 0.4],
        [1.35, 2],
        [1.0, 4],
        [0.95, 4.6],
        [1.15, 5.6],
        [1.22, 6.3],
        [0.95, 6.75],
        [0.42, 7.0],
        [0, 7.05],
      ].map(([r, y]) => new THREE.Vector2(r * k, y * k)),
      12
    ),
    stone
  )
  group.add(robe)
  // Her head bowed toward +x, and the veil over it.
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.72 * k, 9, 7), stone)
  head.position.set(0.45 * k, 7.55 * k, 0)
  group.add(head)
  const veil = new THREE.Mesh(
    new THREE.SphereGeometry(
      0.82 * k,
      9,
      6,
      Math.PI / 2,
      Math.PI,
      0,
      Math.PI * 0.62
    ),
    stone
  )
  veil.position.set(0.3 * k, 7.65 * k, 0)
  veil.rotation.z = 0.35
  group.add(veil)
  // Her arms, shoulder to elbow out front, elbow up to the hands over her
  // face.
  for (const side of [-1, 1]) {
    const shoulder = new THREE.Vector3(0.2 * k, 6.35 * k, side * 1.1 * k)
    const elbow = new THREE.Vector3(1.15 * k, 5.7 * k, side * 0.85 * k)
    const hand = new THREE.Vector3(1.05 * k, 7.45 * k, side * 0.32 * k)
    for (const [a, b] of [
      [shoulder, elbow],
      [elbow, hand],
    ]) {
      const arm = new THREE.Mesh(
        new THREE.CylinderGeometry(0.3 * k, 0.36 * k, a.distanceTo(b), 7),
        stone
      )
      arm.position.copy(a).add(b).multiplyScalar(0.5)
      arm.quaternion.setFromUnitVectors(
        new THREE.Vector3(0, 1, 0),
        b.clone().sub(a).normalize()
      )
      group.add(arm)
    }
    const palm = box(
      stone,
      [0.25 * k, 0.95 * k, 0.55 * k],
      [hand.x + 0.05 * k, hand.y + 0.15 * k, hand.z]
    )
    palm.rotation.z = -0.25
    group.add(palm)
    if (weeping) {
      // Down from between her fingers, over her wrists and the robe's
      // front to the hem.
      const tear = box(
        m.tears,
        [0.05 * k, 6.6 * k, 0.07 * k],
        [1.2 * k, 3.9 * k, side * 0.42 * k]
      )
      tear.rotation.z = 0.12
      group.add(tear)
    }
  }
  // Her wings from her shoulder blades.
  for (const side of [-1, 1]) {
    const geometry = raised
      ? wingGeometry(7 * k, 10.5 * k, 0.32 * k)
      : wingGeometry(2.2 * k, 6.2 * k, 0.28 * k)
    const w = new THREE.Mesh(geometry, stone)
    w.position.set(-0.75 * k, raised ? 5.6 * k : 1.2 * k, side * 0.55 * k)
    // Out from her back, swept a little open.
    w.rotation.y = side * (raised ? 1.05 : 0.18)
    if (!raised) w.rotation.z = -0.08
    group.add(w)
  }
  return group
}

// How tall the weeping angel stands on her plinth, hem to crown: twice
// the mourners, her wings higher still.
const ANGEL_TALL = 14

// --- The monuments ---------------------------------------------------------

function buildMonument(
  m: Mats,
  kind: StoneKind,
  rng: () => number
): THREE.Group {
  const group = new THREE.Group()
  const stone = rng() < 0.6 ? m.stone : m.dark
  switch (kind) {
    case 'slab': {
      group.add(box(stone, [1.8, 0.8, 4.4], [0, 0.4, 0]))
      const face = lancet(stone, 3.4, range(rng, 5.2, 7), 0.7)
      face.position.y = 0.8
      group.add(face)
      // A cross in relief on its face.
      group.add(box(m.dark, [0.15, 2.4, 0.35], [0.42, 3.6, 0]))
      group.add(box(m.dark, [0.15, 0.35, 1.5], [0.42, 4.1, 0]))
      break
    }
    case 'cross': {
      const tall = range(rng, 7, 9.5)
      group.add(box(stone, [2.4, 1, 2.4], [0, 0.5, 0]))
      group.add(box(stone, [1.7, 0.8, 1.7], [0, 1.4, 0]))
      group.add(box(stone, [0.7, tall, 0.85], [0, 1.8 + tall / 2, 0]))
      const at = 1.8 + tall * 0.74
      group.add(box(stone, [0.7, 0.85, 4.4], [0, at, 0]))
      const ring = new THREE.Mesh(
        new THREE.TorusGeometry(1.3, 0.2, 5, 16),
        stone
      )
      ring.rotation.y = Math.PI / 2
      ring.position.y = at
      group.add(ring)
      break
    }
    case 'obelisk': {
      const tall = range(rng, 11, 16)
      group.add(box(stone, [3.4, 1.2, 3.4], [0, 0.6, 0]))
      group.add(box(stone, [2.6, 1.6, 2.6], [0, 2, 0]))
      const shaft = new THREE.Mesh(
        new THREE.CylinderGeometry(0.75, 1.15, tall, 4),
        stone
      )
      shaft.rotation.y = Math.PI / 4
      shaft.position.y = 2.8 + tall / 2
      group.add(shaft)
      const cap = new THREE.Mesh(new THREE.ConeGeometry(0.75, 1.4, 4), stone)
      cap.rotation.y = Math.PI / 4
      cap.position.y = 2.8 + tall + 0.7
      group.add(cap)
      break
    }
    case 'mourner': {
      group.add(box(stone, [3, 2.6, 3], [0, 1.3, 0]))
      group.add(box(stone, [3.4, 0.4, 3.4], [0, 2.8, 0]))
      const angel = buildAngel(m, range(rng, 5.5, 7), false, false)
      angel.position.y = 3
      group.add(angel)
      break
    }
    case 'tomb': {
      const long = range(rng, 7, 9)
      group.add(box(stone, [3.2, 2.4, long], [0, 1.2, 0]))
      group.add(box(stone, [3.8, 0.45, long + 0.6], [0, 2.6, 0]))
      // A gabled lid along its length.
      const prism = new THREE.CylinderGeometry(1.9, 1.9, long + 0.4, 3)
      // Its ridge up, along z, and low.
      prism.rotateY(Math.PI)
      prism.rotateX(Math.PI / 2)
      prism.scale(1, 0.45, 1)
      const lid = new THREE.Mesh(prism, m.dark)
      lid.position.y = 3.25
      group.add(lid)
      // Arcading down the sides.
      for (let z = -long / 2 + 1; z < long / 2 - 0.5; z += 1.6) {
        group.add(box(m.dark, [3.3, 1.6, 0.2], [0, 1.2, z]))
      }
      break
    }
    case 'column': {
      const tall = range(rng, 6, 10)
      group.add(box(stone, [2.6, 1.4, 2.6], [0, 0.7, 0]))
      const shaft = new THREE.CylinderGeometry(0.8, 0.85, tall, 9, 1)
      // Broken off at the top, ragged.
      const pos = shaft.getAttribute('position')
      for (let i = 0; i < pos.count; i++) {
        if (pos.getY(i) > tall / 2 - 1e-3) {
          pos.setY(i, tall / 2 - range(rng, 0, 1.6))
        }
      }
      shaft.computeVertexNormals()
      const column = new THREE.Mesh(shaft, stone)
      column.position.y = 1.4 + tall / 2
      group.add(column)
      // A shroud of stone hung over the break.
      const shroud = new THREE.Mesh(
        new THREE.ConeGeometry(1.05, 2.4, 9, 1, true),
        m.dark
      )
      shroud.position.y = 1.4 + tall - 1.8
      shroud.rotation.z = 0.15
      group.add(shroud)
      break
    }
  }
  return group
}

// --- Iron ------------------------------------------------------------------

// The fence three storeys high: a post every run, its bars between, each
// bar a spear, a rail low and high, and a finial on every post.
const FENCE = { tall: 6.2, bar: 1.1, rails: [0.6, 5.4] }

function buildFence(
  m: Mats,
  place: MazePlace,
  ground: Ground,
  walls: Walls
): THREE.Group {
  const group = new THREE.Group()
  group.name = 'celestial-fence'
  const runs = fenceOf(place)
  const bars: THREE.Matrix4[] = []
  const tips: THREE.Matrix4[] = []
  const rails: THREE.Matrix4[] = []
  const posts: THREE.Matrix4[] = []
  const q = new THREE.Quaternion()
  const up = new THREE.Vector3(0, 1, 0)
  for (const [i, { a, b }] of runs.entries()) {
    walls.addWall(a, b, 0.25)
    const length = Math.hypot(b.x - a.x, b.z - a.z)
    const turn = Math.atan2(-(b.z - a.z), b.x - a.x)
    const count = Math.max(1, Math.round(length / FENCE.bar))
    for (let k = 0; k <= count; k++) {
      const t = k / count
      const x = a.x + (b.x - a.x) * t
      const z = a.z + (b.z - a.z) * t
      const y = ground.at(x, z)
      const isPost = k === 0 || (k === count && i === runs.length - 1)
      if (isPost) {
        posts.push(
          new THREE.Matrix4().compose(
            new THREE.Vector3(x, y + FENCE.tall / 2 + 0.4, z),
            q.setFromAxisAngle(up, turn),
            new THREE.Vector3(1, 1, 1)
          )
        )
        continue
      }
      bars.push(new THREE.Matrix4().makeTranslation(x, y + FENCE.tall / 2, z))
      tips.push(new THREE.Matrix4().makeTranslation(x, y + FENCE.tall + 0.3, z))
    }
    const mx = (a.x + b.x) / 2
    const mz = (a.z + b.z) / 2
    const my = (ground.at(a.x, a.z) + ground.at(b.x, b.z)) / 2
    for (const h of FENCE.rails) {
      rails.push(
        new THREE.Matrix4().compose(
          new THREE.Vector3(mx, my + h, mz),
          q.setFromAxisAngle(up, turn),
          new THREE.Vector3(length, 1, 1)
        )
      )
    }
  }
  const instanced = (
    geometry: THREE.BufferGeometry,
    list: THREE.Matrix4[]
  ): THREE.InstancedMesh => {
    const mesh = new THREE.InstancedMesh(geometry, m.iron, list.length)
    list.forEach((matrix, i) => mesh.setMatrixAt(i, matrix))
    mesh.instanceMatrix.needsUpdate = true
    group.add(mesh)
    return mesh
  }
  instanced(new THREE.CylinderGeometry(0.05, 0.05, FENCE.tall, 4), bars)
  instanced(new THREE.ConeGeometry(0.13, 0.6, 4), tips)
  instanced(new THREE.BoxGeometry(1, 0.12, 0.12), rails)
  const post = new THREE.CylinderGeometry(0.22, 0.28, FENCE.tall + 0.8, 4)
  instanced(post, posts)
  return group
}

// A candelabrum taller than a house: a tripod foot, the stem, and three
// arms each with a candle burning; its flames' spots, in the precinct
// group's own space, go into `flames`.
function buildCandelabrum(
  m: Mats,
  at: XZ,
  y: number,
  turn: number,
  flames: FlameSpot[]
): THREE.Group {
  const group = new THREE.Group()
  group.position.set(at.x, y, at.z)
  group.rotation.y = turn
  const stem = 5.4
  for (let k = 0; k < 3; k++) {
    const a = (k / 3) * Math.PI * 2
    const foot = box(
      m.iron,
      [1.4, 0.14, 0.14],
      [Math.cos(a) * 0.6, 0.3, Math.sin(a) * 0.6]
    )
    foot.rotation.set(0, -a, -0.4)
    group.add(foot)
  }
  group.add(box(m.iron, [0.16, stem, 0.16], [0, stem / 2, 0]))
  group.add(box(m.iron, [0.14, 0.14, 2.6], [0, stem - 0.6, 0]))
  for (const z of [-1.3, 0, 1.3]) {
    const lift = z === 0 ? 0.5 : 0
    group.add(
      box(m.iron, [0.14, 0.6 + lift, 0.14], [0, stem - 0.3 + lift / 2, z])
    )
    const cup = new THREE.Mesh(
      new THREE.CylinderGeometry(0.28, 0.12, 0.2, 6),
      m.iron
    )
    cup.position.set(0, stem + lift, z)
    group.add(cup)
    const candle = new THREE.Mesh(
      new THREE.CylinderGeometry(0.12, 0.12, 0.9, 6),
      m.wax
    )
    candle.position.set(0, stem + lift + 0.55, z)
    group.add(candle)
    const top = stem + lift + 1
    const cos = Math.cos(turn)
    const sin = Math.sin(turn)
    flames.push({
      at: [at.x + z * sin, y + top, at.z + z * cos],
      size: 0.55,
    })
  }
  return group
}

// A brazier on a gate pier: a bowl of iron on three legs.
function buildBrazier(m: Mats): THREE.Group {
  const group = new THREE.Group()
  const bowl = new THREE.Mesh(
    new THREE.CylinderGeometry(0.9, 0.45, 0.7, 8, 1, true),
    m.iron
  )
  bowl.position.y = 1.1
  group.add(bowl)
  for (let k = 0; k < 3; k++) {
    const a = (k / 3) * Math.PI * 2
    const leg = box(
      m.iron,
      [0.1, 1, 0.1],
      [Math.cos(a) * 0.5, 0.45, Math.sin(a) * 0.5]
    )
    group.add(leg)
  }
  return group
}

// --- The shovel ------------------------------------------------------------

// A long-handled round-point shovel: ash shaft, a D-grip, and a steel
// blade worn bright at the edge. Standing on its blade's point at the
// origin, the handle up +y, the blade's face toward +x. Out of the heap
// by the gate, and the pack's picture of it.
export function buildShovel({ glow = true }: PickupOptions = {}): THREE.Group {
  const group = new THREE.Group()
  group.name = 'shovel'
  const wood = lambert({ color: '#8a6a42' })
  const steel = lambert({ color: '#6d7174', emissive: '#111214' })
  const blade = new THREE.Shape()
  blade.moveTo(0, 0)
  blade.quadraticCurveTo(0.13, 0.04, 0.12, 0.2)
  blade.lineTo(0.12, 0.27)
  blade.lineTo(-0.12, 0.27)
  blade.lineTo(-0.12, 0.2)
  blade.quadraticCurveTo(-0.13, 0.04, 0, 0)
  const plate = new THREE.Mesh(
    new THREE.ExtrudeGeometry(blade, { depth: 0.012, bevelEnabled: false }),
    steel
  )
  plate.rotation.y = Math.PI / 2
  group.add(plate)
  const socket = new THREE.Mesh(
    new THREE.CylinderGeometry(0.02, 0.03, 0.14, 6),
    steel
  )
  socket.position.y = 0.33
  group.add(socket)
  const shaft = new THREE.Mesh(
    new THREE.CylinderGeometry(0.017, 0.019, 1.05, 6),
    wood
  )
  shaft.position.y = 0.88
  group.add(shaft)
  const grip = new THREE.Mesh(
    new THREE.TorusGeometry(0.06, 0.012, 4, 8, Math.PI),
    wood
  )
  grip.position.y = 1.42
  group.add(grip)
  group.add(box(wood, [0.02, 0.02, 0.12], [0, 1.47, 0]))
  if (glow) {
    const halo = makeGlowSprite(
      makeGlowTexture('rgba(220, 210, 255, 0.5)'),
      0.9
    )
    halo.position.y = 0.6
    group.add(halo)
  }
  return group
}

// --- The precinct ----------------------------------------------------------

// Bakes `part`'s meshes into `into` where they stand in the world, so the
// whole precinct's stone merges into a few draws.
function flattenInto(into: THREE.Group, part: THREE.Object3D): void {
  part.updateMatrixWorld(true)
  const meshes: THREE.Mesh[] = []
  part.traverse((node) => {
    if (isMesh(node)) meshes.push(node)
  })
  for (const mesh of meshes) {
    const geometry = mesh.geometry.clone()
    geometry.applyMatrix4(mesh.matrixWorld)
    into.add(new THREE.Mesh(geometry, mesh.material))
  }
}

// The celestial graveyard at `place`, everything on `ground`, the solid
// parts on `walls`.
export function placeCelestial(
  place: MazePlace,
  ground: Ground,
  walls: Walls
): CelestialRig {
  const m = mats('celestial')
  const group = new THREE.Group()
  group.name = 'celestial-graveyard'
  const stone = new THREE.Group()
  stone.name = 'celestial-stone'
  const rng = mulberry32(CONFIG.celestial.seed ^ 0x77)
  const flames: FlameSpot[] = []

  // The monuments.
  for (const s of stonesOf(place)) {
    const part = buildMonument(m, s.kind, rng)
    standOn(part, s, ground)
    flattenInto(stone, part)
    walls.addWall(s, s, STONE_RADIUS[s.kind] * s.scale)
  }

  // The weeping angel on her plinth, the shaft of light on her.
  const angel = angelOf(place)
  const plinth = new THREE.Group()
  plinth.add(box(m.dark, [9, 1.2, 9], [0, 0.6, 0]))
  plinth.add(box(m.stone, [7, 3.4, 7], [0, 2.9, 0]))
  plinth.add(box(m.dark, [7.8, 0.7, 7.8], [0, 4.95, 0]))
  // Columns at its corners.
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      const col = new THREE.Mesh(
        new THREE.CylinderGeometry(0.4, 0.45, 3.4, 8),
        m.dark
      )
      col.position.set(sx * 3.6, 2.9, sz * 3.6)
      plinth.add(col)
    }
  }
  const her = buildAngel(m, ANGEL_TALL, true, false)
  her.position.y = 5.3
  plinth.add(her)
  const angelY = ground.at(angel.x, angel.z)
  plinth.position.set(angel.x, angelY, angel.z)
  plinth.rotation.y = angel.yaw
  flattenInto(stone, plinth)
  walls.addWall(angel, angel, 5)
  // Her tears apart, so they stay lit.
  const tears = buildAngel(m, ANGEL_TALL, true, true)
  const tearsOnly = new THREE.Group()
  tears.traverse((node) => {
    if (isMesh(node) && node.material === m.tears) {
      tearsOnly.add(node.clone())
    }
  })
  tearsOnly.position.set(angel.x, angelY + 5.3, angel.z)
  tearsOnly.rotation.y = angel.yaw
  group.add(tearsOnly)
  const shaft = new THREE.Mesh(
    new THREE.CylinderGeometry(4, 9, 90, 12, 1, true),
    new THREE.MeshBasicMaterial({
      color: '#d8e2ff',
      transparent: true,
      opacity: 0.07,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.DoubleSide,
    })
  )
  shaft.position.set(angel.x, angelY + 45, angel.z)
  shaft.name = 'celestial-light'
  group.add(shaft)
  const halo = makeGlowSprite(makeGlowTexture('rgba(200, 215, 255, 0.4)'), 5)
  halo.position.set(angel.x, angelY + 5.3 + ANGEL_TALL * 1.15, angel.z)
  group.add(halo)

  // Her grave at her feet: a kerb of stone round turned earth.
  const grave = graveOf(place)
  const { length, width } = CONFIG.celestial.grave
  const plot = new THREE.Group()
  plot.add(box(m.earth, [length, 0.3, width], [0, 0.15, 0]))
  plot.add(box(m.dark, [length + 0.6, 0.5, 0.3], [0, 0.25, width / 2 + 0.15]))
  plot.add(box(m.dark, [length + 0.6, 0.5, 0.3], [0, 0.25, -width / 2 - 0.15]))
  plot.add(box(m.dark, [0.3, 0.5, width], [length / 2 + 0.15, 0.25, 0]))
  plot.position.set(grave.x, ground.at(grave.x, grave.z), grave.z)
  plot.rotation.y = facing(place, 0)
  flattenInto(stone, plot)

  // The gate: two piers, the pointed arch over them, a brazier on each.
  const [left, right] = gatePiersOf(place)
  const pierTall = 11
  for (const pier of [left, right]) {
    const y = ground.at(pier.x, pier.z)
    const p = new THREE.Group()
    p.add(box(m.dark, [3, 1.2, 3], [0, 0.6, 0]))
    p.add(box(m.stone, [2.2, pierTall, 2.2], [0, 1.2 + pierTall / 2, 0]))
    p.add(box(m.dark, [2.8, 0.6, 2.8], [0, 1.5 + pierTall, 0]))
    p.position.set(pier.x, y, pier.z)
    p.rotation.y = facing(place, 0)
    flattenInto(stone, p)
    walls.addWall(pier, pier, 1.6)
    const brazier = buildBrazier(m)
    brazier.position.set(pier.x, y + 1.8 + pierTall, pier.z)
    flattenInto(stone, brazier)
    const top = y + 1.8 + pierTall + 1.4
    flames.push({ at: [pier.x, top, pier.z], size: 1.6 })
    flames.push({ at: [pier.x + 0.3, top - 0.1, pier.z - 0.2], size: 1.1 })
  }
  {
    const span = Math.hypot(right.x - left.x, right.z - left.z)
    const ly = ground.at(left.x, left.z)
    const ry = ground.at(right.x, right.z)
    const shape = new THREE.Shape()
    const half = span / 2 + 1.1
    const rise = 7
    shape.moveTo(-half, 0)
    shape.quadraticCurveTo(-half, rise * 0.9, 0, rise)
    shape.quadraticCurveTo(half, rise * 0.9, half, 0)
    shape.lineTo(half - 1.2, 0)
    shape.quadraticCurveTo(half - 1.2, rise * 0.65, 0, rise - 1.4)
    shape.quadraticCurveTo(-half + 1.2, rise * 0.65, -half + 1.2, 0)
    shape.closePath()
    const arch = new THREE.Mesh(
      new THREE.ExtrudeGeometry(shape, { depth: 1.6, bevelEnabled: false }),
      m.stone
    )
    arch.geometry.translate(0, 0, -0.8)
    const mid = { x: (left.x + right.x) / 2, z: (left.z + right.z) / 2 }
    arch.position.set(mid.x, Math.min(ly, ry) + 1.2 + pierTall, mid.z)
    arch.rotation.y = facing(place, Math.PI / 2)
    const holder = new THREE.Group()
    holder.add(arch)
    // A cross on the arch's point.
    holder.add(
      box(m.dark, [0.4, 3, 0.4], [mid.x, arch.position.y + rise + 1.4, mid.z])
    )
    const bar = box(
      m.dark,
      [0.4, 0.4, 1.8],
      [mid.x, arch.position.y + rise + 2, mid.z]
    )
    bar.rotation.y = facing(place, 0)
    holder.add(bar)
    flattenInto(stone, holder)
  }

  // The fence round it all.
  group.add(buildFence(m, place, ground, walls))

  // The candelabra down the avenue.
  const iron = new THREE.Group()
  iron.name = 'celestial-iron'
  for (const spot of candelabraOf(place)) {
    const y = ground.at(spot.x, spot.z)
    flattenInto(iron, buildCandelabrum(m, spot, y, facing(place, 0), flames))
    walls.addWall(spot, spot, 0.5)
  }
  mergeStatic(iron)
  group.add(iron)

  // The heap of earth by the gate, the shovel standing in it.
  const heapAt = shovelOf(place)
  const heapY = ground.at(heapAt.x, heapAt.z)
  const heap = new THREE.Mesh(
    new THREE.SphereGeometry(1.3, 8, 5, 0, Math.PI * 2, 0, Math.PI / 2),
    m.earth
  )
  heap.scale.set(1, 0.5, 0.8)
  heap.position.set(heapAt.x, heapY - 0.05, heapAt.z)
  stone.add(heap)
  const shovel = buildShovel({ glow: false })
  shovel.position.set(heapAt.x, heapY + 0.35, heapAt.z)
  shovel.rotation.set(0, facing(place, Math.PI / 2), 0.25)
  group.add(shovel)

  mergeStatic(stone)
  group.add(stone)

  const fire = buildFlames(flames, 0xce1e)
  group.add(fire.group)
  fire.update(0)

  return {
    group,
    place,
    shovel: heapAt,
    grave,
    update(t) {
      fire.update(t)
    },
  }
}

// Stands monument `part` at `s` on the ground, turned, scaled and leant.
function standOn(part: THREE.Group, s: GiantStone, ground: Ground): void {
  part.position.set(s.x, ground.at(s.x, s.z) - 0.2, s.z)
  part.rotation.set(0, s.yaw, s.lean, 'YXZ')
  part.scale.setScalar(s.scale)
}

// The precinct's set pieces apart, for Akashic: the weeping angel on her
// plinth, and one of each monument.
export function buildWeepingAngel(): THREE.Group {
  const m = mats('celestial')
  const group = new THREE.Group()
  group.name = 'weeping-angel'
  group.add(box(m.dark, [9, 1.2, 9], [0, 0.6, 0]))
  group.add(box(m.stone, [7, 3.4, 7], [0, 2.9, 0]))
  group.add(box(m.dark, [7.8, 0.7, 7.8], [0, 4.95, 0]))
  const her = buildAngel(m, ANGEL_TALL, true, true)
  her.position.y = 5.3
  group.add(her)
  return group
}

export function buildGiantStone(kind: StoneKind): THREE.Group {
  const group = buildMonument(mats('celestial'), kind, mulberry32(0x5707))
  group.name = `giant-${kind}`
  return group
}
