// Pure: what E would do right now, and the prompt that says so. main.ts
// resolves this once per frame and acts on it when E is pressed. No
// three.js, no DOM: tests/unit/interactions.test.ts runs it in Node.

import { CONFIG } from './config.ts'
import { itemById } from './items.ts'
import { STATES } from './raid.ts'
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

export type Interaction<P extends PickupSpot = PickupSpot> =
  | { kind: 'hopOut' }
  | { kind: 'board' }
  | { kind: 'boardExtract' }
  | { kind: 'unload'; count: number }
  | { kind: 'extractFuel'; name: string }
  | { kind: 'extractKeep' }
  | { kind: 'pickup'; pickup: P }

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
}

function near(a: XZ, b: XZ, radius: number): boolean {
  return Math.hypot(a.x - b.x, a.z - b.z) < radius
}

// The first match wins, in this order: hop out while riding; board the
// waiting truck; board the called truck to end the raid; unload at the
// stand; extract at a station or the Keep; take the nearest pickup.
export function resolveInteraction<P extends PickupSpot>(
  input: InteractionInput<P>
): Interaction<P> | null {
  const { raid, ended, player } = input
  if (ended || raid.state === STATES.EXTRACTED) return null
  if (raid.state === STATES.RIDING) return { kind: 'hopOut' }

  const truckClose = input.truck.distance < CONFIG.truck.boardRange
  if (raid.state === STATES.LOADOUT && truckClose) return { kind: 'board' }
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
      if (station === input.spawnStation) continue
      if (near(station, player, CONFIG.extract.fuelRadius)) {
        return { kind: 'extractFuel', name: station.name }
      }
    }
    if (input.keep && near(input.keep, player, CONFIG.extract.keepRadius)) {
      return { kind: 'extractKeep' }
    }
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
  if (kind === 'cabbage') return 'Cabbage'
  return `${itemById(kind)?.label ?? kind} x${count}`
}

export function interactionPrompt(interaction: Interaction): string {
  switch (interaction.kind) {
    case 'hopOut':
      return 'E — Hop Out'
    case 'board':
      return 'E — Climb into the Bed'
    case 'boardExtract':
      return 'E — Board (End the Raid)'
    case 'unload':
      return `E — Unload ${interaction.count} ${interaction.count === 1 ? 'Cabbage' : 'Cabbages'}`
    case 'extractFuel':
      return `E — End the Raid at ${interaction.name || 'the Station'}`
    case 'extractKeep':
      return "E — End the Raid at Mt. Coleman's Keep"
    case 'pickup':
      return `E — Take ${pickupLabel(interaction.pickup)}`
  }
}
