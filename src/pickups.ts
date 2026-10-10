import * as THREE from 'three'
import {
  artTexture,
  lambert,
  makeGlowSprite,
  makeGlowTexture,
  memo,
  packFace,
  packFlat,
  setPulseMaterials,
} from './assetkit.ts'
import { berryMaterial } from './berrybush.ts'
import { paintTwenty } from './billart.ts'
import { buildDrink } from './drinkmodels.ts'
import { isCigarette, isDrink, isMedicine } from './items.ts'
import { buildMedicine } from './medicinemodels.ts'
import { paintPack } from './packart.ts'
import { mulberry32, range } from './rng.ts'
import type { PickupOptions } from './assetkit.ts'
import type { CanvasArt } from './canvas.ts'
import type { Vec3 } from './interfaces.ts'
import type { Rng } from './rng.ts'

// What lies on the ground to be taken up, and what the pack and the
// shelves show: the cigarette packs, the joints, the berries, the dimes,
// the $20 bill, the gold bullion and the cabbage, behind one buildPickup
// keyed by kind. The drinks and the medicine are built in their own
// modules and come in through it.

// --- Cigarette packs -----------------------------------------------------

// A real king-size flip-top: 55 × 88 × 22 mm, lid open about 110° so the
// filter tips show. Origin at ground level under the middle, art facing +Z.
const PACK = {
  width: 0.055,
  depth: 0.022,
  bodyHeight: 0.066,
  lidHeight: 0.022,
  lidOpen: THREE.MathUtils.degToRad(110),
  stickRadius: 0.0036,
  filterLength: 0.021,
  glowScale: 0.9,
}

const packArt = memo(paintPack)
const twentyArt = memo(() => paintTwenty())

// Twenty sticks in three staggered rows of 7, 6, 7. Returns tip heights
// above the collar top: most sit flush, a few ride up out of the pack.
interface StickSpot {
  x: number
  z: number
  raised: number
}

function stickLayout(rng: Rng): StickSpot[] {
  const d = PACK.stickRadius * 2
  const rowGap = PACK.stickRadius * Math.sqrt(3)
  const spots: StickSpot[] = []
  for (const [row, n] of [
    [-1, 7],
    [0, 6],
    [1, 7],
  ]) {
    for (let i = 0; i < n; i++) {
      const raised =
        rng() < 0.2 ? range(rng, 0.006, 0.02) : range(rng, 0, 0.002)
      spots.push({ x: (i - (n - 1) / 2) * d, z: row * rowGap, raised })
    }
  }
  return spots
}

