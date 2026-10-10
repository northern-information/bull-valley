import * as THREE from 'three'
import {
  artTexture,
  castShadows,
  lambert,
  makeGlowSprite,
  makeGlowTexture,
  mergeStatic,
  setMotion,
} from './assetkit.ts'
import { canvas } from './canvas.ts'
import { CONFIG } from './config.ts'
import { DEFAULT_FINISH, finishById } from './finishes.ts'
import { buildFlames } from './fire.ts'
import { paintTombstone } from './graveart.ts'
import { mulberry32, range } from './rng.ts'
import type { CanvasArt } from './canvas.ts'
import type { FlameSpot } from './fire.ts'

// The things held, worn and set down: a shadowman's tombstone, the Flaming
// Halo, the baseball bat, the axe, the flashlight, Marx's paperback,
// Moab's scroll and scythe, and the guitar.

// A shadowman's tombstone (graves.ts): a round-topped granite headstone on
// a plinth, its name cut into the face (graveart.ts), over a low mound of
// fresh earth. Faces +z; origin on the ground under the stone. The stone
// and the earth are shared by every tombstone; dispose() frees the face.
export interface Tombstone {
  group: THREE.Group
  dispose: () => void
}

const TOMBSTONE = { width: 0.5, shoulder: 0.62, depth: 0.1 }

// The geometry and materials every tombstone shares: the stone's three
// pieces and the face's plane, and the mound of earth. gravestones.ts
// draws the stones and the mounds instanced across every grave.
export interface TombstoneParts {
  slab: THREE.BufferGeometry
  arch: THREE.BufferGeometry
  plinth: THREE.BufferGeometry
  face: THREE.BufferGeometry
  mound: THREE.BufferGeometry
  stone: THREE.Material
  earth: THREE.Material
}

let tombstoneShared: TombstoneParts | null = null

export function tombstoneParts(): TombstoneParts {
  const { width, shoulder, depth } = TOMBSTONE
  tombstoneShared ??= (() => {
    const slab = new THREE.BoxGeometry(width, shoulder, depth)
    slab.translate(0, shoulder / 2 + 0.08, 0)
    // A half disc standing on the slab, its flat side down.
    const arch = new THREE.CylinderGeometry(
      width / 2,
      width / 2,
      depth,
      12,
      1,
      false,
      -Math.PI / 2,
      Math.PI
    )
    arch.rotateX(-Math.PI / 2)
    arch.translate(0, shoulder + 0.08, 0)
    const plinth = new THREE.BoxGeometry(width + 0.14, 0.08, depth + 0.12)
    plinth.translate(0, 0.04, 0)
    const face = new THREE.PlaneGeometry(width - 0.04, (width - 0.04) * 1.25)
    face.translate(0, 0.08 + shoulder / 2 + 0.05, depth / 2 + 0.002)
    const mound = new THREE.SphereGeometry(
      1,
      8,
      4,
      0,
      Math.PI * 2,
      0,
      Math.PI / 2
    )
    mound.scale(0.32, 0.09, 0.75)
    mound.translate(0, 0, depth / 2 + 0.85)
    return {
      slab,
      arch,
      plinth,
      face,
      mound,
      stone: lambert({ color: '#80858b' }),
      earth: lambert({ color: '#3b2c1f' }),
    }
  })()
  return tombstoneShared
}

// How a stone with this seed has settled, a little out of true: the
// pitch and roll of the stone over its mound.
export function tombstoneSettle(seed: number): { x: number; z: number } {
  const rng = mulberry32(seed)
  return { x: range(rng, -0.05, 0.03), z: range(rng, -0.06, 0.06) }
}

// The face alone, the name cut in (graveart.ts): the one part of a
// tombstone that is its own, in the stone's space. dispose() frees it.
export function buildTombstoneFace(
  name: string,
  seed = 0x6a7e,
  heading?: string
): { mesh: THREE.Mesh; dispose: () => void } {
  const texture = artTexture(paintTombstone(name, seed, heading))
  const material = lambert({ map: texture })
  const mesh = new THREE.Mesh(tombstoneParts().face, material)
  mesh.name = 'tombstone-face'
  return {
    mesh,
    dispose: () => {
      texture.dispose()
      material.dispose()
    },
  }
}

