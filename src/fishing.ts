// Fishing at the firefly pond behind the spawn Citgo (sharedworld.ts rule
// 35), pure, after Final Fantasy XI's, the gold standard. A raider with a
// rod out of the tackle box on the landing baits the hook (nightcrawlers
// dug out of the mud bank, or the berries, which the carp take), casts,
// and waits. Nothing may bite. Something that does says how big it is
// ("Something caught the hook!", three marks for a large one, a pull for
// junk), and, when it is well past the raider's skill, a feeling that
// says so. Then the fight: arrows come left and right, each one pressed in
// time drains the fish's stamina (a gold one far more), a wrong key or a
// missed arrow gives it back, a fish far past the raider pulls back on its
// own, and the clock runs. Stamina gone, the raider reels it in, and the
// valley judges the catch on the skill: a fish too far past it is lost for
// the lack of it, a large one snapping the line. Only a catch above the
// raider's skill can raise it, a tenth at a time, most often on a fish
// about eleven levels up, as FFXI's does. What bites hangs on the bait,
// the hour in Central time and the skill. An account takes so many a day
// (FFXI's fatigue); past it nothing bites until the day turns. The
// valley draws every roll; the client only plays the fight it was dealt.
// No three.js, no DOM.

import { CONFIG } from './config.ts'
import { centralHour, dayKey } from './daily.ts'
import { isItemId } from './items.ts'
import { mulberry32 } from './rng.ts'
import type { Water, XZ } from './interfaces.ts'
import type { ItemId } from './items.ts'

type FishingConfig = typeof CONFIG.fishing

// What goes on the hook.
export const BAITS = ['nightcrawlers', 'berries'] as const
export type Bait = (typeof BAITS)[number]

export function isBait(value: unknown): value is Bait {
  return (BAITS as readonly unknown[]).includes(value)
}

// The time of day a fish keeps, by the Central hour: dawn 5 to 7, day 8
// to 16, dusk 17 to 19, night 20 to 4.
export type HourBand = 'dawn' | 'day' | 'dusk' | 'night'

export function bandOf(hour: number): HourBand {
  if (hour >= 5 && hour < 8) return 'dawn'
  if (hour >= 8 && hour < 17) return 'day'
  if (hour >= 17 && hour < 20) return 'dusk'
  return 'night'
}

// How a catch fights: a small fish, a large one, or the pond's legend
// (a large one on a longer clock).
export type Size = 'small' | 'large'

// What can take the hook: each fish (or the junk), its level against the
// raider's skill (in whole levels, 1 to 100), its size, how well it takes
// each bait (0 never, 3 best), the hours it bites at (every hour when
// absent), how rare it is over its tier's weight, and whether it is the
// legend. The empty can is junk: a pull, not a bite, and no skill in it.
export interface Catchable {
  kind: ItemId
  level: number
  size: Size
  bait: Partial<Record<Bait, 0 | 1 | 2 | 3>>
  hours?: readonly HourBand[]
  rarity?: number
  legend?: true
  junk?: true
}

export const FISH: readonly Catchable[] = [
  {
    kind: 'empty-can',
    level: 1,
    size: 'small',
    bait: { nightcrawlers: 1, berries: 1 },
    rarity: 0.5,
    junk: true,
  },
  {
    kind: 'bluegill',
    level: 1,
    size: 'small',
    bait: { nightcrawlers: 3, berries: 1 },
  },
  {
    kind: 'pumpkinseed',
    level: 6,
    size: 'small',
    bait: { nightcrawlers: 3 },
    hours: ['dawn', 'day', 'dusk'],
  },
  {
    kind: 'yellow-perch',
    level: 12,
    size: 'small',
    bait: { nightcrawlers: 2 },
    hours: ['dawn', 'day'],
  },
  {
    kind: 'black-crappie',
    level: 20,
    size: 'small',
    bait: { nightcrawlers: 2 },
    hours: ['dawn', 'dusk', 'night'],
  },
  {
    kind: 'bullhead',
    level: 28,
    size: 'small',
    bait: { nightcrawlers: 3, berries: 1 },
    hours: ['dusk', 'night'],
  },
  {
    kind: 'largemouth-bass',
    level: 40,
    size: 'large',
    bait: { nightcrawlers: 2 },
    hours: ['dawn', 'dusk'],
  },
  {
    kind: 'channel-catfish',
    level: 55,
    size: 'large',
    bait: { nightcrawlers: 3, berries: 1 },
    hours: ['dusk', 'night'],
  },
  {
    kind: 'common-carp',
    level: 65,
    size: 'large',
    bait: { nightcrawlers: 1, berries: 3 },
    hours: ['dawn', 'day', 'dusk'],
  },
  {
    kind: 'ghost-catfish',
    level: 95,
    size: 'large',
    bait: { nightcrawlers: 1 },
    hours: ['night'],
    rarity: 0.1,
    legend: true,
  },
]

