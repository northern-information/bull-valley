import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import {
  addFeature,
  applyPatch,
  areaSquareMetres,
  deleteFeature,
  deleteVertex,
  featureAt,
  History,
  hitTest,
  insertVertex,
  invert,
  isGeo,
  LAYERS,
  lengthMetres,
  minPoints,
  moveFeature,
  moveVertex,
  nameOf,
  newFeature,
  pointsOf,
  serializeGeo,
  setProps,
  shapeOf,
  snapPoint,
} from '../../src/mapedit.ts'
import type { Geo, Graveyard, Road, Water } from '../../src/interfaces.ts'
import type { LayerId } from '../../src/mapedit.ts'

// A small survey of every layer, not the committed map.
function survey(): Geo {
  return {
    bbox: { south: 0, west: 0, north: 1, east: 1 },
    metres: { width: 10000, height: 10000 },
    terrain: { size: 4, min: 0, max: 10 },
    boundary: [
      [
        [0.1, 0.1],
        [0.9, 0.1],
        [0.9, 0.9],
        [0.1, 0.9],
      ],
    ],
    roads: [
      {
        c: 'primary',
        n: 'Bull Valley Road',
        p: [
          [0.2, 0.5],
          [0.5, 0.5],
          [0.8, 0.5],
        ],
      },
      {
        c: 'residential',
        n: '',
        p: [
          [0.3, 0.3],
          [0.3, 0.4],
        ],
      },
    ],
    water: [
      {
        k: 'area',
        n: 'Pond',
        p: [
          [0.6, 0.6],
          [0.7, 0.6],
          [0.7, 0.7],
        ],
      },
      {
        k: 'line',
        n: 'Creek',
        p: [
          [0.2, 0.8],
          [0.4, 0.8],
        ],
      },
    ],
    wetland: [
      [
        [0.4, 0.2],
        [0.45, 0.2],
        [0.45, 0.25],
      ],
    ],
    reserves: [],
    graveyards: [
      {
        n: 'Yard',
        c: [0.15, 0.15],
        p: [
          [0.12, 0.12],
          [0.18, 0.12],
          [0.18, 0.18],
          [0.12, 0.18],
        ],
      },
    ],
    fuel: [{ n: 'Citgo', p: [0.5, 0.52] }],
  }
}

