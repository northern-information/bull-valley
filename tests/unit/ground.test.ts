import { describe, expect, it } from 'vitest'
import { Ground } from '../../src/ground.ts'

// A plain slope: the terrain rises 1 m for every 10 m of x.
const slope = (x: number) => 100 + x / 10

describe('Ground', () => {
  it('is the terrain where nothing covers the ground', () => {
    const ground = new Ground(slope)
    expect(ground.at(0, 0)).toBe(100)
    expect(ground.at(250, -40)).toBe(125)
    expect(ground.surfaceAt(250, -40)).toBeNull()
  })

  it('stands on a ribbon deck, flat across and linear along', () => {
    const ground = new Ground(slope)
    // A road 4 m wide along x from 0 to 100, lifted 0.3 over its centreline
    // heights, which are the terrain at its two points.
    ground.addRibbon(
      [
        { x: 0, z: 0, y: slope(0) },
        { x: 100, z: 0, y: slope(100) },
      ],
      4,
      0.3
    )
    expect(ground.at(50, 0)).toBeCloseTo(105.3)
    // The deck is flat across the width, so the edge sits at the same
    // height as the centreline.
    expect(ground.at(50, 1.9)).toBeCloseTo(105.3)
    expect(ground.at(50, -1.9)).toBeCloseTo(105.3)
    // Off the edge, and past the end, it is terrain again.
    expect(ground.at(50, 2.5)).toBe(105)
    expect(ground.at(110, 0)).toBe(111)
  })

  it('never drops below the terrain under a surface', () => {
    // A ribbon whose centreline sits far under a ridge in the terrain.
    const ridge = (x: number) => (x > 40 && x < 60 ? 120 : 100)
    const ground = new Ground(ridge)
    ground.addRibbon(
      [
        { x: 0, z: 0, y: 100 },
        { x: 100, z: 0, y: 100 },
      ],
      6,
      0.3
    )
    expect(ground.at(50, 0)).toBe(120)
    expect(ground.at(20, 0)).toBeCloseTo(100.3)
  })

  it('stands on a patch, lifted off the terrain inside its rectangle', () => {
    const ground = new Ground(slope)
    // A lot turned 90 degrees: its axis runs along +z from (10, 10), 20 m
    // long and 6 m across.
    const yaw = Math.PI / 2
    ground.addPatch(10, 10, Math.cos(yaw), Math.sin(yaw), 0, 20, 3, 0.28)
    expect(ground.at(10, 20)).toBeCloseTo(slope(10) + 0.28)
    expect(ground.at(12.9, 29)).toBeCloseTo(slope(12.9) + 0.28)
    // Outside on each side.
    expect(ground.at(13.5, 20)).toBe(slope(13.5))
    expect(ground.at(10, 31)).toBe(slope(10))
    expect(ground.at(10, 9)).toBe(slope(10))
  })

  it('stands on a trail, draped on the terrain within its width', () => {
    const ground = new Ground(slope)
    ground.addTrail(
      [
        { x: 0, z: 0 },
        { x: 40, z: 0 },
        { x: 40, z: 30 },
      ],
      2,
      0.24
    )
    expect(ground.at(20, 0.9)).toBeCloseTo(slope(20) + 0.24)
    expect(ground.at(40.5, 15)).toBeCloseTo(slope(40.5) + 0.24)
    expect(ground.at(20, 1.5)).toBe(slope(20))
    expect(ground.at(20, 10)).toBe(slope(20))
  })

  it('takes the highest deck where surfaces overlap', () => {
    const ground = new Ground(() => 0)
    ground.addPatch(0, 0, 1, 0, -10, 10, 10, 0.28)
    ground.addRibbon(
      [
        { x: -50, z: 0, y: 0 },
        { x: 50, z: 0, y: 0 },
      ],
      5,
      0.3
    )
    expect(ground.at(0, 0)).toBeCloseTo(0.3)
    expect(ground.at(0, 5)).toBeCloseTo(0.28)
  })

  it('finds a long ribbon from any cell it crosses', () => {
    const ground = new Ground(() => 0, 50)
    ground.addRibbon(
      [
        { x: -1000, z: 7, y: 0 },
        { x: 1000, z: 7, y: 0 },
      ],
      4,
      0.3
    )
    for (const x of [-999, -333, 0, 125, 870]) {
      expect(ground.at(x, 7)).toBeCloseTo(0.3)
      expect(ground.at(x, 10)).toBe(0)
    }
  })

  it('handles a zero-length segment as a disc', () => {
    const ground = new Ground(() => 0)
    ground.addRibbon(
      [
        { x: 0, z: 0, y: 1 },
        { x: 0, z: 0, y: 1 },
      ],
      4,
      0.1
    )
    expect(ground.at(1, 1)).toBeCloseTo(1.1)
    expect(ground.at(3, 0)).toBe(0)
  })

  it('stands on a floor at one height, wherever the slope is', () => {
    const ground = new Ground(slope)
    // From x = -5 to 5, 3 either side, at 101.
    ground.addFloor(0, 0, 1, 0, -5, 5, 3, 101)
    expect(ground.at(-4, 2)).toBe(101)
    expect(ground.at(4, -2)).toBe(101)
    // Outside it, the terrain.
    expect(ground.at(6, 0)).toBeCloseTo(100.6)
    // Where the terrain rises over the floor, the terrain.
    const low = new Ground(slope)
    low.addFloor(0, 0, 1, 0, -5, 5, 3, 100)
    expect(low.at(4, 0)).toBeCloseTo(100.4)
  })
})
