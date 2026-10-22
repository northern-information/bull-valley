// The firefly pond behind the spawn Citgo (fishing.ts, sharedworld.ts rule
// 35) as it stands in the valley: the fireflies over it and its shores,
// whose haven no shadow comes inside, the old tackle box on a picnic
// table on the landing nearest the Citgo, a lit oil lantern beside it to
// find it by from across the field, and the bobber that floats out from
// the landing while
// the raider has a line in the water. Three glue: the pond's place and
// every rule are fishing.ts's.

import * as THREE from 'three'
import { CONFIG } from './config.ts'
import { buildFireflies } from './fireflyrig.ts'
import {
  buildBobber,
  buildOilLantern,
  buildPicnicTable,
  buildTackleBox,
  PICNIC,
} from './fishmodels.ts'
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
// The table blocks this far either side of its length: past the benches.
const TABLE_RADIUS = PICNIC.seat.out + PICNIC.seat.depth / 2
// Where along the table's top the box and the lantern sit, from its middle.
const BOX_ALONG = 0.3
const LANTERN_ALONG = 0.55
// The water stands this far over the lowest of its shore (worldsurfaces.ts
// buildWater).
const WATER_OVER_SHORE = 0.25

export function placePond(pond: Pond, ground: Ground, walls: Walls): PondRig {
  const group = new THREE.Group()
  group.name = 'firefly-pond'
  const { landing } = pond
  const toward = Math.atan2(pond.x - landing.x, pond.z - landing.z)

  // The table across the way to the water, its benches toward and away
  // from it; the box on its top, its lid opening toward the water, and
  // the lantern along from it.
  const table = buildPicnicTable()
  table.position.set(landing.x, ground.at(landing.x, landing.z), landing.z)
  table.rotation.y = toward
  group.add(table)
  const box = buildTackleBox()
  box.position.set(-BOX_ALONG, PICNIC.top.y + PICNIC.board / 2, 0)
  table.add(box)
  const lantern = buildOilLantern()
  lantern.group.position.set(LANTERN_ALONG, PICNIC.top.y + PICNIC.board / 2, 0)
  table.add(lantern.group)
  // It blocks as a capsule down its length, benches and all.
  const along = { x: Math.cos(toward), z: -Math.sin(toward) }
  const half = PICNIC.length / 2
  walls.addWall(
    { x: landing.x - along.x * half, z: landing.z - along.z * half },
    { x: landing.x + along.x * half, z: landing.z + along.z * half },
    TABLE_RADIUS
  )

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
      lantern.update(t)
      if (!bobber.visible) return
      const bob = biting
        ? -BOB.plunge * (1 + Math.sin(t * Math.PI * 2 * BOB.plungeHz))
        : Math.sin(t * Math.PI * 2 * BOB.hz) * BOB.metres
      bobber.position.y = level + bob
    },
  }
}
