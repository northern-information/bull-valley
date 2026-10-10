// The map editor behind Akashic's Map mode (akashicmap.ts): pure edits over
// the survey (geo.json), in its own unit square (x right/east, y down/south).
// Every edit is a patch on one slot of one layer (a feature replaced, added
// or removed), so undo is the same patch backwards. No three.js, no DOM:
// tests/unit/mapedit.test.ts runs it in Node.

import { pointInPolygon } from './coords.ts'
import type {
  FuelStation,
  Geo,
  Graveyard,
  Reserve,
  Ring,
  Road,
  RoadClass,
  UnitPoint,
  Water,
} from './interfaces.ts'

export type LayerId =
  | 'roads'
  | 'water'
  | 'wetland'
  | 'reserves'
  | 'graveyards'
  | 'fuel'
  | 'boundary'

// How a layer's features are drawn and edited: a line through its points,
// a closed area, or a single point. Water is either, feature by feature.
export type Shape = 'line' | 'area' | 'point'

export interface LayerSpec {
  id: LayerId
  label: string
  // The shape of a new feature drawn on this layer.
  shape: Shape
}

// Top of the list draws last and is hit first.
export const LAYERS: readonly LayerSpec[] = [
  { id: 'fuel', label: 'Fuel stations', shape: 'point' },
  { id: 'roads', label: 'Roads', shape: 'line' },
  { id: 'water', label: 'Water', shape: 'area' },
  { id: 'graveyards', label: 'Graveyards', shape: 'area' },
  { id: 'reserves', label: 'Reserves', shape: 'area' },
  { id: 'wetland', label: 'Wetland', shape: 'area' },
  { id: 'boundary', label: 'Village boundary', shape: 'area' },
]

export const ROAD_CLASSES: readonly RoadClass[] = [
  'primary',
  'secondary',
  'tertiary',
  'residential',
  'unclassified',
]

export type Feature = Road | Water | Ring | Reserve | Graveyard | FuelStation

export interface FeatureRef {
  layer: LayerId
  index: number
}

// The survey keeps four decimals (about 1.5 m across the 15 km frame).
function roundUnit(n: number): number {
  return Math.round(n * 1e4) / 1e4
}

export function snapPoint(u: number, v: number): UnitPoint {
  const clamp = (n: number) => Math.min(1, Math.max(0, n))
  return [roundUnit(clamp(u)), roundUnit(clamp(v))]
}

function layerList(geo: Geo, layer: LayerId): Feature[] {
  return geo[layer]
}

export function featureAt(geo: Geo, ref: FeatureRef): Feature | undefined {
  return layerList(geo, ref.layer)[ref.index]
}

export function shapeOf(layer: LayerId, f: Feature): Shape {
  if (layer === 'fuel') return 'point'
  if (layer === 'roads') return 'line'
  if (layer === 'water') return (f as Water).k === 'line' ? 'line' : 'area'
  return 'area'
}

// The feature's points: a fuel station is its one point.
export function pointsOf(layer: LayerId, f: Feature): Ring {
  if (layer === 'fuel') return [(f as FuelStation).p]
  if (layer === 'wetland' || layer === 'boundary') return f as Ring
  return (f as Road | Water | Reserve | Graveyard).p
}

function centroid(ring: Ring): UnitPoint {
  let u = 0
  let v = 0
  for (const [x, y] of ring) {
    u += x
    v += y
  }
  const n = Math.max(1, ring.length)
  return [roundUnit(u / n), roundUnit(v / n)]
}

// A copy of the feature with new points. A graveyard's centre follows its
// fence.
function withPoints(layer: LayerId, f: Feature, ring: Ring): Feature {
  if (layer === 'fuel') return { ...(f as FuelStation), p: ring[0] }
  if (layer === 'wetland' || layer === 'boundary') return ring
  if (layer === 'graveyards') {
    return { ...(f as Graveyard), p: ring, c: centroid(ring) }
  }
  return { ...(f as Road | Water | Reserve), p: ring }
}

// The fewest points a feature of this shape can keep.
export function minPoints(shape: Shape): number {
  return shape === 'area' ? 3 : shape === 'line' ? 2 : 1
}

export function nameOf(layer: LayerId, f: Feature): string {
  if (layer === 'wetland' || layer === 'boundary') return ''
  return (f as Road).n
}

