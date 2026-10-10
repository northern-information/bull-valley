// Pure: keys and the locks they open. A key is a key item (items.ts, the
// 'key-item' category) and is never used up: a lock lets through whoever
// carries its key, and anyone already behind it, so no one is ever shut
// in. Each lock is a gate on the walls (walls.ts addGate) that the client
// opens for its own raider alone; the key itself is the account's, in its
// pack, kept by the valley (sharedworld.ts rule 10), so it goes where the
// pack goes, a strike included.

import type { Inventory } from './interfaces.ts'
import type { ItemId } from './items.ts'

export type LockId = 'vault-back-room'

export interface Lock {
  // The item that opens it.
  key: ItemId
}

export const LOCKS: Readonly<Record<LockId, Lock>> = {
  // The room behind the Video Vault in Bull Valley Plaza (stripmall.ts).
  'vault-back-room': { key: 'vault-key' },
}

export function isLock(id: string): id is LockId {
  return Object.hasOwn(LOCKS, id)
}

// Whether the pack holds the key to `lock`.
export function holdsKey(lock: LockId, pack: Inventory): boolean {
  return (pack[LOCKS[lock].key] ?? 0) > 0
}

// Whether `lock` lets a raider through: they carry its key, or they are
// already behind it.
export function passes(
  lock: LockId,
  pack: Inventory,
  inside: boolean
): boolean {
  return inside || holdsKey(lock, pack)
}
