// The pack store on D1 (migrations/0002_packs.sql): one row per item an
// account has held, and one wallet per account. Every change is a single
// statement, so two sockets on one account can never lose a unit or a cent
// between a read and a write.

import { STARTING_INVENTORY, toInventory } from '../src/inventory.ts'
import { STARTING_CASH } from './packs.ts'
import type { Holdings, PackStore } from './packs.ts'

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

  async spend(accountId: string, amount: number): Promise<boolean> {
    const result = await this.db
      .prepare(
        'UPDATE wallets SET cash = cash - ? WHERE account_id = ? AND cash >= ?'
      )
      .bind(amount, accountId, amount)
      .run()
    return result.meta.changes > 0
  }
}
