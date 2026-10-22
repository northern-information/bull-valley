import * as THREE from 'three'
import {
  artTexture,
  lambert,
  makeGlowSprite,
  makeGlowTexture,
  memo,
  packFace,
  packFlat,
  setPulseMaterials,
} from './assetkit.ts'
import { canvas } from './canvas.ts'
import { mulberry32, range } from './rng.ts'
import { buildSlurm } from './slurmmodel.ts'
import type { PickupOptions } from './assetkit.ts'
import type { CanvasArt } from './canvas.ts'

// The firefly pond's catch and its gear: the fish, the rod, the tub of
// nightcrawlers, and the scenery on the landing (the tackle box, the
// bobber on the water). Origin at ground level under the middle, real
// sizes in metres.

// --- Fish ----------------------------------------------------------------

// One parametric fish for every kind: a lathe body squashed to an oval
// section, painted side-on, with flat fins in its midplane, a pectoral fin
// lying on its flank, eyes, and barbels on the catfish and the carp. Built
// upright (head +X, back +Y), then laid on its left side.
type Tail = 'fork' | 'notch' | 'round'
type Dorsal = 'sunfish' | 'spiny' | 'catfish' | 'carp'

interface FishSpec {
  // Nose to tail tip; the body's depth and thickness as a share of it.
  length: number
  depth: number
  thickness: number
  // Where along the body (0 tail, 1 nose) it is deepest, how thin the
  // tail stock is, and how blunt the snout (both shares of the depth).
  peak: number
  stock: number
  snout: number
  tail: Tail
  dorsal: Dorsal
  // How many barbels hang from the mouth.
  barbels: number
  // Colors: back, flank, belly, fins, iris.
  back: string
  flank: string
  belly: string
  fin: string
  iris: string
  // How bright the body glows on its own, and its halo's color.
  shine: number
  halo: string
  // The markings over the base gradient.
  marks?: (art: CanvasArt) => void
}

const WATERY = 'rgba(170, 214, 230, 0.3)'

// Every mark is painted on a side view: x from tail (0) to nose (w), y
// from back (0) to belly (h).
const FISH: Record<string, FishSpec> = {
  bluegill: {
    length: 0.2,
    depth: 0.52,
    thickness: 0.14,
    peak: 0.55,
    stock: 0.22,
    snout: 0.2,
    tail: 'notch',
    dorsal: 'sunfish',
    barbels: 0,
    back: '#2f4630',
    flank: '#6c8558',
    belly: '#e0a640',
    fin: '#4c5a3e',
    iris: '#1a1a14',
    shine: 0.4,
    halo: WATERY,
    marks: (art) => {
      bars(art, 6, 0.3, 0.75, 'rgba(30, 44, 30, 0.35)')
      cheekLines(art, 'rgba(110, 170, 220, 0.85)')
      earFlap(art, '#0c0c0c', null)
    },
  },
  pumpkinseed: {
    length: 0.18,
    depth: 0.5,
    thickness: 0.14,
    peak: 0.55,
    stock: 0.22,
    snout: 0.2,
    tail: 'notch',
    dorsal: 'sunfish',
    barbels: 0,
    back: '#4a5a2e',
    flank: '#a49a48',
    belly: '#ee7c22',
    fin: '#6a6a3a',
    iris: '#5a1a10',
    shine: 0.4,
    halo: WATERY,
    marks: (art) => {
      spots(art, 0x9b5e, 40, 1.5, 3, ['#d07a2a', '#5a8ab0'], 0.15, 0.7)
      cheekLines(art, 'rgba(70, 150, 220, 0.9)')
      earFlap(art, '#0c0c0c', '#e8301a')
    },
  },
  'yellow-perch': {
    length: 0.24,
    depth: 0.26,
    thickness: 0.13,
    peak: 0.58,
    stock: 0.25,
    snout: 0.16,
    tail: 'notch',
    dorsal: 'spiny',
    barbels: 0,
    back: '#4a5424',
    flank: '#d6c040',
    belly: '#f0ead0',
    fin: '#d07a30',
    iris: '#b8a030',
    shine: 0.4,
    halo: WATERY,
    marks: (art) => taperedBars(art, 7, 'rgba(34, 40, 18, 0.85)'),
  },
  'black-crappie': {
    length: 0.25,
    depth: 0.46,
    thickness: 0.12,
    peak: 0.55,
    stock: 0.2,
    snout: 0.18,
    tail: 'notch',
    dorsal: 'sunfish',
    barbels: 0,
    back: '#30342e',
    flank: '#b8bcb2',
    belly: '#e4e6de',
    fin: '#7a7e74',
    iris: '#2a2a20',
    shine: 0.45,
    halo: WATERY,
    marks: (art) => {
      spots(art, 0xc4a9, 70, 1.5, 4, ['#121410', '#2a2e26'], 0.05, 0.85)
    },
  },
  bullhead: {
    length: 0.3,
    depth: 0.22,
    thickness: 0.18,
    peak: 0.62,
    stock: 0.3,
    snout: 0.4,
    tail: 'round',
    dorsal: 'catfish',
    barbels: 8,
    back: '#231c12',
    flank: '#4a3a22',
    belly: '#c8b47a',
    fin: '#2e2416',
    iris: '#c8a040',
    shine: 0.35,
    halo: WATERY,
    marks: (art) => {
      spots(art, 0xb011, 30, 2, 5, ['rgba(20, 14, 8, 0.5)'], 0.05, 0.6)
    },
  },
  'largemouth-bass': {
    length: 0.4,
    depth: 0.28,
    thickness: 0.13,
    peak: 0.58,
    stock: 0.24,
    snout: 0.22,
    tail: 'notch',
    dorsal: 'spiny',
    barbels: 0,
    back: '#24381c',
    flank: '#7c9a50',
    belly: '#e6e6c4',
    fin: '#566a3a',
    iris: '#c08a20',
    shine: 0.4,
    halo: WATERY,
    marks: (art) => {
      lateralStripe(art, 'rgba(20, 30, 14, 0.9)')
      bigMouth(art)
    },
  },
  'channel-catfish': {
    length: 0.55,
    depth: 0.18,
    thickness: 0.15,
    peak: 0.66,
    stock: 0.24,
    snout: 0.42,
    tail: 'fork',
    dorsal: 'catfish',
    barbels: 8,
    back: '#3c4a58',
    flank: '#8494a4',
    belly: '#eaeae4',
    fin: '#4c5a66',
    iris: '#1c2024',
    shine: 0.4,
    halo: WATERY,
    marks: (art) => {
      spots(art, 0xca7f, 22, 1, 2, ['#14181c'], 0.15, 0.55)
    },
  },
  'common-carp': {
    length: 0.6,
    depth: 0.3,
    thickness: 0.15,
    peak: 0.56,
    stock: 0.24,
    snout: 0.26,
    tail: 'fork',
    dorsal: 'carp',
    barbels: 4,
    back: '#3a2c12',
    flank: '#b0802c',
    belly: '#e2cc8e',
    fin: '#8a5a28',
    iris: '#c89a3a',
    shine: 0.4,
    halo: WATERY,
    marks: (art) => bigScales(art, 'rgba(50, 30, 8, 0.55)'),
  },
  // A carp gone the colour of the shadowmen: black on black, its scales a
  // shade off it, and a red eye that burns as a shadow spider's do.
  'shadow-carp': {
    length: 0.62,
    depth: 0.3,
    thickness: 0.15,
    peak: 0.56,
    stock: 0.24,
    snout: 0.26,
    tail: 'fork',
    dorsal: 'carp',
    barbels: 4,
    back: '#020203',
    flank: '#0b0b0e',
    belly: '#16151a',
    fin: '#050506',
    iris: '#ff1e1e',
    shine: 0.15,
    halo: 'rgba(255, 40, 40, 0.18)',
    marks: (art) => bigScales(art, 'rgba(60, 60, 72, 0.5)'),
  },
  // The pond's legend: an albino channel cat near a metre long, bone white
  // with pink eyes, glowing faintly on its own.
  'ghost-catfish': {
    length: 0.9,
    depth: 0.18,
    thickness: 0.15,
    peak: 0.66,
    stock: 0.24,
    snout: 0.42,
    tail: 'fork',
    dorsal: 'catfish',
    barbels: 8,
    back: '#d8d2c4',
    flank: '#ece8dc',
    belly: '#f8f6f0',
    fin: '#e6d8d4',
    iris: '#d04a5a',
    shine: 0.6,
    halo: 'rgba(226, 240, 255, 0.6)',
  },
}

