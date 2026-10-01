// Matthew Marx's white Chevy: a low-poly pickup that parks, drives road
// routes, and carries the player in its bed. The mesh is Lambert boxes through
// the PS1 snap; the driver is a name in toasts, not a model. All route math
// comes from roadgraph.js — this class just consumes a walker.

import * as THREE from 'three'
import { applyPS1 } from './ps1.js'
import { lambert, makeGlowTexture, makeGlowSprite } from './assets.js'
import { createWalker } from './roadgraph.js'
import { CONFIG } from './config.js'

// Local space: the truck faces +Z, origin at ground level under the middle.
export function buildTruckMesh() {
  const group = new THREE.Group()
  group.name = 'truck'
  const white = lambert({ color: '#c8ccd2' })
  const dark = lambert({ color: '#14161a' })
  const glass = lambert({ color: '#0e141d' })

  const add = (geoDef, material, x, y, z) => {
    const mesh = new THREE.Mesh(geoDef, material)
    mesh.position.set(x, y, z)
    group.add(mesh)
    return mesh
  }

  // Hood, cab, bed floor.
  add(new THREE.BoxGeometry(1.9, 0.7, 1.5), white, 0, 1.15, 2.0)
  add(new THREE.BoxGeometry(1.9, 1.3, 1.7), white, 0, 1.45, 0.75)
  add(new THREE.BoxGeometry(1.7, 0.55, 0.1), glass, 0, 1.7, 1.62) // windshield
  add(new THREE.BoxGeometry(1.9, 0.3, 2.7), white, 0, 0.85, -1.45)
  // Bed walls and tailgate.
  add(new THREE.BoxGeometry(0.12, 0.5, 2.7), white, 0.9, 1.25, -1.45)
  add(new THREE.BoxGeometry(0.12, 0.5, 2.7), white, -0.9, 1.25, -1.45)
  add(new THREE.BoxGeometry(1.9, 0.5, 0.12), white, 0, 1.25, -2.75)
  // Wheels: cylinders rolling on the x axis.
  const wheelGeo = new THREE.CylinderGeometry(0.42, 0.42, 0.3, 7)
  wheelGeo.rotateZ(Math.PI / 2)
  for (const [wx, wz] of [
    [0.85, 1.7],
    [-0.85, 1.7],
    [0.85, -1.7],
    [-0.85, -1.7],
  ]) {
    add(wheelGeo, dark, wx, 0.42, wz)
  }
  // Headlights: emissive stubs plus a warm glow.
  const lightMat = applyPS1(
    new THREE.MeshLambertMaterial({
      color: '#241a05',
      emissive: new THREE.Color('#fbe7a3'),
      emissiveIntensity: 0.9,
    })
  )
  add(new THREE.BoxGeometry(0.3, 0.18, 0.08), lightMat, 0.62, 1.05, 2.78)
  add(new THREE.BoxGeometry(0.3, 0.18, 0.08), lightMat, -0.62, 1.05, 2.78)
  const glow = makeGlowTexture('rgba(251, 231, 163, 0.55)')
  for (const gx of [0.62, -0.62]) {
    const sprite = makeGlowSprite(glow, 1.6)
    sprite.position.set(gx, 1.05, 2.85)
    group.add(sprite)
  }
  return group
}

export class Truck {
  constructor({ scene, heightAt }) {
    this.heightAt = heightAt
    this.group = buildTruckMesh()
    scene.add(this.group)
    this.walker = null
    this.speed = CONFIG.truck.speed
    this.x = 0
    this.z = 0
    this.dirX = 0
    this.dirZ = 1
    this.moving = false
  }

  parkAt(x, z, dirX = 0, dirZ = 1) {
    this.walker = null
    this.moving = false
    this.x = x
    this.z = z
    this.dirX = dirX
    this.dirZ = dirZ
    this.pose()
  }

  driveRoute(points, speed = CONFIG.truck.speed) {
    if (!points || points.length < 2) return
    this.walker = createWalker(points)
    this.speed = speed
    this.moving = true
  }

  // Advances the current route. Returns { x, z, moving, done } — done is true
  // on the frame the route finishes and stays true until the next route.
  update(dt) {
    if (this.walker && this.moving) {
      const s = this.walker.advance(this.speed * dt)
      this.x = s.x
      this.z = s.z
      this.dirX = s.dirX
      this.dirZ = s.dirZ
      if (s.done) this.moving = false
      this.pose()
    }
    return {
      x: this.x,
      z: this.z,
      moving: this.moving,
      done: !!this.walker && !this.moving,
    }
  }

  pose() {
    this.group.position.set(this.x, this.heightAt(this.x, this.z), this.z)
    this.group.rotation.y = Math.atan2(this.dirX, this.dirZ)
    this.group.updateMatrixWorld()
  }

  // Where the rider's eyes sit: middle of the bed, CONFIG.truck.bedEye up.
  bedSeat() {
    const seat = new THREE.Vector3(0, 0.85 + CONFIG.truck.bedEye, -1.45)
    this.group.localToWorld(seat)
    return { x: seat.x, y: seat.y, z: seat.z }
  }

  // A dismount spot just off the passenger side.
  hopOutSpot() {
    const spot = new THREE.Vector3(3, 0, -1.0)
    this.group.localToWorld(spot)
    return { x: spot.x, z: spot.z }
  }

  distanceTo(x, z) {
    return Math.hypot(this.x - x, this.z - z)
  }
}