describe('mapedit', () => {
  it('snaps to the survey grid inside the frame', () => {
    expect(snapPoint(0.123456, 0.98765)).toEqual([0.1235, 0.9877])
    expect(snapPoint(-0.2, 1.3)).toEqual([0, 1])
  })

  it('reads every layer through one shape', () => {
    const geo = survey()
    expect(shapeOf('fuel', geo.fuel[0])).toBe('point')
    expect(shapeOf('roads', geo.roads[0])).toBe('line')
    expect(shapeOf('water', geo.water[0])).toBe('area')
    expect(shapeOf('water', geo.water[1])).toBe('line')
    expect(shapeOf('wetland', geo.wetland[0])).toBe('area')
    expect(pointsOf('fuel', geo.fuel[0])).toEqual([[0.5, 0.52]])
    expect(pointsOf('boundary', geo.boundary[0])).toHaveLength(4)
    expect(nameOf('roads', geo.roads[0])).toBe('Bull Valley Road')
    expect(nameOf('wetland', geo.wetland[0])).toBe('')
    expect([minPoints('area'), minPoints('line'), minPoints('point')]).toEqual([
      3, 2, 1,
    ])
  })

  it('moves a vertex and undoes it with the inverse patch', () => {
    const geo = survey()
    const ref = { layer: 'roads' as const, index: 0 }
    const patch = moveVertex(geo, ref, 1, [0.51234, 0.49])
    expect(patch).not.toBeNull()
    applyPatch(geo, patch!)
    expect(geo.roads[0].p[1]).toEqual([0.5123, 0.49])
    applyPatch(geo, invert(patch!))
    expect(geo.roads[0].p[1]).toEqual([0.5, 0.5])
    expect(moveVertex(geo, ref, 9, [0, 0])).toBeNull()
    expect(moveVertex(geo, { layer: 'roads', index: 9 }, 0, [0, 0])).toBeNull()
  })

  it('moves a whole feature, and a fuel point is its one point', () => {
    const geo = survey()
    applyPatch(geo, moveFeature(geo, { layer: 'fuel', index: 0 }, 0.01, -0.02)!)
    expect(geo.fuel[0]).toEqual({ n: 'Citgo', p: [0.51, 0.5] })
    applyPatch(
      geo,
      moveVertex(geo, { layer: 'fuel', index: 0 }, 0, [0.3, 0.3])!
    )
    expect(geo.fuel[0].p).toEqual([0.3, 0.3])
    expect(moveFeature(geo, { layer: 'fuel', index: 5 }, 0, 0)).toBeNull()
  })

  it('keeps a graveyard centre on its fence', () => {
    const geo = survey()
    const ref = { layer: 'graveyards' as const, index: 0 }
    applyPatch(geo, moveFeature(geo, ref, 0.1, 0.1)!)
    expect((featureAt(geo, ref) as Graveyard).c).toEqual([0.25, 0.25])
  })

  it('inserts and deletes points, never below the shape allows', () => {
    const geo = survey()
    const road = { layer: 'roads' as const, index: 1 }
    expect(deleteVertex(geo, road, 0)).toBeNull()
    applyPatch(geo, insertVertex(geo, road, 1, [0.31, 0.35])!)
    expect(geo.roads[1].p).toEqual([
      [0.3, 0.3],
      [0.31, 0.35],
      [0.3, 0.4],
    ])
    applyPatch(geo, deleteVertex(geo, road, 1)!)
    expect(geo.roads[1].p).toHaveLength(2)
    expect(deleteVertex(geo, { layer: 'wetland', index: 0 }, 0)).toBeNull()
    expect(insertVertex(geo, { layer: 'fuel', index: 0 }, 0, [0, 0])).toBeNull()
    expect(deleteVertex(geo, { layer: 'roads', index: 0 }, 7)).toBeNull()
  })

  it('adds a feature at the end and deletes one from its slot', () => {
    const geo = survey()
    const add = addFeature(
      geo,
      'roads',
      newFeature('roads', [
        [0.1, 0.2],
        [0.2, 0.2],
      ])
    )
    expect(add.index).toBe(2)
    applyPatch(geo, add)
    expect(geo.roads[2]).toEqual({
      c: 'residential',
      n: '',
      p: [
        [0.1, 0.2],
        [0.2, 0.2],
      ],
    })
    const del = deleteFeature(geo, { layer: 'roads', index: 0 })!
    applyPatch(geo, del)
    expect(geo.roads).toHaveLength(2)
    applyPatch(geo, invert(del))
    expect(geo.roads[0].n).toBe('Bull Valley Road')
    expect(deleteFeature(geo, { layer: 'roads', index: 10 })).toBeNull()
  })

  it('builds a new feature for every layer', () => {
    const ring: [number, number][] = [
      [0.1, 0.1],
      [0.2, 0.1],
      [0.2, 0.2],
    ]
    for (const { id } of LAYERS) {
      const f = newFeature(id, ring)
      const geo = survey()
      applyPatch(geo, addFeature(geo, id, f))
      expect(isGeo(geo), id).toBe(true)
    }
    expect((newFeature('water', ring, 'line') as Water).k).toBe('line')
    expect((newFeature('graveyards', ring) as Graveyard).c).toEqual([
      0.1667, 0.1333,
    ])
  })

  it('sets a name, a road class and a water kind', () => {
    const geo = survey()
    applyPatch(
      geo,
      setProps(geo, { layer: 'roads', index: 1 }, { n: 'Lane', c: 'tertiary' })!
    )
    expect(geo.roads[1]).toMatchObject({ n: 'Lane', c: 'tertiary' } as Road)
    // A water line of two points cannot become an area.
    expect(
      setProps(geo, { layer: 'water', index: 1 }, { k: 'area' })
    ).toBeNull()
    applyPatch(geo, setProps(geo, { layer: 'water', index: 0 }, { k: 'line' })!)
    expect(geo.water[0].k).toBe('line')
    // A road has no kind, a fuel station no class.
    applyPatch(
      geo,
      setProps(geo, { layer: 'fuel', index: 0 }, { c: 'primary' })!
    )
    expect(geo.fuel[0]).toEqual({ n: 'Citgo', p: [0.5, 0.52] })
    expect(setProps(geo, { layer: 'wetland', index: 0 }, { n: 'x' })).toBeNull()
  })

  it('hits the selection first, then vertices, edges and areas', () => {
    const geo = survey()
    const all = LAYERS.map((l) => l.id)
    // The fuel point sits close to the road; the road's vertex is nearer.
    expect(hitTest(geo, all, [0.5, 0.505], 0.02)).toEqual({
      ref: { layer: 'roads', index: 0 },
      vertex: 1,
    })
    // Preferring the fuel point wins its vertex.
    expect(
      hitTest(geo, all, [0.5, 0.505], 0.02, { layer: 'fuel', index: 0 })
    ).toEqual({ ref: { layer: 'fuel', index: 0 }, vertex: 0 })
    const edge = hitTest(geo, all, [0.35, 0.502], 0.01)
    expect(edge?.ref).toEqual({ layer: 'roads', index: 0 })
    expect(edge?.segment).toBe(0)
    expect(edge?.at?.[1]).toBeCloseTo(0.5)
    // Inside both the boundary and the pond: the smaller area.
    expect(hitTest(geo, all, [0.68, 0.64], 0.001)?.ref).toEqual({
      layer: 'water',
      index: 0,
    })
    // Hidden layers are never hit.
    const some: LayerId[] = ['fuel']
    expect(hitTest(geo, some, [0.68, 0.64], 0.001)).toBeNull()
    // The closing edge of an area is an edge.
    expect(hitTest(geo, all, [0.1, 0.5], 0.001)?.segment).toBe(3)
  })

  it('measures lines and areas in metres', () => {
    const geo = survey()
    expect(lengthMetres(geo.roads[0].p, 'line', geo.metres)).toBeCloseTo(6000)
    expect(lengthMetres(geo.boundary[0], 'area', geo.metres)).toBeCloseTo(32000)
    expect(areaSquareMetres(geo.boundary[0], geo.metres)).toBeCloseTo(64e6)
  })

  it('folds a drag into one undo step and tracks what is saved', () => {
    const geo = survey()
    const history = new History(geo)
    const ref = { layer: 'roads' as const, index: 0 }
    expect(history.commit(null)).toBe(false)
    expect(history.dirty).toBe(false)
    history.commit(moveVertex(geo, ref, 0, [0.21, 0.5]), 'drag')
    history.commit(moveVertex(geo, ref, 0, [0.22, 0.5]), 'drag')
    history.commit(moveVertex(geo, ref, 0, [0.23, 0.5]), 'drag')
    history.seal()
    expect(history.dirty).toBe(true)
    expect(history.canUndo).toBe(true)
    history.undo()
    expect(geo.roads[0].p[0]).toEqual([0.2, 0.5])
    expect(history.dirty).toBe(false)
    expect(history.canUndo).toBe(false)
    history.redo()
    expect(geo.roads[0].p[0]).toEqual([0.23, 0.5])
    expect(history.canRedo).toBe(false)
    history.markSaved()
    expect(history.dirty).toBe(false)

    // Undo past the save, then branch: never clean again until saved.
    history.undo()
    history.commit(moveVertex(geo, ref, 0, [0.3, 0.5]))
    expect(history.dirty).toBe(true)
    history.undo()
    expect(history.dirty).toBe(true)
    expect(history.undo()).toBeNull()
    history.redo()
    expect(history.redo()).toBeNull()
  })

  it('a keyed commit onto the saved state makes it dirty', () => {
    const geo = survey()
    const history = new History(geo)
    const ref = { layer: 'fuel' as const, index: 0 }
    history.commit(moveFeature(geo, ref, 0.01, 0), 'nudge')
    history.markSaved()
    history.commit(moveFeature(geo, ref, 0.01, 0), 'nudge')
    expect(history.dirty).toBe(true)
    history.undo()
    expect(geo.fuel[0].p).toEqual([0.5, 0.52])
  })

  it('accepts only a well-formed survey', () => {
    expect(isGeo(survey())).toBe(true)
    expect(isGeo(null)).toBe(false)
    expect(isGeo({ ...survey(), bbox: null })).toBe(false)
    expect(isGeo({ ...survey(), metres: 1 })).toBe(false)
    expect(isGeo({ ...survey(), terrain: undefined })).toBe(false)
    expect(isGeo({ ...survey(), roads: {} })).toBe(false)
    expect(isGeo({ ...survey(), wetland: [[[0, 'x']]] })).toBe(false)
    expect(isGeo({ ...survey(), fuel: [null] })).toBe(false)
    expect(isGeo({ ...survey(), fuel: [{ n: 1, p: [0, 0] }] })).toBe(false)
    expect(isGeo({ ...survey(), fuel: [{ n: '', p: [[0, 0]] }] })).toBe(false)
    expect(
      isGeo({ ...survey(), roads: [{ c: 'highway', n: '', p: [] }] })
    ).toBe(false)
    expect(isGeo({ ...survey(), water: [{ k: 'sea', n: '', p: [] }] })).toBe(
      false
    )
    expect(
      isGeo({ ...survey(), graveyards: [{ n: '', p: [], c: null }] })
    ).toBe(false)
    expect(
      isGeo({ ...survey(), roads: [{ c: 'primary', n: '', p: [[NaN, 0]] }] })
    ).toBe(false)
  })

  it('writes the committed map back byte for byte', () => {
    const file = readFileSync('public/data/bull-valley/geo.json', 'utf8')
    const geo: unknown = JSON.parse(file)
    expect(isGeo(geo)).toBe(true)
    expect(serializeGeo(geo as Geo)).toBe(file)
  })
})