// The body's half-depth along its length, as a share of the whole: the
// tail stock at u = 0, the deepest point at `peak`, the snout at u = 1.
function profile(spec: FishSpec, u: number): number {
  const { peak, stock, snout } = spec
  if (u <= peak) {
    return stock + (1 - stock) * Math.sin((Math.PI / 2) * (u / peak))
  }
  const k = (u - peak) / (1 - peak)
  return snout + (1 - snout) * Math.pow(Math.cos((Math.PI / 2) * k), 0.7)
}

// The share of the length the tail fin takes; the body is the rest.
const TAIL_SHARE = 0.2

// The body's length (without the tail fin) and its x at a share u from
// its tail end.
function bodyLength(spec: FishSpec): number {
  return spec.length * (1 - TAIL_SHARE)
}

function bodyX(spec: FishSpec, u: number): number {
  return spec.length / 2 - bodyLength(spec) * (1 - u)
}

// Half the body's depth at x.
function topAt(spec: FishSpec, x: number): number {
  const u = (x - bodyX(spec, 0)) / bodyLength(spec)
  if (u < 0 || u > 1) return 0
  return (profile(spec, u) * spec.depth * spec.length) / 2
}

// The side view's art: back to belly gradient, then the kind's marks, the
// gill cover's line, the mouth.
function paintFish(kind: string): CanvasArt {
  const spec = FISH[kind]
  const art = canvas([128, 64])
  const { ctx, w, h } = art
  const grad = ctx.createLinearGradient(0, 0, 0, h)
  grad.addColorStop(0.1, spec.back)
  grad.addColorStop(0.45, spec.flank)
  grad.addColorStop(0.7, spec.flank)
  grad.addColorStop(0.92, spec.belly)
  ctx.fillStyle = grad
  ctx.fillRect(0, 0, w, h)
  spec.marks?.(art)
  // The gill cover's edge.
  ctx.strokeStyle = 'rgba(0, 0, 0, 0.3)'
  ctx.lineWidth = 1.5
  ctx.beginPath()
  ctx.arc(w * 0.97, h * 0.5, w * 0.17, Math.PI * 0.62, Math.PI * 1.38)
  ctx.stroke()
  // The mouth, a dark nick at the snout.
  ctx.fillStyle = 'rgba(10, 8, 6, 0.8)'
  ctx.fillRect(w - 6, h * 0.5, 6, 2)
  return art
}

// Upright dark bars down the flank, from the back to `to`.
function bars(
  { ctx, w, h }: CanvasArt,
  n: number,
  from: number,
  to: number,
  color: string
): void {
  ctx.fillStyle = color
  for (let i = 0; i < n; i++) {
    const x = w * (from + ((to - from) * (i + 0.5)) / n)
    ctx.fillRect(x - 3, 0, 6, h * 0.7)
  }
}

// The perch's saddles: wide at the back, tapering to a point low on the
// flank.
function taperedBars({ ctx, w, h }: CanvasArt, n: number, color: string) {
  ctx.fillStyle = color
  for (let i = 0; i < n; i++) {
    const x = w * (0.12 + (0.62 * (i + 0.5)) / n)
    ctx.beginPath()
    ctx.moveTo(x - 4.5, 0)
    ctx.lineTo(x + 4.5, 0)
    ctx.lineTo(x + 1, h * 0.72)
    ctx.closePath()
    ctx.fill()
  }
}

// Spots scattered over the flank between heights `top` and `bottom`.
function spots(
  { ctx, w, h }: CanvasArt,
  seed: number,
  n: number,
  rMin: number,
  rMax: number,
  colors: string[],
  top: number,
  bottom: number
): void {
  const rng = mulberry32(seed)
  for (let i = 0; i < n; i++) {
    ctx.fillStyle = colors[i % colors.length]
    ctx.beginPath()
    ctx.arc(
      range(rng, 0.05, 0.85) * w,
      range(rng, top, bottom) * h,
      range(rng, rMin, rMax),
      0,
      Math.PI * 2
    )
    ctx.fill()
  }
}

