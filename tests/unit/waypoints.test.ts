import { describe, expect, it } from 'vitest'
import {
  bearingYaw,
  cleanWaypoints,
  compassX,
  liftWaypoint,
  NO_WAYPOINTS,
  placeWaypoint,
  sameWaypoints,
  toWaypoints,
  WAYPOINT_MAX,
  yawTo,
} from '../../src/waypoints.ts'

const METRES = { width: 1000, height: 600 }

describe('pinning waypoints', () => {
  it('keeps the last WAYPOINT_MAX, the oldest dropped', () => {
    let list = NO_WAYPOINTS
    for (let i = 0; i <= WAYPOINT_MAX; i++) {
      list = placeWaypoint(list, { x: i, z: 0 })
    }
    expect(list).toHaveLength(WAYPOINT_MAX)
    expect(list[0]).toEqual({ x: 1, z: 0 })
    expect(list[WAYPOINT_MAX - 1]).toEqual({ x: WAYPOINT_MAX, z: 0 })
  })

  it('lifts one pin, and none for no such pin', () => {
    const list = [
      { x: 1, z: 1 },
      { x: 2, z: 2 },
    ]
    expect(liftWaypoint(list, 0)).toEqual([{ x: 2, z: 2 }])
    expect(liftWaypoint(list, 2)).toBe(list)
    expect(liftWaypoint(list, 0.5)).toBe(list)
  })

  it('keeps only points in the survey, to the decimetre', () => {
    const kept = cleanWaypoints(
      [
        { x: 12.345, z: -6.789 },
        { x: 501, z: 0 },
        { x: 0, z: -301 },
        { x: Number.NaN, z: 0 },
        { x: 500, z: 300 },
      ],
      METRES
    )
    expect(kept).toEqual([
      { x: 12.3, z: -6.8 },
      { x: 500, z: 300 },
    ])
    const many = Array.from({ length: 9 }, (_, i) => ({ x: i, z: 0 }))
    expect(cleanWaypoints(many, METRES)).toHaveLength(WAYPOINT_MAX)
  })

  it('reads the wire, a garbled list as none', () => {
    expect(toWaypoints([{ x: 1, z: 2, y: 3 }])).toEqual([{ x: 1, z: 2 }])
    expect(toWaypoints([{ x: 'a', z: 2 }, null, 4])).toEqual([])
    expect(toWaypoints(undefined)).toEqual([])
  })

  it('tells two lists apart', () => {
    expect(sameWaypoints([{ x: 1, z: 2 }], [{ x: 1, z: 2 }])).toBe(true)
    expect(sameWaypoints([{ x: 1, z: 2 }], [{ x: 1, z: 3 }])).toBe(false)
    expect(sameWaypoints([], [{ x: 1, z: 2 }])).toBe(false)
  })
})

describe('the compass', () => {
  const here = { x: 0, z: 0 }

  it('faces north at yaw 0, east at -π/2', () => {
    expect(yawTo(here, { x: 0, z: -10 })).toBeCloseTo(0)
    expect(yawTo(here, { x: 10, z: 0 })).toBeCloseTo(-Math.PI / 2)
    expect(yawTo(here, { x: -10, z: 0 })).toBeCloseTo(Math.PI / 2)
    expect(bearingYaw(90)).toBeCloseTo(-Math.PI / 2)
  })

  it('puts what is ahead in the middle and east to the right of north', () => {
    const span = Math.PI
    expect(compassX(0, bearingYaw(0), span)).toBeCloseTo(0)
    expect(compassX(0, bearingYaw(45), span)).toBeCloseTo(0.5)
    expect(compassX(0, bearingYaw(-45), span)).toBeCloseTo(-0.5)
    expect(compassX(0, bearingYaw(180), span)).toBeNull()
  })

  it('wraps round the back', () => {
    const span = Math.PI / 2
    // Facing south, a little west of south is right of the middle.
    const south = bearingYaw(180)
    expect(compassX(south, bearingYaw(200), span)).toBeCloseTo(20 / 45)
    expect(compassX(south, bearingYaw(160), span)).toBeCloseTo(-20 / 45)
    expect(compassX(south + 4 * Math.PI, bearingYaw(160), span)).toBeCloseTo(
      -20 / 45
    )
  })
})
