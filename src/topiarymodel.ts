import * as THREE from 'three'
import { lambert, mergeStatic } from './assetkit.ts'
import { buildFlames } from './fire.ts'
import { mulberry32, range } from './rng.ts'
import type { DeathPose, TopiaryKind } from './topiaries.ts'

// The topiaries as seen (topiaries.ts): the Overlook's hedge animals,
// clipped privet in lumps of two greens, after the novel's lions, dog,
// rabbit and buffalo. Each is built nose to +X, standing on its own
// origin, and scaled so it runs `length` metres nose to tail: broadside, it
// fills a corridor of the maze wall to wall. Its legs (and the rabbit's
// feet) each hang from their own hip, so a burning one can roll onto its
// back and kick (topiaries.ts deathPose, topiaryrig.ts).

// One clipped lump: an ellipsoid at (x, y, z) with radii (rx, ry, rz),
// tipped `tilt` radians about Z (nose up), in the dark green when `dark`;
// a `limb` swings from its own top.
interface Lump {
  x: number
  y: number
  z: number
  rx: number
  ry: number
  rz: number
  tilt?: number
  dark?: boolean
  limb?: boolean
}

// A pair of lumps, either side of the spine.
function pair(lump: Lump): Lump[] {
  return [lump, { ...lump, z: -lump.z }]
}

// Four legs under a body: the front pair at `front`, the back at `back`,
// `spread` either side, `top` high, each `r` thick.
function legs(
  front: number,
  back: number,
  spread: number,
  top: number,
  r: number
): Lump[] {
  const leg = (x: number) =>
    pair({
      x,
      y: top / 2,
      z: spread,
      rx: r,
      ry: top / 2 + 0.05,
      rz: r,
      dark: true,
      limb: true,
    })
  return [...leg(front), ...leg(back)]
}

const SHAPES: Record<TopiaryKind, Lump[]> = {
  // Standing, its mane a great ball round the head, the tail curled up
  // behind with its tuft.
  lion: [
    { x: -0.1, y: 1.3, z: 0, rx: 1.15, ry: 0.55, rz: 0.55 },
    { x: 0.65, y: 1.45, z: 0, rx: 0.6, ry: 0.68, rz: 0.62 },
    { x: -0.85, y: 1.3, z: 0, rx: 0.5, ry: 0.6, rz: 0.56 },
    { x: 1.15, y: 1.95, z: 0, rx: 0.62, ry: 0.75, rz: 0.75, dark: true },
    { x: 1.6, y: 1.85, z: 0, rx: 0.36, ry: 0.32, rz: 0.34 },
    ...pair({ x: 1.25, y: 2.65, z: 0.35, rx: 0.14, ry: 0.14, rz: 0.1 }),
    ...legs(0.85, -0.85, 0.3, 1, 0.2),
    { x: -1.4, y: 1.55, z: 0, rx: 0.42, ry: 0.1, rz: 0.1, tilt: -0.9 },
    { x: -1.7, y: 1.95, z: 0, rx: 0.2, ry: 0.2, rz: 0.2, dark: true },
  ],
  // Its head up and ears pricked, the tail up behind.
  dog: [
    { x: -0.1, y: 1.15, z: 0, rx: 1.05, ry: 0.45, rz: 0.45 },
    { x: 0.6, y: 1.25, z: 0, rx: 0.48, ry: 0.55, rz: 0.48 },
    { x: 0.95, y: 1.85, z: 0, rx: 0.28, ry: 0.35, rz: 0.3, tilt: -0.5 },
    { x: 1.3, y: 2.15, z: 0, rx: 0.42, ry: 0.34, rz: 0.34 },
    { x: 1.75, y: 2.05, z: 0, rx: 0.3, ry: 0.18, rz: 0.2, dark: true },
    ...pair({
      x: 1.15,
      y: 2.55,
      z: 0.2,
      rx: 0.1,
      ry: 0.24,
      rz: 0.08,
      dark: true,
    }),
    ...legs(0.75, -0.8, 0.26, 0.9, 0.17),
    { x: -1.3, y: 1.6, z: 0, rx: 0.45, ry: 0.12, rz: 0.12, tilt: -1.1 },
  ],
  // Crouched, its hind feet long under it, the ears straight up.
  rabbit: [
    { x: -0.3, y: 1.1, z: 0, rx: 1.0, ry: 0.95, rz: 0.75 },
    { x: 0.6, y: 1.25, z: 0, rx: 0.55, ry: 0.7, rz: 0.6 },
    { x: 1.05, y: 2.05, z: 0, rx: 0.5, ry: 0.45, rz: 0.45 },
    { x: 1.5, y: 1.95, z: 0, rx: 0.28, ry: 0.24, rz: 0.26, dark: true },
    ...pair({
      x: 0.9,
      y: 2.9,
      z: 0.18,
      rx: 0.15,
      ry: 0.6,
      rz: 0.08,
      tilt: 0.15,
    }),
    ...pair({
      x: 0.75,
      y: 0.2,
      z: 0.35,
      rx: 0.4,
      ry: 0.2,
      rz: 0.18,
      dark: true,
      limb: true,
    }),
    ...pair({
      x: -0.6,
      y: 0.22,
      z: 0.5,
      rx: 0.75,
      ry: 0.22,
      rz: 0.24,
      dark: true,
      limb: true,
    }),
    { x: -1.4, y: 1.15, z: 0, rx: 0.32, ry: 0.32, rz: 0.32 },
  ],
  // The hump over the shoulders, the head hung low between short horns.
  buffalo: [
    { x: -0.3, y: 1.35, z: 0, rx: 1.15, ry: 0.65, rz: 0.65 },
    { x: 0.5, y: 1.85, z: 0, rx: 0.75, ry: 0.85, rz: 0.75, dark: true },
    { x: 1.3, y: 1.25, z: 0, rx: 0.45, ry: 0.5, rz: 0.45 },
    { x: 1.65, y: 0.95, z: 0, rx: 0.3, ry: 0.3, rz: 0.32 },
    ...pair({
      x: 1.35,
      y: 1.75,
      z: 0.45,
      rx: 0.1,
      ry: 0.28,
      rz: 0.1,
      tilt: 0.4,
    }),
    ...legs(0.8, -1.0, 0.36, 0.95, 0.22),
    { x: -1.5, y: 1.2, z: 0, rx: 0.3, ry: 0.1, rz: 0.1, tilt: 1.2 },
  ],
}

