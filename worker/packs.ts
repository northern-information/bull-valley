// The pack store: what each account carries and the cash in its wallet,
// kept by the valley so they follow the raider to any browser. The
// interface is here with an in-memory store for the tests; production is
// the D1 store in d1packs.ts. The rules of what goes in and out are
// src/sharedworld.ts's (rules 7, 10, 16, 18, 19 and 20).

import { CONFIG } from '../src/config.ts'
import { toCosmetics } from '../src/cosmetics.ts'
import { NO_TASK } from '../src/dailytask.ts'
import { STARTING_INVENTORY, toInventory } from '../src/inventory.ts'
import { NO_PROGRESS } from '../src/season.ts'
import type { CosmeticId } from '../src/cosmetics.ts'
import type { TaskProgress } from '../src/dailytask.ts'
import type { Inventory } from '../src/interfaces.ts'
import type { SeasonProgress, SeasonReward } from '../src/season.ts'

// A new account's wallet, in cents.
export const STARTING_CASH = CONFIG.store.startingCash

export interface Holdings {
  pack: Inventory
  // In cents.
  cash: number
  // Had for good (src/cosmetics.ts).
  cosmetics: CosmeticId[]
  // What the account's locker holds (src/stash.ts).
  stash: Inventory
}

export interface PackStore {
  // The account's holdings, with the starting pack and wallet given the
  // first time.
  open(accountId: string): Promise<Holdings>
  get(accountId: string): Promise<Holdings>
  // Adds `delta` of `kind`. A negative delta is taken only when the pack
  // holds that many; false when it does not.
  change(accountId: string, kind: string, delta: number): Promise<boolean>
  // A sale: takes `amount` cents and adds `item`, if there is one, both or
  // neither; false when the wallet does not cover it.
  purchase(
    accountId: string,
    amount: number,
    item: PackItem | null
  ): Promise<boolean>
  // Everything the pack holds, taken out at once and returned: a strike
  // (sharedworld.ts rule 18). Each kind is left at zero, never removed, so
  // the starting items are never given again.
  strip(accountId: string): Promise<Inventory>
  // Units back into the pack, all or none: a body looted, or a strip the
  // valley could not lay a body for.
  give(accountId: string, items: Inventory): Promise<void>
  // `delta` of `kind` out of the pack into the locker (positive), or out of
  // the locker into the pack (negative), both or neither; false when the
  // side it comes out of holds fewer (rule 19).
  stow(accountId: string, kind: string, delta: number): Promise<boolean>
  // Pays `amount` cents into the wallet (dimes taken up).
  earn(accountId: string, amount: number): Promise<void>
  // A trade (sharedworld.ts rule 14): `price.count` of `price.kind` out of
  // the pack and `cosmetic` the account's, both or neither; false when the
  // pack does not cover it or the account has it already.
  trade(
    accountId: string,
    price: { kind: string; count: number },
    cosmetic: CosmeticId
  ): Promise<boolean>
  // The account's progress through `season`, nothing done before the first
  // unmaking.
  season(accountId: string, season: string): Promise<SeasonProgress>
  // Writes the progress after an unmaking (season.ts tally) and, with it,
  // the reward that unmaking paid, if any: the cash into the wallet and the
  // units into the pack, all or nothing.
  score(
    accountId: string,
    season: string,
    progress: SeasonProgress,
    reward: SeasonReward | null
  ): Promise<void>
  // The account's progress on daily task `task` as last written, on
  // whatever day that was (dailytask.ts onDay reads it for today).
  task(accountId: string, task: string): Promise<TaskProgress>
  // Writes the progress after a burn (dailytask.ts tallyTask) and, with
  // it, the cents that burn paid, if any, all or nothing.
  scoreTask(
    accountId: string,
    task: string,
    progress: TaskProgress,
    reward: number | null
  ): Promise<void>
  // The account's XP in all (src/progression.ts), none before the first.
  xp(accountId: string): Promise<number>
  // Adds `amount` XP to the account's, in one step however many grants
  // land at once, and returns its XP in all after.
  gainXp(accountId: string, amount: number): Promise<number>
}

// Units of one kind going into a pack.
export interface PackItem {
  kind: string
  delta: number
}

export class MemoryPackStore implements PackStore {
  readonly packs = new Map<string, Map<string, number>>()
  readonly wallets = new Map<string, number>()
  readonly cosmetics = new Map<string, Set<CosmeticId>>()
  readonly stashes = new Map<string, Map<string, number>>()
  // `${account}/${season}` -> progress.
  readonly seasons = new Map<string, SeasonProgress>()
  // `${account}/${task}` -> progress.
  readonly tasks = new Map<string, TaskProgress>()
  readonly levels = new Map<string, number>()

