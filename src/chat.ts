// The chat log in the lower left: what it holds and when it fades. Pure:
// the lines come from the valley's chat frames (or the player's own, when
// offline) and hud.ts draws them. Nothing is kept past the page.

import { copy } from './copy.ts'
import { isValidName } from './protocol.ts'

// A line a raider said, a whisper to or from this player, a line an NPC
// said to this player, or a line the game says to the player alone.
export interface ChatLine {
  kind: 'say' | 'whisper' | 'npc' | 'system'
  // For 'say', 'whisper' and 'npc': who said it, or for a whisper this
  // player sent, who it went to, as the log heads the line.
  name?: string
  text: string
  // When it was said, epoch ms: the valley's clock for a raider's line,
  // this machine's for the rest.
  at: number
}

// Lines kept in the log; older ones scroll off.
export const CHAT_LINES = 50

// How long the log stays up after the last line while chat is closed.
export const CHAT_FADE_MS = 10_000

export const CHAT_COPY = {
  tooFast: copy('chat.too_fast'),
  offline: copy('chat.offline'),
} as const

// A line typed with a leading slash is a command, never said to the whole
// valley: /online is answered here; /w (or /whisper) sends one raider a
// whisper; /friend asks a raider to be friends or accepts their asking,
// /unfriend undoes it, and /friends asks for the list (friends.ts).
// `usage` is a command missing what it needs, with the line that says how.
export type ChatCommand =
  | { name: 'online' }
  | { name: 'friends' }
  | { name: 'whisper'; to: string; text: string }
  | { name: 'friend' | 'unfriend'; who: string }
  | { name: 'usage'; line: string }
  | { name: 'unknown' }

export function chatCommand(text: string): ChatCommand | null {
  if (!text.startsWith('/')) return null
  const [word = '', ...rest] = text.slice(1).trim().split(' ')
  const command = word.toLowerCase()
  if (command === 'online') return { name: 'online' }
  if (command === 'friends') return { name: 'friends' }
  if (command === 'w' || command === 'whisper') {
    const [to = '', ...words] = rest
    const said = words.join(' ')
    if (!to || !said) return { name: 'usage', line: copy('chat.usage_whisper') }
    // A name no raider could have never goes on the wire, where the valley
    // would take it for a malformed frame.
    if (!isValidName(to)) {
      return {
        name: 'usage',
        line: copy('chat.whisper_not_here', { name: to }),
      }
    }
    return { name: 'whisper', to, text: said }
  }
  if (command === 'friend' || command === 'unfriend') {
    const [who = ''] = rest
    if (!who) {
      return {
        name: 'usage',
        line:
          command === 'friend'
            ? copy('chat.usage_friend')
            : copy('chat.usage_unfriend'),
      }
    }
    if (!isValidName(who)) {
      return { name: 'usage', line: copy('friends.unknown', { name: who }) }
    }
    return { name: command, who }
  }
  return { name: 'unknown' }
}

// How many others are in the valley, as the log says it.
export function othersLine(count: number): string {
  if (count === 0) return copy('log.welcome_none')
  if (count === 1) return copy('log.welcome_one')
  return copy('log.welcome_many', { count })
}

// Who is in the valley, for /online: this raider first, then the others
// by name.
export function onlineLine(self: string, others: readonly string[]): string {
  const sorted = [...others].sort((a, b) =>
    a.localeCompare(b, undefined, { sensitivity: 'base' })
  )
  return copy('chat.online', { names: [self, ...sorted].join(', ') })
}

// The log with one more line, keeping the newest CHAT_LINES.
export function pushLine(
  lines: readonly ChatLine[],
  line: ChatLine
): ChatLine[] {
  const next = [...lines, line]
  return next.length > CHAT_LINES ? next.slice(-CHAT_LINES) : next
}

// Whether the log has faded: never while it is held (typing, or the cursor
// over it), and only once CHAT_FADE_MS has passed since the last line.
// lastAt is null before the first line.
export function isFaded(
  lastAt: number | null,
  now: number,
  held: boolean
): boolean {
  if (held) return false
  if (lastAt === null) return true
  return now - lastAt >= CHAT_FADE_MS
}

// A line's time as the log shows it: local 24-hour HH:MM.
export function formatStamp(at: number): string {
  const d = new Date(at)
  const hh = String(d.getHours()).padStart(2, '0')
  const mm = String(d.getMinutes()).padStart(2, '0')
  return `${hh}:${mm}`
}
