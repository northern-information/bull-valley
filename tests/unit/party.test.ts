import { describe, expect, it } from 'vitest'
import { CONFIG } from '../../src/config.ts'
import { copy } from '../../src/copy.ts'
import {
  dropAway,
  inviteOutcome,
  markAway,
  NO_PARTIES,
  partyInvite,
  partyLeave,
  partyLines,
  partyNews,
  partyOf,
  partyRefusal,
  partyWire,
  pruneInvites,
  renamed,
  standing,
  withParty,
} from '../../src/party.ts'
import type { Parties, PartyRaider } from '../../src/party.ts'

const r = (name: string): PartyRaider => ({ account: `acct-${name}`, name })
const [A, B, C, D, E] = ['Able', 'Baker', 'Charlie', 'Dog', 'Easy'].map(r)
const T0 = 1_000_000

// `from` invites `to`, and `to` invites back: the two in one party.
function together(state: Parties, from: PartyRaider, to: PartyRaider) {
  const asked = partyInvite(state, from, to, T0).state
  return partyInvite(asked, to, from, T0)
}

describe('an invite', () => {
  it('waits on an answer, then joins by inviting back', () => {
    const asked = partyInvite(NO_PARTIES, A, B, T0)
    expect(asked.outcome).toBe('invited')
    expect(asked.party).toBeNull()
    expect(partyOf(asked.state, A.account)).toBeNull()
    const joined = partyInvite(asked.state, B, A, T0 + 1)
    expect(joined.outcome).toBe('joined')
    expect(joined.party?.members.map((m) => m.name)).toEqual(['Able', 'Baker'])
    expect(partyOf(joined.state, B.account)).toBe(joined.party)
    // The invite was taken up.
    expect(joined.state.invites).toEqual([])
  })

  it('grows the inviter’s party, up to its size', () => {
    let state = together(NO_PARTIES, A, B).state
    state = together(state, A, C).state
    state = together(state, B, D).state
    expect(partyOf(state, D.account)?.members).toHaveLength(CONFIG.party.size)
    expect(inviteOutcome(state, A.account, E.account, T0)).toBe('full')
    // E invited them first: still no room.
    const asked = partyInvite(state, E, A, T0).state
    expect(inviteOutcome(asked, A.account, E.account, T0)).toBe('full')
  })

  it('refuses yourself, a second invite, a mate, and another party’s raider', () => {
    const one = together(NO_PARTIES, A, B).state
    expect(inviteOutcome(one, A.account, A.account, T0)).toBe('self')
    expect(inviteOutcome(one, A.account, B.account, T0)).toBe('already-in')
    expect(inviteOutcome(one, C.account, A.account, T0)).toBe('in-party')
    const asked = partyInvite(one, A, C, T0).state
    expect(inviteOutcome(asked, A.account, C.account, T0)).toBe(
      'already-invited'
    )
    // Invited, then into another party: taking the invite up means
    // leaving that one first.
    const other = together(asked, C, D).state
    expect(inviteOutcome(other, C.account, A.account, T0)).toBe('leave-first')
  })

  it('runs out after a while', () => {
    const asked = partyInvite(NO_PARTIES, A, B, T0).state
    const later = T0 + CONFIG.party.inviteMs
    expect(inviteOutcome(asked, B.account, A.account, later)).toBe('invited')
    expect(pruneInvites(asked, later).invites).toEqual([])
    expect(pruneInvites(asked, T0)).toBe(asked)
  })
})

describe('leaving', () => {
  it('takes the raider out, and a party of one is none', () => {
    const three = together(together(NO_PARTIES, A, B).state, A, C).state
    const out = partyLeave(three, C.account)
    expect(out.party?.members).toHaveLength(3)
    expect(partyOf(out.state, A.account)?.members).toHaveLength(2)
    const last = partyLeave(out.state, B.account)
    expect(last.state.parties).toEqual([])
    expect(partyLeave(last.state, A.account).party).toBeNull()
  })

  it('drops a member away past the linger, and keeps one who came back', () => {
    let state = together(together(NO_PARTIES, A, B).state, A, C).state
    state = markAway(state, B.account, T0)
    state = markAway(state, C.account, T0)
    state = markAway(state, C.account, null)
    expect(partyOf(state, C.account)?.members[2].away).toBeUndefined()
    expect(dropAway(state, T0).dropped).toEqual([])
    const out = dropAway(state, T0 + 1)
    expect(out.dropped.map((d) => d.account)).toEqual([B.account])
    expect(partyOf(out.state, A.account)?.members.map((m) => m.name)).toEqual([
      'Able',
      'Charlie',
    ])
    expect(markAway(NO_PARTIES, A.account, T0)).toBe(NO_PARTIES)
  })
})

