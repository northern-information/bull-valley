// The shadowmen's step over the valley (sharedworld.ts rule 11), pure like
// the reducer whose Valley it reads: what the valley keeps of its shadows
// in memory, the raiders they cross round, Marx's headlights and the traffic's lamps, one step of
// the shadowmen, the Caretaker (rule 13) and the tunnel shades with what
// it credits (rules 15, 16 and 22) and the grace it leaves (rule 24), each
// raider's share of its frame, what the step reads of where raiders stand
// (rules 24 and 28), and the dev server's placements.

import { buffedBeam } from './buffs.ts'
import { caretakerAt, createCaretaker, stepCaretaker } from './caretaker.ts'
import { citgoAt, phoneAt, phonesOf } from './citgos.ts'
import { CONFIG } from './config.ts'
import { woundsOf } from './health.ts'
import { onLookout } from './lookout.ts'
import { worldToMaze } from './maze.ts'
import {
  beamFrom,
  burnSecondsOf,
  createShadowmen,
  headlightBeam,
  inHaven,
  placeStill,
  stepShadowmen,
  taillightBeam,
} from './shadowmen.ts'
import {
  citgosFor,
  creditedWith,
  creditedWithParty,
  grantsTo,
  inTheBed,
  wardsFor,
} from './sharedworld.ts'
import { lampBeams } from './traffic.ts'
import {
  createTunnelShades,
  stepTunnelShades,
  tunnelShadesAt,
} from './tunnelshades.ts'
import { inUndercroft } from './undercroft.ts'
import type { Caretaker } from './caretaker.ts'
import type { HeightAt, XZ } from './interfaces.ts'
import type { MazePlace } from './maze.ts'
import type { XpGrant } from './progression.ts'
import type {
  CaretakerWire,
  PeerStateWire,
  ShadowmanWire,
  ShadowmenMessage,
  TunnelBurstWire,
  TunnelShadeWire,
} from './protocol.ts'
import type { Rng } from './rng.ts'
import type { StairPath } from './shadowclimb.ts'
import type {
  Beam,
  Haven,
  Raider,
  ShadeKind,
  Shadowman,
  ShadowmenConfig,
  ShadowmenField,
  ShadowmenUpdate,
  TruckPose,
} from './shadowmen.ts'
import type { Valley } from './sharedworld.ts'
import type { TrafficLamp } from './traffic.ts'
import type { TunnelBurst, TunnelShade, TunnelUpdate } from './tunnelshades.ts'
import type { ShadowHit } from './wards.ts'

// The valley's shadowmen, in the server's memory: the field, the
// Caretaker (rule 13), each raider who was struck with the server ms
// until which they are left alone, and where Marx's truck was last said to
// stand, with the server ms it was said, and the traffic's lamps.
export interface Shadows {
  field: ShadowmenField
  caretaker: Caretaker
  tunnel: TunnelShade[]
  recovering: Record<string, number>
  headlights: { pose: TruckPose; at: number } | null
  // The traffic's lamps, by the socket that last told of them (traffic.ts),
  // with the server ms it did.
  traffic: Record<string, { lamps: TrafficLamp[]; at: number }>
}

export function createShadows(): Shadows {
  return {
    field: createShadowmen(),
    caretaker: createCaretaker(),
    tunnel: createTunnelShades(),
    recovering: {},
    headlights: null,
    traffic: {},
  }
}

// One raider in the shadowmen's field: their socket id, and their last
// state frame (null until they send one).
export interface Placed {
  id: string
  at: PeerStateWire | null
}

// What a raider's grace after a strike is kept under: the account's
// (rule 24), or the socket's for one the valley does not know.
function graceKey(valley: Valley, id: string): string {
  return valley.members[id]?.account ?? id
}

