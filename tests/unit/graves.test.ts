import { describe, expect, it } from 'vitest'
import { CONFIG } from '../../src/config.ts'
import { burialsOf, bury, graveSpot, NAME_MAX } from '../../src/graves.ts'
import { mulberry32 } from '../../src/rng.ts'
import type { Grave } from '../../src/graves.ts'

describe('burialsOf', () => {
  it('names each burst shadowman where it burst', () => {
    const burials = burialsOf(
      [
        { x: 1, z: 2 },
        { x: 3, z: 4 },
      ],
      mulberry32(5)
    )
    expect(burials).toHaveLength(2)
    expect(burials[0]).toMatchObject({ x: 1, z: 2 })
    for (const b of burials) expect(b.name.length).toBeGreaterThan(0)
  })

  it('buries no spiderling', () => {
    const burials = burialsOf(
      [
        { x: 1, z: 2, kind: 'spiderling' },
        { x: 3, z: 4, kind: 'spider' },
      ],
      mulberry32(5)
    )
    expect(burials).toHaveLength(1)
    expect(burials[0]).toMatchObject({ x: 3, z: 4 })
  })
})

describe('graveSpot', () => {
  it('stands a step off the burst, turned round by id', () => {
    const at = { x: 10, z: 10 }
    const one = graveSpot(at, 0)
    const two = graveSpot(at, 1)
    expect(Math.hypot(one.x - 10, one.z - 10)).toBeCloseTo(CONFIG.graves.offset)
    expect(Math.hypot(one.x - two.x, one.z - two.z)).toBeGreaterThan(0.1)
  })
})

describe('bury', () => {
  it('numbers the graves on from next and skips a name that is not one', () => {
    const out = bury([], 4, [
      { x: 0, z: 0, name: 'Old Man Draper' },
      { x: 0, z: 0, name: 'x'.repeat(NAME_MAX + 1) },
      { x: Number.NaN, z: 0, name: 'Aunt Boger' },
      { x: 1, z: 1, name: 'Little Curran' },
    ])
    expect(out.next).toBe(6)
    expect(out.graves.map((g) => [g.id, g.name])).toEqual([
      [4, 'Old Man Draper'],
      [5, 'Little Curran'],
    ])
  })

  it('lets the oldest go past the most that stand', () => {
    const cfg = { ...CONFIG, graves: { ...CONFIG.graves, max: 2 } }
    const graves: Grave[] = [
      { id: 0, name: 'Mother Ostend', x: 0, z: 0 },
      { id: 1, name: 'Deacon Mason', x: 0, z: 0 },
    ]
    const out = bury(graves, 2, [{ x: 0, z: 0, name: 'Granny Powers' }], cfg)
    expect(out.graves.map((g) => g.id)).toEqual([1, 2])
    expect(out.next).toBe(3)
  })
})
