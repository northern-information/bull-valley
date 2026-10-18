import * as THREE from 'three'
import { lambert } from './assetkit.ts'

// A slurm: a black slug off a Citgo's dripline (slurms.ts), after the
// leech-worms of Out of This World. A fat, glistening black body in
// segments tapering to the tail, the head at +Z, and one white tooth that
// slides out from under the head and back in. Asset-local: its belly on
// y = 0, about 0.4 m nose to tail. It inches along (`stretch`), bares the
// tooth (`tooth`), and, smashed, goes flat into a black splat that fades
// (`splat`).
export const SLURM = {
  length: 0.42,
  // The segments' half widths, head first.
  widths: [0.05, 0.062, 0.066, 0.06, 0.05, 0.036, 0.022],
  height: 0.075,
  tooth: { length: 0.075, radius: 0.012 },
  splat: 0.26,
}

export interface SlurmPose {
  // The inchworm's phase, 0 to 1 looping.
  stretch: number
  // The tooth: 0 in, 1 bared.
  tooth: number
  // Smashed: how far the splat has faded (0 fresh, 1 gone); null whole.
  splat: number | null
}

export interface SlurmRig {
  group: THREE.Group
  pose(pose: SlurmPose): void
}

export function buildSlurm(): SlurmRig {
  const group = new THREE.Group()
  group.name = 'slurm'
  // Its own skin, so each splat can fade on its own.
  const skin = lambert({
    color: '#0c0c10',
    emissive: new THREE.Color('#050508'),
    transparent: true,
  })
  const sheen = lambert({ color: '#2a2a33' })
  const white = lambert({
    color: '#f2efe6',
    emissive: new THREE.Color('#4a4842'),
  })
  const body = new THREE.Group()
  group.add(body)
  const n = SLURM.widths.length
  const step = SLURM.length / n
  const segments = SLURM.widths.map((w, i) => {
    const segment = new THREE.Mesh(new THREE.SphereGeometry(1, 6, 4), skin)
    segment.scale.set(w, SLURM.height * (w / 0.066), step * 0.85)
    segment.position.set(0, segment.scale.y, (n / 2 - i - 0.5) * step)
    // A wet ridge down its back.
    const ridge = new THREE.Mesh(new THREE.SphereGeometry(1, 5, 3), sheen)
    ridge.scale.set(0.35, 0.25, 0.7)
    ridge.position.set(0, 0.82, 0)
    segment.add(ridge)
    body.add(segment)
    return { mesh: segment, z: segment.position.z, y: segment.position.y }
  })
  // The tooth: a white fang under the head, pointing forward and a little
  // up, on a pivot so it slides out of the head and back in.
  const head = segments[0]
  const toothPivot = new THREE.Group()
  toothPivot.position.set(0, head.y * 0.7, head.z + step * 0.3)
  const fang = new THREE.Mesh(
    new THREE.ConeGeometry(SLURM.tooth.radius, SLURM.tooth.length, 5),
    white
  )
  fang.rotation.x = Math.PI / 2 - 0.35
  fang.position.z = SLURM.tooth.length / 2
  toothPivot.add(fang)
  body.add(toothPivot)
  // What is left once the bat comes down: a black splat, ragged round its
  // edge, lying flat on the ground.
  const ragged = new THREE.CircleGeometry(SLURM.splat, 9)
  const positions = ragged.getAttribute('position')
  for (let i = 1; i < positions.count; i++) {
    const k = 0.65 + 0.35 * Math.abs(Math.sin(i * 2.3))
    positions.setXY(i, positions.getX(i) * k, positions.getY(i) * k)
  }
  ragged.rotateX(-Math.PI / 2)
  const splat = new THREE.Mesh(ragged, skin)
  splat.position.y = 0.012
  splat.visible = false
  group.add(splat)

  return {
    group,
    pose({ stretch, tooth, splat: faded }) {
      // Smashed, the body is gone and the splat lies there, fading into
      // the lot over its last stretch.
      const smashed = faded !== null
      body.visible = !smashed
      splat.visible = smashed
      if (smashed) {
        skin.opacity = 1 - Math.max(0, (faded - 0.6) / 0.4)
        return
      }
      skin.opacity = 1
      toothPivot.visible = tooth > 0.02
      // The inchworm: a hump runs from tail to head, bunching the body up
      // and stretching it out again.
      const phase = stretch * Math.PI * 2
      segments.forEach((segment, i) => {
        const wave = Math.sin(phase - i * 0.9)
        segment.mesh.position.y = segment.y + Math.max(0, wave) * 0.035
        segment.mesh.position.z = segment.z * (1 - 0.12 * Math.cos(phase))
      })
      // The tooth rides the head as it bunches and stretches.
      toothPivot.position.y = head.mesh.position.y * 0.7
      toothPivot.position.z = head.mesh.position.z + step * 0.3
      // The tooth slides out of the head and tips up to strike.
      toothPivot.scale.setScalar(0.25 + 0.75 * tooth)
      toothPivot.rotation.x = -0.4 * tooth
    },
  }
}
