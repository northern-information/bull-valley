import { describe, expect, it } from 'vitest'
import {
  actionOf,
  CHAT,
  hotbarSlot,
  isHeld,
  MOVE,
  moveAxis,
  PACK,
  PACK_IN_MENU,
  WORLD,
} from '../../src/bindings.ts'
import { copy } from '../../src/copy.ts'
import type { Binding } from '../../src/bindings.ts'

const tables: [string, Record<string, Binding>][] = [
  ['WORLD', WORLD],
  ['PACK', PACK],
  ['CHAT', CHAT],
]

describe.each(tables)('%s', (_name, table) => {
  it('shows a key and a label for every binding', () => {
    for (const { key, labelKey } of Object.values(table)) {
      expect(key).not.toBe('')
      expect(copy(labelKey)).not.toBe('')
    }
  })

  it('binds each code to one action', () => {
    const seen = new Map<string, string>()
    for (const [action, { codes }] of Object.entries(table)) {
      for (const code of codes) {
        expect(seen.get(code), `${code} bound twice`).toBeUndefined()
        seen.set(code, action)
      }
    }
  })

  it('finds the action behind each code', () => {
    for (const [action, { codes }] of Object.entries(table)) {
      for (const code of codes) expect(actionOf(table, code)).toBe(action)
    }
  })

  it('binds nothing to a key the game does not use', () => {
    expect(actionOf(table, 'KeyZ')).toBeNull()
    expect(actionOf(table, 'F5')).toBeNull()
  })
})

describe('WORLD', () => {
  it('leaves the mouse and Esc to the browser', () => {
    expect(WORLD.look.codes).toEqual([])
    expect(WORLD.flashlight.codes).toEqual([])
    expect(WORLD.pause.codes).toEqual([])
  })

  it('moves on the four MOVE keys', () => {
    expect([...WORLD.move.codes].sort()).toEqual(Object.values(MOVE).sort())
  })

  it('fires the hotbar on the same keys the pack assigns with', () => {
    expect(PACK.assign.codes).toEqual(WORLD.hotbar.codes)
  })
})

describe('PACK', () => {
  it('assigns on 1 through 9', () => {
    for (let n = 1; n <= 9; n++) {
      expect(actionOf(PACK, `Digit${n}`)).toBe('assign')
    }
    expect(actionOf(PACK, 'Digit0')).toBeNull()
  })

  it('uses on E or Enter and closes on Tab or Esc', () => {
    expect(actionOf(PACK, 'KeyE')).toBe('use')
    expect(actionOf(PACK, 'Enter')).toBe('use')
    expect(actionOf(PACK, 'Tab')).toBe('close')
    expect(actionOf(PACK, 'Escape')).toBe('close')
  })

  it('drops on X, and Shift+X is only its label', () => {
    expect(actionOf(PACK, 'KeyX')).toBe('drop')
    expect(actionOf(WORLD, 'KeyX')).toBeNull()
    expect(PACK.dropAll.codes).toEqual([])
    expect(PACK_IN_MENU).toEqual([PACK.drop, PACK.dropAll])
  })
})

describe('isHeld', () => {
  it('is true when any of the binding keys is down', () => {
    expect(isHeld(new Set(['ShiftRight']), WORLD.sprint)).toBe(true)
    expect(isHeld(new Set(['ShiftLeft', 'KeyW']), WORLD.sprint)).toBe(true)
    expect(isHeld(new Set(['KeyW']), WORLD.sprint)).toBe(false)
    expect(isHeld(new Set(), WORLD.crouch)).toBe(false)
  })
})

describe('moveAxis', () => {
  it('is still with nothing held', () => {
    expect(moveAxis(new Set())).toEqual({ x: 0, z: 0 })
  })

  it('reads each direction', () => {
    expect(moveAxis(new Set([MOVE.forward]))).toEqual({ x: 0, z: 1 })
    expect(moveAxis(new Set([MOVE.back]))).toEqual({ x: 0, z: -1 })
    expect(moveAxis(new Set([MOVE.right]))).toEqual({ x: 1, z: 0 })
    expect(moveAxis(new Set([MOVE.left]))).toEqual({ x: -1, z: 0 })
  })

  it('cancels opposite keys and combines a diagonal', () => {
    expect(moveAxis(new Set([MOVE.forward, MOVE.back]))).toEqual({
      x: 0,
      z: 0,
    })
    expect(moveAxis(new Set([MOVE.forward, MOVE.right, 'KeyQ']))).toEqual({
      x: 1,
      z: 1,
    })
  })
})

describe('hotbarSlot', () => {
  it('maps 1 through 9 to slots 0 through 8', () => {
    expect(hotbarSlot('Digit1')).toBe(0)
    expect(hotbarSlot('Digit9')).toBe(8)
  })

  it('is null for any other key', () => {
    expect(hotbarSlot('Digit0')).toBeNull()
    expect(hotbarSlot('KeyE')).toBeNull()
  })
})