// The sunfish's blue lines across the cheek, under the eye.
function cheekLines({ ctx, w, h }: CanvasArt, color: string): void {
  ctx.strokeStyle = color
  ctx.lineWidth = 1.5
  for (let i = 0; i < 3; i++) {
    ctx.beginPath()
    ctx.moveTo(w * 0.8, h * (0.5 + i * 0.08))
    ctx.quadraticCurveTo(
      w * 0.88,
      h * (0.46 + i * 0.08),
      w * 0.97,
      h * (0.52 + i * 0.07)
    )
    ctx.stroke()
  }
}

// The black ear flap behind the gill cover, with a bright tip on the
// pumpkinseed.
function earFlap(
  { ctx, w, h }: CanvasArt,
  color: string,
  tip: string | null
): void {
  ctx.fillStyle = color
  ctx.beginPath()
  ctx.ellipse(w * 0.75, h * 0.44, 4.5, 3.5, 0, 0, Math.PI * 2)
  ctx.fill()
  if (tip) {
    ctx.fillStyle = tip
    ctx.beginPath()
    ctx.arc(w * 0.725, h * 0.44, 2, 0, Math.PI * 2)
    ctx.fill()
  }
}

// The bass's ragged dark stripe from gill to tail.
function lateralStripe({ ctx, w, h }: CanvasArt, color: string): void {
  ctx.fillStyle = color
  const rng = mulberry32(0xba55)
  for (let x = 2; x < w * 0.84; x += 4) {
    const half = range(rng, 3, 6)
    ctx.fillRect(x, h * 0.5 - half + range(rng, -1, 1), 5, half * 2)
  }
}

// The bass's jaw, running back past the eye.
function bigMouth({ ctx, w, h }: CanvasArt): void {
  ctx.strokeStyle = 'rgba(20, 16, 10, 0.8)'
  ctx.lineWidth = 2
  ctx.beginPath()
  ctx.moveTo(w, h * 0.52)
  ctx.lineTo(w * 0.84, h * 0.56)
  ctx.stroke()
}

// The carp's big scales: rows of arcs, each open toward the tail.
function bigScales({ ctx, w, h }: CanvasArt, color: string): void {
  ctx.strokeStyle = color
  ctx.lineWidth = 1.2
  const r = 5
  for (let row = 0; row * r * 1.4 < h; row++) {
    const y = row * r * 1.4 + 2
    const off = row % 2 ? r : 0
    for (let x = off + 4; x < w * 0.8; x += r * 2) {
      ctx.beginPath()
      ctx.arc(x, y, r, -Math.PI / 2, Math.PI / 2)
      ctx.stroke()
    }
  }
}

const fishArt = memo(paintFish)

// The body: a lathe about the length, squashed to `depth` by `thickness`,
// with its side-view art projected flat onto both flanks.
function fishBody(spec: FishSpec): THREE.BufferGeometry {
  const L = bodyLength(spec)
  const steps = 12
  const points = [new THREE.Vector2(0, -L / 2)]
  for (let i = 0; i <= steps; i++) {
    const u = i / steps
    points.push(new THREE.Vector2(profile(spec, u), (u - 0.5) * L))
  }
  points.push(new THREE.Vector2(0, L / 2))
  const geometry = new THREE.LatheGeometry(points, 8)
  const depth = spec.depth * spec.length
  geometry.scale(depth / 2, 1, (spec.thickness * spec.length) / 2)
  // The lathe's axis (y) becomes the length, nose to +X.
  geometry.rotateZ(-Math.PI / 2)
  geometry.translate(bodyX(spec, 0.5), 0, 0)
  // Side-on art: u from tail to nose, v from belly to back.
  const pos = geometry.getAttribute('position')
  const uv = geometry.getAttribute('uv')
  for (let i = 0; i < pos.count; i++) {
    uv.setXY(i, (pos.getX(i) - bodyX(spec, 0)) / L, pos.getY(i) / depth + 0.5)
  }
  geometry.computeVertexNormals()
  return geometry
}

// A flat fin in the midplane from an outline of [x, y] points.
function finShape(points: [number, number][]): THREE.ShapeGeometry {
  const shape = new THREE.Shape()
  shape.moveTo(points[0][0], points[0][1])
  for (const [x, y] of points.slice(1)) shape.lineTo(x, y)
  shape.closePath()
  return new THREE.ShapeGeometry(shape)
}

function tailFin(spec: FishSpec): THREE.ShapeGeometry {
  const x0 = bodyX(spec, 0) + 0.01 * spec.length
  const reach = spec.length * TAIL_SHARE + 0.01 * spec.length
  const span = spec.depth * spec.length * 0.55
  const root = spec.stock * spec.depth * spec.length * 0.45
  if (spec.tail === 'round') {
    return finShape([
      [x0, root],
      [x0 - reach * 0.7, span * 0.85],
      [x0 - reach, span * 0.4],
      [x0 - reach, -span * 0.4],
      [x0 - reach * 0.7, -span * 0.85],
      [x0, -root],
    ])
  }
  const notch = spec.tail === 'fork' ? 0.45 : 0.8
  return finShape([
    [x0, root],
    [x0 - reach, span],
    [x0 - reach * notch, 0],
    [x0 - reach, -span],
    [x0, -root],
  ])
}

// A fin standing off the back (sign 1) or the belly (sign -1) between two
// shares of the body, `rise` (a share of the depth) at its front and
// `fall` at its back.
function edgeFin(
  spec: FishSpec,
  sign: 1 | -1,
  from: number,
  to: number,
  rise: number,
  fall: number
): THREE.ShapeGeometry {
  const x0 = bodyX(spec, from)
  const x1 = bodyX(spec, to)
  const D = spec.depth * spec.length
  // Sunk a little into the body, so no gap shows at the root.
  const base = (x: number) => sign * topAt(spec, x) * 0.85
  return finShape([
    [x1, base(x1)],
    [x1 - (x1 - x0) * 0.15, base(x1) + sign * rise * D],
    [x0 + (x1 - x0) * 0.1, base(x0) + sign * fall * D],
    [x0, base(x0)],
  ])
}

