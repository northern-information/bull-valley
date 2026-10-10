import * as THREE from 'three'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'
import { context2d } from './canvas.ts'
import { applyPS1 } from './ps1.ts'
import type { CanvasArt } from './canvas.ts'
import type { Vec3 } from './interfaces.ts'

// The kit every asset builder shares: the part shape world.ts instances,
// the PS1 lambert, the glow textures and sprites, painted art as texture,
// the static merge and the shadow flags, and the registries the game loop
// and the Akashic read an asset's pulse and motion from. Building parts
// consumes no rng, so placement seeds stay put.

export interface Part {
  name: string
  geometry: THREE.BufferGeometry
  material: THREE.Material | THREE.Material[]
  position?: Vec3
  rotation?: Vec3
  scale?: Vec3
}

// glow: false leaves out the halo, for close-up views like the inventory.
export interface PickupOptions {
  glow?: boolean
}

// One entry in the Akashic page's asset list.
export interface AkashicAsset {
  id: string
  label: string
  build: () => THREE.Object3D
}

// Object3D has no isMesh in its type; this narrows by the runtime flag.
export function isMesh(o: THREE.Object3D): o is THREE.Mesh {
  return 'isMesh' in o && o.isMesh === true
}

export function lambert(
  opts: THREE.MeshLambertMaterialParameters
): THREE.MeshLambertMaterial {
  return applyPS1(new THREE.MeshLambertMaterial(opts))
}

// One glow texture a color, shared by every halo that asks for it and
// never disposed: a pickup, a drop or a spider going frees its own
// materials and leaves the map.
const GLOW_TEXTURES = new Map<string, THREE.CanvasTexture>()

export function makeGlowTexture(
  color = 'rgba(251, 191, 36, 0.65)'
): THREE.CanvasTexture {
  const had = GLOW_TEXTURES.get(color)
  if (had) return had
  const canvas = document.createElement('canvas')
  canvas.width = 64
  canvas.height = 64
  const ctx = context2d(canvas)
  const grad = ctx.createRadialGradient(32, 32, 2, 32, 32, 30)
  grad.addColorStop(0, color)
  grad.addColorStop(1, 'rgba(0, 0, 0, 0)')
  ctx.fillStyle = grad
  ctx.fillRect(0, 0, 64, 64)
  const texture = new THREE.CanvasTexture(canvas)
  GLOW_TEXTURES.set(color, texture)
  return texture
}

export function makeGlowSprite(
  map: THREE.Texture,
  scale: number
): THREE.Sprite {
  const sprite = new THREE.Sprite(
    new THREE.SpriteMaterial({
      map,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      transparent: true,
    })
  )
  sprite.scale.setScalar(scale)
  return sprite
}

// The ring around whatever E would act on (glow.ts): the Citgo sign's
// red-orange.
export const CITGO_RED = '#ff4a1c'

// A painted canvas as a texture, in sRGB like the CSS colors it was drawn in.
// One texture a canvas: art painted once (the trade dress below, shared
// by every pack, drink and medicine of its kind) is uploaded once, and
// every instance's material reads the same map.
const ART_TEXTURES = new WeakMap<HTMLCanvasElement, THREE.CanvasTexture>()
export function artTexture({ c }: CanvasArt): THREE.CanvasTexture {
  const had = ART_TEXTURES.get(c)
  if (had) return had
  const texture = new THREE.CanvasTexture(c)
  texture.colorSpace = THREE.SRGBColorSpace
  ART_TEXTURES.set(c, texture)
  return texture
}

// The trade dress, painted once a kind and kept: every instance of a
// pack, a drink, a medicine or the $20 bill shares its canvases (and, by
// artTexture, its textures), so nothing that goes may dispose its maps.
export function memo<T>(paint: (id: string) => T): (id: string) => T {
  const had = new Map<string, T>()
  return (id) => {
    let art = had.get(id)
    if (art === undefined) {
      art = paint(id)
      had.set(id, art)
    }
    return art
  }
}

// Art that glows through its own emissiveMap, so it reads in the dark; the
// pickup pulse drives emissiveIntensity.
export function packFace(texture: THREE.Texture): THREE.MeshLambertMaterial {
  return lambert({
    map: texture,
    emissive: new THREE.Color('#ffffff'),
    emissiveMap: texture,
    emissiveIntensity: 0.45,
  })
}

export function packFlat(color: string): THREE.MeshLambertMaterial {
  return lambert({
    color,
    emissive: new THREE.Color(color),
    emissiveIntensity: 0.45,
  })
}

