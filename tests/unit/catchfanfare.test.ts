import { describe, expect, it } from 'vitest'
import { FANFARE, fanfareOf, hoistPose } from '../../src/catchfanfare.ts'
import { copy } from '../../src/copy.ts'
import { skillText } from '../../src/fishing.ts'
import { itemLabel } from '../../src/itemcopy.ts'

describe('a fish landed made a big deal of', () => {
  it('cheers any fish, in Citgo red', () => {
    expect(
      fanfareOf({ outcome: 'landed', kind: 'bluegill', skill: 10 })
    ).toEqual({
      kind: 'bluegill',
      tier: 'fish',
      kicker: copy('fishing.fanfare_fish'),
      headline: itemLabel('bluegill'),
      gold: false,
    })
  })

  it('burns gold for a big one, and says the skill when it rose', () => {
    const f = fanfareOf({
      outcome: 'landed',
      kind: 'channel-catfish',
      skill: 412,
      up: true,
    })
    expect(f?.tier).toBe('big')
    expect(f?.gold).toBe(true)
    expect(f?.kicker).toBe(copy('fishing.fanfare_big'))
    expect(f?.detail).toBe(
      copy('fishing.fanfare_skill', { skill: skillText(412) })
    )
  })

  it('makes the most of the legend', () => {
    const f = fanfareOf({ outcome: 'landed', kind: 'ghost-catfish', skill: 0 })
    expect(f?.tier).toBe('legend')
    expect(f?.kicker).toBe(copy('fishing.fanfare_legend'))
    expect(f?.detail).toBe(copy('fishing.fanfare_legend_detail'))
    expect(FANFARE.sparks.legend).toBeGreaterThan(FANFARE.sparks.big)
    expect(FANFARE.sparks.big).toBeGreaterThan(FANFARE.sparks.fish)
  })

  it('lets junk and a lost fish come in quietly', () => {
    expect(
      fanfareOf({ outcome: 'landed', kind: 'empty-can', skill: 0 })
    ).toBeNull()
    expect(fanfareOf({ outcome: 'landed', skill: 0 })).toBeNull()
    expect(fanfareOf({ outcome: 'landed', kind: 'nope', skill: 0 })).toBeNull()
    expect(
      fanfareOf({ outcome: 'snap', kind: 'bluegill', skill: 0 })
    ).toBeNull()
    expect(fanfareOf({ outcome: 'skill', skill: 0 })).toBeNull()
    expect(fanfareOf({ outcome: 'gave-up', skill: 0 })).toBeNull()
  })
})

describe('the fish hoisted out of the water', () => {
  it('comes up out of the water, hangs, then goes into the pack', () => {
    expect(hoistPose(-0.1)).toBeNull()
    expect(hoistPose(0)?.rise).toBe(0)
    const half = hoistPose(FANFARE.rise / 2)
    expect(half?.rise).toBeGreaterThan(0.5)
    expect(half?.rise).toBeLessThan(1)
    expect(hoistPose(FANFARE.rise)?.rise).toBe(1)
    expect(hoistPose(FANFARE.rise + 0.5)?.scale).toBe(1)
    const going = hoistPose(FANFARE.seconds - FANFARE.fade / 2)
    expect(going?.scale).toBeCloseTo(0.5)
    expect(hoistPose(FANFARE.seconds)).toBeNull()
  })

  it('thrashes and turns on the line', () => {
    const quarter = 1 / (FANFARE.thrashHz * 4)
    expect(Math.abs(hoistPose(quarter)?.thrash ?? 0)).toBeGreaterThan(0.3)
    expect(hoistPose(1)?.turn).toBeCloseTo(FANFARE.spin)
  })
})