export function buildTombstone(
  name: string,
  seed = 0x6a7e,
  heading?: string
): Tombstone {
  const parts = tombstoneParts()
  const group = new THREE.Group()
  group.name = 'tombstone'
  const stone = new THREE.Group()
  for (const geo of [parts.slab, parts.arch, parts.plinth]) {
    stone.add(new THREE.Mesh(geo, parts.stone))
  }
  const face = buildTombstoneFace(name, seed, heading)
  stone.add(face.mesh)
  const settle = tombstoneSettle(seed)
  stone.rotation.set(settle.x, 0, settle.z)
  group.add(stone)
  group.add(new THREE.Mesh(parts.mound, parts.earth))
  return { group, dispose: face.dispose }
}

// --- The Flaming Halo -----------------------------------------------------

// A cosmetic Moab Coldë trades for gold (cosmetics.ts): a ring of gold
// floating level over the head, burning all the way round with Moab's own
// fire. Origin at the middle of the ring. update(t) moves the fire and
// turns the ring slowly; dispose() frees what this halo alone owns (the
// ring's geometry and material are shared by every halo).
export interface FlamingHalo {
  group: THREE.Group
  update: (t: number) => void
  dispose: () => void
}

const HALO = { radius: 0.15, tube: 0.012, tongues: 9, flame: 0.085 }

let haloRing: {
  geometry: THREE.TorusGeometry
  material: THREE.Material
} | null = null

export function buildFlamingHalo(): FlamingHalo {
  haloRing ??= {
    geometry: new THREE.TorusGeometry(HALO.radius, HALO.tube, 4, 18),
    material: lambert({
      color: '#a07818',
      emissive: new THREE.Color('#ffc23a'),
      emissiveIntensity: 0.8,
    }),
  }
  const group = new THREE.Group()
  group.name = 'flaming-halo'
  const ring = new THREE.Mesh(haloRing.geometry, haloRing.material)
  ring.rotation.x = Math.PI / 2
  group.add(ring)
  const spots: FlameSpot[] = Array.from({ length: HALO.tongues }, (_, i) => {
    const a = (i / HALO.tongues) * Math.PI * 2
    // Every other tongue a little shorter, so the crown is never even.
    const size = HALO.flame * (i % 2 === 0 ? 1 : 0.7)
    return {
      at: [Math.cos(a) * HALO.radius, 0, Math.sin(a) * HALO.radius],
      size,
    }
  })
  const flames = buildFlames(spots, 0x4a10)
  group.add(flames.group)
  const update = (t: number) => {
    group.rotation.y = t * 0.4
    flames.update(t)
  }
  update(0)
  const dispose = () => {
    flames.group.traverse((o) => {
      if (o instanceof THREE.InstancedMesh) o.dispose()
      else if (o instanceof THREE.Points) {
        const points = o as THREE.Points<THREE.BufferGeometry, THREE.Material>
        points.geometry.dispose()
        points.material.dispose()
      } else if (o instanceof THREE.Sprite) o.material.dispose()
    })
  }
  return { group, update, dispose }
}

// --- Baseball bat --------------------------------------------------------

// A 33-inch ash bat, turned on a lathe: knob, thin handle, a long taper,
// and the barrel, cupped a little at the end. Local space: the grip (where
// a hand closes, just above the knob) at the origin, the bat hanging down
// -Y to the barrel end.
// [radius, y] from the barrel end up to the knob: LatheGeometry faces
// outward for a profile that rises.
const BAT_PROFILE: [number, number][] = [
  [0, -0.765],
  [0.03, -0.77],
  [0.033, -0.74],
  [0.032, -0.62],
  [0.022, -0.45],
  [0.012, -0.22],
  [0.012, 0.03],
  [0.02, 0.04],
  [0.02, 0.055],
  [0, 0.06],
]

export function buildBat(): THREE.Group {
  const ash = lambert({ color: '#c9a46a' })
  const tape = lambert({ color: '#141416' })
  const profile = BAT_PROFILE.map(([r, y]) => new THREE.Vector2(r, y))
  const body = new THREE.Mesh(new THREE.LatheGeometry(profile, 8), ash)
  // Grip tape over the handle, a hair proud of the wood.
  const grip = new THREE.Mesh(
    new THREE.CylinderGeometry(0.0135, 0.0135, 0.2, 8),
    tape
  )
  grip.position.y = -0.07
  const group = new THREE.Group()
  group.name = 'bat'
  group.add(body, grip)
  return group
}

// --- Axe -----------------------------------------------------------------

