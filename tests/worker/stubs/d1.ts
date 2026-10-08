// A D1 database for the Worker tests: Node's own SQLite, in memory, with
// every migration in migrations/ applied in order. It keeps the parts of
// the D1 API the stores use (prepare, bind, first, all, run, batch), turns
// foreign keys on as D1 does, and runs a batch in one transaction, so the
// D1 stores run their real SQL against the real schema.

import { readdirSync, readFileSync } from 'node:fs'
import { DatabaseSync } from 'node:sqlite'
import type { SQLInputValue } from 'node:sqlite'

const MIGRATIONS = new URL('../../../migrations/', import.meta.url)

class Statement {
  private readonly db: DatabaseSync
  private readonly sql: string
  private readonly values: SQLInputValue[]

  constructor(db: DatabaseSync, sql: string, values: SQLInputValue[] = []) {
    this.db = db
    this.sql = sql
    this.values = values
  }

  bind(...values: unknown[]): Statement {
    return new Statement(this.db, this.sql, values as SQLInputValue[])
  }

  first<T>(): Promise<T | null> {
    const row = this.db.prepare(this.sql).get(...this.values)
    return Promise.resolve((row as T | undefined) ?? null)
  }

  all<T>(): Promise<{ results: T[]; success: true }> {
    const results = this.db.prepare(this.sql).all(...this.values) as T[]
    return Promise.resolve({ results, success: true })
  }

  run(): Promise<{ success: true; meta: { changes: number } }> {
    return Promise.resolve(this.runSync())
  }

  runSync(): { success: true; meta: { changes: number } } {
    const { changes } = this.db.prepare(this.sql).run(...this.values)
    return { success: true, meta: { changes: Number(changes) } }
  }

  // In a batch, as D1 answers each statement: a read's rows, a write's
  // changes.
  batchSync(): {
    success: true
    meta: { changes: number }
    results: unknown[]
  } {
    if (/^\s*SELECT/i.test(this.sql)) {
      const results = this.db.prepare(this.sql).all(...this.values)
      return { success: true, meta: { changes: 0 }, results }
    }
    return { ...this.runSync(), results: [] }
  }
}

export interface TestD1 {
  // The store-facing handle, typed as the Workers runtime's.
  db: D1Database
  // The SQLite underneath, for a test to read or break the rows directly.
  sqlite: DatabaseSync
}

export function testD1(): TestD1 {
  const sqlite = new DatabaseSync(':memory:')
  sqlite.exec('PRAGMA foreign_keys = ON')
  const files = readdirSync(MIGRATIONS)
    .filter((name) => name.endsWith('.sql'))
    .sort()
  for (const name of files) {
    sqlite.exec(readFileSync(new URL(name, MIGRATIONS), 'utf8'))
  }
  const db = {
    prepare: (sql: string) => new Statement(sqlite, sql),
    // eslint-disable-next-line @typescript-eslint/require-await -- D1's batch is async; this one rejects rather than throws
    batch: async (statements: Statement[]) => {
      sqlite.exec('BEGIN')
      try {
        const results = statements.map((s) => s.batchSync())
        sqlite.exec('COMMIT')
        return results
      } catch (err) {
        sqlite.exec('ROLLBACK')
        throw err
      }
    },
  }
  return { db: db as unknown as D1Database, sqlite }
}
