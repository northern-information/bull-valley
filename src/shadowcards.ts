// The shadowmen as seen: flat ragged silhouette cards that turn to face the
// player, flicker, and jitter, with a violet aura that only shows while a
// joint is working. One held in a flashlight's beam pales and shakes
// before it bursts. In the shared valley they are the valley's
// (sharedworld.ts rule 11): the frames it sends land here and are drawn a
// beat behind the present (shadowsync.ts). Played alone, this steps its own
// field with the player as the one raider. One card per shadowman id, and
// each id looks the same on every client. A shadow spider is no card but a
// body of its own (assets.ts buildShadowSpider), twice a shadowman's
// height, walking the way it goes; a spiderling is the same body, small
// (CONFIG.shadowmen.spiderling.scale). In reach of its raider each winds
// up (a card draws back and stretches tall, a spider rears with its front
// legs raised), then lunges, for everyone to see.

import * as THREE from 'three'
import { buildShadowSpider, isMesh } from './assets.ts'
import { context2d } from './canvas.ts'
import { CONFIG } from './config.ts'
import { mulberry32, range } from './rng.ts'
import {
  burnSecondsOf,
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
import type { ShadowSpider } from './assets.ts'
import type { HeightAt, Metres, ScopeContact, XZ } from './interfaces.ts'
import type { ShadowmanWire, ShadowmenMessage } from './protocol.ts'
import type { Rng } from './rng.ts'
import type { Beam, Burst, ShadeKind, ShadowmenField } from './shadowmen.ts'
import type { ShadowTable } from './shadowsync.ts'
import type { WaterMap } from './waterside.ts'

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
  // Where the water's edges run: played alone, spiders come up near them.
  water: WaterMap | null
}

// One shown, as the valley sends it (or this client steps it).
type Shown = Pick<
  ShadowmanWire,
  'id' | 'kind' | 'x' | 'z' | 'burn' | 'target' | 'windup'
>

// How long a lunge plays, in seconds.
export const LUNGE_SECONDS = 0.3

// A card striking: how far it draws back from its raider (metres, negative
// toward them) and how much taller and narrower it stands, for a windup
// and a lunge each 0 to 1.
export function cardStrike(
  windup: number,
  lunge: number
): { back: number; tall: number; narrow: number } {
  const rear = Math.min(1, Math.max(0, windup))
  const slam = Math.sin(Math.PI * Math.min(1, Math.max(0, lunge)))
  return {
    back: 0.35 * rear - 1.1 * slam,
    tall: 1 + 0.25 * rear - 0.1 * slam,
    narrow: 1 - 0.15 * rear + 0.2 * slam,
  }
}

// A spider as shown: its body, where it was last frame (so it faces the
// way it goes), and how fast it was going.
interface Spider {
  rig: ShadowSpider
  x: number
  z: number
  heading: number
  speed: number
}

// Played alone: the player as the field's one raider.
export interface AloneFrame {
  vulnerable: boolean
  // The flashlight, while it is up and on.
  beam: Beam | null
  // Marx's headlights.
  lights: Beam[]
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
  // The kinds within CONFIG.book.sightRange of the player (the Book of
  // Shadows).
  sighted: ShadeKind[]
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
  water: WaterMap | null
  // Played alone: the field this client steps.
  field: ShadowmenField
  // In the shared valley: the last two frames the valley sent.
  table: ShadowTable
  // The last update's contacts, for the dev hook.
  contacts: ScopeContact[]
  // Played alone, a spec's quiet valley (shadowmen.ts ShadowmenStep).
  calm = false
  group: THREE.Group
  private rng: Rng
  private textures: THREE.CanvasTexture[]
  private cards = new Map<number, Card>()
  private spiders = new Map<number, Spider>()
  private pending: Burst[] = []
  // Seconds since each shadowman lunged, while the lunge plays.
  private lunges = new Map<number, number>()

  constructor({ scene, groundAt, metres, havens, water }: ShadowCardsOptions) {
    this.groundAt = groundAt
    this.metres = metres
    this.havens = havens
    this.water = water
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
    for (const id of msg.lunges) this.lunges.set(id, 0)
  }

  // A dev shadowman (or spider) standing still at (x, z), played alone.
  place(x: number, z: number, kind: ShadeKind = 'man'): void {
    placeStill(this.field, x, z, kind)
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
    let shown: readonly Shown[]
    let me: string
    if (alone) {
      // Played alone the valley's frames are stale: start them afresh.
      this.table = createShadowTable()
      const out = stepShadowmen(this.field, this.rng, {
        dt,
        raiders: [
          {
            id: ALONE,
            x: player.x,
            z: player.z,
            vulnerable: alone.vulnerable,
            beam: alone.beam,
          },
        ],
        lights: alone.lights,
        metres: this.metres,
        havens: this.havens,
        water: this.water,
        calm: this.calm,
      })
      struck = out.struck.length > 0
      this.pending.push(...out.bursts)
      for (const id of out.lunges) this.lunges.set(id, 0)
      shown = this.field.shadowmen.map((s) => ({
        ...s,
        kind: s.kind === 'man' ? undefined : s.kind,
        burn: s.burn / burnSecondsOf(s.kind, CONFIG.shadowmen),
        windup: s.windup / CONFIG.shadowmen.windupSeconds,
      }))
      me = ALONE
    } else {
      // In the shared valley the field this client stepped is not the
      // valley's: drop it, so a fall back to playing alone starts fresh.
      if (this.field.shadowmen.length) this.field = createShadowmen()
      shown = sampleShadowmen(this.table, renderAt)
      me = myId ?? ''
    }
    this.contacts = contactsOf(shown, player, me)
    const sighted = new Set<ShadeKind>()
    for (const s of shown) {
      const d = Math.hypot(s.x - player.x, s.z - player.z)
      if (d <= CONFIG.book.sightRange) sighted.add(s.kind ?? 'man')
    }
    const bursts = this.pending
    this.pending = []
    this.draw(shown, player, perception, dt)
    return { struck, bursts, contacts: this.contacts, sighted: [...sighted] }
  }

