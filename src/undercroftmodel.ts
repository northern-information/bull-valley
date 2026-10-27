import * as THREE from 'three'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'
import {
  artTexture,
  castShadows,
  lambert,
  layered,
  makeGlowSprite,
  makeGlowTexture,
  setMotion,
} from './assetkit.ts'
import { applyPS1 } from './ps1.ts'
import { UNDERCROFT } from './undercroft.ts'
import { paintCroftArt } from './undercroftart.ts'
import type { CroftFinish } from './undercroft.ts'

// --- The Undercroft ------------------------------------------------------

// The old stone under Bull Valley Plaza (undercroft.ts), in its own metres:
// every box merged into one mesh per finish, the carvings and the chalk
// over it, and a warm haze over each knot of candles (the altar's red).
// Nothing else in the stone is lit; the rest is for the flashlight. The
// backrooms past it are lit all over, flat and yellow, by tubes that hum
// and now and then all stutter at once, a few failing on their own.
// world.ts places the group at the Undercroft's corner, high over the
// survey's.
const CROFT_FINISH: Record<CroftFinish, () => THREE.Material> = {
  // A little light of their own, as the store's walls have, so the rooms
  // read before a flashlight finds them.
  stone: () =>
    lambert({
      color: '#4a463f',
      emissive: new THREE.Color('#1c1a16'),
      emissiveIntensity: 0.6,
    }),
  flagstone: () =>
    lambert({
      color: '#3a3733',
      emissive: new THREE.Color('#16140f'),
      emissiveIntensity: 0.6,
    }),
  vault: () => lambert({ color: '#26241f' }),
  altar: () => lambert({ color: '#5a554c' }),
  bone: () =>
    lambert({
      color: '#c9bfa4',
      emissive: new THREE.Color('#3a3528'),
      emissiveIntensity: 0.6,
    }),
  wood: () => lambert({ color: '#5a4228' }),
  candle: () =>
    lambert({ color: '#e8e0c8', emissive: new THREE.Color('#5a4a2a') }),
  flame: () => applyPS1(new THREE.MeshBasicMaterial({ color: '#ffb347' })),
  water: () =>
    applyPS1(
      new THREE.MeshBasicMaterial({
        color: '#0a1418',
        transparent: true,
        opacity: 0.85,
      })
    ),
  iron: () => lambert({ color: '#3a3c3e' }),
  cloth: () => lambert({ color: '#5a1418' }),
  // The backrooms read lit without a flashlight: their light is in them.
  wallpaper: () =>
    lambert({
      color: '#b3a05a',
      emissive: new THREE.Color('#5c5126'),
      emissiveIntensity: 0.9,
    }),
  trim: () =>
    lambert({
      color: '#6b5c32',
      emissive: new THREE.Color('#2a2410'),
      emissiveIntensity: 0.9,
    }),
  carpet: () =>
    lambert({
      color: '#8a7a46',
      emissive: new THREE.Color('#3c3418'),
      emissiveIntensity: 0.9,
    }),
  damp: () =>
    lambert({
      color: '#4a3f20',
      emissive: new THREE.Color('#1c170a'),
      emissiveIntensity: 0.9,
    }),
  tile: () =>
    lambert({
      color: '#c4bc9a',
      emissive: new THREE.Color('#4c4836'),
      emissiveIntensity: 0.9,
    }),
  tube: () => applyPS1(new THREE.MeshBasicMaterial({ color: TUBE })),
  flicker: () => applyPS1(new THREE.MeshBasicMaterial({ color: TUBE })),
  dead: () => lambert({ color: '#4a4842' }),
}

// The tubes' light, and how the backrooms' light falters: mostly a hum
// too quick to see, then for a second or so every few seconds it may
// stutter all at once; a failing tube blinks on its own.
const TUBE = new THREE.Color('#f6f2da')
const LIT: readonly CroftFinish[] = [
  'wallpaper',
  'trim',
  'carpet',
  'damp',
  'tile',
]

// The finishes laid over another (layered): the carpet on the flagstone
// and the damp on the carpet, the flooded room's water, and the tubes
// under the drop ceiling.
const OVER: Partial<Record<CroftFinish, number>> = {
  carpet: 1,
  damp: 2,
  water: 1,
  tube: 1,
  flicker: 1,
  dead: 1,
}

