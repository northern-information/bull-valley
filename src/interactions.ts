// Pure: what E would do right now, and the prompt that says so. loop.ts
// resolves this once per frame and acts on it when E is pressed. No
// three.js, no DOM: tests/unit/interactions.test.ts runs it in Node.

import { CONFIG } from './config.ts'
import { copy } from './copy.ts'
import { nearestCorpse } from './corpses.ts'
import { cosmeticById } from './cosmetics.ts'
import { GOLD_BULLION, isCash, TWENTY } from './drops.ts'
import { getItem, itemById } from './items.ts'
import { npcReach } from './npcs.ts'
import { formatCash } from './store.ts'
import type { CorpseWire } from './corpses.ts'
import type { CosmeticId } from './cosmetics.ts'
import type { XZ } from './interfaces.ts'
import type { PickupKind } from './items.ts'
import type { NpcId, NpcSpot } from './npcs.ts'
import type { DailyWire } from './protocol.ts'

// A pickup as the resolver sees it.
export interface PickupSpot extends XZ {
  kind: PickupKind
  count: number
  taken: boolean
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

// A berry bush as this player finds it: a berry waiting, today's already
// taken, or no valley to ask (the bushes are the valley's; see daily.ts).
export type DailyStatus = 'ready' | 'picked' | 'offline'

// How bush `bush` stands at server time `now`, given the valley's last
// word on the bushes (null with no valley). The word is read against the
// valley's clock, so once midnight Central passes the berry is back
// before the valley is asked again.
export function dailyStatus(
  daily: DailyWire | null,
  bush: number,
  now: number
): DailyStatus {
  if (!daily) return 'offline'
  return daily.collected.includes(bush) && now < daily.resetsAt
    ? 'picked'
    : 'ready'
}

// A berry bush as the resolver sees it: its id and how it stands.
export interface BushSpot extends XZ {
  id: number
  status: DailyStatus
}

export type Interaction<P extends PickupSpot = PickupSpot> =
  | { kind: 'hopOut' }
  | { kind: 'board' }
  | { kind: 'pickup'; pickup: P }
  | ({ kind: 'buy' } & ShelfSpot)
  | { kind: 'collect'; bush: number; status: DailyStatus }
  | { kind: 'talk' }
  // Marx, Carlsten, or Moab Coldë at station `station`: he says his next
  // line.
  | { kind: 'speak'; npc: NpcId; station?: number }
  // Moab Coldë at station `station` offers cosmetic `offer` for what the
  // pack holds (cosmetics.ts moabOffer).
  | { kind: 'trade'; offer: CosmeticId; station: number }
  // This raider's own body `corpse`: E takes their things back
  // (sharedworld.ts rule 18).
  | { kind: 'loot'; corpse: number }
  // The lockers in the back room of station `station`: E opens the stash
  // (rule 19).
  | { kind: 'locker'; station: number }
  // The Cabbage Stand: E opens this raider's own (rule 23).
  | { kind: 'stand' }

// A locker bank as the resolver sees it: where E opens it, and its
// station.
export interface LockerSpot extends XZ {
  station: number
}

export interface InteractionInput<P extends PickupSpot> {
  // In the bed of the truck.
  riding: boolean
  player: XZ
  // How far off the truck is, whether it is moving, and whether this
  // raider may climb in (worldsync.ts boardable).
  truck: { distance: number; moving: boolean; boardable: boolean }
  pickups: readonly P[]
  // The shelf unit in view inside a store, or null.
  shelf: ShelfSpot | null
  // The berry bushes (the spawn Citgo's and the maze's), and how each
  // stands for this player today.
  bushes: readonly BushSpot[]
  // Gron, beside the spawn Citgo's bush, or null.
  gron: XZ | null
  // Marx, Carlsten and every Moab, where each stands while he can be
  // talked to.
  npcs: readonly NpcSpot[]
  // What Moab offers this raider (cosmetics.ts moabOffer), or null: E
  // beside him trades for it instead of hearing his line.
  moabOffer?: CosmeticId | null
  // This raider's own bodies lying in the valley (corpses.ts), and the
  // locker banks; others' bodies are no one else's to loot.
  corpses?: readonly CorpseWire[]
  lockers?: readonly LockerSpot[]
  // The Cabbage Stand's middle, or null.
  stand?: XZ | null
}

// The first match wins, in this order: hop out while riding; speak to the
// nearest NPC in his reach, unless a shelf unit is in view; climb into the
// truck standing still beside you, when it is yours to climb into; buy off
// a shelf; take your things back off your nearest body; open the lockers;
// tend the Cabbage Stand; Gron or the nearest berry bush, whichever is nearer; take the nearest
// pickup.
export function resolveInteraction<P extends PickupSpot>(
  input: InteractionInput<P>
): Interaction<P> | null {
  const { player, truck } = input
  if (input.riding) return { kind: 'hopOut' }
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
      if (near.id === 'moab' && input.moabOffer && near.station !== undefined) {
        return { kind: 'trade', offer: input.moabOffer, station: near.station }
      }
      return near.station === undefined
        ? { kind: 'speak', npc: near.id }
        : { kind: 'speak', npc: near.id, station: near.station }
    }
  }

  if (
    truck.boardable &&
    !truck.moving &&
    truck.distance < CONFIG.truck.boardRange
  ) {
    return { kind: 'board' }
  }
  if (input.shelf) return { kind: 'buy', ...input.shelf }

  const corpses = input.corpses ?? []
  const body = nearestCorpse(
    corpses,
    corpses.map((c) => c.id),
    player,
    CONFIG.corpses.reach
  )
  if (body) return { kind: 'loot', corpse: body.id }
  for (const locker of input.lockers ?? []) {
    const d = Math.hypot(locker.x - player.x, locker.z - player.z)
    if (d < CONFIG.stash.reach) {
      return { kind: 'locker', station: locker.station }
    }
  }

  const stand = input.stand
  if (
    stand &&
    Math.hypot(stand.x - player.x, stand.z - player.z) < CONFIG.stand.reach
  ) {
    return { kind: 'stand' }
  }

  // Gron and the first bush stand at the spawn Citgo a few strides apart,
  // so both can be in reach; the nearer one answers.
  const dist = (spot: XZ | null) =>
    spot ? Math.hypot(spot.x - player.x, spot.z - player.z) : Infinity
  let bush: BushSpot | null = null
  for (const spot of input.bushes) {
    if (dist(spot) < dist(bush)) bush = spot
  }
  const toBush = dist(bush)
  const toGron = dist(input.gron)
  if (toGron < CONFIG.gron.reach && toGron <= toBush) return { kind: 'talk' }
  if (bush && toBush < CONFIG.daily.reach) {
    return { kind: 'collect', bush: bush.id, status: bush.status }
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
}: {
  kind: string
  count: number
}): string {
  if (kind === 'cabbage') return copy('labels.cabbage')
  if (kind === TWENTY) {
    return count === 1
      ? copy('labels.twenty')
      : copy('labels.twenties', { count })
  }
  if (isCash(kind)) return copy('labels.dimes', { count })
  // A bar is one troy ounce, and its name says so.
  if (kind === GOLD_BULLION && count === 1) return getItem(GOLD_BULLION).label
  return copy('labels.pickup_count', {
    item: itemById(kind)?.label ?? kind,
    count,
  })
}

// The label over the item E would act on: a pickup, the shelf unit a buy
// would take, or a berry bush. dim: true when it cannot be had (short of
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
    case 'pickup':
    case 'buy':
    case 'collect':
      return null
    case 'talk':
    case 'speak':
      return null
    case 'loot':
      return copy('prompts.loot')
    case 'locker':
      return copy('prompts.locker')
    case 'stand':
      return copy('prompts.stand')
    // Moab's offer is said, since the glow alone cannot say what he wants.
    case 'trade': {
      const cosmetic = cosmeticById(interaction.offer)
      const price = cosmetic ? itemById(cosmetic.price.kind) : null
      if (!cosmetic || !price) return null
      return copy('prompts.trade', {
        cosmetic: cosmetic.label,
        count: cosmetic.price.count,
        price: price.label,
      })
    }
  }
}
