import * as THREE from 'three'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'
import { lambert } from './assetkit.ts'

// The radio dishes behind the spawn Citgo (CONFIG.dishes places them): one
// instanced array slewing together on the valley's clock.

// --- The dish array ------------------------------------------------------

// The big dishes in rows behind the spawn Citgo: radio telescopes, each a
// white parabolic reflector on a yoke over a tapered pedestal on a concrete
// pad, a feed horn on three struts at its focus and a red lamp on the
// horn. The whole array slews together, slowly, after something none of
// them will name. One instanced mesh per pivot and material, so the
// array costs a handful of draw calls however many dishes stand in it.
// Each dish's origin is at ground level under its pedestal; +Y up.
export const DISH = {
  // The concrete pad, square, and how far it sinks so a slope never shows
  // daylight under it.
  pad: 3.6,
  padSink: 0.9,
  padRise: 0.3,
  // The azimuth pivot, at the pedestal's top, and the elevation axle over
  // it in the yoke.
  pivot: 5.6,
  axle: 0.9,
  // The reflector: its rim radius, its depth, and how far its vertex sits
  // in front of the axle. The focus is radius² / (4 depth) off the vertex.
  radius: 4.5,
  depth: 1.4,
  vertex: 0.6,
  // Where it looks: the elevation swings around `elevation` by `nod`, the
  // azimuth around the array's own heading by `sweep`, one cycle in
  // `period` seconds (elevation at a third the rate again).
  elevation: (55 * Math.PI) / 180,
  nod: (15 * Math.PI) / 180,
  sweep: (70 * Math.PI) / 180,
  period: 240,
}

export interface DishSpot {
  x: number
  // The ground under the pedestal.
  y: number
  z: number
  // The array's heading: azimuth 0 looks along the spot's local +Z.
  yaw: number
}

export interface DishArray {
  group: THREE.Group
  // The middle of the array, and how far its farthest dish stands from it.
  middle: { x: number; z: number }
  reach: number
  update(t: number): void
}

// Where every dish looks at `t` seconds: azimuth from the array's heading,
// and elevation over the horizon.
function dishAim(t: number): { azimuth: number; elevation: number } {
  const turn = (t / DISH.period) * Math.PI * 2
  return {
    azimuth: Math.sin(turn) * DISH.sweep,
    elevation: DISH.elevation + Math.sin(turn * 3 + 1) * DISH.nod,
  }
}

// A cylinder from a to b, as geometry in the frame both points are in.
function rod(
  a: THREE.Vector3,
  b: THREE.Vector3,
  radius: number
): THREE.BufferGeometry {
  const length = a.distanceTo(b)
  const geometry = new THREE.CylinderGeometry(radius, radius, length, 5)
  const up = new THREE.Vector3(0, 1, 0)
  const along = b.clone().sub(a).normalize()
  geometry.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(up, along))
  const mid = a.clone().add(b).multiplyScalar(0.5)
  geometry.translate(mid.x, mid.y, mid.z)
  return geometry
}

