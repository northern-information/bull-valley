// What Matthew Marx's donuts leave behind, drawn (donutwake.ts): the clods
// of grass and dirt his rear wheels throw, as one cloud of points, and the
// ruts they cut, painted on a canvas sheet draped over the field. The ruts
// heal slowly while he reads. A client that arrives mid-leg cuts what the
// leg has already cut, from its route.

import * as THREE from 'three'
import { artTexture, lambert } from './assets.ts'
import { canvas } from './canvas.ts'
import { CONFIG } from './config.ts'
import {
  clodsDue,
  inField,
  rearWheels,
  stepClods,
  throwClod,
  tracksAlong,
} from './donutwake.ts'
import { mulberry32 } from './rng.ts'
import type { CanvasArt } from './canvas.ts'
import type { DonutField } from './donuts.ts'
import type { Clod } from './donutwake.ts'
import type { HeightAt, XZ } from './interfaces.ts'
import type { RoadPoint } from './roadgraph.ts'
import type { Truck } from './truck.ts'

interface DonutWakeOptions {
  scene: THREE.Object3D
  field: DonutField
  // What the field stands on: world.ground.at.
  groundAt: HeightAt
}

// The sheet reaches this far past the field's edge, is draped every
// SHEET_STEP metres, and lies SHEET_LIFT over the ground: a stain in the
// grass, too low to stand on.
const SHEET_MARGIN = 1.5
const SHEET_STEP = 2
const SHEET_LIFT = 0.06
// Two samples of a wheel further apart than this jumped, and no rut is cut
// across the gap.
const RUT_GAP = 2.5
// Metres between the samples of the ruts along the route.
const RUT_STEP = 0.5
// The ruts' texture uploads at most this often, in seconds.
const UPLOAD_SECONDS = 0.1

const RUT_RGB = '86, 64, 42'
const GRASS = [new THREE.Color('#5d8a3a'), new THREE.Color('#7aa04a')]
const DIRT = [new THREE.Color('#6e5136'), new THREE.Color('#8a6847')]

export class DonutWake {
  field: DonutField
  groundAt: HeightAt
  clods: Clod[]
  points: THREE.Points
  positions: Float32Array
  colors: Float32Array
  art: CanvasArt
  texture: THREE.CanvasTexture
  sheet: THREE.Mesh
  // The sheet's corner, its side in metres, and the pixels to a metre.
  x0: number
  z0: number
  side: number
  scale: number
  rng: () => number
  // The route whose ruts are cut, how far along it they are cut, and each
  // rear wheel's last spot.
  route: readonly RoadPoint[] | null
  cutTo: number
  wheels: (XZ | null)[]
  // The truck's last spot, for its speed.
  last: XZ | null
  dirty: boolean
  sinceUpload: number
  sinceHeal: number

  constructor({ scene, field, groundAt }: DonutWakeOptions) {
    this.field = field
    this.groundAt = groundAt
    this.clods = []
    this.rng = mulberry32(0xd0e7)
    this.route = null
    this.cutTo = 0
    this.wheels = [null, null]
    this.last = null
    this.dirty = false
    this.sinceUpload = 0
    this.sinceHeal = 0

    const { spray, ruts } = CONFIG.truck.donuts
    this.positions = new Float32Array(spray.max * 3)
    this.colors = new Float32Array(spray.max * 3)
    const geometry = new THREE.BufferGeometry()
    geometry.setAttribute(
      'position',
      new THREE.BufferAttribute(this.positions, 3).setUsage(
        THREE.DynamicDrawUsage
      )
    )
    geometry.setAttribute(
      'color',
      new THREE.BufferAttribute(this.colors, 3).setUsage(THREE.DynamicDrawUsage)
    )
    geometry.setDrawRange(0, 0)
    this.points = new THREE.Points(
      geometry,
      new THREE.PointsMaterial({
        size: 0.22,
        vertexColors: true,
        sizeAttenuation: true,
      })
    )
    this.points.name = 'donut-clods'
    this.points.frustumCulled = false
    scene.add(this.points)

    this.side = (field.radius + SHEET_MARGIN) * 2
    this.x0 = field.x - this.side / 2
    this.z0 = field.z - this.side / 2
    this.scale = ruts.px / this.side
    this.art = canvas([ruts.px, ruts.px])
    this.art.ctx.lineCap = 'round'
    this.art.ctx.lineJoin = 'round'
    this.texture = artTexture(this.art)
    this.sheet = this.buildSheet()
    scene.add(this.sheet)
  }

