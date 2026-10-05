// The chat log in the lower left: what it holds and when it fades. Pure:
// the lines come from the valley's chat frames (or the player's own, when
// offline) and hud.ts draws them. Nothing is kept past the page.

import { copy } from './copy.ts'

// A line someone said, or a line the game says to the player alone.
export interface ChatLine {
  kind: 'say' | 'system'
  // For 'say'.
  name?: string
  text: string
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

// Whether the log has faded: never while typing, and only once CHAT_FADE_MS
// has passed since the last line. lastAt is null before the first line.
export function isFaded(
  lastAt: number | null,
  now: number,
  open: boolean
): boolean {
  if (open) return false
  if (lastAt === null) return true
  return now - lastAt >= CHAT_FADE_MS
}
