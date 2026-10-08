// The Bull Valley Cabbage Stand as an outpost, pure: every account keeps
// its own ledger at the one stand on the spawn Citgo's lot. Put cabbages
// and berries out on its table and it earns while you are away, at a flat
// rate for its level (the share of the table filled), banking on the
// valley's clock until it reaches its cap; come back and collect it into
// the wallet. Upgrades, paid in cash and goods, raise the table, the rate
// and the cap, and dress the stand (assets.ts buildStandDressing).
// sharedworld.ts runs these for the shared valley (rule 20), and the
// ledger is kept in D1 beside the wallet; the valley played alone has no
// stand, since nothing is kept. No three.js, no DOM.

import { CONFIG } from './config.ts'
import { copy } from './copy.ts'
import type { Inventory, XZ } from './interfaces.ts'

// One account's stand: its level (1 on), what is out on its table, the
// cents it had banked by `since` (fractional: it earns by the
// millisecond), and the server ms that was.
export interface StandLedger {
  level: number
  stock: Inventory
  banked: number
  since: number
}

export interface StandPrice {
  cash: number
  items: Inventory
}

export interface StandLevel {
  shelf: number
  rate: number
  capHours: number
  price: StandPrice | null
}

// Every account's stand before it is touched.
export const FRESH_STAND: StandLedger = {
  level: 1,
  stock: {},
  banked: 0,
  since: 0,
}

const HOUR_MS = 60 * 60 * 1000

function levels(cfg = CONFIG): readonly StandLevel[] {
  return cfg.stand.levels
}

// The highest level a stand reaches.
export function topLevel(cfg = CONFIG): number {
  return levels(cfg).length
}

// The level `ledger` stands at, its table, rate and cap.
export function levelOf(ledger: StandLedger, cfg = CONFIG): StandLevel {
  const all = levels(cfg)
  const i = Math.min(Math.max(Math.floor(ledger.level), 1), all.length) - 1
  return all[i]
}

// Whether `kind` goes out on the table.
export function isGood(kind: string, cfg = CONFIG): boolean {
  return cfg.stand.goods.includes(kind)
}

// How many goods are out on the table.
export function stocked(ledger: StandLedger, cfg = CONFIG): number {
  let n = 0
  for (const kind of cfg.stand.goods) n += ledger.stock[kind] || 0
  return n
}

// How many more goods the table takes.
export function shelfRoom(ledger: StandLedger, cfg = CONFIG): number {
  return Math.max(0, levelOf(ledger, cfg).shelf - stocked(ledger, cfg))
}

// What the stand earns an hour as it stands, in cents: the level's rate
// for the share of the table filled.
export function ratePerHour(ledger: StandLedger, cfg = CONFIG): number {
  const { shelf, rate } = levelOf(ledger, cfg)
  return (rate * Math.min(stocked(ledger, cfg), shelf)) / shelf
}

// The most it banks before it stops, in cents: the level's full-table rate
// for its cap hours.
export function capOf(ledger: StandLedger, cfg = CONFIG): number {
  const { rate, capHours } = levelOf(ledger, cfg)
  return rate * capHours
}

// What it has banked at server ms `now`, in cents, fractional.
export function accruedAt(
  ledger: StandLedger,
  now: number,
  cfg = CONFIG
): number {
  const cap = capOf(ledger, cfg)
  if (ledger.banked >= cap) return ledger.banked
  const elapsed = Math.max(0, now - ledger.since)
  return Math.min(
    cap,
    ledger.banked + (ratePerHour(ledger, cfg) * elapsed) / HOUR_MS
  )
}

// The whole cents there are to collect at `now`.
export function collectable(
  ledger: StandLedger,
  now: number,
  cfg = CONFIG
): number {
  return Math.floor(accruedAt(ledger, now, cfg))
}

// The server ms it reaches its cap, `now` if it has, or null if it never
// will (nothing on the table).
export function fullAt(
  ledger: StandLedger,
  now: number,
  cfg = CONFIG
): number | null {
  const accrued = accruedAt(ledger, now, cfg)
  const cap = capOf(ledger, cfg)
  if (accrued >= cap) return now
  const rate = ratePerHour(ledger, cfg)
  if (rate <= 0) return null
  return now + Math.ceil(((cap - accrued) * HOUR_MS) / rate)
}