// glow: false leaves out the halo, for close-up views like the inventory.
export function buildCigarettePack(
  brandId: string,
  seed = 0x5ac,
  { glow = true }: PickupOptions = {}
): THREE.Group {
  const art = packArt(brandId)
  const { width: W, depth: D, bodyHeight: BH, lidHeight: LH } = PACK
  const pack = new THREE.Group()
  pack.name = `pack-${brandId}`
  const pulse: THREE.MeshLambertMaterial[] = []
  const face = (canvasArt: CanvasArt): THREE.MeshLambertMaterial => {
    const m = packFace(artTexture(canvasArt))
    pulse.push(m)
    return m
  }
  const flat = (color: string): THREE.MeshLambertMaterial => {
    const m = packFlat(color)
    pulse.push(m)
    return m
  }
  const hidden = new THREE.MeshBasicMaterial({ visible: false })

  // Body. BoxGeometry face order: +x, -x, +y, -y, +z, -z. The top is the
  // floor the filters stand on.
  const front = face(art.front)
  const side = face(art.side)
  const body = new THREE.Mesh(new THREE.BoxGeometry(W, BH, D), [
    side,
    side,
    flat(art.inner),
    flat(art.edge),
    front,
    front,
  ])
  body.position.y = BH / 2
  pack.add(body)

  // The inner collar: an open-topped band standing proud of the body rim.
  const collarH = 0.012
  const collarMat = flat(art.collar)
  collarMat.side = THREE.DoubleSide
  const collar = new THREE.Mesh(
    new THREE.BoxGeometry(W - 0.002, collarH, D - 0.002),
    [collarMat, collarMat, hidden, hidden, collarMat, collarMat]
  )
  collar.position.y = BH - 0.002 + collarH / 2
  pack.add(collar)

  // Cigarettes, filter up: instanced paper and filter, tip on the top cap.
  const collarTop = BH - 0.002 + collarH
  const spots = stickLayout(mulberry32(seed))
  const r = PACK.stickRadius
  const paperLen = 0.03
  const paperGeo = new THREE.CylinderGeometry(r, r, paperLen, 6)
  paperGeo.translate(0, -paperLen / 2, 0)
  const filterGeo = new THREE.CylinderGeometry(r, r, PACK.filterLength, 6)
  filterGeo.translate(0, -PACK.filterLength / 2, 0)
  // CylinderGeometry groups: side, top cap, bottom cap.
  const tip = flat(art.stick.tip)
  const parts: [
    THREE.BufferGeometry,
    THREE.Material | THREE.Material[],
    number,
  ][] = [
    [paperGeo, flat(art.stick.paper), -PACK.filterLength],
    [filterGeo, [flat(art.stick.filter), tip, tip], 0],
  ]
  if (art.stick.band) {
    const bandGeo = new THREE.CylinderGeometry(r * 1.03, r * 1.03, 0.0018, 6)
    parts.push([bandGeo, flat(art.stick.band), -PACK.filterLength])
  }
  const dummy = new THREE.Object3D()
  for (const [geometry, material, offset] of parts) {
    const sticks = new THREE.InstancedMesh(geometry, material, spots.length)
    spots.forEach((spot, i) => {
      dummy.position.set(spot.x, collarTop + spot.raised + offset, spot.z)
      dummy.updateMatrix()
      sticks.setMatrixAt(i, dummy.matrix)
    })
    sticks.instanceMatrix.needsUpdate = true
    pack.add(sticks)
  }

  // The lid, hinged on the back top edge and swung open over the back.
  const hinge = new THREE.Group()
  hinge.position.set(0, BH, -D / 2)
  hinge.rotation.x = -PACK.lidOpen
  const lidSide = flat(art.edge)
  const lid = new THREE.Mesh(new THREE.BoxGeometry(W, LH, D), [
    lidSide,
    lidSide,
    face(art.lidTop),
    flat(art.inner),
    face(art.lidFront),
    lidSide,
  ])
  lid.position.set(0, LH / 2, D / 2)
  hinge.add(lid)
  pack.add(hinge)

  // A brand-colored halo so a 9 cm pack can be found in the fog.
  if (glow) {
    const halo = makeGlowSprite(makeGlowTexture(art.glow), PACK.glowScale)
    halo.position.y = BH * 0.6
    pack.add(halo)
  }

  setPulseMaterials(pack, pulse)
  return pack
}

// --- Joints --------------------------------------------------------------

// A hand-rolled cone joint, 9 cm. It must not read as a cigarette, so the
// shape is exaggerated: a strong taper from a fat tip to a thin card
// crutch, a lumpy and slightly bent body, a long paper twist that flops to
// one side, and a pale card crutch (not a tan filter). Origin at the middle
// of its length, lying along +X with the tip at +X.
const JOINT = {
  length: 0.09,
  tipRadius: 0.0085,
  crutchRadius: 0.003,
  crutchLength: 0.012,
  twistLength: 0.016,
  bend: 0.004,
  glowScale: 0.8,
}

const JOINT_PAPER = '#ece6cf'
const JOINT_CRUTCH = '#e0d8bc'
const JOINT_HOLE = '#2a2418'

