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
import { canvas, SANS, SERIF, text } from './canvas.ts'
import { CONFIG } from './config.ts'
import { buildJeep } from './jeep.ts'
import { mulberry32 } from './rng.ts'
import { buildTruckBody } from './truckbody.ts'
import type { CanvasArt } from './canvas.ts'
import type { VehicleKind } from './traffic.ts'

// The valley's traffic as seen (traffic.ts drives it, trafficrig.ts places
// it): Tyler's Jeep, the wreck's BMW whole, Marx's Chevy and a semi with
// its trailer, each in a paint dealt from its seed, a semi's trailer in a
// freight line's livery. No one is at the wheel. Every lamp is lit: the
// lenses and a glow each (the light they throw on the road is
// trafficrig.ts's, the beam that burns shadowmen traffic.ts's). Each faces
// +Z, origin at ground level under its middle (the tractor's, for a semi).

// The paints each kind comes in: the period's.
const PAINTS: Record<VehicleKind, readonly string[]> = {
  jeep: ['#a3161b', '#1d3b2a', '#e8e4d6', '#14161a', '#c9a227', '#2d4f7a'],
  bmw: ['#3b8a4a', '#8c1c22', '#d8d8d2', '#1c2d4a', '#3a3a3e', '#9a8a6a'],
  pickup: ['#c8ccd2', '#7a1d18', '#2a3f66', '#5d6a3e', '#b07a2a', '#1a1a1c'],
  semi: ['#b3121a', '#f2f2ee', '#1f3f7a', '#1d1d20', '#2f6a3a', '#d98a1c'],
}

// The freight lines on the trailers: made up, every one, but for the
// valley's own. Each paints its own livery (paintLivery).
interface Livery {
  name: string
  line: string
  body: string
  ink: string
  stripe: string
  font: string
  mark: 'arrow' | 'star' | 'ring' | 'leaf' | 'shield' | 'eye'
}
export const LIVERIES: readonly Livery[] = [
  {
    name: 'KISHWAUKEE',
    line: 'FREIGHT LINES',
    body: '#eeeee8',
    ink: '#b3121a',
    stripe: '#b3121a',
    font: SANS,
    mark: 'arrow',
  },
  {
    name: 'PRAIRIE STATE',
    line: 'EXPRESS · ROCKFORD',
    body: '#d9dde2',
    ink: '#1f3f7a',
    stripe: '#c9a227',
    font: SERIF,
    mark: 'star',
  },
  {
    name: 'FOX RIVER',
    line: 'CARTAGE CO.',
    body: '#2f5a3a',
    ink: '#f0ead6',
    stripe: '#d98a1c',
    font: SANS,
    mark: 'ring',
  },
  {
    name: 'HOLLOW OAK',
    line: 'DAIRY · MILK · BUTTER',
    body: '#f2f2ee',
    ink: '#3a5f2a',
    stripe: '#6a9ad0',
    font: SERIF,
    mark: 'leaf',
  },
  {
    name: 'ROUTE 120',
    line: 'TRANSFER & STORAGE',
    body: '#c9c3b3',
    ink: '#1d1d20',
    stripe: '#7a1d18',
    font: SANS,
    mark: 'shield',
  },
  {
    name: 'SCADUSCOPE',
    line: 'SUPPLY CO. · BULL VALLEY',
    body: '#1d1d20',
    ink: '#f0ead6',
    stripe: '#8a5ac9',
    font: SERIF,
    mark: 'eye',
  },
]

// A vehicle's looks from its seed: its paint and, for a semi, the
// trailer's livery.
export function lookOf(
  kind: VehicleKind,
  seed: number
): { paint: number; livery: number } {
  const rng = mulberry32(seed)
  return {
    paint: Math.floor(rng() * PAINTS[kind].length),
    livery: Math.floor(rng() * LIVERIES.length),
  }
}

