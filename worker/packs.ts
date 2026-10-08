// The pack store: what each account carries and the cash in its wallet,
// kept by the valley so they follow the raider to any browser. The
// interface is here with an in-memory store for the tests; production is
// the D1 store in d1packs.ts. The rules of what goes in and out are
// src/sharedworld.ts's (rules 7 and 10).

import { newlyFound } from '../src/book.ts'
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
  // The Book of Shadows entries the account has found (book.ts), in the
  // order found.
  book(accountId: string): Promise<string[]>
  // Writes the entries the account had not found (book.ts newlyFound), at
  // `now`, and returns them; known and unreal ones are left out.
  discover(
    accountId: string,
    entries: readonly string[],
    now: number
  ): Promise<string[]>
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
  // `${account}/${season}` -> progress.
  readonly seasons = new Map<string, SeasonProgress>()
  // account -> the entries found, in order.
  readonly books = new Map<string, string[]>()
  // `${account}/${task}` -> progress.
  readonly tasks = new Map<string, TaskProgress>()

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
    })
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

  book(accountId: string): Promise<string[]> {
    return Promise.resolve([...(this.books.get(accountId) ?? [])])
  }

  discover(accountId: string, entries: readonly string[]): Promise<string[]> {
    const found = this.books.get(accountId) ?? []
    const fresh = newlyFound(new Set(found), entries)
    this.books.set(accountId, [...found, ...fresh])
    return Promise.resolve(fresh)
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
}
