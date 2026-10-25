import * as THREE from 'three'
import {
  lambert,
  makeGlowSprite,
  makeGlowTexture,
  setMotion,
} from './assetkit.ts'
import { buildFlames } from './fire.ts'
import type { PickupOptions } from './assetkit.ts'

// The torch and the toolbox it comes out of at the foot of the corn
// maze's lookout (sharedworld.ts rule 39).

// --- Torch -----------------------------------------------------------------

// A pine stake with a kerosene rag wired round its head, standing on its
// butt at the origin, the flame on top. Its fire moves on its own
// (setMotion), from the pack's thumbnail to a peer's fist.
export const TORCH = {
  length: 0.62,
  radius: 0.018,
  // The rag: how long a wrap at the top, and how thick.
  rag: 0.13,
  ragRadius: 0.038,
  flame: 0.24,
} as const

export function buildTorch({ glow = true }: PickupOptions = {}): THREE.Group {
  const T = TORCH
  const group = new THREE.Group()
  group.name = 'torch'
  const stake = new THREE.Mesh(
    new THREE.CylinderGeometry(T.radius * 0.85, T.radius, T.length, 6),
    lambert({ color: '#6b4a2a' })
  )
  stake.position.y = T.length / 2
  group.add(stake)
  const rag = new THREE.Mesh(
    new THREE.CylinderGeometry(T.ragRadius, T.ragRadius * 0.9, T.rag, 7),
    lambert({ color: '#2a2018' })
  )
  rag.position.y = T.length - T.rag / 2
  group.add(rag)
  // Two turns of wire round the rag.
  const wire = lambert({ color: '#7a7c80' })
  for (const y of [0.3, 0.75]) {
    const turn = new THREE.Mesh(
      new THREE.TorusGeometry(T.ragRadius + 0.002, 0.004, 4, 10),
      wire
    )
    turn.rotation.x = Math.PI / 2
    turn.position.y = T.length - T.rag * y
    group.add(turn)
  }
  const top = T.length - 0.02
  const flames = buildFlames(
    [
      { at: [0, top, 0], size: T.flame },
      { at: [0.015, top, -0.01], size: T.flame * 0.7 },
      { at: [-0.012, top, 0.012], size: T.flame * 0.6 },
    ],
    0x70c4
  )
  group.add(flames.group)
  if (glow) {
    const halo = makeGlowSprite(makeGlowTexture('rgba(255, 140, 50, 0.6)'), 0.9)
    halo.position.y = top + T.flame * 0.4
    group.add(halo)
  }
  setMotion(group, (t) => flames.update(t))
  flames.update(0)
  return group
}

// --- Toolbox ---------------------------------------------------------------

// A red steel toolbox on the ground at the ladder's foot, its lid thrown
// back, the butts of the spare torches standing up out of it. Scenery: no
// glow, no pulse. Its front faces +Z.
export const TOOLBOX = {
  width: 0.62,
  depth: 0.28,
  body: 0.26,
  lid: 0.05,
} as const

export function buildToolbox(): THREE.Group {
  const T = TOOLBOX
  const group = new THREE.Group()
  group.name = 'toolbox'
  const red = lambert({ color: '#a3241c' })
  const dark = lambert({ color: '#1c1412' })
  const steel = lambert({ color: '#9a9ea2' })
  // BoxGeometry face order: +x, -x, +y, -y, +z, -z. The top is the dark
  // inside.
  const body = new THREE.Mesh(new THREE.BoxGeometry(T.width, T.body, T.depth), [
    red,
    red,
    dark,
    red,
    red,
    red,
  ])
  body.position.y = T.body / 2
  group.add(body)
  // The lid, thrown back on its hinge along the back edge.
  const hinge = new THREE.Group()
  hinge.position.set(0, T.body, -T.depth / 2)
  hinge.rotation.x = -1.9
  const lid = new THREE.Mesh(
    new THREE.BoxGeometry(T.width, T.lid, T.depth),
    red
  )
  lid.position.set(0, T.lid / 2, T.depth / 2)
  hinge.add(lid)
  group.add(hinge)
  // The handle and the latches on the front.
  const handle = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.02, 0.02), steel)
  handle.position.set(0, T.body - 0.05, T.depth / 2 + 0.02)
  group.add(handle)
  for (const x of [-0.22, 0.22]) {
    const latch = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.05, 0.01), steel)
    latch.position.set(x, T.body - 0.03, T.depth / 2 + 0.006)
    group.add(latch)
  }
  // The spares, unlit, leaning in it.
  const stake = new THREE.CylinderGeometry(0.016, 0.018, 0.5, 6)
  const rag = new THREE.CylinderGeometry(0.035, 0.032, 0.11, 7)
  const wood = lambert({ color: '#6b4a2a' })
  const cloth = lambert({ color: '#cfc6a8' })
  ;[
    [-0.16, 0.25],
    [-0.06, -0.15],
    [0.07, 0.3],
    [0.18, -0.2],
  ].forEach(([x, lean]) => {
    const spare = new THREE.Group()
    const s = new THREE.Mesh(stake, wood)
    s.position.y = 0.25
    const r = new THREE.Mesh(rag, cloth)
    r.position.y = 0.45
    spare.add(s, r)
    spare.position.set(x, 0.04, 0)
    spare.rotation.set(lean * 0.6, 0, lean)
    group.add(spare)
  })
  return group
}
