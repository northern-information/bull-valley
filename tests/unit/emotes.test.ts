import { describe, expect, it } from 'vitest'
import {
  EMOTE_IDS,
  emoteOf,
  EMOTES,
  holds,
  isEmote,
  seenEmote,
  STILL_SPEED,
} from '../../src/emotes.ts'
import { POSES, samplePose } from '../../src/poses.ts'

const still = { speed: 0, crouching: false, aboard: false }

describe('the emotes', () => {
  it('each takes a pose the body knows', () => {
    for (const id of EMOTE_IDS) {
      const { pose } = EMOTES[id]
      expect(POSES[pose]).toBeDefined()
      expect(() => samplePose(pose, 1.3)).not.toThrow()
    }
  })

  it('are named as they are typed', () => {
    expect(EMOTE_IDS).toEqual([
      'wave',
      'sit',
      'smoke',
      'dance',
      'point',
      'shrug',
      'kneel',
    ])
    expect(emoteOf('Wave')).toBe('wave')
    expect(emoteOf(' kneel ')).toBe('kneel')
    expect(emoteOf('moonwalk')).toBeNull()
    expect(emoteOf('constructor')).toBeNull()
    expect(isEmote('dance')).toBe(true)
    expect(isEmote('stand')).toBe(false)
    expect(isEmote(7)).toBe(false)
  })

  it('sink the eye only for sitting and kneeling', () => {
    const sunk = EMOTE_IDS.filter((id) => EMOTES[id].eye !== null)
    expect(sunk).toEqual(['sit', 'kneel'])
    expect(EMOTES.sit.eye).toBeLessThan(EMOTES.kneel.eye)
  })
})

describe('holds', () => {
  it('holds a timed emote for its seconds, standing still', () => {
    const wave = { id: 'wave' as const, since: 10 }
    expect(holds(wave, 10 + EMOTES.wave.seconds - 0.01, still)).toBe(true)
    expect(holds(wave, 10 + EMOTES.wave.seconds, still)).toBe(false)
  })

  it('holds sitting, kneeling and dancing until the raider moves', () => {
    for (const id of ['sit', 'kneel', 'dance'] as const) {
      expect(holds({ id, since: 0 }, 3600, still)).toBe(true)
    }
  })

  it('ends on moving, crouching or boarding, and never holds nothing', () => {
    const sit = { id: 'sit' as const, since: 0 }
    expect(holds(sit, 1, { ...still, speed: STILL_SPEED + 0.01 })).toBe(false)
    expect(holds(sit, 1, { ...still, speed: STILL_SPEED })).toBe(true)
    expect(holds(sit, 1, { ...still, crouching: true })).toBe(false)
    expect(holds(sit, 1, { ...still, aboard: true })).toBe(false)
    expect(holds(null, 1, still)).toBe(false)
  })
})

describe('seenEmote', () => {
  it('tells of an emote as it begins, near enough to see', () => {
    expect(seenEmote('stand', 'wave', 10, 40)).toBe('wave')
    expect(seenEmote(null, 'sit', 10, 40)).toBe('sit')
    expect(seenEmote('wave', 'dance', 10, 40)).toBe('dance')
  })

  it('says nothing while it holds, too far off, or for a plain pose', () => {
    expect(seenEmote('wave', 'wave', 10, 40)).toBeNull()
    expect(seenEmote('stand', 'wave', 41, 40)).toBeNull()
    expect(seenEmote('stand', 'walk', 1, 40)).toBeNull()
    expect(seenEmote('wave', 'stand', 1, 40)).toBeNull()
  })
})
