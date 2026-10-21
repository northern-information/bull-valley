import { describe, expect, it } from 'vitest'
import { BOOK } from '../../src/book.ts'
import { DEFAULT_CHARACTER } from '../../src/characters.ts'
import { copy } from '../../src/copy.ts'
import { cosmeticById } from '../../src/cosmetics.ts'
import { DEFAULT_FINISH } from '../../src/finishes.ts'
import {
  befriended,
  cardOf,
  cardRows,
  cardStatus,
  friendButton,
  inspectRefusal,
  partied,
  partyButton,
} from '../../src/inspect.ts'
import { xpToReach } from '../../src/progression.ts'
import { SEASON } from '../../src/season.ts'
import type { InspectRead } from '../../src/inspect.ts'

const read = (over: Partial<InspectRead> = {}): InspectRead => ({
  name: 'Baker',
  xp: 0,
  look: { outfit: null, finish: null },
  cosmetics: [],
  found: [],
  season: { kills: 0, claimed: false },
  self: false,
  friend: undefined,
  party: null,
  online: true,
  ...over,
})

describe('a raider card', () => {
  it('says the level, the look, the book and the season', () => {
    const card = cardOf(
      read({
        xp: xpToReach(4),
        look: { outfit: 'kvistad', finish: 'cherry' },
        cosmetics: ['flaming-halo'],
        found: [BOOK[0].id, BOOK[1].id, 'not-an-entry', BOOK[0].id],
        season: { kills: SEASON.goal + 3, claimed: true },
      })
    )
    expect(card).toEqual({
      name: 'Baker',
      level: 4,
      outfit: 'kvistad',
      finish: 'cherry',
      cosmetics: ['flaming-halo'],
      book: { found: 2, of: BOOK.length },
      season: { kills: SEASON.goal, goal: SEASON.goal, claimed: true },
      friend: null,
      party: null,
      online: true,
    })
  })

  it('takes the defaults for a look not chosen yet', () => {
    const card = cardOf(read())
    expect(card.outfit).toBe(DEFAULT_CHARACTER)
    expect(card.finish).toBe(DEFAULT_FINISH)
    expect(card.level).toBe(1)
  })

  it('says where the asker stands with them', () => {
    const row = { accountId: 'b', username: 'Baker' }
    expect(cardOf(read({ self: true })).friend).toBe('self')
    expect(cardOf(read({ friend: { ...row, state: 'asking' } })).friend).toBe(
      'asking'
    )
  })

  it('draws its rows from the copy', () => {
    const rows = cardRows(
      cardOf(read({ cosmetics: ['flaming-halo'], found: [BOOK[0].id] }))
    )
    expect(rows.map((r) => r.label)).toEqual([
      copy('inspect.level'),
      copy('inspect.character'),
      copy('inspect.cosmetics'),
      copy('book.title'),
      copy('season.kicker'),
    ])
    expect(rows[0].value).toBe(copy('level.title', { level: 1 }))
    expect(rows[2].value).toBe(cosmeticById('flaming-halo')?.label)
    expect(rows[3].value).toBe(
      copy('book.tally', { found: 1, of: BOOK.length })
    )
    expect(rows[4].value).toBe(
      copy('season.progress', { kills: 0, goal: SEASON.goal })
    )
    const bare = cardRows(
      cardOf(read({ season: { kills: SEASON.goal, claimed: true } }))
    )
    expect(bare[2].value).toBe(copy('inspect.none'))
    expect(bare[4].value).toBe(copy('season.complete'))
  })

  it('says whether they are in the valley', () => {
    expect(cardStatus(cardOf(read()))).toBe(copy('inspect.online'))
    expect(cardStatus(cardOf(read({ online: false })))).toBe(
      copy('inspect.away')
    )
  })
})

describe('the friend button', () => {
  const row = { accountId: 'b', username: 'Baker' }
  const card = (state: 'friend' | 'asked' | 'asking' | null, self = false) =>
    cardOf(read({ self, friend: state ? { ...row, state } : undefined }))

  it('asks, accepts, or only says how things stand', () => {
    expect(friendButton(card(null))).toEqual({
      label: copy('inspect.add_friend'),
      enabled: true,
    })
    expect(friendButton(card('asking'))).toEqual({
      label: copy('inspect.accept'),
      enabled: true,
    })
    expect(friendButton(card('asked'))?.enabled).toBe(false)
    expect(friendButton(card('friend'))).toEqual({
      label: copy('inspect.friends'),
      enabled: false,
    })
    expect(friendButton(card(null, true))).toBeNull()
  })

  it('moves on at once when pressed', () => {
    expect(befriended(card(null)).friend).toBe('asked')
    expect(befriended(card('asking')).friend).toBe('friend')
    expect(befriended(card('friend')).friend).toBe('friend')
  })
})

describe('the party button', () => {
  it('invites, joins, or only says how the two stand', () => {
    const card = (party: InspectRead['party'], online = true, self = false) =>
      cardOf(read({ party, online, self }))
    expect(partyButton(card(null))).toEqual({
      label: copy('party.invite_button'),
      enabled: true,
    })
    expect(partyButton(card(null, false))?.enabled).toBe(false)
    expect(partyButton(card('inviting'))).toEqual({
      label: copy('party.join_button'),
      enabled: true,
    })
    expect(partyButton(card('invited'))?.enabled).toBe(false)
    expect(partyButton(card('member'))).toEqual({
      label: copy('party.member_button'),
      enabled: false,
    })
    expect(partyButton(card(null, true, true))).toBeNull()
    expect(card('member', true, true).party).toBeNull()
  })

  it('moves on at once when pressed', () => {
    expect(partied(cardOf(read())).party).toBe('invited')
    expect(partied(cardOf(read({ party: 'inviting' }))).party).toBe('member')
    expect(partied(cardOf(read({ party: 'member' }))).party).toBe('member')
  })
})

describe('a refused inspect', () => {
  it('says why in the log', () => {
    expect(inspectRefusal('unknown', 'Baker')).toBe(
      copy('friends.unknown', { name: 'Baker' })
    )
    expect(inspectRefusal('too-fast', 'Baker')).toBe(copy('inspect.too_fast'))
    expect(inspectRefusal('unavailable', 'Baker')).toBe(copy('inspect.failed'))
  })
})