export function catchableOf(kind: string): Catchable | null {
  return FISH.find((fish) => fish.kind === kind) ?? null
}

// --- The rods ----------------------------------------------------------

// What a rod does for the raider holding it, as FFXI's rods do: `power`
// levels over the skill for the fight and the catch (never for raising
// the skill, which is the raider's own), the clock `clock` times as long,
// and `gold` more of a chance at a gold arrow. The tackle box's rod is
// plain; the Citgo's rack sells the rest.
export interface RodStats {
  power: number
  clock: number
  gold: number
}

export const BOX_ROD = 'fishing-rod'

export const RODS: Readonly<Record<string, RodStats>> = {
  [BOX_ROD]: { power: 0, clock: 1, gold: 0 },
  'zebco-33': { power: 5, clock: 1.1, gold: 0.02 },
  'ugly-stik': { power: 12, clock: 1.25, gold: 0.05 },
  'g-loomis': { power: 25, clock: 1.5, gold: 0.1 },
}

export function rodStats(rod: string): RodStats {
  return RODS[rod] ?? RODS[BOX_ROD]
}

// The best rod `pack` holds, or null for none: what a cast fishes with.
export function rodIn(pack: Readonly<Record<string, number>>): string | null {
  let best: string | null = null
  for (const [rod, stats] of Object.entries(RODS)) {
    if ((pack[rod] ?? 0) < 1) continue
    if (best === null || stats.power > rodStats(best).power) best = rod
  }
  return best
}

// The skill a fish is fought and landed against with `rod`, in tenths.
export function reachOf(skill: number, rod: string): number {
  return skill + rodStats(rod).power * 10
}

// --- The angler --------------------------------------------------------

// One account's fishing, kept by the valley (Valley.anglers): its skill in
// tenths of a level (0 to CONFIG.fishing.skillCap), the Central day its
// count belongs to and how many it has taken off the line that day, and
// when it may next dig the mud bank (valley ms).
export interface Angler {
  skill: number
  day: string
  caught: number
  digAt: number
}

export const FRESH_ANGLER: Angler = { skill: 0, day: '', caught: 0, digAt: 0 }

// An angler as the wire carries it: the skill in tenths, today's count and
// the day's limit, and when the bank may next be dug (valley ms).
export interface AnglerWire {
  skill: number
  caught: number
  perDay: number
  digAt: number
}

export function anglerWire(
  angler: Angler,
  now: number,
  cfg: FishingConfig = CONFIG.fishing
): AnglerWire {
  return {
    skill: angler.skill,
    caught: caughtToday(angler, now),
    perDay: cfg.perDay,
    digAt: angler.digAt,
  }
}

// An angler off the wire, every field whole and in range; null for
// anything that is not one.
export function toAnglerWire(raw: unknown): AnglerWire | null {
  if (!raw || typeof raw !== 'object') return null
  const { skill, caught, perDay, digAt } = raw as Record<string, unknown>
  const whole = (n: unknown): n is number =>
    typeof n === 'number' && Number.isInteger(n) && n >= 0
  if (!whole(skill) || !whole(caught) || !whole(perDay)) return null
  if (typeof digAt !== 'number' || !Number.isFinite(digAt)) return null
  return { skill, caught, perDay, digAt }
}

// The skill in whole levels, as the fish are measured against it.
export function skillLevel(skill: number): number {
  return Math.floor(skill / 10)
}

// The skill as the dialog shows it: 12.3.
export function skillText(skill: number): string {
  return (skill / 10).toFixed(1)
}

