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
import type {
  DailyStatus,
  InteractionInput,
  PickupSpot,
  ShelfSpot,
} from '../../src/interactions.ts'
import type { NpcSpot } from '../../src/npcs.ts'

const spawnStation = { x: 0, z: 0 }
const farStation = { x: 500, z: 0 }
const bush = { x: -8, z: -8 }
// The spawn Citgo's bush, as it stands today.
const bushesAt = (status: DailyStatus) => [{ id: 0, ...bush, status }]
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
// The truck parked beside the player, theirs to climb into.
const besideTruck = {
  distance: CONFIG.truck.boardRange - 0.1,
  moving: false,
  boardable: true,
}

// Defaults put the player in open country on foot: no truck, bush, or
// pickup in reach, with the valley answering.
function input(
  over: Partial<InteractionInput<PickupSpot>> = {}
): InteractionInput<PickupSpot> {
  return {
    riding: false,
    player: { x: 250, z: 250 },
    truck: { distance: 1000, moving: false, boardable: true },
    pickups: [],
    shelf: null,
    bushes: bushesAt('ready'),
    gron,
    npcs: [],
    ...over,
  }
}

describe('resolveInteraction', () => {
  it('offers nothing in open country', () => {
    expect(resolveInteraction(input())).toBeNull()
  })

  it('hops out while riding, wherever the truck is', () => {
    expect(resolveInteraction(input({ riding: true }))).toEqual({
      kind: 'hopOut',
    })
    expect(
      resolveInteraction(input({ riding: true, truck: besideTruck }))
    ).toEqual({ kind: 'hopOut' })
  })

  it('climbs in only beside a truck standing still that is ours to board', () => {
    expect(resolveInteraction(input({ truck: besideTruck }))).toEqual({
      kind: 'board',
    })
    const far = { ...besideTruck, distance: CONFIG.truck.boardRange + 0.1 }
    expect(resolveInteraction(input({ truck: far }))).toBeNull()
    const rolling = { ...besideTruck, moving: true }
    expect(resolveInteraction(input({ truck: rolling }))).toBeNull()
    const notOurs = { ...besideTruck, boardable: false }
    expect(resolveInteraction(input({ truck: notOurs }))).toBeNull()
  })

  it('buys off the shelf in view', () => {
    expect(resolveInteraction(input({ shelf }))).toEqual({
      kind: 'buy',
      ...shelf,
    })
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

  it('offers the bush within reach, as the valley has it today', () => {
    const atBush = { player: { x: bush.x + 1, z: bush.z } }
    expect(resolveInteraction(input(atBush))).toEqual({
      kind: 'collect',
      bush: 0,
      status: 'ready',
    })
    expect(
      resolveInteraction(input({ ...atBush, bushes: bushesAt('picked') }))
    ).toEqual({
      kind: 'collect',
      bush: 0,
      status: 'picked',
    })
    expect(
      resolveInteraction(input({ ...atBush, bushes: bushesAt('offline') }))
    ).toEqual({
      kind: 'collect',
      bush: 0,
      status: 'offline',
    })
    // Gron stands off this way; leave him out of the bush's own reach.
    const outOfReach = {
      player: { x: bush.x + CONFIG.daily.reach + 0.1, z: bush.z },
      gron: null,
    }
    expect(resolveInteraction(input(outOfReach))).toBeNull()
    expect(
      resolveInteraction(input({ ...atBush, bushes: [], gron: null }))
    ).toBeNull()
  })

  it('offers the nearest of several bushes, by its own id and day', () => {
    const ring = [
      { id: 1, x: 100, z: 100, status: 'picked' as const },
      { id: 2, x: 103, z: 100, status: 'ready' as const },
    ]
    const bushes = [...bushesAt('ready'), ...ring]
    expect(
      resolveInteraction(input({ bushes, player: { x: 102.4, z: 100 } }))
    ).toEqual({ kind: 'collect', bush: 2, status: 'ready' })
    expect(
      resolveInteraction(input({ bushes, player: { x: 100.6, z: 100 } }))
    ).toEqual({ kind: 'collect', bush: 1, status: 'picked' })
  })

  it('talks to Gron within reach', () => {
    const atGron = { player: { x: gron.x + 1, z: gron.z } }
    expect(resolveInteraction(input(atGron))).toEqual({ kind: 'talk' })
    // Offline too: he changes your character without the valley.
    expect(
      resolveInteraction(input({ ...atGron, bushes: bushesAt('offline') }))
    ).toEqual({
      kind: 'talk',
    })
    const outOfReach = {
      player: { x: gron.x + CONFIG.gron.reach + 0.1, z: gron.z },
    }
    expect(resolveInteraction(input(outOfReach))).toBeNull()
    expect(resolveInteraction(input({ ...atGron, gron: null }))).toBeNull()
  })

  it('speaks to the nearest NPC in reach, ahead of boarding', () => {
    const player = { x: 250, z: 250 }
    const marx: NpcSpot = { id: 'marx', x: 251, z: 250 }
    expect(resolveInteraction(input({ truck: besideTruck }))).toEqual({
      kind: 'board',
    })
    expect(
      resolveInteraction(input({ truck: besideTruck, player, npcs: [marx] }))
    ).toEqual({ kind: 'speak', npc: 'marx' })
    // A step past his reach, E boards again.
    const away = { x: 251 + CONFIG.npcs.reach + 0.1, z: 250 }
    expect(
      resolveInteraction(
        input({ truck: besideTruck, player: away, npcs: [marx] })
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
    expect(resolveInteraction(input({ shelf, npcs: [carlsten] }))).toEqual({
      kind: 'buy',
      ...shelf,
    })
    expect(resolveInteraction(input({ npcs: [carlsten] }))).toEqual({
      kind: 'speak',
      npc: 'carlsten',
    })
  })

  it('never speaks while riding', () => {
    const npcs: NpcSpot[] = [{ id: 'marx', x: 250, z: 250 }]
    expect(resolveInteraction(input({ riding: true, npcs }))).toEqual({
      kind: 'hopOut',
    })
  })

  it('answers with the nearer of Gron and the bush when both are in reach', () => {
    // Between them, nearer the bush.
    const nearBush = { player: { x: -7.0, z: -8.4 } }
    expect(resolveInteraction(input(nearBush))).toEqual({
      kind: 'collect',
      bush: 0,
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
      bush: 0,
      status: 'ready',
    })
    expect(
      resolveInteraction(input({ ...atBush, truck: besideTruck }))
    ).toEqual({ kind: 'board' })
  })

  it('talks to Moab at whichever station he stands', () => {
    const atFar = { player: { x: moabs[1].x + 1, z: moabs[1].z } }
    expect(resolveInteraction(input({ ...atFar, npcs: moabs }))).toEqual({
      kind: 'speak',
      npc: 'moab',
      station: 1,
    })
    const atSpawn = { player: { x: moabs[0].x, z: moabs[0].z + 1 } }
    expect(resolveInteraction(input({ ...atSpawn, npcs: moabs }))).toEqual({
      kind: 'speak',
      npc: 'moab',
      station: 0,
    })
    // Riding past him, E still hops out.
    expect(
      resolveInteraction(input({ ...atFar, npcs: moabs, riding: true }))
    ).toEqual({
      kind: 'hopOut',
    })
    const pastReach = {
      player: { x: moabs[1].x - CONFIG.moab.reach - 0.1, z: moabs[1].z },
    }
    expect(resolveInteraction(input({ ...pastReach, npcs: moabs }))).toBeNull()
  })

  it('trades with Moab when he has an offer, and only with Moab', () => {
    const atFar = { player: { x: moabs[1].x + 1, z: moabs[1].z } }
    const offer = { npcs: moabs, moabOffer: 'flaming-halo' as const }
    expect(resolveInteraction(input({ ...atFar, ...offer }))).toEqual({
      kind: 'trade',
      offer: 'flaming-halo',
      station: 1,
    })
    // Gron's and Carlsten's ears are not Moab's.
    const clerk: NpcSpot = { id: 'carlsten', x: 300, z: 300 }
    expect(
      resolveInteraction(
        input({
          player: { x: 300.5, z: 300 },
          npcs: [clerk],
          moabOffer: 'flaming-halo',
        })
      )
    ).toEqual({ kind: 'speak', npc: 'carlsten' })
    // With no offer he says his line.
    expect(
      resolveInteraction(input({ ...atFar, npcs: moabs, moabOffer: null }))
    ).toMatchObject({ kind: 'speak', npc: 'moab' })
  })
})

describe('resolveInteraction: bodies and lockers', () => {
  const corpse = {
    id: 4,
    x: 250.5,
    z: 250,
    yaw: 0,
    name: 'Raider',
    outfit: 'coleman' as const,
  }

  it('takes your things back off your nearest body within reach', () => {
    expect(resolveInteraction(input({ corpses: [corpse] }))).toEqual({
      kind: 'loot',
      corpse: 4,
    })
    const far = { ...corpse, x: 250 + CONFIG.corpses.reach + 0.1 }
    expect(resolveInteraction(input({ corpses: [far] }))).toBeNull()
    // A pickup lying on the body waits until the body is looted.
    const pickup: PickupSpot = {
      kind: 'joints',
      count: 1,
      taken: false,
      x: 250,
      z: 250,
    }
    expect(
      resolveInteraction(input({ corpses: [corpse], pickups: [pickup] }))
    ).toMatchObject({ kind: 'loot' })
  })

  it('opens the lockers within reach, after a shelf in view', () => {
    const lockers = [{ x: 251, z: 250, station: 2 }]
    expect(resolveInteraction(input({ lockers }))).toEqual({
      kind: 'locker',
      station: 2,
    })
    expect(
      resolveInteraction(input({ lockers, shelf: { ...shelf, station: 2 } }))
    ).toMatchObject({ kind: 'buy' })
    const away = [{ x: 250 + CONFIG.stash.reach + 0.1, z: 250, station: 2 }]
    expect(resolveInteraction(input({ lockers: away }))).toBeNull()
  })

  it('says what E does at each', () => {
    expect(interactionPrompt({ kind: 'loot', corpse: 0 })).toBe(
      copy('prompts.loot')
    )
    expect(interactionPrompt({ kind: 'locker', station: 0 })).toBe(
      copy('prompts.locker')
    )
    expect(itemLabel({ kind: 'loot', corpse: 0 })).toBeNull()
  })
})

describe('interactionPrompt', () => {
  it('names each action', () => {
    expect(interactionPrompt({ kind: 'hopOut' })).toBe(copy('prompts.hop_out'))
    expect(interactionPrompt({ kind: 'board' })).toBe(copy('prompts.board'))
  })

  it("says Moab's offer: what he wants for what", () => {
    expect(
      interactionPrompt({ kind: 'trade', offer: 'flaming-halo', station: 0 })
    ).toBe(
      copy('prompts.trade', {
        count: 1,
        price: copy('items.gold-bullion.label'),
        cosmetic: copy('cosmetics.flaming-halo.label'),
      })
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
    expect(
      interactionPrompt({ kind: 'collect', bush: 0, status: 'ready' })
    ).toBeNull()
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
    expect(itemLabel({ kind: 'collect', bush: 0, status: 'ready' })).toEqual({
      text: copy('labels.berries'),
      dim: false,
    })
    expect(itemLabel({ kind: 'collect', bush: 0, status: 'picked' })).toEqual({
      text: copy('labels.berry_picked'),
      dim: true,
    })
    expect(itemLabel({ kind: 'collect', bush: 0, status: 'offline' })).toEqual({
      text: copy('labels.berry_offline'),
      dim: true,
    })
  })

  it('labels nothing that is not an item', () => {
    expect(itemLabel({ kind: 'board' })).toBeNull()
    expect(itemLabel({ kind: 'talk' })).toBeNull()
  })

  it('falls back to the id for a kind the table does not know', () => {
    // A stale or foreign id, as one might arrive from outside the table.
    const kind = 'mystery' as unknown as PickupSpot['kind']
    expect(pickupLabel({ kind, count: 3 })).toBe(
      copy('labels.pickup_count', { item: 'mystery', count: 3 })
    )
    expect(itemLabel({ kind: 'buy', ...shelf, item: 'mystery' })).toEqual({
      text: copy('labels.price', { item: 'mystery', price: '$5.49' }),
      dim: false,
    })
  })

  it('labels nothing for a bush status it does not know', () => {
    const status = 'withered' as unknown as DailyStatus
    expect(itemLabel({ kind: 'collect', bush: 0, status })).toBeNull()
  })

  it('labels a cabbage without a count', () => {
    expect(pickupLabel({ kind: 'cabbage', count: 1 })).toBe(
      copy('labels.cabbage')
    )
  })

  it('labels dimes by how many', () => {
    expect(pickupLabel({ kind: 'dimes', count: 7 })).toBe(
      copy('labels.dimes', { count: 7 })
    )
  })

  it('labels a gold bar by its name alone, a stack of them with a count', () => {
    const label = copy('items.gold-bullion.label')
    expect(pickupLabel({ kind: 'gold-bullion', count: 1 })).toBe(label)
    expect(pickupLabel({ kind: 'gold-bullion', count: 3 })).toBe(
      copy('labels.pickup_count', { item: label, count: 3 })
    )
  })
})

describe('dailyStatus', () => {
  const daily = { collected: [0, 3], resetsAt: 1000 }

  it('is offline with no valley to ask', () => {
    expect(dailyStatus(null, 0, 0)).toBe('offline')
  })

  it("is picked until midnight Central, by the valley's clock", () => {
    expect(dailyStatus(daily, 3, 999)).toBe('picked')
    expect(dailyStatus(daily, 3, 1000)).toBe('ready')
  })

  it('is ready while the berry is on that bush', () => {
    expect(dailyStatus(daily, 1, 0)).toBe('ready')
    expect(dailyStatus({ ...daily, collected: [] }, 0, 0)).toBe('ready')
  })
})
