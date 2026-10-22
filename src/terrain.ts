import * as THREE from 'three'
import { context2d } from './canvas.ts'
import { heightGrid } from './heightmap.ts'
import { applyPS1 } from './ps1.ts'
import type { TerrainData } from './heightmap.ts'
import type { Geo, HeightAt } from './interfaces.ts'

export type { TerrainData } from './heightmap.ts'

interface HeightField {
  seg: number
  // Grid points per side: seg + 1.
  n: number
  grid: Float32Array
  relief: number
  // The ground's height: the grid, with whatever has been cut into it.
  sample: HeightAt
  // The grid alone, uncut.
  raw: HeightAt
  // Cut something into the ground (Castle Entropy's moat, moat.ts carve):
  // from now on `sample` is `cut` of the grid.
  carve(cut: (raw: HeightAt) => HeightAt): void
}

// The committed heightmap: square, 16 bits of normalized elevation packed as
// R (high byte) + G (low byte), range in geo.json.terrain.
export async function loadTerrain(url: string): Promise<TerrainData> {
  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image()
    image.onload = () => resolve(image)
    image.onerror = () =>
      reject(new Error(`Terrain image failed to load: ${url}`))
    image.src = url
  })
  const size = img.width
  const canvas = document.createElement('canvas')
  canvas.width = size
  canvas.height = size
  const ctx = context2d(canvas, { willReadFrequently: true })
  ctx.drawImage(img, 0, 0)
  const { data } = ctx.getImageData(0, 0, size, size)
  const heights = new Float32Array(size * size)
  for (let k = 0; k < heights.length; k++) {
    heights[k] = (data[k * 4] * 256 + data[k * 4 + 1]) / 65535
  }
  return { heights, size }
}

// The playable height field (heightmap.ts heightGrid): the terrain mesh,
// the player's feet, the roads, the trees and the shadowmen all sample it,
// and so does the valley.
export function createHeightField(
  terrain: TerrainData,
  geo: Pick<Geo, 'terrain' | 'metres'>,
  seg = 480
): HeightField {
  const { n, grid, relief, raw } = heightGrid(terrain, geo, seg)
  let cut: HeightAt = raw
  return {
    seg,
    n,
    grid,
    relief,
    raw,
    sample: (x, z) => cut(x, z),
    carve(by) {
      cut = by(raw)
    },
  }
}

// The terrain mesh with a hole where the ground is cut away (the moat's
// channel: inside `outer`, outside `inner`, both five-cornered rings in
// the world): the grid is far too coarse to draw the cut, so the mesh lets
// it through and what was cut draws its own walls and floor.
export function cutTerrainHole(
  mesh: THREE.Mesh,
  inner: readonly { x: number; z: number }[],
  outer: readonly { x: number; z: number }[]
): void {
  const material = mesh.material as THREE.Material
  // The PS1 snap's own (ps1.ts applyPS1), which the hole runs after.
  const before = material.onBeforeCompile.bind(material)
  const ring = (poly: readonly { x: number; z: number }[]) =>
    poly.map((p) => new THREE.Vector2(p.x, p.z))
  material.onBeforeCompile = (shader, renderer) => {
    before(shader, renderer)
    shader.uniforms.uHoleInner = { value: ring(inner) }
    shader.uniforms.uHoleOuter = { value: ring(outer) }
    shader.vertexShader =
      'varying vec2 vHoleAt;\n' +
      shader.vertexShader.replace(
        '#include <project_vertex>',
        [
          '#include <project_vertex>',
          'vHoleAt = (modelMatrix * vec4(transformed, 1.0)).xz;',
        ].join('\n')
      )
    shader.fragmentShader =
      [
        'varying vec2 vHoleAt;',
        `uniform vec2 uHoleInner[${inner.length}];`,
        `uniform vec2 uHoleOuter[${outer.length}];`,
        holeTest('inHoleInner', 'uHoleInner', inner.length),
        holeTest('inHoleOuter', 'uHoleOuter', outer.length),
      ].join('\n') +
      '\n' +
      shader.fragmentShader.replace(
        '#include <clipping_planes_fragment>',
        [
          '#include <clipping_planes_fragment>',
          'if (inHoleOuter(vHoleAt) && !inHoleInner(vHoleAt)) discard;',
        ].join('\n')
      )
  }
  material.customProgramCacheKey = () => 'terrain-hole'
  material.needsUpdate = true
}

// A GLSL ray cast over a ring of `count` corners in uniform `ring`.
function holeTest(name: string, ring: string, count: number): string {
  return [
    `bool ${name}(vec2 p) {`,
    '  bool inside = false;',
    `  for (int i = 0; i < ${count}; i++) {`,
    `    int j = i == 0 ? ${count - 1} : i - 1;`,
    `    vec2 a = ${ring}[i];`,
    `    vec2 b = ${ring}[j];`,
    '    if ((a.y > p.y) != (b.y > p.y) &&',
    '        p.x < (b.x - a.x) * (p.y - a.y) / (b.y - a.y) + a.x) {',
    '      inside = !inside;',
    '    }',
    '  }',
    '  return inside;',
    '}',
  ].join('\n')
}

export function buildTerrainMesh(
  field: HeightField,
  geo: Pick<Geo, 'metres'>
): THREE.Mesh {
  const { seg, n, grid, relief } = field
  const { width, height } = geo.metres
  const verts = n * n
  const positions = new Float32Array(verts * 3)
  const colors = new Float32Array(verts * 3)
  const indices = new Uint32Array(seg * seg * 6)

  // Night ground: dark olive lowlands rising to grey-green knolls, with a
  // little hashed variation so the lambert shading has texture to bite.
  const low = new THREE.Color('#26311d')
  const high = new THREE.Color('#4d5a3b')
  const tmp = new THREE.Color()

  let p = 0
  for (let j = 0; j < n; j++) {
    const v = j / seg
    for (let i = 0; i < n; i++) {
      const u = i / seg
      const h = grid[j * n + i]
      positions[p * 3] = (u - 0.5) * width
      positions[p * 3 + 1] = h
      positions[p * 3 + 2] = (v - 0.5) * height
      // Cheap deterministic hash per vertex for tonal grain.
      const nn = Math.sin(i * 127.1 + j * 311.7) * 43758.5453
      const grain = (nn - Math.floor(nn) - 0.5) * 0.16
      tmp.copy(low).lerp(high, Math.min(1, Math.max(0, h / relief + grain)))
      colors[p * 3] = tmp.r
      colors[p * 3 + 1] = tmp.g
      colors[p * 3 + 2] = tmp.b
      p++
    }
  }

  let q = 0
  for (let j = 0; j < seg; j++) {
    for (let i = 0; i < seg; i++) {
      const a = j * n + i
      const b = a + 1
      const c = a + n
      const d = c + 1
      indices[q++] = a
      indices[q++] = c
      indices[q++] = b
      indices[q++] = b
      indices[q++] = c
      indices[q++] = d
    }
  }

  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3))
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3))
  geometry.setIndex(new THREE.BufferAttribute(indices, 1))
  geometry.computeVertexNormals()

  const material = applyPS1(
    new THREE.MeshLambertMaterial({ vertexColors: true })
  )
  const mesh = new THREE.Mesh(geometry, material)
  mesh.name = 'terrain'
  // The truck's headlights throw shadows across the fields too.
  mesh.receiveShadow = true
  return mesh
}
