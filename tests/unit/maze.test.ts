import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { CONFIG } from '../../src/config.ts'
import {
  pointInPolygon,
  projectOnSegment,
  unitToWorld,
} from '../../src/coords.ts'
import {
  cellPoint,
  inMaze,
  mazeGates,
  mazeRuns,
  mazeSpans,
  SHINING_MAZE,
  spanPieces,
} from '../../src/maze.ts'
import { roadWidth } from '../../src/roadside.ts'
import type { Geo } from '../../src/interfaces.ts'
import type { Cell } from '../../src/maze.ts'

const SIZE = CONFIG.maze.size

// The path cells reachable from `from`, stepping through `.` only.
function reachable(grid: readonly string[], from: Cell): Set<string> {
  const seen = new Set<string>()
  const stack = [from]
  while (stack.length) {
    const { col, row } = stack.pop() as Cell
    const key = `${col},${row}`
    if (seen.has(key) || grid[row]?.[col] !== '.') continue
    seen.add(key)
    stack.push(
      { col: col + 1, row },
      { col: col - 1, row },
      { col, row: row + 1 },
      { col, row: row - 1 }
    )
  }
  return seen
}

describe('SHINING_MAZE', () => {
  it('is a rectangle of corn and path', () => {
    const cols = SHINING_MAZE[0].length
    for (const row of SHINING_MAZE) {
      expect(row).toHaveLength(cols)
      expect(row).toMatch(/^[#.]+$/)
    }
  })

  it('has one gate, on the end nearest the station', () => {
    const gates = mazeGates(SHINING_MAZE)
    expect(gates).toHaveLength(1)
    expect(gates[0].col).toBe(0)
  })

  it('leaves no path sealed off from the gate', () => {
    const paths = SHINING_MAZE.join('').split('.').length - 1
    const [gate] = mazeGates(SHINING_MAZE)
    expect(reachable(SHINING_MAZE, gate).size).toBe(paths)
  })
})

describe('mazeRuns', () => {
  it('covers every corn cell and no path cell', () => {
    const covered = new Set<string>()
    for (const { a, b } of mazeRuns(SHINING_MAZE)) {
      expect(a.col === b.col || a.row === b.row).toBe(true)
      for (let row = a.row; row <= b.row; row++) {
        for (let col = a.col; col <= b.col; col++) {
          expect(SHINING_MAZE[row][col]).toBe('#')
          covered.add(`${col},${row}`)
        }
      }
    }
    const corn = SHINING_MAZE.join('').split('#').length - 1
    expect(covered.size).toBe(corn)
  })

  it('makes a lone cell a post and joins a row into one run', () => {
    expect(mazeRuns(['...', '.#.', '...'])).toEqual([
      { a: { col: 1, row: 1 }, b: { col: 1, row: 1 } },
    ])
    expect(mazeRuns(['###'])).toEqual([
      { a: { col: 0, row: 0 }, b: { col: 2, row: 0 } },
    ])
  })
})

describe('cellPoint and mazeSpans', () => {
  it('stretches the grid corner to corner over the size', () => {
    const rows = SHINING_MAZE.length
    const cols = SHINING_MAZE[0].length
    expect(cellPoint(SHINING_MAZE, SIZE, { col: 0, row: 0 })).toEqual({
      x: 0,
      z: 0,
    })
    expect(
      cellPoint(SHINING_MAZE, SIZE, { col: cols - 1, row: rows - 1 })
    ).toEqual({ x: SIZE.across, z: SIZE.along })
  })

  it('keeps every wall inside the footprint', () => {
    for (const { a, b } of mazeSpans(SHINING_MAZE, SIZE)) {
      expect(inMaze(SIZE, a.x, a.z)).toBe(true)
      expect(inMaze(SIZE, b.x, b.z)).toBe(true)
    }
  })

  it('leaves room to walk between parallel walls', () => {
    // The narrowest corridor: two wall rows apart, less a wall's thickness.
    const rowPitch = SIZE.across / (SHINING_MAZE.length - 1)
    expect(rowPitch * 2 - CONFIG.maze.wallThickness).toBeGreaterThan(
      CONFIG.player.radius * 4
    )
  })
})

describe('spanPieces', () => {
  it('splits a span into short pieces, pushed out at both ends', () => {
    const pieces = spanPieces({ a: { x: 0, z: 0 }, b: { x: 10, z: 0 } }, 1, 3)
    expect(pieces).toHaveLength(4)
    expect(pieces[0].a.x).toBeCloseTo(-1)
    expect(pieces[3].b.x).toBeCloseTo(11)
    for (const { a, b } of pieces) expect(b.x - a.x).toBeCloseTo(3)
  })

  it('draws a post as one square piece', () => {
    const [piece, ...rest] = spanPieces(
      { a: { x: 2, z: 5 }, b: { x: 2, z: 5 } },
      1,
      3
    )
    expect(rest).toHaveLength(0)
    expect(piece).toEqual({ a: { x: 1, z: 5 }, b: { x: 3, z: 5 } })
  })
})

describe('inMaze', () => {
  it('takes a margin round the footprint', () => {
    expect(inMaze(SIZE, -1, 10)).toBe(false)
    expect(inMaze(SIZE, -1, 10, 2)).toBe(true)
    expect(inMaze(SIZE, SIZE.across + 1, SIZE.along)).toBe(false)
  })
})

// The maze in the survey: where world.ts would plant it across from the
// spawn station, clear of every road but the one it fronts and of every
// pond. This repeats world.ts's station placement (chooseSpawnStation, the
// road snap in buildFuelStations) on the real geo.json, so a refetch that
// moves a road or pond under the corn fails here.
describe('the maze in Bull Valley', () => {
  const geo = JSON.parse(
    readFileSync('public/data/bull-valley/geo.json', 'utf8')
  ) as Geo
  const metres = geo.metres
  const world = ([u, v]: readonly [number, number]) => unitToWorld(u, v, metres)

  const longest = geo.roads
    .filter((road) => /bull valley/i.test(road.n || ''))
    .reduce((a, b) => (b.p.length > a.p.length ? b : a))
  const target = world(longest.p[Math.floor(longest.p.length / 2)])
  const fuel = geo.fuel
    .filter(
      (f) =>
        f.p[0] > 0.015 && f.p[0] < 0.985 && f.p[1] > 0.015 && f.p[1] < 0.985
    )
    .map((f) => world(f.p))
    .reduce((a, b) =>
      Math.hypot(b.x - target.x, b.z - target.z) <
      Math.hypot(a.x - target.x, a.z - target.z)
        ? b
        : a
    )
  let road = { x: 0, z: 0, dist: Infinity, width: 0, name: '' }
  for (const r of geo.roads) {
    for (let i = 0; i < r.p.length - 1; i++) {
      const a = world(r.p[i])
      const b = world(r.p[i + 1])
      const p = projectOnSegment(fuel.x, fuel.z, a.x, a.z, b.x, b.z)
      if (p.dist < road.dist) {
        road = {
          x: p.x,
          z: p.y,
          dist: p.dist,
          width: roadWidth(r.c),
          name: r.n,
        }
      }
    }
  }
  const yaw = Math.atan2(road.z - fuel.z, road.x - fuel.x)
  const cos = Math.cos(yaw)
  const sin = Math.sin(yaw)
  // FUEL_LAYOUT.roadEdgeDistance in assets.ts.
  const setback = road.width / 2 + 12
  const origin = { x: road.x - cos * setback, z: road.z - sin * setback }
  const { at } = CONFIG.maze
  const local = (x: number, z: number) => {
    const dx = x - origin.x
    const dz = z - origin.z
    return { x: cos * dx + sin * dz - at.x, z: -sin * dx + cos * dz - at.z }
  }

  it('fronts Lake Avenue', () => {
    expect(road.name).toBe('Lake Avenue')
  })

  it('has no road through it, and stands clear of its own', () => {
    const crossing = new Set<string>()
    for (const r of geo.roads) {
      for (let i = 0; i < r.p.length - 1; i++) {
        const a = world(r.p[i])
        const b = world(r.p[i + 1])
        const steps = Math.ceil(Math.hypot(b.x - a.x, b.z - a.z) / 2)
        for (let s = 0; s <= steps; s++) {
          const t = s / Math.max(1, steps)
          const p = local(a.x + (b.x - a.x) * t, a.z + (b.z - a.z) * t)
          if (inMaze(SIZE, p.x, p.z, roadWidth(r.c))) crossing.add(r.n)
        }
      }
    }
    expect([...crossing]).toEqual([])
  })

  it('has no water in it', () => {
    const ponds = geo.water.filter((water) => water.k === 'area')
    let wet = 0
    for (let x = 0; x <= SIZE.across; x += 4) {
      for (let z = 0; z <= SIZE.along; z += 4) {
        const wx = origin.x + cos * (at.x + x) - sin * (at.z + z)
        const wz = origin.z + sin * (at.x + x) + cos * (at.z + z)
        const u = wx / metres.width + 0.5
        const v = wz / metres.height + 0.5
        if (ponds.some((water) => pointInPolygon(u, v, water.p))) wet++
      }
    }
    expect(wet).toBe(0)
  })
})