// What the angler has taken off the line today.
export function caughtToday(angler: Angler, now: number): number {
  return angler.day === dayKey(now) ? angler.caught : 0
}

// Whether the day's limit is reached: nothing bites until the day turns.
export function tired(
  angler: Angler,
  now: number,
  cfg: FishingConfig = CONFIG.fishing
): boolean {
  return caughtToday(angler, now) >= cfg.perDay
}

// One more off the line today.
export function counted(angler: Angler, now: number): Angler {
  return { ...angler, day: dayKey(now), caught: caughtToday(angler, now) + 1 }
}

// --- The hook ----------------------------------------------------------

// How the hook says what took it: a small fish, a large one, or the pull
// of something that is not a fish.
export type HookCall = 'small' | 'large' | 'item'

// What the raider senses of a fish far past their skill (FFXI's lines),
// mildest first; nothing for one within reach.
export type Feeling = 'unsure' | 'fairly' | 'positive'

// The levels a fish must stand over the skill before a feeling shows,
// each line's from there.
const FEELINGS: readonly [number, Feeling][] = [
  [35, 'positive'],
  [20, 'fairly'],
  [8, 'unsure'],
]

export function feelingOf(level: number, skill: number): Feeling | null {
  const gap = level - skillLevel(skill)
  for (const [over, feeling] of FEELINGS) if (gap >= over) return feeling
  return null
}

// What took the hook, on the valley's draw.
export interface Hook {
  kind: ItemId
  call: HookCall
  feeling: Feeling | null
  // The legend's own line: the verge of an epic catch.
  epic: boolean
}

// How heavily `fish` weighs in the draw on `bait` at `band` for `skill`:
// its tier's weight, cut for its rarity and for every level it stands over
// the skill (never below the floor of it); 0 for one that will not bite.
export function weightOf(
  fish: Catchable,
  bait: Bait,
  band: HourBand,
  skill: number,
  cfg: FishingConfig = CONFIG.fishing
): number {
  const tier = fish.bait[bait] ?? 0
  if (tier === 0) return 0
  if (fish.hours && !fish.hours.includes(band)) return 0
  const gap = Math.max(0, fish.level - skillLevel(skill))
  const cut = Math.max(cfg.gapFloor, 1 - gap * cfg.gapRarity)
  return cfg.tierWeights[tier] * (fish.rarity ?? 1) * cut
}

// What takes the hook on `bait` at `now` (valley ms, read as the Central
// hour), for an angler of `skill`, with the valley's `roll` (0 to 1):
// a fish, the junk, or nothing (null).
export function hookOf(
  bait: Bait,
  now: number,
  skill: number,
  roll: number,
  cfg: FishingConfig = CONFIG.fishing
): Hook | null {
  const band = bandOf(centralHour(now))
  const weighed = FISH.map((fish) => ({
    fish,
    weight: weightOf(fish, bait, band, skill, cfg),
  })).filter((w) => w.weight > 0)
  const total = weighed.reduce((sum, w) => sum + w.weight, cfg.nothingWeight)
  let left = roll * total - cfg.nothingWeight
  if (left < 0) return null
  for (const { fish, weight } of weighed) {
    left -= weight
    if (left < 0) return hookFor(fish, skill)
  }
  const last = weighed[weighed.length - 1]
  return last ? hookFor(last.fish, skill) : null
}

function hookFor(fish: Catchable, skill: number): Hook {
  return {
    kind: fish.kind,
    call: fish.junk ? 'item' : fish.size,
    feeling: fish.junk ? null : feelingOf(fish.level, skill),
    epic: fish.legend === true,
  }
}

// --- The fight ---------------------------------------------------------

// The fight a hooked `kind` puts up against `skill`, as both the client
// (which plays it) and the valley (which times the reel against it)
// reckon it. A fish under the skill drains quicker, one over it slower;
// one more than ten levels over pulls back on its own (`regen` a second).
export interface Fight {
  stamina: number
  arrowMs: number
  windowMs: number
  silver: number
  gold: number
  goldChance: number
  pull: number
  regen: number
  limitMs: number
}

