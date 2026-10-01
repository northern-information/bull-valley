import { describe, expect, it } from 'vitest'
import {
  addItem,
  KINDS,
  loadInventory,
  saveInventory,
  STARTING_INVENTORY,
  useItem,
} from '../../src/inventory.js'

function stubStorage() {
  const store = new Map()
  return {
    store,
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, value) => store.set(k, value),
  }
}

describe('inventory', () => {
  it('adds and uses items without going negative', () => {
    let inv = { ...STARTING_INVENTORY, marlboro: 1, joints: 0 }
    inv = addItem(inv, 'joints', 2)
    expect(inv.joints).toBe(2)
    const used = useItem(inv, 'marlboro')
    expect(used.used).toBe(true)
    expect(used.inv.marlboro).toBe(0)
    const empty = useItem(used.inv, 'marlboro')
    expect(empty.used).toBe(false)
    expect(empty.inv.marlboro).toBe(0)
  })

  it('starts with every kind present', () => {
    expect(Object.keys(STARTING_INVENTORY).sort()).toEqual([...KINDS].sort())
    expect(STARTING_INVENTORY).toMatchObject({ marlboro: 2, joints: 1 })
  })

  it('round-trips through a storage stub and survives junk', () => {
    const storage = stubStorage()
    expect(loadInventory(storage)).toEqual(STARTING_INVENTORY)
    const inv = { ...STARTING_INVENTORY, djarum: 4, newport: 1, joints: 3 }
    saveInventory(storage, inv)
    expect(loadInventory(storage)).toEqual(inv)
    for (const [k] of storage.store) storage.store.set(k, '{not json')
    expect(loadInventory(storage)).toEqual(STARTING_INVENTORY)
    for (const [k] of storage.store) storage.store.set(k, 'null')
    expect(loadInventory(storage)).toEqual(STARTING_INVENTORY)
  })

  it('fills missing kinds and clamps bad counts', () => {
    const storage = stubStorage()
    saveInventory(storage, { camel: -3, parliament: 'x', joints: 2.9 })
    const inv = loadInventory(storage)
    expect(inv.camel).toBe(0)
    expect(inv.parliament).toBe(0)
    expect(inv.joints).toBe(2)
    expect(inv.djarum).toBe(0)
  })
})
