import * as THREE from 'three'
import { makeGlowTexture } from './assetkit.ts'
import { FIREFLY, fireflyAt, fireflyField } from './fireflies.ts'
import type { XZ } from './interfaces.ts'

// The fireflies drawn: one cloud of points over a field, each fly's place
// and flash read from fireflies.ts every frame. They glow through the fog,
// as a streetlight's halo does (roadsideparts.ts), but fade out with
// distance so a field of them does not light up the whole valley.
const FIREFLY_LOOK = {
  // Photinus pyralis's cold yellow-green.
  color: '#d8ff6a',
  // The glow's width in metres, and the fewest pixels it shrinks to, so a
  // fly far off is still a spark and not lost between pixels.
  size: 0.6,
  minPixels: 2.5,
  // Camera distance (m) where the flies start to fade and where they are
  // gone.
  fade: [120, 200] as const,
}

export interface Fireflies {
  group: THREE.Group
  // Move and light every fly for running time `t`, in seconds.
  update(t: number): void
}

// The points' material: per-fly brightness in the vertex color (black is
// nothing, the blending is additive), dimmed past `fade` in the shader.
function fireflyMaterial(): THREE.PointsMaterial {
  const L = FIREFLY_LOOK
  const material = new THREE.PointsMaterial({
    map: makeGlowTexture('rgba(255, 255, 255, 1)'),
    size: L.size,
    vertexColors: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    transparent: true,
    fog: false,
  })
  material.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader.replace(
      '#include <fog_vertex>',
      [
        '#include <fog_vertex>',
        `gl_PointSize = max(gl_PointSize, ${L.minPixels.toFixed(1)});`,
        `vColor.rgb *= 1.0 - smoothstep(${L.fade[0].toFixed(1)}, ${L.fade[1].toFixed(1)}, length(mvPosition.xyz));`,
      ].join('\n')
    )
  }
  return material
}

// `count` flies over the disc at `centre`. Each fly's ground is read once,
// under its home point; it hovers its lift over that.
export function buildFireflies(
  centre: XZ,
  radius: number,
  groundAt: (x: number, z: number) => number,
  count = 260,
  seed = 0xf1ef1e
): Fireflies {
  const flies = fireflyField(seed, count, centre, radius)
  const floor = flies.map((fly) => groundAt(fly.x, fly.z))
  const positions = new Float32Array(count * 3)
  const colors = new Float32Array(count * 3)
  const geometry = new THREE.BufferGeometry()
  const position = new THREE.BufferAttribute(positions, 3)
  const color = new THREE.BufferAttribute(colors, 3)
  position.setUsage(THREE.DynamicDrawUsage)
  color.setUsage(THREE.DynamicDrawUsage)
  geometry.setAttribute('position', position)
  geometry.setAttribute('color', color)
  // The flies never leave the disc, so its bounds hold for every frame.
  const top = (count > 0 ? Math.max(...floor) : 0) + FIREFLY.liftMax
  const bottom = count > 0 ? Math.min(...floor) : 0
  geometry.boundingSphere = new THREE.Sphere(
    new THREE.Vector3(centre.x, (top + bottom) / 2, centre.z),
    Math.hypot(radius, (top - bottom) / 2)
  )
  const points = new THREE.Points(geometry, fireflyMaterial())
  points.name = 'fireflies'
  const group = new THREE.Group()
  group.name = 'fireflies'
  group.add(points)

  const tint = new THREE.Color(FIREFLY_LOOK.color)
  const update = (t: number): void => {
    flies.forEach((fly, i) => {
      const at = fireflyAt(fly, t)
      positions[i * 3] = at.x
      positions[i * 3 + 1] = floor[i] + at.lift
      positions[i * 3 + 2] = at.z
      colors[i * 3] = tint.r * at.glow
      colors[i * 3 + 1] = tint.g * at.glow
      colors[i * 3 + 2] = tint.b * at.glow
    })
    position.needsUpdate = true
    color.needsUpdate = true
  }
  update(0)
  return { group, update }
}