  open(accountId: string): Promise<Holdings> {
    if (!this.packs.has(accountId)) {
      const rows = new Map<string, number>()
      for (const [kind, count] of Object.entries(STARTING_INVENTORY)) {
        if (count > 0) rows.set(kind, count)
      }
      this.packs.set(accountId, rows)
    }
    if (!this.wallets.has(accountId)) {
      this.wallets.set(accountId, STARTING_CASH)
    }
    return this.get(accountId)
  }

  get(accountId: string): Promise<Holdings> {
    const rows = this.packs.get(accountId) ?? new Map<string, number>()
    return Promise.resolve({
      pack: toInventory(Object.fromEntries(rows)),
      cash: this.wallets.get(accountId) ?? 0,
      cosmetics: toCosmetics([...(this.cosmetics.get(accountId) ?? [])]),
      stash: toInventory(
        Object.fromEntries(this.stashes.get(accountId) ?? new Map())
      ),
    })
  }

  strip(accountId: string): Promise<Inventory> {
    const rows = this.packs.get(accountId) ?? new Map<string, number>()
    const taken: Inventory = {}
    for (const [kind, count] of rows) {
      if (count > 0) taken[kind] = count
      rows.set(kind, 0)
    }
    return Promise.resolve(taken)
  }

  async give(accountId: string, items: Inventory): Promise<void> {
    for (const [kind, count] of Object.entries(items)) {
      if (count > 0) await this.change(accountId, kind, count)
    }
  }

  stow(accountId: string, kind: string, delta: number): Promise<boolean> {
    const pack = this.packs.get(accountId) ?? new Map<string, number>()
    const stash = this.stashes.get(accountId) ?? new Map<string, number>()
    const [from, to] = delta > 0 ? [pack, stash] : [stash, pack]
    const count = Math.abs(delta)
    const held = from.get(kind) ?? 0
    if (count < 1 || held < count) return Promise.resolve(false)
    from.set(kind, held - count)
    to.set(kind, (to.get(kind) ?? 0) + count)
    this.packs.set(accountId, pack)
    this.stashes.set(accountId, stash)
    return Promise.resolve(true)
  }

  change(accountId: string, kind: string, delta: number): Promise<boolean> {
    const rows = this.packs.get(accountId) ?? new Map<string, number>()
    const next = (rows.get(kind) ?? 0) + delta
    if (next < 0) return Promise.resolve(false)
    rows.set(kind, next)
    this.packs.set(accountId, rows)
    return Promise.resolve(true)
  }

  async purchase(
    accountId: string,
    amount: number,
    item: PackItem | null
  ): Promise<boolean> {
    const cash = this.wallets.get(accountId) ?? 0
    if (cash < amount) return false
    this.wallets.set(accountId, cash - amount)
    if (item) await this.change(accountId, item.kind, item.delta)
    return true
  }

  earn(accountId: string, amount: number): Promise<void> {
    const cash = this.wallets.get(accountId) ?? STARTING_CASH
    this.wallets.set(accountId, cash + amount)
    return Promise.resolve()
  }

  async trade(
    accountId: string,
    price: { kind: string; count: number },
    cosmetic: CosmeticId
  ): Promise<boolean> {
    const owned = this.cosmetics.get(accountId) ?? new Set<CosmeticId>()
    if (owned.has(cosmetic)) return false
    if (!(await this.change(accountId, price.kind, -price.count))) return false
    this.cosmetics.set(accountId, owned.add(cosmetic))
    return true
  }

  season(accountId: string, season: string): Promise<SeasonProgress> {
    return Promise.resolve(
      this.seasons.get(`${accountId}/${season}`) ?? NO_PROGRESS
    )
  }

  async score(
    accountId: string,
    season: string,
    progress: SeasonProgress,
    reward: SeasonReward | null
  ): Promise<void> {
    this.seasons.set(`${accountId}/${season}`, progress)
    if (!reward) return
    this.wallets.set(
      accountId,
      (this.wallets.get(accountId) ?? 0) + reward.cash
    )
    await this.change(accountId, reward.kind, reward.count)
  }

  task(accountId: string, task: string): Promise<TaskProgress> {
    return Promise.resolve(this.tasks.get(`${accountId}/${task}`) ?? NO_TASK)
  }

  scoreTask(
    accountId: string,
    task: string,
    progress: TaskProgress,
    reward: number | null
  ): Promise<void> {
    this.tasks.set(`${accountId}/${task}`, progress)
    if (reward) {
      this.wallets.set(accountId, (this.wallets.get(accountId) ?? 0) + reward)
    }
    return Promise.resolve()
  }

  xp(accountId: string): Promise<number> {
    return Promise.resolve(this.levels.get(accountId) ?? 0)
  }

  gainXp(accountId: string, amount: number): Promise<number> {
    const xp = (this.levels.get(accountId) ?? 0) + amount
    this.levels.set(accountId, xp)
    return Promise.resolve(xp)
  }
}
