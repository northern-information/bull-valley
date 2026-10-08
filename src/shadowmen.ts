// The shadowmen. They are not fought — they are noticed too late, or held
// in a flashlight's beam until they burst. Each one crosses the bubble that
// follows a raider: in at the spawn ring, past a point near the raider, out
// past the despawn radius, in a straight line at a sprint. Raiders standing
// together share their bubbles, so a group sees a few more, not one bubble
// each. One that passes close to a raider on foot turns and rushes them,
// and a touch is a strike. Citgo forecourts are havens: a shadowman
// vanishes at the lights, and nothing can touch you inside. A beam held on
// one for burnSeconds bursts it.
//
// Pure, no three.js. In the shared valley the server steps the one field
// everyone sees (worker/ValleyDO.ts, sharedworld.ts rule 11) and clients
// draw it (shadowsync.ts); played alone, the client steps its own field
// with one raider. The silhouette cards that show them are in
// src/shadowcards.ts.

import { CONFIG } from './config.ts'
import { compassBearing } from './coords.ts'
import { range } from './rng.ts'
import type { Metres, ScopeContact, XZ } from './interfaces.ts'
import type { Rng } from './rng.ts'

export type ShadowmenConfig = typeof CONFIG.shadowmen

// One shadowman mid-crossing, or rushing a raider.
export interface Shadowman {
  // Unique in its field, never reused: cards and bursts follow it.
  id: number
  x: number
  z: number
  // Unit heading.
  dirX: number
  dirZ: number
  // Metres per second.
  speed: number
  // The raider it is rushing, or null while it crosses.
  target: string | null
  // Seconds it has been held in a beam, running back down out of it.
  burn: number
  // Stood somewhere by a spec (placeStill), not crossing.
  placed?: boolean
}

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
  vulnerable: boolean
  // Their flashlight, while it is up and on.
  beam: Beam | null
}

export interface ShadowmenField {
  shadowmen: Shadowman[]
  nextId: number
  // Each raider's seconds until another may spawn round them. A raider
  // missing here is new, and their bubble is filled at once.
  cooldowns: Record<string, number>
}

export interface ShadowmenStep {
  dt: number
  raiders: readonly Raider[]
  metres: Metres
  // Citgo forecourts: shadowmen never enter, and a raider is safe inside.
  havens: readonly XZ[]
  // A dev server's quiet valley, for the specs: the crossings never rush
  // anyone, and only a shadowman a spec placed does.
  calm?: boolean
}

// Where one burst, by which shadowman.
export interface Burst {
  id: number
  x: number
  z: number
}

// A burst as the step saw it: also the raiders whose beams were on the
// shadowman as it burst (sharedworld.ts rule 16). The valley keeps them
// to itself; only the Burst goes on the wire.
export interface BurstBy extends Burst {
  by: string[]
}

export interface ShadowmenUpdate {
  // The raiders touched this step.
  struck: string[]
  bursts: BurstBy[]
}

export function inBounds(p: XZ, metres: Metres, inset: number): boolean {
  return (
    Math.abs(p.x) <= metres.width / 2 - inset &&
    Math.abs(p.z) <= metres.height / 2 - inset
  )
}

