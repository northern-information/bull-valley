// The items as the pack grid, its hover card and the hotbar show them: one
// plain renderer of its own (no PS1 downscale, antialiased) off screen,
// which draws each item once into a still icon and spins the hovered one on
// the card. Each model is fitted to a unit cell. The Book of Shadows spins
// its portraits on the same renderer (spinModel): any model, playing what
// moves on its own, and drawn as a dark shape until its entry is found.

import * as THREE from 'three'
import { buildPickup, isMesh, meshBounds, motionOf } from './assets.ts'
import { drinkFitHeight } from './drinks.ts'
import { isDrink } from './items.ts'

// The icon's pixel size: twice the 50px cell, so it stays sharp on a dense
// screen. The card's turntable is drawn at its canvas's own size.
const ICON_PX = 100
const SPIN_PER_SECOND = 0.9
const REST_YAW = 0.45
const TILT = 0.3
// An entry not yet found: its shape, unlit, a little lighter than the
// pane behind it.
const DARK = new THREE.MeshBasicMaterial({ color: '#26262b' })

export interface ItemThumbs {
  // A data URL of the item at rest, drawn once and kept.
  icon(kind: string): string
  // Spins the item on the canvas until stop() or the next spin().
  spin(canvas: HTMLCanvasElement, kind: string): void
  // Spins any model on the canvas, built once by `build` and kept under
  // `key`; `dark` draws it as a shape alone.
  spinModel(
    canvas: HTMLCanvasElement,
    key: string,
    build: () => THREE.Object3D,
    dark: boolean,
    // The item it is, for an item's fit (drinks share one per family).
    fitAs?: string
  ): void
  stop(): void
}

function buildModel(kind: string): THREE.Object3D {
  return buildPickup(kind, 0x5ac, { glow: false })
}

// A model scaled to a unit cell and centered on its own mesh bounds, inside
// a spinner (yaw and tilt). Drinks share one scale per family (cans,
// bottles), so sizes stay true within it.
function buildSpinner(
  kind: string,
  model: THREE.Object3D = buildModel(kind),
  fitAs = kind
): THREE.Group {
  const box = meshBounds(model)
  const size = box.getSize(new THREE.Vector3())
  const center = box.getCenter(new THREE.Vector3())
  const fit = isDrink(fitAs)
    ? drinkFitHeight(fitAs)
    : Math.max(size.x, size.y, size.z, 1e-3)
  const scale = 1 / fit
  model.scale.setScalar(scale)
  model.position.copy(center).multiplyScalar(-scale)
  const spinner = new THREE.Group()
  spinner.rotation.set(TILT, REST_YAW, 0, 'YXZ')
  spinner.add(model)
  return spinner
}

// Whether a mesh is light rather than matter: fire, a glow, rain, a beam,
// all drawn additive. A card cut out by its texture (a shadowman) is
// matter, and keeps its outline in the dark.
function isLight(mesh: THREE.Mesh): boolean {
  const all = Array.isArray(mesh.material) ? mesh.material : [mesh.material]
  return all.some((m) => m.blending === THREE.AdditiveBlending)
}

// The dark a mesh is drawn in: DARK, cut to its texture's outline when it
// has one.
function darkFor(mesh: THREE.Mesh): THREE.Material {
  const first = Array.isArray(mesh.material) ? mesh.material[0] : mesh.material
  const map = (first as { map?: THREE.Texture | null }).map ?? null
  if (!first.transparent || !map) return DARK
  return new THREE.MeshBasicMaterial({
    color: DARK.color,
    map,
    transparent: true,
    alphaTest: 0.1,
    side: first.side,
  })
}