// The ledger with what it earned up to `now` banked, so a change to the
// table or the level earns from then at the new rate.
export function settle(
  ledger: StandLedger,
  now: number,
  cfg = CONFIG
): StandLedger {
  return { ...ledger, banked: accruedAt(ledger, now, cfg), since: now }
}

// `count` of `kind` put out on the table at `now`, or null when it is not
// a good, the count is not one or more, or the table has no room for it.
// Whether the pack holds them is the caller's to check.
export function stock(
  ledger: StandLedger,
  kind: string,
  count: number,
  now: number,
  cfg = CONFIG
): StandLedger | null {
  if (!isGood(kind, cfg) || !Number.isInteger(count) || count < 1) return null
  if (count > shelfRoom(ledger, cfg)) return null
  const settled = settle(ledger, now, cfg)
  return {
    ...settled,
    stock: { ...settled.stock, [kind]: (settled.stock[kind] || 0) + count },
  }
}

// What is collected at `now`: the whole cents banked, out of the ledger
// (the fraction of a cent stays), or null with not a cent to collect.
export function collect(
  ledger: StandLedger,
  now: number,
  cfg = CONFIG
): { ledger: StandLedger; cents: number } | null {
  const settled = settle(ledger, now, cfg)
  const cents = Math.floor(settled.banked)
  if (cents < 1) return null
  return { ledger: { ...settled, banked: settled.banked - cents }, cents }
}

// What the next level costs, or null at the top.
export function upgradePrice(
  ledger: StandLedger,
  cfg = CONFIG
): StandPrice | null {
  if (ledger.level >= topLevel(cfg)) return null
  return levels(cfg)[ledger.level].price
}

// Whether `cash` (cents) and `pack` cover the next level.
export function affordsUpgrade(
  ledger: StandLedger,
  cash: number,
  pack: Inventory,
  cfg = CONFIG
): boolean {
  const price = upgradePrice(ledger, cfg)
  if (!price) return false
  if (cash < price.cash) return false
  return Object.entries(price.items).every(
    ([kind, count]) => (pack[kind] || 0) >= count
  )
}

// The stand a level up at `now`, what it earned so far banked first, or
// null at the top. Whether the raider can pay is the caller's to check.
export function upgrade(
  ledger: StandLedger,
  now: number,
  cfg = CONFIG
): StandLedger | null {
  if (ledger.level >= topLevel(cfg)) return null
  return { ...settle(ledger, now, cfg), level: ledger.level + 1 }
}

// Whether a raider at `at` stands close enough to the stand at `stand`
// for the valley to tend it.
export function atStand(
  at: XZ | null,
  stand: XZ | null,
  cfg = CONFIG
): boolean {
  if (!at || !stand) return false
  return Math.hypot(at.x - stand.x, at.z - stand.z) <= cfg.stand.tendReach
}

// A ledger as D1 or the wire holds it, checked: a level in range, goods
// only, whole non-negative counts, finite non-negative cents.
export function isStandLedger(
  value: unknown,
  cfg = CONFIG
): value is StandLedger {
  if (typeof value !== 'object' || value === null) return false
  const {
    level,
    stock: goods,
    banked,
    since,
  } = value as Record<string, unknown>
  if (typeof level !== 'number' || !Number.isInteger(level)) return false
  if (level < 1 || level > topLevel(cfg)) return false
  if (typeof banked !== 'number' || !Number.isFinite(banked) || banked < 0) {
    return false
  }
  if (typeof since !== 'number' || !Number.isFinite(since)) return false
  if (typeof goods !== 'object' || goods === null || Array.isArray(goods)) {
    return false
  }
  return Object.entries(goods).every(
    ([kind, n]) =>
      isGood(kind, cfg) &&
      typeof n === 'number' &&
      Number.isInteger(n) &&
      n >= 0
  )
}

// The line that says why the valley refused to tend the stand
// (sharedworld.ts rule 20's nack reasons).
export function refusalLine(reason: string): string {
  switch (reason) {
    case 'no-stand':
    case 'aboard':
      return copy('log.stand_far')
    case 'short':
      return copy('log.stand_short')
    case 'none-left':
      return copy('log.stand_none')
    case 'no-room':
      return copy('log.stand_full')
    case 'empty':
      return copy('log.stand_empty')
    case 'top':
      return copy('log.stand_top')
    case 'not-in-valley':
      return copy('log.stand_offline')
    default:
      return copy('log.stand_refused')
  }
}
