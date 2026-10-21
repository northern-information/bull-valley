// The crew store (src/crews.ts, sharedworld.ts rule 35): every crew, its
// members and the invites waiting, by account. The interface is here with
// an in-memory store for the tests; production is the D1 store in
// d1crews.ts. The valley calls it under its own lock, so a read and the
// write it decides stand together.

import { nextLeader } from '../src/crews.ts'
import type { CrewMember, CrewRow } from '../src/crews.ts'

export type CreateResult = 'ok' | 'short' | 'tag-taken' | 'name-taken'

// The crew an account was in before it left or was put out, and who leads
// it after (null: it ended).
export interface Parted {
  crew: CrewRow
  leader: string | null
}

export interface CrewStore {
  // The account's crew, or null.
  crewOf(account: string): Promise<CrewRow | null>
  // A crew by its tag, in any case, or null.
  crewByTag(tag: string): Promise<CrewRow | null>
  // The tag of the account's crew, or null: what its name tag wears.
  tagOf(account: string): Promise<string | null>
  // The crews inviting the account whose invite was made at `since` or
  // after.
  invitesOf(
    account: string,
    since: number
  ): Promise<{ id: string; tag: string; name: string }[]>
  // A new crew `id` with the account as its leader and only member, and
  // `cost` cents out of its wallet, all or nothing: `short` when the
  // wallet does not cover it, `tag-taken` or `name-taken` when another
  // crew has either in any case. The account is in no crew; the valley
  // checks.
  create(
    account: string,
    id: string,
    name: string,
    tag: string,
    cost: number,
    now: number
  ): Promise<CreateResult>
  // The account invited to crew `id` at `now` (again, if it was).
  invite(id: string, account: string, now: number): Promise<void>
  // The account in crew `id`, and every invite to it gone. The valley has
  // checked the invite and the room.
  join(id: string, account: string, now: number): Promise<void>
  // The account out of its crew: the leader handed on to the member
  // longest in it (crews.ts nextLeader), or the crew ended with the last
  // one out. Null when it was in none.
  leave(account: string): Promise<Parted | null>
}

export class MemoryCrewStore implements CrewStore {
  readonly crews = new Map<
    string,
    { name: string; tag: string; leader: string }
  >()
  // Account -> its crew and when it joined.
  readonly members = new Map<string, { crew: string; joined: number }>()
  // `${crew}/${account}` -> when it was invited.
  readonly invites = new Map<string, number>()

  // The wallets the cost comes out of (MemoryPackStore.wallets), and each
  // account's username.
  private readonly wallets: Map<string, number>
  private readonly usernames: (account: string) => string

  constructor(
    wallets: Map<string, number>,
    usernames: (account: string) => string
  ) {
    this.wallets = wallets
    this.usernames = usernames
  }

  private row(id: string): CrewRow | null {
    const crew = this.crews.get(id)
    if (!crew) return null
    const members: CrewMember[] = []
    for (const [account, m] of this.members) {
      if (m.crew === id) {
        members.push({
          account,
          username: this.usernames(account),
          joined: m.joined,
        })
      }
    }
    return { id, ...crew, members }
  }

  crewOf(account: string): Promise<CrewRow | null> {
    const m = this.members.get(account)
    return Promise.resolve(m ? this.row(m.crew) : null)
  }

  crewByTag(tag: string): Promise<CrewRow | null> {
    for (const [id, crew] of this.crews) {
      if (crew.tag.toLowerCase() === tag.toLowerCase()) {
        return Promise.resolve(this.row(id))
      }
    }
    return Promise.resolve(null)
  }

  async tagOf(account: string): Promise<string | null> {
    return (await this.crewOf(account))?.tag ?? null
  }

  invitesOf(
    account: string,
    since: number
  ): Promise<{ id: string; tag: string; name: string }[]> {
    const out: { id: string; tag: string; name: string }[] = []
    for (const [key, at] of this.invites) {
      const [id, who] = key.split('/')
      const crew = this.crews.get(id)
      if (who === account && at >= since && crew) {
        out.push({ id, tag: crew.tag, name: crew.name })
      }
    }
    return Promise.resolve(out)
  }

  create(
    account: string,
    id: string,
    name: string,
    tag: string,
    cost: number,
    now: number
  ): Promise<CreateResult> {
    const same = (a: string, b: string) => a.toLowerCase() === b.toLowerCase()
    for (const crew of this.crews.values()) {
      if (same(crew.tag, tag)) return Promise.resolve('tag-taken')
      if (same(crew.name, name)) return Promise.resolve('name-taken')
    }
    const cash = this.wallets.get(account) ?? 0
    if (cash < cost) return Promise.resolve('short')
    this.wallets.set(account, cash - cost)
    this.crews.set(id, { name, tag, leader: account })
    this.members.set(account, { crew: id, joined: now })
    return Promise.resolve('ok')
  }

  invite(id: string, account: string, now: number): Promise<void> {
    this.invites.set(`${id}/${account}`, now)
    return Promise.resolve()
  }

  join(id: string, account: string, now: number): Promise<void> {
    for (const key of [...this.invites.keys()]) {
      if (key.endsWith(`/${account}`)) this.invites.delete(key)
    }
    this.members.set(account, { crew: id, joined: now })
    return Promise.resolve()
  }

  async leave(account: string): Promise<Parted | null> {
    const crew = await this.crewOf(account)
    if (!crew) return null
    this.members.delete(account)
    const crewInfo = this.crews.get(crew.id)
    const leader =
      crew.leader === account ? nextLeader(crew.members, account) : crew.leader
    if (leader === null) {
      this.crews.delete(crew.id)
      for (const key of [...this.invites.keys()]) {
        if (key.startsWith(`${crew.id}/`)) this.invites.delete(key)
      }
    } else if (crewInfo) {
      crewInfo.leader = leader
    }
    return { crew, leader }
  }
}
