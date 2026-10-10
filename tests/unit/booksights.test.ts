import { describe, expect, it } from 'vitest'
import { bookSights } from '../../src/booksights.ts'
import { CONFIG } from '../../src/config.ts'
import { KEEP } from '../../src/landmarks.ts'
import { toWorld } from '../../src/store.ts'
import type { MazeFrame } from '../../src/cornmaze.ts'
import type { FuelPoint } from '../../src/world.ts'

const station: FuelPoint = { x: 100, z: 200, yaw: 0.5, y: 3, name: 'Citgo' }
const other: FuelPoint = { x: -900, z: 40, yaw: 0, y: 0, name: 'Shell' }

const maze: MazeFrame = {
  toWorld: (x, z) => ({ x: 1000 + x, z: 2000 + z }),
  covers: () => false,
}

describe('bookSights', () => {
  it('names only the Citgos when the survey has no spawn station', () => {
    const sights = bookSights({
      stations: [station, other],
      spawn: null,
      maze: null,
      portal: null,
      donutField: null,
      wreck: null,
      dishes: [],
      landmarks: [],
    })
    expect(sights).toEqual([
      { id: 'citgo', x: 100, z: 200, reach: CONFIG.book.reach.citgo },
      { id: 'citgo', x: -900, z: 40, reach: CONFIG.book.reach.citgo },
    ])
  })

  it('places every sight round the spawn Citgo, and the Keep', () => {
    const { reach } = CONFIG.book
    const sights = bookSights({
      stations: [station],
      spawn: station,
      maze,
      portal: { at: { x: 1010, z: 2020 } },
      donutField: { x: 300, z: 400, radius: 20 },
      wreck: { x: 5, z: 6 },
      dishes: [
        { x: 0, z: 0 },
        { x: 10, z: 20 },
      ],
      landmarks: [
        { n: KEEP, x: 7, z: 8 },
        { n: 'elsewhere', x: 9, z: 9 },
      ],
    })
    const ids = sights.map((s) => s.id)
    expect(ids).toEqual([
      'citgo',
      'cabbage-stand',
      'wreck',
      'dishes',
      'donut-field',
      'corn-maze',
      'corn-maze',
      'corn-maze',
      'maze-heart',
      'keep',
    ])
    const by = (id: string) => sights.filter((s) => s.id === id)
    const [sx, , sz] = toWorld(station, [
      CONFIG.stand.at.x,
      0,
      CONFIG.stand.at.z,
    ])
    expect(by('cabbage-stand')[0]).toEqual({
      id: 'cabbage-stand',
      x: sx,
      z: sz,
      reach: reach.stand,
    })
    expect(by('wreck')[0]).toEqual({
      id: 'wreck',
      x: 5,
      z: 6,
      reach: reach.wreck,
    })
    // The dishes are found from the middle of the array.
    expect(by('dishes')[0]).toEqual({
      id: 'dishes',
      x: 5,
      z: 10,
      reach: reach.dishes,
    })
    expect(by('donut-field')[0]).toEqual({
      id: 'donut-field',
      x: 300,
      z: 400,
      reach: 20 + reach.donutField,
    })
    // Three rings down the maze's length, each the corn's half width out.
    const { across, along } = CONFIG.maze.size
    expect(by('corn-maze')).toEqual(
      [1 / 6, 1 / 2, 5 / 6].map((part) => ({
        id: 'corn-maze',
        x: 1000 + across / 2,
        z: 2000 + along * part,
        reach: across / 2 + reach.maze,
      }))
    )
    expect(by('maze-heart')[0]).toEqual({
      id: 'maze-heart',
      x: 1010,
      z: 2020,
      reach: reach.heart,
    })
    expect(by('keep')[0]).toEqual({ id: 'keep', x: 7, z: 8, reach: reach.keep })
  })
})