function fins(spec: FishSpec): THREE.BufferGeometry[] {
  const list = [tailFin(spec)]
  const add = (...args: [1 | -1, number, number, number, number]) =>
    list.push(edgeFin(spec, ...args))
  if (spec.dorsal === 'sunfish') {
    add(1, 0.2, 0.62, 0.22, 0.35)
    add(-1, 0.15, 0.42, 0.2, 0.28)
  } else if (spec.dorsal === 'spiny') {
    add(1, 0.42, 0.66, 0.32, 0.12)
    add(1, 0.16, 0.4, 0.26, 0.24)
    add(-1, 0.16, 0.34, 0.2, 0.22)
  } else if (spec.dorsal === 'catfish') {
    add(1, 0.56, 0.66, 0.5, 0.15)
    // The fatty adipose fin near the tail.
    add(1, 0.12, 0.24, 0.12, 0.1)
    add(-1, 0.06, 0.4, 0.22, 0.2)
  } else {
    add(1, 0.2, 0.62, 0.36, 0.12)
    add(-1, 0.1, 0.22, 0.24, 0.18)
  }
  // The pelvic fins under the chest.
  add(-1, 0.56, 0.66, 0.16, 0.24)
  return list
}

// The pectoral fin lying back along the upper flank, behind the gill.
function pectoral(spec: FishSpec): THREE.ShapeGeometry {
  const D = spec.depth * spec.length
  const x = bodyX(spec, 0.76)
  const len = spec.length * 0.14
  return finShape([
    [x, D * 0.06],
    [x - len, D * 0.12],
    [x - len * 0.9, -D * 0.06],
    [x, -D * 0.06],
  ])
}

// Where the flank's surface is, at (x, y) on one side.
function flankZ(spec: FishSpec, x: number, y: number): number {
  const top = topAt(spec, x)
  if (top <= 0) return 0
  const half = (top / spec.depth) * spec.thickness
  return half * Math.sqrt(Math.max(0, 1 - (y / top) ** 2))
}

export function buildFish(
  kind: string,
  { glow = true }: PickupOptions = {}
): THREE.Group {
  const spec = FISH[kind] as FishSpec | undefined
  if (!spec) throw new Error(`Unknown fish "${kind}"`)
  const L = spec.length
  const D = spec.depth * L
  const group = new THREE.Group()
  group.name = `fish-${kind}`
  // Upright, then laid on its left side: its right flank faces up.
  const body = new THREE.Group()
  body.rotation.x = -Math.PI / 2
  body.position.y = (spec.thickness * L) / 2
  group.add(body)

  const skin = packFace(artTexture(fishArt(kind)))
  skin.emissiveIntensity = spec.shine
  body.add(new THREE.Mesh(fishBody(spec), skin))

  const fin = packFlat(spec.fin)
  fin.side = THREE.DoubleSide
  fin.emissiveIntensity = spec.shine * 0.3
  for (const geometry of fins(spec)) body.add(new THREE.Mesh(geometry, fin))
  const pec = new THREE.Mesh(pectoral(spec), fin)
  pec.position.z = flankZ(spec, bodyX(spec, 0.7), 0) + 0.002
  body.add(pec)

  // The eyes, one on each flank: an iris and a pupil standing proud.
  const catfish = spec.dorsal === 'catfish'
  const eyeX = bodyX(spec, catfish ? 0.9 : 0.88)
  const eyeY = D * (catfish ? 0.04 : 0.1)
  const eyeR = L * (catfish ? 0.018 : 0.035)
  const iris = packFlat(spec.iris)
  const pupil = lambert({ color: '#050505' })
  for (const side of [1, -1]) {
    const z = flankZ(spec, eyeX, eyeY) * side
    const ring = new THREE.Mesh(new THREE.SphereGeometry(eyeR, 8, 4), iris)
    ring.scale.z = 0.35
    ring.position.set(eyeX, eyeY, z)
    body.add(ring)
    const dot = new THREE.Mesh(
      new THREE.SphereGeometry(eyeR * 0.55, 6, 4),
      pupil
    )
    dot.scale.z = 0.4
    dot.position.set(eyeX, eyeY, z + side * eyeR * 0.15)
    body.add(dot)
  }

  // Barbels, fanned from the mouth: the long pair at its corners sweeping
  // back, the rest shorter, hanging off the chin.
  if (spec.barbels > 0) {
    const whisker = packFlat(spec.dorsal === 'catfish' ? spec.back : spec.fin)
    const nose = bodyX(spec, 1)
    for (let i = 0; i < spec.barbels; i++) {
      const pair = Math.floor(i / 2)
      const side = i % 2 ? 1 : -1
      const long = pair === 0
      const len = L * (long ? 0.2 : 0.08)
      const geometry = new THREE.CylinderGeometry(L * 0.0015, L * 0.004, len, 3)
      geometry.translate(0, len / 2, 0)
      const barbel = new THREE.Mesh(geometry, whisker)
      barbel.position.set(nose - L * 0.02 * pair, -D * 0.06 * pair, 0)
      // Pointing back along the body, down and out, the long pair the
      // widest.
      barbel.rotation.set(
        side * (long ? 0.5 : 0.25 + 0.15 * pair),
        0,
        long ? 1.9 : 2.6 - 0.1 * pair
      )
      body.add(barbel)
    }
  }

  if (glow) {
    const halo = makeGlowSprite(
      makeGlowTexture(spec.halo),
      Math.max(0.5, L * 2.2)
    )
    halo.position.y = 0.05
    group.add(halo)
  }
  setPulseMaterials(group, [skin, fin, iris])
  return group
}

// --- Fishing rod ---------------------------------------------------------

// A 6' spinning rod lying on its side in the grass: a dark tapered blank,
// a cork grip around the reel seat, the reel lying flat beside it, and
// four guides on the reel's side running down to the tip. Tip toward +X.
const ROD = {
  length: 1.8,
  butt: 0.0065,
  tip: 0.0016,
  // The rod's axis height: the reel lying under it holds it up.
  axis: 0.026,
  guides: [
    [-0.25, 0.013],
    [0.15, 0.009],
    [0.48, 0.006],
    [0.74, 0.0045],
  ] as const,
}

// A cylinder along X, from x0 to x1, radii r0 at x0 and r1 at x1.
function alongX(
  x0: number,
  x1: number,
  r0: number,
  r1: number,
  sides = 8
): THREE.CylinderGeometry {
  const geometry = new THREE.CylinderGeometry(r1, r0, x1 - x0, sides)
  geometry.rotateZ(-Math.PI / 2)
  geometry.translate((x0 + x1) / 2, 0, 0)
  return geometry
}

