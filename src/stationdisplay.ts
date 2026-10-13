import * as THREE from 'three'
import {
  buildLockerDoors,
  buildShelfDisplay,
  CANOPY,
  castShadows,
  FUEL_LAYOUT,
} from './assets.ts'
import { CONFIG } from './config.ts'
import { applyPose, buildFigure } from './figure.ts'
import { samplePose } from './poses.ts'
import { onShelf, STORE_LAYOUT, storeCenter } from './store.ts'
import type { Vec3 } from './interfaces.ts'
import type { FuelPoint, ShelfDisplay } from './world.ts'

// The station lights, in station-local space: one spot under every
// fluorescent panel, the four in the store and the two under the canopy,
// all pointing down and all throwing shadows. A panel is an area light,
// so each spot is wide and firm-edged and the neighbours overlap into an
// even ceiling glow instead of pools. Like the shelf display they ride to
// the nearest station, because a spotlight at every Citgo would cost a
// shadow pass each, every frame. Intensities are candela (Three's lights
// are physical).
const STATION_LIGHTS = {
  store: { color: '#e6eef0', intensity: 32, distance: 10, angle: 1.2 },
  canopy: { color: '#eef4f0', intensity: 80, distance: 14, angle: 1.05 },
  // How far below the panel's face the spot sits.
  drop: 0.08,
  penumbra: 0.3,
  shadowMap: 512,
}

interface StationLights {
  group: THREE.Group
  // Off (zero intensity) away from every store. The lights stay in the
  // scene either way, so the shaders never recompile for a changed count.
  // Off, the spots stop rendering their shadow maps too: Three skips the
  // pass only on autoUpdate false, never for a zero intensity.
  setOn(on: boolean): void
}

function buildStationLights(): StationLights {
  const group = new THREE.Group()
  group.name = 'station-lights'
  const spots: THREE.SpotLight[] = []
  let lit = true
  const hang = (
    at: Vec3,
    tuning: {
      color: string
      intensity: number
      distance: number
      angle: number
    }
  ) => {
    const spot = new THREE.SpotLight(
      tuning.color,
      tuning.intensity,
      tuning.distance,
      tuning.angle,
      STATION_LIGHTS.penumbra
    )
    spot.position.set(...at)
    spot.target.position.set(at[0], 0, at[2])
    spot.castShadow = true
    spot.shadow.mapSize.set(STATION_LIGHTS.shadowMap, STATION_LIGHTS.shadowMap)
    spot.shadow.camera.near = 0.2
    spot.shadow.camera.far = tuning.distance
    spot.shadow.bias = -0.001
    spot.shadow.normalBias = 0.03
    spot.userData.intensity = tuning.intensity
    group.add(spot, spot.target)
    spots.push(spot)
  }
  // One spot under each panel in the store.
  for (const panel of STORE_LAYOUT.boxes) {
    if (panel.finish !== 'light') continue
    const [x, y, z] = panel.center
    hang(
      [x, y - panel.size[1] / 2 - STATION_LIGHTS.drop, z],
      STATION_LIGHTS.store
    )
  }
  // One under each canopy tube, over its pump.
  const tubeY = CANOPY.height - CANOPY.thickness / 2 - STATION_LIGHTS.drop
  for (const z of [FUEL_LAYOUT.pumpOffset, -FUEL_LAYOUT.pumpOffset]) {
    hang([0, tubeY, z], STATION_LIGHTS.canopy)
  }
  return {
    group,
    setOn(on) {
      if (on === lit) return
      lit = on
      for (const spot of spots) {
        spot.intensity = on ? (spot.userData.intensity as number) : 0
        spot.shadow.autoUpdate = on
        // A re-parked rig renders one fresh map before it settles.
        if (on) spot.shadow.needsUpdate = true
      }
    },
  }
}

// One stocked display for every store. Building 15 stores' worth of shelf
// units would cost thousands of draw calls, and the walls and the fog hide
// every store but the one you are near, so the one display follows you:
// it parks at the store nearest the player and hides the units that store
// has sold. A buy takes the unit the buyer looks at. David Carlsten rides
// along behind the counter, so every Citgo has its clerk, and the station

// One stocked display for every store. Building 15 stores' worth of shelf
// units would cost thousands of draw calls, and the walls and the fog hide
// every store but the one you are near, so the one display follows you:
// it parks at the store nearest the player and hides the units that store
// has sold. A buy takes the unit the buyer looks at. David Carlsten rides
// along behind the counter, so every Citgo has its clerk, and the station
// lights ride with it.
export function buildShelves(points: readonly FuelPoint[]): ShelfDisplay {
  const { group: display, slots } = buildShelfDisplay()
  display.visible = false
  const clerk = buildFigure('carlsten')
  applyPose(clerk, samplePose('stand'))
  const spot = STORE_LAYOUT.clerk
  clerk.group.position.set(spot.x, STORE_LAYOUT.floor, spot.z)
  clerk.group.rotation.y = spot.yaw
  display.add(clerk.group)
  const lockers = buildLockerDoors()
  display.add(lockers)
  castShadows(display)
  // The display and the lights park together at the nearest station.
  const lights = buildStationLights()
  const group = new THREE.Group()
  group.name = 'nearest-station'
  group.add(display, lights.group)
  const centers = points.map(storeCenter)
  const facings = STORE_LAYOUT.facings
  let parked = -1
  return {
    group,
    clerk: clerk.group,
    lockers,
    unitFor(station, kind, unit) {
      if (station !== parked) return null
      const slot = slots.find(
        (s) => facings[s.facing].kind === kind && s.unit === unit
      )
      return slot?.object ?? null
    },
    update(x, z, stocks) {
      let best = -1
      let bestD = CONFIG.store.displayRange
      centers.forEach((c, i) => {
        const d = Math.hypot(c.x - x, c.z - z)
        if (d < bestD) {
          bestD = d
          best = i
        }
      })
      parked = best
      display.visible = best >= 0
      lights.setOn(best >= 0)
      if (best < 0) return
      const at = points[best]
      group.position.set(at.x, at.y, at.z)
      group.rotation.set(0, -at.yaw, 0)
      const stock = stocks[best] ?? {}
      for (const slot of slots) {
        const kind = facings[slot.facing].kind
        slot.object.visible = onShelf(stock, kind, slot.unit)
      }
    },
  }
}

// Beacon markers for the hand-placed landmarks, color-coded so they read
