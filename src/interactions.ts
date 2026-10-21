// Pure: what E would do right now, and the prompt that says so. loop.ts
// resolves this once per frame and acts on it when E is pressed. No
// three.js, no DOM: tests/unit/interactions.test.ts runs it in Node.

import { CONFIG } from './config.ts'
import { insideRing } from './coords.ts'
import { copy } from './copy.ts'
import { nearestCorpse } from './corpses.ts'
import { cosmeticById } from './cosmetics.ts'
import { GOLD_BULLION, isCash, QUARTERS, TWENTY } from './drops.ts'
import { itemLabel as itemName } from './itemcopy.ts'
import { itemById } from './items.ts'
import { npcReach } from './npcs.ts'
import { formatCash } from './store.ts'
import type { CorpseWire } from './corpses.ts'
import type { CosmeticId } from './cosmetics.ts'
import type { HallucinationShape } from './hallucinations.ts'
import type { Vec3, XZ } from './interfaces.ts'
import type { PickupKind } from './items.ts'
import type { NpcId, NpcSpot } from './npcs.ts'
import type { DailyWire } from './protocol.ts'

// A pickup as the resolver sees it.
export interface PickupSpot extends XZ {
  kind: PickupKind
  count: number
  taken: boolean
  // The walled room it lies in, when it does: taken only from inside it,
  // as the valley holds it (sharedworld.ts rule 4).
  within?: readonly XZ[]
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
  // The laptop in the bathroom of station `station`: E sits down at it
  // (rule 31).
  | { kind: 'laptop'; station: number }
  // The Cabbage Stand: E opens this raider's own (rule 23).
  | { kind: 'stand' }
  // The squatter in Bull Valley Plaza: E opens what he is selling
  // (dealer.ts).
  | { kind: 'deal' }
  // A door locked to this raider (keys.ts): E only rattles it.
  | { kind: 'locked' }
  // The heart of the maze with Erwin's rose in the pack: E lays it
  // (quests.ts).
  | { kind: 'lay' }
  // The trapdoor in the Video Vault's office: E climbs down into the
  // Undercroft (undercroft.ts); the ladder's foot below: E climbs up.
  | { kind: 'descend' }
  | { kind: 'ascend' }
  // The lookout tower by the maze's gate (lookout.ts): E at the ladder's
  // foot climbs up onto the deck; at its top, E climbs back down.
  | { kind: 'climbTower' }
  | { kind: 'leaveTower' }
  // Someone or something a trip shows that is not there
  // (hallucinations.ts): it answers E as the real one would, and E bursts
  // it. `item` is what a thing passes for.
  | {
      kind: 'hallucination'
      id: number
      shape: HallucinationShape
      item?: string
    }

// What the eye sees: the eye, the unit look direction, the feet's height,
// the ground (or the floor) under any point, and how high each pickup
// stands (its middle).
export interface View<P extends PickupSpot> {
  eye: Vec3
  dir: Vec3
  feet: number
  groundAt: (x: number, z: number) => number
  heightOf: (pickup: P) => number
}

// What a thing E answers is to the eye: a column from `low` to `high`
// over the ground under it, `r` round. Seen when the look passes within
// CONFIG.player.pickupCone of it (wider by the angle `r` takes up from
// where the eye is) and some of it lies within CONFIG.player.pickupRise of
// the feet, so nothing a floor away is ever seen.
export interface Sight {
  low: number
  high: number
  r: number
}

export const SIGHTS = {
  // On the ground, a hand's height: its own height is the pickup's.
  thing: { low: -0.1, high: 0.1, r: 0.05 },
  person: { low: 0, high: 1.8, r: 0.35 },
  // Erwin, sat on the floor by his candles.
  seated: { low: 0, high: 1.2, r: 0.4 },
  // A body sprawled on its back.
  body: { low: 0, high: 0.4, r: 0.9 },
  bush: { low: 0, high: 1.3, r: 0.6 },
  truck: { low: 0, high: 2, r: 2.6 },
  lockers: { low: 0, high: 1.85, r: 1.8 },
  laptop: { low: 0.6, high: 1.1, r: 0.35 },
  stand: { low: 0, high: 2.2, r: 1.3 },
  hatch: { low: -0.2, high: 0.3, r: 0.7 },
  // A ladder going up from its foot, and down from its top.
  ladder: { low: 0, high: 3, r: 0.5 },
  ladderTop: { low: -1.5, high: 1.2, r: 0.6 },
  door: { low: 0, high: 2.2, r: 0.6 },
  portal: { low: 0, high: 2.6, r: 1.2 },
} as const satisfies Record<string, Sight>

// How far off the look `sight` at (x, z), its column standing on `base`,
// lies from the eye, in radians, with the angle it takes up taken off (0
// when the look falls on it); Infinity when no part of it lies within
// CONFIG.player.pickupRise of the feet.
export function sightAngle(
  view: Pick<View<PickupSpot>, 'eye' | 'dir' | 'feet'>,
  at: XZ,
  base: number,
  sight: Sight
): number {
  const { pickupRise } = CONFIG.player
  const low = base + sight.low
  const high = base + sight.high
  if (high < view.feet - pickupRise || low > view.feet + pickupRise) {
    return Infinity
  }
  const { eye, dir } = view
  const dx = at.x - eye[0]
  const dz = at.z - eye[2]
  const flat = Math.hypot(dx, dz)
  // The height on the column nearest the look: where the look stands over
  // the column, kept on it.
  const level = Math.hypot(dir[0], dir[2])
  const along = level > 1e-6 ? (dx * dir[0] + dz * dir[2]) / level : 0
  const lookY = along > 0 ? eye[1] + (dir[1] / level) * along : eye[1]
  const y = Math.min(high, Math.max(low, lookY))
  const angle = aimAngle(eye, dir, [at.x, y, at.z])
  return Math.max(0, angle - Math.atan2(sight.r, Math.max(flat, 1e-6)))
}

// A hallucination as the resolver sees it.
export interface HallucinationSpot extends XZ {
  id: number
  shape: HallucinationShape
  item?: string
}

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
  truck: { distance: number; moving: boolean; boardable: boolean; at?: XZ }
  pickups: readonly P[]
  // Whether a wall stands between two points (walls.ts between): whatever
  // stands behind one is out of reach however near it lies. Left out,
  // nothing does.
  walled?: (from: XZ, to: XZ) => boolean
  // Where the eye is and which way it looks (a unit vector), the ground
  // under any point and how high each pickup stands: whatever E answers
  // must be in view (sightAngle), and of the pickups the one nearest the
  // middle of it first. Left out, everything answers wherever it lies.
  view?: View<P>
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
  // The laptop in the bathroom of the store the raider stands in.
  laptops?: readonly LockerSpot[]
  // The Cabbage Stand's middle, or null.
  stand?: XZ | null
  // The squatter who deals in the plaza, or null.
  dealer?: XZ | null
  // A locked door this raider lacks the key to, or null.
  locked?: XZ | null
  // The heart of the maze, while this raider has a rose to lay there, or
  // null.
  heart?: XZ | null
  // The trapdoor down to the Undercroft, and the ladder's foot up out of
  // it, or null.
  trapdoor?: XZ | null
  ladder?: XZ | null
  // The lookout tower's ladder, its foot and its top, and whether this
  // raider is up on the deck; or null.
  lookout?: { foot: XZ; top: XZ; on: boolean } | null
  // What a trip shows this raider that is not there, each answering E
  // from as far as the real one would (CONFIG.hallucinations.reach).
  hallucinations?: readonly HallucinationSpot[]
}

