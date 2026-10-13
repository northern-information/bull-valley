import * as THREE from 'three'
import {
  lambert,
  makeGlowSprite,
  makeGlowTexture,
  setMotion,
} from './assetkit.ts'
import { CONFIG } from './config.ts'
import { applyPS1 } from './ps1.ts'
import { mulberry32, range } from './rng.ts'

// --- The Caretaker -------------------------------------------------------

// The shade that keeps the corn maze (caretaker.ts): a tall hooded shroud
// with no feet, its hem torn into rags that never touch the ground, two
// pale pinpoints under the hood, arms too long hanging at its sides, and a
// lantern of cold light swinging from its right hand, so it shows down a
// corridor before it turns the corner. A dark smudge of air hangs round
// it. update(t) bobs it, sways it, swings the lantern and flickers the
// eyes; setBurn(0..1) pales it as two beams unmake it; setStrike(windup,
// lunge), each 0 to 1, draws the lantern back flaring as it winds up and
// swings it out as it lurches forward. Origin on the ground under it; it
// floats CONFIG.caretaker.hover over that, facing +Z.
export interface CaretakerRig {
  group: THREE.Group
  update(t: number): void
  setBurn(burn: number): void
  setStrike(windup: number, lunge: number): void
}

const CARETAKER_BODY = new THREE.Color('#050508')
const CARETAKER_PALE = new THREE.Color('#5d6070')

