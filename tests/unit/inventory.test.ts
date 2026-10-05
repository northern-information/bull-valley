import { describe, expect, it } from 'vitest'
import {
  addItem,
  KINDS,
  STARTING_INVENTORY,
  toInventory,
  useItem,
} from '../../src/inventory.ts'
import type { Inventory } from '../../src/interfaces.ts'

describe('inventory', () => {
  it('adds and uses items without going negative', () => {
    let inv: Inventory = { ...STARTING_INVENTORY, marlboro: 1, joints: 0 }
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

  it('fills missing kinds, clamps bad counts, and drops strangers', () => {
    // Junk on purpose: what a garbled frame or a stale row could hold.
    const inv = toInventory({ camel: -3, parliament: 'x', joints: 2.9, x: 4 })
    expect(inv.camel).toBe(0)
    expect(inv.parliament).toBe(0)
    expect(inv.joints).toBe(2)
    expect(inv.djarum).toBe(0)
    expect(inv).not.toHaveProperty('x')
    expect(toInventory(null)).toEqual(toInventory({}))
  })
})
