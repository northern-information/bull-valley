// The firefly pond behind the spawn Citgo (fishing.ts, sharedworld.ts rule
// 35) as it stands in the valley: the fireflies over it and its shores,
// whose haven no shadow comes inside, the old tackle box on a picnic
// table on the landing nearest the Citgo, a lit oil lantern beside it to
// find it by from across the field, two rods leaning on its end, a
// campfire back from it to cook the catch on (rule 40), and the
// bobber that floats out from the landing while the raider has a line in
// the water. Three glue: the pond's place and
// every rule are fishing.ts's.

import * as THREE from 'three'
import { buildCampfire } from './campfiremodel.ts'
import { hoistPose } from './catchfanfare.ts'
import { CONFIG } from './config.ts'
import { campfireOf } from './cooking.ts'
import { buildFireflies } from './fireflyrig.ts'
import {
  buildBobber,
  buildFishLevel,
  buildLeaningRod,
  buildOilLantern,
  buildPicnicTable,
  buildStringer,
  buildTackleBox,
  PICNIC,
} from './fishmodels.ts'
import { LEAP, leapAt, leapPose } from './leaps.ts'
import type { Pond } from './fishing.ts'
import type { Ground } from './ground.ts'
import type { XZ } from './interfaces.ts'
import type { Walls } from './walls.ts'

export interface PondRig {
  group: THREE.Group
  place: Pond
  // Where the tackle box stands, for E.
  landing: XZ
  // The campfire back from the landing (cooking.ts campfireOf): where it
  // burns, for E, and the fire itself, for the glow.
  campfire: { at: XZ; group: THREE.Group }
  // The bobber out on the water (`out`), bobbing; `bite` pulls it under.
  setLine(out: boolean, bite: boolean): void
  // The fish last landed (`kind`, null for none), `since` seconds after
  // the reel in, up out of the water at the bobber and hanging on the
  // line in front of the raider's `view`, wherever they look, as off the
  // rod in their hand (catchfanfare.ts hoistPose).
  setHoist(kind: string | null, since: number, view: THREE.Camera): void
  // `t` game seconds, for what moves on its own; `valley` the valley's
  // clock in seconds, for the fish that leap, the same for everyone.
  update(t: number, valley: number): void
}

