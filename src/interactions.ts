// Pure: what E would do right now, and the prompt that says so. loop.ts
// resolves this once per frame and acts on it when E is pressed. No
// three.js, no DOM: tests/unit/interactions.test.ts runs it in Node.

import { CONFIG } from './config.ts'
import { copy } from './copy.ts'
import { itemById } from './items.ts'
import { KEEP } from './landmarks.ts'
import { npcReach } from './npcs.ts'
import { STATES } from './raid.ts'
import { formatCash } from './store.ts'
import type { Raid, XZ } from './interfaces.ts'
import type { PickupKind } from './items.ts'
import type { NpcId, NpcSpot } from './npcs.ts'
import type { DailyWire } from './protocol.ts'

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

// The shelf unit the player is looking at, from store.ts unitInView.
export interface ShelfSpot {
  item: string
  // Index into the stations, and into the store stock.
  station: number
  // Its slot on the facing.
  unit: number
  // In cents.
  price: number
  affordable: boolean
}

// The berry bush as this player finds it: a berry waiting, today's already
// taken, or no valley to ask (the bush is the valley's; see daily.ts).
export type DailyStatus = 'ready' | 'picked' | 'offline'

// How the bush stands at server time `now`, given the valley's last word
// on it (null with no valley). The word is read against the valley's
// clock, so once midnight Central passes the berry is back before the
// valley is asked again.
export function dailyStatus(daily: DailyWire | null, now: number): DailyStatus {
  if (!daily) return 'offline'
  return daily.collected && now < daily.resetsAt ? 'picked' : 'ready'
}

export type Interaction<P extends PickupSpot = PickupSpot> =
  | { kind: 'hopOut' }
  | { kind: 'board' }
  | { kind: 'boardExtract' }
  | { kind: 'extractFuel'; name: string }
  | { kind: 'extractKeep' }
  | { kind: 'pickup'; pickup: P }
  | ({ kind: 'buy' } & ShelfSpot)
  | { kind: 'collect'; status: DailyStatus }
  | { kind: 'talk' }
  // Marx, Carlsten, or Moab Coldë at station `station`: he says his next
  // line.
  | { kind: 'speak'; npc: NpcId; station?: number }

export interface InteractionInput<P extends PickupSpot> {
  raid: Raid
  ended: boolean
  player: XZ
  truck: { distance: number; moving: boolean }
  keep: XZ | null
  // Every station; the spawn station is never an extract.
  stations: readonly StationSpot[]
  spawnStation: StationSpot
  pickups: readonly P[]
  // The shelf unit in view inside a store, or null.
  shelf: ShelfSpot | null
  // Whether the player stands inside a store's walls: no station extract
  // from in there.
  insideStore: boolean
  // The berry bush at the spawn Citgo, or null, and how it stands for
  // this player today.
  bush: XZ | null
  daily: DailyStatus
  // Gron, beside the bush, or null.
  gron: XZ | null
  // Marx, Carlsten and every Moab, where each stands while he can be
  // talked to.
  npcs: readonly NpcSpot[]
}

function near(a: XZ, b: XZ, radius: number): boolean {
  return Math.hypot(a.x - b.x, a.z - b.z) < radius
}

