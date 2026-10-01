import { describe, expect, it } from 'vitest'
import { CONTAINERS, drinkFitHeight } from '../../src/drinks.ts'
import { ITEM_LIST } from '../../src/items.ts'

describe('drinks', () => {
  it('gives every drink item a known container', () => {
    const drinks = ITEM_LIST.filter((item) => item.category === 'drink')
    expect(drinks.length).toBeGreaterThan(0)
    for (const drink of drinks) {
      expect(drink.container).toBeDefined()
      expect(CONTAINERS).toHaveProperty(drink.container ?? '')
    }
  })

  it('fits cans to the tallest can, so a 16 oz can stays full size', () => {
    const tallestCan = CONTAINERS.tall.height
    expect(drinkFitHeight('monster')).toBe(tallestCan)
    expect(drinkFitHeight('red-bull')).toBe(tallestCan)
    expect(drinkFitHeight('pbr')).toBe(tallestCan)
  })

  it('fits bottles to the tallest bottle, apart from the cans', () => {
    const tallestBottle = CONTAINERS.goose.height
    expect(drinkFitHeight('grey-goose')).toBe(tallestBottle)
    expect(drinkFitHeight('high-life')).toBe(tallestBottle)
    expect(tallestBottle).toBeGreaterThan(CONTAINERS.tall.height)
  })

  it('treats an id with no container as a bottle', () => {
    expect(drinkFitHeight('marlboro')).toBe(CONTAINERS.goose.height)
    expect(drinkFitHeight('not-an-item')).toBe(CONTAINERS.goose.height)
  })
})
