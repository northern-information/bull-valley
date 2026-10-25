// What a left fist holds in place of the flashlight (held.ts): the slurm
// jar, upright, a rod by its cork grip, tipped up off the forearm with
// the reel hanging under it, or the torch, gripped low and tipped well up
// so its fire burns over the fist. Both are hung on a fist the way the flashlight
// is (figure.ts attachFlashlight): along the forearm's -Y. `up` says which
// way the forearm's Z points once the arm is raised: +1 on a figure (a
// peer's, peers.ts), -1 in first person (fphands.ts), whose arm is turned
// the other way round to the view.

import * as THREE from 'three'
import { motionOf, setMotion } from './assetkit.ts'
import { buildFishingRod, buildSlurmJar } from './fishmodels.ts'
import { buildTorch, TORCH } from './torchmodel.ts'

// The jar's height, metres (fishmodels.ts buildSlurmJar).
const JAR_HEIGHT = 0.24
// Where along the rod the hand closes: the cork, just behind the reel.
const ROD_GRIP = 0.6
// How far the rod is tipped up off the forearm's line, radians.
const ROD_TIP_UP = 0.5

export function buildHeldJar(up: 1 | -1, scale = 1): THREE.Group {
  const jar = buildSlurmJar({ glow: false })
  // Its +Y up along the forearm's raised Z, the fist round its middle.
  jar.rotation.x = (up * Math.PI) / 2
  jar.position.z = (-up * JAR_HEIGHT) / 2
  const group = new THREE.Group()
  group.name = 'held-jar'
  group.add(jar)
  group.scale.setScalar(scale)
  return group
}

export function buildHeldRod(kind: string, up: 1 | -1, scale = 1): THREE.Group {
  // The rod alone, lying along +X, out of the group that stands it on its
  // reel (fishmodels.ts buildFishingRod).
  const rod = buildFishingRod(kind, { glow: false }).children[0]
  rod.position.set(ROD_GRIP, 0, 0)
  // The reel lies out on +Z: turned under, to the forearm's -up.
  rod.rotation.x = up === 1 ? Math.PI : 0
  // +X down the forearm's -Y.
  const along = new THREE.Group()
  along.rotation.z = -Math.PI / 2
  along.add(rod)
  const group = new THREE.Group()
  group.name = `held-${kind}`
  // Tipped up toward the forearm's raised Z.
  group.rotation.x = -up * ROD_TIP_UP
  group.add(along)
  group.scale.setScalar(scale)
  return group
}

// Where along the torch the hand closes, from its butt, and how far it is
// tipped up off the forearm's line, radians.
const TORCH_GRIP = TORCH.length * 0.3
const TORCH_TIP_UP = 1.05

// `tip` says how far up it is tipped: a figure holds it well up, and in
// first person it leans out ahead so it never stands up through the view.
export function buildHeldTorch(
  up: 1 | -1,
  scale = 1,
  tip = TORCH_TIP_UP
): THREE.Group {
  const torch = buildTorch({ glow: false })
  torch.position.y = -TORCH_GRIP
  // Its +Y, butt to flame, down the forearm's -Y.
  const along = new THREE.Group()
  along.rotation.z = Math.PI
  along.add(torch)
  const group = new THREE.Group()
  group.name = 'held-torch'
  group.rotation.x = -up * tip
  group.add(along)
  group.scale.setScalar(scale)
  // Its fire burns on in the fist: whoever holds it plays it.
  const burn = motionOf(torch)
  if (burn) setMotion(group, burn)
  return group
}
