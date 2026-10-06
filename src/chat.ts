// The chat log in the lower left: what it holds and when it fades. Pure:
// the lines come from the valley's chat frames (or the player's own, when
// offline) and hud.ts draws them. Nothing is kept past the page.

import { copy } from './copy.ts'

// A line a raider said, a line an NPC said to this player, or a line the
// game says to the player alone.
export interface ChatLine {
  kind: 'say' | 'npc' | 'system'
  // For 'say' and 'npc'.
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
