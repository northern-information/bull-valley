// The ground mist as seen: soft, posterized cards that stand on the ground
// with their skirts sunk into it, turn to face the player, and take the
// scene fog like everything else, so a far bank fades into the valley's
// own fog. One card per bank of the field in src/mist.ts, so cards[i]
// always shows banks[i].

import * as THREE from 'three'
import { context2d } from './canvas.ts'
import { CONFIG } from './config.ts'
import { bankOpacity, createMist, stepMist } from './mist.ts'
import { applyPS1 } from './ps1.ts'
import { mulberry32, range } from './rng.ts'
import type { HeightAt, XZ } from './interfaces.ts'
import type { MistField } from './mist.ts'
import type { Rng } from './rng.ts'

// Moonlit mist: pale, a little blue, never white.
const MIST_COLOR = '#9aa8c0'

// A bank of mist as a texture: soft blobs along a band, eroded and then
// posterized to a few alpha levels, so the PS1 downscale dithers it.
export function makeMistTexture(rng: Rng): THREE.CanvasTexture {
  const canvas = document.createElement('canvas')
  canvas.width = 128
  canvas.height = 48
  const ctx = context2d(canvas)
  for (let i = 0; i < 16; i++) {
    const cx = range(rng, 18, 110)
    const cy = range(rng, 20, 36)
    const r = range(rng, 12, 26)
    const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, r)
    grad.addColorStop(0, `rgba(255, 255, 255, ${range(rng, 0.45, 0.8)})`)
    grad.addColorStop(1, 'rgba(255, 255, 255, 0)')
    ctx.fillStyle = grad
    ctx.fillRect(0, 0, 128, 48)
  }
  // Ragged: eat holes out of it.
  ctx.globalCompositeOperation = 'destination-out'
  for (let i = 0; i < 70; i++) {
    ctx.fillRect(
      range(rng, 0, 124),
      range(rng, 0, 46),
      range(rng, 2, 7),
      range(rng, 1, 2.5)
    )
  }
  ctx.globalCompositeOperation = 'source-over'
  // Posterize the alpha to four levels.
  const image = ctx.getImageData(0, 0, 128, 48)
  const px = image.data
  for (let i = 3; i < px.length; i += 4) {
    px[i] = Math.round(px[i] / 64) * 64
  }
  ctx.putImageData(image, 0, 0)
  const texture = new THREE.CanvasTexture(canvas)
  texture.magFilter = THREE.NearestFilter
  texture.minFilter = THREE.NearestFilter
  return texture
}

// One bank, width metres across, its origin at the ground: the card is
// lifted so cfg.lift of its height stands over the ground and the rest is
// sunk below it, where the terrain's depth hides the bottom edge.
export function buildMistCard(
  texture: THREE.Texture,
  width: number,
  opacity: number,
  cfg = CONFIG.mist
): THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial> {
  const height = width * cfg.aspect
  const card = new THREE.Mesh(
    new THREE.PlaneGeometry(width, height),
    applyPS1(
      new THREE.MeshBasicMaterial({
        map: texture,
        color: new THREE.Color(MIST_COLOR),
        transparent: true,
        opacity,
        depthWrite: false,
        side: THREE.DoubleSide,
      })
    )
  )
  card.position.y = height * (cfg.lift - 0.5)
  return card
}

export interface MistCardsOptions {
  scene: THREE.Object3D
  // What the banks stand on: world.ground.at, never the bare terrain.
  groundAt: HeightAt
  // Where the first bubble is centred.
  player: XZ
}

export interface MistCardsFrame {
  dt: number
  player: XZ
}

export class MistCards {
  groundAt: HeightAt
  field: MistField
  cards: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>[]
  group: THREE.Group

  constructor({ scene, groundAt, player }: MistCardsOptions) {
    this.groundAt = groundAt
    this.cards = []
    this.group = new THREE.Group()
    this.group.name = 'mist'
    scene.add(this.group)

    const rng = mulberry32(0x3157)
    const textures: THREE.CanvasTexture[] = []
    for (let i = 0; i < CONFIG.mist.looks; i++) {
      textures.push(makeMistTexture(rng))
    }
    this.field = createMist(rng, player)
    for (const bank of this.field.banks) {
      // Each card rides a pivot at the bank's ground point, so the sinking
      // offset stays local to the card as the pivot turns.
      const card = buildMistCard(textures[bank.look], bank.width, 0)
      this.cards.push(card)
      const pivot = new THREE.Group()
      pivot.add(card)
      this.group.add(pivot)
    }
  }

  update({ dt, player }: MistCardsFrame): void {
    stepMist(this.field, { dt, player })
    for (let i = 0; i < this.cards.length; i++) {
      const bank = this.field.banks[i]
      const card = this.cards[i]
      const pivot = card.parent
      if (!pivot) continue
      pivot.position.set(bank.x, this.groundAt(bank.x, bank.z), bank.z)
      pivot.rotation.y = Math.atan2(player.x - bank.x, player.z - bank.z)
      card.material.opacity = bankOpacity(bank, player)
    }
  }
}