export function fightOf(
  kind: string,
  skill: number,
  rod: string = BOX_ROD,
  cfg: FishingConfig = CONFIG.fishing
): Fight {
  const fish = catchableOf(kind) ?? FISH[1]
  const f = cfg.fight
  const stats = rodStats(rod)
  const gap = fish.level - skillLevel(reachOf(skill, rod))
  const ease = Math.min(1.6, Math.max(0.4, 1 - gap * 0.015))
  const silver = Math.round(f.silver * ease * 10) / 10
  return {
    stamina: f.stamina,
    arrowMs: f.arrowMs[fish.size],
    windowMs: f.windowMs[fish.size],
    silver,
    gold: Math.round(silver * f.gold * 10) / 10,
    goldChance: Math.min(
      0.4,
      f.goldChance + Math.max(0, -gap) * 0.005 + stats.gold
    ),
    pull: f.pull[fish.size],
    regen: Math.max(0, gap - 10) * 0.1,
    limitMs: Math.round(
      (fish.legend ? f.limitMs.legend : f.limitMs[fish.size]) * stats.clock
    ),
  }
}

// The quickest the fight could be won: every arrow gold, pressed the
// moment it shows.
export function quickestMs(fight: Fight): number {
  return Math.ceil(fight.stamina / fight.gold) * fight.arrowMs
}

// Whether the valley takes a reel `sinceBite` ms after the bite: no
// sooner than a share of the quickest fight, no later than the clock and
// a little slack.
export function reelInTime(
  fight: Fight,
  sinceBite: number,
  cfg: FishingConfig = CONFIG.fishing
): boolean {
  return (
    sinceBite >= quickestMs(fight) * cfg.fastShare &&
    sinceBite <= fight.limitMs + cfg.lateMs
  )
}

export type ArrowDir = 'left' | 'right'

export interface Arrow {
  dir: ArrowDir
  gold: boolean
  // When it showed, ms into the fight.
  at: number
}

// The fight as the client plays it, ms from the bite.
export interface FightState {
  ms: number
  stamina: number
  arrow: Arrow | null
  // How many arrows have shown, and when the next one does.
  shown: number
  next: number
  // Whether the clock ran out.
  over: boolean
}

export function startFight(fight: Fight): FightState {
  return {
    ms: 0,
    stamina: fight.stamina,
    arrow: null,
    shown: 0,
    next: fight.arrowMs,
    over: false,
  }
}

// The `i`th arrow of the fight `seed` deals: which way, and gold or not.
export function arrowOf(
  seed: number,
  i: number,
  fight: Fight
): Omit<Arrow, 'at'> {
  const rng = mulberry32((seed ^ Math.imul(i + 1, 0x9e3779b1)) >>> 0)
  return { dir: rng() < 0.5 ? 'left' : 'right', gold: rng() < fight.goldChance }
}

// Whether the fish is spent: the raider can reel it in.
export function spent(state: FightState): boolean {
  return state.stamina <= 0
}

// Whether the clock is close enough to running out to say so.
export function warned(
  fight: Fight,
  state: FightState,
  cfg: FishingConfig = CONFIG.fishing
): boolean {
  return !state.over && state.ms >= fight.limitMs - cfg.fight.warnMs
}

// The fight `dt` ms on: a fish over the skill pulls back, an arrow left
// too long counts against the raider, the next arrow shows when it is
// due, and the clock runs out. A spent fish stays spent and shows no more
// arrows.
export function stepFight(
  fight: Fight,
  state: FightState,
  dt: number,
  seed: number
): FightState {
  if (state.over) return state
  const ms = state.ms + dt
  let { stamina, arrow, shown, next } = state
  if (stamina > 0) {
    stamina = Math.min(fight.stamina, stamina + (fight.regen * dt) / 1000)
    if (arrow && ms > arrow.at + fight.windowMs) {
      stamina = Math.min(fight.stamina, stamina + fight.pull)
      arrow = null
      next = ms + fight.arrowMs
    }
    if (!arrow && ms >= next) {
      arrow = { ...arrowOf(seed, shown, fight), at: ms }
      shown++
    }
  } else {
    arrow = null
  }
  return { ms, stamina, arrow, shown, next, over: ms >= fight.limitMs }
}

