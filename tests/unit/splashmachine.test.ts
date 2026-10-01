import { describe, expect, it } from 'vitest'
import { CONFIG } from '../../src/config.ts'
import {
  createSplashMachine,
  SPLASH_STATES,
  splashAlpha,
} from '../../src/splashmachine.ts'

const cfg = CONFIG.splash

function makeMachine(startAt = 0) {
  let t = startAt
  const machine = createSplashMachine({ now: () => t, cfg })
  return {
    machine,
    setTime: (next: number) => {
      t = next
    },
  }
}

describe('splashAlpha', () => {
  it('is 0 at and before the start', () => {
    expect(splashAlpha(0, cfg)).toBe(0)
    expect(splashAlpha(-50, cfg)).toBe(0)
  })

  it('ramps linearly across the fade-in', () => {
    expect(splashAlpha(1000, cfg)).toBeCloseTo(0.5)
    expect(splashAlpha(2000, cfg)).toBe(1)
  })

  it('holds at 1 through the hold window', () => {
    expect(splashAlpha(2001, cfg)).toBe(1)
    expect(splashAlpha(4399, cfg)).toBe(1)
  })

  it('ramps back to 0 across the fade-out', () => {
    expect(splashAlpha(5200, cfg)).toBeCloseTo(0.5)
    expect(splashAlpha(6000, cfg)).toBe(0)
    expect(splashAlpha(9999, cfg)).toBe(0)
  })
})

describe('splash machine', () => {
  it('starts pre-gesture: opaque backdrop, no logo, no timers latched', () => {
    const { machine } = makeMachine()
    expect(machine.state).toBe(SPLASH_STATES.PRE_GESTURE)
    expect(machine.tick()).toEqual({ imgAlpha: 0, rootAlpha: 1 })
    // Pre-gesture never decays no matter how long it sits.
    expect(machine.tick()).toEqual({ imgAlpha: 0, rootAlpha: 1 })
  })

  it('first gesture starts the run with the backdrop still opaque', () => {
    const { machine } = makeMachine(500)
    expect(machine.gesture()).toBe('start')
    expect(machine.state).toBe(SPLASH_STATES.RUNNING)
    const result = machine.tick()
    expect(result.imgAlpha).toBe(0)
    expect(result.rootAlpha).toBe(1)
  })

  it('holds the backdrop at 1 through the whole logo envelope', () => {
    const { machine, setTime } = makeMachine()
    machine.gesture()
    for (const t of [1000, 2000, 4399, 5200, 5999]) {
      setTime(t)
      expect(machine.tick().rootAlpha).toBe(1)
    }
  })

  it('drives the logo alpha along the triangle wave', () => {
    const { machine, setTime } = makeMachine()
    machine.gesture()
    setTime(1000)
    expect(machine.tick().imgAlpha).toBeCloseTo(0.5)
    setTime(3000)
    expect(machine.tick().imgAlpha).toBe(1)
    setTime(5200)
    expect(machine.tick().imgAlpha).toBeCloseTo(0.5)
  })

  it('fires fadeOutStart exactly once at the hold end', () => {
    const { machine, setTime } = makeMachine()
    machine.gesture()
    setTime(4399)
    expect(machine.tick().fadeOutStart).toBeUndefined()
    setTime(4400)
    expect(machine.tick().fadeOutStart).toBe(true)
    setTime(4401)
    expect(machine.tick().fadeOutStart).toBeUndefined()
  })

  it('lifts the backdrop after the logo resolves, then completes once', () => {
    const { machine, setTime } = makeMachine()
    machine.gesture()
    setTime(6000)
    const atEnd = machine.tick()
    expect(atEnd.imgAlpha).toBe(0)
    expect(atEnd.rootAlpha).toBe(1)
    expect(atEnd.complete).toBeUndefined()
    expect(machine.state).toBe(SPLASH_STATES.FADING_OUT)
    setTime(6000 + cfg.revealFadeMs / 2)
    expect(machine.tick().rootAlpha).toBeCloseTo(0.5)
    setTime(6000 + cfg.revealFadeMs)
    const done = machine.tick()
    expect(done.rootAlpha).toBe(0)
    expect(done.complete).toBe(true)
    expect(machine.state).toBe(SPLASH_STATES.DONE)
    expect(machine.tick().complete).toBeUndefined()
  })

  it('second gesture skips: backdrop tweens out over the skip fade', () => {
    const { machine, setTime } = makeMachine()
    machine.gesture()
    setTime(300) // mid fade-in
    expect(machine.gesture()).toBe('skip')
    expect(machine.state).toBe(SPLASH_STATES.FADING_OUT)
    const first = machine.tick()
    expect(first.imgAlpha).toBe(0)
    expect(first.rootAlpha).toBe(1)
    setTime(400)
    expect(machine.tick().rootAlpha).toBeCloseTo(0.5)
    setTime(500)
    const done = machine.tick()
    expect(done.rootAlpha).toBe(0)
    expect(done.complete).toBe(true)
    expect(machine.state).toBe(SPLASH_STATES.DONE)
  })

  it('skipping suppresses the natural fadeOutStart latch', () => {
    const { machine, setTime } = makeMachine()
    machine.gesture()
    setTime(100)
    machine.gesture()
    setTime(4400)
    expect(machine.tick().fadeOutStart).toBeUndefined()
  })

  it('gestures during the fade-out and after done are no-ops', () => {
    const { machine, setTime } = makeMachine()
    machine.gesture()
    setTime(100)
    machine.gesture()
    expect(machine.gesture()).toBeNull()
    setTime(100 + cfg.skipFadeMs)
    machine.tick()
    expect(machine.gesture()).toBeNull()
    expect(machine.state).toBe(SPLASH_STATES.DONE)
    expect(machine.tick()).toEqual({ imgAlpha: 0, rootAlpha: 0 })
  })
})
