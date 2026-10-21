import * as THREE from 'three'
import {
  artTexture,
  makeGlowSprite,
  makeGlowTexture,
  setMotion,
} from './assetkit.ts'
import { bathLit, setBathGlow } from './bathglow.ts'
import { CONFIG } from './config.ts'
import { paintEditorScreen } from './laptopart.ts'
import { applyPS1 } from './ps1.ts'

// The laptop on the card table in the Citgo bathroom (laptop.ts): a thick
// charcoal machine of the XP years, its lid up, its screen in the text
// editor with the readme open (laptopart.ts) and the only light in the
// room (bathglow.ts). Local space: the middle of its base on the tabletop,
// the screen facing +Z, toward whoever sits at it.
export const BATH_LAPTOP = {
  width: 0.36,
  depth: 0.27,
  base: 0.035,
  screen: 0.24,
  // The lid leans back past upright, away from the one sitting at it.
  lean: -0.28,
}

export interface BathLaptop {
  group: THREE.Group
  // With a running time in seconds: the screen's breath, and the room's
  // light after it. `on` false puts the light out, the display parked
  // nowhere.
  update(t: number, on?: boolean): void
}

let halo: THREE.Texture | null = null

export function buildBathLaptop(name: string, text: string): BathLaptop {
  const { width, depth, base, screen, lean } = BATH_LAPTOP
  const group = new THREE.Group()
  group.name = 'bath-laptop'
  const shell = bathLit({ color: '#2a2b2f' })
  const keys = bathLit({ color: '#44464c' })
  const body = new THREE.Mesh(new THREE.BoxGeometry(width, base, depth), shell)
  body.position.y = base / 2
  const deck = new THREE.Mesh(
    new THREE.BoxGeometry(width - 0.05, 0.004, depth * 0.42),
    keys
  )
  deck.position.set(0, base, -depth * 0.08)
  const pad = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.003, 0.055), keys)
  pad.position.set(0, base, depth * 0.3)
  group.add(body, deck, pad)
  // The lid on its hinge at the back edge.
  const lid = new THREE.Group()
  lid.position.set(0, base, -depth / 2)
  lid.rotation.x = lean
  const back = new THREE.Mesh(
    new THREE.BoxGeometry(width, screen, 0.014),
    shell
  )
  back.position.set(0, screen / 2, -0.007)
  const face = applyPS1(
    new THREE.MeshBasicMaterial({
      map: artTexture(paintEditorScreen(name, text)),
    })
  )
  const glass = new THREE.Mesh(
    new THREE.PlaneGeometry(width - 0.03, screen - 0.03),
    face
  )
  glass.position.set(0, screen / 2, 0.001)
  lid.add(back, glass)
  // Its light hanging in the air before it.
  halo ??= makeGlowTexture('rgba(80, 120, 255, 0.5)')
  const glow = makeGlowSprite(halo, 0.9)
  glow.position.set(0, screen / 2, 0.15)
  lid.add(glow)
  group.add(lid)
  const at = new THREE.Vector3()
  const facing = new THREE.Vector3()
  const normal = new THREE.Matrix3()
  const update = (t: number, on = true) => {
    // A cheap panel's shimmer, and now and then a dip as it redraws.
    const dip = Math.sin(t * 17.3) > 0.985 ? 0.75 : 1
    const level = (0.92 + 0.08 * Math.sin(t * 2.3)) * dip
    face.color.setScalar(level)
    glow.material.opacity = level
    glass.updateWorldMatrix(true, false)
    glass.getWorldPosition(at)
    normal.getNormalMatrix(glass.matrixWorld)
    facing.set(0, 0, 1).applyMatrix3(normal)
    // The light comes off the glass a hand in front of it.
    at.addScaledVector(facing.normalize(), 0.08)
    setBathGlow(at, facing, on ? level * CONFIG.laptop.glow.level : 0)
  }
  update(0)
  setMotion(group, update)
  return { group, update }
}