// A key pressed: the arrow's way drains the fish, the wrong way (or a key
// with no arrow showing) gives it back. A spent fish takes no more.
export function pressFight(
  fight: Fight,
  state: FightState,
  dir: ArrowDir
): FightState {
  if (state.over || state.stamina <= 0) return state
  const { arrow } = state
  const next = state.ms + fight.arrowMs
  if (arrow && arrow.dir === dir) {
    const drain = arrow.gold ? fight.gold : fight.silver
    return {
      ...state,
      stamina: Math.max(0, state.stamina - drain),
      arrow: null,
      next,
    }
  }
  return {
    ...state,
    stamina: Math.min(fight.stamina, state.stamina + fight.pull),
    arrow: null,
    next: arrow ? next : state.next,
  }
}

// A hook as the valley sends it to the raider who cast (protocol.ts
// LineMessage): how it calls, the feeling, whether it is the legend, and
// the fight it puts up, whose arrows `seed` deals; what it is stays the
// valley's until it is landed.
export interface HookWire {
  call: HookCall
  feeling: Feeling | null
  epic: boolean
  fight: Fight
  seed: number
}

// A line in the water as the client holds it: what took it (null for
// nothing), and when it bites (or comes up empty), local ms.
export interface LineOut {
  hook: HookWire | null
  bitesAt: number
}

// A line message as the client holds it, received at local `now`: it
// bites (or comes up empty) `bitesIn` ms on.
export function lineOutOf(
  msg: { bitesIn: number; hook: HookWire | null },
  now: number
): LineOut {
  return { hook: msg.hook, bitesAt: now + Math.max(0, msg.bitesIn) }
}

// --- The catch ---------------------------------------------------------

// How a line out ends, as the valley tells it: landed, lost for the lack
// of skill, the line snapped (a large one lost the same way), or given up
// (the raider's word, or the clock run out).
export type CatchOutcome = 'landed' | 'skill' | 'snap' | 'gave-up'

// The chance a spent fish comes in, by how far it stands over the skill:
// sure within ten levels, never past fifty.
export function landChance(level: number, skill: number): number {
  const gap = level - skillLevel(skill)
  if (gap <= 10) return 1
  return Math.max(0, 1 - (gap - 10) / 40)
}

// A spent fish reeled in, on the valley's `roll`.
export function landOf(
  kind: string,
  skill: number,
  roll: number,
  rod: string = BOX_ROD
): 'landed' | 'skill' | 'snap' {
  const fish = catchableOf(kind)
  if (!fish || roll < landChance(fish.level, reachOf(skill, rod))) {
    return 'landed'
  }
  return fish.size === 'large' ? 'snap' : 'skill'
}

// The chance a landed fish raises the skill: only one over it, and no
// more than fifty over; most often about eleven over, and never under 4%;
// a beginner's a little more often.
export function skillUpChance(level: number, skill: number): number {
  const gap = level - skillLevel(skill)
  if (gap <= 0 || gap > 50) return 0
  const bell = 0.6 * Math.exp(-((gap - 11) ** 2) / (2 * 5 ** 2))
  const beginner = skill < 200 ? 0.1 : 0
  return Math.min(1, Math.max(0.04, bell) + beginner)
}

// The skill after landing `kind`, on the valley's two rolls: a tenth up on
// the first, and, ten levels or more over, up to two tenths more on the
// second. Junk raises nothing; the cap holds.
export function skillAfter(
  kind: string,
  skill: number,
  roll: number,
  bonus: number,
  cfg: FishingConfig = CONFIG.fishing
): number {
  const fish = catchableOf(kind)
  if (!fish || fish.junk) return skill
  if (roll >= skillUpChance(fish.level, skill)) return skill
  const gap = fish.level - skillLevel(skill)
  const more = gap >= 10 ? Math.floor(bonus * 3) : 0
  return Math.min(cfg.skillCap, skill + 1 + more)
}

// --- Digging -----------------------------------------------------------

// How many nightcrawlers a dig turns up, on the valley's roll.
export function dugOf(
  roll: number,
  cfg: FishingConfig = CONFIG.fishing
): number {
  const { min, max } = cfg.dig
  return Math.min(max, min + Math.floor(roll * (max - min + 1)))
}

// Whether the bank is ready to dig again at `now`.
export function canDig(angler: Angler, now: number): boolean {
  return now >= angler.digAt
}