  // The sheet over the field, draped on the ground, the ruts painted on it
  // and the grass showing through everywhere else.
  buildSheet(): THREE.Mesh {
    const n = Math.ceil(this.side / SHEET_STEP)
    const positions: number[] = []
    const uvs: number[] = []
    const index: number[] = []
    for (let j = 0; j <= n; j++) {
      for (let i = 0; i <= n; i++) {
        const u = i / n
        const v = j / n
        const x = this.x0 + u * this.side
        const z = this.z0 + v * this.side
        positions.push(x, this.groundAt(x, z) + SHEET_LIFT, z)
        // Canvas rows run down from the top, the texture's v up.
        uvs.push(u, 1 - v)
        if (i > 0 && j > 0) {
          const k = j * (n + 1) + i
          const a = k - n - 2
          const b = k - n - 1
          index.push(a, k - 1, b, b, k - 1, k)
        }
      }
    }
    const geometry = new THREE.BufferGeometry()
    geometry.setAttribute(
      'position',
      new THREE.BufferAttribute(new Float32Array(positions), 3)
    )
    geometry.setAttribute(
      'uv',
      new THREE.BufferAttribute(new Float32Array(uvs), 2)
    )
    const normals = new Float32Array(positions.length)
    for (let i = 0; i < normals.length; i += 3) normals[i + 1] = 1
    geometry.setAttribute('normal', new THREE.BufferAttribute(normals, 3))
    geometry.setIndex(index)
    const mesh = new THREE.Mesh(
      geometry,
      lambert({
        map: this.texture,
        transparent: true,
        depthWrite: false,
        emissive: new THREE.Color('#ffffff'),
        emissiveMap: this.texture,
        emissiveIntensity: 0.8,
        polygonOffset: true,
        polygonOffsetFactor: -1,
        side: THREE.DoubleSide,
      })
    )
    mesh.name = 'donut-ruts'
    return mesh
  }

  // Cuts a rut from one spot to the next, inside the field only.
  cut(from: XZ, to: XZ): void {
    if (!inField(this.field, from) || !inField(this.field, to)) return
    if (Math.hypot(to.x - from.x, to.z - from.z) > RUT_GAP) return
    const { ctx } = this.art
    const { alpha, width } = CONFIG.truck.donuts.ruts
    ctx.strokeStyle = `rgba(${RUT_RGB}, ${alpha})`
    ctx.lineWidth = Math.max(1, width * this.scale)
    ctx.beginPath()
    ctx.moveTo((from.x - this.x0) * this.scale, (from.z - this.z0) * this.scale)
    ctx.lineTo((to.x - this.x0) * this.scale, (to.z - this.z0) * this.scale)
    ctx.stroke()
    this.dirty = true
  }

  // The rear wheels at the truck's middle (x, z) turned `heading`: a rut
  // from where each last stood.
  roll(x: number, z: number, heading: number): void {
    const wheels = rearWheels(x, z, heading)
    wheels.forEach((wheel, i) => {
      const was = this.wheels[i]
      if (was) this.cut(was, wheel)
      this.wheels[i] = wheel
    })
  }

  // The grass takes the ruts back a little.
  heal(): void {
    const { ctx, w, h } = this.art
    ctx.globalCompositeOperation = 'destination-out'
    ctx.fillStyle = `rgba(0, 0, 0, ${CONFIG.truck.donuts.ruts.heal})`
    ctx.fillRect(0, 0, w, h)
    ctx.globalCompositeOperation = 'source-over'
    this.dirty = true
  }

  update(dt: number, truck: Truck): void {
    const { spray, ruts, speed: top } = CONFIG.truck.donuts
    const tearing =
      truck.drifting && truck.moving && truck.engineSeconds() !== null
    if (!tearing) {
      this.last = null
    } else {
      // The ruts along the route up to where the truck has got to: from
      // the start, on a new leg, so a client arriving mid-leg sees what it
      // has cut already.
      if (truck.route !== this.route) {
        this.route = truck.route
        this.cutTo = 0
        this.wheels = [null, null]
      }
      const to = truck.travelled
      for (const t of tracksAlong(truck.route, this.cutTo, to, RUT_STEP))
        this.roll(t.x, t.z, t.heading)
      this.cutTo = to
      const heading = truck.group.rotation.y
      const speed =
        this.last && dt > 0
          ? Math.hypot(truck.x - this.last.x, truck.z - this.last.z) / dt
          : 0
      this.last = { x: truck.x, z: truck.z }
      const due = clodsDue(dt, speed, top, spray, this.rng)
      const wheels = rearWheels(truck.x, truck.z, heading).filter((w) =>
        inField(this.field, w)
      )
      for (let i = 0; i < due && wheels.length; i++) {
        const wheel = wheels[i % wheels.length]
        this.clods.push(
          throwClod(
            wheel,
            this.groundAt(wheel.x, wheel.z),
            heading,
            spray,
            this.rng
          )
        )
      }
    }
    stepClods(this.clods, dt, this.groundAt, spray)
    this.drawClods()

    this.sinceHeal += dt
    if (this.sinceHeal >= ruts.healSeconds) {
      this.sinceHeal = 0
      this.heal()
    }
    this.sinceUpload += dt
    if (this.dirty && this.sinceUpload >= UPLOAD_SECONDS) {
      this.texture.needsUpdate = true
      this.dirty = false
      this.sinceUpload = 0
    }
  }

  drawClods(): void {
    const { clods, positions, colors } = this
    const geometry = this.points.geometry
    if (!clods.length && geometry.drawRange.count === 0) return
    for (let i = 0; i < clods.length; i++) {
      const clod = clods[i]
      positions[i * 3] = clod.x
      positions[i * 3 + 1] = clod.y
      positions[i * 3 + 2] = clod.z
      const color = (clod.grass ? GRASS : DIRT)[clod.dark ? 0 : 1]
      colors[i * 3] = color.r
      colors[i * 3 + 1] = color.g
      colors[i * 3 + 2] = color.b
    }
    geometry.setDrawRange(0, clods.length)
    geometry.attributes.position.needsUpdate = true
    geometry.attributes.color.needsUpdate = true
  }
}