  private draw(
    shown: readonly Shown[],
    player: XZ,
    perception: boolean,
    dt: number
  ): void {
    const seen = new Set<number>()
    for (const [id, age] of this.lunges) {
      if (age + dt >= LUNGE_SECONDS) this.lunges.delete(id)
      else this.lunges.set(id, age + dt)
    }
    for (const s of shown) {
      seen.add(s.id)
      const age = this.lunges.get(s.id)
      const lunge = age === undefined ? 0 : age / LUNGE_SECONDS
      if (s.kind === 'spider' || s.kind === 'spiderling') {
        this.drawSpider(s, perception, dt, lunge, sightOf(s, player))
        continue
      }
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
      const windup = s.windup ?? 0
      const shake = 0.03 + burn * 0.12 + windup * 0.06
      // Striking: drawn back from the player, then thrown at them.
      const facing = Math.atan2(player.x - s.x, player.z - s.z)
      const strike = cardStrike(windup, lunge)
      card.node.position.set(
        s.x - Math.sin(facing) * strike.back + range(this.rng, -shake, shake),
        y + (strike.tall - 1) * card.halfHeight + range(this.rng, -0.02, 0.02),
        s.z - Math.cos(facing) * strike.back + range(this.rng, -shake, shake)
      )
      card.node.scale.set(strike.narrow, strike.tall, 1)
      card.body.color.lerpColors(BODY, BURNING, burn)
      card.node.rotation.y = facing
      card.aura.material.opacity = perception ? 0.5 * sightOf(s, player) : 0
    }
    // A spider gone takes its body with it.
    for (const [id, spider] of this.spiders) {
      if (seen.has(id)) continue
      this.group.remove(spider.rig.group)
      disposeTree(spider.rig.group)
      this.spiders.delete(id)
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

  // A spider walks the way it goes, faced along its motion, on the ground
  // under it; held in a beam it pales and shakes like a card.
  private drawSpider(
    s: Shown,
    perception: boolean,
    dt: number,
    lunge: number,
    sight: number
  ): void {
    let spider = this.spiders.get(s.id)
    if (!spider) {
      // Its size comes from its id, twice a shadowman's; a spiderling's a
      // fraction of that.
      const look = mulberry32(s.id)
      const scale =
        s.kind === 'spiderling' ? CONFIG.shadowmen.spiderling.scale : 1
      const rig = buildShadowSpider(range(look, 2.4, 3.2) * 2 * scale, s.id)
      this.group.add(rig.group)
      spider = { rig, x: s.x, z: s.z, heading: look() * Math.PI * 2, speed: 0 }
      this.spiders.set(s.id, spider)
    }
    const dx = s.x - spider.x
    const dz = s.z - spider.z
    const moved = Math.hypot(dx, dz)
    if (moved > 0.01) {
      // Turn toward the way it went, not all at once.
      const want = Math.atan2(dx, dz)
      let turn = want - spider.heading
      turn = Math.atan2(Math.sin(turn), Math.cos(turn))
      spider.heading += turn * Math.min(1, dt * 6)
    }
    const speed = dt > 0 ? moved / dt : 0
    spider.speed += (speed - spider.speed) * Math.min(1, dt * 5)
    spider.x = s.x
    spider.z = s.z
    const burn = Math.min(1, s.burn)
    const shake = burn * 0.18
    spider.rig.group.position.set(
      s.x + range(this.rng, -shake, shake),
      this.groundAt(s.x, s.z),
      s.z + range(this.rng, -shake, shake)
    )
    spider.rig.group.rotation.y = spider.heading
    spider.rig.update({
      dt,
      speed: spider.speed,
      burn,
      perception,
      windup: s.windup ?? 0,
      lunge,
      sight,
    })
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

// How much of what ignores the fog shows of one this far off: all of it
// near, none by the spawn ring (CONFIG.shadowmen.glowFade).
function sightOf(s: XZ, player: XZ): number {
  const { near, far } = CONFIG.shadowmen.glowFade
  const d = Math.hypot(s.x - player.x, s.z - player.z)
  return Math.min(1, Math.max(0, (far - d) / (far - near)))
}

// A spider's body is its own: every geometry and material goes with it.
function disposeTree(root: THREE.Object3D): void {
  root.traverse((o) => {
    if (o instanceof THREE.Mesh || o instanceof THREE.Sprite) {
      if (o instanceof THREE.Mesh)
        (o.geometry as THREE.BufferGeometry).dispose()
      for (const m of [
        o.material as THREE.Material | THREE.Material[],
      ].flat()) {
        if ('map' in m && m.map instanceof THREE.Texture) m.map.dispose()
        m.dispose()
      }
    }
  })
}
