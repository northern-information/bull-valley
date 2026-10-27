// The shadowmen. They are not fought — they are noticed too late, or held
// in a flashlight's beam until they burst. Each one crosses the bubble that
// follows a raider: in at the spawn ring, past a point near the raider, out
// past the despawn radius, in a straight line at a sprint. Raiders standing
// together share their bubbles, so a group sees a few more, not one bubble
// each. One that passes close to a raider on foot turns and rushes them,
// and a touch is a strike. Citgo forecourts are havens: a shadowman turns
// aside at the lights, as it does at the survey's edge, and nothing can
// touch you inside. None is ever gone in view: one leaves only past every
// bubble, bursting, or striking. A beam held on one for burnSeconds
// bursts it.
//
// Among them cross the shadow spiders, twice a shadowman's height: one
// new arrival in a bubble is a spider now and then, and far more often
// near one of their lairs, the dishes, the castle and the plaza
// (lairs.ts); a beam takes twice as long to burst one,
// and one that bursts breaks into a brood of spiderlings, small and quick,
// that rush whoever is near.
//
// And some keep to one place: the lurkers, one to each lurk the world was
// opened with (industrial.ts: the industrial park's buildings), formed
// there once a raider comes near (CONFIG.shadowmen.lurk), out in the fog,
// drifting slowly round it and rushing whoever comes close like any
// other. They are no one's bubble; one burst forms again a while later.
//
// They walk the ground (the valley's, heightmap.ts valleyGround) and never
// through a wall. A shadowman at the moat's rim or the island's edge turns
// along it (keepOffWalls), and goes down to the floor or up to the rim
// only by a fire escape, after a raider there (hunt). A spider crawls
// straight down or up the wall's face, crossing or hunting (shadowclimb.ts).
// They reach no higher or lower than a body: a raider up a fire escape, on the
// moat's rim over the floor or down on it under the rim is out of reach
// of a shadow at the other height, and is never rushed by it. A beam
// finds one where it stands, so one shone down off the rim burns what
// walks the floor.
//
// Nothing touches at once: one in reach winds up (windupSeconds) and then
// lunges, and the lunge lands only if its raider is still within reach.
// A raider struck is let alone for a little while (sharedworld.ts
// recovering, actions.ts strikeUntil); the one that struck stays.
//
// Pure, no three.js. In the shared valley the server steps the one field
// everyone sees (worker/ValleyDO.ts, sharedworld.ts rule 11) and clients
// draw it (shadowsync.ts). The bodies that show them are in
// src/shadowbodies.ts.

import { CONFIG } from './config.ts'
import { nearLair } from './lairs.ts'
import { range } from './rng.ts'
import {
  alongPath,
  crawl,
  nearestStair,
  startClimb,
  wallBetween,
} from './shadowclimb.ts'
import type { HeightAt, Metres, XZ } from './interfaces.ts'
import type { Lair } from './lairs.ts'
import type { Rng } from './rng.ts'
import type { Climb, StairPath } from './shadowclimb.ts'

export type ShadowmenConfig = typeof CONFIG.shadowmen

// What crosses: a shadowman, a shadow spider (CONFIG.shadowmen.spider), or
// one of the spiderlings a burst spider breaks into
// (CONFIG.shadowmen.spiderling).
export type ShadeKind = 'man' | 'spider' | 'spiderling'

// How a kind crosses, rushes, touches and burns.
function speedRange(kind: ShadeKind, cfg: ShadowmenConfig): [number, number] {
  if (kind === 'spider') return [cfg.spider.speedMin, cfg.spider.speedMax]
  if (kind === 'spiderling') {
    return [cfg.spiderling.speedMin, cfg.spiderling.speedMax]
  }
  return [cfg.speedMin, cfg.speedMax]
}

function rushSpeedOf(kind: ShadeKind, cfg: ShadowmenConfig): number {
  if (kind === 'spider') return cfg.spider.rushSpeed
  if (kind === 'spiderling') return cfg.spiderling.rushSpeed
  return cfg.rushSpeed
}

// How close a raider must come for it to turn and rush them.
function rushRadiusOf(kind: ShadeKind, cfg: ShadowmenConfig): number {
  return kind === 'spiderling' ? cfg.spiderling.rushRadius : cfg.rushRadius
}

function touchRadiusOf(kind: ShadeKind, cfg: ShadowmenConfig): number {
  if (kind === 'spider') return cfg.spider.touchRadius
  if (kind === 'spiderling') return cfg.spiderling.touchRadius
  return cfg.touchRadius
}

// Seconds in a beam until it bursts.
// How big one bursts (shadowburst.ts), against a shadowman's burst.
export function burstScaleOf(kind: ShadeKind, cfg: ShadowmenConfig): number {
  if (kind === 'spider') return cfg.spider.burstScale
  if (kind === 'spiderling') return cfg.spiderling.burstScale
  return 1
}

