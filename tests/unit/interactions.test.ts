import { describe, expect, it } from 'vitest'
import { CONFIG } from '../../src/config.ts'
import { copy } from '../../src/copy.ts'
import {
  interactionPrompt,
  pickupLabel,
  resolveInteraction,
} from '../../src/interactions.ts'
import { advance, createRaid, EVENTS } from '../../src/raid.ts'
import type {
  InteractionInput,
  PickupSpot,
  ShelfSpot,
  StationSpot,
} from '../../src/interactions.ts'
import type { Raid } from '../../src/interfaces.ts'

const spawnStation: StationSpot = { x: 0, z: 0, name: 'Spawn Citgo' }
const farStation: StationSpot = { x: 500, z: 0, name: 'Far Citgo' }
const stand = { x: 0, z: 500 }
const keep = { x: -500, z: 0 }
const bush = { x: -8, z: -8 }
const shelf: ShelfSpot = {
  item: 'marlboro',
  station: 1,
  price: 549,
  affordable: true,
}

function onFoot(): Raid {
  return advance(
    advance(createRaid(0), EVENTS.BOARD_TRUCK, 1),
    EVENTS.HOP_OUT,
    2
  )
}

// Defaults put the player in open country: no truck, stand, extract, bush,
// or pickup in reach, with the valley answering.
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
    shelf: null,
    insideStore: false,
    bush,
    daily: 'ready',
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

  it('buys off the shelf in view, ahead of the station extract', () => {
    const atFar = { player: { x: farStation.x, z: 1 } }
    expect(
      resolveInteraction(input({ ...atFar, shelf, insideStore: true }))
    ).toEqual({ kind: 'buy', ...shelf })
    expect(
      resolveInteraction(input({ raid: createRaid(0), shelf }))
    ).toMatchObject({ kind: 'buy', item: 'marlboro' })
  })

  it('never offers the station extract from inside its store', () => {
    expect(
      resolveInteraction(
        input({ player: { x: farStation.x, z: 1 }, insideStore: true })
      )
    ).toBeNull()
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

  it('offers the bush within reach, as the valley has it today', () => {
    const atBush = { player: { x: bush.x + 1, z: bush.z } }
    expect(resolveInteraction(input(atBush))).toEqual({
      kind: 'collect',
      status: 'ready',
    })
    expect(resolveInteraction(input({ ...atBush, daily: 'picked' }))).toEqual({
      kind: 'collect',
      status: 'picked',
    })
    expect(resolveInteraction(input({ ...atBush, daily: 'offline' }))).toEqual({
      kind: 'collect',
      status: 'offline',
    })
    // During the loadout too: the bush stands on the spawn lot.
    expect(
      resolveInteraction(input({ ...atBush, raid: createRaid(0) }))
    ).toEqual({ kind: 'collect', status: 'ready' })
    const outOfReach = {
      player: { x: bush.x + CONFIG.daily.reach + 0.1, z: bush.z },
    }
    expect(resolveInteraction(input(outOfReach))).toBeNull()
    expect(resolveInteraction(input({ ...atBush, bush: null }))).toBeNull()
  })

  it('puts the bush ahead of a pickup beside it, and the truck ahead of the bush', () => {
    const pickup: PickupSpot = {
      ...bush,
      kind: 'cabbage',
      count: 1,
      taken: false,
    }
    const atBush = { player: { x: bush.x + 1, z: bush.z }, pickups: [pickup] }
    expect(resolveInteraction(input(atBush))).toEqual({
      kind: 'collect',
      status: 'ready',
    })
    const truck = { distance: CONFIG.truck.boardRange - 0.1, moving: false }
    expect(
      resolveInteraction(input({ ...atBush, raid: createRaid(0), truck }))
    ).toEqual({ kind: 'board' })
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
    expect(interactionPrompt({ kind: 'hopOut' })).toBe(copy('prompts.hop_out'))
    expect(interactionPrompt({ kind: 'unload', count: 1 })).toBe(
      copy('prompts.unload_one')
    )
    expect(interactionPrompt({ kind: 'unload', count: 3 })).toBe(
      copy('prompts.unload_many', { count: 3 })
    )
    expect(interactionPrompt({ kind: 'extractFuel', name: '' })).toBe(
      copy('prompts.extract_station')
    )
    expect(
      interactionPrompt({
        kind: 'pickup',
        pickup: { x: 0, z: 0, kind: 'joints', count: 2, taken: false },
      })
    ).toBe(
      copy('prompts.take', {
        item: copy('prompts.pickup_count', {
          item: copy('items.joints.label'),
          count: 2,
        }),
      })
    )
    expect(interactionPrompt({ kind: 'buy', ...shelf })).toBe(
      copy('prompts.buy', {
        item: copy('items.marlboro.label'),
        price: '$5.49',
      })
    )
    expect(
      interactionPrompt({ kind: 'buy', ...shelf, affordable: false })
    ).toBe(
      copy('prompts.buy_short', {
        item: copy('items.marlboro.label'),
        price: '$5.49',
      })
    )
    expect(interactionPrompt({ kind: 'collect', status: 'ready' })).toBe(
      copy('prompts.berry_ready')
    )
    expect(interactionPrompt({ kind: 'collect', status: 'picked' })).toBe(
      copy('prompts.berry_picked')
    )
    expect(interactionPrompt({ kind: 'collect', status: 'offline' })).toBe(
      copy('prompts.berry_offline')
    )
  })

  it('labels a cabbage without a count', () => {
    expect(pickupLabel({ kind: 'cabbage', count: 1 })).toBe(
      copy('prompts.cabbage')
    )
  })
})
