// The firefly pond as Bull Valley Dial-Up draws it (dialfish.ts, through
// dial3d.ts): a small PS1 scene of its own, the raider in their own
// character and guitar finish (and what the account wears over it) on the
// near shore with the rod they fish with, the black water past them, reeds
// and a treeline in the fog, the fireflies over all of it, and the bobber
// on its line out on the water: still while it waits, under and pulled
// toward the arrow's side while a fish fights, gone with no line out. Not
// the valley's pond, which the phone never loads: the same things, closer.

import * as THREE from 'three'
import { lambert } from './assetkit.ts'
import { applyPose, attachCosmetics, buildFigure, gripWith } from './figure.ts'
import { finishById } from './finishes.ts'
import { buildFireflies } from './fireflyrig.ts'
import { buildBobber, buildFishingRod } from './fishmodels.ts'
import { castPose } from './held.ts'
import { samplePose } from './poses.ts'
import { createPS1Renderer } from './ps1.ts'
import type { AvatarLook } from './avatarview.ts'
import type { ArrowDir } from './fishing.ts'

// The canvas's pixel size; styles.css sets its CSS size to match.
export const POND_PX = { width: 320, height: 200 }

// The scene, in metres: the raider at the origin facing -Z, the water's
// middle ahead and its radius, the bobber's cast, the rod's tilt up off
// level (radians), and where its grip sits along it (fishmodels.ts ROD).
const POND = {
  water: { z: -9, radius: 7.5 },
  cast: { x: -0.6, z: -6.5 },
  tilt: 0.65,
  grip: -0.57,
  half: 0.9,
}
// How high over the straight line the bobber's flight rises, metres.
const CAST_ARC = 1.2
// How much thicker than life the rod is drawn.
const ROD_THICKEN = 4
// How the bobber bobs, plunges on a bite and swings to a fish's pull.
const BOB = { metres: 0.012, hz: 0.7, plunge: 0.04, hz2: 5, pull: 0.5 }

// What the line is doing: none out, waiting on the bite, or a fish on it,
// pulling toward the arrow showing (null between arrows).
export type PondLine =
  | { out: false }
  | { out: true; bite: false }
  | { out: true; bite: true; pull: ArrowDir | null }

export interface PondView {
  // Draws the raider at the pond, with `rod` (null for none in the pack),
  // until stop(); a second show() redresses them.
  show(look: AvatarLook, rod: string | null): void
  setLine(line: PondLine): void
  stop(): void
}

