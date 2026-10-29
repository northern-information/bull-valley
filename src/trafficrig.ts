import * as THREE from 'three'
import { CONFIG } from './config.ts'
import { carsNear, handSpots, lampsOf } from './traffic.ts'
import { buildVehicle, lookKey } from './trafficmodels.ts'
import type { HeightAt, XZ } from './interfaces.ts'
import type { Car, RealSpot, Traffic, TrafficLamp } from './traffic.ts'
import type { VehicleModel } from './trafficmodels.ts'

// The valley's traffic as seen: only the cars within CONFIG.traffic
// .nearRadius of the player are worked out at all (traffic.ts carsNear,
// on the valley's clock), each drawn on the ground (`ground.at`, the
// roads' own surface), nosed up or down its slope. A car that drives out
// of reach goes back to a pool by its looks and is drawn again for the
// next car that looks the same, so nothing is built twice for long. The
// `real` nearest throw real light down the road from their headlights: a
// fixed set of spots, so the scene's lights never change in number, each
// faded from one car to the next (traffic.ts handSpots).

// A car as drawn: where it is, its ground, and its lamps for the valley.
export interface PlacedCar extends Car {
  y: number
  lamps: TrafficLamp[]
}

export interface TrafficRig {
  // Every car near `at` at `seconds` on the valley's clock, placed and
  // drawn, nearest first.
  update(seconds: number, at: XZ): PlacedCar[]
  // The cars the last update drew.
  readonly cars: PlacedCar[]
}

// How far apart the axles are read for a car's pitch, either side of its
// middle.
const AXLE = 1.4

export function createTrafficRig({
  scene,
  traffic,
  groundAt,
  cfg = CONFIG.traffic,
}: {
  scene: THREE.Scene
  traffic: Traffic
  groundAt: HeightAt
  cfg?: typeof CONFIG.traffic
}): TrafficRig {
  // What each look was built as, cloned for each car that wears it.
  const built = new Map<string, VehicleModel>()
  // Models put by, by look, and the ones out on the road, by car.
  const spare = new Map<string, VehicleModel[]>()
  const out = new Map<string, { key: string; model: VehicleModel }>()

  const take = (car: Car): VehicleModel => {
    const key = lookKey(car.kind, car.seed)
    const had = spare.get(key)?.pop()
    let model = had
    if (!model) {
      let template = built.get(key)
      if (!template) {
        template = buildVehicle(car.kind, car.seed)
        built.set(key, template)
      }
      model = {
        body: template.body.clone(),
        trailer: template.trailer?.clone() ?? null,
      }
    }
    scene.add(model.body)
    if (model.trailer) scene.add(model.trailer)
    out.set(car.id, { key, model })
    return model
  }

  const putBy = (id: string) => {
    const was = out.get(id)
    if (!was) return
    scene.remove(was.model.body)
    if (was.model.trailer) scene.remove(was.model.trailer)
    const list = spare.get(was.key) ?? []
    list.push(was.model)
    spare.set(was.key, list)
    out.delete(id)
  }

  // A body on the ground at (x, z), facing `heading`, its nose pitched to
  // the slope between its axles. Returns the ground under its middle.
  const stand = (
    object: THREE.Object3D,
    x: number,
    z: number,
    heading: number
  ): number => {
    const dx = Math.sin(heading)
    const dz = Math.cos(heading)
    const y = groundAt(x, z)
    const front = groundAt(x + dx * AXLE, z + dz * AXLE)
    const back = groundAt(x - dx * AXLE, z - dz * AXLE)
    object.position.set(x, y, z)
    object.rotation.set(-Math.atan2(front - back, AXLE * 2), heading, 0, 'YXZ')
    return y
  }

  const spots = Array.from({ length: cfg.real }, () => {
    const spot = new THREE.SpotLight('#fbe7a3', 0, 50, 0.55, 0.45, 2)
    spot.castShadow = false
    scene.add(spot, spot.target)
    return spot
  })

  // Which car each spot rides with, and the clock it was last handed at.
  let held: RealSpot[] = spots.map(() => ({ car: null, level: 0 }))
  let last: number | null = null

  let cars: PlacedCar[] = []
  return {
    get cars() {
      return cars
    },
    update(seconds, at) {
      const near = carsNear(traffic, seconds, at, cfg.nearRadius, cfg)
      const ids = new Set(near.map((car) => car.id))
      for (const id of [...out.keys()]) if (!ids.has(id)) putBy(id)
      const placed = near.map((car): PlacedCar => {
        const model = out.get(car.id)?.model ?? take(car)
        const y = stand(model.body, car.x, car.z, car.heading)
        const t = car.trailer
        const ty =
          t && model.trailer ? stand(model.trailer, t.x, t.z, t.heading) : y
        return { ...car, y, lamps: lampsOf(car, y, ty) }
      })
      placed.sort(
        (a, b) =>
          Math.hypot(a.x - at.x, a.z - at.z) -
          Math.hypot(b.x - at.x, b.z - at.z)
      )
      const dt = last === null ? 0 : Math.min(0.25, Math.max(0, seconds - last))
      last = seconds
      held = handSpots(
        held,
        placed.map((car) => car.id),
        dt,
        cfg.spotFade
      )
      const byId = new Map(placed.map((car) => [car.id, car]))
      spots.forEach((spot, i) => {
        const { car: id, level } = held[i]
        const car = id === null ? undefined : byId.get(id)
        if (!car) {
          spot.intensity = 0
          return
        }
        const { nose, height } = cfg.vehicles[car.kind]
        const dx = Math.sin(car.heading)
        const dz = Math.cos(car.heading)
        spot.intensity = 900 * level
        spot.position.set(car.x + dx * nose, car.y + height, car.z + dz * nose)
        spot.target.position.set(
          car.x + dx * (nose + 30),
          car.y + 0.4,
          car.z + dz * (nose + 30)
        )
      })
      cars = placed
      return placed
    },
  }
}
