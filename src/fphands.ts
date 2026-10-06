// The player's own hands in first person, hung off the camera: the left
// holds the flashlight, the right holds up whatever was just used. Each
// comes up from below the frame by its lift (hands.ts) and goes back down
// out of view. The forearms are the outfit's own (figure.ts buildForearm).
//
// The one real light of the flashlight rides here, aimed down the middle
// of the view, so what it lights is about what the beam burns
// (shadowmen.ts, along the line of sight).
// It never leaves the scene: off is intensity 0, so the scene's light
// count, and every lit material's program, stays the same.

import * as THREE from 'three'
import { buildFlashlight, buildPickup, meshBounds } from './assets.ts'
import { CONFIG } from './config.ts'
import { buildForearm } from './figure.ts'
import { GLOW_LAYER } from './glow.ts'
import type { Flashlight } from './assets.ts'
import type { OutfitId } from './outfits.ts'

export interface HandsFrame {
  // 0 out of view, 1 held up: hands.ts lifts, already eased.
  left: number
  right: number
  // What the right hand holds, or null for an empty hand.
  kind: string | null
  // The flashlight is lit.
  on: boolean
}

// Camera space: -Z ahead, +Y up, +X right. Each forearm's elbow sits low
// and to its side, a little behind the near plane, so the arm comes in
// from the bottom corner; the forearm points ahead, tipped up and in.
interface Arm {
  at: THREE.Vector3
  tilt: number
  turn: number
}
const LEFT: Arm = {
  at: new THREE.Vector3(-0.2, -0.3, 0.02),
  tilt: 0.38,
  turn: -0.22,
}
// The left arm, mirrored.
const RIGHT: Arm = {
  at: new THREE.Vector3(-LEFT.at.x, LEFT.at.y, LEFT.at.z),
  tilt: LEFT.tilt,
  turn: -LEFT.turn,
}
// A lowered hand drops this far and tips this much further down.
const DROP = 0.42
const DIP = 0.7
// The item in the right hand is scaled to this size across, in metres,
// and sits up out of the fist.
const HELD_SIZE = 0.07
// The flashlight lens, roughly, in camera space: the spot starts there.
const LENS = new THREE.Vector3(-0.08, -0.12, -0.38)

export class FirstPersonHands {
  readonly group: THREE.Group
  readonly light: THREE.SpotLight
  private flashlight: Flashlight
  private left: THREE.Group
  private right: THREE.Group
  // Keeps the held item upright in the view whatever the arm is doing.
  private holder: THREE.Group
  private held: { kind: string; object: THREE.Object3D } | null = null
  private items = new Map<string, THREE.Object3D>()

  constructor(camera: THREE.Camera, outfitId: OutfitId) {
    this.group = new THREE.Group()
    this.group.name = 'hands'
    camera.add(this.group)

    this.flashlight = buildFlashlight()
    this.holder = new THREE.Group()
    this.left = new THREE.Group()
    this.right = new THREE.Group()
    this.group.add(this.left, this.right)
    this.dress(outfitId)

    const { color, distance, angle, penumbra } = CONFIG.flashlight
    this.light = new THREE.SpotLight(color, 0, distance, angle, penumbra, 2)
    this.light.position.copy(LENS)
    // Down the view, dipping to meet the ground some 20 m out.
    this.light.target.position.set(0, -1.2, -20)
    this.light.layers.enable(GLOW_LAYER)
    this.group.add(this.light, this.light.target)
  }

  // New forearms for a new character from Gron; the flashlight and the
  // item move across.
  restyle(outfitId: OutfitId): void {
    this.dress(outfitId)
  }

  update({ left, right, kind, on }: HandsFrame): void {
    this.flashlight.setOn(on)
    this.light.intensity = on ? CONFIG.flashlight.intensity : 0
    place(this.left, LEFT, left)
    this.hold(right > 0 ? kind : null)
    place(this.right, RIGHT, right)
    this.holder.quaternion.copy(this.right.quaternion).invert()
  }

  private dress(outfitId: OutfitId): void {
    this.left.clear()
    this.right.clear()
    const left = buildForearm(outfitId)
    const right = buildForearm(outfitId)
    this.left.add(left.group)
    this.right.add(right.group)
    // The barrel's +Z down the forearm's -Y, as a peer holds it.
    this.flashlight.group.rotation.x = Math.PI / 2
    left.fist.add(this.flashlight.group)
    right.fist.add(this.holder)
    for (const arm of [this.left, this.right]) {
      arm.traverse((o) => {
        o.castShadow = false
      })
    }
  }

  // The item kind in the right hand: each kind is built once, the first
  // time it is used, and kept.
  private hold(kind: string | null): void {
    if (this.held?.kind === kind) return
    if (this.held) this.holder.remove(this.held.object)
    this.held = null
    if (!kind) return
    let object = this.items.get(kind)
    if (!object) {
      object = fitted(buildPickup(kind, undefined, { glow: false }))
      this.items.set(kind, object)
    }
    this.holder.add(object)
    this.held = { kind, object }
  }
}

// A hand at its lift: down out of view at 0, at its spot at 1.
function place(arm: THREE.Group, spot: Arm, lift: number): void {
  arm.visible = lift > 0
  const down = 1 - lift
  arm.position.set(spot.at.x, spot.at.y - down * DROP, spot.at.z)
  // The forearm's -Y turned ahead (-Z) and tipped up by tilt, then in.
  arm.rotation.set(Math.PI / 2 + spot.tilt - down * DIP, spot.turn, 0, 'YXZ')
}

// An item scaled to sit up out of a hand, turned three quarters to the
// view.
function fitted(object: THREE.Object3D): THREE.Object3D {
  const box = meshBounds(object)
  const size = box.getSize(new THREE.Vector3())
  const centre = box.getCenter(new THREE.Vector3())
  const scale = HELD_SIZE / Math.max(size.x, size.y, size.z, 1e-3)
  object.position.copy(centre).multiplyScalar(-scale)
  object.position.y += HELD_SIZE * 0.7
  object.scale.setScalar(scale)
  const grip = new THREE.Group()
  grip.add(object)
  // Tipped back toward the eye, which looks down on the hand.
  grip.rotation.set(0.45, -0.6, 0, 'YXZ')
  grip.traverse((o) => {
    o.castShadow = false
  })
  return grip
}
