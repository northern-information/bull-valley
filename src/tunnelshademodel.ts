import * as THREE from 'three'
import { lambert } from './assetkit.ts'
import { clamp01 } from './math.ts'
import { applyPS1 } from './ps1.ts'
import { mulberry32, range } from './rng.ts'
import type { Vec3 } from './interfaces.ts'

// A tunnel shade (tunnelshades.ts): a hunched black shape low to the
// stone, its long arms hanging, two pale eyes; or the Warden, tall in a
// hooded cloak with a crown of iron spikes and red eyes. Origin at the
// floor under it, facing +Z. setBurn pales it and shakes it as a beam
// burns it.
export interface TunnelShadeRig {
  group: THREE.Group
  update(t: number): void
  setBurn(burn: number): void
}

const SHADE_BODY = new THREE.Color('#040405')
const SHADE_PALE = new THREE.Color('#6a6e78')

export function buildTunnelShade(
  kind: 'shade' | 'warden',
  seed = 0x7e11
): TunnelShadeRig {
  const rng = mulberry32(seed)
  const group = new THREE.Group()
  group.name = kind === 'warden' ? 'warden' : 'tunnel-shade'
  const body = new THREE.MeshBasicMaterial({
    color: SHADE_BODY,
    transparent: true,
    opacity: 0.94,
  })
  applyPS1(body)
  const eyes = applyPS1(
    new THREE.MeshBasicMaterial({
      color: kind === 'warden' ? '#ff2a1a' : '#d8e4ea',
    })
  )
  const iron = lambert({
    color: '#2a2c30',
    emissive: new THREE.Color('#0a0a0c'),
  })
  const add = (
    geometry: THREE.BufferGeometry,
    material: THREE.Material,
    at: Vec3,
    turn: Vec3 = [0, 0, 0]
  ) => {
    const mesh = new THREE.Mesh(geometry, material)
    mesh.position.set(...at)
    mesh.rotation.set(...turn)
    group.add(mesh)
    return mesh
  }
  const sway: THREE.Mesh[] = []
  if (kind === 'shade') {
    // Hunched: a long tilted body, the head thrust forward low.
    add(
      new THREE.ConeGeometry(0.42, 1.3, 6),
      body,
      [0, 0.65, -0.1],
      [0.5, 0, 0]
    )
    add(new THREE.IcosahedronGeometry(0.2, 0), body, [0, 1.15, 0.38])
    for (const x of [-0.12, 0.12]) {
      add(new THREE.BoxGeometry(0.05, 0.03, 0.02), eyes, [x * 0.6, 1.18, 0.56])
    }
    for (const x of [-0.32, 0.32]) {
      sway.push(
        add(
          new THREE.BoxGeometry(0.07, 1.0, 0.07),
          body,
          [x, 0.6, 0.2],
          [0.3, 0, x > 0 ? -0.15 : 0.15]
        )
      )
    }
  } else {
    // The Warden: a cloak to the floor, the hood, the crown, a chain.
    add(new THREE.ConeGeometry(0.7, 2.6, 7), body, [0, 1.3, 0])
    add(new THREE.ConeGeometry(0.32, 0.6, 6), body, [0, 2.75, 0])
    for (const x of [-0.1, 0.1]) {
      add(new THREE.BoxGeometry(0.06, 0.04, 0.02), eyes, [x, 2.55, 0.28])
    }
    for (let i = 0; i < 7; i++) {
      const a = (i / 7) * Math.PI * 2
      add(
        new THREE.ConeGeometry(0.03, 0.28, 4),
        iron,
        [Math.sin(a) * 0.22, 3.1, Math.cos(a) * 0.22],
        [range(rng, -0.2, 0.2), 0, range(rng, -0.2, 0.2)]
      )
    }
    for (let i = 0; i < 8; i++) {
      sway.push(
        add(
          new THREE.TorusGeometry(0.06, 0.015, 3, 6),
          iron,
          [0.55, 1.6 - i * 0.14, 0.3],
          [0, i % 2 ? Math.PI / 2 : 0, 0]
        )
      )
    }
  }
  const base = sway.map((m) => m.rotation.x)
  let burn = 0
  const update = (t: number) => {
    sway.forEach((m, i) => {
      m.rotation.x = base[i] + Math.sin(t * 1.7 + i) * 0.12
    })
  }
  return {
    group,
    update,
    setBurn(next) {
      burn = clamp01(next)
      body.color.copy(SHADE_BODY).lerp(SHADE_PALE, burn)
      body.opacity = 0.94 - burn * 0.4
    },
  }
}