// The paper body as a lathe: radius against length, crutch end at y = 0.
// Lumps come from the seeded rng so each joint in a pile differs.
function jointBody(rng: Rng, length: number): THREE.LatheGeometry {
  const { tipRadius: RT, crutchRadius: RC } = JOINT
  const points: THREE.Vector2[] = []
  const steps = 7
  for (let i = 0; i <= steps; i++) {
    const t = i / steps
    // Cone with a belly near the tip, then a pinch into the twist.
    let r = RC + (RT - RC) * Math.pow(t, 0.8)
    if (i === steps) r *= 0.55
    else if (i > 0) r *= range(rng, 0.9, 1.1)
    points.push(new THREE.Vector2(r, t * length))
  }
  // Close the tip so the open lathe end never shows.
  points.push(new THREE.Vector2(0, length * 1.02))
  const geometry = new THREE.LatheGeometry(points, 6)
  // A gentle bow along the length, then lay +Y along +X.
  const pos = geometry.attributes.position
  for (let i = 0; i < pos.count; i++) {
    const t = pos.getY(i) / length
    pos.setZ(i, pos.getZ(i) + JOINT.bend * 4 * t * (1 - t))
  }
  geometry.computeVertexNormals()
  return geometry.rotateZ(-Math.PI / 2)
}

function jointPart(
  rng: Rng,
  paper: THREE.Material,
  crutch: THREE.Material,
  hole: THREE.Material
): THREE.Group {
  const { length: L, crutchRadius: RC, tipRadius: RT } = JOINT
  const { crutchLength: CL, twistLength: TL } = JOINT
  const joint = new THREE.Group()
  // CylinderGeometry runs along +Y; rotate so +Y becomes +X (tip end).
  const toX = <G extends THREE.BufferGeometry>(geometry: G): G =>
    geometry.rotateZ(-Math.PI / 2)
  const bodyLen = L - CL - TL
  const body = new THREE.Mesh(jointBody(rng, bodyLen), paper)
  body.position.x = -L / 2 + CL
  // The card crutch sticks out past the paper, open at the end.
  const card = new THREE.Mesh(
    toX(new THREE.CylinderGeometry(RC, RC * 0.95, CL, 6)),
    crutch
  )
  card.position.x = -L / 2 + CL / 2
  const mouth = new THREE.Mesh(
    toX(new THREE.CylinderGeometry(RC * 0.6, RC * 0.6, 0.0008, 6)),
    hole
  )
  mouth.position.x = -L / 2 - 0.0002
  // The twist: a thin paper wisp, kinked once and flopped sideways.
  const twist = new THREE.Group()
  twist.position.x = L / 2 - TL
  const wispA = new THREE.Mesh(
    toX(new THREE.ConeGeometry(RT * 0.55, TL * 0.55, 4)),
    paper
  )
  wispA.position.x = TL * 0.27
  const wispB = new THREE.Mesh(
    toX(new THREE.ConeGeometry(RT * 0.3, TL * 0.6, 4)),
    paper
  )
  wispB.position.set(TL * 0.62, 0, range(rng, 0.002, 0.004))
  wispB.rotation.y = -range(rng, 0.5, 0.9)
  twist.add(wispA, wispB)
  twist.rotation.set(range(rng, 0, Math.PI), range(rng, -0.3, 0.3), 0)
  joint.add(body, card, mouth, twist)
  return joint
}

// Three joints dropped in a loose pile, crossed, not lined up like a pack.
// glow: false leaves out the halo.
function buildJoints({ glow = true }: PickupOptions = {}): THREE.Group {
  const pulse: THREE.MeshLambertMaterial[] = []
  const mat = (color: string): THREE.MeshLambertMaterial => {
    const m = lambert({
      color,
      emissive: new THREE.Color(color),
      emissiveIntensity: 0.45,
    })
    pulse.push(m)
    return m
  }
  const paper = mat(JOINT_PAPER)
  const crutch = mat(JOINT_CRUTCH)
  const hole = lambert({ color: JOINT_HOLE })
  const rng = mulberry32(0x7015)
  const group = new THREE.Group()
  group.name = 'joints'
  // [dx, dz, yaw, lift]: the third rests across the other two.
  const lay = [
    [0, -0.014, 0.35, 0],
    [0.006, 0.012, -0.3, 0],
    [-0.004, 0, 1.25, JOINT.tipRadius * 1.4],
  ]
  for (const [dx, dz, yaw, lift] of lay) {
    const joint = jointPart(rng, paper, crutch, hole)
    joint.position.set(dx, JOINT.tipRadius + lift, dz)
    joint.rotation.y = yaw
    group.add(joint)
  }
  if (glow) {
    const halo = makeGlowSprite(
      makeGlowTexture('rgba(74, 222, 128, 0.6)'),
      JOINT.glowScale
    )
    halo.position.y = 0.02
    group.add(halo)
  }
  setPulseMaterials(group, pulse)
  return group
}

