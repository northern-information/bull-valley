// The shadowmen. They are not fought — they are noticed too late. Each one
// crosses a bubble that follows the player: in at the spawn ring, past a
// point near the player, out past the despawn radius, in a straight line at
// a sprint. One that passes close to a player on foot turns and rushes, and
// a touch is a strike. Citgo forecourts are havens: a shadowman vanishes at
// the lights, and nothing can touch you inside. A flashlight beam held on
// one for burnSeconds bursts it.
//
// Pure, no three.js. The silhouette cards that show them are in
// src/shadowcards.ts; the field here is the whole truth about where they are.

import { CONFIG } from './config.ts'
import { compassBearing } from './coords.ts'
import { range } from './rng.ts'
import type { HeightAt, Metres, ScopeContact, XZ } from './interfaces.ts'
import type { Rng } from './rng.ts'

export type ShadowmenConfig = typeof CONFIG.shadowmen

// One shadowman mid-crossing, or rushing the player.
export interface Shadowman {
  x: number
  z: number
  // Unit heading.
  dirX: number
  dirZ: number
  // Metres per second.
  speed: number
  rushing: boolean
  // Seconds it has been held in the beam, running back down out of it.
  burn: number
}

export interface XYZ {
  x: number
  y: number
  z: number
}

// The flashlight's beam: a cone from the eye along dir (a unit vector),
// range metres long, halfAngle radians off its axis.
export interface Beam {
  origin: XYZ
  dir: XYZ
  range: number
  halfAngle: number
}

export interface ShadowmenField {
  // Fixed length cfg.count, so a card can show a slot by index. null is an
  // empty slot waiting on the cooldown.
  slots: (Shadowman | null)[]
  // Seconds until the next empty slot may be filled.
  cooldown: number
}

export interface ShadowmenStep {
  dt: number
  player: XZ
  metres: Metres
  // Citgo forecourts: shadowmen never enter, and the player is safe inside.
  havens: readonly XZ[]
  // False while in loadout or riding the truck: no rushes, no touches.
  vulnerable: boolean
  scopeRange?: number
  // The player's flashlight while it is up and on, and what the
  // shadowmen stand on, for aiming the beam at their chests.
  beam?: Beam | null
  groundAt?: HeightAt
}