// A trailer side's livery: the stripe, the mark and the name.
function paintLivery(index: string): CanvasArt {
  const l = LIVERIES[Number(index)]
  const art = canvas([512, 128], l.body)
  const { ctx, w, h } = art
  ctx.fillStyle = l.stripe
  ctx.fillRect(0, h - 22, w, 10)
  ctx.fillRect(0, 8, w, 4)
  // The mark, at the front end.
  const cx = 62
  const cy = 58
  ctx.fillStyle = l.ink
  ctx.strokeStyle = l.ink
  ctx.lineWidth = 6
  ctx.beginPath()
  switch (l.mark) {
    case 'arrow':
      ctx.moveTo(cx - 34, cy - 12)
      ctx.lineTo(cx + 6, cy - 12)
      ctx.lineTo(cx + 6, cy - 30)
      ctx.lineTo(cx + 38, cy)
      ctx.lineTo(cx + 6, cy + 30)
      ctx.lineTo(cx + 6, cy + 12)
      ctx.lineTo(cx - 34, cy + 12)
      ctx.fill()
      break
    case 'star':
      for (let i = 0; i < 10; i++) {
        const r = i % 2 ? 14 : 36
        const a = (i * Math.PI) / 5 - Math.PI / 2
        ctx.lineTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r)
      }
      ctx.fill()
      break
    case 'ring':
      ctx.arc(cx, cy, 32, 0, Math.PI * 2)
      ctx.stroke()
      text(ctx, 'FR', cx, cy + 2, 44, 30, l.font, l.ink)
      break
    case 'leaf':
      ctx.ellipse(cx, cy, 16, 36, 0.6, 0, Math.PI * 2)
      ctx.fill()
      break
    case 'shield':
      ctx.moveTo(cx - 30, cy - 34)
      ctx.lineTo(cx + 30, cy - 34)
      ctx.lineTo(cx + 30, cy + 6)
      ctx.quadraticCurveTo(cx + 30, cy + 26, cx, cy + 38)
      ctx.quadraticCurveTo(cx - 30, cy + 26, cx - 30, cy + 6)
      ctx.fill()
      text(ctx, '120', cx, cy - 2, 50, 26, SANS, l.body)
      break
    case 'eye':
      ctx.ellipse(cx, cy, 36, 20, 0, 0, Math.PI * 2)
      ctx.stroke()
      ctx.beginPath()
      ctx.arc(cx, cy, 10, 0, Math.PI * 2)
      ctx.fill()
      break
  }
  text(ctx, l.name, 300, 54, 360, 58, l.font, l.ink)
  text(ctx, l.line, 300, 94, 340, 20, l.font, l.ink)
  return art
}
const livery = memo(paintLivery)

// The lit lenses and glows, shared by every car.
const LENS = {
  head: () =>
    lambert({
      color: '#241a05',
      emissive: new THREE.Color('#fbe7a3'),
      emissiveIntensity: 1.6,
    }),
  tail: () =>
    lambert({
      color: '#240505',
      emissive: new THREE.Color('#ff2a1a'),
      emissiveIntensity: 1.4,
    }),
}
let lenses: { head: THREE.Material; tail: THREE.Material } | null = null

// A pair of headlights `across` either side at `nose`, and a pair of
// taillights at `tail`, `height` up, each a lit lens and a glow.
function addLamps(
  group: THREE.Object3D,
  across: number,
  nose: number,
  tail: number | null,
  height: number
): void {
  lenses ??= { head: LENS.head(), tail: LENS.tail() }
  const headGlow = makeGlowTexture('rgba(251, 231, 163, 0.8)')
  const tailGlow = makeGlowTexture('rgba(255, 42, 26, 0.7)')
  const lens = new THREE.BoxGeometry(0.24, 0.16, 0.04)
  for (const side of [1, -1]) {
    const head = new THREE.Mesh(lens, lenses.head)
    head.position.set(side * across, height, nose)
    const glow = makeGlowSprite(headGlow, 2.2)
    glow.position.set(side * across, height, nose + 0.08)
    group.add(head, glow)
    if (tail === null) continue
    const back = new THREE.Mesh(lens, lenses.tail)
    back.position.set(side * across, height, tail)
    const red = makeGlowSprite(tailGlow, 1.1)
    red.position.set(side * across, height, tail - 0.08)
    group.add(back, red)
  }
}

