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
import { mulberry32 } from './rng.ts'

// Jericho, the Candlebearer, sat on a block of concrete beside the
// payphone on Castle Entropy's rim (castleyard.ts jerichoSpot): twice a
// raider's height were he to stand, wrapped in a grey cloak gone soft
// with age, its embroidery (gold scrollwork, purple lozenges) faded nearly
// to the grey, the hood up round a face of flat facets set crooked, one
// eye a triangle and the other a narrow diamond higher up. He holds a
// candle in both hands before his chest, its flame warm on his face and
// his hands and glowing so he can be found across the yard. Origin on the
// ground under him, facing +x. Call update(t) every frame with a running
// time, for the flame.

export interface JerichoRig {
  group: THREE.Group
  // Him alone, without the block he sits on, for the ring that marks him
  // as the one E talks to (glow.ts).
  body: THREE.Group
  update(t: number): void
}

// How tall he would stand, against a raider's 1.8 m: the parts below are
// laid out at this scale.
export const JERICHO_HEIGHT = 3.6

// Where the candle's flame burns, in his own space.
const FLAME: [number, number, number] = [0.62, 1.86, 0]

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
  const gold = 'rgba(186, 152, 84, 0.85)'
  const purple = 'rgba(112, 80, 140, 0.85)'
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
  ctx.fillStyle = 'rgba(80, 60, 100, 0.45)'
  ctx.fillRect(front - 16, 0, 32, h - 30)
  band(front - 16, 0, 32, h - 30)
  for (let y = 16; y < h - 38; y += 24) {
    lozenge(front, y, 10)
    ctx.fillStyle = gold
    ctx.fillRect(front - 12, y + 11, 4, 3)
    ctx.fillRect(front + 8, y + 11, 4, 3)
  }
  // Round the hem.
  ctx.fillStyle = 'rgba(80, 60, 100, 0.45)'
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

// A box from `a` to `b`, `r` thick, for a sleeve or a shin.
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

// His head: a low faceted solid, each corner pushed a little off true by
// its own draw, so no side of it matches the other.
function facetedHead(material: THREE.Material): THREE.Mesh {
  const geometry = new THREE.IcosahedronGeometry(0.27, 0)
  const rng = mulberry32(0x1e71c0)
  const pos = geometry.getAttribute('position')
  // An unindexed solid repeats each corner per face: push every copy of
  // a corner the same way so the facets stay closed.
  const pushed = new Map<string, [number, number, number]>()
  for (let i = 0; i < pos.count; i++) {
    const key = [pos.getX(i), pos.getY(i), pos.getZ(i)]
      .map((v) => v.toFixed(3))
      .join(',')
    let push = pushed.get(key)
    if (!push) {
      push = [
        (rng() - 0.5) * 0.09,
        (rng() - 0.5) * 0.09,
        (rng() - 0.5) * 0.09 + (pos.getZ(i) > 0 ? 0.03 : 0),
      ]
      pushed.set(key, push)
    }
    pos.setXYZ(
      i,
      pos.getX(i) * 0.92 + push[0],
      pos.getY(i) * 1.3 + push[1],
      pos.getZ(i) * 0.82 + push[2]
    )
  }
  geometry.computeVertexNormals()
  return new THREE.Mesh(geometry, material)
}

// A flat shape facing +x, from points (z, y) on the face.
function facePlate(
  material: THREE.Material,
  points: [number, number][]
): THREE.Mesh {
  const shape = new THREE.Shape(points.map(([z, y]) => new THREE.Vector2(z, y)))
  const mesh = new THREE.Mesh(new THREE.ShapeGeometry(shape), material)
  mesh.rotation.y = Math.PI / 2
  return mesh
}

