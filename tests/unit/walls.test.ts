import { describe, expect, it } from 'vitest'
import { Walls } from '../../src/walls.ts'

describe('Walls', () => {
  // A wall along x = 0 from z = -5 to z = 5, 0.1 either side.
  const walls = new Walls()
  walls.addWall({ x: 0, z: -5 }, { x: 0, z: 5 }, 0.1)

  it('leaves a clear point alone', () => {
    expect(walls.resolve(2, 0, 0.3)).toEqual({ x: 2, z: 0 })
    expect(new Walls().resolve(0, 0, 0.3)).toEqual({ x: 0, z: 0 })
  })

  it('pushes a body back out the side it came from', () => {
    const out = walls.resolve(0.2, 1, 0.3)
    expect(out.x).toBeCloseTo(0.4)
    expect(out.z).toBeCloseTo(1)
    expect(walls.resolve(-0.2, 1, 0.3).x).toBeCloseTo(-0.4)
  })

  it('pushes off the centreline along the normal', () => {
    const out = walls.resolve(0, 0, 0.3)
    expect(Math.abs(out.x)).toBeCloseTo(0.4)
  })

  it('lets a body pass through a gap between walls', () => {
    const door = new Walls()
    door.addWall({ x: 0, z: -5 }, { x: 0, z: -1 }, 0.1)
    door.addWall({ x: 0, z: 1 }, { x: 0, z: 5 }, 0.1)
    expect(door.resolve(0, 0, 0.3)).toEqual({ x: 0, z: 0 })
  })

  it('settles a corner clear of both walls', () => {
    const corner = new Walls()
    corner.addWall({ x: 0, z: 0 }, { x: 5, z: 0 }, 0.1)
    corner.addWall({ x: 0, z: 0 }, { x: 0, z: 5 }, 0.1)
    const out = corner.resolve(0.2, 0.2, 0.3)
    expect(out.x).toBeGreaterThanOrEqual(0.4 - 1e-9)
    expect(out.z).toBeGreaterThanOrEqual(0.4 - 1e-9)
  })

  it('finds a wall from the next cell over', () => {
    const edge = new Walls(10)
    edge.addWall({ x: 9.95, z: 0 }, { x: 9.95, z: 5 }, 0.05)
    expect(edge.resolve(10.1, 1, 0.3).x).toBeCloseTo(10.3)
  })
})
