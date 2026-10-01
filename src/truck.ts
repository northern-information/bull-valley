// Matthew Marx's white Chevy: a low-poly pickup that parks, drives road
// routes, and carries the player in its bed. The mesh is Lambert boxes through
// the PS1 snap, with Matthew Marx at the wheel (the shared body, figure.js),
// visible through the cab glass. All route math comes from roadgraph.js —
// this class just consumes a walker.

import * as THREE from 'three'
import { lambert, makeGlowSprite, makeGlowTexture } from './assets.js'
import { CONFIG } from './config.js'
import { applyPose, attachCigarette, buildFigure } from './figure.js'
import { samplePose } from './poses.js'
import { applyPS1 } from './ps1.js'
import { createWalker } from './roadgraph.js'

// Local space: the truck faces +Z, origin at ground level under the middle.
export function buildTruckMesh() {
  const group = new THREE.Group()
  group.name = 'truck'
  const white = lambert({ color: '#c8ccd2' })
  const dark = lambert({ color: '#14161a' })
  const glass = lambert({ color: '#0e141d', transparent: true, opacity: 0.45 })

  const add = (geoDef, material, x, y, z) => {
    const mesh = new THREE.Mesh(geoDef, material)
    mesh.position.set(x, y, z)
    group.add(mesh)
    return mesh
  }

  // Hood, lower cab, bed floor.
  add(new THREE.BoxGeometry(1.9, 0.7, 1.5), white, 0, 1.15, 2.0)
  add(new THREE.BoxGeometry(1.9, 0.65, 1.7), white, 0, 1.125, 0.75)
  // Cab greenhouse: roof on four pillars, glass all round.
  add(new THREE.BoxGeometry(1.9, 0.1, 1.7), white, 0, 2.05, 0.75)
  for (const [px, pz] of [
    [0.9, -0.05],
    [-0.9, -0.05],
    [0.9, 1.55],
    [-0.9, 1.55],
  ]) {
    add(new THREE.BoxGeometry(0.1, 0.55, 0.1), white, px, 1.725, pz)
  }
  add(new THREE.BoxGeometry(1.7, 0.55, 0.04), glass, 0, 1.725, 1.58) // windshield
  add(new THREE.BoxGeometry(1.7, 0.55, 0.04), glass, 0, 1.725, -0.08) // rear
  add(new THREE.BoxGeometry(0.04, 0.55, 1.5), glass, 0.92, 1.725, 0.75)
  add(new THREE.BoxGeometry(0.04, 0.55, 1.5), glass, -0.92, 1.725, 0.75)
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

  // Matthew Marx in the driver seat (left side, +X), hands on the wheel.
  const steeringGeo = new THREE.CylinderGeometry(0.18, 0.18, 0.04, 8)
  const wheel = add(steeringGeo, dark, 0.45, 1.46, 1.06)
  wheel.rotation.x = Math.PI / 2 - 0.35
  const driver = buildFigure('marx')
  driver.group.scale.setScalar(DRIVER_SCALE)
  group.add(driver.group)
  group.userData.driver = driver
  group.userData.cigarette = attachCigarette(driver)
  placeDriver(driver, 'cab')
  return group
}

// The low-poly cab is short for a full-size body, so Matthew Marx is a
// little under scale everywhere: in the cab his head clears the roof and
// his boots stay inside.
const DRIVER_SCALE = 0.85

// Where Matthew Marx is: 'cab' at the wheel with his hips at 1.18 m, or
// 'tailgate', leaning by the open tailgate and facing the customers behind
// the truck.
function placeDriver(driver, post) {
  if (post === 'tailgate') {
    applyPose(driver, samplePose('lean'))
    driver.group.position.set(0.8, 0, -3.2)
    driver.group.rotation.y = Math.PI - 0.5
  } else {
    applyPose(driver, samplePose('sit'))
    driver.group.position.set(0.45, 1.18 - driver.hipY * DRIVER_SCALE, 0.55)
    driver.group.rotation.y = 0
  }
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
    this.driver = this.group.userData.driver
    this.cigarette = this.group.userData.cigarette
    this.time = 0
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

  // Matthew Marx works the tailgate shop while the truck is parked for the
  // loadout; any drive puts him back at the wheel.
  setDriverPost(post) {
    placeDriver(this.driver, post)
  }

  driveRoute(points, speed = CONFIG.truck.speed) {
    if (!points || points.length < 2) return
    placeDriver(this.driver, 'cab')
    this.walker = createWalker(points)
    this.speed = speed
    this.moving = true
  }

  // Advances the current route. Returns { x, z, moving, done } — done is true
  // on the frame the route finishes and stays true until the next route.
  update(dt) {
    // Matthew Marx glances about now and then, and smokes.
    this.time += dt
    this.cigarette.update(this.time)
    this.driver.joints.neck.rotation.y =
      Math.sin(this.time * 0.35) * Math.max(0, Math.sin(this.time * 0.11)) * 0.6
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
