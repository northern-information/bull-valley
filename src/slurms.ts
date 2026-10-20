// Pure: the slurms. Every 30 to 90 seconds a few black slugs drop off a
// Citgo's dripline (the store's front eave, or an edge of the pump
// canopy), and David Carlsten comes out from behind the counter with his
// bat, smashes each one, curses, and goes back in. Scenery only: they
// never touch a raider and nothing is kept. Every drop is drawn from a
// seed of the station and the slot of time it falls in, so every client
// reading the same shared clock sees the same slurms fall at the same
// moment, with nothing on the wire. All in station-local space (store.ts),
// in seconds. No three.js, no DOM.

import { CONFIG } from './config.ts'
import { copy } from './copy.ts'
import { clamp01 } from './math.ts'
import { mulberry32, range } from './rng.ts'
import { CANOPY, STORE_LAYOUT } from './store.ts'
import type { XZ } from './interfaces.ts'
import type { Rng } from './rng.ts'

// The edges they drip from: the store's front eave, and the canopy's four
// (the side toward the store, the side toward the road, and its two ends).
export type Dripline =
  'eave' | 'canopy-store' | 'canopy-road' | 'canopy-left' | 'canopy-right'

interface DriplineSpec {
  // The edge runs along local Z (x fixed) or local X (z fixed).
  along: 'x' | 'z'
  // The fixed coordinate, a little outside the edge, and the stretches of
  // the other one a slurm may fall on (clear of the door, the trash cans
  // and the canopy poles).
  at: number
  spans: readonly (readonly [number, number])[]
  // How high it falls from: the eave over the store's base, the canopy
  // over the lot at the pump island (stations.ts stands each so).
  y: number
  // Outward from the edge: Carlsten stands this side of a slurm.
  out: XZ
}

const { front, halfWidth, height, clerk } = STORE_LAYOUT
const CANOPY_X = CANOPY.width / 2
const CANOPY_Z = CANOPY.depth / 2
const CANOPY_UNDER = CANOPY.height - CANOPY.thickness / 2
// How far outside an edge a slurm falls.
const DRIP = 0.12
// Round the canopy's corners, clear of its edge, on the way to the far
// side (so Carlsten never walks through the pump island).
const CORNER = { x: CANOPY_X + 0.7, z: CANOPY_Z + 0.9 }

export const DRIPLINES: Record<Dripline, DriplineSpec> = {
  // Along the storefront, either side of the door and clear of the trash
  // can beside it (citgo.ts FUEL_LAYOUT.trashCans).
  eave: {
    along: 'z',
    at: front + DRIP + 0.1,
    spans: [
      [-halfWidth + 0.5, -2.3],
      [1.3, halfWidth - 0.5],
    ],
    y: height,
    out: { x: 1, z: 0 },
  },
  'canopy-store': {
    along: 'z',
    at: -CANOPY_X - DRIP,
    spans: [[-CANOPY_Z + 0.4, CANOPY_Z - 0.4]],
    y: CANOPY_UNDER,
    out: { x: -1, z: 0 },
  },
  'canopy-road': {
    along: 'z',
    at: CANOPY_X + DRIP,
    spans: [[-CANOPY_Z + 0.4, CANOPY_Z - 0.4]],
    y: CANOPY_UNDER,
    out: { x: 1, z: 0 },
  },
  // The ends, clear of the trash cans at the island's ends.
  'canopy-left': {
    along: 'x',
    at: -CANOPY_Z - DRIP,
    spans: [
      [-CANOPY_X + 0.4, -0.7],
      [0.7, CANOPY_X - 0.4],
    ],
    y: CANOPY_UNDER,
    out: { x: 0, z: -1 },
  },
  'canopy-right': {
    along: 'x',
    at: CANOPY_Z + DRIP,
    spans: [
      [-CANOPY_X + 0.4, -0.7],
      [0.7, CANOPY_X - 0.4],
    ],
    y: CANOPY_UNDER,
    out: { x: 0, z: 1 },
  },
}

