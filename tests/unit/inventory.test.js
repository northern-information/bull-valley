import { describe, expect, it } from 'vitest'
import {
  STARTING_INVENTORY,
  addItem,
  loadInventory,
  saveInventory,
  useItem,
} from '../../src/inventory.js'

describe('inventory', () => {
  it('adds and uses items without going negative', () => {
    let inv = { cigarettes: 1, joints: 0 }
    inv = addItem(inv, 'joints', 2)
    expect(inv).toEqual({ cigarettes: 1, joints: 2 })
    const used = useItem(inv, 'cigarettes')
    expect(used.used).toBe(true)
    expect(used.inv.cigarettes).toBe(0)
    const empty = useItem(used.inv, 'cigarettes')
    expect(empty.used).toBe(false)
    expect(empty.inv.cigarettes).toBe(0)
  })

  it('round-trips through a storage stub and survives junk', () => {
    const store = new Map()
    const storage = {
      getItem: (k) => (store.has(k) ? store.get(k) : null),
      setItem: (k, value) => store.set(k, value),
    }
    expect(loadInventory(storage)).toEqual(STARTING_INVENTORY)
    saveInventory(storage, { cigarettes: 7, joints: 3 })
    expect(loadInventory(storage)).toEqual({ cigarettes: 7, joints: 3 })
    for (const [k] of store) store.set(k, '{not json')
    expect(loadInventory(storage)).toEqual(STARTING_INVENTORY)
  })
})
