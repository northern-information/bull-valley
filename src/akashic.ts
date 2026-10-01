// The Akashic record: a dev-only page (/akashic) that shows one 3D asset at
// a time through the game's own render pipeline — same downscale, PS1 snap,
// lights, and fog as main.ts — so an asset can be checked without a raid.
// Assets come from the same builders the game places. Dev hook:
// window.__akashic (ids, select, setView).

import * as THREE from 'three'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import { isMesh, meshBounds, WORLD_ASSETS } from './assets.ts'
import { CONFIG } from './config.ts'
import { applyPose, attachCigarette, buildFigure } from './figure.ts'
import { OUTFIT_IDS, OUTFITS } from './outfits.ts'
import { samplePose } from './poses.ts'
import { setSnapResolution } from './ps1.ts'
import { mulberry32 } from './rng.ts'
import { buildShadowmanFigure, makeSilhouetteTexture } from './shadowmen.ts'
import { buildTruckMesh } from './truck.ts'
import type { AkashicAsset } from './assets.ts'
import type { OutfitId } from './outfits.ts'

// The dev hook on window.__akashic.
export interface AkashicHook {
  ids: string[]
  select(id: string): void
  setView(azimuth: number, elevation: number, distance?: number): void
  readonly current: string | undefined
}

declare global {
  interface Window {
    __akashic?: AkashicHook
  }
}

function sampleFigure(outfitId: OutfitId): THREE.Group {
  const figure = buildFigure(outfitId)
  applyPose(figure, samplePose('stand'))
  // Marx smokes; freeze his cigarette mid-drag with smoke in the air.
  if (outfitId === 'marx') attachCigarette(figure).update(0.4)
  return figure.group
}

function sampleShadowman(): THREE.Group {
  const height = 2.8
  const figure = buildShadowmanFigure(
    makeSilhouetteTexture(mulberry32(0xd06)),
    height
  )
  figure.position.y = height / 2
  const group = new THREE.Group()
  group.add(figure)
  return group
}

const ASSETS: AkashicAsset[] = [
  { id: 'truck', label: "Matthew Marx's white Chevy", build: buildTruckMesh },
  ...OUTFIT_IDS.map((id) => ({
    id: `figure-${id}`,
    label: `Figure: ${OUTFITS[id].label}`,
    build: () => sampleFigure(id),
  })),
  ...WORLD_ASSETS,
  { id: 'shadowman', label: 'Shadowman (parked)', build: sampleShadowman },
]

// --- Scene ---------------------------------------------------------------

// akashic.html must carry every element this page wires up.
function requireElement<T extends Element>(selector: string): T {
  const el = document.querySelector<T>(selector)
  if (!el) throw new Error(`Akashic page is missing "${selector}"`)
  return el
}

const canvas = requireElement<HTMLCanvasElement>('.ak-canvas')
const renderer = new THREE.WebGLRenderer({
  canvas,
  antialias: false,
  powerPreference: 'high-performance',
})
renderer.setPixelRatio(1)

const BACKGROUND = '#0b1018'
const scene = new THREE.Scene()
scene.background = new THREE.Color(BACKGROUND)
const fog = new THREE.FogExp2(BACKGROUND, CONFIG.render.fogDensity)

const camera = new THREE.PerspectiveCamera(50, 1, 0.01, 2000)
const controls = new OrbitControls(camera, canvas)
controls.enableDamping = true
controls.autoRotateSpeed = 1.5

// Game lights, from main.ts; the neutral rig is for reading true colors.
const gameLights = new THREE.Group()
gameLights.add(new THREE.HemisphereLight('#33507e', '#1a2013', 1.5))
const moonlight = new THREE.DirectionalLight('#9db4d8', 0.9)
moonlight.position.set(0.4, 1, -0.6)
gameLights.add(moonlight)
const neutralLights = new THREE.Group()
neutralLights.add(new THREE.HemisphereLight('#ffffff', '#3a3a3a', 2.4))
const key = new THREE.DirectionalLight('#ffffff', 1.4)
key.position.set(0.6, 1, 0.8)
neutralLights.add(key)
scene.add(gameLights, neutralLights)

// A lamp that rides the camera, so dark assets read under the game lights
// too. It lights whatever side faces the viewer; turn it off to see the
// asset exactly as a raid does.
const lamp = new THREE.DirectionalLight('#fff4e0', 0.9)
lamp.position.set(0, 0, 0)
lamp.target.position.set(0, 0, -1)
camera.add(lamp, lamp.target)
scene.add(camera)

