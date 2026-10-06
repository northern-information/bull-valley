import { describe, expect, it } from 'vitest'
import {
  CHAT_FADE_MS,
  CHAT_LINES,
  formatStamp,
  isFaded,
  pushLine,
} from '../../src/chat.ts'
import type { ChatLine } from '../../src/chat.ts'

const line = (text: string): ChatLine => ({
  kind: 'say',
  name: 'Dave',
  text,
  at: 0,
})

describe('pushLine', () => {
  it('appends without touching the old log', () => {
    const before: ChatLine[] = [line('one')]
    const after = pushLine(before, line('two'))
    expect(after.map((l) => l.text)).toEqual(['one', 'two'])
    expect(before).toHaveLength(1)
  })

  it('keeps the newest CHAT_LINES', () => {
    let log: ChatLine[] = []
    for (let i = 0; i < CHAT_LINES + 5; i++) log = pushLine(log, line(`${i}`))
    expect(log).toHaveLength(CHAT_LINES)
    expect(log[0]?.text).toBe('5')
    expect(log.at(-1)?.text).toBe(`${CHAT_LINES + 4}`)
  })
})

describe('isFaded', () => {
  it('is faded before the first line', () => {
    expect(isFaded(null, 0, false)).toBe(true)
  })

  it('shows a fresh line, then fades', () => {
    expect(isFaded(1000, 1000 + CHAT_FADE_MS - 1, false)).toBe(false)
    expect(isFaded(1000, 1000 + CHAT_FADE_MS, false)).toBe(true)
  })

  it('never fades while held', () => {
    expect(isFaded(null, 0, true)).toBe(false)
    expect(isFaded(0, CHAT_FADE_MS * 10, true)).toBe(false)
  })
})

describe('formatStamp', () => {
  it('reads local 24-hour time, zero-padded', () => {
    expect(formatStamp(new Date(2026, 9, 6, 9, 5).getTime())).toBe('09:05')
    expect(formatStamp(new Date(2026, 9, 6, 23, 59, 59).getTime())).toBe(
      '23:59'
    )
    expect(formatStamp(new Date(2026, 9, 6, 0, 0).getTime())).toBe('00:00')
  })
})
