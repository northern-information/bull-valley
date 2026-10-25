// Parties (sharedworld.ts rule 34): a few raiders who play together for a
// while. A raider invites another by name (/invite name), and the other
// joins by inviting back; a party holds CONFIG.party.size, and a raider
// is in one at most. A party is the valley's alone, kept while its
// raiders are in it and never written to D1: one who leaves (/leave), or
// whose line stays down past the linger, is out of it, and a party of
// one is none. Its members see each other on the map and hear its chat
// (/p message); a burning of the Caretaker credits every member who
// stood near a burner.
//
// Pure, no Three: the parties as the valley keeps them, what an invite
// comes to, who shares a burning's credit, the frame a member is sent,
// and the lines the log says.

import { CONFIG } from './config.ts'
import { copy } from './copy.ts'
import type { PartyNewsMessage, PartyWire } from './protocol.ts'

// A raider as a party knows them: the account (never on the wire) and the
// name it goes by.
export interface PartyRaider {
  account: string
  name: string
  // Since when (valley ms) no socket of theirs has been in the valley;
  // missing while one is. Gone past the linger, they are out
  // (dropAway).
  away?: number
}

export interface Party {
  id: number
  // In the order they joined.
  members: PartyRaider[]
}

export interface PartyInvite {
  from: PartyRaider
  to: PartyRaider
  // When it was made, on the valley's clock (ms).
  at: number
}

export interface Parties {
  parties: Party[]
  invites: PartyInvite[]
  // The id the next party gets.
  next: number
}

export const NO_PARTIES: Parties = { parties: [], invites: [], next: 1 }

export function partyOf(state: Parties, account: string): Party | null {
  return (
    state.parties.find((p) => p.members.some((m) => m.account === account)) ??
    null
  )
}

// What an invite from `from` to `to` comes to: an invite made, `to`'s own
// invite taken up (`from` joins), or why neither.
export type InviteOutcome =
  | 'invited'
  | 'joined'
  | 'self'
  | 'already-invited'
  | 'already-in'
  | 'in-party'
  | 'leave-first'
  | 'full'

function pending(
  state: Parties,
  from: string,
  to: string,
  now: number,
  cfg = CONFIG.party
): boolean {
  return state.invites.some(
    (i) =>
      i.from.account === from &&
      i.to.account === to &&
      now - i.at < cfg.inviteMs
  )
}

export function inviteOutcome(
  state: Parties,
  from: string,
  to: string,
  now: number,
  cfg = CONFIG.party
): InviteOutcome {
  if (from === to) return 'self'
  const mine = partyOf(state, from)
  const theirs = partyOf(state, to)
  if (mine && mine === theirs) return 'already-in'
  // They asked first: inviting back takes it up.
  if (pending(state, to, from, now, cfg)) {
    if (mine) return 'leave-first'
    if (theirs && theirs.members.length >= cfg.size) return 'full'
    return 'joined'
  }
  if (theirs) return 'in-party'
  if (mine && mine.members.length >= cfg.size) return 'full'
  if (pending(state, from, to, now, cfg)) return 'already-invited'
  return 'invited'
}

// What an invite changes: the parties after it, its outcome, and the
// party it made or grew (null when none did).
export function partyInvite(
  state: Parties,
  from: PartyRaider,
  to: PartyRaider,
  now: number,
  cfg = CONFIG.party
): { state: Parties; outcome: InviteOutcome; party: Party | null } {
  const live = pruneInvites(state, now, cfg)
  const outcome = inviteOutcome(live, from.account, to.account, now, cfg)
  if (outcome === 'invited') {
    const invites = [
      ...live.invites.filter(
        (i) => !(i.from.account === from.account && i.to.account === to.account)
      ),
      { from, to, at: now },
    ]
    return { state: { ...live, invites }, outcome, party: null }
  }
  if (outcome !== 'joined') return { state: live, outcome, party: null }
  // `from` joins `to`: their party, or a new one of the two.
  const invites = live.invites.filter(
    (i) => i.to.account !== from.account && i.from.account !== from.account
  )
  const host = partyOf(live, to.account)
  if (host) {
    const party = { ...host, members: [...host.members, from] }
    return {
      state: {
        ...live,
        invites,
        parties: live.parties.map((p) => (p.id === host.id ? party : p)),
      },
      outcome,
      party,
    }
  }
  const party = { id: live.next, members: [to, from] }
  return {
    state: {
      parties: [...live.parties, party],
      invites,
      next: live.next + 1,
    },
    outcome,
    party,
  }
}

// `account` out of its party, and every invite to or from it gone. The
// party it was in, as it was, or null; a party left with one is none.
export function partyLeave(
  state: Parties,
  account: string
): { state: Parties; party: Party | null } {
  const party = partyOf(state, account)
  const invites = state.invites.filter(
    (i) => i.from.account !== account && i.to.account !== account
  )
  if (!party) return { state: { ...state, invites }, party: null }
  const members = party.members.filter((m) => m.account !== account)
  const parties =
    members.length > 1
      ? state.parties.map((p) => (p.id === party.id ? { ...p, members } : p))
      : state.parties.filter((p) => p.id !== party.id)
  return { state: { ...state, parties, invites }, party }
}

