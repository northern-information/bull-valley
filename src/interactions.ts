// Pure: what E would do right now, and the prompt that says so. main.ts
// resolves this once per frame and acts on it when E is pressed. No
// three.js, no DOM: tests/unit/interactions.test.ts runs it in Node.

import { CONFIG } from './config.ts'
import { copy } from './copy.ts'
import { itemById } from './items.ts'
import { KEEP } from './landmarks.ts'
import { STATES } from './raid.ts'
import { formatCash } from './store.ts'
import type { Raid, XZ } from './interfaces.ts'
import type { PickupKind } from './items.ts'

// A pickup as the resolver sees it.
export interface PickupSpot extends XZ {
  kind: PickupKind
  count: number
  taken: boolean
}

// A fuel station as the resolver sees it.
export interface StationSpot extends XZ {
  name: string
}

// A shelf facing the player is looking at, from store.ts facingInView.
export interface ShelfSpot {
  item: string
  // Index into the stations, and into the store stock.
  station: number
  // In cents.
  price: number
  affordable: boolean
}

// The berry bush as this player finds it: a berry waiting, today's already
// taken, or no valley to ask (the bush is the valley's; see daily.ts).
export type DailyStatus = 'ready' | 'picked' | 'offline'

export type Interaction<P extends PickupSpot = PickupSpot> =
  | { kind: 'hopOut' }
  | { kind: 'board' }
  | { kind: 'boardExtract' }
  | { kind: 'unload'; count: number }
  | { kind: 'extractFuel'; name: string }
  | { kind: 'extractKeep' }
  | { kind: 'pickup'; pickup: P }
  | ({ kind: 'buy' } & ShelfSpot)
  | { kind: 'collect'; status: DailyStatus }

export interface InteractionInput<P extends PickupSpot> {
  raid: Raid
  ended: boolean
  player: XZ
  truck: { distance: number; moving: boolean }
  stand: XZ | null
  keep: XZ | null
  // Every station; the spawn station is never an extract.
  stations: readonly StationSpot[]
  spawnStation: StationSpot
  pickups: readonly P[]
  // The facing in view inside a store, or null.
  shelf: ShelfSpot | null
  // Whether the player stands inside a store's walls: no station extract
  // from in there.
  insideStore: boolean
  // The berry bush at the spawn Citgo, or null, and how it stands for
  // this player today.
  bush: XZ | null
  daily: DailyStatus
}

function near(a: XZ, b: XZ, radius: number): boolean {
  return Math.hypot(a.x - b.x, a.z - b.z) < radius
}

// The first match wins, in this order: hop out while riding; board the
// waiting truck; buy off a shelf; board the called truck to end the raid;
// unload at the stand; extract at a station (never from inside its store)
// or the Keep; the berry bush; take the nearest pickup.
export function resolveInteraction<P extends PickupSpot>(
  input: InteractionInput<P>
): Interaction<P> | null {
  const { raid, ended, player } = input
  if (ended || raid.state === STATES.EXTRACTED) return null
  if (raid.state === STATES.RIDING) return { kind: 'hopOut' }

  const truckClose = input.truck.distance < CONFIG.truck.boardRange
  if (raid.state === STATES.LOADOUT && truckClose) return { kind: 'board' }
  if (input.shelf) return { kind: 'buy', ...input.shelf }
  if (raid.state === STATES.ON_FOOT) {
    if (raid.truckCalled && !input.truck.moving && truckClose) {
      return { kind: 'boardExtract' }
    }
    if (
      raid.carrying > 0 &&
      input.stand &&
      near(input.stand, player, CONFIG.cabbage.dropRadius)
    ) {
      return { kind: 'unload', count: raid.carrying }
    }
    for (const station of input.stations) {
      if (input.insideStore) break
      if (station === input.spawnStation) continue
      if (near(station, player, CONFIG.extract.fuelRadius)) {
        return { kind: 'extractFuel', name: station.name }
      }
    }
    if (input.keep && near(input.keep, player, CONFIG.extract.keepRadius)) {
      return { kind: 'extractKeep' }
    }
  }

  // The bush stands at the spawn Citgo, so it is there before the truck
  // leaves and after a strike brings you back.
  if (input.bush && near(input.bush, player, CONFIG.daily.reach)) {
    return { kind: 'collect', status: input.daily }
  }

  let best = CONFIG.player.pickupReach
  let nearest: P | null = null
  for (const pickup of input.pickups) {
    if (pickup.taken) continue
    const d = Math.hypot(pickup.x - player.x, pickup.z - player.z)
    if (d < best) {
      best = d
      nearest = pickup
    }
  }
  return nearest ? { kind: 'pickup', pickup: nearest } : null
}

export function pickupLabel({
  kind,
  count,
}: Pick<PickupSpot, 'kind' | 'count'>): string {
  if (kind === 'cabbage') return copy('prompts.cabbage')
  return copy('prompts.pickup_count', {
    item: itemById(kind)?.label ?? kind,
    count,
  })
}

export function interactionPrompt(interaction: Interaction): string {
  switch (interaction.kind) {
    case 'hopOut':
      return copy('prompts.hop_out')
    case 'board':
      return copy('prompts.board')
    case 'boardExtract':
      return copy('prompts.board_extract')
    case 'unload':
      return interaction.count === 1
        ? copy('prompts.unload_one')
        : copy('prompts.unload_many', { count: interaction.count })
    case 'extractFuel':
      return interaction.name
        ? copy('prompts.extract_at', { station: interaction.name })
        : copy('prompts.extract_station')
    case 'extractKeep':
      return copy('prompts.extract_keep', { keep: KEEP })
    case 'pickup':
      return copy('prompts.take', { item: pickupLabel(interaction.pickup) })
    case 'buy': {
      const label = itemById(interaction.item)?.label ?? interaction.item
      const price = formatCash(interaction.price)
      return interaction.affordable
        ? copy('prompts.buy', { item: label, price })
        : copy('prompts.buy_short', { item: label, price })
    }
    case 'collect':
      switch (interaction.status) {
        case 'ready':
          return copy('prompts.berry_ready')
        case 'picked':
          return copy('prompts.berry_picked')
        case 'offline':
          return copy('prompts.berry_offline')
      }
  }
}