// How far out from the landing the bobber lands, and how it bobs.
const CAST_OUT = 9
const BOB = { metres: 0.015, hz: 0.7, plunge: 0.05, plungeHz: 6 }
// The fish landed hangs this far out ahead of the raider's eye and this far below it, on a line up to where the rod's tip would
// be, and arcs this high over the straight way up to it.
const HOIST = { out: 1.7, below: 0.3, tip: { out: 1.3, over: 0.75 }, arc: 0.6 }
// The table blocks this far either side of its length: past the benches.
const TABLE_RADIUS = PICNIC.seat.out + PICNIC.seat.depth / 2
// Where along the table's top the box and the lantern sit, from its middle.
const BOX_ALONG = 0.3
const LANTERN_ALONG = 0.55
// The two rods leaning on the table's end past the lantern: each butt this
// far out from the end, this far either side of the table's middle, and
// turned this far off square, so they stand a little apart.
const LEANING = [
  { kind: 'zebco-33', out: 0.42, on: -0.2, yaw: 0.06 },
  { kind: 'ugly-stik', out: 0.5, on: 0.22, yaw: -0.08 },
]
// The stringer's post: off the table's end past the box, toward the water.
const STRINGER_AT = { along: -(PICNIC.length / 2 + 0.6), on: 0.4 }
const POST_RADIUS = 0.12
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

  // A stringer of the catch on a post off the table's end.
  const stringer = buildStringer()
  stringer.position.set(STRINGER_AT.along, 0, STRINGER_AT.on)
  table.add(stringer)
  const post = {
    x:
      landing.x +
      along.x * STRINGER_AT.along +
      Math.sin(toward) * STRINGER_AT.on,
    z:
      landing.z +
      along.z * STRINGER_AT.along +
      Math.cos(toward) * STRINGER_AT.on,
  }
  stringer.position.y = ground.at(post.x, post.z) - table.position.y
  walls.addWall(post, post, POST_RADIUS)

  // Two rods set down against the table's end, butts in the grass inside
  // the table's capsule, each resting on the edge of its top.
  const edge = PICNIC.top.y + PICNIC.board / 2
  for (const { kind, out, on, yaw } of LEANING) {
    const rod = buildLeaningRod(kind, Math.atan2(edge, out))
    const butt = half + out
    const x = landing.x + along.x * butt + Math.sin(toward) * on
    const z = landing.z + along.z * butt + Math.cos(toward) * on
    rod.position.set(butt, ground.at(x, z) - table.position.y, on)
    // Leaning back toward the table: its local +X turned to the table's -X.
    rod.rotation.y = Math.PI + yaw
    table.add(rod)
  }

  // The campfire, back from the landing and off to its side, to cook the
  // catch on (cooking.ts, sharedworld.ts rule 40).
  const fireAt = campfireOf(pond)
  const campfire = buildCampfire()
  campfire.group.position.set(fireAt.x, ground.at(fireAt.x, fireAt.z), fireAt.z)
  group.add(campfire.group)
  walls.addWall(fireAt, fireAt, CONFIG.fishing.campfire.radius)

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

  // The fish that leap (leaps.ts), each kind built once and shown while
  // its leap is under way.
  const seed = (Math.round(pond.x) * 73856093) ^ (Math.round(pond.z) * 19349663)
  const leapers = new Map(
    LEAP.kinds.map((kind) => {
      const fish = buildFishLevel(kind)
      fish.visible = false
      group.add(fish)
      return [kind, fish] as const
    })
  )

  // The fish landed, each kind built as it is first caught here, and the
  // line it hangs on.
  const hoisted = new Map<string, THREE.Group>()
  const hoistPoints = new Float32Array(2 * 3)
  const hoistGeometry = new THREE.BufferGeometry()
  hoistGeometry.setAttribute(
    'position',
    new THREE.BufferAttribute(hoistPoints, 3)
  )
  const hoistLine = new THREE.Line(
    hoistGeometry,
    new THREE.LineBasicMaterial({ color: '#c8d6c0' })
  )
  hoistLine.frustumCulled = false
  hoistLine.visible = false
  group.add(hoistLine)
  const hangAt = new THREE.Vector3()
  const tipAt = new THREE.Vector3()
  const eyeAt = new THREE.Vector3()
  const ahead = new THREE.Vector3()

  return {
    group,
    place: pond,
    landing,
    campfire: { at: fireAt, group: campfire.group },
    setHoist(kind, since, view) {
      for (const fish of hoisted.values()) fish.visible = false
      hoistLine.visible = false
      const pose = kind ? hoistPose(since) : null
      if (!kind || !pose) return
      let fish = hoisted.get(kind)
      if (!fish) {
        fish = buildFishLevel(kind)
        hoisted.set(kind, fish)
        group.add(fish)
      }
      // From the bobber up to hang before the raider, the way they look.
      const eye = view.getWorldPosition(eyeAt)
      view.getWorldDirection(ahead)
      const d = Math.hypot(ahead.x, ahead.z) || 1
      const ux = ahead.x / d
      const uz = ahead.z / d
      hangAt.set(
        eye.x + ux * HOIST.out,
        eye.y - HOIST.below,
        eye.z + uz * HOIST.out
      )
      fish.visible = true
      fish.position.set(bobber.position.x, level, bobber.position.z)
      fish.position.lerp(hangAt, pose.rise)
      fish.position.y += Math.sin(pose.rise * Math.PI) * HOIST.arc
      // Hanging nose up off the hook, thrashing, turning on the line.
      fish.rotation.set(
        pose.thrash,
        Math.atan2(-uz, ux) + pose.turn,
        Math.PI / 2,
        'YXZ'
      )
      fish.scale.setScalar(pose.scale)
      tipAt.set(
        eye.x + ux * HOIST.tip.out,
        eye.y + HOIST.tip.over,
        eye.z + uz * HOIST.tip.out
      )
      const p = fish.position
      hoistPoints.set([tipAt.x, tipAt.y, tipAt.z, p.x, p.y, p.z])
      hoistGeometry.attributes.position.needsUpdate = true
      hoistLine.visible = pose.scale > 0.5
    },
    setLine(isOut, bite) {
      bobber.visible = isOut
      biting = bite
    },
    update(t, valley) {
      fireflies.update(t)
      lantern.update(t)
      campfire.update(t)
      const leap = leapAt(valley, seed, pond.shore.length)
      for (const [kind, fish] of leapers) {
        fish.visible = leap?.kind === kind
        if (!leap || !fish.visible) continue
        const shore = pond.shore[leap.toward]
        const { height, pitch } = leapPose(leap.t)
        fish.position.set(
          pond.x + (shore.x - pond.x) * leap.out,
          level + height,
          pond.z + (shore.z - pond.z) * leap.out
        )
        fish.rotation.set(0, leap.heading, pitch, 'YXZ')
      }
      if (!bobber.visible) return
      const bob = biting
        ? -BOB.plunge * (1 + Math.sin(t * Math.PI * 2 * BOB.plungeHz))
        : Math.sin(t * Math.PI * 2 * BOB.hz) * BOB.metres
      bobber.position.y = level + bob
    },
  }
}