// --- The BMW --------------------------------------------------------------

// The wreck's car (wreck.ts) as it was before the tree: a boxy late-80s
// three-series, the kidney grille between four round lamps.
export function buildBmw(paint = '#3b8a4a'): THREE.Group {
  const length = 4.3
  const width = 1.65
  const wheel = 0.31
  const group = new THREE.Group()
  group.name = 'bmw'
  const body = lambert({ color: paint })
  const black = lambert({ color: '#141414' })
  const chrome = lambert({ color: '#9aa1a8' })
  const glass = lambert({ color: '#1b252e' })
  const box = (
    size: [number, number, number],
    at: [number, number, number],
    material: THREE.Material,
    pitch = 0
  ) => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(...size), material)
    mesh.position.set(...at)
    mesh.rotation.x = pitch
    group.add(mesh)
    return mesh
  }
  const back = -length / 2
  const nose = length / 2
  const sill = wheel * 0.9
  const waist = sill + 0.52
  const half = width / 2
  box([width, waist - sill, length], [0, (sill + waist) / 2, 0], body)
  // The greenhouse under its flat roof, the A-pillars raked back and the
  // C-pillars down to the trunk.
  const cabinFront = 0.7
  const cabinBack = -1.25
  const roof = waist + 0.55
  box(
    [width - 0.12, roof - waist, cabinFront - cabinBack - 0.25],
    [0, (waist + roof) / 2, (cabinFront + cabinBack) / 2 - 0.05],
    glass
  )
  box(
    [width - 0.1, 0.05, cabinFront - cabinBack - 0.55],
    [0, roof, (cabinFront + cabinBack) / 2 - 0.1],
    body
  )
  for (const x of [-1, 1]) {
    box(
      [0.07, 0.62, 0.07],
      [x * (half - 0.08), (waist + roof) / 2, cabinFront - 0.12],
      body,
      -0.5
    )
    box(
      [0.07, 0.6, 0.09],
      [x * (half - 0.08), (waist + roof) / 2, cabinBack + 0.1],
      body,
      0.45
    )
    box([0.03, 0.05, length - 0.2], [x * (half + 0.01), sill + 0.22, 0], black)
    box(
      [0.12, 0.08, 0.06],
      [x * (half + 0.05), waist + 0.12, cabinFront - 0.15],
      body
    )
  }
  box([width + 0.06, 0.12, 0.1], [0, sill + 0.08, back - 0.03], black)
  box([width + 0.06, 0.12, 0.1], [0, sill + 0.08, nose + 0.03], black)
  for (const x of [-0.09, 0.09]) {
    box([0.13, 0.17, 0.03], [x, waist - 0.12, nose + 0.01], chrome)
  }
  const tyre = new THREE.CylinderGeometry(wheel, wheel, 0.2, 10)
  tyre.rotateZ(Math.PI / 2)
  const hub = new THREE.CylinderGeometry(wheel * 0.55, wheel * 0.55, 0.21, 8)
  hub.rotateZ(Math.PI / 2)
  for (const z of [nose - 0.8, back + 0.78]) {
    for (const x of [-1, 1]) {
      const t = new THREE.Mesh(tyre, black)
      t.position.set(x * (half - 0.12), wheel, z)
      const h = new THREE.Mesh(hub, chrome)
      h.position.copy(t.position)
      group.add(t, h)
    }
  }
  return group
}

// --- The semi -------------------------------------------------------------