// A new feature of the layer through these points.
export function newFeature(
  layer: LayerId,
  ring: Ring,
  shape: Shape = LAYERS.find((l) => l.id === layer)?.shape ?? 'area'
): Feature {
  switch (layer) {
    case 'fuel':
      return { n: '', p: ring[0] }
    case 'roads':
      return { c: 'residential', n: '', p: ring }
    case 'water':
      return { k: shape === 'line' ? 'line' : 'area', n: '', p: ring }
    case 'graveyards':
      return { n: '', c: centroid(ring), p: ring }
    case 'reserves':
      return { n: '', p: ring }
    default:
      return ring
  }
}

// --- Patches ---------------------------------------------------------------

// One slot of one layer: before null adds a feature at index, after null
// removes the one there, both set replaces it.
export interface Patch {
  layer: LayerId
  index: number
  before: Feature | null
  after: Feature | null
}

export function applyPatch(geo: Geo, patch: Patch): void {
  const list = layerList(geo, patch.layer)
  if (patch.before === null && patch.after !== null) {
    list.splice(patch.index, 0, patch.after)
  } else if (patch.after === null) {
    list.splice(patch.index, 1)
  } else {
    list[patch.index] = patch.after
  }
}

export function invert(patch: Patch): Patch {
  return { ...patch, before: patch.after, after: patch.before }
}

function replace(geo: Geo, ref: FeatureRef, after: Feature): Patch | null {
  const before = featureAt(geo, ref)
  if (!before) return null
  return { layer: ref.layer, index: ref.index, before, after }
}

export function moveVertex(
  geo: Geo,
  ref: FeatureRef,
  vertex: number,
  to: UnitPoint
): Patch | null {
  const f = featureAt(geo, ref)
  if (!f) return null
  const ring = pointsOf(ref.layer, f).slice()
  if (vertex < 0 || vertex >= ring.length) return null
  ring[vertex] = snapPoint(to[0], to[1])
  return replace(geo, ref, withPoints(ref.layer, f, ring))
}

// Every point of the feature moved by (du, dv).
export function moveFeature(
  geo: Geo,
  ref: FeatureRef,
  du: number,
  dv: number
): Patch | null {
  const f = featureAt(geo, ref)
  if (!f) return null
  const ring = pointsOf(ref.layer, f).map(([u, v]) => snapPoint(u + du, v + dv))
  return replace(geo, ref, withPoints(ref.layer, f, ring))
}

// A new point at position `at` in the feature's list (after vertex at - 1).
export function insertVertex(
  geo: Geo,
  ref: FeatureRef,
  at: number,
  point: UnitPoint
): Patch | null {
  const f = featureAt(geo, ref)
  if (!f || shapeOf(ref.layer, f) === 'point') return null
  const ring = pointsOf(ref.layer, f).slice()
  ring.splice(at, 0, snapPoint(point[0], point[1]))
  return replace(geo, ref, withPoints(ref.layer, f, ring))
}

// Null when the feature would fall below its shape's fewest points; delete
// the feature instead.
export function deleteVertex(
  geo: Geo,
  ref: FeatureRef,
  vertex: number
): Patch | null {
  const f = featureAt(geo, ref)
  if (!f) return null
  const ring = pointsOf(ref.layer, f).slice()
  if (ring.length <= minPoints(shapeOf(ref.layer, f))) return null
  if (vertex < 0 || vertex >= ring.length) return null
  ring.splice(vertex, 1)
  return replace(geo, ref, withPoints(ref.layer, f, ring))
}

export function deleteFeature(geo: Geo, ref: FeatureRef): Patch | null {
  const before = featureAt(geo, ref)
  if (!before) return null
  return { layer: ref.layer, index: ref.index, before, after: null }
}

// Appended to the layer, so no other feature's index moves.
export function addFeature(geo: Geo, layer: LayerId, f: Feature): Patch {
  return {
    layer,
    index: layerList(geo, layer).length,
    before: null,
    after: f,
  }
}

export interface FeatureProps {
  n?: string
  c?: RoadClass
  k?: Water['k']
}

