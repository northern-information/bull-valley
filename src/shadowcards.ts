// The shadowmen as seen: jointed black bodies (shadowmanmodel.ts, the
// raiders' own body in the shadow outfit, arms and legs too long) that walk
// the way they go and turn on the player to strike, flicker, and jitter,
// with a violet aura that only shows while a joint is working. One held in
// a flashlight's beam pales and shakes before it bursts. In the shared valley they are the valley's
// (sharedworld.ts rule 11): the frames it sends land here and are drawn a
// beat behind the present (shadowsync.ts). Played alone, this steps its own
// field with the player as the one raider. One body per shadowman id, and
// each id looks the same on every client. A shadow spider is a body of its
// own (assets.ts buildShadowSpider), twice a shadowman's
// height, walking the way it goes; a spiderling is the same body, small
// (CONFIG.shadowmen.spiderling.scale). In reach of its raider each winds
// up (a shadowman rears back with its arms raised high, a spider rears with its front
// legs raised), then lunges, for everyone to see.

import * as THREE from 'three'
import { buildShadowSpider } from './assets.ts'
import { CONFIG } from './config.ts'
import { mulberry32, range } from './rng.ts'
import { shadeCues, windupsBegun } from './sfx.ts'
import { buildShadowman } from './shadowmanmodel.ts'
import {
  burnSecondsOf,
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
import type { HeightAt, Metres, XZ } from './interfaces.ts'
import type { ShadowmanWire, ShadowmenMessage } from './protocol.ts'
import type { Rng } from './rng.ts'
import type { ShadeCues, ShadeHeard } from './sfx.ts'
import type { ShadowmanRig } from './shadowmanmodel.ts'
import type { Beam, Burst, ShadeKind, ShadowmenField } from './shadowmen.ts'
import type { ShadowTable } from './shadowsync.ts'
import type { WaterMap } from './waterside.ts'

// The player's id in a field of their own.
const ALONE = 'me'

interface ShadowCardsOptions {
  scene: THREE.Object3D
  // What the shadowmen stand on: world.ground.at, never the bare terrain.
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

export const LUNGE_SECONDS = 0.3

// A shadowman striking: how far it draws back from its raider over the
// windup and is thrown at them in the lunge (metres, negative toward
// them), for a windup and a lunge each 0 to 1. Its body rears and flings
// its arms on top of this (shadowmanmodel.ts).
export function strikeReach(windup: number, lunge: number): number {
  const rear = Math.min(1, Math.max(0, windup))
  const slam = Math.sin(Math.PI * Math.min(1, Math.max(0, lunge)))
  return 0.35 * rear - 1.1 * slam
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

interface ShadowCardsFrame {
  dt: number
  player: XZ
  perception: boolean
  // Null in the shared valley, which steps them itself.
  alone: AloneFrame | null
  // The shared valley's moment to draw (local ms), and this raider's id.
  renderAt: number
}

interface ShadowCardsUpdate {
  // A shadowman touched the player, played alone; in the shared valley the
  // valley says so (a struck frame).
  struck: boolean
  // Where shadowmen burst since the last update.
  bursts: Burst[]
  // The kinds within CONFIG.book.sightRange of the player (the Book of
  // Shadows).
  sighted: ShadeKind[]
  // What they sound like this frame (sfx.ts).
  heard: ShadeCues
}

// A shadowman as shown: its body, where it was last frame (so it faces
// the way it goes), how fast it was going, and its flicker.
interface Man {
  rig: ShadowmanRig
  x: number
  z: number
  heading: number
  speed: number
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
  // Played alone, a spec's quiet valley (shadowmen.ts ShadowmenStep).
  calm = false
  group: THREE.Group
  private rng: Rng
  private men = new Map<number, Man>()
  private spiders = new Map<number, Spider>()
  private pending: Burst[] = []
  // Seconds since each shadowman lunged, while the lunge plays.
  private lunges = new Map<number, number>()
  // Windups begun and lunges not yet heard; each one's windup in the last
  // frame or step, and where the last two placed each (sfx.ts).
  private begun: number[] = []
  private lunged: number[] = []
  private windups = new Map<number, number>()
  private frame = new Map<number, ShadeHeard>()
  private known = new Map<number, ShadeHeard>()

  constructor({ scene, groundAt, metres, havens, water }: ShadowCardsOptions) {
    this.groundAt = groundAt
    this.metres = metres
    this.havens = havens
    this.water = water
    this.rng = mulberry32(0xd06)
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
    this.lunged.push(...msg.lunges)
    this.listen(msg.shadowmen)
  }

  // A frame landed or a step taken: the windups it began, and where it
  // placed each, kept a frame past its going for a lunge that struck.
  private listen(shades: readonly ShadeHeard[]): void {
    const { begun, windups } = windupsBegun(this.windups, shades)
    this.begun.push(...begun)
    this.windups = windups
    const frame = new Map(shades.map((s) => [s.id, s]))
    this.known = new Map([...this.frame, ...frame])
    this.frame = frame
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
  }: ShadowCardsFrame): ShadowCardsUpdate {
    let struck = false
    let shown: readonly Shown[]
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
      this.lunged.push(...out.lunges)
      shown = this.field.shadowmen.map((s) => ({
        ...s,
        kind: s.kind === 'man' ? undefined : s.kind,
        burn: s.burn / burnSecondsOf(s.kind, CONFIG.shadowmen),
        windup: s.windup / CONFIG.shadowmen.windupSeconds,
      }))
      this.listen(shown)
    } else {
      // In the shared valley the field this client stepped is not the
      // valley's: drop it, so a fall back to playing alone starts fresh.
      if (this.field.shadowmen.length) this.field = createShadowmen()
      shown = sampleShadowmen(this.table, renderAt)
    }
    const sighted = new Set<ShadeKind>()
    for (const s of shown) {
      const d = Math.hypot(s.x - player.x, s.z - player.z)
      if (d <= CONFIG.book.sightRange) sighted.add(s.kind ?? 'man')
    }
    const bursts = this.pending
    this.pending = []
    const heard = shadeCues(
      this.begun,
      this.lunged,
      shown,
      this.known,
      bursts,
      player,
      CONFIG.sfx
    )
    this.begun = []
    this.lunged = []
    this.draw(shown, player, perception, dt)
    return {
      struck,
      bursts,
      sighted: [...sighted],
      heard,
    }
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
      this.drawMan(s, player, perception, dt, lunge)
    }
    // A spider gone takes its body with it.
    for (const [id, spider] of this.spiders) {
      if (seen.has(id)) continue
      this.group.remove(spider.rig.group)
      disposeTree(spider.rig.group)
      this.spiders.delete(id)
    }
    // A shadowman gone takes its body with it.
    for (const [id, man] of this.men) {
      if (seen.has(id)) continue
      this.group.remove(man.rig.group)
      man.rig.dispose()
      this.men.delete(id)
    }
  }

  // A spider walks the way it goes, faced along its motion, on the ground
  // under it; held in a beam it pales and shakes like a shadowman.
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

  // A shadowman walks the way it goes, on the ground under it, and turns
  // on its raider to strike or when it stands; it flickers out for a frame
  // now and then, jitters, and held in a beam pales and shakes harder the
  // nearer it is to bursting.
  private drawMan(
    s: Shown,
    player: XZ,
    perception: boolean,
    dt: number,
    lunge: number
  ): void {
    let man = this.men.get(s.id)
    if (!man) {
      // Its height and its crook come from its id, so it looks the same
      // to all.
      const look = mulberry32(s.id)
      const rig = buildShadowman(range(look, 2.4, 3.2), s.id)
      this.group.add(rig.group)
      man = {
        rig,
        x: s.x,
        z: s.z,
        heading: Math.atan2(player.x - s.x, player.z - s.z),
        speed: 0,
        flickerTimer: range(this.rng, 0.3, 1.2),
        hidden: 0,
      }
      this.men.set(s.id, man)
    }
    // Flicker: gone for a frame or two every second or so.
    man.flickerTimer -= dt
    if (man.flickerTimer <= 0) {
      man.hidden = 0.03
      man.flickerTimer = range(this.rng, 0.4, 1.6)
    }
    man.hidden = Math.max(0, man.hidden - dt)
    man.rig.group.visible = man.hidden <= 0
    const dx = s.x - man.x
    const dz = s.z - man.z
    const moved = Math.hypot(dx, dz)
    const speed = dt > 0 ? moved / dt : 0
    man.speed += (speed - man.speed) * Math.min(1, dt * 5)
    man.x = s.x
    man.z = s.z
    const windup = s.windup ?? 0
    // Striking or standing it faces its raider; walking, the way it goes.
    const facing = Math.atan2(player.x - s.x, player.z - s.z)
    const want =
      windup > 0 || lunge > 0 || man.speed < 0.3 || moved <= 0
        ? facing
        : Math.atan2(dx, dz)
    let turn = want - man.heading
    turn = Math.atan2(Math.sin(turn), Math.cos(turn))
    man.heading += turn * Math.min(1, dt * (windup > 0 ? 12 : 6))
    const burn = Math.min(1, s.burn)
    const shake = 0.03 + burn * 0.12 + windup * 0.06
    // Striking: drawn back from the player, then thrown at them.
    const back = strikeReach(windup, lunge)
    man.rig.group.position.set(
      s.x - Math.sin(facing) * back + range(this.rng, -shake, shake),
      this.groundAt(s.x, s.z) + range(this.rng, -0.02, 0.02),
      s.z - Math.cos(facing) * back + range(this.rng, -shake, shake)
    )
    man.rig.group.rotation.y = man.heading
    man.rig.update({
      dt,
      speed: man.speed,
      burn,
      perception,
      windup,
      lunge,
      sight: sightOf(s, player),
    })
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
// Its eyes' and aura's glow are textures every spider shares (assets.ts
// makeGlowTexture), so those stay.
function disposeTree(root: THREE.Object3D): void {
  root.traverse((o) => {
    if (o instanceof THREE.Mesh || o instanceof THREE.Sprite) {
      if (o instanceof THREE.Mesh)
        (o.geometry as THREE.BufferGeometry).dispose()
      for (const m of [
        o.material as THREE.Material | THREE.Material[],
      ].flat()) {
        m.dispose()
      }
    }
  })
}