// A long-nosed conventional tractor with a sleeper, chrome stacks and
// tanks, and a dry van trailer (built apart, since it turns on its own).
export function buildTractor(paint = '#b3121a'): THREE.Group {
  const group = new THREE.Group()
  group.name = 'tractor'
  const body = lambert({ color: paint })
  const black = lambert({ color: '#151518' })
  const chrome = lambert({ color: '#a9b0b6' })
  const glass = lambert({ color: '#0e141d' })
  const box = (
    size: [number, number, number],
    at: [number, number, number],
    material: THREE.Material
  ) => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(...size), material)
    mesh.position.set(...at)
    group.add(mesh)
    return mesh
  }
  // The frame rails and the fifth wheel the trailer rides on.
  box([1.0, 0.3, 6.4], [0, 0.85, -0.1], black)
  box([1.3, 0.12, 1.1], [0, 1.08, -CONFIG.traffic.semi.kingpin], black)
  // The long hood, its grille and bumper, the fenders over the steer
  // wheels.
  box([1.5, 0.95, 2.1], [0, 1.55, 2.2], body)
  box([1.1, 0.9, 0.06], [0, 1.55, 3.27], chrome)
  box([2.4, 0.3, 0.2], [0, 0.75, 3.3], chrome)
  for (const side of [1, -1]) {
    box([0.45, 0.12, 1.3], [side * 0.98, 1.2, 2.4], body)
  }
  // The cab and the sleeper behind it, the windshield and side glass, the
  // visor and the clearance lamps along the roof.
  box([2.4, 1.6, 1.4], [0, 2.0, 0.45], body)
  box([2.4, 2.1, 1.5], [0, 2.25, -0.95], body)
  box([2.1, 0.6, 0.04], [0, 2.4, 1.16], glass)
  for (const side of [1, -1]) {
    box([0.04, 0.55, 0.9], [side * 1.21, 2.4, 0.5], glass)
    // The mirrors on their arms, the stacks behind the cab and the fuel
    // tank under each door.
    box([0.08, 0.45, 0.2], [side * 1.45, 2.3, 1.1], black)
    const stack = new THREE.Mesh(
      new THREE.CylinderGeometry(0.1, 0.1, 2.6, 6),
      chrome
    )
    stack.position.set(side * 1.12, 2.7, -0.15)
    group.add(stack)
    const tank = new THREE.Mesh(
      new THREE.CylinderGeometry(0.32, 0.32, 1.2, 8),
      chrome
    )
    tank.rotation.x = Math.PI / 2
    tank.position.set(side * 0.95, 0.85, 0.3)
    group.add(tank)
  }
  box([2.3, 0.08, 0.3], [0, 2.82, 1.2], body)
  const amber = lambert({ color: '#b86a14', emissive: '#7a3a04' })
  for (let i = -2; i <= 2; i++)
    box([0.12, 0.06, 0.08], [i * 0.28, 2.88, 1.18], amber)
  // The steer wheels and the drive tandem's duals.
  const tyre = new THREE.CylinderGeometry(0.5, 0.5, 0.3, 10)
  tyre.rotateZ(Math.PI / 2)
  const dual = new THREE.CylinderGeometry(0.5, 0.5, 0.6, 10)
  dual.rotateZ(Math.PI / 2)
  for (const side of [1, -1]) {
    const steer = new THREE.Mesh(tyre, black)
    steer.position.set(side * 1.05, 0.5, 2.4)
    group.add(steer)
    for (const z of [-2.1, -3.1]) {
      const drive = new THREE.Mesh(dual, black)
      drive.position.set(side * 0.9, 0.5, z)
      group.add(drive)
    }
  }
  const { nose, height } = CONFIG.traffic.vehicles.semi
  addLamps(group, 0.95, nose, null, height)
  mergeStatic(group)
  castShadows(group)
  return group
}