// Scale aids: 1 m grid, dark ground, a 1.8 m person-height box.
const ground = new THREE.Mesh(
  new THREE.PlaneGeometry(200, 200).rotateX(-Math.PI / 2),
  new THREE.MeshLambertMaterial({ color: '#1a2013' })
)
ground.position.y = -0.01
const grid = new THREE.GridHelper(40, 40, '#3a4a5e', '#222c38')
const person = new THREE.Mesh(
  new THREE.BoxGeometry(0.5, 1.8, 0.3).translate(0, 0.9, 0),
  new THREE.MeshBasicMaterial({ color: '#f59e0b', wireframe: true })
)
scene.add(ground, grid, person)

// --- Toggles -------------------------------------------------------------

const TOGGLES = [
  { id: 'fog', label: 'Fog', key: 'KeyF', on: true },
  { id: 'ps1', label: 'PS1 snap', key: 'KeyP', on: true },
  { id: 'pixels', label: 'Downscale', key: 'KeyD', on: true },
  { id: 'gameLight', label: 'Game light', key: 'KeyL', on: true },
  { id: 'lamp', label: 'Lamp', key: 'KeyK', on: true },
  { id: 'wireframe', label: 'Wireframe', key: 'KeyW', on: false },
  { id: 'rotate', label: 'Auto-rotate', key: 'KeyR', on: false },
  { id: 'person', label: '1.8 m figure', key: 'KeyH', on: true },
  { id: 'grid', label: 'Grid', key: 'KeyG', on: true },
]
const state = Object.fromEntries(TOGGLES.map((t) => [t.id, t.on]))
const toggleInputs: Record<string, HTMLInputElement> = {}

const togglesEl = requireElement<HTMLElement>('.ak-toggles')
for (const t of TOGGLES) {
  const label = document.createElement('label')
  const input = document.createElement('input')
  input.type = 'checkbox'
  input.name = t.id
  input.checked = t.on
  input.addEventListener('change', () => setToggle(t.id, input.checked))
  label.append(input, ` ${t.label} [${t.key.slice(3)}]`)
  togglesEl.append(label)
  toggleInputs[t.id] = input
}

function setToggle(id: string, on: boolean): void {
  state[id] = on
  toggleInputs[id].checked = on
  applyToggles()
}

function applyToggles(): void {
  scene.fog = state.fog ? fog : null
  gameLights.visible = state.gameLight
  neutralLights.visible = !state.gameLight
  lamp.visible = state.lamp
  controls.autoRotate = state.rotate
  person.visible = state.person
  grid.visible = state.grid
  ground.visible = state.grid
  if (current) setWireframe(current.object, state.wireframe)
  resize()
}

// Meshes, sprites, lines and points carry a material and a geometry, but
// Object3D declares neither; these narrow by the property being present.
function hasMaterial(
  o: THREE.Object3D
): o is THREE.Object3D & { material: THREE.Material | THREE.Material[] } {
  return 'material' in o
}

function hasGeometry(
  o: THREE.Object3D
): o is THREE.Object3D & { geometry: THREE.BufferGeometry | undefined } {
  return 'geometry' in o
}

// Material declares no map; the Mesh*Material and SpriteMaterial types do.
function hasMap(
  m: THREE.Material
): m is THREE.Material & { map: THREE.Texture | null } {
  return 'map' in m
}

// A mesh may carry one material or an array (one per geometry group).
function materialsOf(o: THREE.Object3D): THREE.Material[] {
  if (!hasMaterial(o) || !o.material) return []
  return Array.isArray(o.material) ? o.material : [o.material]
}

function setWireframe(object: THREE.Object3D, on: boolean): void {
  object.traverse((o) => {
    if (!isMesh(o)) return
    for (const m of materialsOf(o)) if ('wireframe' in m) m.wireframe = on
  })
}

// --- Asset selection -----------------------------------------------------

const select = requireElement<HTMLSelectElement>('.ak-panel select')
for (const asset of ASSETS) select.add(new Option(asset.label, asset.id))
select.addEventListener('change', () => selectAsset(select.value))
for (const btn of document.querySelectorAll<HTMLElement>('[data-step]')) {
  btn.addEventListener('click', () => step(Number(btn.dataset.step)))
}
const statsEl = requireElement<HTMLElement>('.ak-stats')

interface Current {
  asset: AkashicAsset
  object: THREE.Object3D
}

let current: Current | null = null

