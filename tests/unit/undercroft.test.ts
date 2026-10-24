import { describe, expect, it } from 'vitest'
import { CONFIG } from '../../src/config.ts'
import {
  cellAt,
  croftWalls,
  inRoom,
  inStone,
  inUndercroft,
  ossuaryLedges,
  ROOMS,
  theUndercroft,
  UNDERCROFT,
  UNDERCROFT_GRID,
  undercroftPlace,
} from '../../src/undercroft.ts'
import { Walls } from '../../src/walls.ts'

const metres = { width: 15059, height: 15038 }
const floor = (row: number, col: number) => UNDERCROFT_GRID[row][col] === '.'

describe('the Undercroft', () => {
  it('is stone all round, every row as long', () => {
    const cols = UNDERCROFT_GRID[0].length
    for (const row of UNDERCROFT_GRID) expect(row).toHaveLength(cols)
    expect(UNDERCROFT_GRID[0]).toMatch(/^#+$/)
    expect(UNDERCROFT_GRID.at(-1)).toMatch(/^#+$/)
    for (const row of UNDERCROFT_GRID) {
      expect(row[0]).toBe('#')
      expect(row.at(-1)).toBe('#')
    }
  })

  it('can be walked end to end: every floor cell reaches every other', () => {
    const map = theUndercroft()
    let floors = 0
    UNDERCROFT_GRID.forEach((row, r) => {
      for (let c = 0; c < row.length; c++) if (floor(r, c)) floors++
    })
    expect(map.cells).toHaveLength(floors)
  })

  it('puts the ladder, the loot, the lairs and the Warden on the floor', () => {
    const spots = [
      UNDERCROFT.ladder,
      UNDERCROFT.warden,
      ...UNDERCROFT.lairs,
      ...UNDERCROFT.loot,
    ]
    const walls = new Walls()
    for (const w of croftWalls()) walls.addWall(w.a, w.b, w.half)
    for (const spot of spots) {
      const { row, col } = cellAt(spot)
      expect(floor(row, col), `${spot.x},${spot.z}`).toBe(true)
      const out = walls.resolve(spot.x, spot.z, 0.2)
      expect(Math.hypot(out.x - spot.x, out.z - spot.z)).toBeLessThan(
        CONFIG.player.pickupReach
      )
    }
    expect(inRoom(ROOMS.deep, UNDERCROFT.warden)).toBe(true)
    expect(inRoom(ROOMS.entry, UNDERCROFT.ladder)).toBe(true)
    const gold = UNDERCROFT.loot.find((l) => l.kind === 'gold-bullion')
    if (!gold) throw new Error('no gold')
    expect(inRoom(ROOMS.deep, gold)).toBe(true)
  })

  it('lies in a far corner of the survey, inside where a raider may stand', () => {
    const place = undercroftPlace(metres)
    const { inset } = CONFIG.undercroft
    expect(place.x).toBe(-metres.width / 2 + inset)
    expect(place.z).toBe(-metres.height / 2 + inset)
    // The player is held 8 m inside the square's edge (player.ts).
    expect(place.x).toBeGreaterThan(-metres.width / 2 + 8)
    const mid = {
      x: place.x + UNDERCROFT.size.across / 2,
      z: place.z + UNDERCROFT.size.along / 2,
    }
    expect(inUndercroft(place, mid)).toBe(true)
    expect(inUndercroft(place, { x: 0, z: 0 })).toBe(false)
    expect(inUndercroft(place, { x: place.x - 3, z: mid.z }, 4)).toBe(true)
  })

  it('walls in the altar as well as the stone', () => {
    const walls = croftWalls()
    const stone = walls.filter((w) => w.half === UNDERCROFT.wall / 2)
    expect(stone.length).toBeGreaterThan(10)
    expect(walls.length).toBeGreaterThan(stone.length)
  })
})

describe('the ossuary', () => {
  it('breaks its ledges off at every doorway, so the way through is clear', () => {
    const { x0, x1, z0, z1 } = ROOMS.ossuary
    const cell = 3
    const sides = ossuaryLedges()
    expect(sides).toHaveLength(2)
    // Each doorway in a long wall: a floor cell just beyond it.
    const row = (x: number) => Math.round(x / cell)
    const doors: { side: number; z: number }[] = []
    const beyond = [row(x0) - 1, row(x1) + 1]
    beyond.forEach((r, side) => {
      for (let col = 0; col < UNDERCROFT_GRID[0].length; col++) {
        const z = col * cell
        if (z >= z0 && z <= z1 && floor(r, col)) doors.push({ side, z })
      }
    })
    // The way to the deep chamber is one of them.
    expect(doors.length).toBeGreaterThan(0)
    for (const { side, z } of doors) {
      for (const [a, b] of sides[side].runs) {
        expect(b <= z - 1 || a >= z + 1, `${a}..${b} over ${z}`).toBe(true)
      }
    }
    for (const { runs } of sides) {
      for (const [a, b] of runs) {
        expect(a).toBeGreaterThanOrEqual(z0)
        expect(b).toBeLessThanOrEqual(z1)
        expect(b).toBeGreaterThan(a)
      }
    }
  })
})

describe('the backrooms', () => {
  const stoneRows = 17
  const stoneCols = 29
  const floors = (inside: (r: number, c: number) => boolean) => {
    let n = 0
    UNDERCROFT_GRID.forEach((row, r) => {
      for (let c = 0; c < row.length; c++) if (floor(r, c) && inside(r, c)) n++
    })
    return n
  }

  it('make the Undercroft about three times the size of the stone', () => {
    const area = UNDERCROFT.size.across * UNDERCROFT.size.along
    const stone = (stoneRows - 1) * (stoneCols - 1) * UNDERCROFT.cell ** 2
    expect(area / stone).toBeGreaterThan(2.8)
    const old = floors((r, c) => r < stoneRows && c < stoneCols)
    const all = floors(() => true)
    expect(all / old).toBeGreaterThan(2.5)
  })

  it('leave the stone as it was but for the doors through its far walls', () => {
    const doors: string[] = []
    for (let r = 0; r < stoneRows; r++) {
      for (let c = 0; c < stoneCols; c++) {
        const edge = r === stoneRows - 1 || c === stoneCols - 1
        if (edge && floor(r, c)) doors.push(`${r},${c}`)
      }
    }
    expect(doors).toEqual(['13,28', '16,3', '16,13'])
  })

  it('are papered, lower than the stone, and lit by tubes only out there', () => {
    const paper = UNDERCROFT.boxes.filter((b) => b.finish === 'wallpaper')
    expect(paper.length).toBeGreaterThan(40)
    for (const b of paper) {
      expect(inStone({ x: b.center[0], z: b.center[2] })).toBe(false)
      expect(b.size[1]).toBe(UNDERCROFT.low)
    }
    expect(UNDERCROFT.low).toBeLessThan(UNDERCROFT.height)
    const tubes = UNDERCROFT.boxes.filter((b) =>
      ['tube', 'flicker', 'dead'].includes(b.finish)
    )
    expect(tubes.length).toBeGreaterThan(100)
    for (const b of tubes) {
      expect(inStone({ x: b.center[0], z: b.center[2] })).toBe(false)
    }
    // Some fail; most hold.
    expect(tubes.filter((b) => b.finish === 'tube').length).toBeGreaterThan(
      tubes.length * 0.75
    )
    expect(tubes.some((b) => b.finish === 'flicker')).toBe(true)
    expect(tubes.some((b) => b.finish === 'dead')).toBe(true)
  })

  it('have shades of their own and something worth the walk', () => {
    const out = (p: { x: number; z: number }) => !inStone(p)
    expect(UNDERCROFT.lairs.filter(out).length).toBeGreaterThanOrEqual(3)
    expect(UNDERCROFT.loot.filter(out).length).toBeGreaterThanOrEqual(2)
  })
})
