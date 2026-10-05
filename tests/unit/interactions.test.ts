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
// A few strides from the bush, like CONFIG.gron.at from CONFIG.daily.bush.
const gron = { x: -5.6, z: -9 }
// Moab under each station's sign, station-local CONFIG.moab.at at yaw 0.
const moabs = [spawnStation, farStation].map((station) => ({
  x: station.x + CONFIG.moab.at.x,
  z: station.z + CONFIG.moab.at.z,
}))
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
    gron,
    moabs,
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
    // Gron stands off this way; leave him out of the bush's own reach.
    const outOfReach = {
      player: { x: bush.x + CONFIG.daily.reach + 0.1, z: bush.z },
      gron: null,
    }
    expect(resolveInteraction(input(outOfReach))).toBeNull()
    expect(
      resolveInteraction(input({ ...atBush, bush: null, gron: null }))
    ).toBeNull()
  })

  it('talks to Gron within reach, whatever the raid is doing', () => {
    const atGron = { player: { x: gron.x + 1, z: gron.z } }
    expect(resolveInteraction(input(atGron))).toEqual({ kind: 'talk' })
    expect(
      resolveInteraction(input({ ...atGron, raid: createRaid(0) }))
    ).toEqual({ kind: 'talk' })
    // Offline too: he changes your character without the valley.
    expect(resolveInteraction(input({ ...atGron, daily: 'offline' }))).toEqual({
      kind: 'talk',
    })
    const outOfReach = {
      player: { x: gron.x + CONFIG.gron.reach + 0.1, z: gron.z },
    }
    expect(resolveInteraction(input(outOfReach))).toBeNull()
    expect(resolveInteraction(input({ ...atGron, gron: null }))).toBeNull()
  })

  it('answers with the nearer of Gron and the bush when both are in reach', () => {
    // Between them, nearer the bush.
    const nearBush = { player: { x: -7.0, z: -8.4 } }
    expect(resolveInteraction(input(nearBush))).toEqual({
      kind: 'collect',
      status: 'ready',
    })
    // Between them, nearer Gron.
    const nearGron = { player: { x: -6.4, z: -8.8 } }
    expect(resolveInteraction(input(nearGron))).toEqual({ kind: 'talk' })
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

  it('talks to Moab at whichever station he stands, whatever the raid is doing', () => {
    const atFar = { player: { x: moabs[1].x + 1, z: moabs[1].z } }
    expect(resolveInteraction(input(atFar))).toEqual({
      kind: 'moab',
      station: 1,
    })
    const atSpawn = { player: { x: moabs[0].x, z: moabs[0].z + 1 } }
    expect(
      resolveInteraction(input({ ...atSpawn, raid: createRaid(0) }))
    ).toEqual({ kind: 'moab', station: 0 })
    // Riding past him, E still hops out.
    const riding = advance(createRaid(0), EVENTS.BOARD_TRUCK, 1)
    expect(resolveInteraction(input({ ...atFar, raid: riding }))).toEqual({
      kind: 'hopOut',
    })
    expect(resolveInteraction(input({ ...atFar, moabs: [] }))).toEqual({
      kind: 'extractFuel',
      name: farStation.name,
    })
  })

  it('puts Moab ahead of the station extract he stands inside', () => {
    const atMoab = { player: { x: moabs[1].x - 1, z: moabs[1].z } }
    expect(
      Math.hypot(atMoab.player.x - farStation.x, atMoab.player.z - farStation.z)
    ).toBeLessThan(CONFIG.extract.fuelRadius)
    expect(resolveInteraction(input(atMoab))).toEqual({
      kind: 'moab',
      station: 1,
    })
    const pastReach = {
      player: { x: moabs[1].x - CONFIG.moab.reach - 0.1, z: moabs[1].z },
    }
    expect(resolveInteraction(input(pastReach))).toEqual({
      kind: 'extractFuel',
      name: farStation.name,
    })
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
    expect(interactionPrompt({ kind: 'talk' })).toBe(copy('prompts.talk'))
    expect(interactionPrompt({ kind: 'moab', station: 0 })).toBe(
      copy('prompts.moab')
    )
  })

  it('labels a cabbage without a count', () => {
    expect(pickupLabel({ kind: 'cabbage', count: 1 })).toBe(
      copy('prompts.cabbage')
    )
  })
})
