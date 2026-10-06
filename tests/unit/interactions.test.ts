import { describe, expect, it } from 'vitest'
import { CONFIG } from '../../src/config.ts'
import { copy } from '../../src/copy.ts'
import {
  dailyStatus,
  interactionPrompt,
  itemLabel,
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
import type { NpcSpot } from '../../src/npcs.ts'

const spawnStation: StationSpot = { x: 0, z: 0, name: 'Spawn Citgo' }
const farStation: StationSpot = { x: 500, z: 0, name: 'Far Citgo' }
const keep = { x: -500, z: 0 }
const bush = { x: -8, z: -8 }
// A few strides from the bush, like CONFIG.gron.at from CONFIG.daily.bush.
const gron = { x: -5.6, z: -9 }
// Moab under each station's sign, station-local CONFIG.moab.at at yaw 0.
const moabs: NpcSpot[] = [spawnStation, farStation].map((station, i) => ({
  id: 'moab',
  x: station.x + CONFIG.moab.at.x,
  z: station.z + CONFIG.moab.at.z,
  station: i,
}))
const shelf: ShelfSpot = {
  item: 'marlboro',
  station: 1,
  unit: 0,
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

// Defaults put the player in open country: no truck, extract, bush,
// or pickup in reach, with the valley answering.
function input(
  over: Partial<InteractionInput<PickupSpot>> = {}
): InteractionInput<PickupSpot> {
  return {
    raid: onFoot(),
    ended: false,
    player: { x: 250, z: 250 },
    truck: { distance: 1000, moving: false },
    keep,
    stations: [spawnStation, farStation],
    spawnStation,
    pickups: [],
    shelf: null,
    insideStore: false,
    bush,
    daily: 'ready',
    gron,
    npcs: [],
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

  it('speaks to the nearest NPC in reach, ahead of boarding', () => {
    const lobby = createRaid(0)
    const player = { x: 250, z: 250 }
    const marx: NpcSpot = { id: 'marx', x: 251, z: 250 }
    const truck = { distance: 1, moving: false }
    expect(resolveInteraction(input({ raid: lobby, truck }))).toEqual({
      kind: 'board',
    })
    expect(
      resolveInteraction(input({ raid: lobby, truck, player, npcs: [marx] }))
    ).toEqual({ kind: 'speak', npc: 'marx' })
    // A step past his reach, E boards again.
    const away = { x: 251 + CONFIG.npcs.reach + 0.1, z: 250 }
    expect(
      resolveInteraction(
        input({ raid: lobby, truck, player: away, npcs: [marx] })
      )
    ).toEqual({ kind: 'board' })
    const carlsten: NpcSpot = { id: 'carlsten', x: 250, z: 250.5 }
    expect(resolveInteraction(input({ npcs: [marx, carlsten] }))).toEqual({
      kind: 'speak',
      npc: 'carlsten',
    })
  })

  it('sells the shelf in view ahead of the clerk', () => {
    const carlsten: NpcSpot = { id: 'carlsten', x: 251, z: 250 }
    expect(
      resolveInteraction(input({ shelf, insideStore: true, npcs: [carlsten] }))
    ).toEqual({ kind: 'buy', ...shelf })
    expect(
      resolveInteraction(input({ insideStore: true, npcs: [carlsten] }))
    ).toEqual({ kind: 'speak', npc: 'carlsten' })
  })

  it('never speaks while riding or once the raid is over', () => {
    const npcs: NpcSpot[] = [{ id: 'marx', x: 250, z: 250 }]
    const riding = advance(createRaid(0), EVENTS.BOARD_TRUCK, 1)
    expect(resolveInteraction(input({ raid: riding, npcs }))).toEqual({
      kind: 'hopOut',
    })
    expect(resolveInteraction(input({ ended: true, npcs }))).toBeNull()
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
    expect(resolveInteraction(input({ ...atFar, npcs: moabs }))).toEqual({
      kind: 'speak',
      npc: 'moab',
      station: 1,
    })
    const atSpawn = { player: { x: moabs[0].x, z: moabs[0].z + 1 } }
    expect(
      resolveInteraction(
        input({ ...atSpawn, npcs: moabs, raid: createRaid(0) })
      )
    ).toEqual({ kind: 'speak', npc: 'moab', station: 0 })
    // Riding past him, E still hops out.
    const riding = advance(createRaid(0), EVENTS.BOARD_TRUCK, 1)
    expect(
      resolveInteraction(input({ ...atFar, npcs: moabs, raid: riding }))
    ).toEqual({
      kind: 'hopOut',
    })
    expect(resolveInteraction(input(atFar))).toEqual({
      kind: 'extractFuel',
      name: farStation.name,
    })
  })

  it('puts Moab ahead of the station extract he stands inside', () => {
    const atMoab = { player: { x: moabs[1].x - 1, z: moabs[1].z } }
    expect(
      Math.hypot(atMoab.player.x - farStation.x, atMoab.player.z - farStation.z)
    ).toBeLessThan(CONFIG.extract.fuelRadius)
    expect(resolveInteraction(input({ ...atMoab, npcs: moabs }))).toEqual({
      kind: 'speak',
      npc: 'moab',
      station: 1,
    })
    const pastReach = {
      player: { x: moabs[1].x - CONFIG.moab.reach - 0.1, z: moabs[1].z },
    }
    expect(resolveInteraction(input({ ...pastReach, npcs: moabs }))).toEqual({
      kind: 'extractFuel',
      name: farStation.name,
    })
  })
})

describe('interactionPrompt', () => {
  it('names each action', () => {
    expect(interactionPrompt({ kind: 'hopOut' })).toBe(copy('prompts.hop_out'))
    expect(interactionPrompt({ kind: 'extractFuel', name: '' })).toBe(
      copy('prompts.extract_station')
    )
  })

  it('leaves the people you talk to to the glow, with no prompt', () => {
    expect(interactionPrompt({ kind: 'talk' })).toBeNull()
    expect(interactionPrompt({ kind: 'speak', npc: 'carlsten' })).toBeNull()
    expect(
      interactionPrompt({ kind: 'speak', npc: 'moab', station: 0 })
    ).toBeNull()
  })

  it('leaves items to their labels', () => {
    const pickup = {
      x: 0,
      z: 0,
      kind: 'joints' as const,
      count: 2,
      taken: false,
    }
    expect(interactionPrompt({ kind: 'pickup', pickup })).toBeNull()
    expect(interactionPrompt({ kind: 'buy', ...shelf })).toBeNull()
    expect(interactionPrompt({ kind: 'collect', status: 'ready' })).toBeNull()
  })
})

describe('itemLabel', () => {
  it('names a pickup, with its count', () => {
    const pickup = {
      x: 0,
      z: 0,
      kind: 'joints' as const,
      count: 2,
      taken: false,
    }
    expect(itemLabel({ kind: 'pickup', pickup })).toEqual({
      text: copy('labels.pickup_count', {
        item: copy('items.joints.label'),
        count: 2,
      }),
      dim: false,
    })
  })

  it('names a shelf unit with its price, dim when the cash falls short', () => {
    const text = copy('labels.price', {
      item: copy('items.marlboro.label'),
      price: '$5.49',
    })
    expect(itemLabel({ kind: 'buy', ...shelf })).toEqual({ text, dim: false })
    expect(itemLabel({ kind: 'buy', ...shelf, affordable: false })).toEqual({
      text,
      dim: true,
    })
  })

  it('names the bush by how it stands today', () => {
    expect(itemLabel({ kind: 'collect', status: 'ready' })).toEqual({
      text: copy('labels.berries'),
      dim: false,
    })
    expect(itemLabel({ kind: 'collect', status: 'picked' })).toEqual({
      text: copy('labels.berry_picked'),
      dim: true,
    })
    expect(itemLabel({ kind: 'collect', status: 'offline' })).toEqual({
      text: copy('labels.berry_offline'),
      dim: true,
    })
  })

  it('labels nothing that is not an item', () => {
    expect(itemLabel({ kind: 'board' })).toBeNull()
    expect(itemLabel({ kind: 'talk' })).toBeNull()
  })

  it('labels a cabbage without a count', () => {
    expect(pickupLabel({ kind: 'cabbage', count: 1 })).toBe(
      copy('labels.cabbage')
    )
  })
})

describe('dailyStatus', () => {
  const daily = { collected: true, resetsAt: 1000 }

  it('is offline with no valley to ask', () => {
    expect(dailyStatus(null, 0)).toBe('offline')
  })

  it("is picked until midnight Central, by the valley's clock", () => {
    expect(dailyStatus(daily, 999)).toBe('picked')
    expect(dailyStatus(daily, 1000)).toBe('ready')
  })

  it('is ready while the berry is on the bush', () => {
    expect(dailyStatus({ ...daily, collected: false }, 0)).toBe('ready')
  })
})