export function burnSecondsOf(kind: ShadeKind, cfg: ShadowmenConfig): number {
  if (kind === 'spider') return cfg.burnSeconds * cfg.spider.burnScale
  if (kind === 'spiderling') return cfg.spiderling.burnSeconds
  return cfg.burnSeconds
}

// Where over the ground a beam must find it.
export function aimHeightOf(kind: ShadeKind, cfg: ShadowmenConfig): number {
  if (kind === 'spider') return cfg.spider.aimHeight
  if (kind === 'spiderling') return cfg.spiderling.aimHeight
  return cfg.chestHeight
}

// Whether a shadow standing at `s.y` reaches feet at `r.y`: no further
// under it than `vertical.under`, no further over it than its aim and
// `vertical.over`. Where either height is not known, it reaches.
export function reachesUp(
  s: { kind: ShadeKind; y?: number },
  r: { y?: number },
  cfg: ShadowmenConfig
): boolean {
  if (s.y === undefined || r.y === undefined) return true
  const dy = r.y - s.y
  return (
    dy >= -cfg.vertical.under &&
    dy <= aimHeightOf(s.kind, cfg) + cfg.vertical.over
  )
}

// One shadowman mid-crossing, or rushing a raider.
export interface Shadowman {
  // Unique in its field, never reused: bodies and bursts follow it.
  id: number
  kind: ShadeKind
  x: number
  z: number
  // The height of the ground it stands on, where the valley knows it.
  y?: number
  // Unit heading.
  dirX: number
  dirZ: number
  // Metres per second.
  speed: number
  // The raider it is rushing, or null while it crosses.
  target: string | null
  // Seconds it has been held in a beam, running back down out of it.
  burn: number
  // Seconds into its windup on the raider it rushes, 0 while it is not
  // winding up; it lunges at CONFIG.shadowmen.windupSeconds.
  windup: number
  // Stood somewhere by a spec (placeStill), not crossing.
  placed?: boolean
  // A lurker: the index of the lurk it keeps to (ShadowmenStep.lurks).
  lurk?: number
  // The raider it is after at the other height (down on the moat's floor
  // under the rim it walks, or up on the rim over the floor), out of its
  // reach: a shadowman makes for a fire escape, a spider straight for them
  // and up or down the wall between (shadowclimb.ts).
  hunt?: string
  // A shadowman's fire escape (the step's `stairs`, by index), going down
  // or up it: making for its end on his own level (`on` false, `waited`
  // seconds so far), then on it, `along` metres from that end.
  stair?: {
    path: number
    down: boolean
    on: boolean
    along: number
    waited: number
  }
  // A spider on a wall's face, crawling up or down it (shadowclimb.ts).
  climb?: Climb
}

// Spiders and spiderlings crawl walls; shadowmen take the stairs.
const isSpider = (kind: ShadeKind): boolean =>
  kind === 'spider' || kind === 'spiderling'

export interface XYZ {
  x: number
  y: number
  z: number
}

// A flashlight's beam: a cone from the eye along dir (a unit vector), range
// metres long, halfAngle radians off its axis. A shadowman in it is taken
// to stand at floor, the holder's own feet, since the valley has no
// terrain to look its ground up on.
export interface Beam {
  origin: XYZ
  dir: XYZ
  range: number
  halfAngle: number
  floor: number
}

// One raider the shadowmen cross around. vulnerable: on foot and not
// coming to from a strike; a rush also needs them out of every haven.
export interface Raider {
  id: string
  x: number
  z: number
  // Their feet's height, from their last state frame.
  y?: number
  vulnerable: boolean
  // Their flashlight, while it is up and on.
  beam: Beam | null
  // A lit torch in their hand (held.ts): a light all round them, close in
  // and weaker than a beam (CONFIG.torch).
  torch?: boolean
}

// Whether a raider's torch reaches a point: within CONFIG.torch
// lightRadius of them, along the ground and up (where their feet are
// known).
export function inTorchLight(
  r: Raider,
  p: { x: number; z: number; y?: number },
  radius: number = CONFIG.torch.lightRadius
): boolean {
  if (!r.torch) return false
  if (r.y !== undefined && p.y !== undefined && Math.abs(p.y - r.y) > radius) {
    return false
  }
  return Math.hypot(p.x - r.x, p.z - r.z) <= radius
}

export interface ShadowmenField {
  shadowmen: Shadowman[]
  nextId: number
  // Each raider's seconds until another may spawn round them. A raider
  // missing here is new, and their bubble is filled at once.
  cooldowns: Record<string, number>
  // Each lurk's seconds until its lurker may form again, after a burst.
  lurkWaits?: Record<number, number>
}

