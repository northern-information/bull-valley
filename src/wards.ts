// Pure: the wards (sharedworld.ts rules 24 and 27). Each of the raider's
// four levels (wardlevels.ts) is a layer of armor against its own shadows:
// high against the shadowmen, stimulated against the spiders and their
// spiderlings, drunk against the Caretaker, a trip against the
// Undercroft's tunnel shades and the Warden. Each shadow's touch takes its
// own hit off geometrie (CONFIG.damage, give or take its spread on the
// valley's roll), and the wards cut it: the matching corner by up to
// CONFIG.wards.matching, the strongest other by up to `other`, never past
// `cap`. And the tetrahedron hud.ts turns, one corner a ward. No three.js,
// no DOM.

import { CONFIG } from './config.ts'
import { AXES } from './wardlevels.ts'
import type { WardAxis } from './interfaces.ts'

// Whatever can touch a raider.
export type ShadowHit =
  'man' | 'spider' | 'spiderling' | 'caretaker' | 'shade' | 'warden'

export const SHADOW_HITS: readonly ShadowHit[] = [
  'spiderling',
  'man',
  'spider',
  'shade',
  'caretaker',
  'warden',
]

// The ward each shadow fears.
export const WARD_OF: Readonly<Record<ShadowHit, WardAxis>> = {
  man: 'high',
  spider: 'stimulated',
  spiderling: 'stimulated',
  caretaker: 'drunk',
  shade: 'tripping',
  warden: 'tripping',
}

// The shadows a ward is against, in SHADOW_HITS' order.
export function wardedBy(axis: WardAxis): ShadowHit[] {
  return SHADOW_HITS.filter((by) => WARD_OF[by] === axis)
}

// The Book of Shadows' page for each shadow (book.ts), and what strikes
// as it.
const BOOK_SHADOWS: Readonly<Record<string, ShadowHit>> = {
  shadowman: 'man',
  spider: 'spider',
  spiderling: 'spiderling',
  caretaker: 'caretaker',
  'tunnel-shade': 'shade',
  warden: 'warden',
}

// The ward against the shadow a Book of Shadows page names, or null for
// a page that names none.
export function wardOfEntry(id: string): WardAxis | null {
  const by = Object.hasOwn(BOOK_SHADOWS, id) ? BOOK_SHADOWS[id] : null
  return by ? WARD_OF[by] : null
}

type Levels = Readonly<Record<WardAxis, number>>

// The share of a touch from `by` the wards at `levels` take off, 0 to cap.
export function wardOf(
  levels: Levels,
  by: ShadowHit,
  cfg = CONFIG.wards
): number {
  const axis = WARD_OF[by]
  const level = (a: WardAxis): number =>
    Math.max(0, Math.min(1, levels[a] || 0))
  let other = 0
  for (const a of AXES) if (a !== axis) other = Math.max(other, level(a))
  const ward = cfg.matching * level(axis) + cfg.other * other
  return Math.min(cfg.cap, ward)
}

export interface Damage {
  // What the touch took.
  damage: number
  // What the wards took off it.
  warded: number
}

// What a touch from `by` takes off a raider warded at `levels`, `roll`
// drawn from 0 to 1 by the caller (the valley, or alone the client): its
// hit give or take its spread, and the wards' cut of that. A missing roll
// lands square in the middle.
export function damageOf(
  by: ShadowHit,
  levels: Levels,
  roll = 0.5,
  cfg = { damage: CONFIG.damage, wards: CONFIG.wards }
): Damage {
  const r = Number.isFinite(roll) ? Math.max(0, Math.min(1, roll)) : 0.5
  const base = Math.round(
    cfg.damage[by] * (1 + cfg.damage.spread * (2 * r - 1))
  )
  const damage = Math.round(base * (1 - wardOf(levels, by, cfg.wards)))
  return { damage, warded: base - damage }
}

// Whether a wire value names a shadow.
export function isShadowHit(value: unknown): value is ShadowHit {
  return SHADOW_HITS.includes(value as ShadowHit)
}

// A corner of the tetrahedron as drawn: x and y in a 100-unit box, y down,
// and depth (toward the viewer is larger).
export interface Corner {
  axis: WardAxis
  x: number
  y: number
  depth: number
}

