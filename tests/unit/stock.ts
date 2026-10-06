import type { ShopStock } from '../../src/interfaces.ts'

// How many units of `kind` are still on the shelf.
export function unitsLeft(shelf: ShopStock | undefined, kind: string): number {
  return shelf?.[kind]?.filter(Boolean).length ?? 0
}