export function buildCaretaker(seed = 0xca2e): CaretakerRig {
  const rng = mulberry32(seed)
  const group = new THREE.Group()
  group.name = 'caretaker'
  const body = new THREE.Group()
  body.position.y = CONFIG.caretaker.hover
  group.add(body)
  const shroud = applyPS1(
    new THREE.MeshBasicMaterial({
      color: CARETAKER_BODY,
      side: THREE.DoubleSide,
    })
  )

  // The shroud, turned on a lathe from the shoulders down to the hem, wider
  // as it falls; then the hem's ring torn ragged, every other vertex pulled
  // up or down.
  const profile = [
    new THREE.Vector2(0.06, 2.55),
    new THREE.Vector2(0.3, 2.3),
    new THREE.Vector2(0.38, 2.1),
    new THREE.Vector2(0.42, 1.6),
    new THREE.Vector2(0.5, 1.0),
    new THREE.Vector2(0.62, 0.35),
    new THREE.Vector2(0.7, 0),
  ]
  const segments = 12
  const robe = new THREE.LatheGeometry(profile, segments)
  const position = robe.getAttribute('position')
  for (let i = 0; i < position.count; i++) {
    if (position.getY(i) > 0.01) continue
    position.setY(i, i % 2 ? range(rng, -0.45, -0.1) : range(rng, 0, 0.25))
  }
  robe.computeVertexNormals()
  body.add(new THREE.Mesh(robe, shroud))

  // The hood: a cone forward over the head, and the void under it.
  const hood = new THREE.Mesh(new THREE.ConeGeometry(0.3, 0.75, 7), shroud)
  hood.position.set(0, 2.7, -0.03)
  hood.rotation.x = -0.25
  body.add(hood)
  const face = new THREE.Mesh(
    new THREE.CircleGeometry(0.17, 8),
    applyPS1(new THREE.MeshBasicMaterial({ color: '#000000' }))
  )
  face.position.set(0, 2.5, 0.2)
  body.add(face)
  const eyeMaterial = applyPS1(
    new THREE.MeshBasicMaterial({ color: '#e8f4ec', fog: false })
  )
  const eyes = new THREE.Group()
  for (const side of [-1, 1]) {
    const eye = new THREE.Mesh(
      new THREE.SphereGeometry(0.022, 4, 3),
      eyeMaterial
    )
    eye.position.set(side * 0.06, 2.52, 0.24)
    eyes.add(eye)
  }
  body.add(eyes)

  // Arms too long, hanging a little out from the shroud, bony fingers past
  // the hem's highest rag.
  const hands: THREE.Group[] = []
  for (const side of [-1, 1]) {
    const arm = new THREE.Group()
    arm.position.set(side * 0.36, 2.2, 0.02)
    arm.rotation.z = side * 0.1
    const sleeve = new THREE.Mesh(
      new THREE.CylinderGeometry(0.07, 0.11, 1.35, 5),
      shroud
    )
    sleeve.position.y = -0.68
    arm.add(sleeve)
    const hand = new THREE.Group()
    hand.position.y = -1.38
    for (let f = 0; f < 3; f++) {
      const finger = new THREE.Mesh(
        new THREE.CylinderGeometry(0.008, 0.016, 0.28, 3),
        shroud
      )
      finger.position.set((f - 1) * 0.03, -0.14, 0)
      finger.rotation.x = (f - 1) * 0.15
      hand.add(finger)
    }
    arm.add(hand)
    body.add(arm)
    hands.push(hand)
  }

  // The lantern, from the right hand on a short bail: a dark frame round a
  // cold flame, and the glow it throws.
  const lantern = new THREE.Group()
  lantern.position.y = -0.2
  hands[1].add(lantern)
  const frame = lambert({ color: '#1d1f22' })
  const cage = new THREE.Mesh(
    new THREE.CylinderGeometry(0.08, 0.1, 0.22, 6, 1, true),
    frame
  )
  cage.position.y = -0.2
  lantern.add(cage)
  const cap = new THREE.Mesh(new THREE.ConeGeometry(0.1, 0.08, 6), frame)
  cap.position.y = -0.05
  lantern.add(cap)
  const flameMaterial = applyPS1(
    new THREE.MeshBasicMaterial({ color: '#9ff0c8', fog: false })
  )
  const flame = new THREE.Mesh(
    new THREE.OctahedronGeometry(0.05, 0),
    flameMaterial
  )
  flame.position.y = -0.2
  lantern.add(flame)
  const lanternGlow = makeGlowSprite(
    makeGlowTexture('rgba(159, 240, 200, 0.6)'),
    1.6
  )
  lanternGlow.position.y = -0.2
  lantern.add(lanternGlow)

  // The smudge of dark air round it, drawn over what stands behind.
  const smudge = new THREE.Sprite(
    new THREE.SpriteMaterial({
      map: makeGlowTexture('rgba(4, 4, 8, 0.75)'),
      depthWrite: false,
      transparent: true,
    })
  )
  smudge.scale.set(2.6, 3.6, 1)
  smudge.position.y = 1.4
  body.add(smudge)

  // Striking: drawn back over the windup, thrown out over the lunge.
  let rear = 0
  let slam = 0
  const update = (t: number) => {
    body.position.y = CONFIG.caretaker.hover + Math.sin(t * 1.3) * 0.12
    body.position.z = -0.2 * rear + 0.7 * slam
    body.rotation.z = Math.sin(t * 0.7) * 0.04
    body.rotation.x = -0.12 * rear + 0.3 * slam
    lantern.rotation.x = Math.sin(t * 1.9) * 0.35 * (1 - rear) - 1.3 * rear
    lantern.rotation.x += 1.9 * slam
    lantern.rotation.z = Math.sin(t * 1.3 + 1) * 0.15
    // The eyes go out now and then, for a blink's length; never mid-strike.
    eyes.visible =
      rear + slam > 0 || Math.sin(t * 0.9) * Math.sin(t * 2.3) < 0.92
    const breath = 0.8 + 0.2 * Math.sin(t * 5.1) * Math.sin(t * 1.7)
    flameMaterial.color.setRGB(0.62 * breath, 0.94 * breath, 0.78 * breath)
    // It flares as it winds up.
    lanternGlow.material.opacity = Math.min(1, 0.7 + 0.3 * breath + rear)
    lanternGlow.scale.setScalar(1.6 * (1 + 0.8 * rear + 0.5 * slam))
  }
  update(0)
  setMotion(group, update)
  return {
    group,
    update,
    setBurn(burn) {
      shroud.color.lerpColors(CARETAKER_BODY, CARETAKER_PALE, burn)
    },
    setStrike(windup, lunge) {
      rear = Math.min(1, Math.max(0, windup))
      slam = Math.sin(Math.PI * Math.min(1, Math.max(0, lunge)))
    },
  }
}
