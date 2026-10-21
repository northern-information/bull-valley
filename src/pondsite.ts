// The firefly pond behind the spawn Citgo (fishing.ts, sharedworld.ts rule
// 35) as it stands in the valley: the fireflies over it and its shores,
// whose haven no shadow comes inside, the old tackle box on the landing
// nearest the Citgo, and the bobber that floats out from the landing while
// the raider has a line in the water. Three glue: the pond's place and
// every rule are fishing.ts's.

import * as THREE from 'three'
import { CONFIG } from './config.ts'
import { buildFireflies } from './fireflyrig.ts'
import { buildBobber, buildTackleBox } from './fishmodels.ts'
import type { Pond } from './fishing.ts'
import type { Ground } from './ground.ts'
import type { XZ } from './interfaces.ts'
import type { Walls } from './walls.ts'

export interface PondRig {
  group: THREE.Group
  place: Pond
  // Where the tackle box stands, for E.
  landing: XZ
  // The bobber out on the water (`out`), bobbing; `bite` pulls it under.
  setLine(out: boolean, bite: boolean): void
  update(t: number): void
}

// How far out from the landing the bobber lands, and how it bobs.
const CAST_OUT = 9
const BOB = { metres: 0.015, hz: 0.7, plunge: 0.05, plungeHz: 6 }
// The tackle box blocks like a post this wide.
const BOX_RADIUS = 0.35
// The water stands this far over the lowest of its shore (worldsurfaces.ts
// buildWater).
const WATER_OVER_SHORE = 0.25

export function placePond(pond: Pond, ground: Ground, walls: Walls): PondRig {
  const group = new THREE.Group()
  group.name = 'firefly-pond'
  const { landing } = pond
  const toward = Math.atan2(pond.x - landing.x, pond.z - landing.z)

  const box = buildTackleBox()
  box.position.set(landing.x, ground.at(landing.x, landing.z), landing.z)
  // Its lid opens toward the water.
  box.rotation.y = toward
  group.add(box)
  walls.addWall(landing, landing, BOX_RADIUS)

  const fireflies = buildFireflies(
    { x: pond.x, z: pond.z },
    pond.radius - CONFIG.fishing.pond.margin / 2,
    ground.at
  )
  group.add(fireflies.group)

  const level =
    Math.min(...pond.shore.map((p) => ground.at(p.x, p.z))) + WATER_OVER_SHORE
  const reach = Math.hypot(pond.x - landing.x, pond.z - landing.z)
  const out = Math.min(CAST_OUT, reach * 0.5)
  const bobber = buildBobber()
  bobber.position.set(
    landing.x + Math.sin(toward) * out,
    level,
    landing.z + Math.cos(toward) * out
  )
  bobber.visible = false
  group.add(bobber)
  let biting = false

  return {
    group,
    place: pond,
    landing,
    setLine(isOut, bite) {
      bobber.visible = isOut
      biting = bite
    },
    update(t) {
      fireflies.update(t)
      if (!bobber.visible) return
      const bob = biting
        ? -BOB.plunge * (1 + Math.sin(t * Math.PI * 2 * BOB.plungeHz))
        : Math.sin(t * Math.PI * 2 * BOB.hz) * BOB.metres
      bobber.position.y = level + bob
    },
  }
}