export function inHaven(p: XZ, havens: readonly XZ[], radius: number): boolean {
  return havens.some((h) => Math.hypot(h.x - p.x, h.z - p.z) < radius)
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

// Ring points to try before settling for a clamped one.
const SPAWN_TRIES = 8

// One shadowman on the spawn ring round `around`, heading for a point
// within crossRadius of it, advanced preroll metres along that heading.
export function spawnShadowman(
  rng: Rng,
  id: number,
  around: XZ,
  metres: Metres,
  havens: readonly XZ[],
  cfg: ShadowmenConfig,
  preroll = 0
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
  return {
    id,
    x: x + dirX * preroll,
    z: z + dirZ * preroll,
    dirX,
    dirZ,
    speed: range(rng, cfg.speedMin, cfg.speedMax),
    target: null,
    burn: 0,
  }
}

export function createShadowmen(): ShadowmenField {
  return { shadowmen: [], nextId: 1, cooldowns: {} }
}

// How many shadowmen are inside the despawn radius of p: the bubble a
// raider there already has.
function near(field: ShadowmenField, p: XZ, cfg: ShadowmenConfig): number {
  let n = 0
  for (const s of field.shadowmen) {
    if (Math.hypot(s.x - p.x, s.z - p.z) <= cfg.despawnRadius) n++
  }
  return n
}

// A new raider's bubble filled at once, each shadowman already somewhere
// along its crossing, so the first blips are not one wave arriving at the
// rim together. A raider who arrives among others already has theirs.
function fill(
  field: ShadowmenField,
  rng: Rng,
  raider: XZ,
  metres: Metres,
  havens: readonly XZ[],
  cfg: ShadowmenConfig
): void {
  for (let n = near(field, raider, cfg); n < cfg.count; n++) {
    const fresh = spawnShadowman(rng, 0, raider, metres, havens, cfg)
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
// strike the raiders they touch, drop the ones that have left every
// bubble, and fill at most one place in each raider's bubble. Mutates
// field.
export function stepShadowmen(
  field: ShadowmenField,
  rng: Rng,
  { dt, raiders, metres, havens, calm = false }: ShadowmenStep,
  cfg: ShadowmenConfig = CONFIG.shadowmen
): ShadowmenUpdate {
  const struck: string[] = []
  const bursts: BurstBy[] = []

  // New raiders get a full bubble; departed ones lose their cooldown.
  const cooldowns: Record<string, number> = {}
  for (const raider of raiders) {
    if (!(raider.id in field.cooldowns)) {
      fill(field, rng, raider, metres, havens, cfg)
    }
    cooldowns[raider.id] = field.cooldowns[raider.id] ?? 0
  }
  field.cooldowns = cooldowns

  // Inside a haven nothing rushes you, and a rush already on breaks off.
  const exposed = raiders.filter(
    (r) => r.vulnerable && !inHaven(r, havens, cfg.havenRadius)
  )
  const lit = raiders.filter((r) => r.beam !== null)

  const kept: Shadowman[] = []
  for (const s of field.shadowmen) {
    let target = s.target ? exposed.find((r) => r.id === s.target) : undefined
    if (s.target && !target) {
      // Breaks off: keeps its heading, back to a crossing pace.
      s.target = null
      s.speed = range(rng, cfg.speedMin, cfg.speedMax)
    }
    if (!s.target && (!calm || s.placed)) {
      // The nearest exposed raider inside the rush radius.
      let best = cfg.rushRadius
      for (const r of exposed) {
        const d = Math.hypot(r.x - s.x, r.z - s.z)
        if (d < best) {
          best = d
          target = r
        }
      }
      if (target) {
        s.target = target.id
        s.speed = cfg.rushSpeed
      }
    }
    if (target) {
      const d = Math.hypot(target.x - s.x, target.z - s.z)
      if (d > 0) {
        s.dirX = (target.x - s.x) / d
        s.dirZ = (target.z - s.z) / d
      }
    }

    s.x += s.dirX * s.speed * dt
    s.z += s.dirZ * s.speed * dt

    // Only a rush can touch, and a rush only runs while its raider is
    // exposed.
    if (
      target &&
      Math.hypot(target.x - s.x, target.z - s.z) < cfg.touchRadius
    ) {
      struck.push(target.id)
      continue
    }
    let nearest = Infinity
    for (const r of raiders) {
      nearest = Math.min(nearest, Math.hypot(r.x - s.x, r.z - s.z))
    }
    if (
      nearest > cfg.despawnRadius ||
      !inBounds(s, metres, cfg.edgeInset) ||
      inHaven(s, havens, cfg.havenRadius)
    ) {
      continue
    }
    const by = lit
      .filter(({ beam }) =>
        beam
          ? inBeam(beam, { x: s.x, y: beam.floor + cfg.chestHeight, z: s.z })
          : false
      )
      .map((r) => r.id)
    s.burn = by.length > 0 ? s.burn + dt : Math.max(0, s.burn - dt)
    if (s.burn >= cfg.burnSeconds) {
      bursts.push({ id: s.id, x: s.x, z: s.z, by })
      continue
    }
    kept.push(s)
  }
  field.shadowmen = kept

  for (const raider of raiders) {
    const cooldown = Math.max(0, field.cooldowns[raider.id] - dt)
    field.cooldowns[raider.id] = cooldown
    if (cooldown > 0 || near(field, raider, cfg) >= cfg.count) continue
    field.shadowmen.push(
      spawnShadowman(rng, field.nextId++, raider, metres, havens, cfg)
    )
    field.cooldowns[raider.id] = cfg.spawnInterval
  }

  return { struck, bursts }
}

// A shadowman standing still at (x, z), for the specs (a dev frame in the
// shared valley, the dev hook played alone).
export function placeStill(field: ShadowmenField, x: number, z: number): void {
  field.shadowmen.push({
    id: field.nextId++,
    x,
    z,
    dirX: 0,
    dirZ: 1,
    speed: 0,
    target: null,
    burn: 0,
    placed: true,
  })
}

// What one raider's Scaduscope sees: every shadowman inside its range,
// hunting when it is rushing them.
export function contactsOf(
  shadowmen: readonly { x: number; z: number; target: string | null }[],
  me: XZ,
  myId: string,
  rangeMetres: number = CONFIG.scope.rangeMetres
): ScopeContact[] {
  const contacts: ScopeContact[] = []
  for (const s of shadowmen) {
    const dist = Math.hypot(s.x - me.x, s.z - me.z)
    if (dist >= rangeMetres) continue
    contacts.push({
      dist,
      bearing: compassBearing(s.x - me.x, s.z - me.z),
      hunting: s.target === myId,
    })
  }
  return contacts
}