// A felling axe: a 28-inch hickory haft and a grey steel head with a
// bright ground edge. Local space like the bat: the grip at the origin,
// the haft hanging down -Y to the head, the edge facing +Z.
export function buildAxe(): THREE.Group {
  const hickory = lambert({ color: '#b48a56' })
  const steel = lambert({ color: '#5d6066' })
  const edge = lambert({ color: '#c9ccd2' })
  const haft = new THREE.Mesh(
    new THREE.CylinderGeometry(0.015, 0.017, 0.72, 6),
    hickory
  )
  haft.position.y = -0.3
  // The knob at the grip end, swelled so the hand cannot slip off it.
  const knob = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.04, 0.05), hickory)
  knob.position.y = 0.06
  // The eye round the haft, the bit out front and the poll behind.
  const eye = new THREE.Mesh(new THREE.BoxGeometry(0.045, 0.1, 0.07), steel)
  eye.position.set(0, -0.62, 0)
  const bit = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.09, 0.1), steel)
  bit.position.set(0, -0.62, 0.08)
  const blade = new THREE.Mesh(new THREE.BoxGeometry(0.012, 0.16, 0.03), edge)
  blade.position.set(0, -0.62, 0.14)
  const poll = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.08, 0.04), steel)
  poll.position.set(0, -0.62, -0.05)
  const group = new THREE.Group()
  group.name = 'axe'
  group.add(haft, knob, eye, bit, blade, poll)
  return group
}

// --- Flashlight ----------------------------------------------------------

// A two-D-cell flashlight in dull yellow plastic, the kind kept in a kitchen
// drawer: a ribbed barrel, a black head flared round the lens, a black
// slide switch on top. Local space: the barrel along +Z, the lens at the
// +Z end, the origin in the middle of the grip. setOn lights the lens.
// beam: a fake cone of light this many metres long out of the lens, for a
// flashlight seen from outside (peers); the player's own throws a real
// spot instead (fphands.ts).
export interface Flashlight {
  group: THREE.Group
  // The middle of the lens, in the group's space.
  lens: THREE.Vector3
  setOn(on: boolean): void
}

const FLASHLIGHT = {
  barrel: { radius: 0.019, length: 0.17 },
  head: { radius: 0.03, length: 0.06 },
}

const LENS_OFF = '#3a3b36'
const LENS_ON = '#fff4d6'
let lensGlow: THREE.Texture | null = null

export function buildFlashlight({ beam = 0 } = {}): Flashlight {
  const { barrel, head } = FLASHLIGHT
  const plastic = lambert({ color: '#c9a227' })
  const black = lambert({ color: '#18181a' })
  const group = new THREE.Group()
  group.name = 'flashlight'

  // A cylinder along +Z, centred at z.
  const along = (
    top: number,
    bottom: number,
    length: number,
    z: number,
    material: THREE.Material
  ) => {
    const mesh = new THREE.Mesh(
      new THREE.CylinderGeometry(top, bottom, length, 8),
      material
    )
    mesh.rotation.x = Math.PI / 2
    mesh.position.z = z
    group.add(mesh)
    return mesh
  }
  along(barrel.radius, barrel.radius, barrel.length, 0, plastic)
  // Three grip ribs, a hair proud of the barrel.
  const rib = barrel.radius + 0.002
  for (const z of [-0.05, -0.025, 0]) along(rib, rib, 0.008, z, black)
  // The end cap, and the head flaring out to the lens. A cylinder's top
  // turns to +Z, toward the lens.
  along(barrel.radius, barrel.radius * 0.9, 0.012, -barrel.length / 2, black)
  along(
    head.radius,
    barrel.radius,
    head.length,
    barrel.length / 2 + head.length / 2,
    black
  )
  const slide = new THREE.Mesh(new THREE.BoxGeometry(0.012, 0.008, 0.03), black)
  slide.position.set(0, barrel.radius + 0.003, 0.04)
  group.add(slide)

  const lensZ = barrel.length / 2 + head.length + 0.001
  const lensMaterial = new THREE.MeshBasicMaterial({ color: LENS_OFF })
  const lens = new THREE.Mesh(
    new THREE.CircleGeometry(head.radius * 0.85, 8),
    lensMaterial
  )
  lens.position.z = lensZ
  group.add(lens)
  castShadows(group)

  lensGlow ??= makeGlowTexture('rgba(255, 240, 200, 0.85)')
  const glow = makeGlowSprite(lensGlow, 0.1)
  glow.position.z = lensZ + 0.01
  glow.visible = false
  group.add(glow)

  // The cone fades from the lens to nothing at its far end; additive, so
  // black is no light at all.
  let cone: THREE.Mesh | null = null
  if (beam > 0) {
    const geometry = new THREE.ConeGeometry(
      Math.tan(CONFIG.flashlight.halfAngle) * beam,
      beam,
      12,
      1,
      true
    )
    // Brightest at the apex (+Y, before it turns), none at the open end.
    const pos = geometry.attributes.position
    const colors: number[] = []
    const warm = new THREE.Color(CONFIG.flashlight.color)
    for (let i = 0; i < pos.count; i++) {
      const fade = (pos.getY(i) / beam + 0.5) * 0.05
      colors.push(warm.r * fade, warm.g * fade, warm.b * fade)
    }
    geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3))
    // The apex to the lens, the open end out along +Z.
    geometry.rotateX(-Math.PI / 2)
    geometry.translate(0, 0, beam / 2)
    cone = new THREE.Mesh(
      geometry,
      new THREE.MeshBasicMaterial({
        vertexColors: true,
        transparent: true,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        side: THREE.DoubleSide,
      })
    )
    cone.name = 'beam'
    cone.position.z = lensZ
    cone.visible = false
    group.add(cone)
  }

  return {
    group,
    lens: new THREE.Vector3(0, 0, lensZ),
    setOn(on: boolean) {
      lensMaterial.color.set(on ? LENS_ON : LENS_OFF)
      glow.visible = on
      if (cone) cone.visible = on
    },
  }
}

