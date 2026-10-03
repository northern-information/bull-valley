import { describe, expect, it } from 'vitest'
import {
  actionOf,
  cycleStep,
  isHeld,
  MOVE,
  moveAxis,
  PACK,
  WORLD,
} from '../../src/bindings.ts'
import type { Binding } from '../../src/bindings.ts'

const tables: [string, Record<string, Binding>][] = [
  ['WORLD', WORLD],
  ['PACK', PACK],
]

describe.each(tables)('%s', (_name, table) => {
  it('shows a key and a label for every binding', () => {
    for (const { key, label } of Object.values(table)) {
      expect(key).not.toBe('')
      expect(label).not.toBe('')
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
    expect(WORLD.pause.codes).toEqual([])
  })

  it('moves on the four MOVE keys', () => {
    expect([...WORLD.move.codes].sort()).toEqual(Object.values(MOVE).sort())
  })

  it('smokes and sparks on the same keys as the pack', () => {
    expect(PACK.smoke).toBe(WORLD.smoke)
    expect(PACK.spark).toBe(WORLD.spark)
  })
})

describe('PACK', () => {
  it('cycles on the arrows and on A and D', () => {
    for (const code of ['ArrowLeft', 'KeyA', 'ArrowRight', 'KeyD']) {
      expect(actionOf(PACK, code)).toBe('cycle')
    }
  })

  it('uses on E or Enter and closes on Tab', () => {
    expect(actionOf(PACK, 'KeyE')).toBe('use')
    expect(actionOf(PACK, 'Enter')).toBe('use')
    expect(actionOf(PACK, 'Tab')).toBe('close')
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

describe('cycleStep', () => {
  it('steps back on the left keys and forward on the right', () => {
    expect(cycleStep('ArrowLeft')).toBe(-1)
    expect(cycleStep('KeyA')).toBe(-1)
    expect(cycleStep('ArrowRight')).toBe(1)
    expect(cycleStep('KeyD')).toBe(1)
  })

  it('is zero for any other key', () => {
    expect(cycleStep('KeyE')).toBe(0)
  })
})
