import * as THREE from 'three'
import {
  artTexture,
  castShadows,
  lambert,
  makeGlowSprite,
  makeGlowTexture,
  memo,
  mergeStatic,
  setMotion,
} from './assetkit.ts'
import { canvas } from './canvas.ts'
import { CONFIG } from './config.ts'
import { mulberry32, range } from './rng.ts'

// Jericho, the Candlebearer, beside the payphone on Castle Entropy's rim
// (castleyard.ts jerichoSpot), as Tyler drew him: sat low on the
// concrete, twice a raider's height, his cloak falling from a great lumpy
// hood in a column that narrows at the waist and pools round him in torn
// points on the ground. The cloak is grey gone soft with age, its
// embroidery (gold scrollwork, purple lozenges) faded nearly into the
// grey. Deep in the hood's dark hangs his face, a small pale mask cut
// square with one corner notched off, two dashes for eyes. One hand,
// bound at the wrist, holds a tall thin candle up into the hood's mouth,
// its flame throwing rays, warm on his mask and his hand and glowing so
// he can be found across the yard. A dull brass trumpet is slung across
// his back on a strap over one shoulder, and a great horned owl perches
// on the other, looking about. Origin on the ground under him, facing
// +x. Call update(t) every frame with a running time, for the flame and
// the owl's head.

export interface JerichoRig {
  group: THREE.Group
  // Him, for the ring that marks him as the one E talks to (glow.ts).
  body: THREE.Group
  update(t: number): void
}

// Where the candle's flame burns, in his own space.
const FLAME: [number, number, number] = [0.66, 2.5, -0.1]

// The hood: its middle, its size, and the half-angle of its mouth round
// +x.
const HOOD = { x: 0.02, y: 2.7, r: 0.82, mouth: 0.82 }

// The cloak's cloth: a mottled grey with the embroidery faded into it, a
// band of gold scrollwork with purple lozenges down the front (the
// cylinder's u = 0.25 faces +x) and round the hem, and small gold crosses
// strewn between.
const cloakArt = memo(() => {
  const art = canvas([128, 256], '#5d5c5e')
  const { ctx, w, h } = art
  const rng = mulberry32(0x7e71c0)
  for (let i = 0; i < 900; i++) {
    const shade = 80 + Math.floor(rng() * 26)
    ctx.fillStyle = `rgb(${shade}, ${shade - 1}, ${shade + 2})`
    ctx.fillRect(Math.floor(rng() * w), Math.floor(rng() * h), 2, 2)
  }
  const gold = 'rgba(186, 152, 84, 0.6)'
  const purple = 'rgba(112, 80, 140, 0.55)'
  const band = (x: number, y: number, bw: number, bh: number) => {
    ctx.fillStyle = gold
    ctx.fillRect(x, y, bw, 2)
    ctx.fillRect(x, y + bh - 2, bw, 2)
    ctx.fillRect(x, y, 2, bh)
    ctx.fillRect(x + bw - 2, y, 2, bh)
  }
  const lozenge = (cx: number, cy: number, r: number) => {
    ctx.fillStyle = purple
    ctx.beginPath()
    ctx.moveTo(cx, cy - r)
    ctx.lineTo(cx + r * 0.7, cy)
    ctx.lineTo(cx, cy + r)
    ctx.lineTo(cx - r * 0.7, cy)
    ctx.closePath()
    ctx.fill()
    ctx.fillStyle = gold
    ctx.fillRect(cx - 1, cy - 1, 2, 2)
  }
  // Down the front.
  const front = w * 0.25
  ctx.fillStyle = 'rgba(80, 60, 100, 0.22)'
  ctx.fillRect(front - 16, 0, 32, h - 30)
  band(front - 16, 0, 32, h - 30)
  for (let y = 16; y < h - 38; y += 24) {
    lozenge(front, y, 10)
    ctx.fillStyle = gold
    ctx.fillRect(front - 12, y + 11, 4, 3)
    ctx.fillRect(front + 8, y + 11, 4, 3)
  }
  // Round the hem.
  ctx.fillStyle = 'rgba(80, 60, 100, 0.22)'
  ctx.fillRect(0, h - 30, w, 26)
  band(0, h - 30, w, 26)
  for (let x = 8; x < w; x += 16) {
    lozenge(x, h - 17, 9)
  }
  // Crosses strewn between, faded further.
  ctx.fillStyle = 'rgba(186, 152, 84, 0.5)'
  for (let i = 0; i < 26; i++) {
    const x = Math.floor(rng() * w)
    const y = Math.floor(rng() * (h - 40))
    if (Math.abs(x - front) < 18) continue
    ctx.fillRect(x - 3, y, 7, 1)
    ctx.fillRect(x, y - 3, 1, 7)
  }
  const texture = artTexture(art)
  texture.wrapS = THREE.RepeatWrapping
  return texture
})

