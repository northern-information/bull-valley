// Pure: the slurms of Castle Entropy's moat (slurms.ts's slugs, without
// Carlsten). On the shared clock, so every raider down there sees the same
// ones, with nothing on the wire: time is cut into slots
// (CONFIG.slurms.moat.slotSeconds), each with one drop a little way into
// it of a slurm or a few, each off a source the client hands in: a point
// just inside the channel under the rim or the island's edge, or a crane's
// hook. One falls to the floor, crawls off from the wall, lies a while
// and melts into the concrete; a raider's foot squashes it first
// (slurms.ts `treads`, `underfoot`). No three.js, no DOM.

import { CONFIG } from './config.ts'
import { mix } from './crumble.ts'
import { clamp01 } from './math.ts'
import type { XZ } from './interfaces.ts'
import type { SlurmAt } from './slurms.ts'

type MoatConfig = typeof CONFIG.slurms.moat

// Where a slurm can fall from, in the world: the point it drops off and
// the way it crawls once down (a unit vector, away from the wall it fell
// off). A crane's hook has none of its own, so each drop off one draws it.
export interface MoatSource {
  x: number
  y: number
  z: number
  heading: XZ | null
}

// One slurm at a moment: slurms.ts's `SlurmAt`, its key (the slot and its
// place in the drop, for remembering it trodden on or jarred), the two
// apart, and how high it is while it falls.
export interface MoatSlurm extends SlurmAt {
  key: string
  slot: number
  index: number
  y: number
}

// The station a moat slurm goes by on the wire and in the jar's frames
// (sharedworld.ts rule 36): no Citgo's, the moat's own.
export const MOAT_STATION = -1

const SEED = 0x5107
// Each slurm of a drop falls this long after the one before.
const DROP_STAGGER = 0.7

// When slot `slot`'s drop starts and how many fall in it, whatever the
// sources: what the valley needs to know a moat slurm was there.
export function moatDropCount(
  slot: number,
  cfg: MoatConfig = CONFIG.slurms.moat
): { start: number; count: number } {
  const r = (k: number) => mix(SEED, slot, k)
  const start = slot * cfg.slotSeconds + r(0) * cfg.jitterSeconds
  let count = 1
  while (count < cfg.maxCount && r(10 + count) < cfg.multiChance) count++
  return { start, count }
}

// Whether slurm `index` of slot `slot`'s drop could still be down on the
// moat's floor, crawling or lying, at `seconds`: from its drop (a second
// early, for the clocks) until it would melt, with `jarSlack` for the
// longest fall and the wire.
export function mayJarMoat(
  slot: number,
  index: number,
  seconds: number,
  cfg: MoatConfig = CONFIG.slurms.moat
): boolean {
  if (!Number.isInteger(slot) || !Number.isInteger(index) || index < 0) {
    return false
  }
  const { start, count } = moatDropCount(slot, cfg)
  if (index >= count) return false
  const t = seconds - start - index * DROP_STAGGER
  return t >= -1 && t < cfg.crawlSeconds + cfg.lingerSeconds + cfg.jarSlack
}

// The drop slot `slot` holds: when it starts, how many fall, and from
// which sources (`hooks` of them cranes', after the edges).
export function moatDrop(
  slot: number,
  edges: number,
  hooks: number,
  cfg: MoatConfig = CONFIG.slurms.moat
): { start: number; sources: number[]; headings: number[] } {
  const r = (k: number) => mix(SEED, slot, k)
  const { start, count } = moatDropCount(slot, cfg)
  const sources: number[] = []
  const headings: number[] = []
  for (let i = 0; i < count; i++) {
    const crane = hooks > 0 && (edges === 0 || r(20 + i) < cfg.craneShare)
    sources.push(
      crane
        ? edges + Math.floor(r(30 + i) * hooks)
        : Math.floor(r(30 + i) * edges)
    )
    headings.push(r(40 + i) * Math.PI * 2)
  }
  return { start, sources, headings }
}

// Every moat slurm to be drawn at `seconds`: from the drops of the last
// few slots, each falling, crawling (or lying, still squashable),
// melting, or left out once gone. `landY` is the ground under a point.
export function moatSlurmsAt(
  sources: readonly MoatSource[],
  hooks: number,
  seconds: number,
  landY: (x: number, z: number) => number,
  cfg: MoatConfig = CONFIG.slurms.moat
): MoatSlurm[] {
  const edges = sources.length - hooks
  if (sources.length === 0) return []
  const { gravity, splatSeconds } = CONFIG.slurms
  const life = cfg.crawlSeconds + cfg.lingerSeconds + splatSeconds
  const now = Math.floor(seconds / cfg.slotSeconds)
  const back = Math.ceil((life + cfg.jitterSeconds + 8) / cfg.slotSeconds)
  const out: MoatSlurm[] = []
  for (let slot = now - back; slot <= now; slot++) {
    const drop = moatDrop(slot, edges, hooks, cfg)
    drop.sources.forEach((index, i) => {
      const from = sources[index]
      const t = seconds - drop.start - i * DROP_STAGGER
      if (t < 0) return
      const heading = from.heading ?? {
        x: Math.sin(drop.headings[i]),
        z: Math.cos(drop.headings[i]),
      }
      const yaw = Math.atan2(heading.x, heading.z)
      const floor = landY(from.x, from.z)
      const fall = Math.sqrt((2 * Math.max(0, from.y - floor)) / gravity)
      const key = `${slot}:${i}`
      const base = { key, slot, index: i, yaw, stretch: 0, tooth: 0 }
      if (t < fall) {
        return out.push({
          ...base,
          phase: 'falling',
          x: from.x,
          y: from.y - 0.5 * gravity * t * t,
          z: from.z,
          progress: fall > 0 ? t / fall : 1,
        })
      }
      const down = t - fall
      const crawled = Math.min(down, cfg.crawlSeconds) * cfg.crawlSpeed
      const x = from.x + heading.x * crawled
      const z = from.z + heading.z * crawled
      const lain = down - cfg.crawlSeconds - cfg.lingerSeconds
      if (lain >= splatSeconds) return
      if (lain >= 0) {
        return out.push({
          ...base,
          phase: 'squashed',
          x,
          y: landY(x, z),
          z,
          progress: lain / splatSeconds,
        })
      }
      const crawling = down < cfg.crawlSeconds
      const wave = Math.sin(2 * Math.PI * (down / 2.6 + mix(SEED, slot, i)))
      out.push({
        ...base,
        phase: 'crawling',
        x,
        y: landY(x, z),
        z,
        progress: 0,
        stretch: crawling ? (down * 1.4) % 1 : ((down * 0.3) % 1) * 0.25,
        tooth: clamp01((wave - 0.25) / 0.5),
      })
    })
  }
  return out
}