function dispose(object: THREE.Object3D): void {
  object.traverse((o) => {
    if (hasGeometry(o)) o.geometry?.dispose()
    for (const m of materialsOf(o)) {
      if (hasMap(m)) m.map?.dispose()
      m.dispose()
    }
  })
}

function triangleCount(object: THREE.Object3D): number {
  let n = 0
  object.traverse((o) => {
    if (!isMesh(o)) return
    const g = o.geometry
    const tris = (g.index ? g.index.count : g.attributes.position.count) / 3
    n += tris * ('isInstancedMesh' in o && o.isInstancedMesh ? o.count : 1)
  })
  return n
}

function selectAsset(id: string): void {
  const asset = ASSETS.find((a) => a.id === id) || ASSETS[0]
  if (current) {
    scene.remove(current.object)
    dispose(current.object)
  }
  const object = asset.build()
  scene.add(object)
  current = { asset, object }
  setWireframe(object, state.wireframe)

  const box = meshBounds(object)
  const size = box.getSize(new THREE.Vector3())
  const center = box.getCenter(new THREE.Vector3())
  // Far side from the default camera, so perspective does not inflate it.
  person.position.set(box.min.x - 0.6, 0, center.z)

  // Frame the bounding sphere, three-quarter view from the front.
  const radius = Math.max(size.length() / 2, 0.02)
  const dist =
    (radius / Math.sin(THREE.MathUtils.degToRad(camera.fov / 2))) * 1.1
  controls.target.copy(center)
  controls.minDistance = radius * 0.5
  controls.maxDistance = dist * 6
  setView(35, 20, dist)

  select.value = asset.id
  if (location.hash.slice(1) !== asset.id) {
    history.replaceState(null, '', `#${asset.id}`)
  }
  const m = (v: number): string => v.toFixed(2)
  statsEl.textContent =
    `${asset.id}\n` +
    `${triangleCount(object)} tris\n` +
    `${m(size.x)} × ${m(size.y)} × ${m(size.z)} m (x × y × z)`
}

function step(delta: number): void {
  const i = ASSETS.findIndex((a) => a.id === current?.asset.id)
  const next = (i + delta + ASSETS.length) % ASSETS.length
  selectAsset(ASSETS[next].id)
}

// Azimuth 0 looks at the asset's front (+Z); degrees, elevation above the
// ground plane. Distance defaults to the current one.
function setView(azimuth: number, elevation: number, distance?: number): void {
  const r = distance ?? camera.position.distanceTo(controls.target)
  const az = THREE.MathUtils.degToRad(azimuth)
  const el = THREE.MathUtils.degToRad(elevation)
  camera.position.set(
    controls.target.x + r * Math.cos(el) * Math.sin(az),
    controls.target.y + r * Math.sin(el),
    controls.target.z + r * Math.cos(el) * Math.cos(az)
  )
  camera.lookAt(controls.target)
  controls.update()
}

// --- Input, resize, loop -------------------------------------------------

document.addEventListener('keydown', (e) => {
  if (e.target instanceof HTMLSelectElement) return
  if (e.code === 'ArrowRight' || e.code === 'BracketRight') step(1)
  else if (e.code === 'ArrowLeft' || e.code === 'BracketLeft') step(-1)
  else {
    const t = TOGGLES.find((t) => t.key === e.code)
    if (t) setToggle(t.id, !state[t.id])
  }
})
window.addEventListener('hashchange', () => {
  if (location.hash.slice(1) !== current?.asset.id) {
    selectAsset(location.hash.slice(1))
  }
})

function resize(): void {
  const w = window.innerWidth
  const h = window.innerHeight
  const downscale = state.pixels ? CONFIG.render.downscale : 1
  const iw = Math.max(2, Math.floor(w / downscale))
  const ih = Math.max(2, Math.floor(h / downscale))
  renderer.setSize(iw, ih, false)
  camera.aspect = w / h
  camera.updateProjectionMatrix()
  // ps1.ts snaps to half the size it is given; a huge grid means no wobble.
  if (state.ps1) setSnapResolution(iw, ih)
  else setSnapResolution(1e6, 1e6)
}
window.addEventListener('resize', resize)

selectAsset(location.hash.slice(1))
applyToggles()

renderer.setAnimationLoop(() => {
  controls.update()
  renderer.render(scene, camera)
})

window.__akashic = {
  ids: ASSETS.map((a) => a.id),
  select: selectAsset,
  setView,
  get current() {
    return current?.asset.id
  },
}