// Name, road class or water kind; a layer without that property ignores it.
export function setProps(
  geo: Geo,
  ref: FeatureRef,
  props: FeatureProps
): Patch | null {
  const f = featureAt(geo, ref)
  if (!f || Array.isArray(f)) return null
  const next: Record<string, unknown> = { ...f }
  if (props.n !== undefined) next.n = props.n
  if (props.c !== undefined && ref.layer === 'roads') next.c = props.c
  if (props.k !== undefined && ref.layer === 'water') {
    next.k = props.k
    // An area needs three points.
    if (props.k === 'area' && (f as Water).p.length < 3) return null
  }
  return replace(geo, ref, next as unknown as Feature)
}

// --- History ---------------------------------------------------------------

interface Entry {
  patch: Patch
  // Consecutive commits under one key (a drag) are one undo step.
  key: string | null
}

export class History {
  private done: Entry[] = []
  private undone: Entry[] = []
  // done.length when last saved; -1 once that state is unreachable.
  private savedAt = 0

  private readonly geo: Geo

  constructor(geo: Geo) {
    this.geo = geo
  }

  commit(patch: Patch | null, key: string | null = null): boolean {
    if (!patch) return false
    applyPatch(this.geo, patch)
    const last = this.done[this.done.length - 1]
    if (key !== null && last?.key === key && this.undone.length === 0) {
      last.patch = { ...last.patch, after: patch.after }
      if (this.savedAt === this.done.length) this.savedAt = -1
    } else {
      if (this.savedAt > this.done.length) this.savedAt = -1
      this.done.push({ patch, key })
    }
    this.undone = []
    return true
  }

  // Ends a run of keyed commits, so the next one is its own step.
  seal(): void {
    const last = this.done[this.done.length - 1]
    if (last) last.key = null
  }

  undo(): Patch | null {
    const entry = this.done.pop()
    if (!entry) return null
    const back = invert(entry.patch)
    applyPatch(this.geo, back)
    this.undone.push({ ...entry, key: null })
    return back
  }

  redo(): Patch | null {
    const entry = this.undone.pop()
    if (!entry) return null
    applyPatch(this.geo, entry.patch)
    this.done.push(entry)
    return entry.patch
  }

  get canUndo(): boolean {
    return this.done.length > 0
  }

  get canRedo(): boolean {
    return this.undone.length > 0
  }

  get dirty(): boolean {
    return this.savedAt !== this.done.length
  }

  markSaved(): void {
    this.savedAt = this.done.length
  }
}

// --- Hit testing -----------------------------------------------------------

export interface Hit {
  ref: FeatureRef
  // A vertex hit, by index.
  vertex?: number
  // A segment hit: the point between vertex segment and segment + 1 (the
  // closing edge of an area ends at 0), and the nearest point on it.
  segment?: number
  at?: UnitPoint
}

function segmentProject(
  p: UnitPoint,
  a: UnitPoint,
  b: UnitPoint
): { d: number; at: UnitPoint } {
  const dx = b[0] - a[0]
  const dy = b[1] - a[1]
  const len2 = dx * dx + dy * dy
  const t =
    len2 === 0
      ? 0
      : Math.max(
          0,
          Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / len2)
        )
  const at: UnitPoint = [a[0] + dx * t, a[1] + dy * t]
  return { d: Math.hypot(p[0] - at[0], p[1] - at[1]), at }
}

function segmentsOf(ring: Ring, shape: Shape): [number, number][] {
  const out: [number, number][] = []
  for (let i = 0; i < ring.length - 1; i++) out.push([i, i + 1])
  if (shape === 'area' && ring.length > 2) out.push([ring.length - 1, 0])
  return out
}

function signedArea(ring: Ring): number {
  let a = 0
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    a += (ring[j][0] + ring[i][0]) * (ring[j][1] - ring[i][1])
  }
  return a / 2
}

