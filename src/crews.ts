// Crews (sharedworld.ts rule 35): the guild a raider belongs to for good.
// A crew has a name, a short tag every member wears on their name tag
// ([BVC] raider), a leader and up to CONFIG.crews.size members; a raider
// is in one at most. Starting one costs CONFIG.crews.cost out of the
// wallet. Only the leader invites (any raider, in the valley or not) and
// puts a member out; an invite waits CONFIG.crews.inviteMs. A leader who
// leaves hands the crew to the member longest in it, and the last one
// out ends it. Its chat (/c message) goes to its members alone. Crews are
// the accounts', in D1 (worker/d1crews.ts); only names and tags go on the
// wire.
//
// Pure, no Three: what a tag and a name may be, who leads next, the frame
// a member is sent, and the lines the log says.

import { CONFIG } from './config.ts'
import { copy } from './copy.ts'
import { isValidName } from './protocol.ts'
import { formatCash } from './store.ts'
import type { CrewFrame } from './chat.ts'
import type { CrewNewsMessage, CrewWire } from './protocol.ts'

// A tag: 2 to 4 letters or digits, unique in any case, shown in capitals.
export function isValidTag(tag: unknown): tag is string {
  return typeof tag === 'string' && /^[A-Za-z0-9]{2,4}$/.test(tag)
}

export function showTag(tag: string): string {
  return tag.toUpperCase()
}

// A crew's name follows the chat names' rules (protocol.ts isValidName):
// normalized, 1 to NAME_MAX characters, spaces and all.
export function isValidCrewName(name: unknown): name is string {
  return isValidName(name)
}

// One member as the store keeps them: the account (never on the wire),
// the name it goes by, and when it joined.
export interface CrewMember {
  account: string
  username: string
  joined: number
}

export interface CrewRow {
  id: string
  name: string
  tag: string
  leader: string
  members: CrewMember[]
}

// Who leads once `leaving` is gone: the member longest in the crew, or
// null when no one is left.
export function nextLeader(
  members: readonly CrewMember[],
  leaving: string
): string | null {
  const left = members.filter((m) => m.account !== leaving)
  if (left.length === 0) return null
  return left.reduce((a, b) => (b.joined < a.joined ? b : a)).account
}

// What `account` is sent: its crew (by name, its members each with
// whether they are in the valley now, the leader first) and the invites
// waiting on it.
export function crewWire(
  crew: CrewRow | null,
  invites: readonly { tag: string; name: string }[],
  online: (account: string) => boolean
): { crew: CrewWire | null; invites: { tag: string; name: string }[] } {
  if (!crew) return { crew: null, invites: [...invites] }
  const leader = crew.members.find((m) => m.account === crew.leader)
  const members = [...crew.members].sort(
    (a, b) =>
      Number(b.account === crew.leader) - Number(a.account === crew.leader) ||
      a.joined - b.joined
  )
  return {
    crew: {
      name: crew.name,
      tag: showTag(crew.tag),
      leader: leader?.username ?? '',
      members: members.map((m) => ({
        name: m.username,
        online: online(m.account),
      })),
    },
    invites: [...invites],
  }
}

// What a crew frame names, for its refusal's line: the tag a start or a
// join names, the raider an invite or a put-out names, or nothing.
export function crewNamed(frame: CrewFrame): string | null {
  switch (frame.type) {
    case 'crew-create':
    case 'crew-join':
      return frame.tag
    case 'crew-invite':
    case 'crew-kick':
      return frame.name
    default:
      return null
  }
}

// Why a crew's frame was refused, as the log says it.
export function crewRefusal(reason: string, name: string): string {
  switch (reason) {
    case 'short':
      return copy('crew.short', { cost: formatCash(CONFIG.crews.cost) })
    case 'tag-taken':
      return copy('crew.tag_taken', { tag: showTag(name) })
    case 'name-taken':
      return copy('crew.name_taken')
    case 'bad-tag':
      return copy('crew.bad_tag')
    case 'in-crew':
      return copy('crew.in_crew')
    case 'their-crew':
      return copy('crew.their_crew', { name })
    case 'no-crew':
      return copy('crew.none')
    case 'not-leader':
      return copy('crew.not_leader')
    case 'unknown':
      return copy('friends.unknown', { name })
    case 'no-invite':
      return copy('crew.no_invite', { tag: showTag(name) })
    case 'not-member':
      return copy('crew.not_member', { name })
    case 'self':
      return copy('crew.self')
    case 'full':
      return copy('crew.full', { size: CONFIG.crews.size })
    case 'too-fast':
      return copy('chat.too_fast')
    default:
      return copy('crew.failed')
  }
}

// What a crew-news frame says in the log, to the raider named `me`.
export function crewNews(
  msg: Omit<CrewNewsMessage, 'type'>,
  me: string
): string {
  const { news, name } = msg
  const tag = showTag(msg.tag)
  const mine = name === me
  switch (news) {
    case 'created':
      return copy('crew.created', { tag, crew: msg.crew })
    case 'invited':
      return copy('crew.news_invited', { name, tag, crew: msg.crew })
    case 'sent':
      return copy('crew.sent', { name })
    case 'joined':
      return mine
        ? copy('crew.you_joined', { tag, crew: msg.crew })
        : copy('crew.news_joined', { name })
    case 'left':
      return mine ? copy('crew.you_left') : copy('crew.news_left', { name })
    case 'kicked':
      return mine ? copy('crew.you_kicked') : copy('crew.news_kicked', { name })
    case 'leader':
      return mine ? copy('crew.you_lead') : copy('crew.news_leader', { name })
    case 'ended':
      return copy('crew.ended', { tag })
  }
}

// The crew as /crew says it in the log.
export function crewLines(wire: {
  crew: CrewWire | null
  invites: readonly { tag: string; name: string }[]
}): string[] {
  const lines: string[] = []
  const { crew } = wire
  if (crew) {
    lines.push(copy('crew.heading_line', { tag: crew.tag, crew: crew.name }))
    lines.push(
      copy('crew.members', {
        names: crew.members
          .map((m) => {
            const name =
              m.name === crew.leader
                ? copy('crew.leader_name', { name: m.name })
                : m.name
            return m.online ? name : copy('party.away', { name })
          })
          .join(', '),
      })
    )
  } else {
    lines.push(copy('crew.none'))
  }
  for (const invite of wire.invites) {
    lines.push(
      copy('crew.invite_waiting', { tag: invite.tag, crew: invite.name })
    )
  }
  return lines
}