export interface ShadowmenStep {
  dt: number
  raiders: readonly Raider[]
  metres: Metres
  // Citgo forecourts and the firefly pond: shadowmen never enter, and a
  // raider is safe inside.
  havens: readonly Haven[]
  // A dev server's quiet valley, for the specs: the crossings never rush
  // anyone, and only a shadowman a spec placed does.
  calm?: boolean
  // Beams no raider holds (Marx's headlights): they burn like any other,
  // but credit no one.
  lights?: readonly Beam[]
  // The spiders' lairs (lairs.ts): they come far more often near one.
  // None, and they come at their plain chance.
  lairs?: readonly Lair[]
  // Where the lurkers keep (industrial.ts lurks). None, and none lurk.
  lurks?: readonly XZ[]
  // The ground they walk (heightmap.ts valleyGround). None, and they have
  // no height: every raider is within reach up and down, and a beam finds
  // one at its holder's feet.
  ground?: HeightAt | null
  // The moat's fire escapes, top to foot (heightmap.ts valleyStairs): the
  // way a shadowman goes down after a raider on the floor, or up after one
  // on the rim. None, and he never goes after one at the other height.
  stairs?: readonly StairPath[]
}

// Where one burst, by which shadowman, and what it was.
export interface Burst {
  id: number
  kind: ShadeKind
  x: number
  z: number
  // The ground it stood on, where the valley knew it, or the height it
  // clung to a wall at (`wall`, a spider crawling one).
  y?: number
  wall?: true
}

// A burst as the step saw it: also the raiders whose beams were on the
// shadowman as it burst (sharedworld.ts rule 16). The valley keeps them
// to itself; only the Burst goes on the wire.
interface BurstBy extends Burst {
  by: string[]
}

export interface ShadowmenUpdate {
  // The raiders touched this step, and by what kind (the last to land).
  struck: string[]
  strikers: Record<string, ShadeKind>
  // The shadowmen that lunged this step, whether the lunge landed or not.
  lunges: number[]
  bursts: BurstBy[]
}

export function inBounds(p: XZ, metres: Metres, inset: number): boolean {
  return (
    Math.abs(p.x) <= metres.width / 2 - inset &&
    Math.abs(p.z) <= metres.height / 2 - inset
  )
}

// A haven: a Citgo forecourt, which reaches CONFIG.shadowmen.havenRadius,
// or the firefly pond (fishing.ts), which reaches its own `radius`.
export interface Haven extends XZ {
  radius?: number
}

export function inHaven(
  p: XZ,
  havens: readonly Haven[],
  radius: number
): boolean {
  return havens.some(
    (h) => Math.hypot(h.x - p.x, h.z - p.z) < (h.radius ?? radius)
  )
}

// Turns s aside where its step took it into a haven or past the survey's
// inset: back to where it was, its heading reflected off the haven's rim or
// the edge, so it walks along and away instead of in. Mutates s.
function turnAside(
  s: Shadowman,
  from: XZ,
  metres: Metres,
  havens: readonly Haven[],
  cfg: ShadowmenConfig
): void {
  const mx = metres.width / 2 - cfg.edgeInset
  const mz = metres.height / 2 - cfg.edgeInset
  let turned = false
  if (Math.abs(s.x) > mx && s.x * s.dirX > 0) {
    s.dirX = -s.dirX
    turned = true
  }
  if (Math.abs(s.z) > mz && s.z * s.dirZ > 0) {
    s.dirZ = -s.dirZ
    turned = true
  }
  for (const h of havens) {
    const nx = s.x - h.x
    const nz = s.z - h.z
    const d = Math.hypot(nx, nz)
    if (d >= (h.radius ?? cfg.havenRadius) || d === 0) continue
    const dot = (s.dirX * nx + s.dirZ * nz) / d
    if (dot >= 0) continue
    s.dirX -= (2 * dot * nx) / d
    s.dirZ -= (2 * dot * nz) / d
    turned = true
  }
  if (turned) {
    s.x = from.x
    s.z = from.z
  }
}

// The turns a shadow stopped at a wall tries, the least first, either way,
// out to straight back.
const WALL_TURNS = [1, 2, 3, 4, 5]
  .flatMap((k) => [k, -k].map((side) => (side * Math.PI) / 6))
  .concat(Math.PI)

// Keeps s off the walls (cfg.wall): where its step from `from` took it up
// or down more than a wall, over the moat's rim or the island's edge, it
// takes the least turn whose step of the same length stays level with
// where it was, and keeps that heading, so it walks along the wall and
// away instead of through it. Boxed in every way, it stays where it was.
// Mutates s.
function keepOffWalls(
  s: Shadowman,
  from: XZ,
  ground: HeightAt,
  cfg: ShadowmenConfig
): void {
  const level = ground(from.x, from.z)
  const levelAt = (x: number, z: number) =>
    Math.abs(ground(x, z) - level) <= cfg.wall
  if (levelAt(s.x, s.z)) return
  const step = Math.hypot(s.x - from.x, s.z - from.z)
  for (const turn of WALL_TURNS) {
    const cos = Math.cos(turn)
    const sin = Math.sin(turn)
    const dirX = s.dirX * cos - s.dirZ * sin
    const dirZ = s.dirX * sin + s.dirZ * cos
    const x = from.x + dirX * step
    const z = from.z + dirZ * step
    if (!levelAt(x, z)) continue
    s.dirX = dirX
    s.dirZ = dirZ
    s.x = x
    s.z = z
    return
  }
  s.x = from.x
  s.z = from.z
}

