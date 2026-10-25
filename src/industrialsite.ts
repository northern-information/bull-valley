import * as THREE from 'three'
import { buildDumpster, DUMPSTER, FUEL_LAYOUT, lotMaterial } from './assets.ts'
import {
  buildingDeck,
  buildingOrigin,
  CAR,
  DRUMS,
  INDUSTRIAL,
  LOAD,
  PALLET_HEAP,
  PARK_SIGN,
  parkDisk,
  parkLoot,
  parkLurks,
  parkOrigin,
  parkToWorld,
  TRAILER,
  worksWalls,
} from './industrial.ts'
import { buildIndustrial } from './industrialmodel.ts'
import { buildPickup } from './pickups.ts'
import { toWorld } from './store.ts'
import { LOT_LIFT, makeRibbonAccumulator } from './worldsurfaces.ts'
import type { Ground } from './ground.ts'
import type { WorksProp } from './industrial.ts'
import type { HeightAt, Vec3, XZ } from './interfaces.ts'
import type { PickupKind } from './items.ts'
import type { LampSpot } from './roadside.ts'
import type { StoreOrigin } from './store.ts'
import type { Walls } from './walls.ts'

// The industrial park behind Bull Valley Plaza (industrial.ts), as
// buildWorld (world.ts) places it: its asphalt draped on the ground and
// registered, the stalls and the bay lines painted on it, each building
// level on its slab (its floor registered, its walls on `walls`), the
// trailers, cars, dumpsters, pallets and drums round them on the ground,
// and the sodium lamps along the drives handed back for the streetlights.

// The park as the game reads it: its frame, the lamps for the
// streetlights, the day's loot and the lurks, each in the world, the
// floppy disk for Gron's last quest (shown only to a raider on it,
// loop.ts), and the flicker inside.
export interface IndustrialSite {
  group: THREE.Group
  origin: StoreOrigin
  lamps: LampSpot[]
  loot: (XZ & { kind: PickupKind; count: number })[]
  lurks: XZ[]
  disk: { at: XZ; object: THREE.Object3D }
  update(t: number): void
}

const PAD_STRIP = 4