// --- Paperback -----------------------------------------------------------

// An open mass-market paperback, held for reading: two covers hinged at
// the spine, each with its half of the page block on the inside, the
// covers folded a little back so the pages lie open in a shallow V.
// Local space: the spine up +Y, the origin at its middle, the pages
// facing +Z (toward the reader). A cover is 11 by 18 cm; the page block
// is 2 cm in all.
const BOOK_COVER: [number, number, number] = [0.11, 0.178, 0.004]
const BOOK_PAGES: [number, number, number] = [0.104, 0.17, 0.01]
const BOOK_OPEN = 0.5
export function buildBook(): THREE.Group {
  const cover = lambert({ color: '#5a1f1a' })
  const pages = lambert({ color: '#e7dcc3' })
  const group = new THREE.Group()
  group.name = 'book'
  for (const side of [1, -1]) {
    // Each half hinges at the spine and swings back by BOOK_OPEN.
    const hinge = new THREE.Group()
    hinge.rotation.y = -side * BOOK_OPEN
    const back = new THREE.Mesh(new THREE.BoxGeometry(...BOOK_COVER), cover)
    back.position.set((side * BOOK_COVER[0]) / 2, 0, -BOOK_COVER[2] / 2)
    const block = new THREE.Mesh(new THREE.BoxGeometry(...BOOK_PAGES), pages)
    block.position.set((side * BOOK_PAGES[0]) / 2, 0, BOOK_PAGES[2] / 2)
    hinge.add(back, block)
    group.add(hinge)
  }
  return group
}

// --- Moab's scroll -------------------------------------------------------

// A burning scroll, unrolled and held out by its top rod for whoever walks
// up to read: old parchment covered in close black script round a sigil,
// a dark rod at the top and a rolled stump at the bottom, the bottom edge
// charred ragged and on fire. Local space: the middle of the top rod at
// the origin, the sheet hanging down -Y, its face toward +Z. update(t)
// moves the fire; call it every frame with a running time, or once with a
// fixed time to hold it still.
export interface Scroll {
  group: THREE.Group
  update(t: number): void
}

const SCROLL = { width: 0.34, height: 0.5, rod: 0.016 }

