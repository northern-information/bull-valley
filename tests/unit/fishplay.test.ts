import { describe, expect, it } from 'vitest'
import { copy } from '../../src/copy.ts'
import { fightOf, quickestMs } from '../../src/fishing.ts'
import { FishPlay } from '../../src/fishplay.ts'
import type { LineOut } from '../../src/fishing.ts'
import type { FishSound } from '../../src/fishplay.ts'

const fight = fightOf('bluegill', 0)
const hooked = (bitesAt = 1000): LineOut => ({
  hook: { call: 'small', feeling: null, epic: false, fight, seed: 7 },
  bitesAt,
})

// A player and what it said: every reel, every empty line, every sound.
function player() {
  const reels: boolean[] = []
  const empties: string[] = []
  const sounds: FishSound[] = []
  const play = new FishPlay({
    reel: (landed) => reels.push(landed),
    empty: (said) => empties.push(said),
    sound: (id) => sounds.push(id),
  })
  return { play, reels, empties, sounds }
}

describe('playing the line', () => {
  it('has no line, then waits on the bite', () => {
    const { play } = player()
    play.step(null, 0)
    expect(play.phase(0)).toBe('none')
    expect(play.state).toBeNull()
    expect(play.arrow).toBeNull()
    const line = hooked()
    play.step(line, 500)
    expect(play.phase(500)).toBe('waiting')
    expect(play.state).toBeNull()
  })

  it('comes up empty when nothing bit, once', () => {
    const { play, empties, reels } = player()
    const line: LineOut = { hook: null, bitesAt: 100 }
    play.step(line, 0)
    play.step(line, 200)
    play.step(line, 300)
    expect(empties).toEqual([copy('fishing.nothing')])
    expect(reels).toEqual([])
    expect(play.phase(300)).toBe('done')
    // Nothing on it to give up.
    play.giveUp()
    expect(reels).toEqual([])
  })

  it('fights from the bite, answers its arrows, and reels a spent fish in once', () => {
    const { play, reels } = player()
    const line = hooked()
    let now = 0
    play.step(line, now)
    // A key before the bite does nothing.
    play.press('left')
    while (play.phase(now) !== 'spent') {
      now += 20
      play.step(line, now)
      const arrow = play.arrow
      if (arrow) play.press(arrow.dir)
      expect(play.phase(now)).not.toBe('done')
    }
    expect(now - line.bitesAt).toBeGreaterThanOrEqual(quickestMs(fight))
    expect(play.state?.stamina).toBe(0)
    expect(play.arrow).toBeNull()
    play.reelIn()
    play.reelIn()
    expect(reels).toEqual([true])
    expect(play.phase(now)).toBe('done')
  })

  it('sounds the bite once, a crank for each answer, and the reel in', () => {
    const { play, sounds } = player()
    const line = hooked()
    let now = 0
    play.step(line, now)
    let presses = 0
    while (play.phase(now) !== 'spent') {
      now += 20
      play.step(line, now)
      const arrow = play.arrow
      if (arrow) {
        play.press(arrow.dir)
        presses++
      }
    }
    play.reelIn()
    expect(sounds).toEqual([
      'fish-bite',
      ...Array<FishSound>(presses).fill('reel-click'),
      'reel-in',
    ])
  })

  it('sounds nothing for an empty line, and the snap when time runs out', () => {
    const empty = player()
    const nothing: LineOut = { hook: null, bitesAt: 100 }
    empty.play.step(nothing, 0)
    empty.play.step(nothing, 200)
    expect(empty.sounds).toEqual([])
    const { play, sounds } = player()
    const line = hooked(0)
    let now = 0
    play.step(line, now)
    while (play.phase(now) !== 'done') play.step(line, (now += 200))
    expect(sounds).toEqual(['fish-bite', 'line-snap'])
  })

  it('never reels in a fish not yet spent, and lets one go on giving up', () => {
    const { play, reels } = player()
    const line = hooked(0)
    play.step(line, 0)
    play.step(line, 100)
    expect(play.phase(100)).toBe('fight')
    play.reelIn()
    expect(reels).toEqual([])
    play.giveUp()
    play.giveUp()
    expect(reels).toEqual([false])
  })

  it('loses the fish when the clock runs out, a long gap a step at a time', () => {
    const { play, reels } = player()
    const line = hooked(0)
    play.step(line, 0)
    let now = 0
    // A tab left in the background: each step goes no further than a
    // quarter second, so it takes many to run out the clock.
    for (let i = 0; i < 4; i++) play.step(line, (now += 60_000))
    expect(reels).toEqual([])
    while (reels.length === 0) play.step(line, (now += 60_000))
    expect(reels).toEqual([false])
  })

  it('starts afresh with a new line', () => {
    const { play, reels } = player()
    const first = hooked(0)
    play.step(first, 10)
    play.giveUp()
    const second = hooked(20)
    play.step(second, 30)
    expect(play.phase(30)).toBe('fight')
    play.giveUp()
    expect(reels).toEqual([false, false])
  })
})
