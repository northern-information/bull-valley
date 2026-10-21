// What a trip shows that is not there, drawn: hallucinations.ts says who
// or what stands where and when; this builds each from the valley's own
// models (a raider's figure with a name over it, a copy of Marx,
// Carlsten, Gron, Erwin or Tyler, a pickup with its halo), stands it on
// ground.at, flickers it in and out, turns the people to watch the
// raider, and plays the fuchsia burst E sets off (Platonic solids flung
// out round a flash). Nothing here touches the walls or the wire.

import * as THREE from 'three'
import {
  buildPickup,
  disposeTree,
  makeGlowSprite,
  makeGlowTexture,
  pulseMaterials,
} from './assets.ts'
import { CONFIG } from './config.ts'
import { copy } from './copy.ts'
import {
  applyPose,
  attachBook,
  attachFlashlight,
  buildFigure,
  buildGron,
} from './figure.ts'
import { PSYCH_FUCHSIA } from './fuchsia.ts'
import {
  burstShards,
  conjure,
  dispel,
  flashAt,
  freshHallucinations,
  presenceAt,
  shardAt,
  shownAt,
  stepHallucinations,
} from './hallucinations.ts'
import { nameLabel } from './peers.ts'
import { samplePose } from './poses.ts'
import type { Flashlight } from './assets.ts'
import type { Figure } from './figure.ts'
import type {
  Hallucination,
  HallucinationShape,
  HallucinationState,
  Seeing,
  Shard,
  Solid,
} from './hallucinations.ts'
import type { HallucinationSpot } from './interactions.ts'
import type { PoseName } from './poses.ts'
import type { XYZ } from './sfxrig.ts'

type GroundAt = (x: number, z: number) => number

// Who a raider seen could be: the names the rig is handed.
export interface Someone {
  name: string
  level: number
}

interface Shown {
  h: Hallucination
  // What stands in the valley, and what the glow rings (the body alone,
  // or the pickup).
  root: THREE.Object3D
  target: THREE.Object3D
  figure: Figure | null
  pose: PoseName | null
  // Gron's rain, on its own clock.
  tick: ((t: number) => void) | null
  dispose(): void
}

interface Burst {
  group: THREE.Group
  shards: Shard[]
  meshes: THREE.Mesh[]
  material: THREE.MeshBasicMaterial
  flash: THREE.Sprite
  age: number
}

// The burst's middle above the ground: a person's chest, a thing's top;
// and how big a thing's burst is against a person's.
const CHEST = 1.1
const THING_MIDDLE = 0.15
const THING_SCALE = 0.55
const FLASH_SIZE = 2.6

// One geometry per solid, radius 1, shared by every burst and kept.
const solids = new Map<Solid, THREE.BufferGeometry>()
function solidGeometry(solid: Solid): THREE.BufferGeometry {
  let geometry = solids.get(solid)
  if (!geometry) {
    switch (solid) {
      case 'tetrahedron':
        geometry = new THREE.TetrahedronGeometry(1)
        break
      case 'cube':
        geometry = new THREE.BoxGeometry(1.2, 1.2, 1.2)
        break
      case 'octahedron':
        geometry = new THREE.OctahedronGeometry(1)
        break
      case 'dodecahedron':
        geometry = new THREE.DodecahedronGeometry(1)
        break
      case 'icosahedron':
        geometry = new THREE.IcosahedronGeometry(1)
        break
    }
    solids.set(solid, geometry)
  }
  return geometry
}

// The fuchsia as a glow texture's colour.
function fuchsiaGlow(alpha: number): string {
  const c = new THREE.Color(PSYCH_FUCHSIA)
  const byte = (v: number) => Math.round(v * 255)
  return `rgba(${byte(c.r)}, ${byte(c.g)}, ${byte(c.b)}, ${alpha})`
}

export interface HallucinationsOptions {
  scene: THREE.Object3D
  groundAt: GroundAt
  // Whose names a raider seen might wear: this raider's own, and whoever
  // else is in the valley.
  people: () => readonly Someone[]
  seed?: number
}

