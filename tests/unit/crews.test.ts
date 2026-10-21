import { describe, expect, it } from 'vitest'
import { CONFIG } from '../../src/config.ts'
import { copy } from '../../src/copy.ts'
import {
  crewLines,
  crewNamed,
  crewNews,
  crewRefusal,
  crewWire,
  isValidCrewName,
  isValidTag,
  nextLeader,
  showTag,
} from '../../src/crews.ts'
import { formatCash } from '../../src/store.ts'
import type { CrewRow } from '../../src/crews.ts'

const crew: CrewRow = {
  id: 'c1',
  name: 'Bull Valley',
  tag: 'bvc',
  leader: 'b',
  members: [
    { account: 'a', username: 'Able', joined: 1 },
    { account: 'b', username: 'Baker', joined: 2 },
    { account: 'c', username: 'Charlie', joined: 3 },
  ],
}

describe('a tag and a name', () => {
  it('takes 2 to 4 letters or digits, shown in capitals', () => {
    for (const tag of ['BV', 'bvc', 'B4VC']) expect(isValidTag(tag)).toBe(true)
    for (const tag of ['B', 'BVCXY', 'B C', 'B_V', 7]) {
      expect(isValidTag(tag)).toBe(false)
    }
    expect(showTag('bvc')).toBe('BVC')
  })

  it('names a crew as a raider is named', () => {
    expect(isValidCrewName('Bull Valley')).toBe(true)
    expect(isValidCrewName('')).toBe(false)
    expect(isValidCrewName('x'.repeat(40))).toBe(false)
  })
})

describe('who leads next', () => {
  it('is the member longest in it, or no one', () => {
    expect(nextLeader(crew.members, 'b')).toBe('a')
    expect(nextLeader(crew.members, 'a')).toBe('b')
    expect(nextLeader([crew.members[0]], 'a')).toBeNull()
  })
})

describe('the crew frame', () => {
  it('sends the crew, its leader first, and the invites waiting', () => {
    const online = (account: string) => account !== 'c'
    expect(crewWire(crew, [{ tag: 'ZZ', name: 'Other' }], online)).toEqual({
      crew: {
        name: 'Bull Valley',
        tag: 'BVC',
        leader: 'Baker',
        members: [
          { name: 'Baker', online: true },
          { name: 'Able', online: true },
          { name: 'Charlie', online: false },
        ],
      },
      invites: [{ tag: 'ZZ', name: 'Other' }],
    })
    expect(crewWire(null, [], online)).toEqual({ crew: null, invites: [] })
  })

  it('says it in the log', () => {
    const wire = crewWire(
      crew,
      [{ tag: 'ZZ', name: 'Other' }],
      (a) => a !== 'c'
    )
    expect(crewLines(wire)).toEqual([
      copy('crew.heading_line', { tag: 'BVC', crew: 'Bull Valley' }),
      copy('crew.members', {
        names: [
          copy('crew.leader_name', { name: 'Baker' }),
          'Able',
          copy('party.away', { name: 'Charlie' }),
        ].join(', '),
      }),
      copy('crew.invite_waiting', { tag: 'ZZ', crew: 'Other' }),
    ])
    expect(crewLines({ crew: null, invites: [] })).toEqual([copy('crew.none')])
  })
})

describe('what a crew frame names', () => {
  it('is its tag, its raider, or nothing', () => {
    expect(crewNamed({ type: 'crew-create', tag: 'BV', name: 'X' })).toBe('BV')
    expect(crewNamed({ type: 'crew-join', tag: 'BV' })).toBe('BV')
    expect(crewNamed({ type: 'crew-invite', name: 'Able' })).toBe('Able')
    expect(crewNamed({ type: 'crew-kick', name: 'Able' })).toBe('Able')
    expect(crewNamed({ type: 'crew-leave' })).toBeNull()
  })
})

describe('crew news', () => {
  const news = (n: Parameters<typeof crewNews>[0]['news'], name: string) =>
    crewNews({ news: n, name, tag: 'bvc', crew: 'Bull Valley' }, 'Me')

  it('says each piece, the raider’s own as theirs', () => {
    const at = { tag: 'BVC', crew: 'Bull Valley' }
    expect(news('created', 'Me')).toBe(copy('crew.created', at))
    expect(news('invited', 'Able')).toBe(
      copy('crew.news_invited', { name: 'Able', ...at })
    )
    expect(news('sent', 'Able')).toBe(copy('crew.sent', { name: 'Able' }))
    expect(news('joined', 'Me')).toBe(copy('crew.you_joined', at))
    expect(news('joined', 'Able')).toBe(
      copy('crew.news_joined', { name: 'Able' })
    )
    expect(news('left', 'Me')).toBe(copy('crew.you_left'))
    expect(news('left', 'Able')).toBe(copy('crew.news_left', { name: 'Able' }))
    expect(news('kicked', 'Me')).toBe(copy('crew.you_kicked'))
    expect(news('kicked', 'Able')).toBe(
      copy('crew.news_kicked', { name: 'Able' })
    )
    expect(news('leader', 'Me')).toBe(copy('crew.you_lead'))
    expect(news('leader', 'Able')).toBe(
      copy('crew.news_leader', { name: 'Able' })
    )
    expect(news('ended', 'Me')).toBe(copy('crew.ended', { tag: 'BVC' }))
  })

  it('says why a crew frame was refused', () => {
    const cases: [string, string][] = [
      ['short', copy('crew.short', { cost: formatCash(CONFIG.crews.cost) })],
      ['tag-taken', copy('crew.tag_taken', { tag: 'BVC' })],
      ['name-taken', copy('crew.name_taken')],
      ['bad-tag', copy('crew.bad_tag')],
      ['in-crew', copy('crew.in_crew')],
      ['their-crew', copy('crew.their_crew', { name: 'bvc' })],
      ['no-crew', copy('crew.none')],
      ['not-leader', copy('crew.not_leader')],
      ['unknown', copy('friends.unknown', { name: 'bvc' })],
      ['no-invite', copy('crew.no_invite', { tag: 'BVC' })],
      ['not-member', copy('crew.not_member', { name: 'bvc' })],
      ['self', copy('crew.self')],
      ['full', copy('crew.full', { size: CONFIG.crews.size })],
      ['too-fast', copy('chat.too_fast')],
      ['unavailable', copy('crew.failed')],
    ]
    for (const [reason, line] of cases) {
      expect(crewRefusal(reason, 'bvc')).toBe(line)
    }
  })
})