// Each rod's look: the tackle box's old one, and the three on the Citgo's
// rack. The blank, the grip, the thread wraps, the reel's body and its
// trim; `spincast` closes the reel's face, as the Zebco 33's is, and `tip`
// paints the last stretch of the blank (the Ugly Stik's clear tip).
interface RodLook {
  blank: string
  grip: string
  wrap: string
  reel: string
  trim: string
  spincast?: true
  tip?: string
}

const ROD_LOOKS: Record<string, RodLook> = {
  'fishing-rod': {
    blank: '#23262c',
    grip: '#b38c5e',
    wrap: '#7a1c1c',
    reel: '#141414',
    trim: '#8c9096',
  },
  'zebco-33': {
    blank: '#1b1b1d',
    grip: '#2a2a2a',
    wrap: '#b8b8b8',
    reel: '#a9aeb4',
    trim: '#1b1b1d',
    spincast: true,
  },
  'ugly-stik': {
    blank: '#141414',
    grip: '#2b2b2b',
    wrap: '#d9b21f',
    reel: '#202020',
    trim: '#d9b21f',
    tip: '#e9efe8',
  },
  'g-loomis': {
    blank: '#2e3b33',
    grip: '#c9a273',
    wrap: '#b08a3a',
    reel: '#33383c',
    trim: '#c8a24a',
  },
}

export function buildFishingRod(
  kind = 'fishing-rod',
  { glow = true }: PickupOptions = {}
): THREE.Group {
  const look = ROD_LOOKS[kind] ?? ROD_LOOKS['fishing-rod']
  const group = new THREE.Group()
  group.name = kind
  const rod = new THREE.Group()
  rod.position.y = ROD.axis
  group.add(rod)
  const half = ROD.length / 2
  const blank = packFlat(look.blank)
  const cork = packFlat(look.grip)
  const metal = packFlat(look.trim)
  const black = packFlat(look.reel)
  const pulse = [blank, cork, metal, black]
  for (const m of pulse) m.emissiveIntensity = 0.3
  const add = (geometry: THREE.BufferGeometry, material: THREE.Material) => {
    const mesh = new THREE.Mesh(geometry, material)
    rod.add(mesh)
    return mesh
  }
  add(alongX(-half, half, ROD.butt, ROD.tip, 6), blank)
  if (look.tip) {
    add(
      alongX(half - 0.3, half, ROD.tip * 1.9, ROD.tip * 1.05, 6),
      packFlat(look.tip)
    )
  }
  add(alongX(-half - 0.01, -half + 0.012, 0.013, 0.013), black)
  add(alongX(-half + 0.012, -0.62, 0.0125, 0.0115), cork)
  add(alongX(-0.62, -0.52, 0.0105, 0.0105), metal)
  add(alongX(-0.52, -0.42, 0.0115, 0.0085), cork)
  // The thread wrap at the hook keeper.
  add(alongX(-0.4, -0.385, 0.0075, 0.0075), packFlat(look.wrap))

  // The reel, lying flat out on +Z: its foot on the seat, a stem out to
  // the body, the spool facing the tip, the bail around it, the crank up.
  const reel = new THREE.Group()
  reel.position.set(-0.57, 0, 0)
  rod.add(reel)
  if (look.spincast) {
    // A closed-face spincast reel sits on top of the seat: a domed body,
    // its nose cone toward the tip, the thumb button behind.
    const body = new THREE.Mesh(alongX(-0.04, 0.0, 0.024, 0.026), black)
    body.position.y = 0.03
    reel.add(body)
    const nose = new THREE.Mesh(alongX(0.0, 0.035, 0.026, 0.008), black)
    nose.position.y = 0.03
    reel.add(nose)
    const button = new THREE.Mesh(alongX(-0.055, -0.04, 0.008, 0.008), metal)
    button.position.y = 0.03
    reel.add(button)
    const foot = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.012, 0.01), metal)
    foot.position.y = 0.01
    reel.add(foot)
  }
  const stem = new THREE.Mesh(new THREE.BoxGeometry(0.012, 0.008, 0.05), black)
  stem.position.z = 0.03
  stem.visible = !look.spincast
  reel.add(stem)
  const housing = new THREE.Mesh(alongX(-0.035, 0.005, 0.02, 0.018), black)
  housing.position.z = 0.06
  housing.visible = !look.spincast
  reel.add(housing)
  const spool = new THREE.Mesh(alongX(0.005, 0.03, 0.022, 0.024), metal)
  spool.position.z = 0.06
  spool.visible = !look.spincast
  reel.add(spool)
  const line = new THREE.Mesh(
    alongX(0.008, 0.026, 0.0235, 0.0245),
    packFlat('#c8d6c0')
  )
  line.position.z = 0.06
  line.visible = !look.spincast
  reel.add(line)
  const bail = new THREE.Mesh(
    new THREE.TorusGeometry(0.027, 0.0015, 4, 12, Math.PI),
    metal
  )
  bail.rotation.y = Math.PI / 2
  bail.position.set(0.024, 0, 0.06)
  bail.visible = !look.spincast
  reel.add(bail)
  const crank = new THREE.Mesh(new THREE.BoxGeometry(0.006, 0.05, 0.006), metal)
  crank.position.set(-0.02, 0.03, 0.06)
  crank.visible = !look.spincast
  reel.add(crank)
  const knob = new THREE.Mesh(alongX(-0.035, -0.02, 0.006, 0.006), black)
  knob.position.set(0, 0.055, 0.06)
  knob.visible = !look.spincast
  reel.add(knob)

  // The guides: rings on short feet, out on the reel's side, smaller
  // toward the tip, and the tip-top.
  for (const [x, r] of ROD.guides) {
    const foot = new THREE.Mesh(
      new THREE.BoxGeometry(0.004, 0.002, r * 1.6),
      metal
    )
    foot.position.set(x, 0, r * 0.8)
    rod.add(foot)
    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(r, Math.max(0.0012, r * 0.15), 4, 8),
      metal
    )
    ring.rotation.y = Math.PI / 2
    ring.position.set(x, 0, r * 2.4)
    rod.add(ring)
  }
  add(alongX(half - 0.008, half + 0.004, 0.003, 0.003), metal)

  if (glow) {
    const halo = makeGlowSprite(
      makeGlowTexture('rgba(220, 200, 150, 0.4)'),
      1.4
    )
    halo.position.set(-0.4, 0.05, 0)
    group.add(halo)
  }
  setPulseMaterials(group, pulse)
  return group
}