export class Hallucinations {
  readonly group: THREE.Group
  // Bursts set off so far, for the dev hook.
  bursts = 0
  private state: HallucinationState
  private shown = new Map<number, Shown>()
  private playing: Burst[] = []
  private groundAt: GroundAt
  private people: () => readonly Someone[]
  private time = 0

  constructor({ scene, groundAt, people, seed }: HallucinationsOptions) {
    this.group = new THREE.Group()
    this.group.name = 'hallucinations'
    scene.add(this.group)
    this.groundAt = groundAt
    this.people = people
    this.state = freshHallucinations(
      seed ?? Math.floor(Math.random() * 0x100000000)
    )
  }

  // Those standing now.
  get list(): readonly Hallucination[] {
    return this.state.list
  }

  // A frame: the trip stepped, each one built, placed, flickered and
  // turned to watch, and the bursts played on.
  update(dt: number, seeing: Seeing): void {
    this.time = seeing.time
    this.state = stepHallucinations(this.state, seeing)
    this.sync()
    const { time, player } = seeing
    const pulse = 0.35 + Math.sin(time * 3) * 0.2
    for (const shown of this.shown.values()) {
      const { h, root, figure } = shown
      root.visible = shownAt(h, time)
      if (figure) {
        // The people turn to watch the raider.
        root.rotation.y = Math.atan2(player.x - h.x, player.z - h.z)
        if (shown.pose) applyPose(figure, samplePose(shown.pose, time))
      } else {
        for (const m of pulseMaterials(root)) m.emissiveIntensity = pulse
      }
      shown.tick?.(time)
    }
    this.playBursts(dt)
  }

  // Where E can find them: every one still there at all.
  spots(): HallucinationSpot[] {
    const spots: HallucinationSpot[] = []
    for (const h of this.state.list) {
      if (presenceAt(h, this.time) <= 0) continue
      spots.push(
        h.look.shape === 'thing'
          ? { id: h.id, x: h.x, z: h.z, shape: 'thing', item: h.look.kind }
          : { id: h.id, x: h.x, z: h.z, shape: h.look.shape }
      )
    }
    return spots
  }

  // What the glow rings for hallucination `id`.
  objectOf(id: number): THREE.Object3D | null {
    return this.shown.get(id)?.target ?? null
  }

  // E on it: gone, in a burst of fuchsia. Says where it burst, or null if
  // it was already gone.
  burst(id: number): XYZ | null {
    const { state, gone } = dispel(this.state, id)
    if (!gone) return null
    this.state = state
    this.drop(id)
    const thing = gone.look.shape === 'thing'
    const at: XYZ = {
      x: gone.x,
      y: this.groundAt(gone.x, gone.z) + (thing ? THING_MIDDLE : CHEST),
      z: gone.z,
    }
    this.spawnBurst(at, thing ? THING_SCALE : 1, id)
    this.bursts += 1
    return at
  }

  // One made now out ahead, whatever the trip (the dev hook's).
  conjure(seeing: Seeing, shape?: HallucinationShape): Hallucination | null {
    const { state, made } = conjure(this.state, seeing, shape)
    this.state = state
    this.sync()
    return made
  }

  // Builds the new and takes away the gone.
  private sync(): void {
    const live = new Set(this.state.list.map((h) => h.id))
    for (const id of [...this.shown.keys()]) {
      if (!live.has(id)) this.drop(id)
    }
    for (const h of this.state.list) {
      if (!this.shown.has(h.id)) this.build(h)
    }
  }

  private build(h: Hallucination): void {
    const shown = this.make(h)
    shown.root.position.set(h.x, this.groundAt(h.x, h.z), h.z)
    shown.root.rotation.y = h.yaw
    shown.root.name = `hallucination-${h.id}`
    shown.root.userData.hallucination = h.id
    shown.root.visible = false
    this.group.add(shown.root)
    this.shown.set(h.id, shown)
  }