const HEDGE = '#3a5c2c'
const HEDGE_DARK = '#27421f'

// One topiary as a rig: the group to place and turn; `roll`, its pivot
// along the spine at the body's middle height, which turns it over onto its
// back; `hedge`, the clipped body (scaled to `length`), whose y scale sinks
// it; and its `limbs`, each a pivot at the top of a leg.
export interface TopiaryParts {
  group: THREE.Group
  roll: THREE.Group
  hedge: THREE.Group
  limbs: THREE.Group[]
  // The roll's height as built, its two greens, and the fire on it once it
  // has burned (poseDeath builds it the first time).
  middle: number
  greens: { material: THREE.MeshLambertMaterial; color: THREE.Color }[]
  flames: ReturnType<typeof buildFlames> | null
  length: number
}

// One topiary, `length` nose to tail. A seed roughs up every lump a little,
// so the clipping looks done by hand.
export function buildTopiaryParts(
  kind: TopiaryKind,
  length: number,
  seed = 0x70b
): TopiaryParts {
  const rng = mulberry32(seed)
  const group = new THREE.Group()
  group.name = `topiary-${kind}`
  const roll = new THREE.Group()
  const hedge = new THREE.Group()
  const body = new THREE.Group()
  group.add(roll)
  roll.add(hedge)
  hedge.add(body)
  const light = lambert({ color: HEDGE, flatShading: true })
  const dark = lambert({ color: HEDGE_DARK, flatShading: true })
  const limbs: THREE.Group[] = []
  for (const lump of SHAPES[kind]) {
    const geometry = new THREE.IcosahedronGeometry(1, 1)
    // Each corner pushed in or out a little: clipped leaves, not a ball.
    const position = geometry.getAttribute('position')
    for (let i = 0; i < position.count; i++) {
      const k = range(rng, 0.88, 1.08)
      position.setXYZ(
        i,
        position.getX(i) * k,
        position.getY(i) * k,
        position.getZ(i) * k
      )
    }
    geometry.computeVertexNormals()
    const mesh = new THREE.Mesh(geometry, lump.dark ? dark : light)
    mesh.scale.set(lump.rx, lump.ry, lump.rz)
    mesh.rotation.set(0, range(rng, -0.1, 0.1), lump.tilt ?? 0)
    if (lump.limb) {
      // Hung from its top: the hip.
      const hip = new THREE.Group()
      hip.position.set(lump.x, lump.y + lump.ry * 0.85, lump.z)
      mesh.position.set(0, -lump.ry * 0.85, 0)
      hip.add(mesh)
      hedge.add(hip)
      limbs.push(hip)
    } else {
      mesh.position.set(lump.x, lump.y, lump.z)
      body.add(mesh)
    }
  }
  mergeStatic(body)
  // Nose to tail, scaled to fill, and hung from the roll at the body's
  // middle height so it turns over in place.
  const box = new THREE.Box3().setFromObject(hedge)
  const k = length / Math.max(0.01, box.max.x - box.min.x)
  const middle = ((box.max.y + box.min.y) / 2) * k
  hedge.scale.setScalar(k)
  hedge.position.set(-((box.max.x + box.min.x) / 2) * k, -middle, 0)
  roll.position.y = middle
  return {
    group,
    roll,
    hedge,
    limbs,
    middle,
    greens: [light, dark].map((material) => ({
      material,
      color: material.color.clone(),
    })),
    flames: null,
    length,
  }
}

