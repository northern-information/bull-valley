import { describe, expect, it } from 'vitest'
import { CONFIG } from '../../src/config.ts'
import {
  atProjector,
  boothWalls,
  carSpots,
  DRIVE_IN,
  driveInPlace,
  driveInToWorld,
  filmTitle,
  filmUrl,
  inBooth,
  isFilmName,
  offReel,
  onDriveIn,
  PROJECTOR_AT,
  projectorOf,
  reelSeconds,
  screenVolume,
  speakerPosts,
  weedSpots,
} from '../../src/drivein.ts'
import { inMaze, mazeToWorld } from '../../src/maze.ts'

const MAZE = { x: -400, z: 250, yaw: 2.4 }

describe('the drive-in', () => {
  it('stands in the maze’s frame past its far end, clear of the corn', () => {
    const place = driveInPlace(MAZE)
    const at = mazeToWorld(MAZE, CONFIG.driveIn.at)
    expect(place).toEqual({ x: at.x, z: at.z, yaw: MAZE.yaw })
    const middle = driveInToWorld(MAZE, { x: 0, z: 0 })
    expect(middle.x).toBeCloseTo(at.x)
    expect(middle.z).toBeCloseTo(at.z)
    // Every corner of the lot lies outside the maze, with room for trees.
    const { half } = CONFIG.driveIn
    for (const [x, z] of [
      [-half.x, -half.z],
      [half.x, -half.z],
      [half.x, half.z],
      [-half.x, half.z],
    ]) {
      const p = { x: CONFIG.driveIn.at.x + x, z: CONFIG.driveIn.at.z + z }
      expect(inMaze(CONFIG.maze.size, p.x, p.z, CONFIG.maze.treeClear)).toBe(
        false
      )
    }
  })

  it('counts a point on the lot as on it, and a step past as not', () => {
    const { half } = CONFIG.driveIn
    const on = (x: number, z: number, margin?: number) =>
      onDriveIn(MAZE, driveInToWorld(MAZE, { x, z }), margin)
    expect(on(0, 0)).toBe(true)
    expect(on(half.x - 0.1, half.z - 0.1)).toBe(true)
    expect(on(half.x + 0.1, 0)).toBe(false)
    expect(on(0, -half.z - 0.1)).toBe(false)
    expect(on(half.x + 1, 0, 2)).toBe(true)
  })

  it('threads the projector only from beside it', () => {
    const p = projectorOf(MAZE)
    const local = driveInToWorld(MAZE, PROJECTOR_AT)
    expect(p.x).toBeCloseTo(local.x)
    const reach = CONFIG.driveIn.projectorReach
    expect(atProjector(MAZE, p)).toBe(true)
    expect(atProjector(MAZE, { x: p.x + reach + 0.1, z: p.z })).toBe(false)
    expect(atProjector(MAZE, { x: p.x + reach + 0.1, z: p.z }, 1)).toBe(true)
  })

  it('walls the booth all round but the door, the projector inside', () => {
    const walls = boothWalls()
    expect(walls).toHaveLength(5)
    // Each piece runs on from the last, but across the door.
    const { door, width, depth, z } = DRIVE_IN.booth
    let gaps = 0
    walls.forEach((w, i) => {
      const next = walls[(i + 1) % walls.length]
      const gap = Math.hypot(w.b.x - next.a.x, w.b.z - next.a.z)
      if (gap > 0) {
        gaps++
        expect(gap).toBeCloseTo(door)
      }
    })
    expect(gaps).toBe(1)
    expect(Math.abs(PROJECTOR_AT.x)).toBeLessThan(width / 2)
    expect(Math.abs(PROJECTOR_AT.z - z)).toBeLessThan(depth / 2)
  })

  it('parks the same burnt-out cars for everyone, in the rows, on the lot', () => {
    const cars = carSpots()
    expect(carSpots()).toEqual(cars)
    expect(cars).toHaveLength(DRIVE_IN.cars)
    expect(new Set(cars.map((c) => c.x + ',' + Math.round(c.z))).size).toBe(
      cars.length
    )
    const { half } = CONFIG.driveIn
    for (const car of cars) {
      expect(Math.abs(car.x)).toBeLessThanOrEqual(DRIVE_IN.reach)
      expect(Math.abs(car.x) + DRIVE_IN.carRadius).toBeLessThan(half.x)
      expect(DRIVE_IN.rows.some((row) => Math.abs(row - car.z) <= 0.4)).toBe(
        true
      )
      expect(Math.abs(car.yaw)).toBeLessThanOrEqual(0.25)
      // Clear of the booth and the screen.
      expect(car.z - DRIVE_IN.carHalf).toBeGreaterThan(
        DRIVE_IN.booth.z + DRIVE_IN.booth.depth / 2
      )
      expect(car.z + DRIVE_IN.carHalf).toBeLessThan(DRIVE_IN.screen.z)
    }
    const posts = speakerPosts()
    expect(posts.length).toBeGreaterThan(0)
    for (const post of posts) {
      expect(DRIVE_IN.rows).toContain(post.z)
      // Between stalls, never in one.
      expect(Math.abs((post.x / DRIVE_IN.pitch) % 1)).toBeCloseTo(0.5)
    }
  })
})

