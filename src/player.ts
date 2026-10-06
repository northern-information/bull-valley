import * as THREE from 'three'
import { isHeld, moveAxis, WORLD } from './bindings.ts'
import { CONFIG } from './config.ts'
import type { HeightAt, Metres, XZ } from './interfaces.ts'

// First-person controller: the movement keys (bindings.ts) relative to
// yaw, sprint and crouch, pointer-lock mouse look, feet on world.ground.at.
// The camera never leaves this class; main.ts only reads the
// returned state.

export interface PlayerSpawn {
  x: number
  z: number
  yaw?: number
}

export interface PlayerOptions {
  camera: THREE.Camera
  // What the player stands on: world.ground.at, never the bare terrain.
  groundAt: HeightAt
  // What stops the player: world.walls.resolve. Omitted, nothing does.
  collide?: (x: number, z: number, radius: number) => XZ
  metres: Metres
  spawn: PlayerSpawn
}

// Per-frame movement modifiers from items and the scope.
export interface PlayerMods {
  speedScale?: number
  swayAmp?: number
  driftAmp?: number
}

// What update() returns each frame.
export interface PlayerState {
  pos: THREE.Vector3
  forward: THREE.Vector3
  speed: number
  moving: boolean
  sprinting: boolean
  crouching: boolean
}

export class Player {
  camera: THREE.Camera
  groundAt: HeightAt
  collide: ((x: number, z: number, radius: number) => XZ) | null
  metres: Metres
  pos: THREE.Vector3
  yaw: number
  pitch: number
  vel: THREE.Vector3
  keys: Set<string>
  locked: boolean
  bobPhase: number
  prevBobSin: number
  eye: number
  // The ground height the feet stand on this frame. It follows groundAt
  // with a short lag, so stepping onto a road or a lot is a step up, not a
  // jolt; a teleport snaps it.
  groundY: number
  forward: THREE.Vector3
  onStep: ((sprinting: boolean) => void) | null
  onEdge: (() => void) | null
  edgeCooldown: number
  time: number

  constructor({ camera, groundAt, collide, metres, spawn }: PlayerOptions) {
    this.camera = camera
    this.camera.rotation.order = 'YXZ'
    this.groundAt = groundAt
    this.collide = collide ?? null
    this.metres = metres
    this.pos = new THREE.Vector3(spawn.x, 0, spawn.z)
    this.yaw = spawn.yaw || 0
    this.pitch = 0
    this.vel = new THREE.Vector3()
    this.keys = new Set()
    this.locked = false
    this.bobPhase = 0
    this.prevBobSin = 0
    this.eye = CONFIG.player.eyeHeight
    this.groundY = groundAt(spawn.x, spawn.z)
    this.forward = new THREE.Vector3(0, 0, -1)
    this.onStep = null
    this.onEdge = null
    this.edgeCooldown = 0
    this.time = 0
  }

  relocate(x: number, z: number, yaw?: number) {
    this.pos.set(x, 0, z)
    if (yaw !== undefined) this.yaw = yaw
    this.vel.set(0, 0, 0)
    this.groundY = this.groundAt(x, z)
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
    this.time += dt
    const sprinting = isHeld(this.keys, WORLD.sprint)
    const crouching = isHeld(this.keys, WORLD.crouch)
    const { x: ix, z: iz } = moveAxis(this.keys)

    let speed = crouching
      ? cfg.crouchSpeed
      : sprinting
        ? cfg.sprintSpeed
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
    const blend = Math.min(1, 10 * dt)
    this.vel.x += (targetX - this.vel.x) * blend
    this.vel.z += (targetZ - this.vel.z) * blend
    this.pos.x += this.vel.x * dt
    this.pos.z += this.vel.z * dt
    if (this.collide) {
      const out = this.collide(this.pos.x, this.pos.z, CONFIG.player.radius)
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

    // Head bob, and a step event each time the sine bottoms out.
    this.bobPhase += speedNow * dt * 1.6
    const bobSin = Math.sin(this.bobPhase)
    if (moving && this.prevBobSin > 0 && bobSin <= 0 && this.onStep) {
      this.onStep(sprinting)
    }
    this.prevBobSin = bobSin

    const targetEye = crouching ? cfg.crouchEyeHeight : cfg.eyeHeight
    this.eye += (targetEye - this.eye) * Math.min(1, 8 * dt)
    const target = this.groundAt(this.pos.x, this.pos.z)
    this.groundY += (target - this.groundY) * Math.min(1, 10 * dt)
    const ground = this.groundY
    const bob = bobSin * 0.05 * Math.min(1, speedNow / 4)

    // Nerves sway (roll + pitch flutter) and weed drift (slow yaw wander).
    const sway = mods.swayAmp || 0
    const drift = mods.driftAmp || 0
    this.yaw += Math.sin(this.time * 0.31) * drift * dt
    const roll =
      Math.sin(this.time * 1.7) * 0.035 * sway +
      Math.sin(this.time * 0.47) * 0.02 * drift
    const pitchFlutter = Math.sin(this.time * 2.3) * 0.012 * sway

    this.camera.position.set(this.pos.x, ground + this.eye + bob, this.pos.z)
    this.camera.rotation.set(this.pitch + pitchFlutter, this.yaw, roll)

    this.forward.set(-sin, 0, -cos)

    return {
      pos: this.camera.position,
      forward: this.forward,
      speed: speedNow,
      moving,
      sprinting: sprinting && moving,
      crouching,
    }
  }
}
