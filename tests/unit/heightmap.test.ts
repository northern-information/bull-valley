import { readFileSync } from 'node:fs'
import { deflateSync } from 'node:zlib'
import { describe, expect, it } from 'vitest'
import {
  decodeTerrainPng,
  heightGrid,
  valleyGround,
} from '../../src/heightmap.ts'
import { carve, castlePlace, moatFloor, trickle } from '../../src/moat.ts'
import type { Geo } from '../../src/interfaces.ts'

const TERRAIN = new Uint8Array(
  readFileSync(
    new URL('../../public/data/bull-valley/terrain.png', import.meta.url)
  )
)
const GEO = JSON.parse(
  readFileSync(
    new URL('../../public/data/bull-valley/geo.json', import.meta.url),
    'utf8'
  )
) as Pick<Geo, 'terrain' | 'metres'>

// A PNG of `pixels` (RGB rows), each row filtered by the filter its index
// picks, so every filter is undone.
function png(size: number, pixels: number[][], channels = 3): Uint8Array {
  const chunk = (type: string, body: Uint8Array) => {
    const out = new Uint8Array(12 + body.length)
    const view = new DataView(out.buffer)
    view.setUint32(0, body.length)
    out.set(
      [...type].map((c) => c.charCodeAt(0)),
      4
    )
    out.set(body, 8)
    return out
  }
  const header = new Uint8Array(13)
  const hv = new DataView(header.buffer)
  hv.setUint32(0, size)
  hv.setUint32(4, size)
  header.set([8, channels === 3 ? 2 : 6, 0, 0, 0], 8)
  const stride = size * channels
  const rows: number[] = []
  pixels.forEach((row, y) => {
    const filter = y % 5
    rows.push(filter)
    const prev = y > 0 ? pixels[y - 1] : null
    row.forEach((v, x) => {
      const a = x >= channels ? row[x - channels] : 0
      const b = prev ? prev[x] : 0
      const c = prev && x >= channels ? prev[x - channels] : 0
      const p = a + b - c
      const pa = Math.abs(p - a)
      const pb = Math.abs(p - b)
      const pc = Math.abs(p - c)
      const paeth = pa <= pb && pa <= pc ? a : pb <= pc ? b : c
      const by = [0, a, b, (a + b) >> 1, paeth][filter]
      rows.push((v - by) & 0xff)
    })
  })
  expect(rows.length).toBe(size * (stride + 1))
  const parts = [
    new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', header),
    chunk('IDAT', deflateSync(new Uint8Array(rows))),
    chunk('IEND', new Uint8Array()),
  ]
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0))
  let at = 0
  for (const p of parts) {
    out.set(p, at)
    at += p.length
  }
  return out
}

describe('heightmap', () => {
  it('undoes every PNG filter, RGB and RGBA alike', async () => {
    for (const channels of [3, 4]) {
      const size = 6
      const pixels = Array.from({ length: size }, (_, y) =>
        Array.from(
          { length: size * channels },
          (_, x) => (x * 37 + y * 91 + x * y * 13) & 0xff
        )
      )
      const { heights, size: got } = await decodeTerrainPng(
        png(size, pixels, channels)
      )
      expect(got).toBe(size)
      for (let y = 0; y < size; y++) {
        for (let x = 0; x < size; x++) {
          const r = pixels[y][x * channels]
          const g = pixels[y][x * channels + 1]
          expect(heights[y * size + x]).toBeCloseTo((r * 256 + g) / 65535, 6)
        }
      }
    }
  })

  it('refuses what is not a heightmap it reads', async () => {
    await expect(decodeTerrainPng(new Uint8Array(16))).rejects.toThrow()
    const bad = png(2, [
      [1, 2, 3, 4, 5, 6],
      [1, 2, 3, 4, 5, 6],
    ])
    bad[8 + 8 + 8] = 16
    await expect(decodeTerrainPng(bad)).rejects.toThrow()
  })

  it('reads the committed terrain as a second decoder does', async () => {
    const terrain = await decodeTerrainPng(TERRAIN)
    expect(terrain.size).toBe(1024)
    // Spot heights, read off terrain.png by an independent decoder.
    const at = (x: number, y: number) => terrain.heights[y * 1024 + x] * 65535
    expect(at(0, 0)).toBeCloseTo(30660, 1)
    expect(at(512, 512)).toBeCloseTo(24573, 1)
    expect(at(1023, 1023)).toBeCloseTo(14409, 1)
    expect(at(100, 900)).toBeCloseTo(45649, 1)
    expect(at(700, 30)).toBeCloseTo(30707, 1)
  })

  it('stands the ground on the grid, with the moat cut into it', async () => {
    const terrain = await decodeTerrainPng(TERRAIN)
    const { raw, n, relief } = heightGrid(terrain, GEO)
    expect(n).toBe(481)
    expect(relief).toBeCloseTo(GEO.terrain.max - GEO.terrain.min)
    for (const [x, z] of [
      [0, 0],
      [1200, -3400],
      [-5000, 2500],
    ]) {
      expect(raw(x, z)).toBeGreaterThanOrEqual(0)
      expect(raw(x, z)).toBeLessThanOrEqual(relief)
    }
    expect(valleyGround(raw, null)).toBe(raw)
    const place = castlePlace({ x: 300, z: -200, yaw: 0.4, y: 0 })
    const ground = valleyGround(raw, place)
    const cut = carve(raw, place, moatFloor(raw, place))
    const [mid] = trickle(place)
    expect(ground(mid.x, mid.z)).toBe(cut(mid.x, mid.z))
    expect(ground(mid.x, mid.z)).toBeLessThan(raw(mid.x, mid.z) - 20)
    expect(ground(place.x, place.z)).toBe(raw(place.x, place.z))
  })
})