// The first match wins, in this order: hop out while riding; speak to the
// nearest NPC in his reach, unless a shelf unit is in view (Moab stands
// inside a station's extract radius, so this comes before extracting);
// board the waiting truck; buy off a shelf; board the called truck to end
// the raid; extract at a station (never from inside its store) or the Keep; Gron or the berry bush, whichever is nearer; take the
// nearest pickup.
export function resolveInteraction<P extends PickupSpot>(
  input: InteractionInput<P>
): Interaction<P> | null {
  const { raid, ended, player } = input
  if (ended || raid.state === STATES.EXTRACTED) return null
  if (raid.state === STATES.RIDING) return { kind: 'hopOut' }
  // Marx reads by the tailgate, in boarding range: beside him E talks, a
  // step away it boards. Carlsten stands behind the counter of goods, so
  // the facing in view sells first.
  if (!input.shelf) {
    // The nearest of those in his own reach: Moab stands beside a horse,
    // so his reaches further.
    let best = Infinity
    let near: NpcSpot | null = null
    for (const spot of input.npcs) {
      const d = Math.hypot(spot.x - player.x, spot.z - player.z)
      if (d < npcReach(spot.id) && d < best) {
        best = d
        near = spot
      }
    }
    if (near) {
      return near.station === undefined
        ? { kind: 'speak', npc: near.id }
        : { kind: 'speak', npc: near.id, station: near.station }
    }
  }

  const truckClose = input.truck.distance < CONFIG.truck.boardRange
  if (raid.state === STATES.LOADOUT && truckClose) return { kind: 'board' }
  if (input.shelf) return { kind: 'buy', ...input.shelf }
  if (raid.state === STATES.ON_FOOT) {
    if (raid.truckCalled && !input.truck.moving && truckClose) {
      return { kind: 'boardExtract' }
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

  // The bush and Gron stand at the spawn Citgo, so they are there before
  // the truck leaves and after a strike brings you back. They stand a few
  // strides apart, so both can be in reach; the nearer one answers.
  const dist = (spot: XZ | null) =>
    spot ? Math.hypot(spot.x - player.x, spot.z - player.z) : Infinity
  const toBush = dist(input.bush)
  const toGron = dist(input.gron)
  if (toGron < CONFIG.gron.reach && toGron <= toBush) return { kind: 'talk' }
  if (toBush < CONFIG.daily.reach) {
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

// What an item is called on its floating label: its name, and a count for
// a pickup of more than one.
export function pickupLabel({
  kind,
  count,
}: Pick<PickupSpot, 'kind' | 'count'>): string {
  if (kind === 'cabbage') return copy('labels.cabbage')
  return copy('labels.pickup_count', {
    item: itemById(kind)?.label ?? kind,
    count,
  })
}

// The label over the item E would act on: a pickup, the shelf unit a buy
// would take, or the berry bush. dim: true when it cannot be had (short of
// cash, or the bush picked clean or out of reach of the valley). Null for
// everything else.
export interface ItemLabel {
  text: string
  dim: boolean
}

export function itemLabel(interaction: Interaction): ItemLabel | null {
  switch (interaction.kind) {
    case 'pickup':
      return { text: pickupLabel(interaction.pickup), dim: false }
    case 'buy':
      return {
        text: copy('labels.price', {
          item: itemById(interaction.item)?.label ?? interaction.item,
          price: formatCash(interaction.price),
        }),
        dim: !interaction.affordable,
      }
    case 'collect':
      switch (interaction.status) {
        case 'ready':
          return { text: copy('labels.berries'), dim: false }
        case 'picked':
          return { text: copy('labels.berry_picked'), dim: true }
        case 'offline':
          return { text: copy('labels.berry_offline'), dim: true }
      }
      break
    default:
      return null
  }
  return null
}

// The bottom prompt for what E would do, or null where something else
// says it: an item's own label (itemLabel), or the glow on the people you
// talk to.
export function interactionPrompt(interaction: Interaction): string | null {
  switch (interaction.kind) {
    case 'hopOut':
      return copy('prompts.hop_out')
    case 'board':
      return copy('prompts.board')
    case 'boardExtract':
      return copy('prompts.board_extract')
    case 'extractFuel':
      return interaction.name
        ? copy('prompts.extract_at', { station: interaction.name })
        : copy('prompts.extract_station')
    case 'extractKeep':
      return copy('prompts.extract_keep', { keep: KEEP })
    case 'pickup':
    case 'buy':
    case 'collect':
      return null
    case 'talk':
    case 'speak':
      return null
  }
}