export function buildJericho(): JerichoRig {
  const group = new THREE.Group()
  group.name = 'jericho'

  // The block he sits on.
  const block = new THREE.Mesh(
    new THREE.BoxGeometry(1.1, 0.8, 1.4),
    lambert({ color: '#8b8781' })
  )
  block.position.set(-0.35, 0.4, 0)
  block.name = 'jericho-seat'
  group.add(block)

  const body = new THREE.Group()
  body.name = 'jericho-body'
  group.add(body)

  // The candle's warmth on what is nearest it: the cloth, a little; his
  // face and hands, more.
  const cloak = lambert({
    map: cloakArt('jericho-cloak'),
    emissive: '#0c0703',
  })
  const lining = lambert({ color: '#3d3a3b', side: THREE.DoubleSide })
  const skin = lambert({
    color: '#bdb5a6',
    emissive: '#3a220c',
    flatShading: true,
  })
  const boots = lambert({ color: '#2a2624' })
  const shadowFace = lambert({ color: '#7a7064', flatShading: true })

  // The cloak below the waist, falling from his hips over the block to
  // the ground, wider at the hem.
  const skirt = new THREE.Mesh(
    new THREE.CylinderGeometry(0.55, 0.95, 0.95, 7, 1, true),
    cloak
  )
  skirt.position.set(-0.2, 0.475, 0)
  skirt.scale.set(1, 1, 1.15)
  body.add(skirt)
  // His thighs out over the block's edge, and the cloak hanging off his
  // knees down to his boots.
  const lap = new THREE.Mesh(new THREE.BoxGeometry(0.85, 0.3, 1.0), cloak)
  lap.position.set(0.25, 0.92, 0)
  body.add(lap)
  const fall = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.9, 1.05), cloak)
  fall.position.set(0.62, 0.5, 0)
  fall.rotation.z = -0.08
  body.add(fall)
  for (const z of [-0.26, 0.26]) {
    const boot = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.16, 0.24), boots)
    boot.position.set(0.82, 0.08, z)
    body.add(boot)
  }

  // His chest and shoulders, broad, stooped a little toward the flame.
  const torso = new THREE.Mesh(
    new THREE.CylinderGeometry(0.4, 0.56, 1.15, 7),
    cloak
  )
  torso.position.set(-0.12, 1.6, 0)
  torso.scale.set(0.95, 1, 1.3)
  torso.rotation.z = -0.12
  body.add(torso)
  // A mantle over the shoulders.
  const mantle = new THREE.Mesh(
    new THREE.CylinderGeometry(0.3, 0.62, 0.32, 7),
    cloak
  )
  mantle.position.set(-0.03, 2.12, 0)
  mantle.scale.set(1, 1, 1.25)
  mantle.rotation.z = -0.12
  body.add(mantle)

  // The arms in their wide sleeves, from the shoulders down and in to
  // the hands cupped round the candle.
  for (const side of [-1, 1]) {
    const shoulder = new THREE.Vector3(-0.05, 2.0, side * 0.6)
    const elbow = new THREE.Vector3(0.12, 1.45, side * 0.66)
    const wrist = new THREE.Vector3(0.52, 1.6, side * 0.16)
    body.add(limb(cloak, shoulder, elbow, 0.16, 0.18))
    body.add(limb(cloak, elbow, wrist, 0.17, 0.24))
    const hand = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.1, 0.13), skin)
    hand.position.set(0.6, 1.6, side * 0.09)
    hand.rotation.x = side * 0.3
    body.add(hand)
  }

  // The candle: a brass dish in his hands, the wax with a run down one
  // side, and the wick.
  const brass = lambert({ color: '#9c7a3a', emissive: '#3a2408' })
  const wax = lambert({ color: '#efe4c8', emissive: '#4a3418' })
  const dish = new THREE.Mesh(
    new THREE.CylinderGeometry(0.15, 0.11, 0.04, 8),
    brass
  )
  dish.position.set(FLAME[0], 1.66, FLAME[2])
  body.add(dish)
  const stick = new THREE.Mesh(
    new THREE.CylinderGeometry(0.06, 0.065, 0.12, 7),
    wax
  )
  stick.position.set(FLAME[0], 1.74, FLAME[2])
  body.add(stick)
  const run = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.07, 0.025), wax)
  run.position.set(FLAME[0] + 0.05, 1.73, FLAME[2] + 0.03)
  body.add(run)
  const wick = new THREE.Mesh(
    new THREE.BoxGeometry(0.008, 0.04, 0.008),
    lambert({ color: '#1a1410' })
  )
  wick.position.set(FLAME[0], 1.82, FLAME[2])
  body.add(wick)

  // The hood: a shell open at the front over a dark lining, peaked.
  const gap = 1.7
  const hood = new THREE.Mesh(
    new THREE.SphereGeometry(0.42, 8, 5, Math.PI + gap / 2, Math.PI * 2 - gap),
    cloak
  )
  hood.position.set(-0.04, 2.5, 0)
  hood.scale.set(1, 1.3, 1)
  body.add(hood)
  const inside = new THREE.Mesh(
    new THREE.SphereGeometry(0.4, 8, 5, Math.PI + gap / 2, Math.PI * 2 - gap),
    lining
  )
  inside.position.copy(hood.position)
  inside.scale.copy(hood.scale)
  body.add(inside)
  const peak = new THREE.Mesh(new THREE.ConeGeometry(0.18, 0.3, 5), cloak)
  peak.position.set(-0.16, 3.0, 0)
  peak.rotation.z = 0.5
  body.add(peak)

  // His face, set crooked in the hood: the faceted head tipped and
  // turned a little off true, one cheek a darker plane, a triangle for
  // the left eye and a narrow diamond higher for the right, and a mouth
  // cut on a slant. The eyes take the flame's colour.
  const head = new THREE.Group()
  head.position.set(0.04, 2.45, 0)
  head.rotation.set(0.08, 0.1, -0.06)
  body.add(head)
  head.add(facetedHead(skin))
  const front = 0.255
  const cheek = facePlate(shadowFace, [
    [0.02, -0.06],
    [0.2, 0.0],
    [0.15, -0.2],
    [0.02, -0.26],
  ])
  cheek.position.x = front - 0.02
  head.add(cheek)
  const ember = new THREE.MeshBasicMaterial({
    color: '#ffcf7a',
    side: THREE.DoubleSide,
  })
  const leftEye = facePlate(ember, [
    [-0.16, 0.02],
    [-0.03, 0.06],
    [-0.1, 0.13],
  ])
  leftEye.position.x = front + 0.012
  head.add(leftEye)
  const rightEye = facePlate(ember, [
    [0.09, 0.08],
    [0.12, 0.17],
    [0.15, 0.08],
    [0.12, 0.0],
  ])
  rightEye.position.x = front + 0.005
  head.add(rightEye)
  const mouth = facePlate(
    lambert({ color: '#2a2220', side: THREE.DoubleSide }),
    [
      [-0.12, -0.15],
      [0.07, -0.11],
      [0.07, -0.135],
      [-0.12, -0.17],
    ]
  )
  mouth.position.x = front - 0.01
  head.add(mouth)

  castShadows(group)
  mergeStatic(body)

  // The flame and its light: an inner core and an outer tongue, a bright
  // halo close round it and a wide warm one, flickering in update.
  const flame = new THREE.Group()
  flame.position.set(...FLAME)
  body.add(flame)
  const tongue = new THREE.Mesh(
    new THREE.ConeGeometry(0.035, 0.13, 6),
    new THREE.MeshBasicMaterial({ color: '#ffb547' })
  )
  tongue.position.y = 0.065
  flame.add(tongue)
  const core = new THREE.Mesh(
    new THREE.ConeGeometry(0.018, 0.07, 5),
    new THREE.MeshBasicMaterial({ color: '#fff3c8' })
  )
  core.position.y = 0.04
  flame.add(core)
  const halo = makeGlowSprite(makeGlowTexture('rgba(255, 196, 110, 0.85)'), 0.6)
  halo.position.y = 0.07
  flame.add(halo)
  const warmth = makeGlowSprite(
    makeGlowTexture('rgba(255, 150, 60, 0.32)'),
    3.4
  )
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
    halo.scale.setScalar(0.6 + flicker * 0.05)
    warmth.scale.setScalar(3.4 + flicker * 0.25)
  }
  update(0)
  setMotion(group, update)
  return { group, body, update }
}
