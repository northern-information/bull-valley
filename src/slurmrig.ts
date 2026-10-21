import * as THREE from 'three'
import { buildSlurm } from './assets.ts'
import { CONFIG } from './config.ts'
import { applyPose } from './figure.ts'
import { ease } from './hands.ts'
import { blendPose, samplePose, strideOf, stridePose } from './poses.ts'
import {
  afterTrodden,
  AT_COUNTER,
  DRIPLINES,
  eventAt,
  lineOf,
  nextStart,
  slurmScene,
  treads,
  underfoot,
} from './slurms.ts'
import { STORE_LAYOUT, toWorld } from './store.ts'
import type { Figure } from './figure.ts'
import type { Ground } from './ground.ts'
import type { XZ } from './interfaces.ts'
import type { Cue } from './sfx.ts'
import type { SlurmRig } from './slurmmodel.ts'
import type { CarlstenAt, Feet, SlurmEvent } from './slurms.ts'
import type { StoreOrigin } from './store.ts'

const STAND = samplePose('stand')
const WINDUP = samplePose('bat-windup')
const SMASH = samplePose('bat-smash')

// David Carlsten as the slurms have him at a moment (slurms.ts): walking,
// swinging, or standing. Through the swing the bat comes up out of its
// hang to lie along his forearms, and goes back to hanging after.
export function poseCarlsten(figure: Figure, at: CarlstenAt): void {
  const { walkSpeed } = CONFIG.slurms
  let grip = 0
  switch (at.action) {
    case 'walk':
      applyPose(figure, stridePose(at.walked / strideOf(walkSpeed), walkSpeed))
      break
    case 'windup':
      grip = ease(at.beat)
      applyPose(figure, blendPose(STAND, WINDUP, grip))
      break
    case 'smash':
      grip = 1
      applyPose(figure, blendPose(WINDUP, SMASH, at.beat * at.beat))
      break
    case 'recover':
      grip = 1 - ease(at.beat)
      applyPose(figure, blendPose(SMASH, STAND, ease(at.beat)))
      break
    case 'stand':
      applyPose(figure, STAND)
  }
  if (figure.held) figure.held.rotation.x *= 1 - grip
}

// The slurms at the station the shelf display is parked at, and Carlsten
// coming out after them: a few slug rigs riding in the display's
// station-local group, the clerk moved and posed, the sounds of a frame
// and his line when he says it (a curse, or his thanks to a raider whose
// foot got the last one before he did).
export interface Slurms {
  // Station-local, added to the group that parks at the nearest station.
  group: THREE.Group
  // Draw the drop under way at `station` (-1: parked nowhere) at
  // `seconds` on the shared clock. `player` is where the player stands,
  // to hear his line; `feet`, every raider on foot this client sees, to
  // squash a crawling slurm underfoot (and Carlsten, the last one squashed
  // before he gets to it, turns back with his thanks).
  update(
    station: number,
    origin: StoreOrigin | null,
    seconds: number,
    player: XZ,
    feet: readonly Feet[]
  ): { cues: Cue[]; curse: string | null }
  // Whether Carlsten is out from behind `station`'s counter.
  away(station: number): boolean
  // Dev: bring the next drop at the parked station to now.
  hurry(): void
  // Dev: hold every drop off, as if between drops, until let go.
  hold(on: boolean): void
}