// The raiders the shadowmen cross round: every placed member.
export function shadowRaiders(
  valley: Valley,
  shadows: Shadows,
  placed: readonly Placed[],
  now: number
): Raider[] {
  const raiders: Raider[] = []
  const maze = valley.world?.maze ?? null
  for (const { id, at } of placed) {
    const member = valley.members[id]
    if (!at || !member) continue
    raiders.push({
      id,
      x: at.x,
      z: at.z,
      y: at.y,
      vulnerable:
        !inTheBed(valley, id) &&
        // Up on the lookout no shadow reaches them.
        !(maze && onLookout(maze, at)) &&
        now >= (shadows.recovering[graceKey(valley, id)] ?? 0),
      // Rule 27: their high reaches it further and wider. A jar, a rod or
      // a torch in the hand holds no flashlight (held.ts); a torch is a
      // light of its own (shadowmen.ts inTorchLight).
      beam:
        at.light && !at.held
          ? buffedBeam(
              beamFrom(at, at.yaw, at.pitch, at.pose === 'crouch'),
              wardsFor(valley, member.account, now)
            )
          : null,
      torch: at.held === 'torch',
    })
  }
  return raiders
}

// A raider says where Marx's truck stands (a headlights frame). Every
// client drives the same leg against the same clock, so any one near it
// will do; the word of one whose last state frame is not within reach of
// it is not taken. Whether it was. Mutates shadows.
export function seeHeadlights(
  shadows: Shadows,
  from: PeerStateWire | null,
  pose: TruckPose,
  now: number,
  cfg = CONFIG.truck.headlights
): boolean {
  if (!from || Math.hypot(from.x - pose.x, from.z - pose.z) > cfg.reach) {
    return false
  }
  shadows.headlights = { pose, at: now }
  return true
}

// The headlights' beam, while the truck's last word is fresh.
export function headlightsAt(
  shadows: Shadows,
  now: number,
  cfg = CONFIG.truck.headlights
): Beam[] {
  const seen = shadows.headlights
  if (!seen || now - seen.at > cfg.staleMs) return []
  return [
    headlightBeam(seen.pose, cfg),
    taillightBeam(seen.pose, cfg.tail, cfg.tailHeight),
  ]
}

// A raider says where the lamps of the cars round them stand (a traffic
// frame, traffic.ts): every client drives the same traffic on the same
// clock, so any one near will do. A lamp not within reach of the sender's
// last state frame is not taken. Kept by sender, so two raiders telling
// of the same car only light it twice. Mutates shadows.
export function seeTraffic(
  shadows: Shadows,
  id: string,
  from: PeerStateWire | null,
  lamps: readonly TrafficLamp[],
  now: number,
  cfg = CONFIG.truck.headlights
): number {
  if (!from) return 0
  const near = lamps.filter(
    (lamp) => Math.hypot(from.x - lamp.x, from.z - lamp.z) <= cfg.reach
  )
  shadows.traffic[id] = { lamps: near, at: now }
  return near.length
}

// Every vehicle's lamps the valley has fresh word of, as beams; a word
// gone stale is forgotten. Mutates shadows.
export function trafficAt(
  shadows: Shadows,
  now: number,
  cfg = CONFIG.traffic
): Beam[] {
  const beams: Beam[] = []
  for (const [id, seen] of Object.entries(shadows.traffic)) {
    if (now - seen.at > cfg.staleMs) {
      delete shadows.traffic[id]
      continue
    }
    for (const lamp of seen.lamps) beams.push(...lampBeams(lamp))
  }
  return beams
}

// How far past the Undercroft's walls a raider still counts as down there,
// so one climbing the ladder never meets a shadowman on the way.
const CROFT_MARGIN = 4

// Where the wire rounds a shadowman: centimetres, and hundredths of a burn.
const round = (n: number, places: number) =>
  Math.round(n * 10 ** places) / 10 ** places

// A share from 0 to 1, as the wire rounds it.
const share = (n: number, of: number) => round(Math.min(1, n / of), 2)

// The step's frame as one raider at `at` needs it: the shadowmen within
// `radius` of them (the field round every raider is sent to no one whole),
// the lunges among those, and the rest as it is. A raider nowhere yet gets
// it whole.
export function shadowmenNear(
  message: ShadowmenMessage,
  at: XZ | null,
  radius: number
): ShadowmenMessage {
  if (!at) return message
  const shadowmen = message.shadowmen.filter(
    (s) => Math.hypot(s.x - at.x, s.z - at.z) <= radius
  )
  if (shadowmen.length === message.shadowmen.length) return message
  const ids = new Set(shadowmen.map((s) => s.id))
  return {
    ...message,
    shadowmen,
    lunges: message.lunges.filter((id) => ids.has(id)),
  }
}