// Whether p is inside the beam's cone: no further than its range from the
// eye, and no more than halfAngle off its axis.
export function inBeam(beam: Beam, p: XYZ): boolean {
  const dx = p.x - beam.origin.x
  const dy = p.y - beam.origin.y
  const dz = p.z - beam.origin.z
  const d = Math.hypot(dx, dy, dz)
  if (d > beam.range) return false
  if (d === 0) return true
  const along = (dx * beam.dir.x + dy * beam.dir.y + dz * beam.dir.z) / d
  return along >= Math.cos(beam.halfAngle)
}

// A raider's beam from where they stand and look: feet at (x, y, z), the
// eye over them by pose, yaw 0 facing -Z, pitch up positive (player.ts).
export function beamFrom(
  { x, y, z }: XYZ,
  yaw: number,
  pitch: number,
  crouching: boolean,
  cfg = CONFIG
): Beam {
  const eye = crouching ? cfg.player.crouchEyeHeight : cfg.player.eyeHeight
  const flat = Math.cos(pitch)
  return {
    origin: { x, y: y + eye, z },
    dir: {
      x: -Math.sin(yaw) * flat,
      y: Math.sin(pitch),
      z: -Math.cos(yaw) * flat,
    },
    range: cfg.flashlight.range,
    halfAngle: cfg.flashlight.halfAngle,
    floor: y,
  }
}

// Where Marx's truck stands and faces: its middle on the ground at
// (x, y, z), heading radians from +Z toward +X (truck.ts).
export interface TruckPose {
  x: number
  y: number
  z: number
  heading: number
}

// The last word a client gave the valley on the headlights, and when
// (local ms).
export interface HeadlightsSent {
  pose: TruckPose
  at: number
}

// Whether a client near the truck owes the valley a new word on where
// its headlights stand: when they moved since the last word (so a drive
// that ends sends where it stopped), while the truck drives, and once in
// half the valley's staleMs while it stands, since the valley forgets a
// word older than that and a parked truck's beam must still burn.
export function headlightsDue(
  last: HeadlightsSent | null,
  pose: TruckPose,
  moving: boolean,
  now: number,
  cfg = CONFIG.truck.headlights
): boolean {
  if (!last || moving) return true
  if (now - last.at >= cfg.staleMs / 2) return true
  const was = last.pose
  return (
    Math.abs(was.x - pose.x) > 0.01 ||
    Math.abs(was.y - pose.y) > 0.01 ||
    Math.abs(was.z - pose.z) > 0.01 ||
    Math.abs(was.heading - pose.heading) > 0.01
  )
}

// The truck's headlights as a beam: from the lamps at its nose, level
// down the way it faces.
export function headlightBeam(
  { x, y, z, heading }: TruckPose,
  cfg = CONFIG.truck.headlights
): Beam {
  const dx = Math.sin(heading)
  const dz = Math.cos(heading)
  return {
    origin: { x: x + dx * cfg.nose, y: y + cfg.height, z: z + dz * cfg.nose },
    dir: { x: dx, y: 0, z: dz },
    range: cfg.range,
    halfAngle: cfg.halfAngle,
    floor: y,
  }
}

// A vehicle's taillights as a beam: from the lamps `tail` metres along
// its heading (behind its middle, so negative) and `height` up, back down
// the way it came, shorter and wider than the headlights'.
export function taillightBeam(
  { x, y, z, heading }: TruckPose,
  tail: number,
  height: number,
  cfg = CONFIG.traffic.tail
): Beam {
  const dx = Math.sin(heading)
  const dz = Math.cos(heading)
  return {
    origin: { x: x + dx * tail, y: y + height, z: z + dz * tail },
    dir: { x: -dx, y: 0, z: -dz },
    range: cfg.range,
    halfAngle: cfg.halfAngle,
    floor: y,
  }
}

// Ring points to try before settling for a clamped one.
const SPAWN_TRIES = 8

