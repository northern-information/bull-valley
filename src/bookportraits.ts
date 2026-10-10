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
} from './figure.ts'
import { itemById } from './items.ts'
import { samplePose } from './poses.ts'
import { mulberry32 } from './rng.ts'
import { buildShadowmanFigure, makeSilhouetteTexture } from './shadowcards.ts'
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
  const height = CONFIG.shadowmen.chestHeight * 2
  const figure = buildShadowmanFigure(
    makeSilhouetteTexture(mulberry32(0xb00c)),
    height
  )
  figure.position.y = height / 2
  const group = new THREE.Group()
  group.add(figure)
  // A card, as the valley stands them: kept square to the viewer while the
  // page turns it, so it never shows its edge.
  setMotion(group, () => {
    if (group.parent) group.rotation.y = -group.parent.rotation.y
  })
  return group
}

const PORTRAITS: Partial<Record<string, () => THREE.Object3D>> = {
  // The station whole runs to its lot's edges; a pump reads as the Citgo.
  citgo: worldAsset('pump'),
  'cabbage-stand': worldAsset('cabbage-stand'),
  dishes: worldAsset('dish'),
  wreck: worldAsset('wreck'),
  'strip-mall': worldAsset('plaza-sign'),
  undercroft: worldAsset('trapdoor'),
  'tunnel-shade': worldAsset('tunnel-shade'),
  warden: worldAsset('warden'),
  'donut-field': buildTruckMesh,
  'corn-maze': worldAsset('corn-maze-sign'),
  'maze-heart': worldAsset('portal'),
  keep: worldAsset('beacon-keep'),
  shadowman,
  caretaker: worldAsset('caretaker'),
  marx,
  carlsten: () => standing('carlsten'),
  gron: () => buildGron().group,
  moab: () => buildMoab().group,
  squatter: () => standing('squatter'),
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
