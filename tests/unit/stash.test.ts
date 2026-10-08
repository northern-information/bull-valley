import { describe, expect, it } from 'vitest'
import { CONFIG } from '../../src/config.ts'
import { atLocker, move, moveAmount } from '../../src/stash.ts'

describe('the locker', () => {
  const havens = [
    { x: 0, z: 0 },
    { x: 500, z: 500 },
  ]

  it('opens only at a Citgo', () => {
    const reach = CONFIG.stash.stationReach
    expect(atLocker({ x: -17, z: 3 }, havens)).toBe(true)
    expect(atLocker({ x: 500, z: 500 - reach }, havens)).toBe(true)
    expect(atLocker({ x: reach + 0.5, z: 0 }, havens)).toBe(false)
    expect(atLocker(null, havens)).toBe(false)
    expect(atLocker({ x: 0, z: 0 }, [])).toBe(false)
  })

  it('moves one at a time, the open container, or the whole stack', () => {
    expect(moveAmount('joints', 3, false)).toBe(1)
    expect(moveAmount('joints', 3, true)).toBe(3)
    expect(moveAmount('joints', 0, true)).toBe(0)
    // A pack of cigarettes goes in as the open pack.
    expect(moveAmount('marlboro', 30, false)).toBe(10)
  })

  it('moves units from one side to the other, only what the side holds', () => {
    expect(move({ joints: 3 }, { berries: 1 }, 'joints', 2)).toEqual({
      from: { joints: 1 },
      to: { berries: 1, joints: 2 },
    })
    expect(move({ joints: 3 }, {}, 'joints', 4)).toBeNull()
    expect(move({ joints: 3 }, {}, 'joints', 0)).toBeNull()
    expect(move({}, {}, 'joints', 1)).toBeNull()
  })
})