// The binding round his wrist: pale strips wound over darker.
const bindingArt = memo(() => {
  const art = canvas([16, 64], '#5a5450')
  const { ctx } = art
  for (let y = 0; y < 64; y += 8) {
    ctx.fillStyle = '#b7ad9c'
    ctx.fillRect(0, y, 16, 5)
  }
  return artTexture(art)
})

// The rays off the flame, drawn as Tyler drew them: thin strokes out from
// the middle, brightest near it.
const raysTexture = memo(() => {
  const art = canvas([128, 128])
  const { ctx } = art
  const rng = mulberry32(0x5a75)
  ctx.lineWidth = 1
  for (let i = 0; i < 26; i++) {
    const a = (i / 26) * Math.PI * 2 + rng() * 0.1
    const from = 10 + rng() * 6
    const to = 34 + rng() * 28
    const grad = ctx.createLinearGradient(
      64 + Math.cos(a) * from,
      64 + Math.sin(a) * from,
      64 + Math.cos(a) * to,
      64 + Math.sin(a) * to
    )
    grad.addColorStop(0, 'rgba(255, 214, 140, 0.9)')
    grad.addColorStop(1, 'rgba(255, 170, 80, 0)')
    ctx.strokeStyle = grad
    ctx.beginPath()
    ctx.moveTo(64 + Math.cos(a) * from, 64 + Math.sin(a) * from)
    ctx.lineTo(64 + Math.cos(a) * to, 64 + Math.sin(a) * to)
    ctx.stroke()
  }
  return artTexture(art)
})

// A cylinder from `a` to `b`, for a sleeve or the wrist's binding.
function limb(
  material: THREE.Material,
  a: THREE.Vector3,
  b: THREE.Vector3,
  rTop: number,
  rBottom: number
): THREE.Mesh {
  const length = a.distanceTo(b)
  const mesh = new THREE.Mesh(
    new THREE.CylinderGeometry(rTop, rBottom, length, 6),
    material
  )
  mesh.position.copy(a).add(b).multiplyScalar(0.5)
  mesh.quaternion.setFromUnitVectors(
    new THREE.Vector3(0, 1, 0),
    b.clone().sub(a).normalize()
  )
  return mesh
}

// How far the hood bulges out along unit direction (x, y, z): a few
// slow waves, so its outline goes lumpy as Tyler drew it, and the same
// for every copy of a corner, so it stays closed.
function lump(x: number, y: number, z: number): number {
  return (
    1 +
    0.13 * Math.sin(3.1 * x + 1.7 * y + 0.6) +
    0.1 * Math.sin(4.3 * z - 2.2 * y + 1.9) +
    0.07 * Math.sin(6.1 * y + 2.7 * x - 1.1 * z)
  )
}

// The hood's shell, `r` across, open in a round mouth facing +x, lumpy,
// and hanging lower behind, where it drapes over his back.
function hoodShell(r: number): THREE.BufferGeometry {
  const geometry = new THREE.SphereGeometry(
    r,
    14,
    10,
    0,
    Math.PI * 2,
    HOOD.mouth,
    Math.PI - HOOD.mouth
  )
  // The sphere's pole is +y; turned so it faces +x, the cut round it is
  // the mouth.
  geometry.rotateZ(-Math.PI / 2)
  const pos = geometry.getAttribute('position')
  const v = new THREE.Vector3()
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i)
    const d = v.clone().normalize()
    v.multiplyScalar(lump(d.x, d.y, d.z))
    if (d.y < 0 && d.x < 0.2) v.y *= 1 + 0.35 * -d.y * (0.2 - d.x)
    pos.setXYZ(i, v.x * 0.95, v.y * 1.08, v.z * 1.08)
  }
  geometry.computeVertexNormals()
  return geometry
}