// One shadowman on the spawn ring round `around`, heading for a point
// within crossRadius of it, advanced preroll metres along that heading.
export function spawnShadowman(
  rng: Rng,
  id: number,
  around: XZ,
  metres: Metres,
  havens: readonly Haven[],
  cfg: ShadowmenConfig,
  preroll = 0,
  kind: ShadeKind = 'man'
): Shadowman {
  // Where it is going: uniform over the crossing disc.
  const r = cfg.crossRadius * Math.sqrt(rng())
  const a = rng() * Math.PI * 2
  const tx = around.x + Math.cos(a) * r
  const tz = around.z + Math.sin(a) * r

  // Where it comes in: a ring point clear of the survey edge and the
  // forecourts. Near the edge every try can fail, so the last one is clamped
  // inside the inset.
  let x = around.x
  let z = around.z
  for (let i = 0; i < SPAWN_TRIES; i++) {
    const theta = rng() * Math.PI * 2
    x = around.x + Math.cos(theta) * cfg.spawnRadius
    z = around.z + Math.sin(theta) * cfg.spawnRadius
    if (
      inBounds({ x, z }, metres, cfg.edgeInset) &&
      !inHaven({ x, z }, havens, cfg.havenRadius)
    )
      break
  }
  const mx = metres.width / 2 - cfg.edgeInset
  const mz = metres.height / 2 - cfg.edgeInset
  x = Math.max(-mx, Math.min(mx, x))
  z = Math.max(-mz, Math.min(mz, z))

  const dx = tx - x
  const dz = tz - z
  const len = Math.hypot(dx, dz) || 1
  const dirX = dx / len
  const dirZ = dz / len
  const [slow, fast] = speedRange(kind, cfg)
  return {
    id,
    kind,
    x: x + dirX * preroll,
    z: z + dirZ * preroll,
    dirX,
    dirZ,
    speed: range(rng, slow, fast),
    target: null,
    burn: 0,
    windup: 0,
  }
}

// Whether the next arrival round `raider`, coming in at `at`, is a spider:
// by the spider's chance, or its lair chance when either is near one of
// its lairs, while the bubble holds fewer than maxPerBubble.
function spiderComes(
  rng: Rng,
  field: ShadowmenField,
  raider: XZ,
  at: XZ,
  lairs: readonly Lair[],
  cfg: ShadowmenConfig
): boolean {
  const roll = rng()
  const { spider } = cfg
  let spiders = 0
  for (const s of field.shadowmen) {
    if (
      s.kind === 'spider' &&
      Math.hypot(s.x - raider.x, s.z - raider.z) <= cfg.despawnRadius
    ) {
      spiders++
    }
  }
  if (spiders >= spider.maxPerBubble) return false
  const lured =
    nearLair(lairs, raider, spider.lairReach) ||
    nearLair(lairs, at, spider.lairReach)
  return roll < (lured ? spider.lairChance : spider.chance)
}

// One new arrival round `raider`: a shadowman, or now and then a spider.
function arrival(
  rng: Rng,
  field: ShadowmenField,
  id: number,
  raider: XZ,
  metres: Metres,
  havens: readonly Haven[],
  lairs: readonly Lair[],
  cfg: ShadowmenConfig
): Shadowman {
  const fresh = spawnShadowman(rng, id, raider, metres, havens, cfg)
  if (!spiderComes(rng, field, raider, fresh, lairs, cfg)) return fresh
  const [slow, fast] = speedRange('spider', cfg)
  return { ...fresh, kind: 'spider', speed: range(rng, slow, fast) }
}

// The spiderlings a spider bursting at `at` breaks into: brood.min to
// brood.max of them, scattered round where it burst, each heading out from
// it, with ids from field.nextId. They rush like any other shadow. On the
// `ground`, one scattered past a wall (over the moat's rim, say) breaks
// out where the spider burst instead, on its side of the wall.
function broodOf(
  field: ShadowmenField,
  rng: Rng,
  at: XZ,
  ground: HeightAt | null,
  cfg: ShadowmenConfig
): Shadowman[] {
  const { brood, scatter } = cfg.spiderling
  const n = brood.min + Math.floor(rng() * (brood.max - brood.min + 1))
  const [slow, fast] = speedRange('spiderling', cfg)
  const out: Shadowman[] = []
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + rng() * 0.5
    const r = scatter * (0.4 + 0.6 * rng())
    let x = at.x + Math.cos(a) * r
    let z = at.z + Math.sin(a) * r
    if (ground && Math.abs(ground(x, z) - ground(at.x, at.z)) > cfg.wall) {
      x = at.x
      z = at.z
    }
    out.push({
      id: field.nextId++,
      kind: 'spiderling',
      x,
      z,
      dirX: Math.cos(a),
      dirZ: Math.sin(a),
      speed: range(rng, slow, fast),
      target: null,
      burn: 0,
      windup: 0,
    })
  }
  return out
}

export function createShadowmen(): ShadowmenField {
  return { shadowmen: [], nextId: 1, cooldowns: {} }
}

// How many shadowmen are inside the despawn radius of p: the bubble a
// raider there already has.
function near(field: ShadowmenField, p: XZ, cfg: ShadowmenConfig): number {
  let n = 0
  for (const s of field.shadowmen) {
    if (s.lurk !== undefined) continue
    if (Math.hypot(s.x - p.x, s.z - p.z) <= cfg.despawnRadius) n++
  }
  return n
}

