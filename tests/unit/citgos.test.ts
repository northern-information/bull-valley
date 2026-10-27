import { describe, expect, it } from 'vitest'
import { citgoNames } from '../../src/citgomap.ts'
import {
  arrivalAtPhone,
  citgoAt,
  citgoLines,
  fastTravel,
  findPhone,
  knownPhones,
  NO_CITGOS,
  phoneAt,
  phoneOfCitgo,
  phonesOf,
  roadNameNear,
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

// The castle's portal phone, the drive-in's, and one by each of three
// Citgos' doors, as world.ts orders them.
const PHONES = [
  { site: 'castle' as const },
  { site: 'drive-in' as const },
  { site: 'citgo' as const, station: 0 },
  { site: 'citgo' as const, station: 1 },
  { site: 'citgo' as const, station: 2 },
]

describe('the portal phones an account knows', () => {
  it('knows each found, then each by a visited Citgo', () => {
    expect(knownPhones(NO_CITGOS, PHONES)).toEqual([])
    expect(knownPhones({ last: 2, visited: [2, 0] }, PHONES)).toEqual([2, 4])
    expect(
      knownPhones({ last: 0, visited: [0], phones: [1, 0] }, PHONES)
    ).toEqual([1, 0, 2])
    // One found by its door as well as its Citgo is known once.
    expect(knownPhones({ last: 0, visited: [0], phones: [2] }, PHONES)).toEqual(
      [2]
    )
    // One the world no longer places is not known.
    expect(
      knownPhones({ last: null, visited: [], phones: [9] }, PHONES)
    ).toEqual([])
  })

  it("finds the one by a Citgo's door", () => {
    expect(phoneOfCitgo(PHONES, 1)).toBe(3)
    expect(phoneOfCitgo(PHONES, 7)).toBeNull()
  })
})

describe('fast travel', () => {
  const known = knownPhones({ last: 0, visited: [0, 1], phones: [0] }, PHONES)

  it('goes from anywhere to a portal phone known, with one in the pack', () => {
    expect(fastTravel(known, null, 3, true)).toBe('ok')
    expect(fastTravel(known, null, 0, true)).toBe('ok')
    expect(fastTravel(known, 4, 2, true)).toBe('ok')
  })

  it('goes without one in the pack only from beside a portal phone', () => {
    expect(fastTravel(known, null, 3, false)).toBe('no-phone')
    expect(fastTravel(known, 2, 3, false)).toBe('ok')
    // One not yet found is still a phone to call from.
    expect(fastTravel(known, 1, 0, false)).toBe('ok')
  })

  it('never goes to one not known, or to where you stand', () => {
    expect(fastTravel(known, null, 4, true)).toBe('not-found')
    expect(fastTravel(known, null, 1, true)).toBe('not-found')
    expect(fastTravel(known, 3, 3, true)).toBe('here')
  })

  it('knows the portal phone a raider stands at', () => {
    const phones = [{ x: 500, z: 0 }]
    const reach = CONFIG.castle.yard.payphone.reach
    expect(phoneAt({ x: 501, z: 1 }, phones)).toBe(0)
    expect(phoneAt({ x: 500, z: reach }, phones)).toBe(0)
    expect(phoneAt({ x: 500 + reach + 0.01, z: 0 }, phones)).toBeNull()
  })

  it('sets you down in front of a portal phone, facing it', () => {
    // Its face looks along +z.
    const to = arrivalAtPhone({ x: 4, z: 4, yaw: Math.PI / 2 })
    expect(to.x).toBeCloseTo(4, 9)
    expect(to.z).toBeGreaterThan(5)
    expect(-Math.sin(to.yaw)).toBeCloseTo(0, 9)
    expect(-Math.cos(to.yaw)).toBeCloseTo(-1, 9)
  })
})

describe('the portal phones found', () => {
  it('writes each once, in the order found, and leaves the last Citgo', () => {
    const one = findPhone({ last: 2, visited: [2] }, 1)
    expect(one).toEqual({ last: 2, visited: [2], phones: [1] })
    expect(findPhone(one, 0).phones).toEqual([1, 0])
    expect(findPhone(one, 1)).toBe(one)
    expect(phonesOf(NO_CITGOS)).toEqual([])
  })

  it('says each portal phone found in the log', () => {
    const before = { last: 0, visited: [0] }
    const after = findPhone(before, 0)
    expect(citgoLines(before, after, () => 'x', true, PHONES)).toEqual([
      copy('log.payphone_found'),
    ])
    expect(citgoLines(after, after, () => 'x', true, PHONES)).toEqual([])
    // The one by a visited Citgo's door was known already: no news.
    expect(
      citgoLines(before, findPhone(before, 2), () => 'x', true, PHONES)
    ).toEqual([])
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
