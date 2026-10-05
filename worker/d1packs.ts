// The pack store on D1 (migrations/0002_packs.sql). One row per item an
// account has held. Every change is a single statement, so two sockets on
// one account can never lose a unit between a read and a write.

import { STARTING_INVENTORY, toInventory } from '../src/inventory.ts'
import type { Inventory } from '../src/interfaces.ts'
import type { PackStore } from './packs.ts'

interface PackRow {
  kind: string
  count: number
}

export class D1PackStore implements PackStore {
  private readonly db: D1Database

  constructor(db: D1Database) {
    this.db = db
  }

  // The starting items go in only where the account has no row for them,
  // so a pack used down to zero is never refilled.
  async open(accountId: string): Promise<Inventory> {
    const start = Object.entries(STARTING_INVENTORY).filter(([, n]) => n > 0)
    if (start.length > 0) {
      await this.db.batch(
        start.map(([kind, count]) =>
          this.db
            .prepare(
              'INSERT OR IGNORE INTO packs (account_id, kind, count) VALUES (?, ?, ?)'
            )
            .bind(accountId, kind, count)
        )
      )
    }
    return this.get(accountId)
  }

  async get(accountId: string): Promise<Inventory> {
    const { results } = await this.db
      .prepare('SELECT kind, count FROM packs WHERE account_id = ?')
      .bind(accountId)
      .all<PackRow>()
    return toInventory(
      Object.fromEntries(results.map((row) => [row.kind, row.count]))
    )
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
}