// A new raider's bubble filled at once, each shadowman already somewhere
// along its crossing, so the first ones seen are not one wave arriving at the
// rim together. A raider who arrives among others already has theirs.
function fill(
  field: ShadowmenField,
  rng: Rng,
  raider: XZ,
  metres: Metres,
  havens: readonly Haven[],
  lairs: readonly Lair[],
  cfg: ShadowmenConfig
): void {
  for (let n = near(field, raider, cfg); n < cfg.count; n++) {
    const fresh = arrival(rng, field, 0, raider, metres, havens, lairs, cfg)
    // How far along its heading the crossing stays inside the spawn ring:
    // the distance to its closest approach, plus the half-chord beyond it.
    const px = raider.x - fresh.x
    const pz = raider.z - fresh.z
    const along = px * fresh.dirX + pz * fresh.dirZ
    const across = Math.abs(px * fresh.dirZ - pz * fresh.dirX)
    const half = Math.sqrt(Math.max(0, cfg.spawnRadius ** 2 - across ** 2))
    const preroll = range(rng, 0, Math.max(0, along + half))
    field.shadowmen.push({
      ...fresh,
      id: field.nextId++,
      x: fresh.x + fresh.dirX * preroll,
      z: fresh.z + fresh.dirZ * preroll,
    })
  }
}

