import { describe, expect, it } from 'vitest'
import { CONFIG } from '../../src/config.ts'
import {
  interactionPrompt,
  pickupLabel,
  resolveInteraction,
} from '../../src/interactions.ts'
import { advance, createRaid, EVENTS } from '../../src/raid.ts'
import type {
  InteractionInput,
  PickupSpot,
  StationSpot,
} from '../../src/interactions.ts'
import type { Raid } from '../../src/interfaces.ts'

const spawnStation: StationSpot = { x: 0, z: 0, name: 'Spawn Citgo' }
const farStation: StationSpot = { x: 500, z: 0, name: 'Far Citgo' }
const stand = { x: 0, z: 500 }
const keep = { x: -500, z: 0 }

function onFoot(): Raid {
  return advance(
    advance(createRaid(0), EVENTS.BOARD_TRUCK, 1),
    EVENTS.HOP_OUT,
    2
  )
}

// Defaults put the player in open country: no truck, stand, extract, or
// pickup in reach.
function input(
  over: Partial<InteractionInput<PickupSpot>> = {}
): InteractionInput<PickupSpot> {
  return {
    raid: onFoot(),
    ended: false,
    player: { x: 250, z: 250 },
    truck: { distance: 1000, moving: false },
    stand,
    keep,
    stations: [spawnStation, farStation],
    spawnStation,
    pickups: [],
    ...over,
  }
}

describe('resolveInteraction', () => {
  it('offers nothing in open country, or after the raid ends', () => {
    expect(resolveInteraction(input())).toBeNull()
    expect(
      resolveInteraction(input({ ended: true, raid: createRaid(0) }))
    ).toBeNull()
  })

  it('hops out while riding, wherever the truck is', () => {
    const riding = advance(createRaid(0), EVENTS.BOARD_TRUCK, 1)
    expect(resolveInteraction(input({ raid: riding }))).toEqual({
      kind: 'hopOut',
    })
  })

  it('boards during the loadout only within board range', () => {
    const near = { distance: CONFIG.truck.boardRange - 0.1, moving: false }
    const far = { distance: CONFIG.truck.boardRange + 0.1, moving: false }
    const raid = createRaid(0)
    expect(resolveInteraction(input({ raid, truck: near }))).toEqual({
      kind: 'board',
    })
    expect(resolveInteraction(input({ raid, truck: far }))).toBeNull()
  })

  it('boards the called truck to end the raid once it stops', () => {
    const raid = advance(onFoot(), EVENTS.CALL_TRUCK, 3)
    const stopped = { distance: 1, moving: false }
    expect(resolveInteraction(input({ raid, truck: stopped }))).toEqual({
      kind: 'boardExtract',
    })
    const rolling = { distance: 1, moving: true }
    expect(resolveInteraction(input({ raid, truck: rolling }))).toBeNull()
  })

  it('unloads at the stand only while carrying', () => {
    const atStand = { player: { x: stand.x, z: stand.z } }
    expect(resolveInteraction(input(atStand))).toBeNull()
    const raid = advance(onFoot(), EVENTS.PICK_CABBAGE, 3)
    expect(resolveInteraction(input({ ...atStand, raid }))).toEqual({
      kind: 'unload',
      count: 1,
    })
  })

  it('extracts at any station but the spawn, and at the Keep', () => {
    expect(
      resolveInteraction(input({ player: { x: farStation.x, z: 1 } }))
    ).toEqual({ kind: 'extractFuel', name: 'Far Citgo' })
    expect(resolveInteraction(input({ player: { x: 0, z: 1 } }))).toBeNull()
    expect(
      resolveInteraction(input({ player: { x: keep.x, z: keep.z } }))
    ).toEqual({ kind: 'extractKeep' })
  })

  it('offers the nearest untaken pickup within reach', () => {
    const near: PickupSpot = {
      x: 251,
      z: 250,
      kind: 'cabbage',
      count: 1,
      taken: false,
    }
    const nearer: PickupSpot = {
      x: 250.5,
      z: 250,
      kind: 'joints',
      count: 2,
      taken: false,
    }
    const taken: PickupSpot = { ...nearer, x: 250, taken: true }
    const result = resolveInteraction(input({ pickups: [near, nearer, taken] }))
    expect(result).toEqual({ kind: 'pickup', pickup: nearer })
    const outOfReach: PickupSpot = {
      ...near,
      x: 250 + CONFIG.player.pickupReach + 0.1,
    }
    expect(resolveInteraction(input({ pickups: [outOfReach] }))).toBeNull()
  })

  it('offers pickups during the loadout away from the truck', () => {
    const pickup: PickupSpot = {
      x: 250,
      z: 250,
      kind: 'cabbage',
      count: 1,
      taken: false,
    }
    expect(
      resolveInteraction(input({ raid: createRaid(0), pickups: [pickup] }))
    ).toEqual({ kind: 'pickup', pickup })
  })

  it('puts the stand ahead of a pickup at the same spot', () => {
    const raid = advance(onFoot(), EVENTS.PICK_CABBAGE, 3)
    const pickup: PickupSpot = {
      ...stand,
      kind: 'cabbage',
      count: 1,
      taken: false,
    }
    expect(
      resolveInteraction(input({ raid, player: stand, pickups: [pickup] }))
    ).toEqual({ kind: 'unload', count: 1 })
  })
})

describe('interactionPrompt', () => {
  it('names each action', () => {
    expect(interactionPrompt({ kind: 'hopOut' })).toBe('E — Hop Out')
    expect(interactionPrompt({ kind: 'unload', count: 1 })).toBe(
      'E — Unload 1 Cabbage'
    )
    expect(interactionPrompt({ kind: 'unload', count: 3 })).toBe(
      'E — Unload 3 Cabbages'
    )
    expect(interactionPrompt({ kind: 'extractFuel', name: '' })).toBe(
      'E — End the Raid at the Station'
    )
    expect(
      interactionPrompt({
        kind: 'pickup',
        pickup: { x: 0, z: 0, kind: 'joints', count: 2, taken: false },
      })
    ).toBe('E — Take Joints x2')
  })

  it('labels a cabbage without a count', () => {
    expect(pickupLabel({ kind: 'cabbage', count: 1 })).toBe('Cabbage')
  })
})