  private make(h: Hallucination): Shown {
    const look = h.look
    switch (look.shape) {
      case 'thing': {
        const mesh = buildPickup(look.kind, h.id)
        return {
          h,
          root: mesh,
          target: mesh,
          figure: null,
          pose: null,
          tick: null,
          dispose: () => disposeTree(mesh),
        }
      }
      case 'raider': {
        const figure = buildFigure(look.outfit)
        const flashlight: Flashlight = attachFlashlight(figure)
        flashlight.setOn(false)
        const people = this.people()
        const who = people[Math.floor(look.name * people.length)]
        const label = who
          ? nameLabel(copy('level.tag', { name: who.name, level: who.level }))
          : null
        if (label) figure.group.add(label.sprite)
        applyPose(figure, samplePose(look.pose))
        return {
          h,
          root: figure.group,
          target: figure.group,
          figure,
          pose: look.pose,
          tick: null,
          // The figure's parts are shared with every figure; its
          // flashlight and its name are its own.
          dispose: () => {
            disposeTree(flashlight.group)
            if (label) {
              label.sprite.material.dispose()
              label.texture.dispose()
            }
          },
        }
      }
      case 'npc': {
        if (look.npc === 'gron') {
          const gron = buildGron()
          return {
            h,
            root: gron.group,
            target: gron.figure.group,
            figure: gron.figure,
            pose: null,
            tick: (t) => gron.update(t),
            dispose: () => {
              for (const child of gron.group.children) {
                if (child !== gron.figure.group) disposeTree(child)
              }
            },
          }
        }
        const figure = buildFigure(look.npc)
        const pose: PoseName = look.npc === 'marx' ? 'read' : 'stand'
        const book = look.npc === 'marx' ? attachBook(figure) : null
        applyPose(figure, samplePose(pose))
        return {
          h,
          root: figure.group,
          target: figure.group,
          figure,
          pose,
          tick: null,
          dispose: () => {
            if (book) disposeTree(book)
          },
        }
      }
    }
  }

  private drop(id: number): void {
    const shown = this.shown.get(id)
    if (!shown) return
    this.group.remove(shown.root)
    shown.dispose()
    this.shown.delete(id)
  }

  private spawnBurst(at: XYZ, scale: number, seed: number): void {
    const group = new THREE.Group()
    group.name = 'hallucination-burst'
    group.position.set(at.x, at.y, at.z)
    const material = new THREE.MeshBasicMaterial({
      color: PSYCH_FUCHSIA,
      transparent: true,
      depthWrite: false,
      fog: false,
    })
    const shards = burstShards(seed * 2654435761, scale)
    const meshes = shards.map((shard) => {
      const mesh = new THREE.Mesh(solidGeometry(shard.solid), material)
      mesh.scale.setScalar(0)
      group.add(mesh)
      return mesh
    })
    const flash = makeGlowSprite(
      makeGlowTexture(fuchsiaGlow(0.95)),
      FLASH_SIZE * scale
    )
    flash.material.fog = false
    group.add(flash)
    this.group.add(group)
    this.playing.push({ group, shards, meshes, material, flash, age: 0 })
    this.drawBurst(this.playing[this.playing.length - 1])
  }

  private drawBurst(burst: Burst): void {
    let opacity = 0
    burst.shards.forEach((shard, i) => {
      const pose = shardAt(shard, burst.age)
      const mesh = burst.meshes[i]
      mesh.position.set(...pose.at)
      mesh.rotation.set(...pose.turn)
      mesh.scale.setScalar(pose.scale)
      opacity = Math.max(opacity, pose.opacity)
    })
    burst.material.opacity = opacity
    burst.flash.material.opacity = flashAt(burst.age)
  }

  private playBursts(dt: number): void {
    if (!this.playing.length) return
    for (const burst of this.playing) {
      burst.age += dt
      this.drawBurst(burst)
    }
    const done = this.playing.filter(
      (b) => b.age >= CONFIG.hallucinations.burst.seconds
    )
    for (const burst of done) {
      this.group.remove(burst.group)
      burst.material.dispose()
      burst.flash.material.dispose()
    }
    this.playing = this.playing.filter((b) => !done.includes(b))
  }
}