// Bakes every node's plain mesh children (no children of their own, one
// material) into one mesh per material, in place: the same look in a few
// draws instead of one per part. A mesh alone with its material stays as
// it is, and nothing else (sprites, points, groups) is touched, so a
// pivot's parts merge among themselves and still move with it.
//
// A part keeps only the attributes its material reads: position and
// normal, and uv where the material has a map. Parts that still differ
// (a mapped part with no uv) merge only with their like.
export function mergeStatic(root: THREE.Object3D): void {
  const nodes: THREE.Object3D[] = []
  root.traverse((node) => nodes.push(node))
  for (const node of nodes) {
    const groups = new Map<
      string,
      { material: THREE.Material; meshes: THREE.Mesh[] }
    >()
    for (const child of node.children) {
      if (!isMesh(child) || child.children.length > 0) continue
      if (Array.isArray(child.material)) continue
      const keep = keptAttributes(child.material, child.geometry)
      const key = `${child.material.uuid}|${keep.join(',')}`
      const group = groups.get(key) ?? { material: child.material, meshes: [] }
      group.meshes.push(child)
      groups.set(key, group)
    }
    for (const { material, meshes } of groups.values()) {
      if (meshes.length < 2) continue
      const parts = meshes.map((mesh) => {
        mesh.updateMatrix()
        const source = mesh.geometry.index
          ? mesh.geometry.toNonIndexed()
          : mesh.geometry.clone()
        source.applyMatrix4(mesh.matrix)
        const part = new THREE.BufferGeometry()
        for (const name of keptAttributes(material, mesh.geometry)) {
          part.setAttribute(name, source.getAttribute(name))
        }
        return part
      })
      const merged = mergeGeometries(parts) as THREE.BufferGeometry | null
      if (!merged) continue
      for (const mesh of meshes) {
        node.remove(mesh)
        mesh.geometry.dispose()
      }
      node.add(new THREE.Mesh(merged, material))
    }
  }
}

// What a part needs to draw with `material`: always position and normal,
// and uv when the material has a map to read through it.
function keptAttributes(
  material: THREE.Material,
  geometry: THREE.BufferGeometry
): string[] {
  const keep = ['position', 'normal']
  const mapped = 'map' in material && material.map !== null
  if (mapped && geometry.getAttribute('uv')) keep.push('uv')
  return keep
}

// The materials the game loop pulses on each pickup. A WeakMap keeps the
// list typed; Object3D.userData is `any`.
const PULSE = new WeakMap<THREE.Object3D, THREE.MeshLambertMaterial[]>()

// Assets that move on their own (fire, rain, the horse at ease), keyed by
// their root: the update to call with a running time in seconds. The game
// keeps its own handle on each rig; the Akashic plays them from here.
const MOTION = new WeakMap<THREE.Object3D, (t: number) => void>()

export function setMotion(
  object: THREE.Object3D,
  update: (t: number) => void
): void {
  MOTION.set(object, update)
}

export function motionOf(object: THREE.Object3D): ((t: number) => void) | null {
  return MOTION.get(object) ?? null
}

export function setPulseMaterials(
  object: THREE.Object3D,
  materials: THREE.MeshLambertMaterial[]
): void {
  PULSE.set(object, materials)
}

export function pulseMaterials(
  object: THREE.Object3D
): THREE.MeshLambertMaterial[] {
  return PULSE.get(object) ?? []
}

// Every mesh under `root` throws a shadow under the station lights.
export function castShadows(root: THREE.Object3D): void {
  root.traverse((o) => {
    if (isMesh(o)) o.castShadow = true
  })
}

// One Mesh per part in a Group, for a single non-instanced copy.
export function assembleParts(parts: Part[]): THREE.Group {
  const group = new THREE.Group()
  for (const part of parts) {
    const mesh = new THREE.Mesh(part.geometry, part.material)
    mesh.name = part.name
    if (part.position) mesh.position.set(...part.position)
    if (part.rotation) mesh.rotation.set(...part.rotation)
    if (part.scale) mesh.scale.set(...part.scale)
    group.add(mesh)
  }
  return group
}

// Bounds from meshes only: glow sprites are unit planes scaled up, and would
// frame a camera on empty air.
export function meshBounds(object: THREE.Object3D): THREE.Box3 {
  const box = new THREE.Box3()
  object.updateMatrixWorld(true)
  object.traverse((o) => {
    if (isMesh(o)) box.expandByObject(o)
  })
  return box
}
