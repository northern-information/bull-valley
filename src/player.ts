import * as THREE from 'three'
import { isHeld, moveAxis, WORLD } from './bindings.ts'
import { CONFIG } from './config.ts'
import { airborne } from './fall.ts'
import type { HeightAt, Metres, XZ } from './interfaces.ts'

// First-person controller: the movement keys (bindings.ts) relative to
// yaw, sprint and crouch, pointer-lock mouse look, feet on world.ground.at.
// Where the ground drops away (off the moat's rim, off a landing) the feet
// leave it and fall (fall.ts), carried on by what speed they had, and the
// landing says how far they fell.
// The camera never leaves this class; loop.ts only reads the
// returned state.

interface PlayerSpawn {
  x: number
  z: number
  yaw?: number
}

interface PlayerOptions {
  camera: THREE.Camera
  // What the player stands on: world.ground.at, never the bare terrain.
  groundAt: HeightAt
  // The deck feet at a height stand on (world.ground.standAt), where decks
  // stack; omitted, groundAt.
  standAt?: (x: number, z: number, feetY: number) => number
  // What stops the player: world.walls.resolve, given the feet's height.
  // Omitted, nothing does.
  collide?: Collide
  metres: Metres
  spawn: PlayerSpawn
}

type Collide = (x: number, z: number, radius: number, feet?: number) => XZ

// Per-frame movement modifiers from items and the phone.
interface PlayerMods {
  speedScale?: number
  // How much faster the sprint alone runs (buffs.ts sprintScale).
  sprintScale?: number
  // The eye sunk to this height over the ground (an emote sitting or
  // kneeling), or null for standing or crouched.
  eye?: number | null
}

// What update() returns each frame.
interface PlayerState {
  pos: THREE.Vector3
  forward: THREE.Vector3
  speed: number
  moving: boolean
  sprinting: boolean
  crouching: boolean
  // The height of a fall that ended this frame, or null.
  landed: number | null
}

export class Player {
  camera: THREE.Camera
  groundAt: HeightAt
  standAt: (x: number, z: number, feetY: number) => number
  collide: Collide | null
  metres: Metres
  pos: THREE.Vector3
  yaw: number
  pitch: number
  vel: THREE.Vector3
  keys: Set<string>
  locked: boolean
  bobPhase: number
  eye: number
  // The ground height the feet stand on this frame. It follows groundAt
  // with a short lag, so stepping onto a road or a lot is a step up, not a
  // jolt; a teleport snaps it.
  groundY: number
  forward: THREE.Vector3
  onEdge: (() => void) | null
  edgeCooldown: number
  // Falling: how fast the feet drop (m/s, down), and from how high they
  // fell, or null on the ground.
  fallSpeed: number
  fallFrom: number | null

  constructor({
    camera,
    groundAt,
    standAt,
    collide,
    metres,
    spawn,
  }: PlayerOptions) {
    this.camera = camera
    this.camera.rotation.order = 'YXZ'
    this.groundAt = groundAt
    this.standAt = standAt ?? ((x, z) => groundAt(x, z))
    this.collide = collide ?? null
    this.metres = metres
    this.pos = new THREE.Vector3(spawn.x, 0, spawn.z)
    this.yaw = spawn.yaw || 0
    this.pitch = 0
    this.vel = new THREE.Vector3()
    this.keys = new Set()
    this.locked = false
    this.bobPhase = 0
    this.eye = CONFIG.player.eyeHeight
    this.groundY = groundAt(spawn.x, spawn.z)
    this.forward = new THREE.Vector3(0, 0, -1)
    this.onEdge = null
    this.edgeCooldown = 0
    this.fallSpeed = 0
    this.fallFrom = null
  }

  // Set down at (x, z), on the highest deck there: never a fall.
  relocate(x: number, z: number, yaw?: number) {
    this.pos.set(x, 0, z)
    if (yaw !== undefined) this.yaw = yaw
    this.vel.set(0, 0, 0)
    this.groundY = this.groundAt(x, z)
    this.fallSpeed = 0
    this.fallFrom = null
  }

  handleKey(code: string, down: boolean) {
    if (down) this.keys.add(code)
    else this.keys.delete(code)
  }

