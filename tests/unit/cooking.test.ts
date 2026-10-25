import { describe, expect, it } from 'vitest'
import { CONFIG } from '../../src/config.ts'
import { atCampfire, campfireOf, COOKED, cookedOf } from '../../src/cooking.ts'
import { FISH } from '../../src/fishing.ts'
import { healsOf, isFish } from '../../src/items.ts'

describe('cooking', () => {
  it('cooks a small fish into a panfish and a large one into a fillet', () => {
    expect(cookedOf('bluegill')).toBe('fried-panfish')
    expect(cookedOf('bullhead')).toBe('fried-panfish')
    expect(cookedOf('largemouth-bass')).toBe('grilled-fillet')
    expect(cookedOf('ghost-catfish')).toBe('grilled-fillet')
    expect(cookedOf('shadow-carp')).toBe('grilled-fillet')
    // Every fish the pond gives up cooks; the junk and anything else does
    // not.
    for (const fish of FISH) {
      expect(cookedOf(fish.kind) !== null, fish.kind).toBe(isFish(fish.kind))
    }
    expect(cookedOf('empty-can')).toBeNull()
    expect(cookedOf('fried-panfish')).toBeNull()
    expect(cookedOf('cabbage')).toBeNull()
  })

  it('gives far more back cooked than raw', () => {
    for (const fish of FISH.filter((f) => isFish(f.kind))) {
      expect(healsOf(COOKED[fish.size], 1000)).toBeGreaterThan(
        healsOf(fish.kind, 1000) * 3
      )
    }
  })

  it('burns back from the landing, away from the water, and to its side', () => {
    const { back, aside } = CONFIG.fishing.campfire
    // The water to the north of the landing: back is south, aside east.
    const pond = { x: 0, z: -50, landing: { x: 0, z: 0 } }
    const fire = campfireOf(pond)
    expect(fire.z).toBeCloseTo(back)
    expect(Math.abs(fire.x)).toBeCloseTo(aside)
    // Never on the landing itself, so the table and the fire stand apart.
    expect(Math.hypot(fire.x, fire.z)).toBeCloseTo(Math.hypot(back, aside))
  })

  it('cooks only beside a campfire, any pond’s', () => {
    const ponds = [
      { x: 0, z: -50, landing: { x: 0, z: 0 } },
      { x: 500, z: -50, landing: { x: 500, z: 0 } },
    ]
    const reach = CONFIG.fishing.campfire.tendReach
    const second = campfireOf(ponds[1])
    expect(atCampfire(campfireOf(ponds[0]), ponds)).toBe(true)
    expect(atCampfire({ x: second.x + reach, z: second.z }, ponds)).toBe(true)
    expect(atCampfire({ x: second.x + reach + 0.1, z: second.z }, ponds)).toBe(
      false
    )
    expect(atCampfire(null, ponds)).toBe(false)
    expect(atCampfire({ x: 0, z: 0 }, [])).toBe(false)
  })
})