// A rod as it stands on the Citgo's rack (store.ts): upright, tip up,
// its reel turned out to the room (+Z), its origin at the middle of the
// blank, where a raider's eye finds it.
export function buildRackRod(kind: string): THREE.Group {
  const lying = buildFishingRod(kind, { glow: false })
  const rod = lying.children[0]
  rod.position.set(0, 0, 0)
  rod.rotation.z = Math.PI / 2
  const group = new THREE.Group()
  group.name = `${kind}-racked`
  group.add(rod)
  return group
}

// --- Nightcrawlers -------------------------------------------------------

// A pint tub of nightcrawlers from a bait shop's cooler: white foam, its
// lid pushed half off so the black dirt shows, a worm over the rim. Drawn
// a third over size, or the PS1 downscale loses it in the grass.
export function buildNightcrawlers({
  glow = true,
}: PickupOptions = {}): THREE.Group {
  const group = new THREE.Group()
  group.name = 'nightcrawlers'
  const foam = packFlat('#ece8de')
  foam.emissiveIntensity = 0.3
  const dirt = lambert({ color: '#2e2016' })
  const worm = packFlat('#a85a5e')
  worm.emissiveIntensity = 0.3
  const H = 0.07
  const tub = new THREE.Mesh(
    new THREE.CylinderGeometry(0.055, 0.045, H, 10, 1, true),
    foam
  )
  tub.material.side = THREE.DoubleSide
  tub.position.y = H / 2
  group.add(tub)
  const floor = new THREE.Mesh(new THREE.CircleGeometry(0.045, 10), foam)
  floor.rotation.x = Math.PI / 2
  floor.position.y = 0.001
  group.add(floor)
  const soil = new THREE.Mesh(new THREE.CircleGeometry(0.05, 10), dirt)
  soil.rotation.x = -Math.PI / 2
  soil.position.y = H - 0.008
  group.add(soil)
  // The lid, a flat foam disc, shoved off toward -X.
  const lid = new THREE.Group()
  lid.position.set(-0.03, H + 0.004, 0.006)
  const disc = new THREE.Mesh(
    new THREE.CylinderGeometry(0.058, 0.06, 0.008, 10),
    foam
  )
  lid.add(disc)
  group.add(lid)
  // A crawler hanging over the open rim.
  const curve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(0.015, H - 0.006, 0.01),
    new THREE.Vector3(0.04, H + 0.004, -0.005),
    new THREE.Vector3(0.058, H - 0.004, -0.01),
    new THREE.Vector3(0.062, H - 0.03, -0.006),
  ])
  group.add(new THREE.Mesh(new THREE.TubeGeometry(curve, 8, 0.0035, 4), worm))
  group.scale.setScalar(1.3)
  if (glow) {
    const halo = makeGlowSprite(
      makeGlowTexture('rgba(236, 230, 214, 0.45)'),
      0.6
    )
    halo.position.y = 0.05
    group.add(halo)
  }
  setPulseMaterials(group, [foam, worm])
  return group
}

// --- Tackle box ----------------------------------------------------------

// An old green steel tackle box on the pond's landing, its lid propped a
// little open on the cantilever tray inside. Scenery: no glow, no pulse.
const TACKLE = {
  width: 0.45,
  depth: 0.25,
  body: 0.16,
  lid: 0.06,
  open: THREE.MathUtils.degToRad(40),
}

// Chipped green paint with rust in the scratches.
function paintSteel(): CanvasArt {
  const art = canvas([64, 64], '#3e5b3c')
  const { ctx } = art
  const rng = mulberry32(0x7ac1e)
  for (let i = 0; i < 70; i++) {
    ctx.fillStyle = i % 3 ? 'rgba(40, 62, 40, 0.6)' : 'rgba(120, 70, 30, 0.7)'
    ctx.fillRect(rng() * 64, rng() * 64, range(rng, 1, 4), range(rng, 1, 2))
  }
  ctx.fillStyle = 'rgba(90, 120, 86, 0.5)'
  for (let i = 0; i < 12; i++) {
    ctx.fillRect(rng() * 64, rng() * 64, range(rng, 4, 10), 1)
  }
  return art
}

const steelArt = memo(() => paintSteel())