// A handful of berries, as the inventory shows them: five in a loose pile.
// Origin at ground level under the middle.
function buildBerries({ glow = true }: PickupOptions = {}): THREE.Group {
  const group = new THREE.Group()
  group.name = 'berries'
  const material = berryMaterial()
  const geo = new THREE.SphereGeometry(0.06, 5, 4)
  const pile: Vec3[] = [
    [0, 0.06, 0],
    [0.1, 0.06, 0.04],
    [-0.08, 0.06, 0.07],
    [0.02, 0.06, -0.1],
    [0.01, 0.16, 0.01],
  ]
  for (const [x, y, z] of pile) {
    const mesh = new THREE.Mesh(geo, material)
    mesh.position.set(x, y, z)
    group.add(mesh)
  }
  if (glow) {
    const halo = makeGlowSprite(makeGlowTexture('rgba(176, 64, 122, 0.5)'), 0.8)
    halo.position.y = 0.1
    group.add(halo)
  }
  setPulseMaterials(group, [material])
  return group
}

// --- Dimes ---------------------------------------------------------------

// The dimes a shadowman bursts into (drops.ts DIMES), `count` of them
// scattered flat and tipped over a patch about a metre across, the seed
// laying them out. A dime is 18 mm; these are drawn three times that, or
// the PS1 downscale would lose them in the grass. Origin at ground level
// under the middle of the scatter.
export function buildDimes(
  count: number,
  seed = 0xd1e,
  { glow = true }: PickupOptions = {}
): THREE.Group {
  const group = new THREE.Group()
  group.name = 'dimes'
  const material = lambert({
    color: '#8a8f96',
    emissive: new THREE.Color('#dfe6ee'),
    emissiveIntensity: 0.35,
  })
  const geo = new THREE.CylinderGeometry(0.027, 0.027, 0.004, 10)
  const rng = mulberry32(seed)
  // Every coin in one draw: an instanced mesh, each coin its own matrix.
  const n = Math.max(1, Math.min(count, 20))
  const coins = new THREE.InstancedMesh(geo, material, n)
  coins.name = 'coins'
  const coin = new THREE.Object3D()
  for (let i = 0; i < n; i++) {
    // Thicker toward the middle, as a spray lands.
    const r = Math.sqrt(rng()) * 0.45
    const a = rng() * Math.PI * 2
    coin.position.set(Math.cos(a) * r, 0.004 + rng() * 0.01, Math.sin(a) * r)
    coin.rotation.set(range(rng, -0.35, 0.35), 0, range(rng, -0.35, 0.35))
    coin.updateMatrix()
    coins.setMatrixAt(i, coin.matrix)
  }
  coins.instanceMatrix.needsUpdate = true
  coins.computeBoundingSphere()
  group.add(coins)
  if (glow) {
    const halo = makeGlowSprite(
      makeGlowTexture('rgba(214, 226, 238, 0.45)'),
      1.1
    )
    halo.position.y = 0.08
    group.add(halo)
  }
  setPulseMaterials(group, [material])
  return group
}

// --- $20 bill ------------------------------------------------------------

