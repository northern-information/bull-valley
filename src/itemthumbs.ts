// The items as the pack grid, its hover card and the hotbar show them: one
// plain renderer of its own (no PS1 downscale, antialiased) off screen,
// which draws each item once into a still icon and spins the hovered one on
// the card. Each model is fitted to a unit cell.

import * as THREE from 'three'
import { buildPickup, meshBounds } from './assets.ts'
import { drinkFitHeight } from './drinks.ts'
import { isDrink } from './items.ts'

// The icon's pixel size: twice the 50px cell, so it stays sharp on a dense
// screen. The card's turntable is drawn at its canvas's own size.
const ICON_PX = 100
const SPIN_PER_SECOND = 0.9
const REST_YAW = 0.45
const TILT = 0.3

export interface ItemThumbs {
  // A data URL of the item at rest, drawn once and kept.
  icon(kind: string): string
  // Spins the item on the canvas until stop() or the next spin().
  spin(canvas: HTMLCanvasElement, kind: string): void
  stop(): void
}

function buildModel(kind: string): THREE.Object3D {
  return buildPickup(kind, 0x5ac, { glow: false })
}

// A model scaled to a unit cell and centered on its own mesh bounds, inside
// a spinner (yaw and tilt). Drinks share one scale per family (cans,
// bottles), so sizes stay true within it.
function buildSpinner(kind: string): THREE.Group {
  const model = buildModel(kind)
  const box = meshBounds(model)
  const size = box.getSize(new THREE.Vector3())
  const center = box.getCenter(new THREE.Vector3())
  const fit = isDrink(kind)
    ? drinkFitHeight(kind)
    : Math.max(size.x, size.y, size.z, 1e-3)
  const scale = 1 / fit
  model.scale.setScalar(scale)
  model.position.copy(center).multiplyScalar(-scale)
  const spinner = new THREE.Group()
  spinner.rotation.set(TILT, REST_YAW, 0, 'YXZ')
  spinner.add(model)
  return spinner
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

  function spinnerFor(kind: string): THREE.Group {
    let spinner = spinners.get(kind)
    if (!spinner) {
      spinner = buildSpinner(kind)
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

  function spin(canvas: HTMLCanvasElement, kind: string): void {
    stop()
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    const spinner = spinnerFor(kind)
    spinner.rotation.y = REST_YAW
    let last = performance.now()
    const frame = () => {
      const now = performance.now()
      spinner.rotation.y +=
        Math.min(0.05, (now - last) / 1000) * SPIN_PER_SECOND
      last = now
      draw(kind, canvas.width, canvas.height)
      ctx.clearRect(0, 0, canvas.width, canvas.height)
      ctx.drawImage(gl().domElement, 0, 0)
    }
    frame()
    gl().setAnimationLoop(frame)
  }

  return { icon, spin, stop }
}
