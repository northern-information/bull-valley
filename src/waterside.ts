// Pure: where the water is, as the valley needs to know it. The shadow
// spiders come up more often near water (shadowmen.ts), and the valley
// never loads the survey, so the client sends it a map of the water's
// edges (protocol.ts hello): one bit per square cell over the survey, set
// where a shoreline or a stream passes through, base64 on the wire, a few
// kilobytes for the whole valley. The world keeps it (sharedworld.ts
// rule 11). No three.js.

import { unitToWorld } from './coords.ts'
import type { Metres, Water, XZ } from './interfaces.ts'

export interface WaterMap {
  // The cell's side in metres; cols across x and rows down z, from the
  // survey's north-west corner.
  cell: number
  cols: number
  rows: number
  // One bit per cell, row by row, low bit first, base64.
  bits: string
}

// The cell side the client draws its map at.
export const WATER_CELL = 100

// The most cells a map may hold: a 15 km survey at 100 m is about 23 000.
export const WATER_CELLS_MAX = 250_000

// Cells are marked by sampling each edge at a quarter of a cell.
const SAMPLES_PER_CELL = 4

const byteLength = (cells: number) => Math.ceil(cells / 8)

function encode(bytes: Uint8Array): string {
  let text = ''
  for (const byte of bytes) text += String.fromCharCode(byte)
  return btoa(text)
}

function decode(bits: string): Uint8Array {
  const text = atob(bits)
  const bytes = new Uint8Array(text.length)
  for (let i = 0; i < text.length; i++) bytes[i] = text.charCodeAt(i)
  return bytes
}

// The water's edges, every area's shoreline and every line, as a map.
export function waterMapOf(
  water: readonly Water[],
  metres: Metres,
  cell = WATER_CELL
): WaterMap {
  const cols = Math.ceil(metres.width / cell)
  const rows = Math.ceil(metres.height / cell)
  const bytes = new Uint8Array(byteLength(cols * rows))
  const mark = ({ x, z }: XZ) => {
    const c = Math.floor((x + metres.width / 2) / cell)
    const r = Math.floor((z + metres.height / 2) / cell)
    if (c < 0 || r < 0 || c >= cols || r >= rows) return
    const i = r * cols + c
    bytes[i >> 3] |= 1 << (i & 7)
  }
  for (const feature of water) {
    const points = feature.p.map(([u, v]) => unitToWorld(u, v, metres))
    if (points.length === 1) mark(points[0])
    for (let k = 1; k < points.length; k++) {
      const a = points[k - 1]
      const b = points[k]
      const steps = Math.max(
        1,
        Math.ceil((Math.hypot(b.x - a.x, b.z - a.z) * SAMPLES_PER_CELL) / cell)
      )
      for (let s = 0; s <= steps; s++) {
        const t = s / steps
        mark({ x: a.x + (b.x - a.x) * t, z: a.z + (b.z - a.z) * t })
      }
    }
  }
  return { cell, cols, rows, bits: encode(bytes) }
}

// A map with no water anywhere, for a valley that was never told.
export function dryMap(metres: Metres, cell = WATER_CELL): WaterMap {
  return waterMapOf([], metres, cell)
}

// Whether a value off the wire is a map: a sane cell, a grid no bigger
// than WATER_CELLS_MAX, and exactly its bits in base64.
export function isWaterMap(value: unknown): value is WaterMap {
  if (typeof value !== 'object' || value === null) return false
  const { cell, cols, rows, bits } = value as Record<string, unknown>
  const whole = (n: unknown): n is number =>
    typeof n === 'number' && Number.isInteger(n) && n > 0
  if (!whole(cell) || cell < 10 || cell > 1000) return false
  if (!whole(cols) || !whole(rows) || cols * rows > WATER_CELLS_MAX) {
    return false
  }
  if (typeof bits !== 'string') return false
  if (bits.length !== Math.ceil(byteLength(cols * rows) / 3) * 4) return false
  return /^[A-Za-z0-9+/]*={0,2}$/.test(bits)
}

// Decoded once per map: the step asks often.
const decoded = new WeakMap<WaterMap, Uint8Array>()

function bytesOf(map: WaterMap): Uint8Array {
  let bytes = decoded.get(map)
  if (!bytes) {
    try {
      bytes = decode(map.bits)
    } catch {
      bytes = new Uint8Array(0)
    }
    decoded.set(map, bytes)
  }
  return bytes
}

// Whether water's edge lies within `radius` metres of p, to the map's
// cell: any marked cell whose square comes that close.
export function nearWater(
  map: WaterMap,
  metres: Metres,
  p: XZ,
  radius: number
): boolean {
  const bytes = bytesOf(map)
  const { cell, cols, rows } = map
  const px = p.x + metres.width / 2
  const pz = p.z + metres.height / 2
  const c0 = Math.max(0, Math.floor((px - radius) / cell))
  const c1 = Math.min(cols - 1, Math.floor((px + radius) / cell))
  const r0 = Math.max(0, Math.floor((pz - radius) / cell))
  const r1 = Math.min(rows - 1, Math.floor((pz + radius) / cell))
  for (let r = r0; r <= r1; r++) {
    for (let c = c0; c <= c1; c++) {
      const i = r * cols + c
      if (!((bytes[i >> 3] ?? 0) & (1 << (i & 7)))) continue
      // The nearest point of the cell's square to p.
      const nx = Math.max(c * cell, Math.min(px, (c + 1) * cell))
      const nz = Math.max(r * cell, Math.min(pz, (r + 1) * cell))
      if (Math.hypot(nx - px, nz - pz) <= radius) return true
    }
  }
  return false
}