function noise(n: number): number {
  const s = Math.sin(n * 91.7 + 17.3) * 43758.5453
  return s - Math.floor(s)
}

// 1 lit, toward 0 dark, at time t.
export function backroomsLight(t: number): number {
  const spell = Math.floor(t / 7)
  const into = t - spell * 7
  const tick = Math.floor(t * 14)
  if (noise(spell) < 0.45 && into < 1.1 && noise(tick) < 0.55) {
    return 0.25 + noise(tick + 0.5) * 0.3
  }
  return 0.97 + 0.03 * Math.sin(t * 120)
}

// A failing tube, 1 on, 0 off.
export function failingTube(t: number): number {
  const tick = Math.floor(t * 9)
  return noise(tick * 1.3) < 0.35 ? 0.15 : 1
}

interface UndercroftRig {
  group: THREE.Group
  // The candles' flicker.
  update(t: number): void
}

export function buildUndercroft(): UndercroftRig {
  const group = new THREE.Group()
  group.name = 'undercroft'
  const byFinish = new Map<CroftFinish, THREE.BufferGeometry[]>()
  for (const b of UNDERCROFT.boxes) {
    const geometry = new THREE.BoxGeometry(...b.size)
    if (b.turn) {
      geometry.applyMatrix4(
        new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(...b.turn))
      )
    }
    geometry.translate(...b.center)
    const list = byFinish.get(b.finish) ?? []
    list.push(geometry.toNonIndexed())
    byFinish.set(b.finish, list)
  }
  let flame: THREE.MeshBasicMaterial | null = null
  let tube: THREE.MeshBasicMaterial | null = null
  let failing: THREE.MeshBasicMaterial | null = null
  const lit: THREE.MeshLambertMaterial[] = []
  for (const [finish, geometries] of byFinish) {
    const over = OVER[finish]
    const material = over
      ? layered(CROFT_FINISH[finish](), over)
      : CROFT_FINISH[finish]()
    if (finish === 'tube') tube = material as THREE.MeshBasicMaterial
    if (finish === 'flicker') failing = material as THREE.MeshBasicMaterial
    if (LIT.includes(finish)) lit.push(material as THREE.MeshLambertMaterial)
    const mesh = new THREE.Mesh(mergeGeometries(geometries), material)
    mesh.name = `undercroft-${finish}`
    mesh.receiveShadow = true
    group.add(mesh)
    if (finish === 'flame') flame = material as THREE.MeshBasicMaterial
  }
  for (const sign of UNDERCROFT.signs) {
    const texture = artTexture(paintCroftArt(sign.art))
    const cut = sign.art === 'sigil'
    const mesh = new THREE.Mesh(
      new THREE.PlaneGeometry(...sign.size),
      layered(
        lambert({
          map: texture,
          transparent: cut,
          alphaTest: cut ? 0.1 : 0,
          depthWrite: !cut,
          emissive: new THREE.Color(
            sign.name === 'altar-sigil' ? '#ff3020' : '#ffffff'
          ),
          emissiveMap: texture,
          emissiveIntensity:
            sign.name === 'altar-sigil'
              ? 0.6
              : sign.art === 'sigil'
                ? 0.5
                : 0.12,
        })
      )
    )
    mesh.name = `undercroft-${sign.name}`
    mesh.position.set(...sign.center)
    mesh.rotation.set(...sign.turn)
    group.add(mesh)
  }
  // A haze over each knot of candles: the hall's rows, the chalk ring, the
  // entry's, and the altar's red.
  const warm = makeGlowTexture('rgba(255, 170, 80, 0.4)')
  const red = makeGlowTexture('rgba(255, 40, 30, 0.5)')
  const { rooms, altar, ladder } = UNDERCROFT
  const hazes: [number, number, number, THREE.Texture, number][] = [
    [ladder.x + 1.5, 0.6, ladder.z + 3, warm, 2.4],
    [altar.x + 0.2, 1.4, altar.z, red, 5],
  ]
  for (let i = 0; i < 5; i++) {
    hazes.push([
      rooms.candles.x0 + 2 + i * 4,
      0.5,
      (rooms.candles.z0 + rooms.candles.z1) / 2,
      warm,
      3.2,
    ])
  }
  hazes.push([
    (rooms.chalk.x0 + rooms.chalk.x1) / 2,
    0.5,
    (rooms.chalk.z0 + rooms.chalk.z1) / 2,
    warm,
    7,
  ])
  // And the light down the ladder from the trapdoor.
  hazes.push([
    ladder.x,
    UNDERCROFT.height - 0.3,
    ladder.z,
    makeGlowTexture('rgba(200, 220, 230, 0.35)'),
    2.5,
  ])
  for (const [x, y, z, map, scale] of hazes) {
    const sprite = makeGlowSprite(map, scale)
    sprite.position.set(x, y, z)
    group.add(sprite)
  }
  // A cold haze hanging under one tube in five, that falters with them.
  const cold = makeGlowTexture('rgba(255, 246, 205, 0.22)')
  const haze: THREE.SpriteMaterial[] = []
  UNDERCROFT.boxes
    .filter((b) => b.finish === 'tube')
    .forEach((b, i) => {
      if (i % 5 !== 0) return
      const sprite = makeGlowSprite(cold, 3.4)
      sprite.position.set(b.center[0], b.center[1] - 0.45, b.center[2])
      haze.push(sprite.material)
      group.add(sprite)
    })
  const glow = new THREE.Color('#ffb347')
  const update = (t: number) => {
    flame?.color
      .copy(glow)
      .multiplyScalar(0.75 + 0.25 * Math.sin(t * 11) * Math.sin(t * 6.1))
    const light = backroomsLight(t)
    tube?.color.copy(TUBE).multiplyScalar(light)
    failing?.color.copy(TUBE).multiplyScalar(light * failingTube(t))
    for (const m of lit) m.emissiveIntensity = 0.9 * light
    for (const m of haze) m.opacity = light
  }
  update(0)
  setMotion(group, update)
  return { group, update }
}

