import { describe, expect, it } from 'vitest'
import {
  dryMap,
  isWaterMap,
  nearWater,
  WATER_CELL,
  waterMapOf,
} from '../../src/waterside.ts'
import type { Metres, Water } from '../../src/interfaces.ts'

const METRES: Metres = { width: 2000, height: 1000 }

// A pond's shore round the survey's middle, about 100 m across, and a
// stream along the top edge.
const POND: Water = {
  k: 'area',
  n: 'pond',
  p: [
    [0.475, 0.45],
    [0.525, 0.45],
    [0.525, 0.55],
    [0.475, 0.55],
    [0.475, 0.45],
  ],
}
const STREAM: Water = {
  k: 'line',
  n: '',
  p: [
    [0.1, 0.02],
    [0.9, 0.02],
  ],
}

describe('waterMapOf', () => {
  it('covers the survey in cells, and is a map off the wire', () => {
    const map = waterMapOf([POND, STREAM], METRES)
    expect(map.cell).toBe(WATER_CELL)
    expect(map.cols).toBe(20)
    expect(map.rows).toBe(10)
    expect(isWaterMap(map)).toBe(true)
    expect(isWaterMap(JSON.parse(JSON.stringify(map)))).toBe(true)
  })

  it('knows the shore and the stream, and the dry ground between', () => {
    const map = waterMapOf([POND, STREAM], METRES)
    // On the pond's edge, and near it.
    expect(nearWater(map, METRES, { x: 50, z: 0 }, 10)).toBe(true)
    expect(nearWater(map, METRES, { x: 160, z: 0 }, 120)).toBe(true)
    // Far off in the south-east corner: dry.
    expect(nearWater(map, METRES, { x: 800, z: 400 }, 120)).toBe(false)
    // Along the stream at the top.
    expect(nearWater(map, METRES, { x: -400, z: -470 }, 20)).toBe(true)
  })

  it('is dry everywhere with no water', () => {
    const map = dryMap(METRES)
    expect(nearWater(map, METRES, { x: 0, z: 0 }, 5000)).toBe(false)
  })
})

describe('isWaterMap', () => {
  const good = waterMapOf([POND], METRES)

  it('refuses a bad cell, a grid too big, or bits that do not fit', () => {
    expect(isWaterMap(null)).toBe(false)
    expect(isWaterMap({ ...good, cell: 1 })).toBe(false)
    expect(isWaterMap({ ...good, cols: 1000, rows: 1000 })).toBe(false)
    expect(isWaterMap({ ...good, bits: good.bits.slice(4) })).toBe(false)
    expect(isWaterMap({ ...good, bits: '!'.repeat(good.bits.length) })).toBe(
      false
    )
    expect(isWaterMap({ ...good, rows: 2.5 })).toBe(false)
  })

  it('reads unreadable bits as dry rather than failing', () => {
    const odd = { ...good, bits: '====' + good.bits.slice(4) }
    expect(() => nearWater(odd, METRES, { x: 0, z: 0 }, 50)).not.toThrow()
  })
})
