// The Caretaker as seen (caretaker.ts): its body (assets.ts buildCaretaker)
// floating over the maze's paths, turned to face the player, shaking and
// paling as two beams unmake it, drawing its lantern back as it winds up
// to strike and lurching out as it lunges. In the shared valley it is the valley's
// (sharedworld.ts rule 13): it rides in the shadowmen frames and is drawn a
// beat behind the present, between the last two. Played alone, this steps
// a Caretaker of its own with the player as the one raider, and one
// flashlight can never unmake it.

import * as THREE from 'three'
import { buildCaretaker } from './assets.ts'
import { caretakerAt, createCaretaker, stepCaretaker } from './caretaker.ts'
import { CONFIG } from './config.ts'
import { compassBearing } from './coords.ts'
import { worldToMaze } from './maze.ts'
import { mulberry32, range } from './rng.ts'
import type { CaretakerRig } from './assets.ts'
import type { Caretaker } from './caretaker.ts'
import type { HeightAt, ScopeContact, XZ } from './interfaces.ts'
import type { MazePlace } from './maze.ts'
import type { CaretakerWire, ShadowmenMessage } from './protocol.ts'
import type { AloneFrame } from './shadowcards.ts'

// The player's id when they play alone.
const ALONE = 'me'

// How long a lunge plays, in seconds.
const LUNGE_SECONDS = 0.35

interface Frame {
  at: number
  caretaker: CaretakerWire | null
}

export interface CaretakerShadeOptions {
  scene: THREE.Object3D
  groundAt: HeightAt
  // Where the corn maze lies; null without one, and then there is no
  // Caretaker.
  place: MazePlace | null
}

export interface CaretakerShadeFrame {
  dt: number
  // A running time for its drift and its lantern.
  time: number
  player: XZ
  // Null in the shared valley, which steps it itself.
  alone: AloneFrame | null
  renderAt: number
  myId: string | null
}

export interface CaretakerShadeUpdate {
  // It caught the player, played alone; in the shared valley a struck
  // frame says so.
  struck: boolean
  // Where it was unmade since the last update.
  unmade: XZ[]
  // Its blip on the scope, if it is in range.
  contact: ScopeContact | null
}

export class CaretakerShade {
  // Played alone: the Caretaker this client steps.
  own: Caretaker
  // Where it stands as last drawn, for the dev hook; null while unmade.
  shown: CaretakerWire | null = null
  private maze: MazePlace | null
  private groundAt: HeightAt
  private rig: CaretakerRig
  private rng = mulberry32(0xca2e7)
  private prev: Frame | null = null
  private next: Frame | null = null
  private pending: XZ[] = []
  // Seconds since it last lunged, while the lunge plays; null otherwise.
  private lunging: number | null = null

  constructor({ scene, groundAt, place }: CaretakerShadeOptions) {
    this.maze = place
    this.groundAt = groundAt
    this.rig = buildCaretaker()
    this.rig.group.visible = false
    scene.add(this.rig.group)
    this.own = createCaretaker()
  }

  // Played alone: the Caretaker moved to world (x, z), formed, its hunt
  // forgotten, floating still until it has someone to hunt, for the specs.
  place(x: number, z: number): void {
    if (!this.maze) return
    this.own = {
      ...createCaretaker(),
      ...worldToMaze(this.maze, { x, z }),
      held: true,
    }
  }

  // A frame from the valley, landed at `at` (local ms).
  receive(msg: ShadowmenMessage, at: number): void {
    this.prev = this.next
    this.next = { at, caretaker: msg.caretaker }
    if (msg.unmade) this.pending.push(msg.unmade)
    if (msg.caretaker?.lunge) this.lunging = 0
  }

  update({
    dt,
    time,
    player,
    alone,
    renderAt,
    myId,
  }: CaretakerShadeFrame): CaretakerShadeUpdate {
    let struck = false
    let shown: CaretakerWire | null = null
    let me = myId ?? ''
    if (this.maze && alone) {
      // Played alone the valley's frames are stale: start them afresh.
      this.prev = null
      this.next = null
      const out = stepCaretaker(this.own, this.rng, {
        dt,
        raiders: [{ id: ALONE, x: player.x, z: player.z, ...alone }],
        place: this.maze,
      })
      struck = out.struck.length > 0
      if (out.burst) this.pending.push(out.burst)
      if (out.lunged) this.lunging = 0
      const at = caretakerAt(this.own, this.maze)
      shown = at && {
        ...at,
        burn: this.own.burn / CONFIG.caretaker.burnSeconds,
        target: this.own.target,
        windup: this.own.windup / CONFIG.caretaker.windupSeconds,
      }
      me = ALONE
    } else if (this.maze) {
      // The one this client stepped is not the valley's: a fall back to
      // playing alone starts fresh.
      if (this.own.target || this.own.route.length) {
        this.own = createCaretaker()
      }
      shown = this.sample(renderAt)
    }
    this.shown = shown
    if (this.lunging !== null) {
      this.lunging += dt
      if (this.lunging >= LUNGE_SECONDS) this.lunging = null
    }
    this.draw(shown, player, time)
    const unmade = this.pending
    this.pending = []
    let contact: ScopeContact | null = null
    if (shown) {
      const dist = Math.hypot(shown.x - player.x, shown.z - player.z)
      if (dist < CONFIG.scope.rangeMetres) {
        contact = {
          dist,
          bearing: compassBearing(shown.x - player.x, shown.z - player.z),
          hunting: shown.target === me,
          kind: 'shadow',
        }
      }
    }
    return { struck, unmade, contact }
  }

  // The valley's Caretaker at renderAt, between the last two frames; it
  // shows as soon as it forms and is gone as soon as it is unmade.
  private sample(renderAt: number): CaretakerWire | null {
    const { prev, next } = this
    const now = next?.caretaker ?? null
    const was = prev?.caretaker ?? null
    if (!next || !now || !prev || !was || next.at <= prev.at) return now
    const t = Math.min(
      1,
      Math.max(0, (renderAt - prev.at) / (next.at - prev.at))
    )
    return {
      ...now,
      x: was.x + (now.x - was.x) * t,
      z: was.z + (now.z - was.z) * t,
      burn: was.burn + (now.burn - was.burn) * t,
    }
  }

  private draw(shown: CaretakerWire | null, player: XZ, time: number): void {
    const group = this.rig.group
    group.visible = shown !== null
    if (!shown) return
    const burn = Math.min(1, shown.burn)
    const shake = burn * 0.15
    group.position.set(
      shown.x + range(this.rng, -shake, shake),
      this.groundAt(shown.x, shown.z),
      shown.z + range(this.rng, -shake, shake)
    )
    group.rotation.y = Math.atan2(player.x - shown.x, player.z - shown.z)
    this.rig.setBurn(burn)
    this.rig.setStrike(
      shown.windup ?? 0,
      this.lunging === null ? 0 : this.lunging / LUNGE_SECONDS
    )
    this.rig.update(time)
  }
}
