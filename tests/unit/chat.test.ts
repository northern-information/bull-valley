import { describe, expect, it } from 'vitest'
import { CHAT_FADE_MS, CHAT_LINES, isFaded, pushLine } from '../../src/chat.ts'
import type { ChatLine } from '../../src/chat.ts'

const line = (text: string): ChatLine => ({ kind: 'say', name: 'Dave', text })

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

  it('never fades while typing', () => {
    expect(isFaded(null, 0, true)).toBe(false)
    expect(isFaded(0, CHAT_FADE_MS * 10, true)).toBe(false)
  })
})