export function createSlurms(clerk: Figure, ground: Ground): Slurms {
  const group = new THREE.Group()
  group.name = 'slurms'
  const pool: SlurmRig[] = []
  for (let i = 0; i < CONFIG.slurms.maxCount; i++) {
    const rig = buildSlurm()
    rig.group.visible = false
    group.add(rig.group)
    pool.push(rig)
  }
  let offset = 0
  let parked = -1
  let out = false
  let lastSeconds = 0
  let held = false
  // What the last frame drew, to hear a landing, a smash or the curse
  // once as it happens.
  let last: { event: SlurmEvent; phases: string[]; t: number } | null = null
  // When each slurm was trodden on (shared seconds), by station, slot and
  // index; forgotten once its drop is over.
  const trodden = new Map<string, number>()

  const atCounter = () => {
    if (!out) return
    out = false
    clerk.group.position.set(
      STORE_LAYOUT.clerk.x,
      STORE_LAYOUT.floor,
      STORE_LAYOUT.clerk.z
    )
    clerk.group.rotation.y = STORE_LAYOUT.clerk.yaw
    poseCarlsten(clerk, AT_COUNTER)
  }

  return {
    group,
    update(station, origin, seconds, player, feet) {
      const cues: Cue[] = []
      let curse: string | null = null
      parked = station
      lastSeconds = seconds
      const now = seconds + offset
      const under =
        !held && station >= 0 && origin ? eventAt(station, now) : null
      if (!under || !origin) {
        for (const rig of pool) rig.group.visible = false
        atCounter()
        last = null
        return { cues, curse }
      }
      const { t } = under
      const same =
        last?.event.slot === under.event.slot && last.event.station === station
      if (!same) trodden.clear()
      // The drop as Carlsten plays it, with any trodden on before he got
      // to them out of his way (slurms.ts afterTrodden).
      const event = afterTrodden(
        under.event,
        under.event.slurms.map(
          (_, i) =>
            (trodden.get(`${station}:${under.event.slot}:${i}`) ?? Infinity) -
            under.event.start
        )
      )
      const scene = slurmScene(event, t)
      const world = (x: number, z: number) => toWorld(origin, [x, 0, z])
      const groundAt = (x: number, z: number) => {
        const [wx, , wz] = world(x, z)
        return ground.at(wx, wz) - origin.y
      }
      // The slurms: falling off the edge, crawling, or a splat.
      pool.forEach((rig, i) => {
        const key = `${station}:${event.slot}:${i}`
        let slurm = scene.slurms[i]
        // Underfoot: a raider stepping on one crawling squashes it.
        if (slurm?.phase === 'crawling' && !trodden.has(key)) {
          const [wx, , wz] = world(slurm.x, slurm.z)
          const at = { x: wx, y: ground.at(wx, wz), z: wz }
          if (treads(at, feet)) {
            trodden.set(key, now)
            cues.push({ id: 'slurm-squish', x: wx, z: wz, rate: 1 })
          }
        }
        const stepped = trodden.get(key)
        if (slurm && stepped !== undefined) {
          slurm = underfoot(slurm, now - stepped)
        }
        const shown =
          slurm !== undefined &&
          slurm.phase !== 'waiting' &&
          slurm.phase !== 'gone'
        rig.group.visible = shown
        if (!slurm || !shown) return
        const floor = groundAt(slurm.x, slurm.z)
        // The eave stands on the store's base, the canopy on the lot.
        const fromY =
          DRIPLINES[event.dripline].y +
          (event.dripline === 'eave' ? 0 : groundAt(0, 0))
        const y =
          slurm.phase === 'falling'
            ? fromY + (floor - fromY) * slurm.progress
            : floor
        rig.group.position.set(slurm.x, y, slurm.z)
        rig.group.rotation.set(
          slurm.phase === 'falling' ? slurm.progress * 5 : 0,
          slurm.yaw,
          0
        )
        rig.pose({
          stretch: slurm.stretch,
          tooth: slurm.tooth,
          splat: slurm.phase === 'squashed' ? slurm.progress : null,
        })
        // A landing and a smash, heard once.
        const before = same ? last?.phases[i] : undefined
        if (before === 'falling' && slurm.phase === 'crawling') {
          const [wx, , wz] = world(slurm.x, slurm.z)
          cues.push({ id: 'slurm-plop', x: wx, z: wz, rate: 1 })
        }
        if (
          before === 'crawling' &&
          slurm.phase === 'squashed' &&
          stepped === undefined
        ) {
          const [wx, , wz] = world(slurm.x, slurm.z)
          cues.push({ id: 'bat-smash', x: wx, z: wz, rate: 1 })
        }
      })
      // Carlsten, out on the lot or back behind the counter.
      const at = scene.carlsten
      if (at.away) {
        out = true
        const inside = at.x < STORE_LAYOUT.front
        clerk.group.position.set(
          at.x,
          inside ? STORE_LAYOUT.floor : groundAt(at.x, at.z),
          at.z
        )
        clerk.group.rotation.y = at.yaw
        poseCarlsten(clerk, at)
      } else {
        atCounter()
      }
      // His line, once, to whoever is near enough to hear it.
      const sayAt = event.sayAt
      if (same && last && last.t < sayAt && t >= sayAt) {
        const [wx, , wz] = world(at.x, at.z)
        const near =
          Math.hypot(wx - player.x, wz - player.z) <= CONFIG.slurms.hearRadius
        if (near) curse = lineOf(event)
      }
      last = {
        event,
        phases: scene.slurms.map((s, i) =>
          trodden.has(`${station}:${event.slot}:${i}`) ? 'squashed' : s.phase
        ),
        t,
      }
      return { cues, curse }
    },
    away(station) {
      return station === parked && out
    },
    hurry() {
      if (parked < 0) return
      const now = lastSeconds + offset
      offset += nextStart(parked, now) - now
    },
    hold(on) {
      held = on
    },
  }
}
