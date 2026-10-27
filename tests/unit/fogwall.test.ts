import { describe, expect, it } from 'vitest'
import {
  FOG_DOOR,
  FOG_GATE,
  FOG_IN,
  FOG_SPOT,
  FOG_WALL,
  fogOpen,
  inChamber,
  isFogGate,
  wardenStands,
} from '../../src/fogwall.ts'
import { croftWalls, ROOMS, UNDERCROFT_GRID } from '../../src/undercroft.ts'
import { Walls } from '../../src/walls.ts'

const floor = (row: number, col: number) => UNDERCROFT_GRID[row][col] === '.'

// The floor cells reached from (row, col) over the grid, never through
// `shut`.
function reached(from: [number, number], shut: [number, number]): Set<string> {
  const seen = new Set([from.join(',')])
  const queue = [from]
  while (queue.length > 0) {
    const [r, c] = queue.shift()!
    for (const [dr, dc] of [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ]) {
      const next: [number, number] = [r + dr, c + dc]
      const key = next.join(',')
      if (seen.has(key) || key === shut.join(',')) continue
      if (!UNDERCROFT_GRID[next[0]]?.[next[1]]) continue
      if (!floor(...next)) continue
      seen.add(key)
      queue.push(next)
    }
  }
  return seen
}

// A raider in a world of the Undercroft's walls and the fog's gate.
function walled(standing: boolean): Walls {
  const walls = new Walls(10)
  for (const w of croftWalls()) walls.addWall(w.a, w.b, w.half)
  walls.addGate(FOG_WALL.a, FOG_WALL.b, FOG_WALL.half, FOG_GATE)
  walls.setGates((gate) => !isFogGate(gate) || fogOpen(standing))
  return walls
}

const ossuary = { x: FOG_SPOT.x + 2, z: FOG_SPOT.z }

describe('the fog wall', () => {
  it("stands in the deep chamber's one door", () => {
    const { row, col } = FOG_DOOR
    expect(floor(row, col)).toBe(true)
    expect(floor(row, col - 1)).toBe(false)
    expect(floor(row, col + 1)).toBe(false)
    // Shut it, and the chamber (row 4 of it) is out of reach of the
    // ossuary.
    const deep = `4,${col}`
    expect(reached([row + 2, col], [0, 0]).has(deep)).toBe(true)
    expect(reached([row + 2, col], [row, col]).has(deep)).toBe(false)
  })

  it('spans the door from stone face to stone face', () => {
    expect(FOG_WALL.a.x).toBe(FOG_WALL.b.x)
    expect(FOG_WALL.b.z - FOG_WALL.a.z).toBeGreaterThan(4)
    expect(FOG_WALL.height).toBeGreaterThan(3)
  })

  it('lets no one through while the Warden stands, either way', () => {
    const closed = walled(true)
    expect(closed.between(ossuary, FOG_IN)).toBe(true)
    expect(closed.between(FOG_IN, ossuary)).toBe(true)
    const open = walled(false)
    expect(open.between(ossuary, FOG_IN)).toBe(false)
    expect(open.between(FOG_IN, ossuary)).toBe(false)
  })

  it('offers E on the ossuary side, and carries a raider into the chamber', () => {
    expect(inChamber(FOG_SPOT)).toBe(false)
    expect(inChamber(ossuary)).toBe(false)
    expect(inChamber(FOG_IN)).toBe(true)
    expect(inChamber(FOG_IN.face)).toBe(true)
    // The fog never stands between the eye and where E is offered.
    expect(walled(true).between(ossuary, FOG_SPOT)).toBe(false)
  })

  it('counts the whole chamber as its inside', () => {
    const middle = {
      x: (ROOMS.deep.x0 + ROOMS.deep.x1) / 2,
      z: (ROOMS.deep.z0 + ROOMS.deep.z1) / 2,
    }
    expect(inChamber(middle)).toBe(true)
    const ossuaryMiddle = {
      x: (ROOMS.ossuary.x0 + ROOMS.ossuary.x1) / 2,
      z: (ROOMS.ossuary.z0 + ROOMS.ossuary.z1) / 2,
    }
    expect(inChamber(ossuaryMiddle)).toBe(false)
  })

  it('is the only gate it names', () => {
    expect(isFogGate(FOG_GATE)).toBe(true)
    expect(isFogGate('topiary-3')).toBe(false)
  })
})

describe('whether the Warden stands', () => {
  const frame = (
    tunnel: ('rat' | 'warden')[],
    bursts: ('rat' | 'warden')[] = []
  ) => ({
    tunnel: tunnel.map((kind) => ({ kind })),
    tunnelBursts: bursts.map((kind) => ({ kind })),
  })

  it('stands once a frame shows it', () => {
    expect(wardenStands(false, frame(['rat']))).toBe(false)
    expect(wardenStands(false, frame(['rat', 'warden']))).toBe(true)
  })

  it('stands yet while a hit has it in the dark', () => {
    expect(wardenStands(true, frame(['rat']))).toBe(true)
  })

  it('falls when a frame says it burst, and not for a shade', () => {
    expect(wardenStands(true, frame([], ['warden']))).toBe(false)
    expect(wardenStands(true, frame([], ['rat']))).toBe(true)
  })
})