export function dugAt(
  angler: Angler,
  now: number,
  cfg: FishingConfig = CONFIG.fishing
): Angler {
  return { ...angler, digAt: now + cfg.dig.cooldownSeconds * 1000 }
}

// --- The pond ----------------------------------------------------------

// The pond as the valley knows it: its middle, how far the fireflies'
// haven reaches from it (past the farthest shore), and the landing where
// the tackle box stands.
export interface PondPlace {
  x: number
  z: number
  radius: number
  landing: XZ
}

// The pond as the client draws it: its place, and its shore in the world.
export interface Pond extends PondPlace {
  shore: XZ[]
}

// The pond: the water area whose shore comes nearest `from` (the spawn
// Citgo's pump island), within CONFIG.fishing.pond.search; its middle the
// mean of its shore, its haven past the farthest of it, and the landing
// on the shore nearest `from`, set back from the water. Null with no such
// water.
export function pondOf(
  water: readonly Water[],
  toWorld: (u: number, v: number) => XZ,
  from: XZ,
  cfg: FishingConfig = CONFIG.fishing
): Pond | null {
  let best: { shore: XZ[]; d: number } | null = null
  for (const feature of water) {
    if (feature.k !== 'area' || feature.p.length < 3) continue
    const shore = feature.p.map(([u, v]) => toWorld(u, v))
    const d = shoreDistance(shore, from)
    if (d > cfg.pond.search) continue
    if (!best || d < best.d) best = { shore, d }
  }
  if (!best) return null
  const { shore } = best
  const x = shore.reduce((sum, p) => sum + p.x, 0) / shore.length
  const z = shore.reduce((sum, p) => sum + p.z, 0) / shore.length
  const far = Math.max(...shore.map((p) => Math.hypot(p.x - x, p.z - z)))
  const near = nearestOnShore(shore, from)
  const out = Math.hypot(near.x - x, near.z - z) || 1
  const landing = {
    x: near.x + ((near.x - x) / out) * cfg.pond.landingBack,
    z: near.z + ((near.z - z) / out) * cfg.pond.landingBack,
  }
  return { x, z, radius: far + cfg.pond.margin, landing, shore }
}

// The point of the closed shore nearest `p`.
function nearestOnShore(shore: readonly XZ[], p: XZ): XZ {
  let best = shore[0]
  let bestD = Infinity
  for (let i = 0; i < shore.length; i++) {
    const a = shore[i]
    const b = shore[(i + 1) % shore.length]
    const dx = b.x - a.x
    const dz = b.z - a.z
    const len = dx * dx + dz * dz
    const t =
      len > 0
        ? Math.min(1, Math.max(0, ((p.x - a.x) * dx + (p.z - a.z) * dz) / len))
        : 0
    const q = { x: a.x + dx * t, z: a.z + dz * t }
    const d = Math.hypot(p.x - q.x, p.z - q.z)
    if (d < bestD) {
      bestD = d
      best = q
    }
  }
  return best
}

// How far `p` is from the closed shore.
export function shoreDistance(shore: readonly XZ[], p: XZ): number {
  const q = nearestOnShore(shore, p)
  return Math.hypot(p.x - q.x, p.z - q.z)
}

// Whether `p` is in the fireflies' haven.
export function inPond(pond: PondPlace | null, p: XZ): boolean {
  return pond !== null && Math.hypot(p.x - pond.x, p.z - pond.z) < pond.radius
}

// A pond place off the wire: every number finite and the radius
// positive; null for anything else.
export function toPondPlace(raw: unknown): PondPlace | null {
  if (!raw || typeof raw !== 'object') return null
  const { x, z, radius, landing } = raw as Record<string, unknown>
  const finite = (n: unknown): n is number =>
    typeof n === 'number' && Number.isFinite(n)
  if (!finite(x) || !finite(z) || !finite(radius) || radius <= 0) return null
  if (!landing || typeof landing !== 'object') return null
  const { x: lx, z: lz } = landing as Record<string, unknown>
  if (!finite(lx) || !finite(lz)) return null
  return { x, z, radius, landing: { x: lx, z: lz } }
}

// Whether `kind` comes off the pond (a fish, or its junk).
export function isCatch(kind: string): boolean {
  return isItemId(kind) && catchableOf(kind) !== null
}
