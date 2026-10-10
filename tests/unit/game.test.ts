import { describe, expect, it } from 'vitest'
import { createGameState, freshPending } from '../../src/game.ts'
import { EMPTY_HOTBAR } from '../../src/hotbar.ts'

describe('freshPending', () => {
  it('has nothing asked, and shares nothing with the last one', () => {
    const before = freshPending()
    before.board = true
    before.takes.add(3)
    before.buys.add('0:beer')
    before.drops.add(1)
    before.loots.add(2)
    before.book.add('citgo')
    before.ask = { op: 'friend', name: 'dave' }
    before.showFriends = true
    before.whisperTo = 'dave'
    before.trade = true
    before.collect = true
    before.stand = true
    const fresh = freshPending()
    expect(fresh).toEqual({
      board: false,
      takes: new Set(),
      buys: new Set(),
      collect: false,
      drops: new Set(),
      trade: false,
      loots: new Set(),
      book: new Set(),
      ask: null,
      showFriends: false,
      whisperTo: null,
      stand: false,
    })
    expect(fresh.takes).not.toBe(before.takes)
    expect(before.takes.has(3)).toBe(true)
  })

  it('is what a game starts with', () => {
    expect(createGameState(1, EMPTY_HOTBAR).pending).toEqual(freshPending())
  })
})
