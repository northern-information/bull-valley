// The shadowmen as seen: flat ragged silhouette cards that turn to face the
// player, flicker, and jitter, with a violet aura that only shows while a
// joint is working. One held in the flashlight's beam pales and shakes
// before it bursts. One card per slot of the field in src/shadowmen.ts, so
// cards[i] always shows slots[i] and never hops between shadowmen.

import * as THREE from 'three'
import { context2d } from './canvas.ts'
import { CONFIG } from './config.ts'
import { mulberry32, pick, range } from './rng.ts'
import { createShadowmen, stepShadowmen } from './shadowmen.ts'
import type { HeightAt, Metres, ScopeContact, XZ } from './interfaces.ts'
import type { Rng } from './rng.ts'
import type { Beam, ShadowmenField, ShadowmenUpdate } from './shadowmen.ts'

export function makeSilhouetteTexture(rng: Rng): THREE.CanvasTexture {
  const canvas = document.createElement('canvas')
  canvas.width = 64
  canvas.height = 128
  const ctx = context2d(canvas)
  ctx.fillStyle = '#ffffff'
  // Head
  const headR = range(rng, 5, 8)
  ctx.beginPath()
  ctx.ellipse(
    32 + range(rng, -2, 2),
    14,
    headR,
    headR * 1.25,
    0,
    0,
    Math.PI * 2
  )
  ctx.fill()
  // Torso: stacked jittered slabs tapering to the hips.
  let wander = 0
  for (let y = 22; y < 96; y += 4) {
    const t = (y - 22) / 74
    wander += range(rng, -1.4, 1.4)
    wander = Math.max(-4, Math.min(4, wander))
    const w = 22 - 12 * t + range(rng, -2, 3)
    ctx.fillRect(32 - w / 2 + wander, y, w, 4.5)
  }
  // Arms: too long.
  for (const side of [-1, 1]) {
    const ax = 32 + side * range(rng, 12, 16)
    const len = range(rng, 44, 68)
    for (let y = 26; y < 26 + len; y += 4) {
      ctx.fillRect(ax + side * ((y - 26) / len) * 4, y, 3, 4.5)
    }
  }
  // Legs
  for (const side of [-1, 1]) {
    ctx.fillRect(32 + side * 5 - 2, 94, 4.5, 33)
  }
  // Ragged edges
  ctx.globalCompositeOperation = 'destination-out'
  for (let i = 0; i < 70; i++) {
    ctx.fillRect(
      range(rng, 8, 56),
      range(rng, 6, 126),
      range(rng, 1, 3),
      range(rng, 1, 3)
    )
  }
  const texture = new THREE.CanvasTexture(canvas)
  texture.magFilter = THREE.NearestFilter
  texture.minFilter = THREE.NearestFilter
  return texture
}

// The visible figure: a silhouette card, height metres tall, centred on its
// origin. The perception aura is layered on by ShadowCards.
export function buildShadowmanFigure(
  texture: THREE.Texture,
  height: number
): THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial> {
  return new THREE.Mesh(
    new THREE.PlaneGeometry(height / 2, height),
    new THREE.MeshBasicMaterial({
      map: texture,
      transparent: true,
      alphaTest: 0.3,
      color: new THREE.Color('#07080c'),
      side: THREE.DoubleSide,
    })
  )
}

const BODY = new THREE.Color('#07080c')
const BURNING = new THREE.Color('#6b6e78')

export interface ShadowCardsOptions {
  scene: THREE.Object3D
  // What the cards stand on: world.ground.at, never the bare terrain.
  groundAt: HeightAt
  metres: Metres
  havens: readonly XZ[]
  // Where the first bubble is centred.
  player: XZ
}

export interface ShadowCardsFrame {
  dt: number
  player: XZ
  vulnerable: boolean
  perception: boolean
  // The flashlight, while it is up and on.
  beam: Beam | null
}

interface Card {
  node: THREE.Group
  body: THREE.MeshBasicMaterial
  aura: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>
  halfHeight: number
  flickerTimer: number
  hidden: number
}

export class ShadowCards {
  groundAt: HeightAt
  metres: Metres
  havens: readonly XZ[]
  // Textures and heights first, then the simulation.
  rng: Rng
  field: ShadowmenField
  cards: Card[]
  // The last update's contacts, for the dev hook.
  contacts: ScopeContact[]
  group: THREE.Group

  constructor({ scene, groundAt, metres, havens, player }: ShadowCardsOptions) {
    this.groundAt = groundAt
    this.metres = metres
    this.havens = havens
    this.rng = mulberry32(0xd06)
    this.cards = []
    this.contacts = []
    this.group = new THREE.Group()
    this.group.name = 'shadowmen'
    scene.add(this.group)

    const textures: THREE.CanvasTexture[] = []
    for (let i = 0; i < 5; i++) textures.push(makeSilhouetteTexture(this.rng))

    for (let i = 0; i < CONFIG.shadowmen.count; i++) {
      const texture = pick(this.rng, textures)
      const height = range(this.rng, 2.4, 3.2)
      const main = buildShadowmanFigure(texture, height)
      // Perception aura: the same figure, additive violet, fog-proof, only
      // visible while the joint is working.
      const aura = new THREE.Mesh(
        new THREE.PlaneGeometry(height / 2 + 0.3, height + 0.5),
        new THREE.MeshBasicMaterial({
          map: texture,
          transparent: true,
          opacity: 0,
          color: new THREE.Color('#8b5cf6'),
          blending: THREE.AdditiveBlending,
          depthWrite: false,
          fog: false,
          side: THREE.DoubleSide,
        })
      )
      aura.position.z = -0.02
      const node = new THREE.Group()
      node.add(main)
      node.add(aura)
      node.visible = false
      this.group.add(node)
      this.cards.push({
        node,
        body: main.material,
        aura,
        halfHeight: height / 2,
        flickerTimer: range(this.rng, 0.3, 1.2),
        hidden: 0,
      })
    }

    this.field = createShadowmen(this.rng, player, metres, havens)
  }

  update({
    dt,
    player,
    vulnerable,
    perception,
    beam,
  }: ShadowCardsFrame): ShadowmenUpdate {
    const update = stepShadowmen(this.field, this.rng, {
      dt,
      player,
      metres: this.metres,
      havens: this.havens,
      vulnerable,
      beam,
      groundAt: this.groundAt,
    })
    this.contacts = update.contacts

    for (let i = 0; i < this.cards.length; i++) {
      const card = this.cards[i]
      const s = this.field.slots[i]
      if (!s) {
        card.node.visible = false
        continue
      }
      // Flicker: gone for a frame or two every second or so.
      card.flickerTimer -= dt
      if (card.flickerTimer <= 0) {
        card.hidden = 0.03
        card.flickerTimer = range(this.rng, 0.4, 1.6)
      }
      card.hidden = Math.max(0, card.hidden - dt)
      card.node.visible = card.hidden <= 0
      const y = this.groundAt(s.x, s.z) + card.halfHeight
      // In the beam: paler and shaking harder the nearer it is to bursting.
      const burn = Math.min(1, s.burn / CONFIG.shadowmen.burnSeconds)
      const shake = 0.03 + burn * 0.12
      card.node.position.set(
        s.x + range(this.rng, -shake, shake),
        y + range(this.rng, -0.02, 0.02),
        s.z + range(this.rng, -shake, shake)
      )
      card.body.color.lerpColors(BODY, BURNING, burn)
      card.node.rotation.y = Math.atan2(player.x - s.x, player.z - s.z)
      card.aura.material.opacity = perception ? 0.5 : 0
    }

    return update
  }
}
