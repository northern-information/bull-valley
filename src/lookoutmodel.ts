import * as THREE from 'three'
import { castShadows, lambert, mergeStatic } from './assetkit.ts'
import { LOOKOUT } from './lookout.ts'

// The lookout tower by the corn maze's gate (lookout.ts): a timber fire
// lookout on four splayed legs braced in X's, a plank deck with a railing
// round it and a pyramid roof on corner posts, and a ladder leaning up its
// -x face to a gap in the railing. Origin at the ground under the deck's
// middle; `deck` is how high the deck's top stands over it. The legs sink
// a little so a slope never shows daylight under them.
const SINK = 0.6
const LEG = 0.22
const BRACE = 0.1
const ROOF_POSTS = 2.3
const ROOF_RISE = 1.6
const LADDER_WIDTH = 0.6
const RUNG_STEP = 0.36

export function buildLookout(deck: number = LOOKOUT.height): THREE.Group {
  const group = new THREE.Group()
  group.name = 'lookout'
  const timber = lambert({ color: '#5b4630' })
  const weathered = lambert({ color: '#6e5a42' })
  const plank = lambert({ color: '#7d6646' })
  const roofing = lambert({ color: '#3d3a36' })
  const { half, spread, rail } = LOOKOUT

  // A beam of square section from a to b.
  const beam = (
    a: THREE.Vector3,
    b: THREE.Vector3,
    size: number,
    material: THREE.Material
  ) => {
    const length = a.distanceTo(b)
    const mesh = new THREE.Mesh(
      new THREE.BoxGeometry(size, length, size),
      material
    )
    mesh.position.copy(a).add(b).multiplyScalar(0.5)
    mesh.quaternion.setFromUnitVectors(
      new THREE.Vector3(0, 1, 0),
      b.clone().sub(a).normalize()
    )
    group.add(mesh)
  }
  const box = (
    size: [number, number, number],
    at: [number, number, number],
    material: THREE.Material
  ) => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(...size), material)
    mesh.position.set(...at)
    group.add(mesh)
  }

  // Where a leg stands at height y: splayed out at the foot, in under the
  // deck's corner at the top.
  const top = deck - 0.2
  const reachAt = (y: number) => half - 0.15 + (spread + 0.15) * (1 - y / top)
  const corner = (sx: number, sz: number, y: number) =>
    new THREE.Vector3(sx * reachAt(y), y, sz * reachAt(y))
  const signs: [number, number][] = [
    [-1, -1],
    [1, -1],
    [1, 1],
    [-1, 1],
  ]
  for (const [sx, sz] of signs) {
    beam(corner(sx, sz, -SINK), corner(sx, sz, top), LEG, timber)
  }

  // Girts round every face at each level, and an X in every bay between.
  const levels = Math.max(2, Math.round(top / 4))
  const at = (i: number) => (i / levels) * top
  for (let f = 0; f < signs.length; f++) {
    const [ax, az] = signs[f]
    const [bx, bz] = signs[(f + 1) % signs.length]
    for (let i = 1; i <= levels; i++) {
      beam(corner(ax, az, at(i)), corner(bx, bz, at(i)), BRACE, weathered)
    }
    for (let i = 0; i < levels; i++) {
      const lo = at(i) + (i === 0 ? 0.4 : 0)
      const hi = at(i + 1)
      beam(corner(ax, az, lo), corner(bx, bz, hi), BRACE, weathered)
      beam(corner(bx, bz, lo), corner(ax, az, hi), BRACE, weathered)
    }
  }

  // The deck, a little proud of the corners, and its joists under it.
  box([half * 2 + 0.3, 0.2, half * 2 + 0.3], [0, deck - 0.1, 0], plank)
  for (const z of [-half + 0.3, 0, half - 0.3]) {
    box([half * 2, 0.16, 0.14], [0, deck - 0.28, z], timber)
  }

  // The railing: posts round the edge, a top rail and a mid rail on every
  // side, the -x side open in the middle where the ladder comes up.
  const edge = half - 0.05
  const gap = LADDER_WIDTH / 2 + 0.15
  const rails = (a: THREE.Vector3, b: THREE.Vector3) => {
    for (const h of [rail, rail * 0.5]) {
      beam(a.clone().setY(deck + h), b.clone().setY(deck + h), 0.07, weathered)
    }
  }
  const post = (x: number, z: number) =>
    box([0.1, rail, 0.1], [x, deck + rail / 2, z], timber)
  for (const [sx, sz] of signs) post(sx * edge, sz * edge)
  for (const s of [-1, 1]) {
    post(s * edge, 0)
    post(0, s * edge)
  }
  post(-edge, -gap)
  post(-edge, gap)
  const v = (x: number, z: number) => new THREE.Vector3(x, 0, z)
  rails(v(-edge, -edge), v(edge, -edge))
  rails(v(edge, -edge), v(edge, edge))
  rails(v(edge, edge), v(-edge, edge))
  rails(v(-edge, edge), v(-edge, gap))
  rails(v(-edge, -gap), v(-edge, -edge))

  // The roof: a post up from each corner and a four-sided pyramid on them.
  for (const [sx, sz] of signs) {
    box(
      [0.12, ROOF_POSTS, 0.12],
      [sx * edge, deck + ROOF_POSTS / 2, sz * edge],
      timber
    )
  }
  const roof = new THREE.Mesh(
    new THREE.ConeGeometry((half + 0.5) * Math.SQRT2, ROOF_RISE, 4, 1),
    roofing
  )
  roof.rotation.y = Math.PI / 4
  roof.position.y = deck + ROOF_POSTS + ROOF_RISE / 2
  group.add(roof)

  // The ladder, leaning up the -x face: two rails from its foot out on the
  // ground to the deck's edge, rungs between.
  const foot = -half - LOOKOUT.footOut + 0.1
  const head = -half - 0.1
  for (const s of [-1, 1]) {
    beam(
      new THREE.Vector3(foot, -SINK, (s * LADDER_WIDTH) / 2),
      new THREE.Vector3(head, deck + 0.9, (s * LADDER_WIDTH) / 2),
      0.08,
      timber
    )
  }
  const rungs = Math.floor(deck / RUNG_STEP)
  for (let i = 1; i <= rungs; i++) {
    const y = i * RUNG_STEP
    const x = foot + (head - foot) * ((y + SINK) / (deck + 0.9 + SINK))
    box([0.05, 0.05, LADDER_WIDTH], [x, y, 0], weathered)
  }

  castShadows(group)
  mergeStatic(group)
  return group
}
