import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { surveyedStations } from '../../src/citgos.ts'
import { CONFIG } from '../../src/config.ts'
import { pointSegmentDistance, unitToWorld } from '../../src/coords.ts'
import { castlePlace, MOAT, onMoatGrounds } from '../../src/moat.ts'
import { roadWidth } from '../../src/roadside.ts'
import { chooseSpawnStation, stationFacing } from '../../src/stations.ts'
import { toWorld } from '../../src/store.ts'
import type { Geo } from '../../src/interfaces.ts'
import type { FuelPoint } from '../../src/world.ts'

// Castle Entropy stands straight out the spawn Citgo's door (moat.ts
// castlePlace), and its moat is cut into the terrain: nothing in the survey
// may lie on its grounds, no road, no water, and not the corn maze.

const geo = JSON.parse(
  readFileSync('public/data/bull-valley/geo.json', 'utf8')
) as Geo
const { metres } = geo

// The stations as world.ts places them, without the meshes.
const stations: FuelPoint[] = surveyedStations(geo.fuel).map((f) => {
  const { x, z, yaw } = stationFacing(
    geo.roads,
    metres,
    unitToWorld(f.p[0], f.p[1], metres)
  )
  return { x, z, yaw, y: 0, name: f.n }
})
const spawn = chooseSpawnStation(geo, metres, stations)
if (!spawn) throw new Error('No spawn station in the survey')
const place = castlePlace(spawn)
// The moat's whole reach from its middle, and what the grounds add.
const reach =
  Math.max(...MOAT.outer.map((p) => Math.hypot(p.x, p.z))) +
  CONFIG.castle.moat.clear

describe("Castle Entropy's place in the survey", () => {
  it('lies straight out the spawn Citgo, past the donut field', () => {
    const out = { x: Math.cos(spawn.yaw), z: Math.sin(spawn.yaw) }
    const along = (place.x - spawn.x) * out.x + (place.z - spawn.z) * out.z
    expect(along).toBeGreaterThan(
      CONFIG.truck.donuts.field.x + CONFIG.truck.donuts.radius + reach
    )
  })

  it('crosses no road', () => {
    for (const road of geo.roads) {
      const half = roadWidth(road.c) / 2
      const points = road.p.map(([u, v]) => unitToWorld(u, v, metres))
      for (let i = 0; i < points.length - 1; i++) {
        const a = points[i]
        const b = points[i + 1]
        const d = pointSegmentDistance(place.x, place.z, a.x, a.z, b.x, b.z)
        expect(d - half, road.n).toBeGreaterThan(reach)
      }
    }
  })

  it('swallows no water', () => {
    for (const water of geo.water) {
      for (const [u, v] of water.p) {
        const { x, z } = unitToWorld(u, v, metres)
        expect(onMoatGrounds(place, x, z), water.n).toBe(false)
      }
    }
  })

  it('stays clear of the corn maze', () => {
    const { at, size } = CONFIG.maze
    for (const [x, z] of [
      [0, 0],
      [size.across, 0],
      [0, size.along],
      [size.across, size.along],
    ]) {
      const [wx, , wz] = toWorld(spawn, [at.x + x, 0, at.z + z])
      expect(onMoatGrounds(place, wx, wz)).toBe(false)
    }
    // The maze's nearest edge, from the moat's middle in the station's
    // frame.
    const [mx, , mz] = toWorld(spawn, [at.x + size.across, 0, at.z])
    expect(Math.hypot(mx - place.x, mz - place.z)).toBeGreaterThan(reach)
  })
})
