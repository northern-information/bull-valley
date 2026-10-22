import { describe, expect, it } from 'vitest'
import { citgoNames } from '../../src/citgomap.ts'
import {
  arrivalAt,
  arrivalAtPhone,
  citgoAt,
  citgoLines,
  fastTravel,
  findPhone,
  NO_CITGOS,
  phoneAt,
  phonesOf,
  roadNameNear,
  stopAt,
  surveyedStations,
  visit,
} from '../../src/citgos.ts'
import { CONFIG } from '../../src/config.ts'
import { copy } from '../../src/copy.ts'
import { formatCash } from '../../src/store.ts'

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
  const log = { last: 0, visited: [0, 1], phones: [0] }

  it('goes from a Citgo to one visited', () => {
    expect(fastTravel(log, { citgo: 0 }, { citgo: 1 })).toBe('ok')
  })

  it('leaves only from a Citgo, never to one unseen or to where you stand', () => {
    expect(fastTravel(log, null, { citgo: 1 })).toBe('not-at-citgo')
    expect(fastTravel(log, { citgo: 0 }, { citgo: 2 })).toBe('not-visited')
    expect(fastTravel(log, { citgo: 1 }, { citgo: 1 })).toBe('here')
  })

  it('goes to and from a payphone found, as from a Citgo', () => {
    expect(fastTravel(log, { citgo: 1 }, { phone: 0 })).toBe('ok')
    expect(fastTravel(log, { phone: 0 }, { citgo: 1 })).toBe('ok')
    expect(fastTravel(log, { phone: 0 }, { phone: 0 })).toBe('here')
    expect(fastTravel(log, { citgo: 0 }, { phone: 1 })).toBe('not-visited')
    // A payphone not yet found is no place to leave from.
    expect(fastTravel(log, { phone: 1 }, { citgo: 0 })).toBe('not-at-citgo')
    // A log kept before there were payphones has found none.
    const old = { last: 0, visited: [0, 1] }
    expect(fastTravel(old, { citgo: 0 }, { phone: 0 })).toBe('not-visited')
  })

  it('knows where a raider stands: a Citgo first, else a payphone', () => {
    const phones = [{ x: 500, z: 0 }]
    expect(stopAt({ x: 2, z: 0 }, STATIONS, phones)).toEqual({ citgo: 0 })
    expect(stopAt({ x: 501, z: 1 }, STATIONS, phones)).toEqual({ phone: 0 })
    const reach = CONFIG.castle.yard.payphone.reach
    expect(stopAt({ x: 500 + reach + 0.01, z: 0 }, STATIONS, phones)).toBeNull()
    expect(phoneAt({ x: 500, z: reach }, phones)).toBe(0)
  })

  it('sets you down at the ring, facing the pump island', () => {
    const to = arrivalAt({ x: 10, z: 0 }, { x: 0, z: 0 })
    expect(to.x).toBe(10)
    expect(to.z).toBe(0)
    // The camera looks along (-sin yaw, -cos yaw): toward -x.
    expect(-Math.sin(to.yaw)).toBeCloseTo(-1, 9)
    expect(-Math.cos(to.yaw)).toBeCloseTo(0, 9)
  })

  it('sets you down in front of a payphone, facing it', () => {
    // Its face looks along +z.
    const to = arrivalAtPhone({ x: 4, z: 4, yaw: Math.PI / 2 })
    expect(to.x).toBeCloseTo(4, 9)
    expect(to.z).toBeGreaterThan(5)
    expect(-Math.sin(to.yaw)).toBeCloseTo(0, 9)
    expect(-Math.cos(to.yaw)).toBeCloseTo(-1, 9)
  })
})

describe('the payphones found', () => {
  it('writes each once, in the order found, and leaves the last Citgo', () => {
    const one = findPhone({ last: 2, visited: [2] }, 1)
    expect(one).toEqual({ last: 2, visited: [2], phones: [1] })
    expect(findPhone(one, 0).phones).toEqual([1, 0])
    expect(findPhone(one, 1)).toBe(one)
    expect(phonesOf(NO_CITGOS)).toEqual([])
  })

  it('says each payphone found in the log', () => {
    const before = { last: 0, visited: [0] }
    const after = findPhone(before, 0)
    expect(citgoLines(before, after, () => 'x', true)).toEqual([
      copy('log.payphone_found'),
    ])
    expect(citgoLines(after, after, () => 'x', true)).toEqual([])
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

describe('citgoLines', () => {
  const label = (station: number) => `Citgo ${station}`

  it('names each Citgo found, paid in a world but for the first ever', () => {
    const none = { last: null, visited: [] }
    const first = { last: 2, visited: [2] }
    expect(citgoLines(none, first, label, true)).toEqual([
      copy('log.citgo_visited', { citgo: 'Citgo 2' }),
    ])
    expect(
      citgoLines(first, { last: 5, visited: [2, 5] }, label, true)
    ).toEqual([
      copy('log.citgo_bounty', {
        citgo: 'Citgo 5',
        cash: formatCash(CONFIG.bounties.citgo),
      }),
    ])
    expect(
      citgoLines(first, { last: 5, visited: [2, 5] }, label, false)
    ).toEqual([copy('log.citgo_visited', { citgo: 'Citgo 5' })])
    expect(citgoLines(first, first, label, true)).toEqual([])
  })
})