// The dry van: a box on its rear tandem and landing legs, in a freight
// line's livery down both sides, its doors and its taillights at the
// back. Faces +Z, origin under its middle.
export function buildTrailer(index = 0): THREE.Group {
  const { trailer: length, tailHeight } = CONFIG.traffic.semi
  const l = LIVERIES[index % LIVERIES.length]
  const group = new THREE.Group()
  group.name = 'trailer'
  const body = lambert({ color: l.body })
  const black = lambert({ color: '#151518' })
  const steel = lambert({ color: '#8a8d92' })
  const box = (
    size: [number, number, number],
    at: [number, number, number],
    material: THREE.Material
  ) => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(...size), material)
    mesh.position.set(...at)
    group.add(mesh)
    return mesh
  }
  const width = CONFIG.traffic.vehicles.semi.width
  const floor = 1.25
  const top = 4.0
  box([width, top - floor, length], [0, (floor + top) / 2, 0], body)
  box([width + 0.02, 0.1, length], [0, floor + 0.05, 0], steel)
  box([1.0, 0.25, length - 0.4], [0, floor - 0.12, 0], black)
  // The livery down each side, reading front to back from either.
  const side = lambert({
    map: artTexture(livery(String(index % LIVERIES.length))),
  })
  const plane = new THREE.PlaneGeometry(length - 1.2, 2.3)
  for (const s of [1, -1]) {
    const panel = new THREE.Mesh(plane, side)
    panel.rotation.y = (s * Math.PI) / 2
    panel.position.set(s * (width / 2 + 0.01), (floor + top) / 2 + 0.05, 0.2)
    group.add(panel)
  }
  // The doors' seam and bars at the back, the landing legs, the tandem.
  box(
    [0.04, top - floor - 0.2, 0.03],
    [0, (floor + top) / 2, -length / 2 - 0.02],
    black
  )
  for (const x of [-0.6, 0.6]) {
    box(
      [0.05, top - floor - 0.3, 0.05],
      [x, (floor + top) / 2, -length / 2 - 0.04],
      steel
    )
  }
  for (const x of [-0.8, 0.8])
    box([0.12, floor - 0.2, 0.12], [x, floor / 2, length / 2 - 2.6], steel)
  const dual = new THREE.CylinderGeometry(0.5, 0.5, 0.6, 10)
  dual.rotateZ(Math.PI / 2)
  for (const x of [-0.9, 0.9]) {
    for (const z of [-length / 2 + 1.6, -length / 2 + 2.9]) {
      const w = new THREE.Mesh(dual, black)
      w.position.set(x, 0.5, z)
      group.add(w)
    }
  }
  box([width, 0.25, 0.15], [0, 0.65, -length / 2 + 0.1], black)
  lenses ??= { head: LENS.head(), tail: LENS.tail() }
  const tailGlow = makeGlowTexture('rgba(255, 42, 26, 0.7)')
  for (const x of [-1, 1]) {
    box(
      [0.2, 0.14, 0.04],
      [x * 1.05, tailHeight, -length / 2 - 0.03],
      lenses.tail
    )
    const red = makeGlowSprite(tailGlow, 1.2)
    red.position.set(x * 1.05, tailHeight, -length / 2 - 0.1)
    group.add(red)
  }
  mergeStatic(group)
  castShadows(group)
  return group
}

// --- Any of them ----------------------------------------------------------

// One of the traffic, in its looks: the body, and a semi's trailer.
export interface VehicleModel {
  body: THREE.Group
  trailer: THREE.Group | null
}

export function buildVehicle(kind: VehicleKind, seed: number): VehicleModel {
  const look = lookOf(kind, seed)
  const paint = PAINTS[kind][look.paint]
  const { nose, tail, height } = CONFIG.traffic.vehicles[kind]
  switch (kind) {
    case 'jeep': {
      const body = buildJeep({ paint, hatchOpen: false })
      addLamps(body, 0.46, nose, tail, height)
      return { body, trailer: null }
    }
    case 'bmw': {
      const body = buildBmw(paint)
      addLamps(body, 0.51, nose, tail, height)
      mergeStatic(body)
      castShadows(body)
      return { body, trailer: null }
    }
    case 'pickup': {
      // Marx's Chevy carries its own lit lamps.
      const body = buildTruckBody(paint)
      mergeStatic(body)
      castShadows(body)
      return { body, trailer: null }
    }
    case 'semi':
      return { body: buildTractor(paint), trailer: buildTrailer(look.livery) }
  }
}

// The key two vehicles that look the same share: built once, cloned after.
export function lookKey(kind: VehicleKind, seed: number): string {
  const look = lookOf(kind, seed)
  return kind === 'semi'
    ? `${kind}:${look.paint}:${look.livery}`
    : `${kind}:${look.paint}`
}