// The cloak below the waist: a column flaring to the ground, its hem
// torn into points of different lengths, some lying out on the ground.
function skirt(): THREE.BufferGeometry {
  const height = 1.35
  const geometry = new THREE.CylinderGeometry(0.42, 1.05, height, 20, 3, true)
  const rng = mulberry32(0x7e4a)
  const tear = Array.from({ length: 20 }, (_, k) =>
    k % 2 === 0 ? range(rng, 1.25, 1.9) : range(rng, 0.85, 1.0)
  )
  const pos = geometry.getAttribute('position')
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i)
    const y = pos.getY(i)
    const z = pos.getZ(i)
    if (y > -height / 2 + 1e-3) continue
    // Which point of the hem this corner is (u round the cylinder).
    let a = Math.atan2(x, z)
    if (a < 0) a += Math.PI * 2
    const k = Math.round((a / (Math.PI * 2)) * 20) % 20
    pos.setXYZ(i, x * tear[k], y + 0.02, z * tear[k])
  }
  geometry.translate(0, height / 2, 0)
  geometry.computeVertexNormals()
  return geometry
}

// The rags of the hem lying out over the ground beyond the skirt: a flat
// star of long and short points, the longest reaching
// CONFIG.castle.yard.jericho.spread from his middle.
function rags(material: THREE.Material): THREE.Mesh {
  const rng = mulberry32(0x7a95)
  const points: THREE.Vector2[] = []
  const n = 26
  for (let k = 0; k < n; k++) {
    const a = (k / n) * Math.PI * 2 + range(rng, -0.05, 0.05)
    const long =
      rng() < 0.25 ? CONFIG.castle.yard.jericho.spread : range(rng, 1.25, 1.6)
    const r = k % 2 === 0 ? long : range(rng, 0.95, 1.15)
    points.push(new THREE.Vector2(Math.cos(a) * r, Math.sin(a) * r))
  }
  const mesh = new THREE.Mesh(
    new THREE.ShapeGeometry(new THREE.Shape(points)),
    material
  )
  mesh.rotation.x = -Math.PI / 2
  mesh.position.y = 0.025
  return mesh
}

// A trumpet, gone dull, its loop flat in x-y with the bell toward +x and
// the valves up +y, the mouthpiece at -x, at a real trumpet's size: the
// bell pipe and its flare, the crook back into the middle pipe, the
// leadpipe and mouthpiece beside them, and the three valves with their
// buttons.
function buildTrumpet(): THREE.Group {
  const group = new THREE.Group()
  group.name = 'jericho-trumpet'
  const brass = lambert({ color: '#a8843e', emissive: '#1e1405' })
  const pipe = (
    from: [number, number, number],
    to: [number, number, number],
    r: number
  ) =>
    group.add(
      limb(brass, new THREE.Vector3(...from), new THREE.Vector3(...to), r, r)
    )
  pipe([-0.2, 0, 0], [0.12, 0, 0], 0.008)
  pipe([-0.2, -0.06, 0], [0.02, -0.06, 0], 0.008)
  pipe([-0.3, -0.03, 0.02], [0.02, -0.03, 0.02], 0.007)
  const crook = new THREE.Mesh(
    new THREE.TorusGeometry(0.03, 0.008, 4, 8, Math.PI),
    brass
  )
  crook.rotation.z = Math.PI / 2
  crook.position.set(-0.2, -0.03, 0)
  group.add(crook)
  const bell = new THREE.Mesh(
    new THREE.LatheGeometry(
      [
        [0.009, 0],
        [0.013, 0.1],
        [0.022, 0.18],
        [0.042, 0.24],
        [0.062, 0.26],
      ].map(([x, y]) => new THREE.Vector2(x, y)),
      10
    ),
    lambert({ color: '#a8843e', emissive: '#1e1405', side: THREE.DoubleSide })
  )
  bell.rotation.z = -Math.PI / 2
  bell.position.x = 0.12
  group.add(bell)
  const mouthpiece = new THREE.Mesh(
    new THREE.CylinderGeometry(0.007, 0.016, 0.06, 6),
    brass
  )
  mouthpiece.rotation.z = -Math.PI / 2
  mouthpiece.position.set(-0.33, -0.03, 0.02)
  group.add(mouthpiece)
  for (const x of [0.03, 0.06, 0.09]) {
    pipe([x, -0.085, 0], [x, 0.04, 0], 0.012)
    pipe([x, 0.04, 0], [x, 0.07, 0], 0.004)
    const button = new THREE.Mesh(
      new THREE.CylinderGeometry(0.011, 0.011, 0.006, 6),
      brass
    )
    button.position.set(x, 0.073, 0)
    group.add(button)
  }
  return group
}