export interface ShadowmenUpdate {
  // Everything inside scope range this step.
  contacts: ScopeContact[]
  // A shadowman touched the player.
  struck: boolean
  // Where shadowmen burst in the beam this step.
  bursts: XZ[]
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

// Ring points to try before settling for a clamped one.
const SPAWN_TRIES = 8

// One shadowman on the spawn ring, heading for a point within crossRadius of
// the player, advanced preroll metres along that heading.
export function spawnShadowman(
  rng: Rng,
  player: XZ,
  metres: Metres,
  havens: readonly XZ[],
  cfg: ShadowmenConfig,
  preroll = 0
): Shadowman {
  // Where it is going: uniform over the crossing disc.
  const r = cfg.crossRadius * Math.sqrt(rng())
  const a = rng() * Math.PI * 2
  const tx = player.x + Math.cos(a) * r
  const tz = player.z + Math.sin(a) * r

  // Where it comes in: a ring point clear of the survey edge and the
  // forecourts. Near the edge every try can fail, so the last one is clamped
  // inside the inset.
  let x = player.x
  let z = player.z
  for (let i = 0; i < SPAWN_TRIES; i++) {
    const theta = rng() * Math.PI * 2
    x = player.x + Math.cos(theta) * cfg.spawnRadius
    z = player.z + Math.sin(theta) * cfg.spawnRadius
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
    x: x + dirX * preroll,
    z: z + dirZ * preroll,
    dirX,
    dirZ,
    speed: range(rng, cfg.speedMin, cfg.speedMax),
    rushing: false,
    burn: 0,
  }
}

// Every slot filled, each shadowman already somewhere along its crossing, so
// the first blips are not one wave arriving at the rim together.
export function createShadowmen(
  rng: Rng,
  player: XZ,
  metres: Metres,
  havens: readonly XZ[],
  cfg: ShadowmenConfig = CONFIG.shadowmen
): ShadowmenField {
  const slots: (Shadowman | null)[] = []
  for (let i = 0; i < cfg.count; i++) {
    const fresh = spawnShadowman(rng, player, metres, havens, cfg)
    // How far along its heading the crossing stays inside the spawn ring:
    // the distance to its closest approach, plus the half-chord beyond it.
    const px = player.x - fresh.x
    const pz = player.z - fresh.z
    const along = px * fresh.dirX + pz * fresh.dirZ
    const across = Math.abs(px * fresh.dirZ - pz * fresh.dirX)
    const half = Math.sqrt(Math.max(0, cfg.spawnRadius ** 2 - across ** 2))
    const chord = Math.max(0, along + half)
    const preroll = range(rng, 0, chord)
    slots.push({
      ...fresh,
      x: fresh.x + fresh.dirX * preroll,
      z: fresh.z + fresh.dirZ * preroll,
    })
  }
  return { slots, cooldown: 0 }
}

// Advance every shadowman, burst the ones held long enough in the beam,
// drop the ones that have left the bubble, fill at most one empty slot, and
// report what the scope sees. Mutates field.
export function stepShadowmen(
  field: ShadowmenField,
  rng: Rng,
  {
    dt,
    player,
    metres,
    havens,
    vulnerable,
    scopeRange = CONFIG.scope.rangeMetres,
    beam = null,
    groundAt = () => 0,
  }: ShadowmenStep,
  cfg: ShadowmenConfig = CONFIG.shadowmen
): ShadowmenUpdate {
  const contacts: ScopeContact[] = []
  const bursts: XZ[] = []
  let struck = false
  // Inside a haven nothing rushes you, and a rush already on breaks off.
  const exposed = vulnerable && !inHaven(player, havens, cfg.havenRadius)

  for (let i = 0; i < field.slots.length; i++) {
    const s = field.slots[i]
    if (!s) continue
    let dx = player.x - s.x
    let dz = player.z - s.z
    let d = Math.hypot(dx, dz)

    if (s.rushing && !exposed) {
      // Breaks off: keeps its heading, back to a crossing pace.
      s.rushing = false
      s.speed = range(rng, cfg.speedMin, cfg.speedMax)
    } else if (!s.rushing && exposed && d < cfg.rushRadius) {
      s.rushing = true
      s.speed = cfg.rushSpeed
    }
    if (s.rushing && d > 0) {
      s.dirX = dx / d
      s.dirZ = dz / d
    }

    s.x += s.dirX * s.speed * dt
    s.z += s.dirZ * s.speed * dt
    dx = player.x - s.x
    dz = player.z - s.z
    d = Math.hypot(dx, dz)

    // Only a rush can touch, and a rush only runs while exposed.
    if (s.rushing && d < cfg.touchRadius) {
      struck = true
      field.slots[i] = null
      continue
    }
    if (
      d > cfg.despawnRadius ||
      !inBounds(s, metres, cfg.edgeInset) ||
      inHaven(s, havens, cfg.havenRadius)
    ) {
      field.slots[i] = null
      continue
    }
    const chest = { x: s.x, y: groundAt(s.x, s.z) + cfg.chestHeight, z: s.z }
    s.burn =
      beam && inBeam(beam, chest) ? s.burn + dt : Math.max(0, s.burn - dt)
    if (s.burn >= cfg.burnSeconds) {
      bursts.push({ x: s.x, z: s.z })
      field.slots[i] = null
      continue
    }
    if (d < scopeRange) {
      contacts.push({
        dist: d,
        bearing: compassBearing(s.x - player.x, s.z - player.z),
        hunting: s.rushing,
      })
    }
  }

  field.cooldown = Math.max(0, field.cooldown - dt)
  if (field.cooldown <= 0) {
    const empty = field.slots.indexOf(null)
    if (empty !== -1) {
      field.slots[empty] = spawnShadowman(rng, player, metres, havens, cfg)
      field.cooldown = cfg.spawnInterval
    }
  }

  return { contacts, struck, bursts }
}
