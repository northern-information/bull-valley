// The pack store on D1 (migrations/0002_packs.sql): one row per item an
// account has held, and one wallet per account. Every change is a single
// statement, so two sockets on one account can never lose a unit or a cent
// between a read and a write.

import { STARTING_INVENTORY, toInventory } from '../src/inventory.ts'
import { NO_PROGRESS } from '../src/season.ts'
import { STARTING_CASH } from './packs.ts'
import type { SeasonProgress, SeasonReward } from '../src/season.ts'
import type { Holdings, PackItem, PackStore } from './packs.ts'

interface PackRow {
  kind: string
  count: number
}

export class D1PackStore implements PackStore {
  private readonly db: D1Database

  constructor(db: D1Database) {
    this.db = db
  }

  // The starting items and wallet go in only where the account has no row
  // for them, so a pack used down to zero or a wallet spent out is never
  // refilled.
  async open(accountId: string): Promise<Holdings> {
    const start = Object.entries(STARTING_INVENTORY).filter(([, n]) => n > 0)
    await this.db.batch([
      this.db
        .prepare(
          'INSERT OR IGNORE INTO wallets (account_id, cash) VALUES (?, ?)'
        )
        .bind(accountId, STARTING_CASH),
      ...start.map(([kind, count]) =>
        this.db
          .prepare(
            'INSERT OR IGNORE INTO packs (account_id, kind, count) VALUES (?, ?, ?)'
          )
          .bind(accountId, kind, count)
      ),
    ])
    return this.get(accountId)
  }

  async get(accountId: string): Promise<Holdings> {
    const [packs, wallet] = await Promise.all([
      this.db
        .prepare('SELECT kind, count FROM packs WHERE account_id = ?')
        .bind(accountId)
        .all<PackRow>(),
      this.db
        .prepare('SELECT cash FROM wallets WHERE account_id = ?')
        .bind(accountId)
        .first<{ cash: number }>(),
    ])
    return {
      pack: toInventory(
        Object.fromEntries(packs.results.map((row) => [row.kind, row.count]))
      ),
      cash: wallet?.cash ?? 0,
    }
  }

  async change(
    accountId: string,
    kind: string,
    delta: number
  ): Promise<boolean> {
    if (delta >= 0) {
      await this.db
        .prepare(
          'INSERT INTO packs (account_id, kind, count) VALUES (?, ?, ?) ' +
            'ON CONFLICT (account_id, kind) DO UPDATE SET count = count + excluded.count'
        )
        .bind(accountId, kind, delta)
        .run()
      return true
    }
    const result = await this.db
      .prepare(
        'UPDATE packs SET count = count + ? ' +
          'WHERE account_id = ? AND kind = ? AND count + ? >= 0'
      )
      .bind(delta, accountId, kind, delta)
      .run()
    return result.meta.changes > 0
  }

  // One batch is one transaction. The item goes in first, and only while
  // the wallet still covers the sale; the charge after it checks the same,
  // so the two land together or not at all.
  async purchase(
    accountId: string,
    amount: number,
    item: PackItem | null
  ): Promise<boolean> {
    const charge = this.db
      .prepare(
        'UPDATE wallets SET cash = cash - ? WHERE account_id = ? AND cash >= ?'
      )
      .bind(amount, accountId, amount)
    if (!item) return (await charge.run()).meta.changes > 0
    const results = await this.db.batch([
      this.db
        .prepare(
          'INSERT INTO packs (account_id, kind, count) ' +
            'SELECT ?, ?, ? WHERE (SELECT cash FROM wallets WHERE account_id = ?) >= ? ' +
            'ON CONFLICT (account_id, kind) DO UPDATE SET count = count + excluded.count'
        )
        .bind(accountId, item.kind, item.delta, accountId, amount),
      charge,
    ])
    return (results[1]?.meta.changes ?? 0) > 0
  }

  async season(accountId: string, season: string): Promise<SeasonProgress> {
    const row = await this.db
      .prepare(
        'SELECT kills, claimed FROM seasons WHERE account_id = ? AND season = ?'
      )
      .bind(accountId, season)
      .first<{ kills: number; claimed: number }>()
    return row ? { kills: row.kills, claimed: row.claimed === 1 } : NO_PROGRESS
  }

  // One batch is one transaction: the progress and the reward it paid land
  // together or not at all.
  async score(
    accountId: string,
    season: string,
    progress: SeasonProgress,
    reward: SeasonReward | null
  ): Promise<void> {
    const claimed = progress.claimed ? 1 : 0
    await this.db.batch([
      this.db
        .prepare(
          'INSERT INTO seasons (account_id, season, kills, claimed) VALUES (?, ?, ?, ?) ' +
            'ON CONFLICT (account_id, season) DO UPDATE SET kills = excluded.kills, claimed = excluded.claimed'
        )
        .bind(accountId, season, progress.kills, claimed),
      ...(reward
        ? [
            this.db
              .prepare(
                'UPDATE wallets SET cash = cash + ? WHERE account_id = ?'
              )
              .bind(reward.cash, accountId),
            this.db
              .prepare(
                'INSERT INTO packs (account_id, kind, count) VALUES (?, ?, ?) ' +
                  'ON CONFLICT (account_id, kind) DO UPDATE SET count = count + excluded.count'
              )
              .bind(accountId, reward.kind, reward.count),
          ]
        : []),
    ])
  }
}
