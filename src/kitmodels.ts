import * as THREE from 'three'
import {
  lambert,
  makeGlowSprite,
  makeGlowTexture,
  setPulseMaterials,
} from './assetkit.ts'
import { buildFlashlight } from './props.ts'
import type { PickupOptions } from './assetkit.ts'

// What every raider carries (sharedworld.ts rule 37), as the pack, the
// hotbar and the hand show it: the flashlight lying down, the Citgo
// phone, and Matthew Marx's whistle, an old brass police whistle on a
// waxed cord. Origin at ground level under the middle, real sizes in
// metres.

// A soft halo behind a pickup, as the others wear it.
function halo(group: THREE.Group, height: number, glow: boolean): void {
  if (!glow) return
  const sprite = makeGlowSprite(
    makeGlowTexture('rgba(230, 205, 140, 0.35)'),
    0.5
  )
  sprite.position.y = height / 2
  group.add(sprite)
}

// The flashlight the hand holds (props.ts), laid on its side, dark.
export function buildFlashlightItem({
  glow = true,
}: PickupOptions = {}): THREE.Group {
  const group = new THREE.Group()
  group.name = 'flashlight-item'
  const light = buildFlashlight()
  light.setOn(false)
  light.group.rotation.y = Math.PI / 5
  light.group.position.y = 0.03
  group.add(light.group)
  halo(group, 0.06, glow)
  return group
}

// A cheap black candybar phone, face up: the keypad under a small screen
// lit the portal's blue.
export function buildCitgoPhone({
  glow = true,
}: PickupOptions = {}): THREE.Group {
  const w = 0.05
  const h = 0.11
  const d = 0.018
  const group = new THREE.Group()
  group.name = 'citgo-phone'
  const body = lambert({ color: '#0b0f14' })
  const key = lambert({ color: '#2a2f38' })
  const screen = lambert({
    color: '#1d3a66',
    emissive: new THREE.Color('#6aa8ff'),
    emissiveIntensity: 0.6,
  })
  const shell = new THREE.Mesh(new THREE.BoxGeometry(w, d, h), body)
  shell.position.y = d / 2
  group.add(shell)
  const glass = new THREE.Mesh(
    new THREE.BoxGeometry(w * 0.72, 0.002, h * 0.32),
    screen
  )
  glass.position.set(0, d + 0.001, -h * 0.22)
  group.add(glass)
  // Twelve keys, three across and four down.
  for (let row = 0; row < 4; row++) {
    for (let col = 0; col < 3; col++) {
      const pad = new THREE.Mesh(
        new THREE.BoxGeometry(w * 0.2, 0.003, h * 0.07),
        key
      )
      pad.position.set(
        (col - 1) * w * 0.27,
        d + 0.0015,
        h * 0.06 + row * h * 0.095
      )
      group.add(pad)
    }
  }
  // A stub of an antenna at the top corner.
  const antenna = new THREE.Mesh(
    new THREE.CylinderGeometry(0.004, 0.004, 0.02, 6),
    body
  )
  antenna.rotation.x = Math.PI / 2
  antenna.position.set(w * 0.32, d * 0.7, -h / 2 - 0.009)
  group.add(antenna)
  group.rotation.y = -Math.PI / 7
  halo(group, d, glow)
  setPulseMaterials(group, [screen])
  return group
}

// An antique brass police whistle, the kind with a ball in the barrel: a
// short tube, the mouthpiece flattened, the bell's slot on top, and a
// ring at the back threaded on a loop of waxed cord. Worn dull and
// dented, older than the truck.
export function buildMarxWhistle({
  glow = true,
}: PickupOptions = {}): THREE.Group {
  const r = 0.011
  const length = 0.06
  const group = new THREE.Group()
  group.name = 'marx-whistle'
  const brass = lambert({
    color: '#a8873e',
    emissive: new THREE.Color('#2a1f08'),
  })
  const dark = lambert({ color: '#2b2416' })
  const cord = lambert({ color: '#3a2a1a' })
  // The barrel along +X, lying.
  const barrel = new THREE.Mesh(
    new THREE.CylinderGeometry(r, r, length * 0.6, 10),
    brass
  )
  barrel.rotation.z = Math.PI / 2
  barrel.position.set(length * 0.05, r, 0)
  group.add(barrel)
  // The barrel's closed end, a flat cap.
  const cap = new THREE.Mesh(new THREE.CircleGeometry(r, 10), brass)
  cap.rotation.y = Math.PI / 2
  cap.position.set(length * 0.35, r, 0)
  group.add(cap)
  // The mouthpiece, flattened, toward -X.
  const mouth = new THREE.Mesh(
    new THREE.BoxGeometry(length * 0.42, r * 0.7, r * 1.5),
    brass
  )
  mouth.position.set(-length * 0.42, r * 1.25, 0)
  group.add(mouth)
  const lip = new THREE.Mesh(
    new THREE.BoxGeometry(0.002, r * 0.25, r * 1.1),
    dark
  )
  lip.position.set(-length * 0.63, r * 1.3, 0)
  group.add(lip)
  // The slot on top where the note comes out.
  const slot = new THREE.Mesh(
    new THREE.BoxGeometry(r * 0.9, 0.002, r * 1.2),
    dark
  )
  slot.position.set(-length * 0.15, r * 2 + 0.001, 0)
  group.add(slot)
  // A dent in the barrel's flank, a flat facet catching the light.
  const dent = new THREE.Mesh(
    new THREE.BoxGeometry(r * 0.8, r * 0.5, 0.002),
    lambert({ color: '#8a6d2e' })
  )
  dent.position.set(length * 0.18, r * 1.1, r * 0.98)
  dent.rotation.y = 0.3
  group.add(dent)
  // The ring at the closed end, and the cord looped through it.
  const ring = new THREE.Mesh(
    new THREE.TorusGeometry(r * 0.6, r * 0.15, 5, 10),
    brass
  )
  ring.position.set(length * 0.35 + r * 0.6, r, 0)
  group.add(ring)
  const loop = new THREE.Mesh(
    new THREE.TorusGeometry(0.035, 0.0025, 4, 16),
    cord
  )
  loop.rotation.x = Math.PI / 2
  loop.position.set(length * 0.35 + r * 1.2 + 0.035, 0.003, 0)
  group.add(loop)
  group.rotation.y = Math.PI / 6
  halo(group, r * 2, glow)
  setPulseMaterials(group, [brass])
  return group
}