// The sheet: yellowed parchment browning to char at the bottom, lines of
// script (strokes, not words) round a ringed sigil, the charred edge torn
// into points.
function paintScroll(): CanvasArt {
  const art = canvas([68, 100], '#d9c79c')
  const { ctx, w, h } = art
  const rng = mulberry32(0x5c7011)
  const burn = ctx.createLinearGradient(0, h * 0.55, 0, h)
  burn.addColorStop(0, 'rgba(90, 50, 20, 0)')
  burn.addColorStop(1, 'rgba(40, 18, 6, 0.9)')
  ctx.fillStyle = burn
  ctx.fillRect(0, 0, w, h)
  // The sigil: a ring, a triangle in it, and a dot.
  ctx.strokeStyle = '#5a0e0a'
  ctx.lineWidth = 1.5
  ctx.beginPath()
  ctx.arc(w / 2, 30, 13, 0, Math.PI * 2)
  ctx.moveTo(w / 2, 19)
  ctx.lineTo(w / 2 + 10, 36)
  ctx.lineTo(w / 2 - 10, 36)
  ctx.closePath()
  ctx.stroke()
  ctx.fillStyle = '#5a0e0a'
  ctx.fillRect(w / 2 - 1, 29, 2, 2)
  // Lines of script: runs of short dark strokes.
  ctx.fillStyle = '#1e140e'
  for (let y = 50; y < h - 14; y += 5) {
    let x = 6
    while (x < w - 6) {
      const run = 3 + Math.floor(rng() * 7)
      ctx.fillRect(x, y, Math.min(run, w - 6 - x), 1.5)
      x += run + 2
    }
  }
  // The charred bottom edge, torn into points.
  ctx.fillStyle = '#120804'
  ctx.beginPath()
  ctx.moveTo(0, h)
  for (let x = 0; x <= w; x += 5) {
    ctx.lineTo(x + 2.5, h - 3 - rng() * 9)
    ctx.lineTo(x + 5, h)
  }
  ctx.closePath()
  ctx.fill()
  return art
}

export function buildScroll(): Scroll {
  const { width, height, rod } = SCROLL
  const group = new THREE.Group()
  group.name = 'scroll'
  const wood = lambert({ color: '#2a1a12' })
  // The sheet takes the art on both faces and stays readable in the dark:
  // a little glow off the fire that eats it.
  const sheet = new THREE.Mesh(
    new THREE.PlaneGeometry(width, height),
    lambert({
      map: artTexture(paintScroll()),
      emissive: new THREE.Color('#3a2410'),
      side: THREE.DoubleSide,
    })
  )
  sheet.position.y = -height / 2
  group.add(sheet)
  // The top rod with its knobs, and the rolled stump of what is left at
  // the bottom.
  const bar = new THREE.Mesh(
    new THREE.CylinderGeometry(rod, rod, width + 0.08, 6),
    wood
  )
  bar.rotation.z = Math.PI / 2
  group.add(bar)
  for (const side of [1, -1]) {
    const knob = new THREE.Mesh(new THREE.IcosahedronGeometry(0.022, 0), wood)
    knob.position.x = side * (width / 2 + 0.05)
    group.add(knob)
  }
  const roll = new THREE.Mesh(
    new THREE.CylinderGeometry(0.022, 0.022, width * 0.9, 6),
    lambert({ color: '#6b4a26' })
  )
  roll.rotation.z = Math.PI / 2
  roll.position.set(0, -height * 0.97, 0.015)
  group.add(roll)
  // The fire along the charred bottom edge, and up one side.
  const fire = buildFlames(
    [
      { at: [-0.12, -height - 0.01, 0.02], size: 0.12 },
      { at: [-0.03, -height - 0.02, 0.02], size: 0.16 },
      { at: [0.07, -height - 0.01, 0.02], size: 0.13 },
      { at: [0.15, -height + 0.04, 0.02], size: 0.1 },
      { at: [0.165, -height * 0.6, 0.01], size: 0.07 },
    ],
    0x5c7
  )
  group.add(fire.group)
  mergeStatic(group)
  castShadows(group)
  const update = (t: number) => fire.update(t)
  setMotion(group, update)
  return { group, update }
}

// --- Moab's scythe -------------------------------------------------------

// A war scythe taller than he is: a long black snath bound with straps, an
// iron collar at the head, and a hooked blade, notched along its inner
// edge, with a spike off the back. Local space: the foot of the snath on
// the ground at the origin, the snath up +Y, the blade reaching out along
// +X, its flat facing ±Z.
const SCYTHE_LENGTH = 2.5

// The blade, as a flat outline in its own plane: from the collar out along
// the back edge to the hooked point, and in along the cutting edge with
// its notches.
function scytheBladeShape(): THREE.Shape {
  const shape = new THREE.Shape()
  shape.moveTo(0, 0.1)
  shape.quadraticCurveTo(0.62, 0.32, 1.2, -0.38)
  shape.quadraticCurveTo(1.0, -0.06, 0.8, 0.0)
  // The notches: saw teeth back toward the collar.
  for (const x of [0.64, 0.48, 0.32, 0.16]) {
    shape.lineTo(x + 0.06, 0.03)
    shape.lineTo(x, -0.04)
  }
  shape.lineTo(0, -0.08)
  shape.closePath()
  return shape
}

