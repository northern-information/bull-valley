// What each Book of Shadows page shows turning (book.ts entries): the same
// builders the valley is placed from, so a page looks like what was met.
// The items are their pickups, as the pack shows them; everything else is
// built here. bookhud.ts asks for one page at a time, and itemthumbs.ts
// spins it.

import * as THREE from 'three'
import { buildPickup, setMotion, WORLD_ASSETS } from './assets.ts'
import { CONFIG } from './config.ts'
import {
  applyPose,
  attachBook,
  attachCigarette,
  buildFigure,
  buildGron,
  buildMoab,
  buildTyler,
} from './figure.ts'
import { itemById } from './items.ts'
import { buildJericho } from './jerichomodel.ts'
import { samplePose } from './poses.ts'
import { buildShadowman } from './shadowmanmodel.ts'
import { buildTruckMesh } from './truck.ts'
import type { BookEntry } from './book.ts'
import type { OutfitId } from './outfits.ts'

function worldAsset(id: string): () => THREE.Object3D {
  return () => {
    const asset = WORLD_ASSETS.find((one) => one.id === id)
    return asset ? asset.build() : new THREE.Group()
  }
}

function standing(outfit: OutfitId): THREE.Object3D {
  const figure = buildFigure(outfit)
  applyPose(figure, samplePose('stand'))
  return figure.group
}

// Marx as he waits at the tailgate: reading, smoking.
function marx(): THREE.Object3D {
  const figure = buildFigure('marx')
  applyPose(figure, samplePose('read'))
  attachBook(figure)
  const cigarette = attachCigarette(figure)
  setMotion(figure.group, (t) => cigarette.update(t))
  return figure.group
}

function shadowman(): THREE.Object3D {
  const rig = buildShadowman(CONFIG.shadowmen.chestHeight * 2, 0xb00c)
  rig.update({ dt: 0, speed: 0, burn: 0, perception: false })
  let last = 0
  setMotion(rig.group, (t) => {
    rig.update({
      dt: Math.min(0.1, Math.max(0, t - last)),
      speed: 0,
      burn: 0,
      perception: false,
    })
    last = t
  })
  return rig.group
}

const PORTRAITS: Partial<Record<string, () => THREE.Object3D>> = {
  // The station whole runs to its lot's edges; a pump reads as the Citgo.
  citgo: worldAsset('pump'),
  'cabbage-stand': worldAsset('cabbage-stand'),
  dishes: worldAsset('dish'),
  wreck: worldAsset('wreck'),
  'strip-mall': worldAsset('plaza-sign'),
  undercroft: worldAsset('trapdoor'),
  industrial: worldAsset('park-sign'),
  'tunnel-shade': worldAsset('tunnel-shade'),
  warden: worldAsset('warden'),
  'donut-field': buildTruckMesh,
  'corn-maze': worldAsset('corn-maze-sign'),
  'maze-heart': worldAsset('portal'),
  'drive-in': worldAsset('drive-in-screen'),
  keep: worldAsset('beacon-keep'),
  castle: worldAsset('castle-entropy'),
  shadowman,
  spider: worldAsset('shadow-spider'),
  spiderling: worldAsset('spiderling'),
  caretaker: worldAsset('caretaker'),
  marx,
  carlsten: () => standing('carlsten'),
  gron: () => buildGron().group,
  moab: () => buildMoab().group,
  squatter: () => standing('squatter'),
  tyler: () => buildTyler().group,
  jericho: () => buildJericho(() => 0, false).group,
}

// The model for an entry's page, and the item it is when it is one (for
// the item's own fit).
export function portraitOf(entry: BookEntry): {
  build: () => THREE.Object3D
  fitAs?: string
} {
  if (entry.chapter === 'items' && itemById(entry.id)) {
    return {
      build: () => buildPickup(entry.id, 0x5ac, { glow: false }),
      fitAs: entry.id,
    }
  }
  return { build: PORTRAITS[entry.id] ?? (() => new THREE.Group()) }
}