// What a click at p lands on, within tolerance (unit square). A vertex of
// the preferred feature (the selection) first, then any vertex, then any
// line or edge, then the smallest area the point is inside. Layers earlier
// in LAYERS win ties.
export function hitTest(
  geo: Geo,
  layers: readonly LayerId[],
  p: UnitPoint,
  tolerance: number,
  prefer: FeatureRef | null = null
): Hit | null {
  const order = LAYERS.map((l) => l.id).filter((id) => layers.includes(id))

  if (prefer && order.includes(prefer.layer)) {
    const f = featureAt(geo, prefer)
    if (f) {
      const ring = pointsOf(prefer.layer, f)
      let best = -1
      let bestD = tolerance
      for (let i = 0; i < ring.length; i++) {
        const d = Math.hypot(ring[i][0] - p[0], ring[i][1] - p[1])
        if (d <= bestD) {
          bestD = d
          best = i
        }
      }
      if (best >= 0) return { ref: prefer, vertex: best }
    }
  }

  let vertexHit: Hit | null = null
  let vertexD = tolerance
  let edgeHit: Hit | null = null
  let edgeD = tolerance
  let areaHit: Hit | null = null
  let areaSize = Infinity

  for (const layer of order) {
    const list = layerList(geo, layer)
    for (let index = 0; index < list.length; index++) {
      const f = list[index]
      const ring = pointsOf(layer, f)
      const shape = shapeOf(layer, f)
      const ref = { layer, index }
      for (let i = 0; i < ring.length; i++) {
        const d = Math.hypot(ring[i][0] - p[0], ring[i][1] - p[1])
        if (d < vertexD) {
          vertexD = d
          vertexHit = { ref, vertex: i }
        }
      }
      for (const [i, j] of segmentsOf(ring, shape)) {
        const s = segmentProject(p, ring[i], ring[j])
        if (s.d < edgeD) {
          edgeD = s.d
          edgeHit = { ref, segment: i, at: s.at }
        }
      }
      if (shape === 'area' && ring.length >= 3) {
        if (pointInPolygon(p[0], p[1], ring)) {
          const size = Math.abs(signedArea(ring))
          if (size < areaSize) {
            areaSize = size
            areaHit = { ref }
          }
        }
      }
    }
  }
  return vertexHit ?? edgeHit ?? areaHit
}

// --- Reading ---------------------------------------------------------------

// A feature's length along its points (an area round its edge, closed), in
// metres of the survey.
export function lengthMetres(
  ring: Ring,
  shape: Shape,
  metres: Geo['metres']
): number {
  let total = 0
  for (const [i, j] of segmentsOf(ring, shape)) {
    total += Math.hypot(
      (ring[j][0] - ring[i][0]) * metres.width,
      (ring[j][1] - ring[i][1]) * metres.height
    )
  }
  return total
}

export function areaSquareMetres(ring: Ring, metres: Geo['metres']): number {
  return Math.abs(signedArea(ring)) * metres.width * metres.height
}

// The file as committed: minified, no trailing newline (CLAUDE.md rule 5).
export function serializeGeo(geo: Geo): string {
  return JSON.stringify(geo)
}

const LAYER_IDS = LAYERS.map((l) => l.id)

function isPoint(p: unknown): p is UnitPoint {
  return (
    Array.isArray(p) &&
    p.length === 2 &&
    p.every((n) => typeof n === 'number' && Number.isFinite(n))
  )
}

function isRing(r: unknown): r is Ring {
  return Array.isArray(r) && r.every(isPoint)
}

// Whether a body is a survey a save may write: the frame's fields and every
// layer a list of well-formed features.
export function isGeo(value: unknown): value is Geo {
  if (typeof value !== 'object' || value === null) return false
  const g = value as Record<string, unknown>
  if (typeof g.bbox !== 'object' || g.bbox === null) return false
  if (typeof g.metres !== 'object' || g.metres === null) return false
  if (typeof g.terrain !== 'object' || g.terrain === null) return false
  for (const layer of LAYER_IDS) {
    const list = g[layer]
    if (!Array.isArray(list)) return false
    for (const f of list as unknown[]) {
      if (layer === 'wetland' || layer === 'boundary') {
        if (!isRing(f)) return false
        continue
      }
      if (typeof f !== 'object' || f === null) return false
      const o = f as Record<string, unknown>
      if (typeof o.n !== 'string') return false
      if (layer === 'fuel' ? !isPoint(o.p) : !isRing(o.p)) return false
      if (layer === 'roads' && !ROAD_CLASSES.includes(o.c as RoadClass)) {
        return false
      }
      if (layer === 'water' && o.k !== 'area' && o.k !== 'line') return false
      if (layer === 'graveyards' && !isPoint(o.c)) return false
    }
  }
  return true
}