// The first match wins, in this order: hop out while riding; the nearest
// hallucination in its reach (it stands where you walked up to it, so it
// answers before whatever stands behind it); speak to the
// nearest NPC in his reach, unless a shelf unit is in view; climb into the
// truck standing still beside you, when it is yours to climb into; buy off
// a shelf; take your things back off your nearest body; open the lockers;
// sit down at the laptop; tend the Cabbage Stand; deal with the squatter; take the nearest pickup
// in reach of a locked door, or else rattle it; Gron or the nearest berry
// bush, whichever is nearer; take the nearest pickup.
export function resolveInteraction<P extends PickupSpot>(
  input: InteractionInput<P>
): Interaction<P> | null {
  const { player, truck, view, walled } = input
  if (input.riding) return { kind: 'hopOut' }
  // Whatever stands at `spot` as `sight` is to the eye: in view, about the
  // raider's own level, with no wall between.
  const sees = (spot: XZ, sight: Sight) =>
    (!view ||
      sightAngle(view, spot, view.groundAt(spot.x, spot.z), sight) <=
        CONFIG.player.pickupCone) &&
    !walled?.(player, spot)
  const seen = nearestHallucination(
    (input.hallucinations ?? []).filter((spot) =>
      sees(spot, spot.shape === 'thing' ? SIGHTS.thing : SIGHTS.person)
    ),
    player
  )
  if (seen) {
    return seen.item === undefined
      ? { kind: 'hallucination', id: seen.id, shape: seen.shape }
      : {
          kind: 'hallucination',
          id: seen.id,
          shape: seen.shape,
          item: seen.item,
        }
  }
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
      if (d < npcReach(spot.id) && d < best && sees(spot, SIGHTS.person)) {
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
    truck.distance < CONFIG.truck.boardRange &&
    (!truck.at || sees(truck.at, SIGHTS.truck))
  ) {
    return { kind: 'board' }
  }
  if (input.shelf) return { kind: 'buy', ...input.shelf }

  const corpses = (input.corpses ?? []).filter((c) => sees(c, SIGHTS.body))
  const body = nearestCorpse(
    corpses,
    corpses.map((c) => c.id),
    player,
    CONFIG.corpses.reach
  )
  if (body) return { kind: 'loot', corpse: body.id }
  for (const locker of input.lockers ?? []) {
    const d = Math.hypot(locker.x - player.x, locker.z - player.z)
    if (d < CONFIG.stash.reach && sees(locker, SIGHTS.lockers)) {
      return { kind: 'locker', station: locker.station }
    }
  }
  for (const laptop of input.laptops ?? []) {
    const d = Math.hypot(laptop.x - player.x, laptop.z - player.z)
    if (d < CONFIG.laptop.reach && sees(laptop, SIGHTS.laptop)) {
      return { kind: 'laptop', station: laptop.station }
    }
  }

  const stand = input.stand
  if (
    stand &&
    Math.hypot(stand.x - player.x, stand.z - player.z) < CONFIG.stand.reach &&
    sees(stand, SIGHTS.stand)
  ) {
    return { kind: 'stand' }
  }

  const dealer = input.dealer
  if (
    dealer &&
    Math.hypot(dealer.x - player.x, dealer.z - player.z) <
      CONFIG.dealer.reach &&
    sees(dealer, SIGHTS.seated)
  ) {
    return { kind: 'deal' }
  }

  const reach = (spot: XZ | null | undefined, sight: Sight) =>
    spot != null &&
    Math.hypot(spot.x - player.x, spot.z - player.z) <
      CONFIG.undercroft.climbReach &&
    sees(spot, sight)
  if (reach(input.ladder, SIGHTS.ladder)) return { kind: 'ascend' }
  if (reach(input.trapdoor, SIGHTS.hatch)) return { kind: 'descend' }

  // Up on the deck only the way down is offered, and below only the way
  // up, so the two never meet.
  const tower = input.lookout
  if (tower) {
    const spot = tower.on ? tower.top : tower.foot
    if (
      Math.hypot(spot.x - player.x, spot.z - player.z) <
        CONFIG.maze.lookout.climbReach &&
      sees(spot, tower.on ? SIGHTS.ladderTop : SIGHTS.ladder)
    ) {
      return { kind: tower.on ? 'leaveTower' : 'climbTower' }
    }
  }

  const heart = input.heart
  if (
    heart &&
    Math.hypot(heart.x - player.x, heart.z - player.z) <
      CONFIG.quests.layReach &&
    sees(heart, SIGHTS.portal)
  ) {
    return { kind: 'lay' }
  }

  const locked = input.locked
  if (
    locked &&
    Math.hypot(locked.x - player.x, locked.z - player.z) <
      CONFIG.stripMall.doorReach
  ) {
    const pickup = nearestPickup(
      input.pickups,
      player,
      input.walled,
      input.view
    )
    return pickup ? { kind: 'pickup', pickup } : { kind: 'locked' }
  }

  // Gron and the first bush stand at the spawn Citgo a few strides apart,
  // so both can be in reach; the nearer one answers.
  const dist = (spot: XZ | null) =>
    spot ? Math.hypot(spot.x - player.x, spot.z - player.z) : Infinity
  let bush: BushSpot | null = null
  for (const spot of input.bushes) {
    if (dist(spot) < dist(bush) && sees(spot, SIGHTS.bush)) bush = spot
  }
  const toBush = dist(bush)
  const gron = input.gron && sees(input.gron, SIGHTS.person) ? input.gron : null
  const toGron = dist(gron)
  if (toGron < CONFIG.gron.reach && toGron <= toBush) return { kind: 'talk' }
  if (bush && toBush < CONFIG.daily.reach) {
    return { kind: 'collect', bush: bush.id, status: bush.status }
  }

  const nearest = nearestPickup(input.pickups, player, walled, view)
  return nearest ? { kind: 'pickup', pickup: nearest } : null
}

