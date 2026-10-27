// The Undercroft's foes as seen (undercroftfoes.ts): one body each (assets.ts
// buildRat, buildWarden), a shadow rat or the Warden, walking the Undercroft's
// floor, a rat turned the way it runs and the Warden (or a rat standing
// still) to face the player, paling and shaking as a beam burns it, its
// health bar over it once it is hurt (enemybars.ts). The Warden wears
// none: its bar is the boss's along the bottom of the view (bosshud.ts),
// counting the hits it has taken, and whether it stands raises the fog in
// its door (fogwall.ts). They are the valley's
// (sharedworld.ts rule 11): they ride in the shadowmen frames and are
// drawn a beat behind the present, between the last two.

import { buildRat, buildWarden } from './assets.ts'
import { CONFIG } from './config.ts'
import { bodyHeight, EnemyBars } from './enemybars.ts'
import { wardenStands } from './fogwall.ts'
import { mulberry32, range } from './rng.ts'
import {
  applyShadowFrame,
  createShadowTable,
  sampleShadowmen,
  shadeHealth,
} from './shadowsync.ts'
import type { FoeRig } from './assetkit.ts'
import type { HeightAt, XZ } from './interfaces.ts'
import type { MazePlace } from './maze.ts'
import type {
  FoeBurstWire,
  ShadowmenMessage,
  UndercroftFoeWire,
} from './protocol.ts'
import type { ShadowTable } from './shadowsync.ts'
import type { FoeKind } from './undercroftfoes.ts'
import type * as THREE from 'three'

interface UndercroftFoesOptions {
  scene: THREE.Object3D
  groundAt: HeightAt
  // Where the Undercroft lies; null without one, and then there are none.
  place: MazePlace | null
}

interface UndercroftFoesFrame {
  dt: number
  time: number
  player: XZ
  renderAt: number
}

interface UndercroftFoesUpdate {
  // Where they burst since the last update, and where one took a hit it
  // stands (the Warden) and went into the dark.
  bursts: FoeBurstWire[]
  wounds: FoeBurstWire[]
}

export class UndercroftFoes {
  // Where each stands as last drawn, for the dev hook.
  shown: UndercroftFoeWire[] = []
  // Whether the Warden stands (fogwall.ts wardenStands), and how much of
  // it is left as last drawn, kept while a hit has it in the dark.
  warden = false
  wardenShare = 1
  private place: MazePlace | null
  private groundAt: HeightAt
  private rigs = new Map<number, FoeRig>()
  // How tall each stands, for its health bar, and the bars.
  private talls = new Map<number, number>()
  private bars: EnemyBars
  private scene: THREE.Object3D
  private rng = mulberry32(0x7e117)
  private table: ShadowTable<UndercroftFoeWire> = createShadowTable()
  private pending: FoeBurstWire[] = []
  private hits: FoeBurstWire[] = []
  // Where each stood when last drawn, and when, for how fast it walks.
  private last = new Map<number, { x: number; z: number; time: number }>()

  constructor({ scene, groundAt, place }: UndercroftFoesOptions) {
    this.scene = scene
    this.place = place
    this.groundAt = groundAt
    this.bars = new EnemyBars(scene)
  }

  // A frame from the valley, landed at `at` (local ms).
  receive(msg: ShadowmenMessage, at: number): void {
    applyShadowFrame(this.table, msg.tunnel, at)
    const was = this.warden
    this.warden = wardenStands(was, msg)
    if (this.warden && !was) this.wardenShare = 1
    this.pending.push(...msg.tunnelBursts)
    this.hits.push(...msg.tunnelWounds)
  }

  update({
    dt,
    time,
    player,
    renderAt,
  }: UndercroftFoesFrame): UndercroftFoesUpdate {
    const shown = this.place ? sampleShadowmen(this.table, renderAt) : []
    this.shown = shown
    this.draw(shown, player, time)
    for (const s of shown) {
      const share = shadeHealth(s.burn, s.hurt, CONFIG.tunnel[s.kind].hits)
      if (s.kind === 'warden') {
        this.wardenShare = share
        continue
      }
      this.bars.show(
        s.id,
        {
          x: s.x,
          y: this.groundAt(s.x, s.z),
          z: s.z,
          tall: this.talls.get(s.id) ?? 2,
          share,
        },
        player,
        dt
      )
    }
    this.bars.sweep()
    const bursts = this.pending
    const wounds = this.hits
    this.pending = []
    this.hits = []
    return { bursts, wounds }
  }

  private draw(
    shown: readonly UndercroftFoeWire[],
    player: XZ,
    time: number
  ): void {
    const seen = new Set<number>()
    for (const s of shown) {
      seen.add(s.id)
      let rig = this.rigs.get(s.id)
      if (!rig) {
        rig = buildFoe(s.kind, 0x7e11 + s.id)
        this.rigs.set(s.id, rig)
        this.talls.set(s.id, bodyHeight(rig.group))
        this.scene.add(rig.group)
      }
      const burn = Math.min(1, s.burn)
      const shake = burn * 0.15 + s.hurt * 0.04
      rig.group.visible = true
      rig.group.position.set(
        s.x + range(this.rng, -shake, shake),
        this.groundAt(s.x, s.z),
        s.z + range(this.rng, -shake, shake)
      )
      // Its wounds pale it for good, a beam on it the rest of the way.
      rig.setBurn(Math.min(1, s.hurt * 0.45 + burn * (1 - s.hurt * 0.45)))
      const was = this.last.get(s.id)
      const dt = was ? time - was.time : 0
      const speed =
        was && dt > 0 ? Math.hypot(s.x - was.x, s.z - was.z) / dt : 0
      this.last.set(s.id, { x: s.x, z: s.z, time })
      rig.group.rotation.y =
        was && s.kind === 'rat' && speed > 0.2
          ? Math.atan2(s.x - was.x, s.z - was.z)
          : Math.atan2(player.x - s.x, player.z - s.z)
      rig.update(time, speed)
    }
    for (const [id, rig] of this.rigs) {
      if (!seen.has(id)) rig.group.visible = false
    }
  }
}

// The body of a foe of `kind`, seeded so it looks the same on every client.
function buildFoe(kind: FoeKind, seed: number): FoeRig {
  return kind === 'warden' ? buildWarden(seed) : buildRat(seed)
}

// The scale of the burst a foe leaves: a rat's is small, the Warden's
// far bigger.
export function burstScale(kind: FoeBurstWire['kind']): number {
  return kind === 'warden' ? 2.5 : 0.6
}

// How high its chest stands, where the burst blooms.
export function burstHeight(kind: FoeBurstWire['kind']): number {
  return CONFIG.tunnel[kind].chestHeight
}