export function buildScythe(): THREE.Group {
  const group = new THREE.Group()
  group.name = 'scythe'
  const wood = lambert({ color: '#1c1512' })
  const strap = lambert({ color: '#0a0a0b' })
  const iron = lambert({ color: '#4a4c50' })
  const steel = lambert({
    color: '#b4b9c0',
    emissive: new THREE.Color('#3a3c42'),
  })
  const snath = new THREE.Mesh(
    new THREE.CylinderGeometry(0.022, 0.028, SCYTHE_LENGTH, 6),
    wood
  )
  snath.position.y = SCYTHE_LENGTH / 2
  group.add(snath)
  // The two grips, and straps wound round the snath between them.
  for (const y of [1.05, 1.6]) {
    const grip = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.03, 0.16), wood)
    grip.position.set(0, y, 0.07)
    group.add(grip)
  }
  for (const y of [0.4, 0.75, 1.3, 1.95, 2.2]) {
    const wrap = new THREE.Mesh(
      new THREE.CylinderGeometry(0.031, 0.031, 0.03, 6),
      strap
    )
    wrap.position.y = y
    group.add(wrap)
  }
  // The collar at the head, the blade off it, and the spike off the back.
  const top = SCYTHE_LENGTH - 0.06
  const collar = new THREE.Mesh(
    new THREE.CylinderGeometry(0.038, 0.038, 0.12, 6),
    iron
  )
  collar.position.y = top
  group.add(collar)
  const blade = new THREE.Mesh(
    new THREE.ExtrudeGeometry(scytheBladeShape(), {
      depth: 0.012,
      bevelEnabled: false,
    }),
    steel
  )
  blade.position.set(0.02, top, -0.006)
  group.add(blade)
  const spike = new THREE.Shape()
  spike.moveTo(0, 0.04)
  spike.lineTo(-0.26, 0.0)
  spike.lineTo(0, -0.04)
  spike.closePath()
  const back = new THREE.Mesh(
    new THREE.ExtrudeGeometry(spike, { depth: 0.012, bevelEnabled: false }),
    steel
  )
  back.position.set(-0.02, top, -0.006)
  group.add(back)
  mergeStatic(group)
  castShadows(group)
  return group
}

// --- Guitar --------------------------------------------------------------

// An LTD EX-400: an Explorer body, about a metre long, in the finish
// passed in (black by default; finishes.ts has the table) with black
// hardware. The outline is measured from the catalogue photo: the body's
// silhouette thresholded and read column by column, then turned onto the
// neck axis. Local space: the neck up +Y, the strings facing +Z, the
// origin on the string line below the tailpiece. The outline runs
// anticlockwise from the neck joint: down the bass edge, closing in on the
// pickups, out along the long diagonal to the horn tip at the bottom, back
// along the horn's underside to the rear corner, in to the waist beside
// the bridge, out again along the wing to its tip above the neck joint,
// and into the notch at the heel.
export const GUITAR_OUTLINE: [number, number][] = [
  [0.025, 0.3],
  [-0.085, 0.252],
  [-0.067, 0.131],
  [-0.209, -0.155],
  [-0.001, -0.071],
  [0.154, -0.015],
  [0.093, 0.124],
  [0.17, 0.359],
  [0.048, 0.269],
]
// The pointed headstock, in its own space: the nut at y = 0, the tip up +Y
// and over to the treble side, the six tuners down the long bass diagonal.
const GUITAR_HEAD_OUTLINE: [number, number][] = [
  [0.025, 0],
  [0.045, 0.128],
  [0.035, 0.17],
  [-0.044, 0.046],
  [-0.025, 0],
]
const GUITAR_DEPTH = 0.045
// The nut, where the headstock leaves the neck, and the headstock's tilt
// back from the neck.
const GUITAR_NUT_Y = 0.68
const GUITAR_HEAD_TILT = -0.25
// The dot inlays, between the frets of a 24.75" scale: 3, 5, 7, 9, 15, 17,
// 19 and 21. The 12th fret carries the model plate instead.
const GUITAR_DOTS = [0.596, 0.536, 0.484, 0.438, 0.323, 0.293, 0.267, 0.244]
const GUITAR_PLATE_Y = 0.375