// The nearest hallucination within its reach, or null.
function nearestHallucination(
  spots: readonly HallucinationSpot[],
  player: XZ
): HallucinationSpot | null {
  const { reach } = CONFIG.hallucinations
  let best = Infinity
  let nearest: HallucinationSpot | null = null
  for (const spot of spots) {
    const d = Math.hypot(spot.x - player.x, spot.z - player.z)
    const within = spot.shape === 'thing' ? reach.thing : reach.person
    if (d < within && d < best) {
      best = d
      nearest = spot
    }
  }
  return nearest
}

// The pickup E would take: not yet taken, within reach, with no wall
// between. Given the view, only one in it (inside CONFIG.player.pickupCone
// of the look, about the raider's own level: sightAngle) and the one
// nearest the middle of it; else the nearest. Null when none qualifies.
function nearestPickup<P extends PickupSpot>(
  pickups: readonly P[],
  player: XZ,
  walled?: (from: XZ, to: XZ) => boolean,
  view?: View<P>
): P | null {
  const { pickupReach, pickupCone } = CONFIG.player
  let best = view ? pickupCone : pickupReach
  let nearest: P | null = null
  for (const pickup of pickups) {
    if (pickup.taken) continue
    if (pickup.within && !insideRing(player.x, player.z, pickup.within)) {
      continue
    }
    const d = Math.hypot(pickup.x - player.x, pickup.z - player.z)
    if (d >= pickupReach) continue
    let score = d
    if (view) {
      score = sightAngle(view, pickup, view.heightOf(pickup), SIGHTS.thing)
    }
    if (score < best && !walled?.(player, pickup)) {
      best = score
      nearest = pickup
    }
  }
  return nearest
}