// The $20 bill a shadow spider bursts into (drops.ts TWENTY): one note
// lying folded once down the middle, both halves a little off the ground.
// A bill is 156 x 66 mm; this one is drawn three times that, as the dimes
// are, or the downscale would lose it. Origin at ground level under it.
export function buildTwenty(
  seed = 0x2020,
  { glow = true }: PickupOptions = {}
): THREE.Group {
  const rng = mulberry32(seed)
  const group = new THREE.Group()
  group.name = 'twenty'
  const texture = artTexture(twentyArt('twenty'))
  const face = lambert({
    map: texture,
    emissive: new THREE.Color('#ffffff'),
    emissiveMap: texture,
    emissiveIntensity: 0.35,
    side: THREE.DoubleSide,
  })
  const width = 0.47
  const depth = 0.2
  // Each half shows its own half of the face, hinged at the crease and
  // lifted a little off the ground, a shallow V.
  for (const side of [-1, 1]) {
    const geometry = new THREE.PlaneGeometry(width / 2, depth)
    const uv = geometry.getAttribute('uv') as THREE.BufferAttribute
    for (let i = 0; i < uv.count; i++) {
      uv.setX(i, side < 0 ? uv.getX(i) / 2 : 0.5 + uv.getX(i) / 2)
    }
    geometry.translate((side * width) / 4, 0, 0)
    geometry.rotateX(-Math.PI / 2)
    const half = new THREE.Mesh(geometry, face)
    half.rotation.z = side * range(rng, 0.1, 0.22)
    half.position.y = 0.01
    group.add(half)
  }
  if (glow) {
    const halo = makeGlowSprite(
      makeGlowTexture('rgba(190, 220, 170, 0.45)'),
      1.1
    )
    halo.position.y = 0.08
    group.add(halo)
  }
  setPulseMaterials(group, [face])
  return group
}

// --- Gold bullion --------------------------------------------------------

// One troy ounce of gold: a small minted bar (about 50 x 29 x 2 mm, so it
// can be seen at all it is drawn half again as big), lying flat with a
// raised stamp on its face. Origin at the bottom of the bar.
function buildGoldBullion({ glow = true }: PickupOptions = {}): THREE.Group {
  const group = new THREE.Group()
  group.name = 'gold-bullion'
  const gold = lambert({
    color: '#8a6514',
    emissive: new THREE.Color('#f2b632'),
    emissiveIntensity: 0.45,
  })
  const bar = new THREE.Mesh(new THREE.BoxGeometry(0.075, 0.006, 0.045), gold)
  bar.position.y = 0.003
  group.add(bar)
  const stamp = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.002, 0.026), gold)
  stamp.position.y = 0.007
  group.add(stamp)
  if (glow) {
    const halo = makeGlowSprite(makeGlowTexture('rgba(255, 196, 64, 0.5)'), 0.6)
    halo.position.y = 0.02
    group.add(halo)
  }
  setPulseMaterials(group, [gold])
  return group
}

// Kinds: 'cabbage', 'dimes', or an item id from items.ts. glow: false
// leaves out the halo on packs, joints, drinks, medicine, berries, dimes
// and gold bullion.
export function buildPickup(
  kind: string,
  seed?: number,
  { glow = true }: PickupOptions = {}
): THREE.Object3D {
  if (isCigarette(kind)) return buildCigarettePack(kind, seed, { glow })
  if (kind === 'joints') return buildJoints({ glow })
  if (isDrink(kind)) return buildDrink(kind, { glow })
  if (kind === 'berries') return buildBerries({ glow })
  if (kind === 'dimes') return buildDimes(12, seed, { glow })
  if (kind === 'gold-bullion') return buildGoldBullion({ glow })
  if (isMedicine(kind)) return buildMedicine(kind, { glow })
  let mesh: THREE.Mesh<THREE.SphereGeometry, THREE.MeshLambertMaterial>
  if (kind === 'cabbage') {
    const sphere = new THREE.SphereGeometry(0.35, 6, 5)
    sphere.translate(0, 0.35, 0)
    mesh = new THREE.Mesh(
      sphere,
      new THREE.MeshLambertMaterial({
        color: '#1c2a16',
        emissive: new THREE.Color('#9be88a'),
        emissiveIntensity: 0.5,
      })
    )
  } else {
    throw new Error(`Unknown pickup kind "${kind}"`)
  }
  setPulseMaterials(mesh, [mesh.material])
  return mesh
}
