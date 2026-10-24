import { describe, expect, it } from 'vitest'
import { CONFIG } from '../../src/config.ts'
import { copy } from '../../src/copy.ts'
import {
  dailyStatus,
  interactionKey,
  interactionPrompt,
  itemLabel,
  pickupLabel,
  resolveInteraction,
  sightAngle,
  SIGHTS,
} from '../../src/interactions.ts'
import type {
  DailyStatus,
  InteractionInput,
  PickupSpot,
  ShelfSpot,
  View,
} from '../../src/interactions.ts'
import type { Vec3 } from '../../src/interfaces.ts'
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

  it('offers a pickup in a walled room only from inside it', () => {
    const room = [
      { x: 249, z: 249 },
      { x: 251, z: 249 },
      { x: 251, z: 251 },
      { x: 249, z: 251 },
    ]
    const office: PickupSpot = {
      x: 250.5,
      z: 250,
      kind: 'wild-turkey',
      count: 1,
      taken: false,
      within: room,
    }
    expect(resolveInteraction(input({ pickups: [office] }))).toEqual({
      kind: 'pickup',
      pickup: office,
    })
    expect(
      resolveInteraction(
        input({ player: { x: 252, z: 250 }, pickups: [office] })
      )
    ).toBeNull()
  })

  it('never offers a pickup behind a wall, however near', () => {
    const behind: PickupSpot = {
      x: 251,
      z: 250,
      kind: 'wild-turkey',
      count: 1,
      taken: false,
    }
    const walled = (_: unknown, to: { x: number }) => to.x > 250.5
    expect(resolveInteraction(input({ pickups: [behind], walled }))).toBeNull()
    const locked = { x: 251, z: 250 }
    expect(
      resolveInteraction(input({ locked, pickups: [behind], walled }))
    ).toEqual({ kind: 'locked' })
    const before: PickupSpot = { ...behind, x: 249 }
    expect(
      resolveInteraction(input({ pickups: [behind, before], walled }))
    ).toEqual({ kind: 'pickup', pickup: before })
  })

  it('offers only a pickup in view, the one nearest the middle of it', () => {
    const at = (x: number, z: number): PickupSpot => ({
      x,
      z,
      kind: 'wild-turkey',
      count: 1,
      taken: false,
    })
    // Looking along -z from the eye over (250, 250), down a little.
    const dir: Vec3 = [
      0,
      -0.5 / Math.hypot(0.5, 1.5),
      -1.5 / Math.hypot(0.5, 1.5),
    ]
    const view = (feet = 0): View<PickupSpot> => ({
      eye: [250, feet + 1.6, 250],
      dir,
      feet,
      groundAt: () => feet,
      heightOf: () => 0.1,
    })
    const ahead = at(250, 248.5)
    const behind = at(250, 250.5)
    const beside = at(251.5, 249.6)
    // The nearest is behind: out of view, it is never offered.
    expect(
      resolveInteraction(
        input({ pickups: [behind, beside, ahead], view: view() })
      )
    ).toEqual({ kind: 'pickup', pickup: ahead })
    expect(
      resolveInteraction(input({ pickups: [behind, beside], view: view() }))
    ).toBeNull()
    // Without a view, the nearest answers as before.
    expect(resolveInteraction(input({ pickups: [behind, ahead] }))).toEqual({
      kind: 'pickup',
      pickup: behind,
    })
    // A floor away, never.
    expect(
      resolveInteraction(input({ pickups: [ahead], view: view(-10) }))
    ).toBeNull()
  })

  it('sees a column anywhere up it, wider for a wide thing, never a floor away', () => {
    const level = { eye: [0, 1.6, 0] as Vec3, dir: [0, 0, -1] as Vec3, feet: 0 }
    const ahead = { x: 0, z: -1.5 }
    // Looking level at a person's chest: on them.
    expect(sightAngle(level, ahead, 0, SIGHTS.person)).toBe(0)
    // A thing at the feet, looked at level: off the look.
    expect(sightAngle(level, ahead, 0, SIGHTS.thing)).toBeGreaterThan(
      CONFIG.player.pickupCone
    )
    // Behind, never.
    expect(
      sightAngle(level, { x: 0, z: 1.5 }, 0, SIGHTS.person)
    ).toBeGreaterThan(CONFIG.player.pickupCone)
    // A floor up, never.
    expect(sightAngle(level, ahead, 4, SIGHTS.person)).toBe(Infinity)
    // To the side: a person is off the look where the truck is not.
    const side = { x: 1.6, z: -1.5 }
    expect(sightAngle(level, side, 0, SIGHTS.person)).toBeGreaterThan(
      CONFIG.player.pickupCone
    )
    expect(sightAngle(level, side, 0, SIGHTS.truck)).toBeLessThan(
      CONFIG.player.pickupCone
    )
  })

  it('offers no one and nothing out of view or behind a wall', () => {
    const player = { x: 250, z: 250 }
    // Looking along -x, level.
    const view: View<PickupSpot> = {
      eye: [250, 1.6, 250],
      dir: [-1, 0, 0],
      feet: 0,
      groundAt: () => 0,
      heightOf: () => 0.1,
    }
    const marx: NpcSpot = { id: 'marx', x: 249, z: 250 }
    const behindMarx: NpcSpot = { id: 'marx', x: 251, z: 250 }
    expect(resolveInteraction(input({ player, npcs: [marx], view }))).toEqual({
      kind: 'speak',
      npc: 'marx',
    })
    expect(
      resolveInteraction(input({ player, npcs: [behindMarx], view }))
    ).toBeNull()
    const walled = () => true
    expect(
      resolveInteraction(input({ player, npcs: [marx], view, walled }))
    ).toBeNull()
    // The stand, the lockers and the bush the same way.
    const stand = { x: 251, z: 250 }
    expect(resolveInteraction(input({ player, stand, view }))).toBeNull()
    expect(resolveInteraction(input({ player, stand }))).toEqual({
      kind: 'stand',
    })
    // The truck beside you only once you look at it.
    const truck = { ...besideTruck, at: { x: 252, z: 250 } }
    expect(resolveInteraction(input({ player, truck, view }))).toBeNull()
    expect(
      resolveInteraction(
        input({ player, truck: { ...truck, at: { x: 248, z: 250 } }, view })
      )
    ).toEqual({ kind: 'board' })
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

  it("opens Moab's trade window at whichever station he stands", () => {
    const atFar = { player: { x: moabs[1].x + 1, z: moabs[1].z } }
    expect(resolveInteraction(input({ ...atFar, npcs: moabs }))).toEqual({
      kind: 'trade',
      offer: null,
      station: 1,
    })
    const atSpawn = { player: { x: moabs[0].x, z: moabs[0].z + 1 } }
    expect(resolveInteraction(input({ ...atSpawn, npcs: moabs }))).toEqual({
      kind: 'trade',
      offer: null,
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

  it('carries what Moab offers, and only Moab trades', () => {
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
    // With no offer his window opens all the same.
    expect(
      resolveInteraction(input({ ...atFar, npcs: moabs, moabOffer: null }))
    ).toMatchObject({ kind: 'trade', offer: null })
  })
})

describe('resolveInteraction: another raider', () => {
  const raider = { name: 'Kid' }

  it('inspects the raider in front, before a pickup', () => {
    const near: PickupSpot = {
      kind: 'cabbage',
      count: 1,
      x: 250.5,
      z: 250,
      taken: false,
    }
    expect(resolveInteraction(input({ raider, pickups: [near] }))).toEqual({
      kind: 'inspect',
      name: 'Kid',
    })
  })

  it('leaves Gron, the truck and the shelves first', () => {
    expect(resolveInteraction(input({ raider, truck: besideTruck }))).toEqual({
      kind: 'board',
    })
    expect(resolveInteraction(input({ raider, shelf }))?.kind).toBe('buy')
  })

  it('says whom E inspects', () => {
    const inspect = { kind: 'inspect', name: 'Kid' } as const
    expect(interactionPrompt(inspect)).toBe(
      copy('prompts.inspect', { name: 'Kid' })
    )
    expect(interactionKey(inspect)).toBe('inspect:Kid')
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

  it('sits down at the laptop within reach, after a shelf in view', () => {
    const laptops = [{ x: 251, z: 250, station: 3 }]
    expect(resolveInteraction(input({ laptops }))).toEqual({
      kind: 'laptop',
      station: 3,
    })
    expect(
      resolveInteraction(input({ laptops, shelf: { ...shelf, station: 3 } }))
    ).toMatchObject({ kind: 'buy' })
    const away = [{ x: 250 + CONFIG.laptop.reach + 0.1, z: 250, station: 3 }]
    expect(resolveInteraction(input({ laptops: away }))).toBeNull()
    expect(interactionPrompt({ kind: 'laptop', station: 3 })).toBe(
      copy('prompts.laptop')
    )
  })

  it('catches the nearest slurm in reach in the jar', () => {
    const near = { x: 251, z: 250, station: 1, slot: 7, index: 2 }
    const nearer = { x: 250.5, z: 250, station: 1, slot: 7, index: 0 }
    const far = {
      x: 250 + CONFIG.fishing.jar.reach + 0.1,
      z: 250,
      station: 1,
      slot: 7,
      index: 1,
    }
    expect(resolveInteraction(input({ slurms: [near, nearer, far] }))).toEqual({
      kind: 'jar-slurm',
      station: 1,
      slot: 7,
      index: 0,
    })
    expect(resolveInteraction(input({ slurms: [far] }))).toBeNull()
    // Before Moab, standing in his reach over it.
    const moab = { id: 'moab' as const, x: 252, z: 250, station: 1 }
    expect(
      resolveInteraction(input({ slurms: [nearer], npcs: [moab] }))
    ).toMatchObject({ kind: 'jar-slurm' })
    expect(
      interactionPrompt({ kind: 'jar-slurm', station: 1, slot: 7, index: 0 })
    ).toBe(copy('prompts.jar_slurm'))
  })

  it('takes a slurm off to the side of a level look, but not behind', () => {
    const lookingNorth: View<PickupSpot> = {
      eye: [250, 1.6, 250],
      dir: [0, 0, -1],
      feet: 0,
      groundAt: () => 0,
      heightOf: () => 0.1,
    }
    const aside = { x: 252, z: 247.5, station: 1, slot: 7, index: 0 }
    expect(
      resolveInteraction(input({ slurms: [aside], view: lookingNorth }))
    ).toMatchObject({ kind: 'jar-slurm', index: 0 })
    const behind = { x: 250, z: 252, station: 1, slot: 7, index: 1 }
    expect(
      resolveInteraction(input({ slurms: [behind], view: lookingNorth }))
    ).toBeNull()
  })

  it('opens the tackle box on the firefly pond, within its reach', () => {
    expect(resolveInteraction(input({ tackle: { x: 252, z: 250 } }))).toEqual({
      kind: 'fish',
    })
    const far = { x: 250 + CONFIG.fishing.pond.reach + 0.1, z: 250 }
    expect(resolveInteraction(input({ tackle: far }))).toBeNull()
    expect(resolveInteraction(input({ tackle: null }))).toBeNull()
    expect(interactionPrompt({ kind: 'fish' })).toBe(copy('prompts.fish'))
  })

  it('opens the Recycling Center at the recycling machine, within its reach', () => {
    expect(resolveInteraction(input({ recycler: { x: 252, z: 250 } }))).toEqual(
      {
        kind: 'recycle',
      }
    )
    const far = { x: 250 + CONFIG.recycling.reach + 0.1, z: 250 }
    expect(resolveInteraction(input({ recycler: far }))).toBeNull()
    expect(resolveInteraction(input({ recycler: null }))).toBeNull()
    expect(interactionPrompt({ kind: 'recycle' })).toBe(copy('prompts.recycle'))
    // Only in sight: not with it behind the raider, nor with a wall between.
    const lookingNorth: View<PickupSpot> = {
      eye: [250, 1.6, 250],
      dir: [0, 0, -1],
      feet: 0,
      groundAt: () => 0,
      heightOf: () => 0.1,
    }
    const ahead = { x: 250, z: 248 }
    expect(
      resolveInteraction(input({ recycler: ahead, view: lookingNorth }))
    ).toEqual({ kind: 'recycle' })
    expect(
      resolveInteraction(
        input({ recycler: { x: 250, z: 252 }, view: lookingNorth })
      )
    ).toBeNull()
    expect(
      resolveInteraction(
        input({ recycler: ahead, view: lookingNorth, walled: () => true })
      )
    ).toBeNull()
    expect(itemLabel({ kind: 'recycle' })).toBeNull()
  })

  it('opens your Cabbage Stand within its reach', () => {
    expect(resolveInteraction(input({ stand: { x: 251, z: 250 } }))).toEqual({
      kind: 'stand',
    })
    const far = { x: 250 + CONFIG.stand.reach + 0.1, z: 250 }
    expect(resolveInteraction(input({ stand: far }))).toBeNull()
    expect(resolveInteraction(input({ stand: null }))).toBeNull()
    expect(interactionPrompt({ kind: 'stand' })).toBe(copy('prompts.stand'))
    expect(itemLabel({ kind: 'stand' })).toBeNull()
  })

  it('deals with the squatter within his reach', () => {
    const dealer = { x: 251, z: 250 }
    expect(resolveInteraction(input({ dealer }))).toEqual({ kind: 'deal' })
    const far = { x: 250 + CONFIG.dealer.reach + 0.1, z: 250 }
    expect(resolveInteraction(input({ dealer: far }))).toBeNull()
    expect(interactionPrompt({ kind: 'deal' })).toBeNull()
  })

  it('rattles a locked door, but takes up a pickup lying by it first', () => {
    const locked = { x: 251, z: 250 }
    expect(resolveInteraction(input({ locked }))).toEqual({ kind: 'locked' })
    expect(interactionPrompt({ kind: 'locked' })).toBe(copy('prompts.locked'))
    const far = { x: 250 + CONFIG.stripMall.doorReach + 0.1, z: 250 }
    expect(resolveInteraction(input({ locked: far }))).toBeNull()
    const pickup = {
      x: 250.5,
      z: 250,
      kind: 'pbr' as const,
      count: 1,
      taken: false,
    }
    expect(resolveInteraction(input({ locked, pickups: [pickup] }))).toEqual({
      kind: 'pickup',
      pickup,
    })
  })

  it('lays the rose at the heart of the maze within reach of it', () => {
    const heart = { x: 251, z: 250 }
    expect(resolveInteraction(input({ heart }))).toEqual({ kind: 'lay' })
    const far = { x: 250 + CONFIG.quests.layReach + 0.1, z: 250 }
    expect(resolveInteraction(input({ heart: far }))).toBeNull()
    expect(interactionPrompt({ kind: 'lay' })).toBe(copy('prompts.lay'))
  })

  it('names the quarters', () => {
    expect(pickupLabel({ kind: 'quarters', count: 8 })).toBe(
      copy('labels.quarters', { count: 8 })
    )
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

  it('leaves the people you talk to to the glow, with no prompt', () => {
    expect(interactionPrompt({ kind: 'talk' })).toBeNull()
    expect(interactionPrompt({ kind: 'speak', npc: 'carlsten' })).toBeNull()
    expect(
      interactionPrompt({ kind: 'speak', npc: 'moab', station: 0 })
    ).toBeNull()
    // The traders too: the glow says E opens their window.
    expect(interactionPrompt({ kind: 'deal' })).toBeNull()
    expect(
      interactionPrompt({ kind: 'trade', offer: 'flaming-halo', station: 0 })
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

describe('interactionKey', () => {
  it('reads the same while the prompt and the label would', () => {
    const pickup = {
      x: 0,
      z: 0,
      kind: 'joints' as const,
      count: 2,
      taken: false,
    }
    expect(interactionKey({ kind: 'pickup', pickup })).toBe(
      interactionKey({ kind: 'pickup', pickup: { ...pickup, x: 5 } })
    )
    expect(interactionKey({ kind: 'pickup', pickup })).not.toBe(
      interactionKey({ kind: 'pickup', pickup: { ...pickup, count: 1 } })
    )
    expect(interactionKey({ kind: 'buy', ...shelf })).not.toBe(
      interactionKey({ kind: 'buy', ...shelf, affordable: !shelf.affordable })
    )
    expect(
      interactionKey({ kind: 'collect', bush: 0, status: 'ready' })
    ).not.toBe(interactionKey({ kind: 'collect', bush: 0, status: 'picked' }))
    expect(interactionKey({ kind: 'loot', corpse: 1 })).not.toBe(
      interactionKey({ kind: 'loot', corpse: 2 })
    )
    expect(interactionKey({ kind: 'speak', npc: 'moab', station: 1 })).not.toBe(
      interactionKey({ kind: 'speak', npc: 'moab', station: 2 })
    )
    expect(interactionKey({ kind: 'hopOut' })).toBe('hopOut')
    expect(interactionKey({ kind: 'stand' })).not.toBe(
      interactionKey({ kind: 'locker', station: 0 })
    )
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

describe('the lookout tower', () => {
  const foot = { x: 250, z: 250 }
  const top = { x: 252.5, z: 250 }
  const at = (player: { x: number; z: number }, on: boolean) =>
    resolveInteraction(input({ player, lookout: { foot, top, on } }))

  it('climbs up at the ladder’s foot, and only from below', () => {
    expect(at(foot, false)).toEqual({ kind: 'climbTower' })
    expect(at(top, false)).toBeNull()
    expect(
      at({ x: foot.x - CONFIG.maze.lookout.climbReach - 0.1, z: 250 }, false)
    ).toBeNull()
  })

  it('climbs down at the ladder’s top, and only from the deck', () => {
    expect(at(top, true)).toEqual({ kind: 'leaveTower' })
    expect(at(foot, true)).toBeNull()
  })

  it('says each climb at the bottom of the view', () => {
    expect(interactionPrompt({ kind: 'climbTower' })).toBe(
      copy('prompts.climb_tower')
    )
    expect(interactionPrompt({ kind: 'leaveTower' })).toBe(
      copy('prompts.leave_tower')
    )
  })
})

describe('hallucinations', () => {
  const me = { x: 250, z: 250 }
  const person = { id: 3, x: 251, z: 250, shape: 'raider' as const }
  const thing = {
    id: 4,
    x: 250,
    z: 252,
    shape: 'thing' as const,
    item: 'lsd',
  }

  it('answers E at a person within reach, ahead of whatever stands behind it', () => {
    expect(
      resolveInteraction(input({ player: me, hallucinations: [person], shelf }))
    ).toEqual({ kind: 'hallucination', id: 3, shape: 'raider' })
  })

  it('answers at a thing within its reach, the nearer first, never from the bed', () => {
    expect(
      resolveInteraction(input({ player: me, hallucinations: [thing] }))
    ).toEqual({ kind: 'hallucination', id: 4, shape: 'thing', item: 'lsd' })
    expect(
      resolveInteraction(input({ player: me, hallucinations: [thing, person] }))
    ).toMatchObject({ id: 3 })
    expect(
      resolveInteraction(
        input({
          player: me,
          hallucinations: [
            { ...person, x: me.x + CONFIG.hallucinations.reach.person + 0.1 },
          ],
        })
      )
    ).toBeNull()
    expect(
      resolveInteraction(
        input({ riding: true, player: me, hallucinations: [person] })
      )
    ).toEqual({ kind: 'hopOut' })
  })

  it('labels a thing as the real one, and leaves a person to the glow', () => {
    const asThing = {
      kind: 'hallucination' as const,
      id: 4,
      shape: 'thing' as const,
      item: 'lsd',
    }
    const asPerson = {
      kind: 'hallucination' as const,
      id: 3,
      shape: 'npc' as const,
    }
    expect(itemLabel(asThing)).toEqual({
      text: pickupLabel({ kind: 'lsd', count: 1 }),
      dim: false,
    })
    expect(itemLabel(asPerson)).toBeNull()
    expect(interactionPrompt(asThing)).toBeNull()
    expect(interactionPrompt(asPerson)).toBeNull()
    expect(interactionKey(asThing)).toBe('hallucination:4')
  })
})
