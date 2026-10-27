import * as THREE from 'three'
import {
  artTexture,
  castShadows,
  lambert,
  makeGlowSprite,
  makeGlowTexture,
  memo,
  mergeStatic,
} from './assetkit.ts'
import { canvas } from './canvas.ts'

// A portal phone, the payphone fast travel goes to (citgos.ts): on Castle
// Entropy's rim (castleyard.ts payphoneSpot), by every Citgo's door
// (spawnlot.ts placeCitgoPhones) and at the drive-in (driveinsite.ts). A
// steel post and a stainless half-booth on it, the phone's grey body
// with its keypad and coin slot, the handset in its cradle on a coiled
// cord, a hood over it all with a lit PORTAL PHONE panel, and the hood's
// light glowing so it can be found from across a lot. Origin on the
// ground under the post, its face toward +x.

// The panel over the hood, painted as the trade dress was, not copy.
const signArt = memo(() => {
  const art = canvas([256, 64], '#1d4f9c')
  const { ctx, w, h } = art
  ctx.fillStyle = '#e8eef8'
  ctx.fillRect(4, 4, w - 8, 3)
  ctx.fillRect(4, h - 7, w - 8, 3)
  ctx.font = 'bold 25px Helvetica, Arial, sans-serif'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText('PORTAL PHONE', w / 2, h / 2 + 2)
  return artTexture(art)
})

// The phone's face: the keypad, the coin slot, the return chute and the
// instruction card, gone grubby.
const faceArt = memo(() => {
  const art = canvas([64, 128], '#8f949a')
  const { ctx } = art
  ctx.fillStyle = '#d9d2bc'
  ctx.fillRect(10, 8, 44, 26)
  ctx.fillStyle = '#4a4a4a'
  for (let i = 0; i < 4; i++) ctx.fillRect(14, 12 + i * 5, 36, 1)
  ctx.fillStyle = '#2a2c30'
  ctx.fillRect(48, 40, 8, 3)
  for (let r = 0; r < 4; r++) {
    for (let c = 0; c < 3; c++) {
      ctx.fillStyle = '#c9ccd0'
      ctx.fillRect(14 + c * 12, 48 + r * 12, 9, 9)
      ctx.fillStyle = '#3a3c40'
      ctx.fillRect(17 + c * 12, 51 + r * 12, 3, 3)
    }
  }
  ctx.fillStyle = '#1a1b1e'
  ctx.fillRect(22, 104, 20, 12)
  ctx.fillStyle = 'rgba(60, 40, 20, 0.35)'
  ctx.fillRect(0, 90, 64, 38)
  return artTexture(art)
})

export function buildPayphone(): THREE.Group {
  const group = new THREE.Group()
  group.name = 'payphone'
  const steel = lambert({ color: '#6c7076' })
  const stainless = lambert({ color: '#a4a8ad' })
  const dark = lambert({ color: '#1e1f22' })
  const body = lambert({ color: '#8a8f95' })
  const face = lambert({ map: faceArt('payphone-face') })
  const sign = new THREE.MeshBasicMaterial({ map: signArt('payphone-sign') })

  const add = (
    material: THREE.Material,
    size: [number, number, number],
    at: [number, number, number]
  ) => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(...size), material)
    mesh.position.set(...at)
    group.add(mesh)
    return mesh
  }

  // The post and its foot plate.
  add(steel, [0.12, 2.2, 0.12], [-0.22, 1.1, 0])
  add(dark, [0.36, 0.04, 0.36], [-0.22, 0.02, 0])
  // The half-booth: a back and two sides, the hood across their tops.
  add(stainless, [0.04, 1.05, 0.8], [-0.14, 1.45, 0])
  for (const z of [-0.4, 0.4])
    add(stainless, [0.42, 1.05, 0.03], [0.07, 1.45, z])
  add(steel, [0.5, 0.08, 0.86], [0.08, 2.0, 0])
  // The phone's body, its face out front.
  add(body, [0.16, 0.56, 0.28], [-0.04, 1.42, 0.04])
  const plate = new THREE.Mesh(new THREE.PlaneGeometry(0.26, 0.52), face)
  plate.rotation.y = Math.PI / 2
  plate.position.set(0.041, 1.42, 0.04)
  group.add(plate)
  // The cradle and the handset hung in it, on the left.
  add(dark, [0.08, 0.1, 0.08], [0.0, 1.62, -0.15])
  add(dark, [0.07, 0.42, 0.07], [0.05, 1.42, -0.17])
  add(dark, [0.09, 0.09, 0.09], [0.07, 1.62, -0.17])
  add(dark, [0.09, 0.09, 0.09], [0.07, 1.22, -0.17])
  castShadows(group)
  mergeStatic(group)

  // The cord: a coil from the handset's foot sagging to the body's.
  const points: THREE.Vector3[] = []
  for (let i = 0; i <= 40; i++) {
    const u = i / 40
    const turn = u * Math.PI * 2 * 9
    points.push(
      new THREE.Vector3(
        0.06 + Math.cos(turn) * 0.015,
        1.18 - Math.sin(u * Math.PI) * 0.22,
        -0.17 + u * 0.16 + Math.sin(turn) * 0.015
      )
    )
  }
  const cord = new THREE.Mesh(
    new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points), 80, 0.006, 3),
    dark
  )
  group.add(cord)

  // The lit panel along the hood's front, and the light under it.
  const panel = new THREE.Mesh(new THREE.PlaneGeometry(0.8, 0.2), sign)
  panel.rotation.y = Math.PI / 2
  panel.position.set(0.335, 2.15, 0)
  group.add(panel)
  add(steel, [0.04, 0.24, 0.84], [0.31, 2.15, 0])
  const tube = new THREE.Mesh(
    new THREE.BoxGeometry(0.04, 0.02, 0.6),
    new THREE.MeshBasicMaterial({ color: '#eef4ff' })
  )
  tube.position.set(0.18, 1.955, 0)
  group.add(tube)
  const glow = makeGlowSprite(makeGlowTexture('rgba(200, 220, 255, 0.5)'), 2.6)
  glow.position.set(0.3, 1.8, 0)
  group.add(glow)
  return group
}
