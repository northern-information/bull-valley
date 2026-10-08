import { describe, expect, it } from 'vitest'
import {
  CHAT_FADE_MS,
  CHAT_LINES,
  chatCommand,
  formatStamp,
  isFaded,
  onlineLine,
  othersLine,
  pushLine,
} from '../../src/chat.ts'
import { copy } from '../../src/copy.ts'
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

describe('chatCommand', () => {
  it('leaves a plain line to the valley', () => {
    expect(chatCommand('cabbages by the keep')).toBeNull()
    expect(chatCommand('who is /online')).toBeNull()
  })

  it('reads /online in any case, with anything after it', () => {
    expect(chatCommand('/online')).toBe('online')
    expect(chatCommand('/ONLINE')).toBe('online')
    expect(chatCommand('/online please')).toBe('online')
  })

  it('calls any other slash a command it does not know', () => {
    expect(chatCommand('/who')).toBe('unknown')
    expect(chatCommand('/')).toBe('unknown')
  })
})

describe('othersLine', () => {
  it('says none, one, or how many', () => {
    expect(othersLine(0)).toBe(copy('log.welcome_none'))
    expect(othersLine(1)).toBe(copy('log.welcome_one'))
    expect(othersLine(3)).toBe(copy('log.welcome_many', { count: 3 }))
  })
})

describe('onlineLine', () => {
  const raider = (name: string, level = 1) => ({ name, level })
  const named = (name: string, level = 1) =>
    copy('chat.online_name', { name, level })

  it('names this raider first, then the others by name, with levels', () => {
    expect(
      onlineLine(raider('Mo', 3), [
        raider('zed'),
        raider('Able', 12),
        raider('baker'),
      ])
    ).toBe(
      copy('chat.online', {
        names: [
          named('Mo', 3),
          named('Able', 12),
          named('baker'),
          named('zed'),
        ].join(', '),
      })
    )
  })

  it('names this raider alone', () => {
    expect(onlineLine(raider('Mo'), [])).toBe(
      copy('chat.online', { names: named('Mo') })
    )
  })
})