export function buildIndustrialSite(
  station: StoreOrigin,
  heightAt: HeightAt,
  ground: Ground,
  walls: Walls
): IndustrialSite {
  const group = new THREE.Group()
  group.name = 'industrial'
  const park = parkOrigin(station)
  const cos = Math.cos(park.yaw)
  const sin = Math.sin(park.yaw)
  const at = (x: number, z: number) => parkToWorld(park, { x, z })

  // The asphalt, in strips down the park, every piece registered.
  const lots = makeRibbonAccumulator(ground)
  const { pad } = INDUSTRIAL
  for (let z0 = pad.z0; z0 < pad.z1; z0 += PAD_STRIP) {
    const z1 = Math.min(pad.z1, z0 + PAD_STRIP)
    const mid = at(0, (z0 + z1) / 2)
    lots.addPatch({
      x: mid.x,
      z: mid.z,
      cos,
      sin,
      x0: pad.x0,
      x1: pad.x1,
      halfWidth: (z1 - z0) / 2,
      step: 3,
      heightAt,
      color: FUEL_LAYOUT.lotColor,
      lift: LOT_LIFT,
    })
  }
  const lotMesh = lots.build('industrial-lot', lotMaterial())
  lotMesh.receiveShadow = true
  group.add(lotMesh)

  // The paint just over the lot, and the oil under it. Nobody stands on
  // paint.
  const paint = makeRibbonAccumulator(null)
  for (const line of [...INDUSTRIAL.stains, ...INDUSTRIAL.paint]) {
    const a = at(line.a.x, line.a.z)
    const b = at(line.b.x, line.b.z)
    const len = Math.hypot(b.x - a.x, b.z - a.z)
    paint.addPatch({
      x: (a.x + b.x) / 2,
      z: (a.z + b.z) / 2,
      cos: (b.x - a.x) / len,
      sin: (b.z - a.z) / len,
      x0: -len / 2,
      x1: len / 2,
      halfWidth: line.width / 2,
      step: 2,
      heightAt,
      color: line.color,
      lift: LOT_LIFT + line.lift,
    })
  }
  group.add(paint.build('industrial-paint'))

  // Each building level on its slab, a curb over the lot at its front.
  const placed: Vec3[] = INDUSTRIAL.buildings.map((b, i) => {
    const flat = buildingOrigin(park, i, 0)
    const [fx, , fz] = toWorld(flat, [0, 0, b.d / 2 + 1])
    const deck = buildingDeck(flat, b, ground.at(fx, fz), heightAt)
    const origin = { ...flat, y: deck }
    ground.addFloor(
      origin.x,
      origin.z,
      cos,
      sin,
      -b.w / 2,
      b.w / 2,
      b.d / 2,
      deck
    )
    for (const wall of worksWalls(origin, b)) {
      walls.addWall(wall.a, wall.b, wall.half, undefined, wall.low)
    }
    const p = INDUSTRIAL.places[i]
    return [p.x, deck, p.z]
  })

  // What stands round them, each on the ground under it. A prop's length
  // lies along (sin yaw, cos yaw) in the park's frame.
  const props: { prop: WorksProp; at: Vec3 }[] = []
  const along = (prop: WorksProp, d: number) =>
    at(prop.x + Math.sin(prop.yaw) * d, prop.z + Math.cos(prop.yaw) * d)
  for (const prop of INDUSTRIAL.props) {
    const p = at(prop.x, prop.z)
    const y = ground.at(p.x, p.z)
    if (prop.kind === 'dumpster') {
      // The plaza's own, its length down the wall it stands by.
      const dumpster = buildDumpster(prop.fallen)
      dumpster.position.set(p.x, y, p.z)
      dumpster.rotation.y = -park.yaw + prop.yaw + Math.PI / 2
      group.add(dumpster)
      const reach = DUMPSTER.length / 2 - DUMPSTER.width / 2
      walls.addWall(along(prop, -reach), along(prop, reach), DUMPSTER.width / 2)
      continue
    }
    props.push({ prop, at: [prop.x, y, prop.z] })
    if (
      prop.kind === 'trailer' ||
      prop.kind === 'car' ||
      prop.kind === 'sign'
    ) {
      const size =
        prop.kind === 'trailer'
          ? TRAILER
          : prop.kind === 'car'
            ? CAR
            : PARK_SIGN
      const reach = size.length / 2 - size.width / 2
      walls.addWall(along(prop, -reach), along(prop, reach), size.width / 2)
    } else {
      const radius =
        prop.kind === 'drums'
          ? DRUMS.radius
          : prop.kind === 'load'
            ? LOAD.width / 2 + 0.1
            : PALLET_HEAP.width / 2
      walls.addWall(p, p, radius)
    }
  }
  const works = buildIndustrial({ buildings: placed, props })
  works.group.position.set(park.x, 0, park.z)
  works.group.rotation.y = -park.yaw
  group.add(works.group)

  // The lamps along the drives, each arm (its +X, which rotation.y turns
  // to (cos, -sin)) out over the drive.
  const lamps: LampSpot[] = INDUSTRIAL.lamps.map((lamp) => {
    const p = at(lamp.x, lamp.z)
    const t = at(lamp.toward.x, lamp.toward.z)
    return { x: p.x, z: p.z, yaw: Math.atan2(-(t.z - p.z), t.x - p.x) }
  })

  // The floppy disk on the burned-out office's floor, hidden until a
  // raider on Gron's last quest comes for it.
  const diskAt = parkDisk(park)
  const disk = buildPickup('floppy-disk')
  disk.position.set(diskAt.x, ground.at(diskAt.x, diskAt.z), diskAt.z)
  disk.visible = false
  group.add(disk)

  return {
    group,
    origin: park,
    lamps,
    loot: parkLoot(park),
    lurks: parkLurks(park),
    disk: { at: diskAt, object: disk },
    update: (t) => works.update(t),
  }
}
