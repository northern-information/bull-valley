// 0015 brings the key items out of every locker into the pack, on top of
// what the pack holds, and leaves everything else in the locker.

import { readdirSync, readFileSync } from 'node:fs'
import { DatabaseSync } from 'node:sqlite'
import { describe, expect, it } from 'vitest'

const MIGRATIONS = new URL('../../migrations/', import.meta.url)
const KEY_ITEMS = '0015_key_items_out_of_lockers.sql'

const sql = (name: string) => readFileSync(new URL(name, MIGRATIONS), 'utf8')

describe('the key items out of the lockers', () => {
  it('moves them into the pack and leaves the rest', () => {
    const db = new DatabaseSync(':memory:')
    db.exec('PRAGMA foreign_keys = ON')
    const files = readdirSync(MIGRATIONS)
      .filter((name) => name.endsWith('.sql'))
      .sort()
    for (const name of files.filter((one) => one < KEY_ITEMS)) {
      db.exec(sql(name))
    }
    db.exec(
      "INSERT INTO accounts (account_id, primary_provider, created_at, last_login_at) VALUES ('a1', 'dev', 0, 0), ('a2', 'dev', 0, 0)"
    )
    db.exec(
      "INSERT INTO stashes (account_id, kind, count) VALUES ('a1', 'rose', 1), ('a1', 'vault-key', 1), ('a1', 'marlboro', 4), ('a2', 'vault-key', 1)"
    )
    db.exec(
      "INSERT INTO packs (account_id, kind, count) VALUES ('a1', 'rose', 0), ('a2', 'joints', 2)"
    )
    db.exec(sql(KEY_ITEMS))
    const rows = (table: string) =>
      Object.fromEntries(
        (
          db
            .prepare(
              `SELECT account_id, kind, count FROM ${table} ORDER BY account_id, kind`
            )
            .all() as { account_id: string; kind: string; count: number }[]
        ).map((row) => [`${row.account_id}:${row.kind}`, row.count])
      )
    expect(rows('packs')).toEqual({
      'a1:rose': 1,
      'a1:vault-key': 1,
      'a2:joints': 2,
      'a2:vault-key': 1,
    })
    expect(rows('stashes')).toEqual({
      'a1:marlboro': 4,
      'a1:rose': 0,
      'a1:vault-key': 0,
      'a2:vault-key': 0,
    })
  })
})
