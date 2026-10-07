// Ground mist. Banks of low fog drift on the wind through a square bubble
// that follows the player, wrapping to the far side as they leave it, and
// each one swells and thins on its own slow period, so the valley floor
// comes and goes in waves. Atmosphere only: the mist hides nothing from the
// scope, the shadowmen, or the pickups.
//
// Pure, no three.js. The cards that show the banks are in src/mistcards.ts;
// the field here is the whole truth about where they are.

import { CONFIG } from './config.ts'
import { range } from './rng.ts'
import type { XZ } from './interfaces.ts'
import type { Rng } from './rng.ts'

export type MistConfig = typeof CONFIG.mist

// One bank of mist.
export interface MistBank {
  x: number
  z: number
  // Metres across; the card is this wide and cfg.aspect of it tall.
  width: number
  // Where the bank is in its swell, radians, and how long one swell takes.
  phase: number
  period: number
  // Its own drift on top of the wind, metres per second.
  driftX: number
  driftZ: number
  // Which painted texture the bank wears, 0 to cfg.looks - 1.
  look: number
}

export interface MistField {
  // Fixed length cfg.count, so a card can show a bank by index.
  banks: MistBank[]
}

export interface MistStep {
  dt: number
  player: XZ
}

// An offset folded into the bubble, [-radius, radius).
export function wrapOffset(d: number, radius: number): number {
  const span = radius * 2
  return ((((d + radius) % span) + span) % span) - radius
}

function spawnBank(rng: Rng, player: XZ, cfg: MistConfig): MistBank {
  return {
    x: player.x + range(rng, -cfg.radius, cfg.radius),
    z: player.z + range(rng, -cfg.radius, cfg.radius),
    width: range(rng, cfg.widthMin, cfg.widthMax),
    phase: range(rng, 0, Math.PI * 2),
    period: range(rng, cfg.periodMin, cfg.periodMax),
    driftX: range(rng, -cfg.drift, cfg.drift),
    driftZ: range(rng, -cfg.drift, cfg.drift),
    look: Math.floor(rng() * cfg.looks),
  }
}

// Every bank somewhere in the bubble, partway through its swell.
export function createMist(
  rng: Rng,
  player: XZ,
  cfg: MistConfig = CONFIG.mist
): MistField {
  const banks: MistBank[] = []
  for (let i = 0; i < cfg.count; i++) banks.push(spawnBank(rng, player, cfg))
  return { banks }
}

// Drift every bank on the wind, advance its swell, and fold it back into
// the bubble around the player. Mutates field.
export function stepMist(
  field: MistField,
  { dt, player }: MistStep,
  cfg: MistConfig = CONFIG.mist
): void {
  for (const bank of field.banks) {
    bank.x += (cfg.wind.x + bank.driftX) * dt
    bank.z += (cfg.wind.z + bank.driftZ) * dt
    bank.phase = (bank.phase + (dt * Math.PI * 2) / bank.period) % (Math.PI * 2)
    bank.x = player.x + wrapOffset(bank.x - player.x, cfg.radius)
    bank.z = player.z + wrapOffset(bank.z - player.z, cfg.radius)
  }
}

// How much of the bank shows, 0 to cfg.opacity: its swell, dissolving as
// the player walks into it (so a card never fills the eye), and thinning at
// the bubble's edge (so wrapping never pops).
export function bankOpacity(
  bank: MistBank,
  player: XZ,
  cfg: MistConfig = CONFIG.mist
): number {
  const swell = 0.5 + 0.5 * Math.sin(bank.phase)
  const dx = bank.x - player.x
  const dz = bank.z - player.z
  const near = Math.min(1, Math.hypot(dx, dz) / cfg.nearFade)
  const toEdge = cfg.radius - Math.max(Math.abs(dx), Math.abs(dz))
  const edge = Math.max(0, Math.min(1, toEdge / cfg.edgeFade))
  return cfg.opacity * (0.3 + 0.7 * swell) * near * edge
}