// What one step of the shadowmen comes to.
export interface ShadowStep {
  // The frame for everyone.
  message: ShadowmenMessage
  struck: string[]
  // Rule 24: what struck each raider struck (the heaviest, when more
  // than one landed in the step).
  strikers: Record<string, ShadowHit>
  // Rule 15: the accounts credited with burning the Caretaker this step.
  credited: string[]
  // Rule 16: the accounts credited with a burn this step, once for each
  // shadowman each burned. A spiderling is no shadowman, and a spider's
  // brood would all but finish the day's task on its own.
  burned: string[]
  // Rule 22: the XP those burns and that burning earned.
  xp: XpGrant[]
}

// Rule 13: the Caretaker's step, in the maze the world was opened with.
function stepKeeper(
  valley: Valley,
  shadows: Shadows,
  rng: Rng,
  place: MazePlace,
  raiders: readonly Raider[],
  dt: number
): {
  caretaker: CaretakerWire | null
  burned: XZ | null
  caught: string[]
  credited: string[]
} {
  const out = stepCaretaker(shadows.caretaker, rng, { dt, raiders, place })
  const keeper = shadows.caretaker
  const at = caretakerAt(keeper, place)
  const windup = share(keeper.windup, CONFIG.caretaker.windupSeconds)
  return {
    caretaker: at && {
      x: round(at.x, 2),
      z: round(at.z, 2),
      burn: share(keeper.burn, CONFIG.caretaker.burnSeconds),
      target: keeper.target,
      ...(windup > 0 ? { windup } : {}),
      ...(out.lunged ? { lunge: true as const } : {}),
    },
    burned: out.burst && {
      x: round(out.burst.x, 2),
      z: round(out.burst.z, 2),
    },
    caught: out.struck,
    credited: creditedWithParty(valley, out.burnedBy, raiders),
  }
}

// Rule 24: a raider struck is let alone for a little while, where they
// stand or where they come to; the grace is the account's, like the
// health, so a second tab is not struck inside the first's. Mutates
// shadows.
function regrace(
  valley: Valley,
  shadows: Shadows,
  raiders: readonly Raider[],
  struck: readonly string[],
  now: number
): void {
  const recovering: Record<string, number> = {}
  const here = new Set(raiders.map((r) => graceKey(valley, r.id)))
  for (const [key, until] of Object.entries(shadows.recovering)) {
    if (until > now && here.has(key)) recovering[key] = until
  }
  for (const id of struck) {
    recovering[graceKey(valley, id)] = now + CONFIG.health.graceSeconds * 1000
  }
  shadows.recovering = recovering
}

function shadowmanWire(s: Shadowman, cfg: ShadowmenConfig): ShadowmanWire {
  const windup = share(s.windup, cfg.windupSeconds)
  return {
    id: s.id,
    ...(s.kind !== 'man' ? { kind: s.kind } : {}),
    x: round(s.x, 2),
    z: round(s.z, 2),
    ...(s.y !== undefined ? { y: round(s.y, 2) } : {}),
    burn: share(s.burn, burnSecondsOf(s.kind, cfg)),
    target: s.target,
    ...(windup > 0 ? { windup } : {}),
    ...(s.climb ? { wall: [round(s.climb.nx, 2), round(s.climb.nz, 2)] } : {}),
  }
}

function tunnelWire(
  shades: TunnelShade[],
  croft: MazePlace
): TunnelShadeWire[] {
  return tunnelShadesAt(shades, croft).map((s) => ({
    id: s.id,
    kind: s.kind,
    x: round(s.world.x, 2),
    z: round(s.world.z, 2),
    burn: share(s.burn, CONFIG.tunnel[s.kind].burnSeconds),
    hurt: round(s.wounds / CONFIG.tunnel[s.kind].hits, 2),
    target: s.target,
  }))
}

// Where a tunnel shade burst or took a hit, as the wire carries it.
function tunnelSpot(b: TunnelBurstWire): TunnelBurstWire {
  return { kind: b.kind, x: round(b.x, 2), z: round(b.z, 2) }
}

