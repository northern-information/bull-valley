// Pure: the valley's heightmap as both the client and the valley read it.
// The committed terrain.png packs 16 bits of normalized elevation into R
// (high byte) and G (low byte); `decodeTerrainPng` reads it without a
// canvas (the valley has none), and `heightGrid` decimates it to the grid
// everything stands on (terrain.ts draws that grid; the valley stands its
// shadowmen on it, sharedworld.ts rule 11), so the two agree. `valleyGround`
// cuts Castle Entropy's moat into it, as world.ts does. No three.js, no
// DOM: only the Compression Streams every browser, Node and the Workers
// runtime share.

import { bilinearHeight } from './coords.ts'
import { carve, moatFloor } from './moat.ts'
import type { Geo, HeightAt } from './interfaces.ts'
import type { MazePlace } from './maze.ts'

// Where the map is served from: geo.json and terrain.png, beside the page
// and in the Worker's own assets.
export const DATA_BASE = '/data/bull-valley'

// The decoded heightmap: size×size heights, normalized 0..1.
export interface TerrainData {
  heights: Float32Array
  size: number
}

// The grid the ground is sampled from: n×n heights in metres of relief
// over the valley floor, and the bilinear height at any world point.
export interface HeightGrid {
  seg: number
  n: number
  grid: Float32Array
  relief: number
  raw: HeightAt
}

const SIGNATURE = [137, 80, 78, 71, 13, 10, 26, 10]

// A PNG's pixels as rows of bytes, for the 8-bit, non-interlaced RGB or
// RGBA a heightmap is saved as; anything else is refused.
export async function decodeTerrainPng(
  bytes: Uint8Array
): Promise<TerrainData> {
  if (SIGNATURE.some((b, i) => bytes[i] !== b)) {
    throw new Error('Not a PNG')
  }
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  let width = 0
  let height = 0
  let channels = 0
  const data: Uint8Array[] = []
  for (let at = 8; at < bytes.length;) {
    const length = view.getUint32(at)
    const type = String.fromCharCode(...bytes.subarray(at + 4, at + 8))
    const body = bytes.subarray(at + 8, at + 8 + length)
    if (type === 'IHDR') {
      width = view.getUint32(at + 8)
      height = view.getUint32(at + 12)
      const [depth, colour, , , interlace] = body.subarray(8, 13)
      channels = colour === 2 ? 3 : colour === 6 ? 4 : 0
      if (depth !== 8 || channels === 0 || interlace !== 0) {
        throw new Error('Unsupported PNG: 8-bit RGB or RGBA only')
      }
    } else if (type === 'IDAT') {
      data.push(body)
    } else if (type === 'IEND') {
      break
    }
    at += 12 + length
  }
  if (width === 0 || width !== height) throw new Error('Not a square PNG')
  const raw = await inflate(data)
  const stride = width * channels
  if (raw.length < height * (stride + 1)) throw new Error('Truncated PNG')
  const pixels = unfilter(raw, height, stride, channels)
  const heights = new Float32Array(width * height)
  for (let k = 0; k < heights.length; k++) {
    heights[k] = (pixels[k * channels] * 256 + pixels[k * channels + 1]) / 65535
  }
  return { heights, size: width }
}

// The zlib stream the IDAT chunks hold between them, inflated.
async function inflate(parts: readonly Uint8Array[]): Promise<Uint8Array> {
  const zipped = join(parts)
  const stream = new DecompressionStream('deflate')
  const writer = stream.writable.getWriter()
  void writer.write(zipped).then(() => writer.close())
  const reader = stream.readable.getReader()
  const out: Uint8Array[] = []
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    out.push(value)
  }
  return join(out)
}

function join(parts: readonly Uint8Array[]): Uint8Array<ArrayBuffer> {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0))
  let at = 0
  for (const p of parts) {
    out.set(p, at)
    at += p.length
  }
  return out
}

// Each row's filter undone (PNG's None, Sub, Up, Average and Paeth).
function unfilter(
  raw: Uint8Array,
  rows: number,
  stride: number,
  bpp: number
): Uint8Array {
  const out = new Uint8Array(rows * stride)
  for (let y = 0; y < rows; y++) {
    const filter = raw[y * (stride + 1)]
    const src = y * (stride + 1) + 1
    const row = y * stride
    const prev = row - stride
    for (let x = 0; x < stride; x++) {
      const left = x >= bpp ? out[row + x - bpp] : 0
      const up = y > 0 ? out[prev + x] : 0
      const corner = y > 0 && x >= bpp ? out[prev + x - bpp] : 0
      let add = 0
      if (filter === 1) add = left
      else if (filter === 2) add = up
      else if (filter === 3) add = (left + up) >> 1
      else if (filter === 4) add = paeth(left, up, corner)
      else if (filter !== 0) throw new Error('Bad PNG filter')
      out[row + x] = (raw[src + x] + add) & 0xff
    }
  }
  return out
}

function paeth(a: number, b: number, c: number): number {
  const p = a + b - c
  const pa = Math.abs(p - a)
  const pb = Math.abs(p - b)
  const pc = Math.abs(p - c)
  if (pa <= pb && pa <= pc) return a
  return pb <= pc ? b : c
}

// The playable height field, in metres of relief above the valley floor:
// the heightmap decimated to `seg` cells a side. Everything that stands on
// the ground samples THIS grid, never the full-resolution map, or it sinks
// below or floats above the drawn surface where the two disagree.
//
// seg 480 over the ~15 km frame is ~31 m a cell.
export function heightGrid(
  terrain: TerrainData,
  geo: Pick<Geo, 'terrain' | 'metres'>,
  seg = 480
): HeightGrid {
  const n = seg + 1
  const relief = geo.terrain.max - geo.terrain.min
  const grid = new Float32Array(n * n)
  for (let j = 0; j < n; j++) {
    for (let i = 0; i < n; i++) {
      grid[j * n + i] =
        bilinearHeight(terrain.heights, terrain.size, i / seg, j / seg) * relief
    }
  }
  const { width, height } = geo.metres
  const raw: HeightAt = (x, z) => {
    const u = Math.max(0, Math.min(1, x / width + 0.5))
    const v = Math.max(0, Math.min(1, z / height + 0.5))
    return bilinearHeight(grid, n, u, v)
  }
  return { seg, n, grid, relief, raw }
}

// The grid from the map's two files as they are served: terrain.png's
// bytes and geo.json's text, of which it reads the terrain's range and the
// survey's size.
export async function readHeightGrid(
  png: Uint8Array,
  geoText: string
): Promise<HeightGrid> {
  const geo = JSON.parse(geoText) as Partial<Geo>
  const range = geo.terrain
  const metres = geo.metres
  const finite = (n: unknown): n is number =>
    typeof n === 'number' && Number.isFinite(n)
  if (
    !range ||
    !metres ||
    !finite(range.min) ||
    !finite(range.max) ||
    !finite(metres.width) ||
    !finite(metres.height)
  ) {
    throw new Error('geo.json has no terrain range or survey size')
  }
  return heightGrid(await decodeTerrainPng(png), { terrain: range, metres })
}

// The ground as the valley knows it: the terrain, with the moat cut into
// it where the world placed one.
export function valleyGround(raw: HeightAt, moat: MazePlace | null): HeightAt {
  return moat ? carve(raw, moat, moatFloor(raw, moat)) : raw
}