// Every solid mesh in `model` drawn dark and nothing else shown (glow
// sprites, flames, sparks, rain), or all of it back as it was built.
function setDark(model: THREE.Object3D, dark: boolean): void {
  model.traverse((o) => {
    const kept = o.userData as {
      litMaterial?: THREE.Material | THREE.Material[]
      darkMaterial?: THREE.Material
      shown?: boolean
    }
    if (isMesh(o) && (kept.litMaterial || !isLight(o))) {
      if (dark && !kept.litMaterial) {
        kept.litMaterial = o.material
        kept.darkMaterial ??= darkFor(o)
        o.material = kept.darkMaterial
      } else if (!dark && kept.litMaterial) {
        o.material = kept.litMaterial
        delete kept.litMaterial
      }
    } else if (
      isMesh(o) ||
      'isSprite' in o ||
      'isPoints' in o ||
      'isLine' in o
    ) {
      if (dark && kept.shown === undefined) {
        kept.shown = o.visible
        o.visible = false
      } else if (!dark && kept.shown !== undefined) {
        o.visible = kept.shown
        delete kept.shown
      }
    }
  })
}

export function createItemThumbs(): ItemThumbs {
  // Made on first use: the pack may never open, and the hotbar may be empty.
  let renderer: THREE.WebGLRenderer | null = null
  const scene = new THREE.Scene()
  scene.add(new THREE.HemisphereLight('#ffffff', '#3a3a3a', 2.2))
  const key = new THREE.DirectionalLight('#ffffff', 1.5)
  key.position.set(0.6, 1, 0.9)
  scene.add(key)
  // A unit cell fills about four fifths of the frame.
  const camera = new THREE.PerspectiveCamera(30, 1, 0.05, 50)
  camera.position.set(0, 0.35, 2.3)
  camera.lookAt(0, 0, 0)

  const spinners = new Map<string, THREE.Group>()
  const icons = new Map<string, string>()

  function gl(): THREE.WebGLRenderer {
    if (!renderer) {
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true })
      renderer.setClearColor(0x000000, 0)
    }
    return renderer
  }

  function spinnerFor(
    kind: string,
    build?: () => THREE.Object3D,
    fitAs?: string
  ): THREE.Group {
    let spinner = spinners.get(kind)
    if (!spinner) {
      spinner = buildSpinner(kind, build?.(), fitAs)
      spinners.set(kind, spinner)
    }
    return spinner
  }

  // Draws one item alone at the given pixel size.
  function draw(kind: string, width: number, height: number): void {
    const r = gl()
    r.setSize(width, height, false)
    camera.aspect = width / height
    camera.updateProjectionMatrix()
    const spinner = spinnerFor(kind)
    scene.add(spinner)
    r.render(scene, camera)
    scene.remove(spinner)
  }

  function icon(kind: string): string {
    let url = icons.get(kind)
    if (url === undefined) {
      const spinner = spinnerFor(kind)
      const yaw = spinner.rotation.y
      spinner.rotation.y = REST_YAW
      draw(kind, ICON_PX, ICON_PX)
      // Read in the same task as the draw, before the buffer is cleared.
      url = gl().domElement.toDataURL()
      spinner.rotation.y = yaw
      icons.set(kind, url)
    }
    return url
  }

  function stop(): void {
    renderer?.setAnimationLoop(null)
  }

  // Turns the spinner on the canvas every frame, playing its model's own
  // motion on a clock of its own.
  function turn(
    canvas: HTMLCanvasElement,
    key: string,
    spinner: THREE.Group
  ): void {
    stop()
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    spinner.rotation.y = REST_YAW
    const motion = motionOf(spinner.children[0])
    const start = performance.now()
    let last = start
    const frame = () => {
      const now = performance.now()
      spinner.rotation.y +=
        Math.min(0.05, (now - last) / 1000) * SPIN_PER_SECOND
      last = now
      motion?.((now - start) / 1000)
      draw(key, canvas.width, canvas.height)
      ctx.clearRect(0, 0, canvas.width, canvas.height)
      ctx.drawImage(gl().domElement, 0, 0)
    }
    frame()
    gl().setAnimationLoop(frame)
  }

  function spin(canvas: HTMLCanvasElement, kind: string): void {
    turn(canvas, kind, spinnerFor(kind))
  }

  function spinModel(
    canvas: HTMLCanvasElement,
    key: string,
    build: () => THREE.Object3D,
    dark: boolean,
    fitAs?: string
  ): void {
    const spinner = spinnerFor(key, build, fitAs)
    setDark(spinner, dark)
    turn(canvas, key, spinner)
  }

  return { icon, spin, spinModel, stop }
}