export function buildTackleBox(): THREE.Group {
  const T = TACKLE
  const group = new THREE.Group()
  group.name = 'tackle-box'
  const steel = lambert({ map: artTexture(steelArt('steel')) })
  const inside = lambert({ color: '#1e2a1e' })
  const tray = lambert({ color: '#b98a4a' })
  const chrome = lambert({ color: '#a8acb0' })
  const lure = lambert({ color: '#d8d0c0' })
  const red = lambert({ color: '#b22a22' })
  // BoxGeometry face order: +x, -x, +y, -y, +z, -z. The top is the dark
  // inside, under the tray.
  const body = new THREE.Mesh(new THREE.BoxGeometry(T.width, T.body, T.depth), [
    steel,
    steel,
    inside,
    steel,
    steel,
    steel,
  ])
  body.position.y = T.body / 2
  group.add(body)

  // The cantilever tray, risen out over the rim as the lid opens: its
  // floor, its dividers, and a few lures in the bins.
  // Set forward of the hinge, clear of the open lid.
  const trayTop = T.body + 0.025
  const trayDepth = T.depth - 0.07
  const trayZ = 0.02
  const trayBase = new THREE.Mesh(
    new THREE.BoxGeometry(T.width - 0.03, 0.004, trayDepth),
    tray
  )
  trayBase.position.set(0, trayTop - 0.03, trayZ)
  group.add(trayBase)
  const walls: [number, number, number, number][] = [
    // [x, z, width, depth]
    [-0.11, 0, 0.004, trayDepth],
    [0, 0, 0.004, trayDepth],
    [0.11, 0, 0.004, trayDepth],
    [0, 0, T.width - 0.03, 0.004],
    [0, trayDepth / 2, T.width - 0.03, 0.004],
    [0, -trayDepth / 2, T.width - 0.03, 0.004],
    [(T.width - 0.03) / 2, 0, 0.004, trayDepth],
    [-(T.width - 0.03) / 2, 0, 0.004, trayDepth],
  ]
  for (const [x, z, w, d] of walls) {
    const wall = new THREE.Mesh(new THREE.BoxGeometry(w, 0.03, d), tray)
    wall.position.set(x, trayTop - 0.015, trayZ + z)
    group.add(wall)
  }
  const rng = mulberry32(0x1ae)
  for (let i = 0; i < 5; i++) {
    const bait = new THREE.Mesh(
      new THREE.BoxGeometry(0.05, 0.012, 0.014),
      i % 2 ? red : lure
    )
    bait.position.set(
      range(rng, -0.18, 0.18),
      trayTop - 0.022,
      trayZ + range(rng, -0.06, 0.06)
    )
    bait.rotation.y = range(rng, 0, Math.PI)
    group.add(bait)
  }

  // The lid, hinged along the back top edge, propped open.
  const hinge = new THREE.Group()
  hinge.position.set(0, T.body, -T.depth / 2)
  hinge.rotation.x = -T.open
  const lid = new THREE.Mesh(new THREE.BoxGeometry(T.width, T.lid, T.depth), [
    steel,
    steel,
    steel,
    inside,
    steel,
    steel,
  ])
  lid.position.set(0, T.lid / 2, T.depth / 2)
  hinge.add(lid)
  // The handle on top: a strap on two posts.
  const strap = new THREE.Mesh(new THREE.BoxGeometry(0.13, 0.01, 0.022), chrome)
  strap.position.set(0, T.lid + 0.025, T.depth / 2)
  hinge.add(strap)
  for (const x of [-0.06, 0.06]) {
    const post = new THREE.Mesh(
      new THREE.BoxGeometry(0.01, 0.025, 0.014),
      chrome
    )
    post.position.set(x, T.lid + 0.012, T.depth / 2)
    hinge.add(post)
  }
  // The hasp at the front of the lid.
  const hasp = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.03, 0.006), chrome)
  hasp.position.set(0, 0.0, T.depth + 0.003)
  hinge.add(hasp)
  group.add(hinge)
  // The hinge pin, and the catch on the body the hasp met.
  const pin = new THREE.Mesh(
    alongX(-T.width / 2, T.width / 2, 0.005, 0.005),
    chrome
  )
  pin.position.set(0, T.body, -T.depth / 2 - 0.002)
  group.add(pin)
  const catcher = new THREE.Mesh(
    new THREE.BoxGeometry(0.03, 0.02, 0.008),
    chrome
  )
  catcher.position.set(0, T.body - 0.018, T.depth / 2 + 0.004)
  group.add(catcher)
  return group
}

// --- Bobber --------------------------------------------------------------

// A 2-3/8" red-and-white snap bobber riding the water: red top, white
// belly, the push stem on top. Origin at the waterline, which it floats a
// little below its middle.
export function buildBobber(): THREE.Group {
  const r = 0.03
  const group = new THREE.Group()
  group.name = 'bobber'
  const red = lambert({
    color: '#d2231e',
    emissive: new THREE.Color('#d2231e'),
    emissiveIntensity: 0.25,
  })
  const white = lambert({
    color: '#f2f0ea',
    emissive: new THREE.Color('#f2f0ea'),
    emissiveIntensity: 0.2,
  })
  const ball = new THREE.Group()
  ball.position.y = r * 0.25
  group.add(ball)
  ball.add(
    new THREE.Mesh(
      new THREE.SphereGeometry(r, 10, 4, 0, Math.PI * 2, 0, Math.PI / 2),
      red
    )
  )
  ball.add(
    new THREE.Mesh(
      new THREE.SphereGeometry(
        r,
        10,
        4,
        0,
        Math.PI * 2,
        Math.PI / 2,
        Math.PI / 2
      ),
      white
    )
  )
  const stem = new THREE.Mesh(
    new THREE.CylinderGeometry(0.004, 0.005, 0.014, 6),
    white
  )
  stem.position.y = r + 0.005
  ball.add(stem)
  const button = new THREE.Mesh(
    new THREE.CylinderGeometry(0.006, 0.006, 0.004, 6),
    red
  )
  button.position.y = r + 0.013
  ball.add(button)
  return group
}

// --- The slurm jar -------------------------------------------------------

// Erwin von Dutch's slurm jar: a gallon Mason jar, the glass gone cloudy,
// a tin lid with holes knocked through it with a nail, and a slurm curled
// in the bottom of it for good measure (slurmmodel.ts, shrunk).
export function buildSlurmJar({
  glow = true,
}: PickupOptions = {}): THREE.Group {
  const r = 0.085
  const h = 0.24
  const group = new THREE.Group()
  group.name = 'slurm-jar'
  const glass = lambert({
    color: '#a9c4bc',
    emissive: new THREE.Color('#1c2a26'),
    transparent: true,
    opacity: 0.38,
    depthWrite: false,
  })
  const tin = lambert({ color: '#9a978c' })
  const hole = lambert({ color: '#141414' })
  const body = new THREE.Mesh(
    new THREE.CylinderGeometry(r, r, h * 0.84, 12, 1, true),
    glass
  )
  body.position.y = h * 0.42
  group.add(body)
  const shoulder = new THREE.Mesh(
    new THREE.CylinderGeometry(r * 0.8, r, h * 0.1, 12, 1, true),
    glass
  )
  shoulder.position.y = h * 0.89
  group.add(shoulder)
  const bottom = new THREE.Mesh(new THREE.CircleGeometry(r, 12), glass)
  bottom.rotation.x = -Math.PI / 2
  bottom.position.y = 0.002
  group.add(bottom)
  const lid = new THREE.Mesh(
    new THREE.CylinderGeometry(r * 0.82, r * 0.82, h * 0.07, 12),
    tin
  )
  lid.position.y = h * 0.97
  group.add(lid)
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2
    const dot = new THREE.Mesh(new THREE.BoxGeometry(0.008, 0.002, 0.008), hole)
    dot.position.set(Math.cos(a) * r * 0.4, h + 0.002, Math.sin(a) * r * 0.4)
    group.add(dot)
  }
  const slurm = buildSlurm()
  slurm.pose({ stretch: 0, tooth: 0.6, splat: null })
  slurm.group.scale.setScalar(0.32)
  slurm.group.position.y = 0.004
  slurm.group.rotation.y = 0.8
  group.add(slurm.group)
  if (glow) {
    const halo = makeGlowSprite(
      makeGlowTexture('rgba(190, 220, 210, 0.35)'),
      0.6
    )
    halo.position.y = h / 2
    group.add(halo)
  }
  setPulseMaterials(group, [tin])
  return group
}

