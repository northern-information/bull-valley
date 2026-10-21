// Inspecting another raider: E on one in reach, or /inspect name, asks the
// valley for their card, and the valley answers the asker alone (an
// inspected frame). The card says what anyone may see of an account: its
// name, level and look, how much of the Book of Shadows it has found, how
// far through the season it is, and where the asker stands with it as a
// friend. The valley reads all of it from D1 (worker/ValleyDO.ts), so a
// raider can be inspected whether they are in the valley or not; never an
// account id.
//
// Pure, no Three: the card built from what the valley read, the rows both
// apps draw, the friend button's label, and a refusal as the log says it.

import { BOOK } from './book.ts'
import { pickOf } from './characters.ts'
import { copy } from './copy.ts'
import { cosmeticById } from './cosmetics.ts'
import { showTag } from './crews.ts'
import { finishById } from './finishes.ts'
import { outfitById } from './outfits.ts'
import { levelOf } from './progression.ts'
import { SEASON } from './season.ts'
import type { LookWire } from './account.ts'
import type { CosmeticId } from './cosmetics.ts'
import type { FriendRow } from './friends.ts'
import type { InspectWire } from './protocol.ts'
import type { SeasonProgress } from './season.ts'

// What the valley read of the inspected account, and of the asker's
// friends list.
export interface InspectRead {
  name: string
  xp: number
  look: LookWire
  cosmetics: readonly CosmeticId[]
  // The Book of Shadows entries found, in any order.
  found: readonly string[]
  season: SeasonProgress
  // The asker's own card.
  self: boolean
  // The asker's row for the inspected account, if there is one.
  friend: FriendRow | undefined
  // Where the asker stands with them in a party (party.ts standing).
  party: InspectWire['party']
  // Rule 35: their crew, and whether the asker may invite them to theirs.
  crew: InspectWire['crew']
  crewInvite: boolean
  online: boolean
}

export function cardOf(read: InspectRead): InspectWire {
  const found = new Set(read.found)
  const { outfit, finish } = pickOf(read.look)
  return {
    name: read.name,
    level: levelOf(read.xp),
    outfit,
    finish,
    cosmetics: [...read.cosmetics],
    book: {
      found: BOOK.filter((entry) => found.has(entry.id)).length,
      of: BOOK.length,
    },
    season: {
      kills: Math.min(read.season.kills, SEASON.goal),
      goal: SEASON.goal,
      claimed: read.season.claimed,
    },
    friend: read.self ? 'self' : (read.friend?.state ?? null),
    party: read.self ? null : read.party,
    crew: read.crew && { name: read.crew.name, tag: showTag(read.crew.tag) },
    crewInvite: !read.self && read.crew === null && read.crewInvite,
    online: read.online,
  }
}

// One row of the card: what it is, and what it says.
export interface CardRow {
  label: string
  value: string
}

export function cardRows(card: InspectWire): CardRow[] {
  const worn = card.cosmetics
    .map((id) => cosmeticById(id)?.label)
    .filter((label): label is string => label !== undefined)
  return [
    {
      label: copy('inspect.level'),
      value: copy('level.title', { level: card.level }),
    },
    {
      label: copy('inspect.character'),
      value: copy('inspect.character_value', {
        character: outfitById(card.outfit).label,
        finish: finishById(card.finish).label,
      }),
    },
    {
      label: copy('inspect.cosmetics'),
      value: worn.length > 0 ? worn.join(', ') : copy('inspect.none'),
    },
    {
      label: copy('crew.heading'),
      value: card.crew
        ? copy('crew.heading_line', {
            tag: card.crew.tag,
            crew: card.crew.name,
          })
        : copy('inspect.none_crew'),
    },
    {
      label: copy('book.title'),
      value: copy('book.tally', card.book),
    },
    {
      label: copy('season.kicker'),
      value: card.season.claimed
        ? copy('season.complete')
        : copy('season.progress', {
            kills: card.season.kills,
            goal: card.season.goal,
          }),
    },
  ]
}

// The card's eyebrow: in the valley or away.
export function cardStatus(card: InspectWire): string {
  return card.online ? copy('inspect.online') : copy('inspect.away')
}

// The friend button under a card: what it says, and whether it does
// anything. None on the raider's own card.
export function friendButton(
  card: InspectWire
): { label: string; enabled: boolean } | null {
  switch (card.friend) {
    case 'self':
      return null
    case 'friend':
      return { label: copy('inspect.friends'), enabled: false }
    case 'asked':
      return { label: copy('inspect.asked'), enabled: false }
    case 'asking':
      return { label: copy('inspect.accept'), enabled: true }
    case null:
      return { label: copy('inspect.add_friend'), enabled: true }
  }
}

// The card after the asker pressed its friend button: the state the
// valley will answer with, so the button changes at once.
export function befriended(card: InspectWire): InspectWire {
  if (card.friend === 'asking') return { ...card, friend: 'friend' }
  if (card.friend === null) return { ...card, friend: 'asked' }
  return card
}

// The party button under a card (rule 34): invite them, join them (they
// invited the asker), or say how the two stand. None on the raider's own
// card; a raider away from the valley cannot be invited.
export function partyButton(
  card: InspectWire
): { label: string; enabled: boolean } | null {
  if (card.friend === 'self') return null
  switch (card.party) {
    case 'member':
      return { label: copy('party.member_button'), enabled: false }
    case 'invited':
      return { label: copy('party.invited_button'), enabled: false }
    case 'inviting':
      return { label: copy('party.join_button'), enabled: card.online }
    case null:
      return { label: copy('party.invite_button'), enabled: card.online }
  }
}

// The card after the asker pressed its party button.
export function partied(card: InspectWire): InspectWire {
  if (card.party === 'inviting') return { ...card, party: 'member' }
  if (card.party === null) return { ...card, party: 'invited' }
  return card
}

// The crew button under a card (rule 35): an invite to the asker's crew,
// shown only when the asker leads one and they are in none.
export function crewButton(
  card: InspectWire,
  sent: boolean
): { label: string; enabled: boolean } | null {
  if (!card.crewInvite) return null
  return sent
    ? { label: copy('crew.invited_button'), enabled: false }
    : { label: copy('crew.invite_button'), enabled: true }
}

// Why the valley refused an inspect, as the log says it.
export function inspectRefusal(reason: string, name: string): string {
  if (reason === 'unknown') return copy('friends.unknown', { name })
  if (reason === 'too-fast') return copy('inspect.too_fast')
  return copy('inspect.failed')
}
