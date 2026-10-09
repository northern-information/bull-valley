// Friends and whispers (sharedworld.ts rule 20): a raider asks another by
// name (/friend name) and they are friends once the other asks back; the
// list says who is online and roughly where; a whisper (/w name message)
// goes to one raider's sockets alone, under the chat rules, and is never
// kept. Friendships are the accounts', in D1 (worker/accounts.ts), and
// only usernames ever go on the wire.
//
// Pure, no Three: what a request comes to, where a raider roughly is, and
// the list as the log says it.

import { CONFIG } from './config.ts'
import { copy } from './copy.ts'
import { inMaze, worldToMaze } from './maze.ts'
import type { XZ } from './interfaces.ts'
import type { MazePlace } from './maze.ts'
import type { FriendWire, PeerStateWire, Whereabouts } from './protocol.ts'

// Where one account stands with another: friends, asked by this one and
// waiting, or asking this one and waiting.
export type FriendState = 'friend' | 'asked' | 'asking'

// What asking comes to, from where the two stand now: a fresh request, the
// other's request accepted (they become friends), a request already made,
// friends already, or no one to ask (yourself).
export type AskOutcome =
  'requested' | 'accepted' | 'already-asked' | 'already-friends' | 'self'

export function askOutcome(
  state: FriendState | null,
  self: boolean
): AskOutcome {
  if (self) return 'self'
  if (state === 'friend') return 'already-friends'
  if (state === 'asked') return 'already-asked'
  if (state === 'asking') return 'accepted'
  return 'requested'
}

// How many friendships and requests one account may hold at once.
export const FRIENDS_MAX = 100

// What asking comes to in the store: the outcome, or no room on the
// asker's list (FRIENDS_MAX).
export type AskResult = AskOutcome | 'full'

// One name on an account's list as the store keeps it; the account id
// never leaves the Worker.
export interface FriendRow {
  accountId: string
  username: string
  state: FriendState
}

// Usernames are unique without regard to case (account.ts), so a name
// typed in any case finds its raider.
export function sameName(a: string, b: string): boolean {
  return a.localeCompare(b, undefined, { sensitivity: 'base' }) === 0
}

// Where a raider roughly is, from their last state frame: riding with
// Marx, in the corn maze, on a Citgo's forecourt, or out in the valley.
// Null before their first frame.
export function whereabouts(
  at: PeerStateWire | null,
  world: { havens: readonly XZ[]; maze: MazePlace | null } | null
): Whereabouts | null {
  if (!at) return null
  if (at.riding) return 'riding'
  if (world?.maze) {
    const local = worldToMaze(world.maze, at)
    if (inMaze(CONFIG.maze.size, local.x, local.z)) return 'maze'
  }
  const near = CONFIG.shadowmen.havenRadius
  if (world?.havens.some((h) => Math.hypot(h.x - at.x, h.z - at.z) <= near)) {
    return 'citgo'
  }
  return 'valley'
}

// Each whereabouts as the log says it.
const WHERE: Record<Whereabouts, () => string> = {
  riding: () => copy('friends.where_riding'),
  maze: () => copy('friends.where_maze'),
  citgo: () => copy('friends.where_citgo'),
  valley: () => copy('friends.where_valley'),
}

// The friends list as the log says it, one line each: friends first,
// online before offline, then requests either way, each by name.
export function friendLines(friends: readonly FriendWire[]): string[] {
  if (friends.length === 0) return [copy('friends.none')]
  const byName = (a: FriendWire, b: FriendWire) =>
    a.name.localeCompare(b.name, undefined, { sensitivity: 'base' })
  const rank = (f: FriendWire) =>
    f.state === 'friend' ? (f.online ? 0 : 1) : f.state === 'asking' ? 2 : 3
  return [...friends]
    .sort((a, b) => rank(a) - rank(b) || byName(a, b))
    .map((f) => {
      if (f.state === 'asking') return copy('friends.asking', { name: f.name })
      if (f.state === 'asked') return copy('friends.asked', { name: f.name })
      if (!f.online) return copy('friends.offline', { name: f.name })
      return copy('friends.online', {
        name: f.name,
        where: WHERE[f.where ?? 'valley'](),
      })
    })
}

// A /friend or /unfriend this raider sent and the valley has not answered.
export interface PendingAsk {
  op: 'friend' | 'unfriend'
  name: string
}

// The log line a new list settles a pending ask with: asked, friends now
// (they had asked first), or removed. Null while the list does not show
// it yet.
export function settledAsk(
  pending: PendingAsk,
  friends: readonly FriendWire[]
): string | null {
  const entry = friends.find((f) => sameName(f.name, pending.name))
  if (pending.op === 'unfriend') {
    return entry ? null : copy('friends.removed', { name: pending.name })
  }
  if (entry?.state === 'friend') {
    return copy('friends.now', { name: entry.name })
  }
  if (entry?.state === 'asked') {
    return copy('friends.sent', { name: entry.name })
  }
  return null
}

// Why the valley refused a /friend or /unfriend, as the log says it.
export function friendRefusal(reason: string, name: string): string {
  switch (reason) {
    case 'unknown':
      return copy('friends.unknown', { name })
    case 'self':
      return copy('friends.self')
    case 'already-friends':
      return copy('friends.already_friends', { name })
    case 'already-asked':
      return copy('friends.already_asked', { name })
    case 'full':
      return copy('friends.full')
    case 'not-friends':
      return copy('friends.not_friends', { name })
    case 'too-fast':
      return copy('chat.too_fast')
    default:
      return copy('friends.failed')
  }
}

// Why the valley refused a whisper, as the log says it.
export function whisperRefusal(reason: string, name: string): string {
  if (reason === 'not-here') return copy('chat.whisper_not_here', { name })
  if (reason === 'self') return copy('chat.whisper_self')
  return copy('chat.too_fast')
}

// What a friend-news frame says in the log.
export function friendNews(
  news: 'asked' | 'accepted' | 'online',
  name: string
): string {
  if (news === 'asked') return copy('friends.news_asked', { name })
  if (news === 'accepted') return copy('friends.news_accepted', { name })
  return copy('friends.news_online', { name })
}