// `account`'s socket gone (`at`, its last one) or back (null): marked
// away in its party, or no longer.
export function markAway(
  state: Parties,
  account: string,
  at: number | null
): Parties {
  const party = partyOf(state, account)
  if (!party) return state
  const members = party.members.map((m) => {
    if (m.account !== account) return m
    const { away: _, ...back } = m
    return at === null ? back : { ...back, away: at }
  })
  return {
    ...state,
    parties: state.parties.map((p) =>
      p.id === party.id ? { ...p, members } : p
    ),
  }
}

// Every member away since before `before` out of their party: the
// parties after, and each one dropped with the party they were in.
export function dropAway(
  state: Parties,
  before: number
): { state: Parties; dropped: { account: string; party: Party }[] } {
  const dropped: { account: string; party: Party }[] = []
  let next = state
  for (const party of state.parties) {
    for (const m of party.members) {
      if (m.away === undefined || m.away >= before) continue
      const out = partyLeave(next, m.account)
      if (out.party) dropped.push({ account: m.account, party: out.party })
      next = out.state
    }
  }
  return { state: next, dropped }
}

// A member's new name (Your Name), wherever the parties name them.
export function renamed(
  state: Parties,
  account: string,
  name: string
): Parties {
  const rename = (r: PartyRaider) =>
    r.account === account ? { ...r, name } : r
  return {
    ...state,
    parties: state.parties.map((p) => ({
      ...p,
      members: p.members.map(rename),
    })),
    invites: state.invites.map((i) => ({
      ...i,
      from: rename(i.from),
      to: rename(i.to),
    })),
  }
}

// The invites still waiting at `now`.
export function pruneInvites(
  state: Parties,
  now: number,
  cfg = CONFIG.party
): Parties {
  const invites = state.invites.filter((i) => now - i.at < cfg.inviteMs)
  return invites.length === state.invites.length ? state : { ...state, invites }
}

// Where `asker` stands with `them` in a party, as the inspect card says
// it: in the same one, invited by the asker, inviting the asker, or none.
export function standing(
  state: Parties,
  asker: string,
  them: string,
  now: number,
  cfg = CONFIG.party
): 'member' | 'invited' | 'inviting' | null {
  const mine = partyOf(state, asker)
  if (asker !== them && mine && mine === partyOf(state, them)) return 'member'
  if (pending(state, asker, them, now, cfg)) return 'invited'
  if (pending(state, them, asker, now, cfg)) return 'inviting'
  return null
}

// A raider placed in the valley, by account, where they stand.
export interface PartySpot {
  account: string
  x: number
  z: number
}

// The accounts a burning credits: every burner, and every member of a
// burner's party standing within CONFIG.party.creditRadius of them.
export function withParty(
  state: Parties,
  burners: readonly PartySpot[],
  placed: readonly PartySpot[],
  cfg = CONFIG.party
): string[] {
  const accounts: string[] = []
  const add = (account: string) => {
    if (!accounts.includes(account)) accounts.push(account)
  }
  for (const burner of burners) {
    add(burner.account)
    const party = partyOf(state, burner.account)
    if (!party) continue
    for (const spot of placed) {
      if (!party.members.some((m) => m.account === spot.account)) continue
      const d = Math.hypot(spot.x - burner.x, spot.z - burner.z)
      if (d <= cfg.creditRadius) add(spot.account)
    }
  }
  return accounts
}

// What `account` is sent: its party's members (by name, each with whether
// they are in the valley now) and who is inviting it.
export function partyWire(
  state: Parties,
  account: string,
  online: (account: string) => boolean,
  now: number,
  cfg = CONFIG.party
): PartyWire {
  const party = partyOf(state, account)
  return {
    members: (party?.members ?? []).map((m) => ({
      name: m.name,
      online: online(m.account),
    })),
    invites: state.invites
      .filter((i) => i.to.account === account && now - i.at < cfg.inviteMs)
      .map((i) => i.from.name),
  }
}

// Why an invite was refused, as the log says it.
export function partyRefusal(reason: string, name: string): string {
  switch (reason) {
    case 'not-here':
      return copy('chat.whisper_not_here', { name })
    case 'self':
      return copy('party.self')
    case 'already-invited':
      return copy('party.already_invited', { name })
    case 'already-in':
      return copy('party.already_in', { name })
    case 'in-party':
      return copy('party.in_party', { name })
    case 'leave-first':
      return copy('party.leave_first')
    case 'full':
      return copy('party.full', { size: CONFIG.party.size })
    case 'no-party':
      return copy('party.none')
    case 'too-fast':
      return copy('chat.too_fast')
    default:
      return copy('party.failed')
  }
}

// What a party-news frame says in the log, to the raider named `me`.
export function partyNews(
  news: PartyNewsMessage['news'],
  name: string,
  me: string
): string {
  switch (news) {
    case 'invited':
      return copy('party.news_invited', { name })
    case 'sent':
      return copy('party.invited', { name })
    case 'joined':
      return name === me
        ? copy('party.you_joined')
        : copy('party.news_joined', { name })
    case 'left':
      return name === me
        ? copy('party.left')
        : copy('party.news_left', { name })
  }
}

// The party as /party says it in the log.
export function partyLines(party: PartyWire): string[] {
  const lines =
    party.members.length > 0
      ? [
          copy('party.members', {
            names: party.members
              .map((m) =>
                m.online ? m.name : copy('party.away', { name: m.name })
              )
              .join(', '),
          }),
        ]
      : [copy('party.none')]
  for (const name of party.invites) {
    lines.push(copy('party.news_invited', { name }))
  }
  return lines
}