// Rules 16 and 22: what the step's bursts credit, and the XP they and a
// burned Caretaker earn. A tunnel shade burnt is a shadow burnt; a
// spiderling earns nothing, since a spider's brood would farm it.
function burnCredits(
  valley: Valley,
  bursts: ShadowmenUpdate['bursts'],
  tunnelBursts: readonly TunnelBurst[],
  credited: readonly string[]
): { burned: string[]; xp: XpGrant[] } {
  const shadows = bursts.filter((b) => b.kind !== 'spiderling')
  return {
    burned: [...shadows, ...tunnelBursts].flatMap((b) =>
      creditedWith(valley, b.by)
    ),
    xp: [
      ...shadows.flatMap((b) =>
        grantsTo(valley, b.by, b.kind === 'spider' ? 'spider' : 'burn')
      ),
      ...tunnelBursts.flatMap((b) =>
        grantsTo(valley, b.by, b.kind === 'warden' ? 'warden' : 'burn')
      ),
      ...credited.map((account) => ({ account, source: 'caretaker' as const })),
    ],
  }
}

// Rule 36: where the shadowmen turn aside: every Citgo forecourt, and the
// firefly ponds, each as far past its shore as its haven reaches.
export function shadeHavens(
  world: Pick<NonNullable<Valley['world']>, 'havens' | 'ponds'>
): Haven[] {
  return [
    ...world.havens,
    ...world.ponds.map(({ x, z, radius }) => ({ x, z, radius })),
  ]
}

// One step of the valley's shadowmen, its Caretaker and its tunnel shades,
// dt seconds on. Null when there is nothing to step (no world, or no one
// placed in it), and the field is emptied, so the valley stops stepping
// until someone is placed again. `ground` is the valley's
// (heightmap.ts valleyGround) once it has read it: the shadowmen walk it
// and reach a raider only at their own height, and `stairs` its fire
// escapes (heightmap.ts valleyStairs), which take a shadowman down to the
// moat's floor or up to its rim. Mutates shadows.
export function stepShadows(
  valley: Valley,
  shadows: Shadows,
  placed: readonly Placed[],
  rng: Rng,
  {
    now,
    dt,
    calm = false,
    ground = null,
    stairs = [],
  }: {
    now: number
    dt: number
    calm?: boolean
    ground?: HeightAt | null
    stairs?: readonly StairPath[]
  },
  cfg = CONFIG.shadowmen
): ShadowStep | null {
  const world = valley.world
  const raiders = world ? shadowRaiders(valley, shadows, placed, now) : []
  if (!world || raiders.length === 0) {
    Object.assign(shadows, createShadows())
    return null
  }
  // Rule 11: a raider in the Undercroft is the tunnel shades' alone.
  const croft = world.undercroft
  const surface = croft
    ? raiders.filter((r) => !inUndercroft(croft, r, CROFT_MARGIN))
    : raiders
  const crossing = stepShadowmen(
    shadows.field,
    rng,
    {
      dt,
      raiders: surface,
      metres: world.metres,
      havens: shadeHavens(world),
      lairs: world.lairs,
      lurks: world.lurks,
      calm,
      lights: [...headlightsAt(shadows, now), ...trafficAt(shadows, now)],
      ground,
      stairs,
    },
    cfg
  )
  const { struck, lunges, bursts } = crossing
  const keeper = world.maze
    ? stepKeeper(valley, shadows, rng, world.maze, surface, dt)
    : { caretaker: null, burned: null, caught: [], credited: [] }
  const tunnel: TunnelUpdate = croft
    ? stepTunnelShades(shadows.tunnel, rng, { dt, raiders, place: croft, calm })
    : { struck: [], strikers: {}, bursts: [], wounds: [] }
  for (const id of [...keeper.caught, ...tunnel.struck]) {
    if (!struck.includes(id)) struck.push(id)
  }
  const strikers: Record<string, ShadowHit> = {}
  const land = (id: string, by: ShadowHit): void => {
    const was = strikers[id]
    if (!was || CONFIG.damage[by] > CONFIG.damage[was]) strikers[id] = by
  }
  for (const [id, by] of Object.entries(crossing.strikers)) land(id, by)
  for (const id of keeper.caught) land(id, 'caretaker')
  for (const [id, by] of Object.entries(tunnel.strikers)) land(id, by)
  regrace(valley, shadows, raiders, struck, now)
  return {
    message: {
      type: 'shadowmen',
      shadowmen: shadows.field.shadowmen.map((s) => shadowmanWire(s, cfg)),
      lunges,
      // Who burned each is the valley's to know, not the wire's.
      bursts: bursts.map((b) => ({
        id: b.id,
        kind: b.kind,
        x: round(b.x, 2),
        z: round(b.z, 2),
        ...(b.y !== undefined ? { y: round(b.y, 2) } : {}),
        ...(b.wall ? { wall: true as const } : {}),
      })),
      caretaker: keeper.caretaker,
      burned: keeper.burned,
      tunnel: croft ? tunnelWire(shadows.tunnel, croft) : [],
      tunnelBursts: tunnel.bursts.map(tunnelSpot),
      tunnelWounds: tunnel.wounds.map(tunnelSpot),
    },
    struck,
    strikers,
    credited: keeper.credited,
    ...burnCredits(valley, bursts, tunnel.bursts, keeper.credited),
  }
}

