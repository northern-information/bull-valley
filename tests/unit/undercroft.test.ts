import { describe, expect, it } from 'vitest'
import { CONFIG } from '../../src/config.ts'
import {
  cellAt,
  croftWalls,
  inRoom,
  inUndercroft,
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