export function createPondView(canvas: HTMLCanvasElement): PondView {
  let renderer: THREE.WebGLRenderer | null = null
  let stopRunning: (() => void) | null = null
  let line: PondLine = { out: false }
  // When the line last went out, performance.now() seconds: the rod's cast
  // plays from then (held.ts castPose).
  let castAt = -Infinity

  function show(look: AvatarLook, rod: string | null): void {
    stop()
    if (!renderer) {
      renderer = createPS1Renderer(canvas)
      renderer.setSize(POND_PX.width, POND_PX.height, false)
    }
    const drawing = renderer
    const scene = new THREE.Scene()
    const night = new THREE.Color('#06080d')
    scene.background = night
    scene.fog = new THREE.Fog(night, 6, 26)
    scene.add(new THREE.HemisphereLight('#7f8aa6', '#1a1d14', 1.4))
    const moon = new THREE.DirectionalLight('#c9d4ff', 1.1)
    moon.position.set(-3, 6, -2)
    scene.add(moon)
    // A warm fill from behind the camera, as off the Citgo's lot, so the
    // raider reads as themselves and not a shadow on the water.
    const fill = new THREE.DirectionalLight('#ffe2b8', 1.6)
    fill.position.set(2.5, 3, 4)
    scene.add(fill)
    const owned: THREE.BufferGeometry[] = []
    const keep = <T extends THREE.BufferGeometry>(g: T): T => {
      owned.push(g)
      return g
    }

    const grass = new THREE.Mesh(
      keep(new THREE.PlaneGeometry(60, 60)),
      lambert({ color: '#1d2a17' })
    )
    grass.rotation.x = -Math.PI / 2
    scene.add(grass)
    const { water } = POND
    const shore = new THREE.Mesh(
      keep(new THREE.CircleGeometry(water.radius + 0.6, 24)),
      lambert({ color: '#2b2418' })
    )
    shore.rotation.x = -Math.PI / 2
    shore.position.set(0, 0.005, water.z)
    scene.add(shore)
    const pond = new THREE.Mesh(
      keep(new THREE.CircleGeometry(water.radius, 24)),
      lambert({ color: '#0d1c2a', emissive: '#050b12' })
    )
    pond.rotation.x = -Math.PI / 2
    pond.position.set(0, 0.01, water.z)
    scene.add(pond)
    // Reeds round the shore, and the treeline past the water.
    const reed = lambert({ color: '#3b4a22' })
    const reedGeometry = keep(new THREE.BoxGeometry(0.03, 0.9, 0.03))
    for (let i = 0; i < 40; i++) {
      const a = (i / 40) * Math.PI * 2 + Math.sin(i * 7.3) * 0.1
      if (Math.abs(Math.sin(a)) < 0.35 && Math.cos(a) > 0) continue
      const r = water.radius + 0.2 + Math.abs(Math.sin(i * 3.1)) * 0.4
      const stem = new THREE.Mesh(reedGeometry, reed)
      stem.position.set(Math.sin(a) * r, 0.45, water.z + Math.cos(a) * r)
      stem.rotation.z = Math.sin(i * 1.7) * 0.15
      scene.add(stem)
    }
    const pine = lambert({ color: '#0f1a12' })
    const pineGeometry = keep(new THREE.ConeGeometry(1.4, 5, 6))
    for (let i = 0; i < 11; i++) {
      const tree = new THREE.Mesh(pineGeometry, pine)
      const x = -14 + i * 2.8 + Math.sin(i * 2.3) * 0.8
      tree.position.set(x, 2.5, water.z - water.radius - 3 - (i % 3))
      tree.scale.setScalar(0.8 + ((i * 37) % 10) / 20)
      scene.add(tree)
    }
    const fireflies = buildFireflies(
      { x: 0, z: water.z + 2 },
      water.radius + 3,
      () => 0,
      120,
      0x0f1e
    )
    scene.add(fireflies.group)

    // The raider on the near shore, looking out over the water, rod up.
    const figure = buildFigure(look.outfit, {
      guitarFinish: finishById(look.finish).color,
    })
    applyPose(figure, samplePose('wield'))
    figure.group.rotation.y = Math.PI
    const worn = attachCosmetics(figure, look.cosmetics)
    scene.add(figure.group)
    scene.updateMatrixWorld(true)
    const tip = new THREE.Vector3()
    const fist = new THREE.Vector3()
    const dir = new THREE.Vector3()
    let held: THREE.Object3D | null = null
    // The rod tipped `swing` past its rest (held.ts castPose), its grip in
    // the fist, and its tip.
    const aim = (rod: THREE.Object3D, swing: number) => {
      const tilt = POND.tilt + swing
      dir.set(0, Math.sin(tilt), -Math.cos(tilt))
      rod.position.copy(fist).addScaledVector(dir, -POND.grip)
      rod.quaternion.setFromUnitVectors(new THREE.Vector3(1, 0, 0), dir)
      tip.copy(rod.position).addScaledVector(dir, POND.half)
    }
    if (rod) {
      // The rod in the scene's own frame: its grip in the right fist, the
      // arm the pose reaches out over the water, pointing out and up. A bat
      // or an axe that hand carries is put away for it.
      const lying = buildFishingRod(rod, { glow: false })
      held = lying.children[0]
      if (figure.held) figure.held.visible = false
      figure.fists.R.getWorldPosition(fist)
      aim(held, 0)
      // Thicker than life, or the phone's few pixels lose the blank.
      held.scale.set(1, ROD_THICKEN, ROD_THICKEN)
      scene.add(held)
      gripWith(figure, 'R', true)
    }

    // The bobber on the water, and its line from the rod's tip.
    const bobber = buildBobber()
    const cast = new THREE.Vector3(POND.cast.x, 0.01, POND.cast.z)
    bobber.position.copy(cast)
    scene.add(bobber)
    const linePoints = new Float32Array(3 * 3)
    const lineGeometry = keep(new THREE.BufferGeometry())
    lineGeometry.setAttribute(
      'position',
      new THREE.BufferAttribute(linePoints, 3)
    )
    const fishingLine = new THREE.Line(
      lineGeometry,
      new THREE.LineBasicMaterial({ color: '#c8d6c0' })
    )
    fishingLine.frustumCulled = false
    scene.add(fishingLine)

    // Over the raider's right shoulder, out at the water.
    const camera = new THREE.PerspectiveCamera(
      50,
      POND_PX.width / POND_PX.height,
      0.05,
      60
    )
    camera.position.set(1.6, 2.1, 2.6)
    camera.lookAt(-0.4, 0.4, POND.cast.z)

    let pullX = 0
    drawing.setAnimationLoop(() => {
      const t = performance.now() / 1000
      fireflies.update(t)
      worn.update(t)
      const out = line.out && held !== null
      // The cast: the rod swings, and the bobber flies from the tip in an
      // arc to the water, the line trailing it straight.
      const swing = castPose(t - castAt)
      if (held) aim(held, swing.tilt)
      bobber.visible = out
      fishingLine.visible = out
      if (out && swing.fly < 1) {
        bobber.position.lerpVectors(tip, cast, swing.fly)
        bobber.position.y += Math.sin(swing.fly * Math.PI) * CAST_ARC
        const end = bobber.position
        linePoints.set([tip.x, tip.y, tip.z, end.x, end.y, end.z])
        linePoints.set([end.x, end.y, end.z], 6)
        lineGeometry.attributes.position.needsUpdate = true
      } else if (out) {
        const bite = line.out && line.bite
        const want =
          line.out && line.bite && line.pull
            ? (line.pull === 'left' ? -1 : 1) * BOB.pull
            : 0
        pullX += (want - pullX) * 0.2
        bobber.position.x = cast.x + pullX
        bobber.position.y = bite
          ? cast.y - BOB.plunge * (1 + Math.sin(t * Math.PI * 2 * BOB.hz2))
          : cast.y + Math.sin(t * Math.PI * 2 * BOB.hz) * BOB.metres
        // The line from the tip to the bobber, sagging a little between.
        const end = bobber.position
        const mid = tip.clone().lerp(end, 0.5)
        mid.y -= bite ? 0.05 : 0.35
        linePoints.set([tip.x, tip.y, tip.z, mid.x, mid.y, mid.z])
        linePoints.set([end.x, end.y + 0.03, end.z], 6)
        lineGeometry.attributes.position.needsUpdate = true
      }
      drawing.render(scene, camera)
    })
    stopRunning = () => {
      drawing.setAnimationLoop(null)
      worn.dispose()
      for (const g of owned) g.dispose()
    }
  }

  function stop(): void {
    stopRunning?.()
    stopRunning = null
  }

  return {
    show,
    setLine(next) {
      if (next.out && !line.out) castAt = performance.now() / 1000
      line = next
    },
    stop,
  }
}