// The angle, in radians, between the look `dir` (a unit vector) from `eye`
// and the line to `at`; 0 for a point at the eye.
export function aimAngle(eye: Vec3, dir: Vec3, at: Vec3): number {
  const dx = at[0] - eye[0]
  const dy = at[1] - eye[1]
  const dz = at[2] - eye[2]
  const d = Math.hypot(dx, dy, dz)
  if (d < 1e-6) return 0
  const cos = (dx * dir[0] + dy * dir[1] + dz * dir[2]) / d
  return Math.acos(Math.max(-1, Math.min(1, cos)))
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
  if (kind === QUARTERS) return copy('labels.quarters', { count })
  if (isCash(kind)) return copy('labels.dimes', { count })
  // A bar is one troy ounce, and its name says so.
  if (kind === GOLD_BULLION && count === 1) return itemName(GOLD_BULLION)
  return copy('labels.pickup_count', {
    item: itemName(kind),
    count,
  })
}

// The label over the item E would act on: a pickup, the shelf unit a buy
// would take, or a berry bush. dim: true when it cannot be had (short of
// cash, or the bush picked clean or out of reach of the valley). Null for
// everything else.
interface ItemLabel {
  text: string
  dim: boolean
}

export function itemLabel(interaction: Interaction): ItemLabel | null {
  switch (interaction.kind) {
    case 'pickup':
      return { text: pickupLabel(interaction.pickup), dim: false }
    // A thing that is not there is labelled as the real one would be.
    case 'hallucination':
      return interaction.item === undefined
        ? null
        : {
            text: pickupLabel({ kind: interaction.item, count: 1 }),
            dim: false,
          }
    case 'buy':
      return {
        text: copy('labels.price', {
          item: itemName(interaction.item),
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

// What the prompt and the label of an interaction are made from, as one
// string: while it holds the same, the loop keeps the lines it had
// rather than filling them again every frame.
export function interactionKey(interaction: Interaction): string {
  switch (interaction.kind) {
    case 'pickup':
      return `pickup:${interaction.pickup.kind}:${interaction.pickup.count}`
    case 'buy':
      return `buy:${interaction.item}:${interaction.price}:${interaction.affordable}`
    case 'collect':
      return `collect:${interaction.bush}:${interaction.status}`
    case 'speak':
      return `speak:${interaction.npc}:${interaction.station ?? ''}`
    case 'trade':
      return `trade:${interaction.offer}:${interaction.station}`
    case 'loot':
      return `loot:${interaction.corpse}`
    case 'locker':
      return `locker:${interaction.station}`
    case 'hallucination':
      return `hallucination:${interaction.id}`
    default:
      return interaction.kind
  }
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
    case 'laptop':
      return copy('prompts.laptop')
    case 'stand':
      return copy('prompts.stand')
    case 'deal':
      return null
    // As the real one: a label for a thing, the glow alone for a person.
    case 'hallucination':
      return null
    case 'locked':
      return copy('prompts.locked')
    case 'lay':
      return copy('prompts.lay')
    case 'descend':
      return copy('prompts.descend')
    case 'ascend':
      return copy('prompts.ascend')
    case 'climbTower':
      return copy('prompts.climb_tower')
    case 'leaveTower':
      return copy('prompts.leave_tower')
    // Moab's offer is said, since the glow alone cannot say what he wants.
    case 'trade': {
      const cosmetic = cosmeticById(interaction.offer)
      if (!cosmetic || !itemById(cosmetic.price.kind)) return null
      return copy('prompts.trade', {
        cosmetic: cosmetic.label,
        count: cosmetic.price.count,
        price: itemName(cosmetic.price.kind),
      })
    }
  }
}