const DRIPLINE_IDS = Object.keys(DRIPLINES) as Dripline[]

// Carlsten's way out: from behind the counter along it to the door, and
// out onto the lot.
const BEHIND = { x: clerk.x, z: 0 }
const OUTSIDE = { x: front + 0.6, z: 0 }

// One slurm of a drop.
export interface Slurm {
  // Where it falls (on the dripline), and when it lets go.
  drip: XZ
  dropAt: number
  landAt: number
  // The way it crawls once down (a unit vector), and where it stops.
  heading: XZ
  rest: XZ
  // Its tooth's period and where in it the slurm starts.
  toothPeriod: number
  toothPhase: number
  // When the bat comes down on it.
  smashAt: number
}

// What Carlsten does over a span of the drop.
type Leg =
  | { kind: 'walk'; from: XZ; to: XZ; t0: number; t1: number; walked: number }
  | {
      kind: 'swing'
      at: XZ
      yaw: number
      t0: number
      // The bat up (t0 to raised), down (raised to impact), and a beat
      // to recover (impact to t1).
      raised: number
      impact: number
      t1: number
    }
  | { kind: 'curse'; at: XZ; yaw: number; t0: number; t1: number }

// One drop at one station: the slurms, Carlsten's legs out and back, when
// he curses and which line, and how long it all lasts.
export interface SlurmEvent {
  station: number
  slot: number
  // Seconds since the epoch on the shared clock.
  start: number
  dripline: Dripline
  slurms: Slurm[]
  legs: Leg[]
  // When he leaves the counter, and is back behind it.
  out: number
  back: number
  curseAt: number
  curse: number
  // When the last splat is gone and he is back.
  end: number
}

// --- The schedule --------------------------------------------------------

function slotRng(station: number, slot: number): Rng {
  const rng = mulberry32(
    Math.imul(station + 1, 0x9e3779b1) ^ Math.imul(slot, 0x85ebca6b) ^ 0x51a7
  )
  // Neighbouring seeds start close; the first draw is thrown away.
  rng()
  return rng
}

// When slot `slot`'s drop at `station` starts, in seconds since the epoch.
export function slotStart(station: number, slot: number): number {
  const { slotSeconds, jitterSeconds } = CONFIG.slurms
  return slot * slotSeconds + slotRng(station, slot)() * jitterSeconds
}

// The drop of slot `slot` at `station`, all of it.
export function slurmEvent(station: number, slot: number): SlurmEvent {
  const tuning = CONFIG.slurms
  const rng = slotRng(station, slot)
  const start = slot * tuning.slotSeconds + rng() * tuning.jitterSeconds
  const dripline = DRIPLINE_IDS[Math.floor(rng() * DRIPLINE_IDS.length)]
  const spec = DRIPLINES[dripline]
  let count = 1
  while (count < tuning.maxCount && rng() < tuning.multiChance) count++
  // Several fall from one stretch of the edge.
  const span = spec.spans[Math.floor(rng() * spec.spans.length)]
  const room = Math.max(0, span[1] - span[0] - tuning.spread)
  const from = span[0] + rng() * room
  const fallSeconds = Math.sqrt((2 * spec.y) / tuning.gravity)
  const slurms: Slurm[] = []
  let dropAt = 0
  for (let i = 0; i < count; i++) {
    if (i > 0) dropAt += range(rng, tuning.stagger[0], tuning.stagger[1])
    const along = from + rng() * Math.min(tuning.spread, span[1] - span[0])
    const drip =
      spec.along === 'z' ? { x: spec.at, z: along } : { x: along, z: spec.at }
    // Off the edge, outward, give or take a wide angle.
    const turn = range(rng, -1.1, 1.1)
    const angle = Math.atan2(spec.out.z, spec.out.x) + turn
    const heading = { x: Math.cos(angle), z: Math.sin(angle) }
    const crawl = tuning.crawlSpeed * tuning.crawlSeconds
    slurms.push({
      drip,
      dropAt,
      landAt: dropAt + fallSeconds,
      heading,
      rest: { x: drip.x + heading.x * crawl, z: drip.z + heading.z * crawl },
      toothPeriod: range(rng, tuning.toothPeriod[0], tuning.toothPeriod[1]),
      toothPhase: rng(),
      smashAt: Infinity,
    })
  }
  const curse = Math.floor(rng() * CURSES.length)
  const plan = carlstenPlan(dripline, slurms)
  const lastSmash = Math.max(...slurms.map((s) => s.smashAt))
  return {
    station,
    slot,
    start,
    dripline,
    slurms,
    legs: plan.legs,
    out: plan.out,
    back: plan.back,
    curseAt: plan.curseAt,
    curse,
    end: Math.max(plan.back, lastSmash + tuning.splatSeconds),
  }
}