// A great horned owl's plumage: mottled brown over the back, and down
// the front (the sphere's u = 0.5 faces +x) buff with dark bars across.
const plumageArt = memo(() => {
  const art = canvas([64, 64], '#6b5136')
  const { ctx, w, h } = art
  const rng = mulberry32(0x0771)
  for (let i = 0; i < 160; i++) {
    ctx.fillStyle = rng() < 0.5 ? '#4a3624' : '#8e714c'
    ctx.fillRect(
      Math.floor(rng() * w),
      Math.floor(rng() * h),
      2,
      1 + Math.floor(rng() * 3)
    )
  }
  ctx.fillStyle = '#b39a74'
  ctx.fillRect(w * 0.3, 0, w * 0.4, h)
  ctx.fillStyle = '#3e2e20'
  for (let y = 2; y < h; y += 4) {
    for (let x = w * 0.3; x < w * 0.7; x += 6) {
      ctx.fillRect(x + Math.floor(rng() * 3), y, 4, 1)
    }
  }
  return artTexture(art)
})

// Where the owl's head looks, in turn, radians off straight ahead, each
// held a few seconds and turned to fast, as an owl's does.
const OWL_LOOKS = [0, 0.9, 0.2, -1.1, 0.5, 2.2, -0.3]
const OWL_HOLD = 3.3
const OWL_TURN = 0.22

// A great horned owl, at its own size: origin under its feet, facing +x.
// The body an egg, the folded wings down its sides, the tail and the
// talons; the head with its ear tufts, its tawny facial disc rimmed
// dark, the white throat, the big yellow eyes and the hooked beak.
// `look(t)` turns the head.
function buildOwl(): { group: THREE.Group; look(t: number): void } {
  const group = new THREE.Group()
  group.name = 'jericho-owl'
  const plumage = lambert({ map: plumageArt('jericho-owl') })
  const wing = lambert({ color: '#55402b' })
  const dark = lambert({ color: '#2e241c' })
  const blob = (
    material: THREE.Material,
    r: number,
    scale: [number, number, number],
    at: [number, number, number]
  ) => {
    const mesh = new THREE.Mesh(new THREE.SphereGeometry(r, 8, 6), material)
    mesh.scale.set(...scale)
    mesh.position.set(...at)
    return mesh
  }
  group.add(blob(plumage, 0.13, [0.85, 1.35, 1], [0, 0.18, 0]))
  for (const side of [-1, 1]) {
    group.add(blob(wing, 0.12, [0.9, 1.25, 0.35], [-0.02, 0.18, side * 0.105]))
    const foot = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.02, 0.035), dark)
    foot.position.set(0.03, 0.01, side * 0.035)
    group.add(foot)
  }
  const tail = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.13, 0.09), wing)
  tail.position.set(-0.1, 0.04, 0)
  tail.rotation.z = 0.35
  group.add(tail)
  const throat = new THREE.Mesh(
    new THREE.BoxGeometry(0.02, 0.035, 0.07),
    lambert({ color: '#e3dccb' })
  )
  throat.position.set(0.1, 0.31, 0)
  group.add(throat)

  const head = new THREE.Group()
  head.position.set(0, 0.39, 0)
  group.add(head)
  head.add(blob(plumage, 0.105, [0.9, 0.85, 1.05], [0, 0, 0]))
  head.add(blob(dark, 0.088, [0.2, 0.92, 1.15], [0.066, 0, 0]))
  head.add(
    blob(
      lambert({ color: '#b9753e' }),
      0.082,
      [0.22, 0.85, 1.05],
      [0.072, 0, 0]
    )
  )
  const iris = new THREE.MeshBasicMaterial({ color: '#f5c518' })
  const pupil = new THREE.MeshBasicMaterial({ color: '#0d0b0a' })
  for (const side of [-1, 1]) {
    const eye = new THREE.Mesh(new THREE.CircleGeometry(0.025, 8), iris)
    eye.rotation.y = Math.PI / 2
    eye.position.set(0.091, 0.012, side * 0.037)
    head.add(eye)
    const black = new THREE.Mesh(new THREE.CircleGeometry(0.012, 6), pupil)
    black.rotation.y = Math.PI / 2
    black.position.set(0.093, 0.012, side * 0.037)
    head.add(black)
    const tuft = new THREE.Mesh(new THREE.ConeGeometry(0.022, 0.085, 4), wing)
    tuft.position.set(-0.005, 0.085, side * 0.055)
    tuft.rotation.set(side * 0.35, 0, 0.2)
    head.add(tuft)
  }
  const beak = new THREE.Mesh(new THREE.ConeGeometry(0.013, 0.035, 4), dark)
  beak.position.set(0.09, -0.025, 0)
  beak.rotation.z = Math.PI + 0.35
  head.add(beak)

  const look = (t: number) => {
    const k = Math.floor(t / OWL_HOLD)
    const from = OWL_LOOKS[(k + OWL_LOOKS.length - 1) % OWL_LOOKS.length]
    const to = OWL_LOOKS[k % OWL_LOOKS.length]
    const u = Math.min(1, (t - k * OWL_HOLD) / OWL_TURN)
    head.rotation.y = from + (to - from) * u * u * (3 - 2 * u)
  }
  return { group, look }
}

