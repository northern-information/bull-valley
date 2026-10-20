// The Caretaker as seen (caretaker.ts): its body (assets.ts buildCaretaker)
// floating over the maze's paths, turned to face the player, shaking and
// paling as two beams burn it, drawing its lantern back as it winds up
// to strike and lurching out as it lunges. It is the valley's
// (sharedworld.ts rule 13): it rides in the shadowmen frames, kept a few
// seconds (framebuffer.ts), and is drawn a beat behind the present, between
// the two either side of that moment.

import * as THREE from 'three'
import { buildCaretaker } from './assets.ts'
import { CONFIG } from './config.ts'
import { between, keepFrame, lerp } from './framebuffer.ts'
import { mulberry32, range } from './rng.ts'
import { keeperCues } from './sfx.ts'
import type { CaretakerRig } from './assets.ts'
import type { HeightAt, XZ } from './interfaces.ts'
import type { MazePlace } from './maze.ts'
import type { CaretakerWire, ShadowmenMessage } from './protocol.ts'
import type { ShadeCues } from './sfx.ts'

const LUNGE_SECONDS = 0.35

interface Frame {
  at: number
  caretaker: CaretakerWire | null
}

interface CaretakerShadeOptions {
  scene: THREE.Object3D
  groundAt: HeightAt
  // Where the corn maze lies; null without one, and then there is no
  // Caretaker.
  place: MazePlace | null
}

interface CaretakerShadeFrame {
  dt: number
  // A running time for its drift and its lantern.
  time: number
  player: XZ
  renderAt: number
}

interface CaretakerShadeUpdate {
  // Where it was burned since the last update.
  burned: XZ[]
  // How far it floats from the player, or null while it is burned (the
  // Book of Shadows).
  distance: number | null
  // What it sounds like this frame (sfx.ts).
  heard: ShadeCues
}

export class CaretakerShade {
  // Where it stands as last drawn, for the dev hook; null while burned.
  shown: CaretakerWire | null = null
  private maze: MazePlace | null
  private groundAt: HeightAt
  private rig: CaretakerRig
  private rng = mulberry32(0xca2e7)
  // The frames landed, oldest first.
  private frames: Frame[] = []
  private pending: XZ[] = []
  // Seconds since it last lunged, while the lunge plays; null otherwise.
  private lunging: number | null = null
  // A windup begun and a lunge not yet heard, and its windup in the last
  // frame or step.
  private begun = false
  private lunged = false
  private windup = 0

  constructor({ scene, groundAt, place }: CaretakerShadeOptions) {
    this.maze = place
    this.groundAt = groundAt
    this.rig = buildCaretaker()
    this.rig.group.visible = false
    scene.add(this.rig.group)
  }

  // A frame from the valley, landed at `at` (local ms).
  receive(msg: ShadowmenMessage, at: number): void {
    keepFrame(this.frames, { at, caretaker: msg.caretaker })
    if (msg.burned) this.pending.push(msg.burned)
    if (msg.caretaker?.lunge) {
      this.lunging = 0
      this.lunged = true
    }
    this.listen(msg.caretaker?.windup ?? 0)
  }

  // A frame landed: whether its windup began.
  private listen(windup: number): void {
    if (windup > 0 && this.windup <= 0) this.begun = true
    this.windup = windup
  }

  update({
    dt,
    time,
    player,
    renderAt,
  }: CaretakerShadeFrame): CaretakerShadeUpdate {
    const shown = this.maze ? this.sample(renderAt) : null
    this.shown = shown
    if (this.lunging !== null) {
      this.lunging += dt
      if (this.lunging >= LUNGE_SECONDS) this.lunging = null
    }
    this.draw(shown, player, time)
    const burned = this.pending
    this.pending = []
    const heard = keeperCues(
      this.begun,
      this.lunged,
      shown,
      burned,
      player,
      CONFIG.sfx
    )
    this.begun = false
    this.lunged = false
    const distance = shown
      ? Math.hypot(shown.x - player.x, shown.z - player.z)
      : null
    return { burned, distance, heard }
  }

  // The valley's Caretaker at renderAt, between the two frames either side
  // of it; it shows as soon as it forms (held where it formed until the
  // drawing reaches it) and is gone as soon as it is burned.
  private sample(renderAt: number): CaretakerWire | null {
    const now = this.frames.at(-1)?.caretaker ?? null
    if (!now) return null
    const at = between(this.frames, renderAt, (f) => f.caretaker)
    if (!at) return now
    const { from, to, t } = at
    return {
      ...now,
      x: lerp(from.x, to.x, t),
      z: lerp(from.z, to.z, t),
      burn: lerp(from.burn, to.burn, t),
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