// The way round the canopy to a far edge, nearest corner first; nothing
// in the way of the store's side or the eave.
function route(dripline: Dripline, slurms: readonly Slurm[]): XZ[] {
  if (dripline === 'eave' || dripline === 'canopy-store') return []
  const spec = DRIPLINES[dripline]
  const mean = slurms.reduce((sum, s) => sum + s.drip.z, 0) / slurms.length
  const side = spec.along === 'x' ? Math.sign(spec.at) : mean < 0 ? -1 : 1
  const near = { x: -CORNER.x, z: side * CORNER.z }
  if (spec.along === 'x') return [near]
  return [near, { x: CORNER.x, z: side * CORNER.z }]
}

const distance = (a: XZ, b: XZ): number => Math.hypot(a.x - b.x, a.z - b.z)

// The yaw that turns a figure's +Z face from `from` toward `to`.
export function yawToward(from: XZ, to: XZ): number {
  return Math.atan2(to.x - from.x, to.z - from.z)
}

// Carlsten's legs: out from behind the counter once the first slurm is
// down, round to the edge, a swing at each slurm (nearest first; each
// slurm learns when it is smashed), a curse, and back the way he came.
function carlstenPlan(
  dripline: Dripline,
  slurms: Slurm[]
): { legs: Leg[]; out: number; back: number; curseAt: number } {
  const tuning = CONFIG.slurms
  const spec = DRIPLINES[dripline]
  const legs: Leg[] = []
  let t = slurms[0].landAt + tuning.reactSeconds
  const out = t
  let at: XZ = { x: clerk.x, z: clerk.z }
  let walked = 0
  const walkTo = (to: XZ) => {
    const length = distance(at, to)
    if (length < 1e-6) return
    const t1 = t + length / tuning.walkSpeed
    legs.push({ kind: 'walk', from: at, to, t0: t, t1, walked })
    walked += length
    at = to
    t = t1
  }
  const way = [BEHIND, OUTSIDE, ...route(dripline, slurms)]
  for (const point of way) walkTo(point)
  const left = [...slurms]
  let lastSmashed = slurms[0]
  while (left.length > 0) {
    // The nearest still crawling, from where he stands.
    left.sort((a, b) => distance(at, a.rest) - distance(at, b.rest))
    const slurm = left.shift() as Slurm
    walkTo({
      x: slurm.rest.x + spec.out.x * tuning.standOff,
      z: slurm.rest.z + spec.out.z * tuning.standOff,
    })
    const raised = t + tuning.windupSeconds
    const impact = raised + tuning.smashSeconds
    const t1 = impact + tuning.recoverSeconds
    legs.push({
      kind: 'swing',
      at,
      yaw: yawToward(at, slurm.rest),
      t0: t,
      raised,
      impact,
      t1,
    })
    slurm.smashAt = impact
    lastSmashed = slurm
    t = t1
  }
  const curseAt = lastSmashed.smashAt + tuning.curseDelay
  const lingered = Math.max(t, curseAt) + tuning.lingerSeconds
  legs.push({
    kind: 'curse',
    at,
    yaw: yawToward(at, lastSmashed.rest),
    t0: t,
    t1: lingered,
  })
  t = lingered
  for (const point of [...way].reverse()) walkTo(point)
  walkTo({ x: clerk.x, z: clerk.z })
  return { legs, out, back: t, curseAt }
}

