// The shadowmen as seen: jointed black bodies (shadowmanmodel.ts, the
// raiders' own body in the shadow outfit, arms and legs too long) that walk
// the way they go and turn on the player to strike, flicker, and jitter,
// with a violet aura that only shows while a joint is working. One held in
// a flashlight's beam pales and shakes before it bursts. In the shared valley they are the valley's
// (sharedworld.ts rule 11): the frames it sends land here and are drawn a
// beat behind the present (shadowsync.ts). One body per shadowman id, and
// each id looks the same on every client. A shadow spider is a body of its
// own (assets.ts buildShadowSpider), twice a shadowman's
// height, walking the way it goes; a spiderling is the same body, small
// (CONFIG.shadowmen.spiderling.scale). In reach of its raider each winds
// up (a shadowman rears back with its arms raised high, a spider rears with its front
// legs raised), then lunges, for everyone to see.

import * as THREE from 'three'
import { buildShadowSpider, disposeTree } from './assets.ts'
import { CONFIG } from './config.ts'
import { mulberry32, range } from './rng.ts'
import { shadeCues, windupsBegun } from './sfx.ts'
import { buildShadowman } from './shadowmanmodel.ts'
import {
  applyShadowFrame,
  createShadowTable,
  drawnAt,
  sampleShadowmen,
} from './shadowsync.ts'
import type { ShadowSpider } from './assets.ts'
import type { HeightAt, XZ } from './interfaces.ts'
import type { ShadowmanWire, ShadowmenMessage } from './protocol.ts'
import type { Rng } from './rng.ts'
import type { ShadeCues, ShadeHeard } from './sfx.ts'
import type { ShadowmanRig } from './shadowmanmodel.ts'
import type { Burst, ShadeKind } from './shadowmen.ts'
import type { ShadowTable } from './shadowsync.ts'

interface ShadowBodiesOptions {
  scene: THREE.Object3D
  // What the shadowmen stand on: world.ground.at, never the bare terrain,
  // and the deck feet at a height stand on (world.ground.standAt), for
  // the height the valley stands each at (shadowsync.ts drawnAt).
  groundAt: HeightAt
  standAt: (x: number, z: number, feetY: number) => number
}

// One shown, as the valley sends it.
type Shown = Pick<
  ShadowmanWire,
  'id' | 'kind' | 'x' | 'z' | 'y' | 'burn' | 'target' | 'windup' | 'wall'
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
// way it goes), how fast it was going, which way it was crawling on a
// wall (1 up, -1 down), and how it is turned (toward its heading on the
// ground, or onto a wall's face, never all at once).
interface Spider {
  rig: ShadowSpider
  x: number
  y: number
  z: number
  heading: number
  speed: number
  crawl: 1 | -1
  turned: THREE.Quaternion
}

// How fast a spider turns onto a wall's face or back off it, a share of
// the way a second.
const CLING_TURN = 8
const UP = new THREE.Vector3(0, 1, 0)
const wallSide = new THREE.Vector3()
const wallBack = new THREE.Vector3()
const wallAhead = new THREE.Vector3()
const wallBasis = new THREE.Matrix4()
const wantTurn = new THREE.Quaternion()

interface ShadowBodiesFrame {
  dt: number
  player: XZ
  perception: boolean
  // The valley's moment to draw (local ms).
  renderAt: number
}

interface ShadowBodiesUpdate {
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

export class ShadowBodies {
  groundAt: HeightAt
  standAt: (x: number, z: number, feetY: number) => number
  // The last two frames the valley sent.
  table: ShadowTable
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

  constructor({ scene, groundAt, standAt }: ShadowBodiesOptions) {
    this.groundAt = groundAt
    this.standAt = standAt
    this.rng = mulberry32(0xd06)
    this.group = new THREE.Group()
    this.group.name = 'shadowmen'
    scene.add(this.group)
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

  // A frame landed: the windups it began, and where it
  // placed each, kept a frame past its going for a lunge that struck.
  private listen(shades: readonly ShadeHeard[]): void {
    const { begun, windups } = windupsBegun(this.windups, shades)
    this.begun.push(...begun)
    this.windups = windups
    const frame = new Map(shades.map((s) => [s.id, s]))
    this.known = new Map([...this.frame, ...frame])
    this.frame = frame
  }

  update({
    dt,
    player,
    perception,
    renderAt,
  }: ShadowBodiesFrame): ShadowBodiesUpdate {
    const shown: readonly Shown[] = sampleShadowmen(this.table, renderAt)
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
    // A spider gone takes its body with it; its glow is shared and stays.
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
      const heading = look() * Math.PI * 2
      spider = {
        rig,
        x: s.x,
        y: drawnAt(s, this.groundAt, this.standAt),
        z: s.z,
        heading,
        speed: 0,
        crawl: 1,
        turned: new THREE.Quaternion().setFromAxisAngle(UP, heading),
      }
      this.spiders.set(s.id, spider)
    }
    const y = drawnAt(s, this.groundAt, this.standAt)
    const dx = s.x - spider.x
    const dy = y - spider.y
    const dz = s.z - spider.z
    const moved = Math.hypot(dx, dz)
    if (moved > 0.01 && !s.wall) {
      // Turn toward the way it went, not all at once.
      const want = Math.atan2(dx, dz)
      let turn = want - spider.heading
      turn = Math.atan2(Math.sin(turn), Math.cos(turn))
      spider.heading += turn * Math.min(1, dt * 6)
    }
    // Its legs keep pace with it up or down a wall as on the ground.
    const speed = dt > 0 ? Math.hypot(moved, s.wall ? dy : 0) / dt : 0
    spider.speed += (speed - spider.speed) * Math.min(1, dt * 5)
    if (s.wall && Math.abs(dy) > 0.001) spider.crawl = dy > 0 ? 1 : -1
    spider.x = s.x
    spider.y = y
    spider.z = s.z
    const burn = Math.min(1, s.burn)
    const shake = burn * 0.18
    spider.rig.group.position.set(
      s.x + range(this.rng, -shake, shake),
      y,
      s.z + range(this.rng, -shake, shake)
    )
    if (s.wall) {
      // On a wall its back is to the open air off the face and its head the
      // way it crawls, up or down.
      wallBack.set(s.wall[0], 0, s.wall[1]).normalize()
      wallAhead.set(0, spider.crawl, 0)
      wallSide.crossVectors(wallBack, wallAhead)
      wallBasis.makeBasis(wallSide, wallBack, wallAhead)
      wantTurn.setFromRotationMatrix(wallBasis)
    } else {
      wantTurn.setFromAxisAngle(UP, spider.heading)
    }
    spider.turned.slerp(wantTurn, Math.min(1, dt * CLING_TURN))
    spider.rig.group.quaternion.copy(spider.turned)
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
      drawnAt(s, this.groundAt, this.standAt) + range(this.rng, -0.02, 0.02),
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
