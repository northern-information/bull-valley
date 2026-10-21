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

  it('stands between two points on either side of a wall, not beside it', () => {
    expect(walls.between({ x: -1, z: 0 }, { x: 1, z: 0 })).toBe(true)
    expect(walls.between({ x: 1, z: 0 }, { x: 2, z: 3 })).toBe(false)
    // Past its end, round it.
    expect(walls.between({ x: -1, z: 6 }, { x: 1, z: 6 })).toBe(false)
    // Up to the round of its end, then past it.
    expect(walls.between({ x: -1, z: 5.05 }, { x: 1, z: 5.05 })).toBe(true)
    // A post stands across no line.
    const post = new Walls()
    post.addWall({ x: 0, z: 0 }, { x: 0, z: 0 }, 0.3)
    expect(post.between({ x: -1, z: 0 }, { x: 1, z: 0 })).toBe(false)
  })

  it('stands no fixture between a hand and what stands in it', () => {
    const cooler = new Walls()
    cooler.addWall({ x: 0, z: -5 }, { x: 0, z: 5 }, 0.3)
    // A bottle at the back of it, past its middle: no wall to the hand.
    expect(cooler.between({ x: 1, z: 0 }, { x: -0.2, z: 0 })).toBe(false)
    // Past its far face, it stands between.
    expect(cooler.between({ x: 1, z: 0 }, { x: -0.4, z: 0 })).toBe(true)
  })

  it('stands a gate between unless it is open to the one reaching', () => {
    const door = new Walls()
    door.addGate({ x: 0, z: -1 }, { x: 0, z: 1 }, 0.1, 'vault')
    expect(door.between({ x: 1, z: 0 }, { x: -1, z: 0 })).toBe(true)
    door.setGates((gate, x) => gate === 'vault' && x > 0)
    expect(door.between({ x: 1, z: 0 }, { x: -1, z: 0 })).toBe(false)
    expect(door.between({ x: -1, z: 0 }, { x: 1, z: 0 })).toBe(true)
  })

  it('finds a wall across a line that spans two cells', () => {
    const edge = new Walls(10)
    edge.addWall({ x: 10.5, z: -5 }, { x: 10.5, z: 5 }, 0.1)
    expect(edge.between({ x: 9, z: 0 }, { x: 11, z: 0 })).toBe(true)
  })
})

describe('Walls with a band', () => {
  // A ledge along x = 0: it stands only for feet at or under 10.
  const ledge = new Walls()
  ledge.addWall({ x: 0, z: -5 }, { x: 0, z: 5 }, 0.1, { high: 10 })
  // A cap that stands only for feet at or over 2.
  ledge.addWall({ x: 5, z: -5 }, { x: 5, z: 5 }, 0.1, { low: 2 })

  it('stands for feet within it', () => {
    expect(ledge.resolve(0.2, 0, 0.3, 0).x).toBeCloseTo(0.4)
    expect(ledge.resolve(5.2, 0, 0.3, 3).x).toBeCloseTo(5.4)
  })

  it('stands aside for feet past it', () => {
    expect(ledge.resolve(0.2, 0, 0.3, 12)).toEqual({ x: 0.2, z: 0 })
    expect(ledge.resolve(5.2, 0, 0.3, 1)).toEqual({ x: 5.2, z: 0 })
  })

  it('stands for a body with no feet given, and never across a reach', () => {
    expect(ledge.resolve(0.2, 0, 0.3).x).toBeCloseTo(0.4)
    expect(ledge.between({ x: -1, z: 0 }, { x: 1, z: 0 })).toBe(false)
  })
})
