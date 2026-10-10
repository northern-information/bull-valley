import { describe, expect, it } from 'vitest'
import {
  assign,
  clearSlot,
  cooldownOf,
  EMPTY_HOTBAR,
  HOTBAR_SLOTS,
  isHotbar,
  NO_EFFECTS,
  place,
  shownSlots,
  spent,
  toHotbar,
} from '../../src/hotbar.ts'

describe('assign', () => {
  it('puts a kind on a slot', () => {
    const bar = assign(EMPTY_HOTBAR, 2, 'camel')
    expect(bar[2]).toBe('camel')
    expect(bar.filter((kind) => kind !== null)).toHaveLength(1)
  })

  it('moves a kind off the slot it held', () => {
    const bar = assign(assign(EMPTY_HOTBAR, 0, 'camel'), 4, 'camel')
    expect(bar[0]).toBeNull()
    expect(bar[4]).toBe('camel')
  })

  it('replaces what a slot held', () => {
    const bar = assign(assign(EMPTY_HOTBAR, 0, 'camel'), 0, 'joints')
    expect(bar[0]).toBe('joints')
  })

  it('clears a slot assigned the kind it already holds', () => {
    const bar = assign(assign(EMPTY_HOTBAR, 3, 'camel'), 3, 'camel')
    expect(bar).toEqual(EMPTY_HOTBAR)
  })

  it('ignores a slot off the bar', () => {
    expect(assign(EMPTY_HOTBAR, 9, 'camel')).toBe(EMPTY_HOTBAR)
    expect(assign(EMPTY_HOTBAR, -1, 'camel')).toBe(EMPTY_HOTBAR)
  })
})

describe('place', () => {
  it('puts a kind on a slot, moving it off any other', () => {
    const bar = place(assign(EMPTY_HOTBAR, 0, 'camel'), 4, 'camel')
    expect(bar[0]).toBeNull()
    expect(bar[4]).toBe('camel')
  })

  it('leaves a kind on the slot that already holds it', () => {
    const bar = assign(EMPTY_HOTBAR, 3, 'camel')
    expect(place(bar, 3, 'camel')).toBe(bar)
  })
})

describe('spent', () => {
  it('takes a kind off the bar once the pack holds none', () => {
    const bar = assign(assign(EMPTY_HOTBAR, 1, 'camel'), 4, 'joints')
    const after = spent(bar, 'camel', { camel: 0, joints: 2 })
    expect(after[1]).toBeNull()
    expect(after[4]).toBe('joints')
    expect(spent(bar, 'joints', {})[4]).toBeNull()
  })

  it('leaves the bar while any is left, or the kind is not on it', () => {
    const bar = assign(EMPTY_HOTBAR, 1, 'camel')
    expect(spent(bar, 'camel', { camel: 1 })).toBe(bar)
    expect(spent(bar, 'joints', {})).toBe(bar)
  })
})

describe('clearSlot', () => {
  it('empties a slot, whatever it held', () => {
    const bar = assign(assign(EMPTY_HOTBAR, 1, 'camel'), 4, 'joints')
    const cleared = clearSlot(bar, 1)
    expect(cleared[1]).toBeNull()
    expect(cleared[4]).toBe('joints')
  })

  it('leaves the bar as it was for an empty slot or one off the bar', () => {
    const bar = assign(EMPTY_HOTBAR, 0, 'camel')
    expect(clearSlot(bar, 2)).toBe(bar)
    expect(clearSlot(bar, 9)).toBe(bar)
    expect(clearSlot(bar, -1)).toBe(bar)
  })
})

describe('shownSlots', () => {
  it('lists the assigned slots in number order', () => {
    const bar = assign(assign(EMPTY_HOTBAR, 5, 'joints'), 1, 'camel')
    expect(shownSlots(bar)).toEqual([
      { slot: 1, kind: 'camel' },
      { slot: 5, kind: 'joints' },
    ])
    expect(shownSlots(EMPTY_HOTBAR)).toEqual([])
  })
})

describe('isHotbar', () => {
  it('takes nine slots of known kinds or nothing', () => {
    expect(isHotbar(EMPTY_HOTBAR)).toBe(true)
    expect(isHotbar(assign(EMPTY_HOTBAR, 0, 'cabbage'))).toBe(true)
  })

  it('refuses the wrong length, an unknown kind, or not a list', () => {
    expect(isHotbar([null])).toBe(false)
    expect(isHotbar(Array(HOTBAR_SLOTS + 1).fill(null))).toBe(false)
    expect(isHotbar(assign(EMPTY_HOTBAR, 0, 'anvil'))).toBe(false)
    expect(isHotbar(assign(EMPTY_HOTBAR, 0, 'sack'))).toBe(false)
    expect(isHotbar([1, ...EMPTY_HOTBAR.slice(1)])).toBe(false)
    expect(isHotbar('camel')).toBe(false)
    expect(isHotbar(null)).toBe(false)
  })

  it('falls back to the empty bar', () => {
    expect(toHotbar(null)).toBe(EMPTY_HOTBAR)
    expect(toHotbar([null])).toBe(EMPTY_HOTBAR)
    const bar = assign(EMPTY_HOTBAR, 0, 'camel')
    expect(toHotbar(bar)).toEqual(bar)
  })

  it('clears a slot whose kind the game no longer has, keeping the rest', () => {
    const bar = assign(assign(EMPTY_HOTBAR, 0, 'camel'), 1, 'cabbage')
    const stored = bar.map((kind, i) => (i === 2 ? 'sack' : kind))
    expect(toHotbar(stored)).toEqual(bar)
  })
})

describe('cooldownOf', () => {
  const effects = {
    ...NO_EFFECTS,
    smoking: { start: 10, end: 20 },
    ember: { start: 20, end: 25 },
    perception: { start: 0, end: 30 },
  }

  it('sweeps every cigarette while one burns, then through the ember', () => {
    expect(cooldownOf('camel', effects, 15)).toEqual({
      fraction: 0.5,
      seconds: 5,
      phase: 'smoking',
    })
    expect(cooldownOf('newport', effects, 15)?.phase).toBe('smoking')
    expect(cooldownOf('camel', effects, 22.5)).toEqual({
      fraction: 0.5,
      seconds: 3,
      phase: 'ember',
    })
    expect(cooldownOf('camel', effects, 25)).toBeNull()
  })

  it('sweeps the joint through perception', () => {
    expect(cooldownOf('joints', effects, 15)).toMatchObject({
      phase: 'perception',
      seconds: 15,
    })
    expect(cooldownOf('joints', effects, 30)).toBeNull()
  })

  it('never sweeps an item with no effect', () => {
    expect(cooldownOf('nos', effects, 15)).toBeNull()
    expect(cooldownOf('cabbage', effects, 15)).toBeNull()
  })

  it('is idle with nothing going', () => {
    expect(cooldownOf('camel', NO_EFFECTS, 1)).toBeNull()
  })
})