// The drop under way at `station` at `seconds` (since the epoch on the
// shared clock), and how far into it; null between drops.
export function eventAt(
  station: number,
  seconds: number
): { event: SlurmEvent; t: number } | null {
  const slot = Math.floor(seconds / CONFIG.slurms.slotSeconds)
  for (const k of [slot, slot - 1]) {
    if (seconds < slotStart(station, k)) continue
    const event = slurmEvent(station, k)
    const t = seconds - event.start
    if (t < event.end) return { event, t }
  }
  return null
}

// When the next drop at `station` starts, at or after `seconds`.
export function nextStart(station: number, seconds: number): number {
  const slot = Math.floor(seconds / CONFIG.slurms.slotSeconds)
  const here = slotStart(station, slot)
  return here >= seconds ? here : slotStart(station, slot + 1)
}

// --- The drop at a moment ------------------------------------------------

export type SlurmPhase =
  'waiting' | 'falling' | 'crawling' | 'squashed' | 'gone'

export interface SlurmAt {
  phase: SlurmPhase
  x: number
  z: number
  // Falling, how far down it has come (0 at the edge, 1 on the lot);
  // squashed, how far the splat has faded (0 fresh, 1 gone).
  progress: number
  // The yaw that turns its head (+Z) the way it crawls.
  yaw: number
  // Its inchworm, a phase that runs while it crawls (0 to 1, looping).
  stretch: number
  // Its tooth: 0 in, 1 bared.
  tooth: number
}

export type CarlstenAction = 'stand' | 'walk' | 'windup' | 'smash' | 'recover'

export interface CarlstenAt {
  x: number
  z: number
  yaw: number
  action: CarlstenAction
  // Through the action, 0 to 1; walking, the metres walked this drop.
  beat: number
  walked: number
  // Out from behind the counter (no one to talk to there).
  away: boolean
}

export interface SlurmScene {
  slurms: SlurmAt[]
  carlsten: CarlstenAt
}

// Carlsten behind his counter, between drops.
export const AT_COUNTER: CarlstenAt = {
  x: clerk.x,
  z: clerk.z,
  yaw: clerk.yaw,
  action: 'stand',
  beat: 0,
  walked: 0,
  away: false,
}

function slurmAt(slurm: Slurm, t: number): SlurmAt {
  const yaw = Math.atan2(slurm.heading.x, slurm.heading.z)
  const base = { yaw, stretch: 0, tooth: 0 }
  if (t < slurm.dropAt) {
    return { ...base, phase: 'waiting', ...slurm.drip, progress: 0 }
  }
  if (t < slurm.landAt) {
    const f = (t - slurm.dropAt) / (slurm.landAt - slurm.dropAt)
    return { ...base, phase: 'falling', ...slurm.drip, progress: f * f }
  }
  if (t >= slurm.smashAt) {
    const since = t - slurm.smashAt
    const { splatSeconds } = CONFIG.slurms
    if (since >= splatSeconds) {
      return { ...base, phase: 'gone', ...slurm.rest, progress: 1 }
    }
    return {
      ...base,
      phase: 'squashed',
      ...slurm.rest,
      progress: since / splatSeconds,
    }
  }
  const { crawlSpeed, crawlSeconds, windupSeconds } = CONFIG.slurms
  const crawled = Math.min(t - slurm.landAt, crawlSeconds)
  const crawling = t - slurm.landAt < crawlSeconds
  // The tooth slides out once a period; it stays bared once the bat is up.
  const wave = Math.sin(
    2 * Math.PI * (t / slurm.toothPeriod + slurm.toothPhase)
  )
  const threatened = t >= slurm.smashAt - windupSeconds - 0.6
  return {
    ...base,
    phase: 'crawling',
    x: slurm.drip.x + slurm.heading.x * crawlSpeed * crawled,
    z: slurm.drip.z + slurm.heading.z * crawlSpeed * crawled,
    // It inches while it crawls, and only breathes after.
    stretch: crawling ? (crawled * 1.4) % 1 : ((t * 0.3) % 1) * 0.25,
    tooth: threatened ? 1 : clamp01((wave - 0.25) / 0.5),
    progress: 0,
  }
}

