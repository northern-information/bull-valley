import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { CONFIG } from '../../src/config.ts'
import {
  pointInPolygon,
  pointSegmentDistance,
  projectOnSegment,
  unitToWorld,
} from '../../src/coords.ts'
import {
  cellPoint,
  distanceField,
  inMaze,
  inPortal,
  mazeGates,
  mazeHeart,
  mazeRuns,
  mazeSpans,
  mazeToWorld,
  mazeWalk,
  perimeterSpots,
  ringSpots,
  SHINING_MAZE,
  spanPieces,
  trailField,
  worldToMaze,
} from '../../src/maze.ts'
import { roadWidth } from '../../src/roadside.ts'
import { toWorld } from '../../src/store.ts'
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

describe('mazeWalk and mazeHeart', () => {
  it('walks from the gate to the heart in straight legs on the paths', () => {
    const [gate] = mazeGates(SHINING_MAZE)
    const heart = mazeHeart(SHINING_MAZE)
    expect(SHINING_MAZE[heart.row][heart.col]).toBe('.')
    const turns = mazeWalk(SHINING_MAZE, gate, heart)
    expect(turns[0]).toEqual(gate)
    expect(turns[turns.length - 1]).toEqual(heart)
    for (let i = 0; i < turns.length - 1; i++) {
      const a = turns[i]
      const b = turns[i + 1]
      expect(a.col === b.col || a.row === b.row).toBe(true)
      const steps = Math.abs(b.col - a.col) + Math.abs(b.row - a.row)
      for (let s = 0; s <= steps; s++) {
        const col = a.col + Math.sign(b.col - a.col) * s
        const row = a.row + Math.sign(b.row - a.row) * s
        expect(SHINING_MAZE[row][col]).toBe('.')
      }
    }
  })

  it('keeps only the ends and the turns', () => {
    const grid = ['.....', '####.', '.....']
    expect(mazeWalk(grid, { col: 0, row: 0 }, { col: 0, row: 2 })).toEqual([
      { col: 0, row: 0 },
      { col: 4, row: 0 },
      { col: 4, row: 2 },
      { col: 0, row: 2 },
    ])
  })

  it('finds no walk into the corn or between sealed paths', () => {
    const grid = ['.#.']
    expect(mazeWalk(grid, { col: 0, row: 0 }, { col: 2, row: 0 })).toEqual([])
    expect(mazeWalk(grid, { col: 0, row: 0 }, { col: 1, row: 0 })).toEqual([])
  })
})

describe('distanceField', () => {
  it('measures straight-line samples to the nearest feature', () => {
    const features = new Uint8Array(5 * 4)
    features[0] = 1
    const d = distanceField(features, 5, 4)
    expect(d[0]).toBe(0)
    expect(d[4]).toBe(4)
    expect(d[3 * 5 + 4]).toBeCloseTo(5)
  })

  it('is endless with nothing to measure to', () => {
    expect(distanceField(new Uint8Array(4), 2, 2)[3]).toBe(Infinity)
  })
})

describe('trailField', () => {
  // One corridor along z between two walls 4 m apart, shut at both ends.
  const corridor = ['#####', '#...#', '#...#', '#...#', '#####']
  const size = { along: 8, across: 4 }
  const field = trailField(corridor, size, 0.5, 0.25)
  const at = (x: number, z: number) =>
    field.fromMiddle[Math.round(x / 0.25) * field.cols + Math.round(z / 0.25)]

  it('runs down the middle of a corridor, halfway between its walls', () => {
    expect(at(2, 4)).toBe(0)
    expect(at(1.5, 4)).toBeCloseTo(0.5)
    expect(at(2.5, 4)).toBeCloseTo(0.5)
  })

  it('never lies in the corn', () => {
    expect(at(0, 4)).toBe(Infinity)
    expect(at(2, 0)).toBe(Infinity)
  })

  it('turns a corner down the middle, never out into the corner', () => {
    // An L: a corridor along z from a dead end, turning at the corner
    // (0, 0) to run across, the two meeting round the wall end at (4, 4).
    const ell = ['#####', '#...#', '#.###', '#.###', '#####']
    const turn = trailField(ell, { along: 8, across: 8 }, 0.5, 0.25)
    const on = (x: number, z: number) =>
      turn.fromMiddle[Math.round(x / 0.25) * turn.cols + Math.round(z / 0.25)]
    // Down the middle of both legs.
    expect(on(2, 5)).toBe(0)
    expect(on(5, 2)).toBe(0)
    // The diagonal into the corner, halfway between the two walls that
    // meet there, is not worn.
    for (const d of [0.6, 0.9, 1.2]) expect(on(d, d)).toBeGreaterThan(1)
    // Nor are the forks into the dead end's two corners.
    expect(on(7.3, 1.3)).toBeGreaterThan(0.6)
    expect(on(7.3, 2.7)).toBeGreaterThan(0.6)
  })

  it('reaches every path in the maze', () => {
    const shining = trailField(
      SHINING_MAZE,
      SIZE,
      CONFIG.maze.wallThickness,
      0.25
    )
    const half = CONFIG.maze.trailWidth / 2
    let unworn = 0
    for (let row = 0; row < SHINING_MAZE.length; row++) {
      for (let col = 0; col < SHINING_MAZE[0].length; col++) {
        if (SHINING_MAZE[row][col] !== '.') continue
        const p = cellPoint(SHINING_MAZE, SIZE, { col, row })
        const i = Math.round(p.z / shining.step)
        const j = Math.round(p.x / shining.step)
        // The trail passes within a corridor's width of every path cell.
        let near = Infinity
        for (let dj = -12; dj <= 12; dj++) {
          for (let di = -12; di <= 12; di++) {
            const k = (j + dj) * shining.cols + (i + di)
            if (k < 0 || k >= shining.fromMiddle.length) continue
            near = Math.min(near, shining.fromMiddle[k])
          }
        }
        if (near > half) unworn++
      }
    }
    expect(unworn).toBe(0)
  })
})