// Burned through, this dark, and sunk this far into the ground as it burns
// down, of its height. On its back, its legs kick this far (radians) at
// about this rate (a second), each its own, and the body rocks under them
// this much.
const BURNT_COLOR = new THREE.Color('#0d0b08')
const SUNK = 0.85
const KICK = 0.8
const KICK_RATE = 11
const ROCK = 0.08

// A topiary as it dies (topiaries.ts deathPose), `time` a running time in
// seconds for the fire and the kicking: ablaze, over on its back, kicking,
// blackening and burning down into the ground. With no pose, whole again:
// green, on its feet and unlit.
export function poseDeath(
  parts: TopiaryParts,
  pose: DeathPose | null,
  time: number
): void {
  const { roll, limbs, greens } = parts
  if (!pose) {
    for (const g of greens) g.material.color.copy(g.color)
    roll.rotation.set(0, 0, 0)
    roll.position.y = parts.middle
    for (const limb of limbs) limb.rotation.set(0, 0, 0)
    if (parts.flames) parts.flames.group.visible = false
    return
  }
  if (!parts.flames) {
    const half = parts.length / 2
    parts.flames = buildFlames(
      [-0.8, -0.45, -0.1, 0.25, 0.6, 0.9].map((x, n) => ({
        at: [x * half, 0.5 + (n % 2) * 0.4, (n % 3) * 0.25 - 0.25],
        size: 1.3 + (n % 2) * 0.5,
      })),
      0xb0a
    )
    parts.group.add(parts.flames.group)
  }
  const { flames } = parts
  flames.group.visible = pose.fire > 0
  flames.group.scale.setScalar(Math.max(0.01, pose.fire))
  flames.update(time)
  for (const g of greens) {
    g.material.color.copy(g.color).lerp(BURNT_COLOR, pose.char)
  }
  const rock = Math.sin(time * 7) * ROCK * pose.flail
  roll.rotation.set(pose.roll + rock, 0, 0)
  roll.position.y = parts.middle * (1 - SUNK * pose.sink)
  limbs.forEach((limb, n) => {
    const rate = KICK_RATE * (1 + n * 0.17)
    limb.rotation.z = Math.sin(time * rate + n * 1.3) * KICK * pose.flail
    limb.rotation.x = Math.cos(time * rate * 0.8 + n) * KICK * 0.4 * pose.flail
  })
}

// The topiary alone, standing.
export function buildTopiary(
  kind: TopiaryKind,
  length: number,
  seed = 0x70b
): THREE.Group {
  return buildTopiaryParts(kind, length, seed).group
}