// A slurm taken alive, as the pack and a dropped one show it: whole, its
// tooth half out.
export function buildSlurmCatch(): THREE.Group {
  const slurm = buildSlurm()
  slurm.pose({ stretch: 0.3, tooth: 0.5, splat: null })
  return slurm.group
}

// --- The picnic table and its oil lantern ---------------------------------

// The table the tackle box sits on at every firefly pond: a park picnic
// table, its top and both benches one piece on A-frame legs at each end,
// the boards silvered and dark at their seams. Its long side runs across
// +X; the benches stand out on +Z and -Z. Metres.
export const PICNIC = {
  length: 1.8,
  top: { y: 0.76, depth: 0.76, boards: 5 },
  seat: { y: 0.45, depth: 0.26, out: 0.62 },
  board: 0.045,
  // How far in from each end the A-frames stand.
  inset: 0.28,
}

export function buildPicnicTable(): THREE.Group {
  const P = PICNIC
  const group = new THREE.Group()
  group.name = 'picnic-table'
  const rng = mulberry32(0x91c)
  // Weathered pine, each board a little lighter or darker than the next.
  const boardMaterials = ['#8a7a64', '#7d6e59', '#958670', '#71634f'].map(
    (color) => lambert({ color })
  )
  const frame = lambert({ color: '#5e5242' })
  const plank = (w: number, d: number, x: number, y: number, z: number) => {
    const mesh = new THREE.Mesh(
      new THREE.BoxGeometry(w, P.board, d * 0.94),
      boardMaterials[Math.floor(rng() * boardMaterials.length)]
    )
    mesh.position.set(x, y, z)
    group.add(mesh)
  }
  const step = P.top.depth / P.top.boards
  for (let i = 0; i < P.top.boards; i++) {
    plank(P.length, step, 0, P.top.y, -P.top.depth / 2 + step * (i + 0.5))
  }
  for (const side of [-1, 1]) {
    plank(P.length, P.seat.depth, 0, P.seat.y, side * P.seat.out)
  }
  // Each end: two legs splayed out from under the top to the ground past
  // the benches, a rail under the top, and one under both benches.
  const half = P.length / 2 - P.inset
  for (const end of [-half, half]) {
    for (const side of [-1, 1]) {
      const footZ = side * (P.seat.out + 0.08)
      const topZ = side * 0.16
      const rise = P.top.y
      const run = footZ - topZ
      const leg = new THREE.Mesh(
        new THREE.BoxGeometry(0.06, Math.hypot(rise, run), 0.09),
        frame
      )
      leg.position.set(end, rise / 2, (footZ + topZ) / 2)
      leg.rotation.x = Math.atan2(run, rise)
      group.add(leg)
    }
    const under = new THREE.Mesh(
      new THREE.BoxGeometry(0.06, 0.09, P.top.depth),
      frame
    )
    under.position.set(end, P.top.y - 0.07, 0)
    group.add(under)
    const seatRail = new THREE.Mesh(
      new THREE.BoxGeometry(0.06, 0.09, 2 * P.seat.out + P.seat.depth),
      frame
    )
    seatRail.position.set(end, P.seat.y - 0.07, 0)
    group.add(seatRail)
  }
  return group
}

// A hurricane lantern, lit: a tin fount of kerosene, the wick's flame in
// a glass globe between two guard wires, a vented cap and a bail to carry
// it by, and a warm halo big enough to find it by from across the field.
// `update(t)` flickers the flame and the halo.
export interface OilLantern {
  group: THREE.Group
  update(t: number): void
}

// The lantern's halo across, metres: seen from well off through the fog.
const LANTERN_HALO = 3.2

export function buildOilLantern(): OilLantern {
  const group = new THREE.Group()
  group.name = 'oil-lantern'
  const tin = lambert({ color: '#7a2a20' })
  const wire = lambert({ color: '#2b2b2b' })
  const fount = new THREE.Mesh(
    new THREE.CylinderGeometry(0.07, 0.08, 0.07, 12),
    tin
  )
  fount.position.y = 0.035
  group.add(fount)
  const collar = new THREE.Mesh(
    new THREE.CylinderGeometry(0.045, 0.06, 0.02, 12),
    wire
  )
  collar.position.y = 0.08
  group.add(collar)
  // The globe: amber glass, lit from inside.
  const globe = new THREE.Mesh(
    new THREE.SphereGeometry(0.06, 12, 8),
    new THREE.MeshBasicMaterial({
      color: '#ffcf7a',
      transparent: true,
      opacity: 0.55,
      depthWrite: false,
    })
  )
  globe.scale.y = 1.35
  globe.position.y = 0.16
  group.add(globe)
  const flameMaterial = new THREE.MeshBasicMaterial({ color: '#ffe2a0' })
  const flame = new THREE.Mesh(
    new THREE.ConeGeometry(0.012, 0.045, 6),
    flameMaterial
  )
  flame.position.y = 0.14
  group.add(flame)
  // Two guard wires up either side of the globe, and the cap over it.
  for (const side of [-1, 1]) {
    const guard = new THREE.Mesh(
      new THREE.CylinderGeometry(0.004, 0.004, 0.18, 4),
      wire
    )
    guard.position.set(side * 0.075, 0.17, 0)
    group.add(guard)
  }
  const cap = new THREE.Mesh(
    new THREE.CylinderGeometry(0.035, 0.07, 0.04, 12),
    tin
  )
  cap.position.y = 0.27
  group.add(cap)
  const bail = new THREE.Mesh(
    new THREE.TorusGeometry(0.07, 0.004, 4, 16, Math.PI),
    wire
  )
  bail.position.y = 0.29
  group.add(bail)
  const halo = makeGlowSprite(makeGlowTexture('#ffb050'), LANTERN_HALO)
  halo.position.y = 0.16
  group.add(halo)
  return {
    group,
    update(t) {
      // Two waves out of step: a slow breath and a quick guttering.
      const flicker =
        0.85 + 0.1 * Math.sin(t * 2.3) + 0.05 * Math.sin(t * 13.7 + 1.3)
      halo.scale.setScalar(LANTERN_HALO * flicker)
      flame.scale.y = 0.8 + 0.4 * (flicker - 0.75)
    },
  }
}
