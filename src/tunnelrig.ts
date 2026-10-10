// The tunnel shades as seen (tunnelshades.ts): one body each (assets.ts
// buildTunnelShade) walking the Undercroft's floor, turned to face the
// player, paling and shaking as a beam burns it. In the shared valley they
// are the valley's (sharedworld.ts rule 11): they ride in the shadowmen
// frames and are drawn a beat behind the present, between the last two.
// Played alone, this steps shades of its own with the player as the one
// raider.

import { buildTunnelShade } from './assets.ts'
import { CONFIG } from './config.ts'
import { compassBearing } from './coords.ts'
import { mulberry32, range } from './rng.ts'
import {
  applyShadowFrame,
  createShadowTable,
  sampleShadowmen,
} from './shadowsync.ts'
import {
  createTunnelShades,
  stepTunnelShades,
  tunnelShadesAt,
} from './tunnelshades.ts'
import type { TunnelShadeRig } from './assets.ts'
import type { HeightAt, ScopeContact, XZ } from './interfaces.ts'
import type { MazePlace } from './maze.ts'
import type {
  ShadowmenMessage,
  TunnelBurstWire,
  TunnelShadeWire,
} from './protocol.ts'
import type { AloneFrame } from './shadowcards.ts'
import type { ShadowTable } from './shadowsync.ts'
import type { TunnelShade } from './tunnelshades.ts'
import type * as THREE from 'three'

// The player's id when they play alone.
const ALONE = 'me'

export interface TunnelShadesOptions {
  scene: THREE.Object3D
  groundAt: HeightAt
  // Where the Undercroft lies; null without one, and then there are none.
  place: MazePlace | null
}

export interface TunnelShadesFrame {
  dt: number
  time: number
  player: XZ
  // Null in the shared valley, which steps them itself.
  alone: AloneFrame | null
  renderAt: number
  myId: string | null
}

export interface TunnelShadesUpdate {
  // One touched the player, played alone; in the shared valley a struck
  // frame says so.
  struck: boolean
  // Where they burst since the last update.
  bursts: TunnelBurstWire[]
  // Their blips on the scope, those in range.
  contacts: ScopeContact[]
}

export class TunnelShades {
  // Played alone: the shades this client steps.
  own: TunnelShade[]
  // Where each stands as last drawn, for the dev hook.
  shown: TunnelShadeWire[] = []
  private place: MazePlace | null
  private groundAt: HeightAt
  private rigs = new Map<number, TunnelShadeRig>()
  private scene: THREE.Object3D
  private rng = mulberry32(0x7e117)
  private table: ShadowTable<TunnelShadeWire> = createShadowTable()
  private pending: TunnelBurstWire[] = []

  constructor({ scene, groundAt, place }: TunnelShadesOptions) {
    this.scene = scene
    this.place = place
    this.groundAt = groundAt
    this.own = createTunnelShades()
  }

  // A frame from the valley, landed at `at` (local ms).
  receive(msg: ShadowmenMessage, at: number): void {
    applyShadowFrame(this.table, msg.tunnel, at)
    this.pending.push(...msg.tunnelBursts)
  }

  update({
    dt,
    time,
    player,
    alone,
    renderAt,
    myId,
  }: TunnelShadesFrame): TunnelShadesUpdate {
    let struck = false
    let shown: TunnelShadeWire[] = []
    let me = myId ?? ''
    if (this.place && alone) {
      // Played alone the valley's frames are stale: start them afresh.
      this.table = createShadowTable()
      const out = stepTunnelShades(this.own, this.rng, {
        dt,
        raiders: [{ id: ALONE, x: player.x, z: player.z, ...alone }],
        place: this.place,
      })
      struck = out.struck.length > 0
      this.pending.push(...out.bursts.map(({ x, z, kind }) => ({ x, z, kind })))
      shown = tunnelShadesAt(this.own, this.place).map((s) => ({
        id: s.id,
        kind: s.kind,
        x: s.world.x,
        z: s.world.z,
        burn: s.burn / CONFIG.tunnel[s.kind].burnSeconds,
        target: s.target,
      }))
      me = ALONE
    } else if (this.place) {
      shown = sampleShadowmen(this.table, renderAt)
    }
    this.shown = shown
    this.draw(shown, player, time)
    const bursts = this.pending
    this.pending = []
    const contacts: ScopeContact[] = []
    for (const s of shown) {
      const dist = Math.hypot(s.x - player.x, s.z - player.z)
      if (dist >= CONFIG.scope.rangeMetres) continue
      contacts.push({
        dist,
        bearing: compassBearing(s.x - player.x, s.z - player.z),
        hunting: s.target === me,
      })
    }
    return { struck, bursts, contacts }
  }

  private draw(
    shown: readonly TunnelShadeWire[],
    player: XZ,
    time: number
  ): void {
    const seen = new Set<number>()
    for (const s of shown) {
      seen.add(s.id)
      let rig = this.rigs.get(s.id)
      if (!rig) {
        rig = buildTunnelShade(s.kind, 0x7e11 + s.id)
        this.rigs.set(s.id, rig)
        this.scene.add(rig.group)
      }
      const burn = Math.min(1, s.burn)
      const shake = burn * 0.15
      rig.group.visible = true
      rig.group.position.set(
        s.x + range(this.rng, -shake, shake),
        this.groundAt(s.x, s.z),
        s.z + range(this.rng, -shake, shake)
      )
      rig.group.rotation.y = Math.atan2(player.x - s.x, player.z - s.z)
      rig.setBurn(burn)
      rig.update(time)
    }
    for (const [id, rig] of this.rigs) {
      if (!seen.has(id)) rig.group.visible = false
    }
  }
}

// The scale of the burst a shade leaves: the Warden's is far bigger.
export function burstScale(kind: TunnelBurstWire['kind']): number {
  return kind === 'warden' ? 2.5 : 1
}

// How high its chest stands, where the burst blooms.
export function burstHeight(kind: TunnelBurstWire['kind']): number {
  return CONFIG.tunnel[kind].chestHeight
}
