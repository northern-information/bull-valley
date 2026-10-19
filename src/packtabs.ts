// Each tab of the pack as it is named (packgrid.ts says what fills it):
// the 3D valley's pack (packhud.ts) and Bull Valley Dial-Up's (dialpack.ts)
// label them alike, and this module loads nothing of three.js.

import { copy } from './copy.ts'
import type { BagTab } from './packgrid.ts'

// Each pack tab's label, and the line its grid shows when empty.
export const BAG_TABS: Record<BagTab, { label: string; empty: string }> = {
  consumables: {
    label: copy('inventory.tab_consumables'),
    empty: copy('inventory.empty_consumables'),
  },
  loot: {
    label: copy('inventory.tab_loot'),
    empty: copy('inventory.empty_loot'),
  },
  'key-items': {
    label: copy('inventory.tab_key_items'),
    empty: copy('inventory.empty_key_items'),
  },
  materials: {
    label: copy('inventory.tab_materials'),
    empty: copy('inventory.empty_materials'),
  },
  locker: {
    label: copy('inventory.tab_locker'),
    empty: copy('inventory.empty_locker'),
  },
}