function outlineGeometry(
  outline: [number, number][],
  depth: number
): THREE.ExtrudeGeometry {
  const shape = new THREE.Shape()
  shape.moveTo(...outline[0])
  for (const point of outline.slice(1)) shape.lineTo(...point)
  shape.closePath()
  const geometry = new THREE.ExtrudeGeometry(shape, {
    depth,
    bevelEnabled: false,
  })
  geometry.translate(0, 0, -depth / 2)
  return geometry
}

// A built guitar: its group, and setFinish to recolor the gloss (the
// body, the neck and the headstock) in place.
export interface Guitar {
  group: THREE.Group
  setFinish(color: string): void
}

export function buildGuitar(
  finish: string = finishById(DEFAULT_FINISH).color
): Guitar {
  const gloss = lambert({ color: finish })
  const hardware = lambert({ color: '#26262b' })
  const rosewood = lambert({ color: '#2c1a10' })
  const pearl = lambert({ color: '#d9d6cc' })
  const chrome = lambert({ color: '#a2a7ad' })

  const group = new THREE.Group()
  group.name = 'guitar'
  const add = (
    geometry: THREE.BufferGeometry,
    material: THREE.Material,
    x: number,
    y: number,
    z: number
  ) => {
    const mesh = new THREE.Mesh(geometry, material)
    mesh.position.set(x, y, z)
    group.add(mesh)
    return mesh
  }
  const face = GUITAR_DEPTH / 2
  add(outlineGeometry(GUITAR_OUTLINE, GUITAR_DEPTH), gloss, 0, 0, 0)
  // The set neck in the body's finish, the rosewood fretboard over it with
  // its dots and the model plate, and the pointed headstock tilted back
  // from the nut.
  add(new THREE.BoxGeometry(0.05, 0.46, 0.022), gloss, 0, 0.45, face - 0.011)
  add(new THREE.BoxGeometry(0.05, 0.44, 0.008), rosewood, 0, 0.46, face)
  for (const y of GUITAR_DOTS) {
    add(new THREE.BoxGeometry(0.01, 0.01, 0.003), pearl, 0, y, face + 0.005)
  }
  add(
    new THREE.BoxGeometry(0.022, 0.008, 0.003),
    pearl,
    0,
    GUITAR_PLATE_Y,
    face + 0.005
  )
  const head = new THREE.Group()
  head.position.set(0, GUITAR_NUT_Y, face - 0.02)
  head.rotation.x = GUITAR_HEAD_TILT
  group.add(head)
  head.add(new THREE.Mesh(outlineGeometry(GUITAR_HEAD_OUTLINE, 0.016), gloss))
  for (let i = 0; i < 6; i++) {
    // Spaced along the bass diagonal, from its corner toward the tip.
    const t = 0.1 + i * 0.15
    const post = new THREE.Mesh(
      new THREE.BoxGeometry(0.026, 0.011, 0.011),
      hardware
    )
    post.position.set(-0.044 + t * 0.079, 0.046 + t * 0.124, 0)
    head.add(post)
  }
  // Two blank EMG pickups, the Tune-o-matic bridge and its tailpiece, the
  // volume and tone knobs in a row below the tailpiece on the treble side,
  // and the toggle between them and the waist.
  for (const y of [0.23, 0.15]) {
    add(new THREE.BoxGeometry(0.075, 0.04, 0.012), hardware, 0, y, face + 0.006)
  }
  add(new THREE.BoxGeometry(0.08, 0.014, 0.012), hardware, 0, 0.1, face + 0.006)
  add(
    new THREE.BoxGeometry(0.07, 0.02, 0.008),
    hardware,
    0,
    0.065,
    face + 0.004
  )
  for (const y of [0.05, 0.005]) {
    add(
      new THREE.CylinderGeometry(0.012, 0.014, 0.016, 6),
      hardware,
      0.1,
      y,
      face + 0.008
    ).rotation.x = Math.PI / 2
  }
  add(
    new THREE.BoxGeometry(0.008, 0.03, 0.008),
    hardware,
    0.074,
    0.091,
    face + 0.006
  )
  // The strings, as one pale strip from the tailpiece to the nut.
  add(
    new THREE.BoxGeometry(0.03, 0.615, 0.003),
    chrome,
    0,
    0.3725,
    face + 0.005
  )
  return {
    group,
    setFinish: (color) => {
      gloss.color.set(color)
    },
  }
}