// The parts of one dish, merged per pivot and material: `base` stands
// still on the ground, `turret` turns in azimuth about the pivot, `dish`
// tips in elevation about the axle (in the turret's frame, the axle along
// X and the reflector opening up +Y when it looks straight up).
function dishParts(): {
  base: { geometry: THREE.BufferGeometry; material: THREE.Material }[]
  turret: { geometry: THREE.BufferGeometry; material: THREE.Material }[]
  dish: { geometry: THREE.BufferGeometry; material: THREE.Material }[]
} {
  const { pad, padSink, padRise, pivot, axle, radius, depth, vertex } = DISH
  const white = lambert({
    color: '#dcd9cf',
    emissive: new THREE.Color('#2a2925'),
    emissiveIntensity: 0.6,
  })
  const face = lambert({
    color: '#e6e3da',
    emissive: new THREE.Color('#2a2925'),
    emissiveIntensity: 0.6,
    side: THREE.DoubleSide,
  })
  const steel = lambert({ color: '#7b8087' })
  const concrete = lambert({ color: '#7f7c74' })
  const lamp = new THREE.MeshBasicMaterial({ color: '#ff2a1a' })
  const at = (g: THREE.BufferGeometry, x: number, y: number, z: number) =>
    g.translate(x, y, z)
  const merged = (parts: THREE.BufferGeometry[]) =>
    mergeGeometries(parts.map((g) => g.toNonIndexed()))

  // The pad, its top padRise over the ground, and the pedestal tapering
  // up to the pivot with a collar under it.
  const padHeight = padRise + padSink
  const base = [
    {
      geometry: at(
        new THREE.BoxGeometry(pad, padHeight, pad),
        0,
        padRise - padHeight / 2,
        0
      ),
      material: concrete,
    },
    {
      geometry: merged([
        at(
          new THREE.CylinderGeometry(0.5, 0.8, pivot - padRise - 0.3, 8),
          0,
          padRise + (pivot - padRise - 0.3) / 2,
          0
        ),
        at(new THREE.CylinderGeometry(0.75, 0.75, 0.3, 8), 0, pivot - 0.15, 0),
      ]),
      material: white,
    },
  ]

  // The turret: a housing on the pivot and the yoke's two arms up to the
  // axle.
  const turret = [
    {
      geometry: merged([
        at(new THREE.BoxGeometry(1.6, 0.7, 1.6), 0, 0.35, 0),
        at(
          new THREE.BoxGeometry(0.3, axle + 0.4, 0.7),
          -1.05,
          axle / 2 + 0.3,
          0
        ),
        at(
          new THREE.BoxGeometry(0.3, axle + 0.4, 0.7),
          1.05,
          axle / 2 + 0.3,
          0
        ),
      ]),
      material: white,
    },
  ]

  // The reflector: a paraboloid turned on the lathe, rim out at `radius`.
  const profile: THREE.Vector2[] = []
  const rings = 7
  for (let i = 0; i <= rings; i++) {
    const r = (radius * i) / rings
    profile.push(new THREE.Vector2(r, vertex + depth * (r / radius) ** 2))
  }
  const focus = vertex + (radius * radius) / (4 * depth)
  const feed = new THREE.Vector3(0, focus - 0.4, 0)
  const struts: THREE.BufferGeometry[] = []
  for (let k = 0; k < 3; k++) {
    const angle = (k / 3) * Math.PI * 2 + Math.PI / 2
    const r = radius * 0.8
    const foot = new THREE.Vector3(
      Math.cos(angle) * r,
      vertex + depth * 0.64,
      Math.sin(angle) * r
    )
    struts.push(rod(foot, feed, 0.06))
  }
  const dish = [
    { geometry: new THREE.LatheGeometry(profile, 20), material: face },
    {
      geometry: merged([
        // The axle through the yoke, and the frame on the reflector's back.
        new THREE.CylinderGeometry(0.16, 0.16, 2.4, 6).rotateZ(Math.PI / 2),
        at(new THREE.BoxGeometry(1.6, vertex, 1.6), 0, vertex / 2, 0),
        ...struts,
        // The feed horn, hanging at the focus.
        at(new THREE.CylinderGeometry(0.22, 0.32, 0.9, 6), 0, focus - 0.1, 0),
      ]),
      material: steel,
    },
    {
      geometry: at(new THREE.BoxGeometry(0.16, 0.16, 0.16), 0, focus + 0.43, 0),
      material: lamp,
    },
  ]
  return { base, turret, dish }
}

export function buildDishArray(spots: readonly DishSpot[]): DishArray {
  const group = new THREE.Group()
  group.name = 'dish-array'
  const parts = dishParts()
  const count = spots.length
  const level = (
    list: { geometry: THREE.BufferGeometry; material: THREE.Material }[],
    name: string
  ) =>
    list.map(({ geometry, material }, i) => {
      const mesh = new THREE.InstancedMesh(geometry, material, count)
      mesh.name = `${name}-${i}`
      mesh.castShadow = material instanceof THREE.MeshLambertMaterial
      mesh.receiveShadow = true
      // The instances move every frame; the bounds computed once would
      // cull a dish that has turned past them.
      mesh.frustumCulled = false
      group.add(mesh)
      return mesh
    })
  const base = level(parts.base, 'dish-base')
  const turrets = level(parts.turret, 'dish-turret')
  const dishes = level(parts.dish, 'dish-reflector')

  const roots = spots.map(({ x, y, z, yaw }) =>
    new THREE.Matrix4().compose(
      new THREE.Vector3(x, y, z),
      new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), yaw),
      new THREE.Vector3(1, 1, 1)
    )
  )
  roots.forEach((root, i) => {
    for (const mesh of base) mesh.setMatrixAt(i, root)
  })

  const turn = new THREE.Matrix4()
  const tip = new THREE.Matrix4()
  const turret = new THREE.Matrix4()
  const reflector = new THREE.Matrix4()
  const update = (t: number) => {
    const { azimuth, elevation } = dishAim(t)
    // Azimuth turns about the pivot; elevation tips the opening (+Y) down
    // toward the turret's +Z.
    turn.makeRotationY(azimuth).setPosition(0, DISH.pivot, 0)
    tip.makeRotationX(Math.PI / 2 - elevation).setPosition(0, DISH.axle, 0)
    roots.forEach((root, i) => {
      turret.multiplyMatrices(root, turn)
      reflector.multiplyMatrices(turret, tip)
      for (const mesh of turrets) mesh.setMatrixAt(i, turret)
      for (const mesh of dishes) mesh.setMatrixAt(i, reflector)
    })
    for (const mesh of [...turrets, ...dishes]) {
      mesh.instanceMatrix.needsUpdate = true
    }
  }
  update(0)
  const middle = {
    x: spots.reduce((sum, d) => sum + d.x, 0) / Math.max(1, count),
    z: spots.reduce((sum, d) => sum + d.z, 0) / Math.max(1, count),
  }
  const reach = Math.max(
    ...spots.map((d) => Math.hypot(d.x - middle.x, d.z - middle.z)),
    0
  )
  return { group, middle, reach, update }
}