// Advance every shadowman, burst the ones held long enough in a beam,
// strike the raiders they touch, turn aside the ones at a haven or the
// edge, drop the ones that have left every bubble, and fill at most one place in each raider's bubble. Mutates
// field.
export function stepShadowmen(
  field: ShadowmenField,
  rng: Rng,
  {
    dt,
    raiders,
    metres,
    havens,
    calm = false,
    lairs = [],
    lurks = [],
    lights = [],
    ground = null,
    stairs = [],
  }: ShadowmenStep,
  cfg: ShadowmenConfig = CONFIG.shadowmen
): ShadowmenUpdate {
  const struck: string[] = []
  const strikers: Record<string, ShadeKind> = {}
  const lunges: number[] = []
  const bursts: BurstBy[] = []
  const brood: Shadowman[] = []

  // New raiders get a full bubble; departed ones lose their cooldown.
  const cooldowns: Record<string, number> = {}
  for (const raider of raiders) {
    if (!(raider.id in field.cooldowns)) {
      fill(field, rng, raider, metres, havens, lairs, cfg)
    }
    cooldowns[raider.id] = field.cooldowns[raider.id] ?? 0
  }
  field.cooldowns = cooldowns

  // Inside a haven nothing rushes you, and a rush already on breaks off.
  const exposed = raiders.filter(
    (r) => r.vulnerable && !inHaven(r, havens, cfg.havenRadius)
  )
  const lit = raiders.filter((r) => r.beam !== null)
  const torched = raiders.filter((r) => r.torch)

  // On a wall or a fire escape it is at its own height, not the ground's.
  const stand = (s: Shadowman): void => {
    if (ground && !s.climb && !s.stair?.on) s.y = ground(s.x, s.z)
  }
  const headFor = (s: Shadowman, p: XZ): void => {
    const d = Math.hypot(p.x - s.x, p.z - s.z)
    if (d > 0) {
      s.dirX = (p.x - s.x) / d
      s.dirZ = (p.z - s.z) / d
    }
  }
  // Gives up the raider at the other height, and the stair it made for,
  // but never a stair it is already on.
  const unhunt = (s: Shadowman): void => {
    delete s.hunt
    if (!s.stair?.on) delete s.stair
  }

  // Goes after a raider at the other height, out of reach: the nearest
  // exposed one within climb.seek. A spider makes straight for them, a
  // shadowman for the nearest fire escape that takes him their way.
  const hunt = (s: Shadowman): void => {
    if (!ground || s.y === undefined || s.stair?.on) return
    const y = s.y
    let quarry = s.hunt ? exposed.find((r) => r.id === s.hunt) : undefined
    if (
      s.hunt &&
      (!quarry ||
        reachesUp(s, quarry, cfg) ||
        Math.hypot(quarry.x - s.x, quarry.z - s.z) > cfg.climb.seek)
    ) {
      unhunt(s)
      quarry = undefined
    }
    if (!s.hunt) {
      if (calm && !s.placed) return
      let best = cfg.climb.seek
      for (const r of exposed) {
        if (r.y === undefined || reachesUp(s, r, cfg)) continue
        const d = Math.hypot(r.x - s.x, r.z - s.z)
        if (d >= best) continue
        if (!isSpider(s.kind)) {
          const way = nearestStair(stairs, { x: s.x, z: s.z, y }, r.y, cfg.wall)
          if (!way) continue
          s.stair = {
            path: way.path,
            down: way.down,
            on: false,
            along: 0,
            waited: 0,
          }
        }
        best = d
        quarry = r
      }
      if (!quarry) return
      s.hunt = quarry.id
      s.speed = rushSpeedOf(s.kind, cfg)
    }
    if (!quarry) return
    if (isSpider(s.kind) || !s.stair) {
      headFor(s, quarry)
      return
    }
    // Making for the stair's end on his own level; past his patience he
    // gives it up.
    const path = stairs[s.stair.path]
    s.stair.waited += dt
    if (!path || s.stair.waited > cfg.climb.patience) {
      unhunt(s)
      return
    }
    const end = s.stair.down ? path[0] : path[path.length - 1]
    if (Math.hypot(end.x - s.x, end.z - s.z) <= s.speed * dt) {
      s.x = end.x
      s.z = end.z
      s.y = end.y
      s.stair.on = true
      s.stair.along = 0
      return
    }
    headFor(s, end)
  }

  // A shadowman on a fire escape treads it at his pace, flight by flight,
  // and steps off its other end onto that level's ground, facing whoever
  // he went after.
  const descend = (s: Shadowman): void => {
    const stair = s.stair
    const path = stair ? stairs[stair.path] : undefined
    if (!stair || !path) {
      delete s.stair
      stand(s)
      return
    }
    stair.along += s.speed * dt
    const p = alongPath(path, stair.along, !stair.down)
    headFor(s, p)
    s.x = p.x
    s.z = p.z
    s.y = p.y
    if (!p.end) return
    delete s.stair
    const quarry = s.hunt ? exposed.find((r) => r.id === s.hunt) : undefined
    delete s.hunt
    stand(s)
    if (quarry) headFor(s, quarry)
  }

  // A step across the ground: aside at a haven or the survey's edge, and
  // at a wall, along it for a shadowman or onto its face for a spider.
  const stride = (s: Shadowman): void => {
    const from = { x: s.x, z: s.z }
    const fromY = s.y
    s.x += s.dirX * s.speed * dt
    s.z += s.dirZ * s.speed * dt
    turnAside(s, from, metres, havens, cfg)
    if (ground && isSpider(s.kind)) {
      const face = wallBetween(ground, from, s, cfg.wall)
      if (face) {
        const { at, climb } = startClimb(face, fromY ?? ground(from.x, from.z))
        s.x = at.x
        s.z = at.z
        s.y = fromY
        s.climb = climb
        return
      }
    } else if (ground) {
      keepOffWalls(s, from, ground, cfg)
    }
    stand(s)
  }

  // A lurker going nowhere: on at its drift, turning now and then, and
  // back toward its lurk whenever it heads away from it past `roam`.
  const drift = (s: Shadowman): void => {
    const home = s.lurk === undefined ? undefined : lurks[s.lurk]
    if (!home || s.target || s.hunt) return
    const { roam, turnSeconds } = cfg.lurk
    const hx = home.x - s.x
    const hz = home.z - s.z
    let turn: number | null = null
    if (Math.hypot(hx, hz) > roam) {
      if (hx * s.dirX + hz * s.dirZ < 0) {
        turn = Math.atan2(hz, hx) + range(rng, -0.6, 0.6)
      }
    } else if (rng() < dt / turnSeconds) {
      turn = rng() * Math.PI * 2
    }
    if (turn === null) return
    s.dirX = Math.cos(turn)
    s.dirZ = Math.sin(turn)
  }

  const waits: Record<number, number> = field.lurkWaits ?? {}
  field.lurkWaits = waits
  const kept: Shadowman[] = []
  for (const s of field.shadowmen) {
    stand(s)
    if (s.climb) {
      // On the wall it only crawls, up or down, at its pace, and steps off
      // onto the other side's ground when it gets there.
      s.target = null
      s.windup = 0
      const { y, there } = crawl(s.y ?? s.climb.toY, s.climb.toY, s.speed * dt)
      s.y = y
      if (there) {
        s.x = s.climb.off.x
        s.z = s.climb.off.z
        delete s.climb
        stand(s)
      }
    } else {
      let target = s.target
        ? exposed.find((r) => r.id === s.target && reachesUp(s, r, cfg))
        : undefined
      if (s.target && !target) {
        // Breaks off: keeps its heading, back to a crossing pace (a
        // lurker to its drift, and back to its lurk).
        s.target = null
        const [slow, fast] =
          s.lurk !== undefined
            ? [cfg.lurk.speedMin, cfg.lurk.speedMax]
            : speedRange(s.kind, cfg)
        s.speed = range(rng, slow, fast)
      }
      if (!s.target && (!calm || s.placed)) {
        // The nearest exposed raider inside the rush radius.
        let best = rushRadiusOf(s.kind, cfg)
        for (const r of exposed) {
          if (!reachesUp(s, r, cfg)) continue
          const d = Math.hypot(r.x - s.x, r.z - s.z)
          if (d < best) {
            best = d
            target = r
          }
        }
        if (target) {
          s.target = target.id
          s.speed = rushSpeedOf(s.kind, cfg)
        }
      }
      if (target) {
        headFor(s, target)
        unhunt(s)
      } else {
        hunt(s)
      }

      // Only a rush can touch, and a rush only runs while its raider is
      // exposed. In reach it stands and winds up, then lunges; the lunge
      // lands if its raider is still within reach (reachScale over its
      // touch), and it stays either way.
      const reach = touchRadiusOf(s.kind, cfg)
      if (
        target &&
        (s.windup > 0 || Math.hypot(target.x - s.x, target.z - s.z) < reach)
      ) {
        s.windup += dt
        if (s.windup >= cfg.windupSeconds) {
          s.windup = 0
          lunges.push(s.id)
          const d = Math.hypot(target.x - s.x, target.z - s.z)
          if (d < reach * cfg.reachScale && reachesUp(s, target, cfg)) {
            struck.push(target.id)
            strikers[target.id] = s.kind
          }
        }
      } else {
        s.windup = 0
        if (s.stair?.on) descend(s)
        else {
          drift(s)
          stride(s)
        }
      }
    }
    let nearest = Infinity
    for (const r of raiders) {
      nearest = Math.min(nearest, Math.hypot(r.x - s.x, r.z - s.z))
    }
    if (nearest > cfg.despawnRadius) continue
    // Where a beam finds it: over the ground it stands on, or over the
    // beam's own floor where that is not known.
    const aim = aimHeightOf(s.kind, cfg)
    const body = (beam: Beam) => ({
      x: s.x,
      y: (s.y ?? beam.floor) + aim,
      z: s.z,
    })
    const beamed = lit
      .filter(({ beam }) => (beam ? inBeam(beam, body(beam)) : false))
      .map((r) => r.id)
    // A torch held close burns it too, slower (CONFIG.torch).
    const burning = torched.filter((r) => inTorchLight(r, s)).map((r) => r.id)
    const by = [...new Set([...beamed, ...burning])]
    const held =
      beamed.length > 0 || lights.some((beam) => inBeam(beam, body(beam)))
    const rate = held ? 1 : burning.length > 0 ? CONFIG.torch.burnRate : 0
    s.burn = rate > 0 ? s.burn + dt * rate : Math.max(0, s.burn - dt)
    if (s.burn >= burnSecondsOf(s.kind, cfg)) {
      bursts.push({
        id: s.id,
        kind: s.kind,
        x: s.x,
        z: s.z,
        ...(s.y !== undefined ? { y: s.y } : {}),
        ...(s.climb ? { wall: true as const } : {}),
        by,
      })
      if (s.kind === 'spider')
        brood.push(...broodOf(field, rng, s, ground, cfg))
      if (s.lurk !== undefined) waits[s.lurk] = cfg.lurk.respawnSeconds
      continue
    }
    kept.push(s)
  }
  field.shadowmen = [...kept, ...brood]

  for (const raider of raiders) {
    const cooldown = Math.max(0, field.cooldowns[raider.id] - dt)
    field.cooldowns[raider.id] = cooldown
    if (cooldown > 0 || near(field, raider, cfg) >= cfg.count) continue
    field.shadowmen.push(
      arrival(rng, field, field.nextId++, raider, metres, havens, lairs, cfg)
    )
    field.cooldowns[raider.id] = cfg.spawnInterval
  }
  formLurkers(field, rng, raiders, lurks, dt, cfg)
  // Every one on the ground, the brood and the new arrivals among them.
  for (const s of field.shadowmen) stand(s)

  return { struck, strikers, lunges, bursts }
}