describe('the party’s names, credit and frame', () => {
  it('follows a new name', () => {
    const state = renamed(
      partyInvite(together(NO_PARTIES, A, B).state, A, C, T0).state,
      A.account,
      'Ace'
    )
    expect(partyOf(state, A.account)?.members[0].name).toBe('Ace')
    expect(state.invites[0].from.name).toBe('Ace')
  })

  it('credits a burner’s party members standing near them', () => {
    const state = together(together(NO_PARTIES, A, B).state, A, C).state
    const near = CONFIG.party.creditRadius
    const placed = [
      { account: A.account, x: 0, z: 0 },
      { account: B.account, x: near, z: 0 },
      { account: C.account, x: near + 1, z: 0 },
      { account: D.account, x: 1, z: 0 },
    ]
    expect(withParty(state, [placed[0]], placed)).toEqual([
      A.account,
      B.account,
    ])
    expect(withParty(NO_PARTIES, [placed[0]], placed)).toEqual([A.account])
  })

  it('says where two raiders stand', () => {
    const one = together(NO_PARTIES, A, B).state
    const asked = partyInvite(one, A, C, T0).state
    expect(standing(asked, A.account, B.account, T0)).toBe('member')
    expect(standing(asked, A.account, C.account, T0)).toBe('invited')
    expect(standing(asked, C.account, A.account, T0)).toBe('inviting')
    expect(standing(asked, D.account, A.account, T0)).toBeNull()
    expect(standing(asked, A.account, A.account, T0)).toBeNull()
  })

  it('sends a member who is in it and who is inviting them', () => {
    const one = together(NO_PARTIES, A, B).state
    const asked = partyInvite(one, A, D, T0).state
    const online = (account: string) => account !== B.account
    expect(partyWire(asked, A.account, online, T0)).toEqual({
      members: [
        { name: 'Able', online: true },
        { name: 'Baker', online: false },
      ],
      invites: [],
    })
    expect(partyWire(asked, D.account, online, T0)).toEqual({
      members: [],
      invites: ['Able'],
    })
    expect(partyWire(asked, C.account, online, T0)).toEqual({
      members: [],
      invites: [],
    })
  })
})

describe('the party in the log', () => {
  it('lists it, or says there is none', () => {
    expect(
      partyLines({
        members: [
          { name: 'Able', online: true },
          { name: 'Baker', online: false },
        ],
        invites: ['Charlie'],
      })
    ).toEqual([
      copy('party.members', {
        names: `Able, ${copy('party.away', { name: 'Baker' })}`,
      }),
      copy('party.news_invited', { name: 'Charlie' }),
    ])
    expect(partyLines({ members: [], invites: [] })).toEqual([
      copy('party.none'),
    ])
  })

  it('says the news, the raider’s own as theirs', () => {
    expect(partyNews('invited', 'Able', 'Me')).toBe(
      copy('party.news_invited', { name: 'Able' })
    )
    expect(partyNews('sent', 'Able', 'Me')).toBe(
      copy('party.invited', { name: 'Able' })
    )
    expect(partyNews('joined', 'Able', 'Me')).toBe(
      copy('party.news_joined', { name: 'Able' })
    )
    expect(partyNews('joined', 'Me', 'Me')).toBe(copy('party.you_joined'))
    expect(partyNews('left', 'Able', 'Me')).toBe(
      copy('party.news_left', { name: 'Able' })
    )
    expect(partyNews('left', 'Me', 'Me')).toBe(copy('party.left'))
  })

  it('says why an invite was refused', () => {
    const cases: [string, string][] = [
      ['not-here', copy('chat.whisper_not_here', { name: 'Able' })],
      ['self', copy('party.self')],
      ['already-invited', copy('party.already_invited', { name: 'Able' })],
      ['already-in', copy('party.already_in', { name: 'Able' })],
      ['in-party', copy('party.in_party', { name: 'Able' })],
      ['leave-first', copy('party.leave_first')],
      ['full', copy('party.full', { size: CONFIG.party.size })],
      ['no-party', copy('party.none')],
      ['too-fast', copy('chat.too_fast')],
      ['server', copy('party.failed')],
    ]
    for (const [reason, line] of cases) {
      expect(partyRefusal(reason, 'Able')).toBe(line)
    }
  })
})
