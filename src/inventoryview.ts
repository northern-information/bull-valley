// The inventory carousel in 3D: one model per ring item on a flat ellipse,
// the selected item at front-center, spinning, the rest receding around the
// back. Its own scene and camera, drawn by the game's renderer in place of
// the world while the inventory is open, so the PS1 snap and downscale
// apply. Ring membership and selection come from carousel.ts.

import * as THREE from 'three'
import { buildPickup, buildSack, meshBounds } from './assets.ts'
import { wrapDelta } from './carousel.ts'
import { drinkFitHeight } from './drinks.ts'
import { isDrink } from './items.ts'
import type { RingItem } from './interfaces.ts'

// Ring radii (x across the screen, z toward the camera), the size every
// model is fitted to, and how fast things move.
// The cell fits the selected item inside the DOM frame (34vh).
const RING = { rx: 1.4, rz: 1.1, cell: 0.55 }
const EASE_PER_SECOND = 14
const SPIN_PER_SECOND = 0.9
const REST_YAW = 0.45
const TILT = 0.3
// A long ring would pack its items shoulder to shoulder, so the spacing
// never drops below this many slots per turn; the rest hide behind.
const MAX_SLOTS_PER_TURN = 9

function buildModel(kind: string): THREE.Object3D {
  if (kind === 'sack') return buildSack()
  return buildPickup(kind, 0x5ac, { glow: false })
}

// A ring slot: the fitted model inside its spinner, inside its holder.
export interface InventorySlot {
  kind: string
  holder: THREE.Group
  spinner: THREE.Group
}

// A model scaled to fit the cell and centered on its own mesh bounds, inside
// a spinner (yaw and tilt) inside a holder (place on the ring). Drinks share
// one scale per family (cans, bottles), so sizes stay true within it.
function buildSlot(kind: string): InventorySlot {
  const model = buildModel(kind)
  const box = meshBounds(model)
  const size = box.getSize(new THREE.Vector3())
  const center = box.getCenter(new THREE.Vector3())
  const fit = isDrink(kind)
    ? drinkFitHeight(kind)
    : Math.max(size.x, size.y, size.z, 1e-3)
  const scale = RING.cell / fit
  model.scale.setScalar(scale)
  model.position.copy(center).multiplyScalar(-scale)
  const spinner = new THREE.Group()
  spinner.rotation.set(TILT, REST_YAW, 0, 'YXZ')
  spinner.add(model)
  const holder = new THREE.Group()
  holder.add(spinner)
  return { kind, holder, spinner }
}

export interface InventoryView {
  scene: THREE.Scene
  camera: THREE.PerspectiveCamera
  setAspect(aspect: number): void
  snapTo(index: number): void
  update(dt: number, items: readonly RingItem[], index: number): void
}

export function createInventoryView(): InventoryView {
  const scene = new THREE.Scene()
  scene.background = new THREE.Color('#000000')
  scene.add(new THREE.HemisphereLight('#ffffff', '#3a3a3a', 2.2))
  const key = new THREE.DirectionalLight('#ffffff', 1.5)
  key.position.set(0.6, 1, 0.9)
  scene.add(key)

  // Looking slightly down at the front of the ring, so the selected item
  // sits at screen center inside the DOM frame and the back rises behind.
  const camera = new THREE.PerspectiveCamera(36, 1, 0.05, 50)
  camera.position.set(0, 0.85, RING.rz + 3.1)
  camera.lookAt(0, 0, RING.rz)

  const ring = new THREE.Group()
  scene.add(ring)
  const slots = new Map<string, InventorySlot>() // kind -> slot, cached across opens
  let kinds = ''
  let position = 0 // continuous ring position, in slots

  function slotFor(kind: string): InventorySlot {
    let slot = slots.get(kind)
    if (!slot) {
      slot = buildSlot(kind)
      slots.set(kind, slot)
    }
    return slot
  }

  function setAspect(aspect: number): void {
    camera.aspect = aspect
    camera.updateProjectionMatrix()
  }

  // Jump straight to the selection, no easing: used when opening.
  function snapTo(index: number): void {
    position = index
  }

  function update(dt: number, items: readonly RingItem[], index: number): void {
    const list = items.map((item) => item.kind).join(',')
    if (list !== kinds) {
      kinds = list
      ring.clear()
      for (const item of items) ring.add(slotFor(item.kind).holder)
    }
    const count = items.length
    if (count < 1) return
    position +=
      wrapDelta(position, index, count) * Math.min(1, dt * EASE_PER_SECOND)
    position = ((position % count) + count) % count

    items.forEach((item, i) => {
      const slot = slotFor(item.kind)
      const offset = wrapDelta(position, i, count)
      const angle = (offset / Math.min(count, MAX_SLOTS_PER_TURN)) * Math.PI * 2
      const front = Math.cos(angle) // 1 at the front, -1 at the back
      slot.holder.position.set(
        Math.sin(angle) * RING.rx,
        0,
        Math.cos(angle) * RING.rz
      )
      const selected = i === index
      slot.holder.scale.setScalar(0.6 + 0.4 * Math.max(0, front))
      slot.holder.visible = count === 1 || Math.abs(angle) < Math.PI * 0.85
      if (selected) {
        slot.spinner.rotation.y += dt * SPIN_PER_SECOND
      } else {
        // Ease back to the resting yaw by the short way round.
        const y = slot.spinner.rotation.y
        const target =
          REST_YAW + Math.round((y - REST_YAW) / (Math.PI * 2)) * Math.PI * 2
        slot.spinner.rotation.y = y + (target - y) * Math.min(1, dt * 6)
      }
    })
  }

  return { scene, camera, setAspect, snapTo, update }
}