// Each lurk without its lurker forms one, once its wait after a burst is
// out, while a raider is within `wake` of it and none within `clear`: in
// the fog, never before anyone's eyes. Mutates field.
function formLurkers(
  field: ShadowmenField,
  rng: Rng,
  raiders: readonly Raider[],
  lurks: readonly XZ[],
  dt: number,
  cfg: ShadowmenConfig
): void {
  if (lurks.length === 0) return
  const waits = field.lurkWaits ?? {}
  field.lurkWaits = waits
  const kept = new Set<number>()
  for (const s of field.shadowmen) {
    if (s.lurk !== undefined) kept.add(s.lurk)
  }
  const { wake, clear, speedMin, speedMax } = cfg.lurk
  lurks.forEach((home, i) => {
    const wait = Math.max(0, (waits[i] ?? 0) - dt)
    if (wait > 0) waits[i] = wait
    else delete waits[i]
    if (wait > 0 || kept.has(i)) return
    let nearest = Infinity
    for (const r of raiders) {
      nearest = Math.min(nearest, Math.hypot(r.x - home.x, r.z - home.z))
    }
    if (nearest > wake || nearest < clear) return
    const a = rng() * Math.PI * 2
    field.shadowmen.push({
      id: field.nextId++,
      kind: 'man',
      x: home.x,
      z: home.z,
      dirX: Math.cos(a),
      dirZ: Math.sin(a),
      speed: range(rng, speedMin, speedMax),
      target: null,
      burn: 0,
      windup: 0,
      lurk: i,
    })
  })
}

// A shadowman (or a spider, or a spiderling) standing still at (x, z), for
// the specs (a dev frame).
export function placeStill(
  field: ShadowmenField,
  x: number,
  z: number,
  kind: ShadeKind = 'man'
): void {
  field.shadowmen.push({
    id: field.nextId++,
    kind,
    x,
    z,
    dirX: 0,
    dirZ: 1,
    speed: 0,
    target: null,
    burn: 0,
    windup: 0,
    placed: true,
  })
}