describe('the weeds', () => {
  it('grows the same weeds for everyone, on the lot, none in the booth', () => {
    const weeds = weedSpots()
    expect(weedSpots()).toEqual(weeds)
    expect(weeds.length).toBeGreaterThan(DRIVE_IN.weeds / 2)
    const { half } = CONFIG.driveIn
    for (const weed of weeds) {
      expect(Math.abs(weed.x)).toBeLessThanOrEqual(half.x)
      expect(Math.abs(weed.z)).toBeLessThanOrEqual(half.z)
      expect(inBooth(weed)).toBe(false)
    }
    // Some crowd round each car.
    for (const car of carSpots()) {
      const near = weeds.filter(
        (w) => Math.hypot(w.x - car.x, w.z - car.z) <= DRIVE_IN.weedHug + 0.5
      )
      expect(near.length).toBeGreaterThan(0)
    }
  })

  it('knows the booth from the lot', () => {
    expect(inBooth({ x: 0, z: DRIVE_IN.booth.z })).toBe(true)
    expect(inBooth({ x: 0, z: 0 })).toBe(false)
  })
})

describe('the films', () => {
  it('shows an .mp4 with a plain name at the bucket’s top level', () => {
    expect(isFilmName('night_of_the_living_dead.mp4')).toBe(true)
    expect(isFilmName('Carnival of Souls (1962).MP4')).toBe(true)
    expect(isFilmName("It's Alive!.mp4")).toBe(true)
    for (const bad of [
      'a.mov',
      '.mp4',
      'trailers/a.mp4',
      '../a.mp4',
      'a..b.mp4',
      ' a.mp4',
      `${'a'.repeat(120)}.mp4`,
      3,
      null,
    ]) {
      expect(isFilmName(bad)).toBe(false)
    }
  })

  it('lists a film by its name, and serves it under that name', () => {
    expect(filmTitle('night_of_the_living_dead.mp4')).toBe(
      'night of the living dead'
    )
    expect(filmUrl('carnival of souls.mp4')).toBe(
      '/films/carnival%20of%20souls.mp4'
    )
  })

  it('plays from its start on the valley’s clock, round and round', () => {
    const reel = { film: 'a.mp4', since: 10_000 }
    expect(reelSeconds(reel, 10_000, 60)).toBe(0)
    expect(reelSeconds(reel, 5_000, 60)).toBe(0)
    expect(reelSeconds(reel, 40_000, 60)).toBe(30)
    expect(reelSeconds(reel, 85_000, 60)).toBe(15)
    expect(reelSeconds(reel, 85_000, 0)).toBe(0)
    expect(reelSeconds(reel, 85_000, NaN)).toBe(0)
  })

  it('puts a film back on the reel only when it has wandered off it', () => {
    const s = CONFIG.driveIn.resyncSeconds
    expect(offReel(10, 10 + s / 2, 60)).toBe(false)
    expect(offReel(10, 10 + s * 2, 60)).toBe(true)
    // Across the loop's seam, the near way round.
    expect(offReel(59.5, 0.5, 60)).toBe(false)
    expect(offReel(10, 30, 0)).toBe(false)
  })

  it('is loud under the screen and gone past its range', () => {
    expect(screenVolume(0)).toBe(1)
    expect(screenVolume(CONFIG.driveIn.hearRange / 2)).toBeCloseTo(0.25)
    expect(screenVolume(CONFIG.driveIn.hearRange)).toBe(0)
    expect(screenVolume(CONFIG.driveIn.hearRange * 2)).toBe(0)
  })
})