  handleMouse(dx: number, dy: number) {
    if (!this.locked) return
    const s = CONFIG.player.mouseSensitivity
    this.yaw -= dx * s
    this.pitch = Math.max(-1.45, Math.min(1.45, this.pitch - dy * s))
  }

  update(dt: number, mods: PlayerMods = {}): PlayerState {
    const cfg = CONFIG.player
    const sprinting = isHeld(this.keys, WORLD.sprint)
    const crouching = isHeld(this.keys, WORLD.crouch)
    const { x: ix, z: iz } = moveAxis(this.keys)

    let speed = crouching
      ? cfg.crouchSpeed
      : sprinting
        ? cfg.sprintSpeed * (mods.sprintScale ?? 1)
        : cfg.walkSpeed
    speed *= mods.speedScale ?? 1

    const sin = Math.sin(this.yaw)
    const cos = Math.cos(this.yaw)
    let targetX = 0
    let targetZ = 0
    if ((ix || iz) && this.locked) {
      const inv = 1 / Math.hypot(ix, iz)
      // forward is (-sin, 0, -cos); right is (cos, 0, -sin)
      targetX = (-sin * iz + cos * ix) * inv * speed
      targetZ = (-cos * iz - sin * ix) * inv * speed
    }
    // In the air, the feet go where they were going.
    if (this.fallFrom === null) {
      const blend = Math.min(1, 10 * dt)
      this.vel.x += (targetX - this.vel.x) * blend
      this.vel.z += (targetZ - this.vel.z) * blend
    }
    this.pos.x += this.vel.x * dt
    this.pos.z += this.vel.z * dt
    if (this.collide) {
      const out = this.collide(
        this.pos.x,
        this.pos.z,
        CONFIG.player.radius,
        this.groundY
      )
      this.pos.x = out.x
      this.pos.z = out.z
    }

    // The survey square has edges; the fog just pretends it doesn't.
    const mx = this.metres.width / 2 - 8
    const mz = this.metres.height / 2 - 8
    this.edgeCooldown -= dt
    if (Math.abs(this.pos.x) > mx || Math.abs(this.pos.z) > mz) {
      this.pos.x = Math.max(-mx, Math.min(mx, this.pos.x))
      this.pos.z = Math.max(-mz, Math.min(mz, this.pos.z))
      if (this.onEdge && this.edgeCooldown <= 0) {
        this.edgeCooldown = 6
        this.onEdge()
      }
    }

    const speedNow = Math.hypot(this.vel.x, this.vel.z)
    const moving = speedNow > 0.3

    this.bobPhase += speedNow * dt * 1.6
    const bobSin = Math.sin(this.bobPhase)

    const targetEye =
      mods.eye ?? (crouching ? cfg.crouchEyeHeight : cfg.eyeHeight)
    this.eye += (targetEye - this.eye) * Math.min(1, 8 * dt)
    const landed = this.settle(dt)
    const ground = this.groundY
    const bob = bobSin * 0.05 * Math.min(1, speedNow / 4)

    this.camera.position.set(this.pos.x, ground + this.eye + bob, this.pos.z)
    this.camera.rotation.set(this.pitch, this.yaw, 0)

    this.forward.set(-sin, 0, -cos)

    return {
      pos: this.camera.position,
      forward: this.forward,
      speed: speedNow,
      moving,
      sprinting: sprinting && moving,
      crouching,
      landed,
    }
  }

  // The feet onto the ground under them: eased onto it a step up or down,
  // the way a road or a lot is a step, not a jolt; falling where it drops
  // away further. Returns how far a fall that ended now fell.
  private settle(dt: number): number | null {
    const target = this.standAt(this.pos.x, this.pos.z, this.groundY)
    if (this.fallFrom === null && !airborne(this.groundY, target)) {
      this.groundY += (target - this.groundY) * Math.min(1, 10 * dt)
      return null
    }
    if (this.fallFrom === null) {
      this.fallFrom = this.groundY
      this.fallSpeed = 0
    }
    this.fallSpeed += CONFIG.fall.gravity * dt
    const next = this.groundY - this.fallSpeed * dt
    const under = this.standAt(this.pos.x, this.pos.z, this.groundY)
    if (next > under) {
      this.groundY = next
      return null
    }
    const height = this.fallFrom - under
    this.groundY = under
    this.fallFrom = null
    this.fallSpeed = 0
    return height
  }
}