function carlstenAt(event: SlurmEvent, t: number): CarlstenAt {
  if (t < event.out || t >= event.back) return AT_COUNTER
  for (const leg of event.legs) {
    if (t >= leg.t1) continue
    if (t < leg.t0) break
    if (leg.kind === 'walk') {
      const f = (t - leg.t0) / (leg.t1 - leg.t0)
      const d = distance(leg.from, leg.to) * f
      return {
        x: leg.from.x + (leg.to.x - leg.from.x) * f,
        z: leg.from.z + (leg.to.z - leg.from.z) * f,
        yaw: yawToward(leg.from, leg.to),
        action: 'walk',
        beat: 0,
        walked: leg.walked + d,
        away: true,
      }
    }
    const at = { ...leg.at, yaw: leg.yaw, walked: 0, away: true }
    if (leg.kind === 'curse') return { ...at, action: 'stand', beat: 0 }
    if (t < leg.raised) {
      return {
        ...at,
        action: 'windup',
        beat: (t - leg.t0) / (leg.raised - leg.t0),
      }
    }
    if (t < leg.impact) {
      return {
        ...at,
        action: 'smash',
        beat: (t - leg.raised) / (leg.impact - leg.raised),
      }
    }
    return {
      ...at,
      action: 'recover',
      beat: (t - leg.impact) / (leg.t1 - leg.impact),
    }
  }
  return AT_COUNTER
}

// Everything of a drop `t` seconds into it.
export function slurmScene(event: SlurmEvent, t: number): SlurmScene {
  return {
    slurms: event.slurms.map((slurm) => slurmAt(slurm, t)),
    carlsten: carlstenAt(event, t),
  }
}

// --- Under a raider's feet -------------------------------------------------

// Where a raider's feet are, as the slurms feel them.
export interface Feet {
  x: number
  y: number
  z: number
}

// Whether any raider's feet come down on a slurm at (x, y, z): close
// enough across and near enough its height (not on a deck over it).
// Every client asks it of the raiders it sees, so a slurm one raider
// steps on is squashed for everyone, with nothing on the wire.
export function treads(
  at: Feet,
  feet: readonly Feet[],
  cfg = CONFIG.slurms
): boolean {
  return feet.some(
    (f) =>
      Math.hypot(f.x - at.x, f.z - at.z) <= cfg.treadReach &&
      Math.abs(f.y - at.y) <= cfg.treadHeight
  )
}

// A slurm squashed underfoot `since` seconds ago, at the spot it was.
export function underfoot(at: SlurmAt, since: number): SlurmAt {
  const { splatSeconds } = CONFIG.slurms
  return {
    ...at,
    phase: since >= splatSeconds ? 'gone' : 'squashed',
    progress: Math.min(1, since / splatSeconds),
    stretch: 0,
    tooth: 0,
  }
}

// --- What he says ---------------------------------------------------------

const CURSES = [
  copy('slurms.curse_1'),
  copy('slurms.curse_2'),
  copy('slurms.curse_3'),
  copy('slurms.curse_4'),
  copy('slurms.curse_5'),
  copy('slurms.curse_6'),
  copy('slurms.curse_7'),
  copy('slurms.curse_8'),
]

// What he says after a drop: its line, round again past the last.
export function curseOf(event: SlurmEvent): string {
  return CURSES[event.curse % CURSES.length]
}