// Rule 24: the placed raiders a forecourt makes whole: on foot, below
// whole, and where their last state frame put them inside a haven. One id
// an account.
export function forecourtMends(
  valley: Valley,
  placed: readonly Placed[],
  cfg = CONFIG.shadowmen
): string[] {
  const world = valley.world
  if (!world) return []
  const ids: string[] = []
  const seen = new Set<string>()
  for (const { id, at } of placed) {
    const member = valley.members[id]
    if (!at || !member || seen.has(member.account)) continue
    if (inTheBed(valley, id)) continue
    if (woundsOf(valley.wounds, member.account) <= 0) continue
    if (!inHaven(at, world.havens, cfg.havenRadius)) continue
    seen.add(member.account)
    ids.push(id)
  }
  return ids
}

// Rule 28: the placed raiders standing at a Citgo that is not yet the last
// their account stood at, each with that station: on foot, where their
// last state frame put them. One an account.
export function citgoVisits(
  valley: Valley,
  placed: readonly Placed[]
): { id: string; station: number }[] {
  const world = valley.world
  if (!world) return []
  const visits: { id: string; station: number }[] = []
  const seen = new Set<string>()
  for (const { id, at } of placed) {
    const member = valley.members[id]
    if (!at || !member || seen.has(member.account)) continue
    if (inTheBed(valley, id)) continue
    const station = citgoAt(at, world.havens)
    if (station === null) continue
    seen.add(member.account)
    if (citgosFor(valley, member.account).last === station) continue
    visits.push({ id, station })
  }
  return visits
}

// Rule 28: each raider on foot, out of the bed, standing at a payphone
// their account has not found, by their last state frame; one an account.
export function phoneVisits(
  valley: Valley,
  placed: readonly Placed[]
): { id: string; phone: number }[] {
  const world = valley.world
  if (!world || world.payphones.length === 0) return []
  const finds: { id: string; phone: number }[] = []
  const seen = new Set<string>()
  for (const { id, at } of placed) {
    const member = valley.members[id]
    if (!at || !member || seen.has(member.account)) continue
    if (inTheBed(valley, id)) continue
    const phone = phoneAt(at, world.payphones)
    if (phone === null) continue
    seen.add(member.account)
    if (phonesOf(citgosFor(valley, member.account)).includes(phone)) continue
    finds.push({ id, phone })
  }
  return finds
}

// A dev server's shadowman (or spider) standing still at (x, z), for the
// specs.
export function placeShadowman(
  shadows: Shadows,
  x: number,
  z: number,
  kind: ShadeKind = 'man'
): void {
  placeStill(shadows.field, x, z, kind)
}

// A dev server's Caretaker moved to (x, z) in the world, formed if it was
// burned, with its mind wiped, floating still there until it has someone
// to hunt, for the specs. Nothing without a maze.
export function placeCaretaker(
  valley: Valley,
  shadows: Shadows,
  x: number,
  z: number
): void {
  const place = valley.world?.maze
  if (!place) return
  shadows.caretaker = {
    ...createCaretaker(),
    ...worldToMaze(place, { x, z }),
    held: true,
  }
}