// A regular tetrahedron round the origin, unit circumradius: high at the
// top, the other three round its base.
const TETRA: Readonly<Record<WardAxis, readonly [number, number, number]>> =
  (() => {
    const base = -1 / 3
    const r = Math.sqrt(8 / 9)
    const at = (turn: number): [number, number, number] => [
      r * Math.sin(turn),
      base,
      r * Math.cos(turn),
    ]
    return {
      high: [0, 1, 0],
      stimulated: at((2 * Math.PI) / 3),
      drunk: at((4 * Math.PI) / 3),
      tripping: at(0),
    }
  })()

// The tetrahedron's faces, each its three corners.
export const TETRA_FACES: readonly (readonly [WardAxis, WardAxis, WardAxis])[] =
  [
    ['high', 'stimulated', 'drunk'],
    ['high', 'drunk', 'tripping'],
    ['high', 'tripping', 'stimulated'],
    ['stimulated', 'tripping', 'drunk'],
  ]

// The four corners turned `turn` radians about the upright and tipped
// `tilt` toward the viewer, flattened into a 100-unit box (orthographic,
// the corners snapped to whole units the way the PS1 snapped vertices).
export function tetraCorners(turn: number, tilt = 0.55): Corner[] {
  const cy = Math.cos(turn)
  const sy = Math.sin(turn)
  const ct = Math.cos(tilt)
  const st = Math.sin(tilt)
  return AXES.map((axis) => {
    const [x0, y0, z0] = TETRA[axis]
    const x1 = x0 * cy + z0 * sy
    const z1 = -x0 * sy + z0 * cy
    const y2 = y0 * ct - z1 * st
    const z2 = y0 * st + z1 * ct
    return {
      axis,
      x: Math.round(50 + x1 * 44),
      y: Math.round(54 - y2 * 44),
      depth: z2,
    }
  })
}

// The tetrahedron as drawn at `turn`: its corners, each edge and whether a
// face toward the viewer holds it (the rest show faint, behind), and the
// outline round it (three corners or four, in order round it).
export interface TetraView {
  corners: Readonly<Record<WardAxis, Corner>>
  edges: { a: WardAxis; b: WardAxis; front: boolean }[]
  hull: Corner[]
}

export function tetraView(turn: number, tilt = 0.55): TetraView {
  const list = tetraCorners(turn, tilt)
  const corners = Object.fromEntries(list.map((c) => [c.axis, c])) as Record<
    WardAxis,
    Corner
  >
  // A regular tetrahedron's altitude runs through its face's middle, so a
  // face looks toward the viewer when its middle stands nearer than the
  // corner across from it.
  const front = TETRA_FACES.filter((face) => {
    const across = AXES.find((a) => !face.includes(a))!
    const middle = face.reduce((sum, a) => sum + corners[a].depth, 0) / 3
    return middle > corners[across].depth
  })
  const edges: TetraView['edges'] = []
  for (let i = 0; i < AXES.length; i++) {
    for (let j = i + 1; j < AXES.length; j++) {
      const a = AXES[i]
      const b = AXES[j]
      edges.push({
        a,
        b,
        front: front.some((face) => face.includes(a) && face.includes(b)),
      })
    }
  }
  return { corners, edges, hull: hullOf(list) }
}

// The outline round three or four points, in order round their middle;
// a point inside the triangle of the others is left out.
function hullOf(points: readonly Corner[]): Corner[] {
  const side = (o: Corner, a: Corner, b: Corner): number =>
    (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x)
  const inside = (p: Corner, [a, b, c]: Corner[]): boolean => {
    const d1 = side(a, b, p)
    const d2 = side(b, c, p)
    const d3 = side(c, a, p)
    const neg = d1 < 0 || d2 < 0 || d3 < 0
    const pos = d1 > 0 || d2 > 0 || d3 > 0
    return !(neg && pos)
  }
  const kept = points.filter(
    (p) =>
      !inside(
        p,
        points.filter((q) => q !== p)
      )
  )
  const ring = kept.length >= 3 ? kept : [...points]
  const cx = ring.reduce((sum, p) => sum + p.x, 0) / ring.length
  const cy = ring.reduce((sum, p) => sum + p.y, 0) / ring.length
  return [...ring].sort(
    (a, b) => Math.atan2(a.y - cy, a.x - cx) - Math.atan2(b.y - cy, b.x - cx)
  )
}
