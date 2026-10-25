import { describe, expect, it } from 'vitest'
import { CONFIG } from '../../src/config.ts'
import { footstepCues, stepTuning, TREAD_SOUNDS } from '../../src/footsteps.ts'
import { SFX } from '../../src/sfx.ts'
import type { Stride, Walker } from '../../src/footsteps.ts'

const tuning = stepTuning()
const me = { x: 0, z: 0 }
const grass = () => 'grass' as const
const walker = (x: number, over: Partial<Walker> = {}): Walker => ({
  id: 'a',
  x,
  z: 0,
  feet: 2,
  walking: true,
  quiet: false,
  ...over,
})

// Walk `a` along x in small moves from 0 to `to`, counting its steps.
function walk(to: number, over: Partial<Walker> = {}, by = 0.1) {
  let strides: ReadonlyMap<string, Stride> = new Map()
  const steps: number[] = []
  for (let x = 0; x <= to + 1e-9; x += by) {
    const heard = footstepCues(strides, [walker(x, over)], grass, me, tuning)
    strides = heard.strides
    if (heard.cues.length) steps.push(x)
  }
  return steps
}

describe('footsteps', () => {
  it('names a placed sound for every tread', () => {
    for (const id of Object.values(TREAD_SOUNDS)) {
      expect(SFX[id].positional).toBe(true)
    }
  })

  it('strides half of the head bob', () => {
    expect(tuning.stride).toBeCloseTo(Math.PI / CONFIG.player.bobRate)
  })

  it('steps once a stride, the first half a stride in', () => {
    const steps = walk(tuning.stride * 3.6)
    expect(steps).toHaveLength(4)
    expect(steps[0]).toBeCloseTo(tuning.stride / 2, 0)
    expect(steps[1] - steps[0]).toBeCloseTo(tuning.stride, 0)
  })

  it('takes no step riding or emoting, and keeps the stride', () => {
    expect(walk(10, { walking: false })).toEqual([])
  })

  it('takes no step for a leap, and starts the stride over', () => {
    const at = new Map([['a', { x: 0, z: 0, walked: tuning.stride - 0.01 }]])
    const heard = footstepCues(at, [walker(50)], grass, me, tuning)
    expect(heard.cues).toEqual([])
    expect(heard.strides.get('a')?.walked).toBeCloseTo(tuning.stride / 2)
  })

  it('sounds the tread at the feet, a crouch quietly', () => {
    const at = new Map([['a', { x: 0, z: 0, walked: tuning.stride - 0.05 }]])
    const heard = footstepCues(
      at,
      [walker(0.1, { quiet: true })],
      (_x, _z, feet) => (feet > 1 ? 'metal' : 'grass'),
      me,
      tuning
    )
    expect(heard.cues).toEqual([
      {
        id: 'step-metal',
        x: 0.1,
        y: 2 + tuning.rise,
        z: 0,
        rate: 1,
        gain: tuning.quietGain,
      },
    ])
  })

  it('comes down from a jump with a step, and starts the stride over', () => {
    const at = new Map([['a', { x: 0, z: 0, walked: 0.2 }]])
    const heard = footstepCues(
      at,
      [walker(0.05, { landed: true })],
      grass,
      me,
      tuning
    )
    expect(heard.cues.map((c) => c.rate)).toEqual([tuning.landRate])
    expect(heard.strides.get('a')?.walked).toBe(0)
  })

  it('is not heard far off, and forgets a walker gone', () => {
    const at = new Map([
      ['a', { x: 500, z: 0, walked: tuning.stride - 0.01 }],
      ['b', { x: 0, z: 0, walked: 0 }],
    ])
    const heard = footstepCues(at, [walker(500.1)], grass, me, tuning)
    expect(heard.cues).toEqual([])
    expect([...heard.strides.keys()]).toEqual(['a'])
  })
})
