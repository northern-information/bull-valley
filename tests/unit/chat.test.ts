import { describe, expect, it } from 'vitest'
import {
  CHAT_FADE_MS,
  CHAT_LINES,
  chatCommand,
  emoteLine,
  emotesLine,
  formatStamp,
  isFaded,
  onlineLine,
  othersLine,
  pushLine,
} from '../../src/chat.ts'
import { copy } from '../../src/copy.ts'
import { EMOTE_IDS } from '../../src/emotes.ts'
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
    expect(chatCommand('/online')).toEqual({ name: 'online' })
    expect(chatCommand('/ONLINE')).toEqual({ name: 'online' })
    expect(chatCommand('/online please')).toEqual({ name: 'online' })
  })

  it('reads a whisper: /w or /whisper, a name, and the rest', () => {
    expect(chatCommand('/w Baker meet at the maze')).toEqual({
      name: 'whisper',
      to: 'Baker',
      text: 'meet at the maze',
    })
    expect(chatCommand('/Whisper baker hi')).toEqual({
      name: 'whisper',
      to: 'baker',
      text: 'hi',
    })
    expect(chatCommand('/w Baker')).toEqual({
      name: 'usage',
      line: copy('chat.usage_whisper'),
    })
    expect(chatCommand('/w')).toEqual({
      name: 'usage',
      line: copy('chat.usage_whisper'),
    })
    // A name no raider could have never goes to the valley.
    const long = 'x'.repeat(40)
    expect(chatCommand(`/w ${long} hi`)).toEqual({
      name: 'usage',
      line: copy('chat.whisper_not_here', { name: long }),
    })
  })

  it('reads /friend, /unfriend and /friends', () => {
    expect(chatCommand('/friend Baker')).toEqual({
      name: 'friend',
      who: 'Baker',
    })
    expect(chatCommand('/UNFRIEND baker now')).toEqual({
      name: 'unfriend',
      who: 'baker',
    })
    expect(chatCommand('/friends')).toEqual({ name: 'friends' })
    expect(chatCommand('/friend')).toEqual({
      name: 'usage',
      line: copy('chat.usage_friend'),
    })
    expect(chatCommand('/unfriend')).toEqual({
      name: 'usage',
      line: copy('chat.usage_unfriend'),
    })
    const long = 'x'.repeat(40)
    expect(chatCommand(`/friend ${long}`)).toEqual({
      name: 'usage',
      line: copy('friends.unknown', { name: long }),
    })
  })

  it('reads /emotes, and an emote by its name in any case', () => {
    expect(chatCommand('/emotes')).toEqual({ name: 'emotes' })
    expect(chatCommand('/wave')).toEqual({ name: 'emote', id: 'wave' })
    expect(chatCommand('/Sit down')).toEqual({ name: 'emote', id: 'sit' })
    expect(chatCommand('/kneel')).toEqual({ name: 'emote', id: 'kneel' })
  })

  it('calls any other slash a command it does not know', () => {
    expect(chatCommand('/who')).toEqual({ name: 'unknown' })
    expect(chatCommand('/')).toEqual({ name: 'unknown' })
  })
})

describe('emoteLine', () => {
  it('tells the raider what they did, and others what they saw', () => {
    for (const id of EMOTE_IDS) {
      expect(emoteLine(id, null)).toBe(copy(`emotes.${id}_self`))
      expect(emoteLine(id, 'Dave')).toBe(
        copy(`emotes.${id}_seen`, { name: 'Dave' })
      )
    }
    expect(emoteLine('wave', 'Dave')).toContain('Dave')
  })

  it('lists every emote as it is typed', () => {
    const line = emotesLine()
    for (const id of EMOTE_IDS) expect(line).toContain(`/${id}`)
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
  it('names this raider first, then the others by name', () => {
    expect(onlineLine('Mo', ['zed', 'Able', 'baker'])).toBe(
      copy('chat.online', { names: 'Mo, Able, baker, zed' })
    )
  })

  it('names this raider alone', () => {
    expect(onlineLine('Mo', [])).toBe(copy('chat.online', { names: 'Mo' }))
  })
})
