import { describe, expect, it } from 'vitest'
import { citgoNames } from '../../src/citgomap.ts'
import {
  arrivalAt,
  citgoAt,
  fastTravel,
  NO_CITGOS,
  roadNameNear,
  surveyedStations,
  visit,
} from '../../src/citgos.ts'
import { CONFIG } from '../../src/config.ts'
import { copy } from '../../src/copy.ts'

const STATIONS = [
  { x: 0, z: 0 },
  { x: 1000, z: 0 },
  { x: 1000 + CONFIG.portal.visitReach * 1.5, z: 0 },
]

describe('which Citgo a raider stands at', () => {
  it('is the nearest pump island within reach, or none', () => {
    expect(citgoAt({ x: 3, z: 4 }, STATIONS)).toBe(0)
    expect(citgoAt({ x: 1010, z: 0 }, STATIONS)).toBe(1)
    expect(citgoAt({ x: 500, z: 0 }, STATIONS)).toBeNull()
    const reach = CONFIG.portal.visitReach
    expect(citgoAt({ x: reach, z: 0 }, STATIONS)).toBe(0)
    expect(citgoAt({ x: reach + 0.01, z: 0 }, STATIONS)).toBeNull()
  })
})

describe('the log of Citgos', () => {
  it('writes each Citgo once, in the order found, and the last', () => {
    const one = visit(NO_CITGOS, 2)
    expect(one).toEqual({ last: 2, visited: [2] })
    const two = visit(one, 0)
    expect(two).toEqual({ last: 0, visited: [2, 0] })
    // Back at one seen before: only the last moves.
    expect(visit(two, 2)).toEqual({ last: 2, visited: [2, 0] })
  })

  it('hands back the same log when nothing changed', () => {
    const log = visit(NO_CITGOS, 1)
    expect(visit(log, 1)).toBe(log)
  })
})

describe('fast travel', () => {
  const log = { last: 0, visited: [0, 1] }

  it('goes from a Citgo to one visited', () => {
    expect(fastTravel(log, 0, 1)).toBe('ok')
  })

  it('leaves only from a Citgo, never to one unseen or to where you stand', () => {
    expect(fastTravel(log, null, 1)).toBe('not-at-citgo')
    expect(fastTravel(log, 0, 2)).toBe('not-visited')
    expect(fastTravel(log, 1, 1)).toBe('here')
  })

  it('sets you down at the ring, facing the pump island', () => {
    const to = arrivalAt({ x: 10, z: 0 }, { x: 0, z: 0 })
    expect(to.x).toBe(10)
    expect(to.z).toBe(0)
    // The camera looks along (-sin yaw, -cos yaw): toward -x.
    expect(-Math.sin(to.yaw)).toBeCloseTo(-1, 9)
    expect(-Math.cos(to.yaw)).toBeCloseTo(0, 9)
  })
})

describe('naming a Citgo for its road', () => {
  const roads = [
    {
      name: '',
      points: [
        { x: -100, z: 5 },
        { x: 100, z: 5 },
      ],
    },
    {
      name: 'Bull Valley Road',
      points: [
        { x: -100, z: 20 },
        { x: 100, z: 20 },
      ],
    },
    {
      name: 'Lake Avenue',
      points: [
        { x: 50, z: -100 },
        { x: 50, z: 100 },
      ],
    },
  ]

  it('takes the nearest named road, passing the nameless', () => {
    expect(roadNameNear({ x: 0, z: 0 }, roads)).toBe('Bull Valley Road')
    expect(roadNameNear({ x: 45, z: 0 }, roads)).toBe('Lake Avenue')
  })

  it('names none past its reach', () => {
    expect(roadNameNear({ x: 0, z: 1000 }, roads, 250)).toBeNull()
  })
})

describe('the Citgos the survey stands', () => {
  it('leaves out a fuel point at the edge, and names each for its road', () => {
    const fuel = [
      { n: 'a', p: [0.5, 0.5] as [number, number] },
      { n: 'edge', p: [0.01, 0.5] as [number, number] },
      { n: 'b', p: [0.9, 0.9] as [number, number] },
    ]
    expect(surveyedStations(fuel).map((f) => f.n)).toEqual(['a', 'b'])
    const geo = {
      metres: { width: 1000, height: 1000 },
      fuel,
      roads: [
        {
          n: 'Lake Avenue',
          c: 'primary',
          p: [
            [0.4, 0.5],
            [0.6, 0.5],
          ],
        },
      ],
    } as unknown as Parameters<typeof citgoNames>[0]
    expect(citgoNames(geo)).toEqual([
      copy('map.citgo', { road: 'Lake Avenue' }),
      copy('map.citgo_unnamed', { n: 2 }),
    ])
  })
})
