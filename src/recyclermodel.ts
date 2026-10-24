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

// The recycling vending machine against every Citgo's storefront
// (CONFIG.recycler places it; the Recycling Center, sharedworld.ts rule
// 33): a reverse vending machine as the supermarkets had them, a tall
// off-white cabinet gone grubby, a lit green header with the chasing
// arrows, a little green display, the round hole the cans go in and the
// bottle chute under it, and the slip slot. Origin on the ground under
// its middle, its face toward +x.

export const RECYCLER = {
  depth: 0.7,
  width: 0.95,
  height: 1.85,
}

// The lit header, painted as the trade dress was, not copy.
const headerArt = memo(() => {
  const art = canvas([256, 64], '#1f7a3c')
  const { ctx, w, h } = art
  ctx.fillStyle = '#eaf6ec'
  ctx.fillRect(4, 4, w - 8, 3)
  ctx.fillRect(4, h - 7, w - 8, 3)
  // The chasing arrows, three strokes round a triangle.
  ctx.strokeStyle = '#eaf6ec'
  ctx.lineWidth = 4
  const [cx, cy, r] = [34, h / 2 + 1, 15]
  for (let i = 0; i < 3; i++) {
    const a = -Math.PI / 2 + (i * Math.PI * 2) / 3
    const b = a + (Math.PI * 2) / 3 - 0.45
    ctx.beginPath()
    ctx.moveTo(cx + Math.cos(a + 0.2) * r, cy + Math.sin(a + 0.2) * r)
    ctx.lineTo(cx + Math.cos(b) * r, cy + Math.sin(b) * r)
    ctx.stroke()
    ctx.beginPath()
    ctx.arc(cx + Math.cos(b) * r, cy + Math.sin(b) * r, 4, 0, Math.PI * 2)
    ctx.fillStyle = '#eaf6ec'
    ctx.fill()
  }
  ctx.font = 'bold 30px Helvetica, Arial, sans-serif'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText('RECYCLE', w / 2 + 22, h / 2 + 2)
  return artTexture(art)
})

// The face: the display, the can hole and its ring, the bottle chute,
// the slip slot and the instruction card, with the grime low down where
// boots and bags knock it.
const faceArt = memo(() => {
  const art = canvas([128, 224], '#d6d3c8')
  const { ctx, w } = art
  // The display, a dim green readout.
  ctx.fillStyle = '#26292b'
  ctx.fillRect(22, 14, 84, 30)
  ctx.fillStyle = '#5fd17a'
  ctx.font = 'bold 11px Courier New, monospace'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText('INSERT EMPTIES', w / 2, 24)
  ctx.fillText('0.00', w / 2, 36)
  // The can hole: a rubber ring round a black throat.
  ctx.fillStyle = '#2b2b2b'
  ctx.beginPath()
  ctx.arc(w / 2, 82, 24, 0, Math.PI * 2)
  ctx.fill()
  ctx.fillStyle = '#060606'
  ctx.beginPath()
  ctx.arc(w / 2, 82, 17, 0, Math.PI * 2)
  ctx.fill()
  ctx.fillStyle = '#4a4a4a'
  ctx.font = 'bold 10px Helvetica, Arial, sans-serif'
  ctx.fillText('CANS', w / 2, 116)
  // The bottle chute, a slot wider than it is tall.
  ctx.fillStyle = '#2b2b2b'
  ctx.fillRect(28, 128, 72, 26)
  ctx.fillStyle = '#060606'
  ctx.fillRect(33, 133, 62, 16)
  ctx.fillStyle = '#4a4a4a'
  ctx.fillText('BOTTLES · PACKS', w / 2, 164)
  // The slip slot and the green button beside it.
  ctx.fillStyle = '#1a1a1a'
  ctx.fillRect(30, 178, 40, 4)
  ctx.fillStyle = '#2f9a4f'
  ctx.beginPath()
  ctx.arc(90, 180, 6, 0, Math.PI * 2)
  ctx.fill()
  ctx.fillStyle = 'rgba(70, 50, 30, 0.35)'
  ctx.fillRect(0, 192, w, 32)
  ctx.fillStyle = 'rgba(70, 50, 30, 0.18)'
  ctx.fillRect(8, 60, 10, 140)
  return artTexture(art)
})

export function buildRecycler(): THREE.Group {
  const group = new THREE.Group()
  group.name = 'recycler'
  const { depth, width, height } = RECYCLER
  const cabinet = lambert({ color: '#cfccc1' })
  const trim = lambert({ color: '#2f6e43' })
  const dark = lambert({ color: '#1c1d1f' })
  const face = lambert({ map: faceArt('recycler-face') })
  const header = new THREE.MeshBasicMaterial({
    map: headerArt('recycler-header'),
  })

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

  // The kick plate, the cabinet over it, the cap and a green stripe down
  // each front edge.
  const body = height - 0.38
  add(dark, [depth - 0.04, 0.1, width - 0.04], [0, 0.05, 0])
  add(cabinet, [depth, body - 0.1, width], [0, 0.1 + (body - 0.1) / 2, 0])
  add(dark, [depth + 0.02, 0.04, width + 0.02], [0, height - 0.02, 0])
  for (const z of [-1, 1])
    add(
      trim,
      [0.02, body - 0.1, 0.05],
      [depth / 2, 0.1 + (body - 0.1) / 2, z * (width / 2 - 0.025)]
    )
  // The face, its can ring standing proud of it.
  const plate = new THREE.Mesh(
    new THREE.PlaneGeometry(width - 0.14, body - 0.2),
    face
  )
  plate.rotation.y = Math.PI / 2
  plate.position.set(depth / 2 + 0.001, 0.15 + (body - 0.2) / 2, 0)
  group.add(plate)
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.11, 0.022, 4, 12), dark)
  ring.rotation.y = Math.PI / 2
  ring.position.set(depth / 2 + 0.01, 0.15 + (body - 0.2) * (1 - 82 / 224), 0)
  group.add(ring)
  // The header box over the cabinet, lit from inside.
  add(trim, [depth, 0.34, width], [0, body + 0.17, 0])
  castShadows(group)
  mergeStatic(group)

  const sign = new THREE.Mesh(
    new THREE.PlaneGeometry(width - 0.06, 0.26),
    header
  )
  sign.rotation.y = Math.PI / 2
  sign.position.set(depth / 2 + 0.002, body + 0.17, 0)
  group.add(sign)
  const glow = makeGlowSprite(makeGlowTexture('rgba(150, 240, 170, 0.4)'), 2.2)
  glow.position.set(depth / 2 + 0.25, body + 0.1, 0)
  group.add(glow)
  return group
}