export function buildJericho(): JerichoRig {
  const group = new THREE.Group()
  group.name = 'jericho'
  const body = new THREE.Group()
  body.name = 'jericho-body'
  group.add(body)

  // The candle's warmth on what is nearest it: the cloth, a little; his
  // mask and his hand, more.
  const cloak = lambert({
    map: cloakArt('jericho-cloak'),
    emissive: '#0c0703',
  })
  const rag = lambert({ color: '#555456', side: THREE.DoubleSide })
  const skin = lambert({ color: '#d6cfc0', emissive: '#4a2c10' })
  const dark = new THREE.MeshBasicMaterial({
    color: '#0b0a0c',
    side: THREE.BackSide,
  })

  // From the ground up: the rags, the skirt, the body narrowing to the
  // waist and broadening to the shoulders under the hood.
  body.add(rags(rag))
  body.add(new THREE.Mesh(skirt(), cloak))
  const torso = new THREE.Mesh(
    new THREE.CylinderGeometry(0.62, 0.42, 1.0, 9),
    cloak
  )
  torso.position.set(0, 1.82, 0)
  torso.scale.set(0.9, 1, 1.15)
  body.add(torso)

  // The hood, its outside the cloak and its inside the dark, a little
  // forward and tipped down toward the flame.
  const hood = new THREE.Group()
  hood.position.set(HOOD.x, HOOD.y, 0)
  hood.rotation.z = -0.12
  body.add(hood)
  hood.add(new THREE.Mesh(hoodShell(HOOD.r), cloak))
  hood.add(new THREE.Mesh(hoodShell(HOOD.r * 0.95), dark))

  // His mask, hung back in the dark of the hood a little off its middle:
  // a small pale card cut square, one lower corner notched off on a
  // slant, two dashes for eyes near its top.
  const mask = new THREE.Group()
  mask.position.set(0.24, 0.1, 0.1)
  mask.rotation.set(0.06, Math.PI / 2, 0.08)
  hood.add(mask)
  const card = new THREE.Shape(
    [
      [-0.1, 0.16],
      [0.1, 0.16],
      [0.1, -0.04],
      [0.05, -0.02],
      [0.01, -0.16],
      [-0.1, -0.16],
    ].map(([x, y]) => new THREE.Vector2(x, y))
  )
  const face = new THREE.Mesh(
    new THREE.ExtrudeGeometry(card, { depth: 0.03, bevelEnabled: false }),
    skin
  )
  mask.add(face)
  const eyes = lambert({ color: '#141012' })
  for (const x of [-0.045, 0.035]) {
    const eye = new THREE.Mesh(new THREE.BoxGeometry(0.045, 0.014, 0.01), eyes)
    eye.position.set(x, 0.09, 0.035)
    mask.add(eye)
  }

  // The one arm out of the cloak: the sleeve from under the hood down
  // to the elbow and up to the wrist, the wrist bound in strips, the hand
  // round the candle.
  const shoulder = new THREE.Vector3(0.05, 2.2, -0.42)
  const elbow = new THREE.Vector3(0.3, 1.78, -0.36)
  const wrist = new THREE.Vector3(0.6, 1.98, -0.14)
  body.add(limb(cloak, shoulder, elbow, 0.15, 0.17))
  body.add(limb(cloak, elbow, wrist, 0.16, 0.2))
  const bound = new THREE.Vector3(0.66, 2.12, -0.1)
  body.add(
    limb(
      lambert({ map: bindingArt('jericho-binding') }),
      wrist,
      bound,
      0.07,
      0.08
    )
  )
  const hand = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.13, 0.11), skin)
  hand.position.set(0.68, 2.17, -0.1)
  body.add(hand)

  // The candle: a tall thin taper up out of his fist, and its wick.
  const wax = lambert({ color: '#efe4c8', emissive: '#4a3418' })
  const taper = new THREE.Mesh(
    new THREE.CylinderGeometry(0.03, 0.035, 0.34, 6),
    wax
  )
  taper.position.set(FLAME[0], 2.3, FLAME[2])
  body.add(taper)
  const wick = new THREE.Mesh(
    new THREE.BoxGeometry(0.008, 0.04, 0.008),
    lambert({ color: '#1a1410' })
  )
  wick.position.set(FLAME[0], 2.48, FLAME[2])
  body.add(wick)

  // A trumpet slung across his back on a strap over one shoulder, its
  // bell up behind that shoulder, twice a trumpet's size as he is twice a
  // raider's: the loop flat to his back, the valves toward his head.
  const strap = new THREE.Mesh(
    new THREE.TorusGeometry(0.5, 0.02, 4, 18),
    lambert({ color: '#3a2c22' })
  )
  strap.position.set(-0.02, 1.78, 0)
  strap.rotation.x = Math.PI / 2 + 0.47
  strap.scale.set(1.02, 1.25, 1)
  body.add(strap)
  const trumpet = buildTrumpet()
  trumpet.scale.setScalar(2.2)
  const along = new THREE.Vector3(0, 0.45, 0.89)
  const out = new THREE.Vector3(-1, 0, 0)
  trumpet.quaternion.setFromRotationMatrix(
    new THREE.Matrix4().makeBasis(along, out.clone().cross(along), out)
  )
  trumpet.position.set(-0.57, 1.62, 0)
  body.add(trumpet)

  // A great horned owl perched on his other shoulder, over the hood's
  // fold, looking about.
  const owl = buildOwl()
  owl.group.scale.setScalar(1.7)
  owl.group.position.set(0.05, 2.3, -1.05)
  owl.group.rotation.y = 0.25
  body.add(owl.group)

  castShadows(group)
  mergeStatic(body)

  // The flame and its light: an inner core and an outer tongue, the rays,
  // a bright halo close round it and a wide warm one, flickering in
  // update.
  const flame = new THREE.Group()
  flame.position.set(...FLAME)
  body.add(flame)
  const tongue = new THREE.Mesh(
    new THREE.ConeGeometry(0.03, 0.12, 6),
    new THREE.MeshBasicMaterial({ color: '#ffb547' })
  )
  tongue.position.y = 0.06
  flame.add(tongue)
  const core = new THREE.Mesh(
    new THREE.ConeGeometry(0.016, 0.06, 5),
    new THREE.MeshBasicMaterial({ color: '#fff3c8' })
  )
  core.position.y = 0.035
  flame.add(core)
  const rays = makeGlowSprite(raysTexture('jericho-rays'), 1.3)
  rays.position.y = 0.06
  flame.add(rays)
  const halo = makeGlowSprite(makeGlowTexture('rgba(255, 196, 110, 0.85)'), 0.5)
  halo.position.y = 0.06
  flame.add(halo)
  const warmth = makeGlowSprite(makeGlowTexture('rgba(255, 150, 60, 0.3)'), 3.4)
  warmth.position.y = 0.05
  flame.add(warmth)

  const update = (t: number) => {
    const flicker =
      Math.sin(t * 11.3) * 0.5 +
      Math.sin(t * 17.9 + 1.3) * 0.3 +
      Math.sin(t * 5.1 + 0.4) * 0.2
    tongue.scale.set(1 - flicker * 0.08, 1 + flicker * 0.18, 1 - flicker * 0.08)
    tongue.rotation.z = Math.sin(t * 3.7) * 0.08
    tongue.rotation.x = Math.sin(t * 2.9 + 0.8) * 0.06
    rays.material.rotation = t * 0.15
    rays.scale.setScalar(1.3 + flicker * 0.1)
    halo.scale.setScalar(0.5 + flicker * 0.05)
    warmth.scale.setScalar(3.4 + flicker * 0.25)
    owl.look(t)
  }
  update(0)
  setMotion(group, update)
  return { group, body, update }
}
