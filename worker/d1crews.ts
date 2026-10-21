// The crew store on D1 (migrations/0018_crews.sql). A crew's start takes
// its cost out of the wallet in the same batch that writes it, so a crew
// is never made without its price, nor a price taken without the crew.

import { nextLeader } from '../src/crews.ts'
import type { CrewRow } from '../src/crews.ts'
import type { CreateResult, CrewStore, Parted } from './crews.ts'

interface CrewHead {
  crew_id: string
  name: string
  tag: string
  leader_id: string
}

interface MemberRow {
  account_id: string
  username: string | null
  joined_at: number
}

export class D1CrewStore implements CrewStore {
  private readonly db: D1Database

  constructor(db: D1Database) {
    this.db = db
  }

  private async row(head: CrewHead | null): Promise<CrewRow | null> {
    if (!head) return null
    const { results } = await this.db
      .prepare(
        `SELECT m.account_id, a.username, m.joined_at
         FROM crew_members m JOIN accounts a ON a.account_id = m.account_id
         WHERE m.crew_id = ? ORDER BY m.joined_at`
      )
      .bind(head.crew_id)
      .all<MemberRow>()
    return {
      id: head.crew_id,
      name: head.name,
      tag: head.tag,
      leader: head.leader_id,
      members: results.map((r) => ({
        account: r.account_id,
        username: r.username ?? '',
        joined: r.joined_at,
      })),
    }
  }

  async crewOf(account: string): Promise<CrewRow | null> {
    const head = await this.db
      .prepare(
        `SELECT c.crew_id, c.name, c.tag, c.leader_id
         FROM crew_members m JOIN crews c ON c.crew_id = m.crew_id
         WHERE m.account_id = ?`
      )
      .bind(account)
      .first<CrewHead>()
    return this.row(head)
  }

  async crewByTag(tag: string): Promise<CrewRow | null> {
    const head = await this.db
      .prepare(
        `SELECT crew_id, name, tag, leader_id FROM crews
         WHERE tag = ? COLLATE NOCASE`
      )
      .bind(tag)
      .first<CrewHead>()
    return this.row(head)
  }

  async tagOf(account: string): Promise<string | null> {
    const row = await this.db
      .prepare(
        `SELECT c.tag FROM crew_members m JOIN crews c ON c.crew_id = m.crew_id
         WHERE m.account_id = ?`
      )
      .bind(account)
      .first<{ tag: string }>()
    return row?.tag ?? null
  }

  async invitesOf(
    account: string,
    since: number
  ): Promise<{ id: string; tag: string; name: string }[]> {
    const { results } = await this.db
      .prepare(
        `SELECT c.crew_id, c.tag, c.name
         FROM crew_invites i JOIN crews c ON c.crew_id = i.crew_id
         WHERE i.account_id = ? AND i.at >= ? ORDER BY i.at`
      )
      .bind(account, since)
      .all<{ crew_id: string; tag: string; name: string }>()
    return results.map((r) => ({ id: r.crew_id, tag: r.tag, name: r.name }))
  }

  async create(
    account: string,
    id: string,
    name: string,
    tag: string,
    cost: number,
    now: number
  ): Promise<CreateResult> {
    // The charge first: short, the wallet's CHECK rolls the batch back; no
    // wallet at all, nothing is charged and the crew is not written.
    const charge = this.db
      .prepare('UPDATE wallets SET cash = cash - ? WHERE account_id = ?')
      .bind(cost, account)
    const crew = this.db
      .prepare(
        `INSERT INTO crews (crew_id, name, tag, leader_id, created_at)
         SELECT ?, ?, ?, ?, ? WHERE EXISTS
           (SELECT 1 FROM wallets WHERE account_id = ?)`
      )
      .bind(id, name, tag, account, now, account)
    const member = this.db
      .prepare(
        `INSERT INTO crew_members (account_id, crew_id, joined_at)
         SELECT ?, crew_id, ? FROM crews WHERE crew_id = ?`
      )
      .bind(account, now, id)
    try {
      const results = await this.db.batch([charge, crew, member])
      return results[1].meta.changes > 0 ? 'ok' : 'short'
    } catch (err) {
      const message = err instanceof Error ? err.message : ''
      if (/CHECK constraint failed/i.test(message)) return 'short'
      if (/UNIQUE constraint failed/i.test(message)) {
        return /tag/i.test(message) ? 'tag-taken' : 'name-taken'
      }
      throw err
    }
  }

  async invite(id: string, account: string, now: number): Promise<void> {
    await this.db
      .prepare(
        `INSERT INTO crew_invites (crew_id, account_id, at) VALUES (?, ?, ?)
         ON CONFLICT (crew_id, account_id) DO UPDATE SET at = excluded.at`
      )
      .bind(id, account, now)
      .run()
  }

  async join(id: string, account: string, now: number): Promise<void> {
    await this.db.batch([
      this.db
        .prepare('DELETE FROM crew_invites WHERE account_id = ?')
        .bind(account),
      this.db
        .prepare(
          'INSERT INTO crew_members (account_id, crew_id, joined_at) VALUES (?, ?, ?)'
        )
        .bind(account, id, now),
    ])
  }

  async leave(account: string): Promise<Parted | null> {
    const crew = await this.crewOf(account)
    if (!crew) return null
    const leader =
      crew.leader === account ? nextLeader(crew.members, account) : crew.leader
    const out = this.db
      .prepare('DELETE FROM crew_members WHERE account_id = ?')
      .bind(account)
    if (leader === null) {
      await this.db.batch([
        out,
        this.db
          .prepare('DELETE FROM crew_invites WHERE crew_id = ?')
          .bind(crew.id),
        this.db.prepare('DELETE FROM crews WHERE crew_id = ?').bind(crew.id),
      ])
    } else {
      await this.db.batch([
        out,
        this.db
          .prepare('UPDATE crews SET leader_id = ? WHERE crew_id = ?')
          .bind(leader, crew.id),
      ])
    }
    return { crew, leader }
  }
}