describe('perimeterSpots', () => {
  it('rings the maze just outside it, each spot facing the corn', () => {
    const out = 3
    const spots = perimeterSpots(SIZE, out, 25)
    expect(spots.length).toBeGreaterThan(16)
    for (const s of spots) {
      expect(inMaze(SIZE, s.x, s.z)).toBe(false)
      expect(inMaze(SIZE, s.x, s.z, out)).toBe(true)
      // One step in from a spot heads toward the corn.
      expect(inMaze(SIZE, s.x + s.inX * out, s.z + s.inZ * out)).toBe(true)
    }
  })
})

describe('inPortal', () => {
  it('takes a point within the radius of the middle', () => {
    const at = { x: 10, z: -4 }
    expect(inPortal(10.5, -4, at, 0.9)).toBe(true)
    expect(inPortal(11, -4, at, 0.9)).toBe(false)
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

describe('where the maze lies', () => {
  const place = { x: 120, z: -40, yaw: 0.9 }

  it('carries maze-local metres into the world and back', () => {
    const p = { x: 12.5, z: 80 }
    const w = mazeToWorld(place, p)
    const back = worldToMaze(place, w)
    expect(back.x).toBeCloseTo(p.x)
    expect(back.z).toBeCloseTo(p.z)
    // As store.ts turns a station's own parts.
    const [sx, , sz] = toWorld(
      { x: 120, z: -40, yaw: 0.9, y: 0 },
      [12.5, 0, 80]
    )
    expect(w.x).toBeCloseTo(sx)
    expect(w.z).toBeCloseTo(sz)
  })
})

describe('the berry bushes at the heart', () => {
  const { size, wallThickness } = CONFIG.maze
  const { count, across, along } = CONFIG.maze.bushes
  const heart = cellPoint(SHINING_MAZE, size, mazeHeart(SHINING_MAZE))
  const spots = ringSpots(heart, count, across, along)

  it('rings the portal, clear of it and of the corn', () => {
    expect(spots).toHaveLength(count)
    for (const spot of spots) {
      const d = Math.hypot(spot.x - heart.x, spot.z - heart.z)
      expect(d).toBeGreaterThan(
        CONFIG.maze.portal.radius + CONFIG.daily.bushRadius + 1
      )
      for (const { a, b } of mazeSpans(SHINING_MAZE, size)) {
        const gap = pointSegmentDistance(spot.x, spot.z, a.x, a.z, b.x, b.z)
        expect(gap).toBeGreaterThan(wallThickness / 2 + CONFIG.daily.bushRadius)
      }
    }
  })

  it('stands none square in the way the walk to the gate comes in', () => {
    const [gate] = mazeGates(SHINING_MAZE)
    const walk = mazeWalk(SHINING_MAZE, mazeHeart(SHINING_MAZE), gate)
    const next = cellPoint(SHINING_MAZE, size, walk[1])
    for (const spot of spots) {
      // Off the line from the heart to the walk's first turn by more than
      // a bush and a raider.
      const off = pointSegmentDistance(
        spot.x,
        spot.z,
        heart.x,
        heart.z,
        next.x,
        next.z
      )
      expect(off).toBeGreaterThan(CONFIG.daily.bushRadius + 0.5)
    }
  })
})