// The trapdoor in the Video Vault's office floor (stripmall.ts): a dark
// square in the boards, its hatch thrown back on its hinges. Origin at
// the floor under the hole's middle; the hatch hinges on its -X edge.
const TRAPDOOR = { size: 0.9 }

export function buildTrapdoor(): THREE.Group {
  const group = new THREE.Group()
  group.name = 'trapdoor'
  const { size } = TRAPDOOR
  const dark = applyPS1(new THREE.MeshBasicMaterial({ color: '#020202' }))
  const wood = lambert({ color: '#5a4228' })
  const iron = lambert({ color: '#2a2c2e' })
  const hole = new THREE.Mesh(new THREE.BoxGeometry(size, 0.01, size), dark)
  hole.position.y = 0.006
  group.add(hole)
  for (const [x, z, w, d] of [
    [0, size / 2 + 0.04, size + 0.16, 0.08],
    [0, -size / 2 - 0.04, size + 0.16, 0.08],
    [size / 2 + 0.04, 0, 0.08, size],
    [-size / 2 - 0.04, 0, 0.08, size],
  ]) {
    const frame = new THREE.Mesh(new THREE.BoxGeometry(w, 0.03, d), wood)
    frame.position.set(x, 0.015, z)
    group.add(frame)
  }
  const hatch = new THREE.Group()
  hatch.position.set(-size / 2 - 0.04, 0.03, 0)
  hatch.rotation.z = 1.9
  const lid = new THREE.Mesh(new THREE.BoxGeometry(size, 0.05, size), wood)
  lid.position.x = size / 2
  hatch.add(lid)
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.06, 0.012, 4, 8), iron)
  ring.position.set(size * 0.8, 0.04, 0)
  ring.rotation.x = Math.PI / 2
  hatch.add(ring)
  group.add(hatch)
  // The ladder's top rungs, going down into the dark.
  for (let i = 0; i < 3; i++) {
    const rung = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.05, 0.5), wood)
    rung.position.set(0.2, -0.15 - i * 0.36, 0)
    group.add(rung)
  }
  castShadows(group)
  return group
}
