// The shadowmen as seen: flat ragged silhouette cards that turn to face the
// player, flicker, and jitter, with a violet aura that only shows while a
// joint is working. One held in a flashlight's beam pales and shakes
// before it bursts. In the shared valley they are the valley's
// (sharedraid.ts rule 13): the frames it sends land here and are drawn a
// beat behind the present (shadowsync.ts). Played alone, this steps its own
// field with the player as the one raider. One card per shadowman id, and
// each id looks the same on every client.

import * as THREE from 'three'
import { isMesh } from './assets.ts'
import { context2d } from './canvas.ts'
import { CONFIG } from './config.ts'
import { mulberry32, range } from './rng.ts'
import {
  contactsOf,
  createShadowmen,
  placeStill,
  stepShadowmen,
} from './shadowmen.ts'
import {
  applyShadowFrame,
  createShadowTable,
  sampleShadowmen,
} from './shadowsync.ts'
import type { HeightAt, Metres, ScopeContact, XZ } from './interfaces.ts'
import type { ShadowmanWire, ShadowmenMessage } from './protocol.ts'
import type { Rng } from './rng.ts'
import type { Beam, Burst, ShadowmenField } from './shadowmen.ts'
import type { ShadowTable } from './shadowsync.ts'

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
// How many silhouettes the cards share; a shadowman's id picks one.
const LOOKS = 5
// The player's id in a field of their own.
const ALONE = 'me'

export interface ShadowCardsOptions {
  scene: THREE.Object3D
  // What the cards stand on: world.ground.at, never the bare terrain.
  groundAt: HeightAt
  metres: Metres
  havens: readonly XZ[]
}

// Played alone: the player as the field's one raider.
export interface AloneFrame {
  vulnerable: boolean
  // The flashlight, while it is up and on.
  beam: Beam | null
}

export interface ShadowCardsFrame {
  dt: number
  player: XZ
  perception: boolean
  // Null in the shared valley, which steps them itself.
  alone: AloneFrame | null
  // The shared valley's moment to draw (local ms), and this raider's id.
  renderAt: number
  myId: string | null
}

export interface ShadowCardsUpdate {
  // A shadowman touched the player, played alone; in the shared valley the
  // valley says so (a struck frame).
  struck: boolean
  // Where shadowmen burst since the last update.
  bursts: Burst[]
  contacts: ScopeContact[]
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
  // Played alone: the field this client steps.
  field: ShadowmenField
  // In the shared valley: the last two frames the valley sent.
  table: ShadowTable
  // The last update's contacts, for the dev hook.
  contacts: ScopeContact[]
  group: THREE.Group
  private rng: Rng
  private textures: THREE.CanvasTexture[]
  private cards = new Map<number, Card>()
  private pending: Burst[] = []

  constructor({ scene, groundAt, metres, havens }: ShadowCardsOptions) {
    this.groundAt = groundAt
    this.metres = metres
    this.havens = havens
    // The silhouettes come first off a fixed seed, so every client paints
    // the same ones.
    this.rng = mulberry32(0xd06)
    this.textures = []
    for (let i = 0; i < LOOKS; i++) {
      this.textures.push(makeSilhouetteTexture(this.rng))
    }
    this.contacts = []
    this.group = new THREE.Group()
    this.group.name = 'shadowmen'
    scene.add(this.group)
    this.field = createShadowmen()
    this.table = createShadowTable()
  }

  // A frame from the valley, landed at `at` (local ms).
  receive(msg: ShadowmenMessage, at: number): void {
    applyShadowFrame(this.table, msg.shadowmen, at)
    this.pending.push(...msg.bursts)
  }

  // A dev shadowman standing still at (x, z), played alone.
  place(x: number, z: number): void {
    placeStill(this.field, x, z)
  }

  update({
    dt,
    player,
    perception,
    alone,
    renderAt,
    myId,
  }: ShadowCardsFrame): ShadowCardsUpdate {
    let struck = false
    let shown: readonly Pick<
      ShadowmanWire,
      'id' | 'x' | 'z' | 'burn' | 'target'
    >[]
    let me: string
    if (alone) {
      // Played alone the valley's frames are stale: start them afresh.
      this.table = createShadowTable()
      const out = stepShadowmen(this.field, this.rng, {
        dt,
        raiders: [{ id: ALONE, x: player.x, z: player.z, ...alone }],
        metres: this.metres,
        havens: this.havens,
      })
      struck = out.struck.length > 0
      this.pending.push(...out.bursts)
      const full = CONFIG.shadowmen.burnSeconds
      shown = this.field.shadowmen.map((s) => ({ ...s, burn: s.burn / full }))
      me = ALONE
    } else {
      // In the shared valley the field this client stepped is not the
      // valley's: drop it, so a fall back to playing alone starts fresh.
      if (this.field.shadowmen.length) this.field = createShadowmen()
      shown = sampleShadowmen(this.table, renderAt)
      me = myId ?? ''
    }
    this.contacts = contactsOf(shown, player, me)
    const bursts = this.pending
    this.pending = []
    this.draw(shown, player, perception, dt)
    return { struck, bursts, contacts: this.contacts }
  }

  private draw(
    shown: readonly Pick<ShadowmanWire, 'id' | 'x' | 'z' | 'burn'>[],
    player: XZ,
    perception: boolean,
    dt: number
  ): void {
    const seen = new Set<number>()
    for (const s of shown) {
      seen.add(s.id)
      const card = this.cardFor(s.id)
      // Flicker: gone for a frame or two every second or so.
      card.flickerTimer -= dt
      if (card.flickerTimer <= 0) {
        card.hidden = 0.03
        card.flickerTimer = range(this.rng, 0.4, 1.6)
      }
      card.hidden = Math.max(0, card.hidden - dt)
      card.node.visible = card.hidden <= 0
      const y = this.groundAt(s.x, s.z) + card.halfHeight
      // In a beam: paler and shaking harder the nearer it is to bursting.
      const burn = Math.min(1, s.burn)
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
    // A shadowman gone frees its card for the next.
    for (const [id, card] of this.cards) {
      if (seen.has(id)) continue
      this.group.remove(card.node)
      card.body.dispose()
      card.aura.material.dispose()
      for (const child of card.node.children) {
        if (isMesh(child)) child.geometry.dispose()
      }
      this.cards.delete(id)
    }
  }

  // The card for a shadowman, built the first time it shows: its
  // silhouette and height come from its id, so it looks the same to all.
  private cardFor(id: number): Card {
    const found = this.cards.get(id)
    if (found) return found
    const look = mulberry32(id)
    const texture = this.textures[Math.floor(look() * LOOKS)]
    const height = range(look, 2.4, 3.2)
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
    this.group.add(node)
    const card: Card = {
      node,
      body: main.material,
      aura,
      halfHeight: height / 2,
      flickerTimer: range(this.rng, 0.3, 1.2),
      hidden: 0,
    }
    this.cards.set(id, card)
    return card
  }
}
