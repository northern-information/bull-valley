import * as THREE from 'three'
import {
  assembleParts,
  makeGlowSprite,
  makeGlowTexture,
  setMotion,
} from './assetkit.ts'
import { buildBerryBush } from './berrybush.ts'
import { buildCabbageStand, buildStandDressing } from './cabbagestandmodel.ts'
import { buildCaretaker } from './caretakermodel.ts'
import {
  adSignPart,
  buildLockerDoors,
  buildShelfDisplay,
  FUEL_LAYOUT,
  fuelStationParts,
  pumpParts,
  signId,
  storeParts,
  trashCanParts,
} from './citgo.ts'
import { CONFIG } from './config.ts'
import {
  buildCornMazeSign,
  buildCornWalls,
  buildEnterSign,
  buildPortal,
  cornWallSize,
  flatCornPieces,
} from './cornmazeparts.ts'
import { buildDishArray } from './dishes.ts'
import { buildDrink } from './drinkmodels.ts'
import { buildFireRoots, buildRaincloud } from './fire.ts'
import { ITEMS } from './items.ts'
import { mazeSpans, SHINING_MAZE } from './maze.ts'
import { buildMedicine } from './medicinemodels.ts'
import {
  buildCigarettePack,
  buildDimes,
  buildPickup,
  buildTwenty,
} from './pickups.ts'
import {
  buildAxe,
  buildBat,
  buildBook,
  buildFlamingHalo,
  buildFlashlight,
  buildGuitar,
  buildScroll,
  buildScythe,
  buildTombstone,
  GUITAR_OUTLINE,
} from './props.ts'
import { applyPS1 } from './ps1.ts'
import { mulberry32, range } from './rng.ts'
import {
  buildLandmarkBeacon,
  gravestonePart,
  POLE_ARM_DROP,
  POLE_INSULATOR_X,
  POLE_SAMPLE,
  poleParts,
  reedPart,
  SODIUM_HALO,
  STREETLIGHT,
  streetlightParts,
  TREE_CANOPY_HIGH,
  TREE_CANOPY_LOW,
  TREE_SAMPLE,
  treeParts,
} from './roadsideparts.ts'
import { buildShadowBurst, SHADOW_BURST } from './shadowburstmodel.ts'
import { buildShadowSpider, strikeLoopAt } from './shadowspider.ts'
import { buildSkeletonHorse } from './skeletonhorse.ts'
import { STORE_LAYOUT } from './store.ts'
import { buildWreck } from './wreck.ts'
import type { AkashicAsset, Part } from './assetkit.ts'
import type { Span } from './maze.ts'

// The Akashic page's registry of the world's assets (akashic.ts adds the
// truck, the figures and the shadowmen, which need figure or game code),
// and the samples that show an instanced part or a whole station as one
// object. Nothing in the game imports this; it pulls in every builder.

function sampleTree(): THREE.Group {
  const { trunk, canopy } = treeParts()
  const { trunkH, canopyH, canopyR, tint } = TREE_SAMPLE
  canopy.material.color
    .set(TREE_CANOPY_LOW)
    .lerp(new THREE.Color(TREE_CANOPY_HIGH), tint)
  return assembleParts([
    { ...trunk, scale: [1, trunkH, 1] },
    {
      ...canopy,
      position: [0, trunkH * 0.8, 0],
      scale: [canopyR, canopyH, canopyR],
    },
  ])
}

function samplePole(): THREE.Group {
  const { pole, arm, insulator } = poleParts()
  const h = POLE_SAMPLE.height
  const armY = h - POLE_ARM_DROP
  return assembleParts([
    { ...pole, scale: [1, h, 1] },
    { ...arm, position: [0, armY, 0] },
    ...POLE_INSULATOR_X.map((x): Part => ({
      ...insulator,
      position: [x, armY, 0],
    })),
  ])
}

function sampleStreetlight(): THREE.Group {
  const group = assembleParts(streetlightParts())
  const halo = makeGlowSprite(makeGlowTexture(SODIUM_HALO), 3)
  halo.position.set(...STREETLIGHT.lens)
  halo.position.y -= 0.1
  group.add(halo)
  return group
}

// A small clump, so a 5 cm stalk reads at all.
function sampleReeds(): THREE.Group {
  const reed = reedPart()
  const rng = mulberry32(0x2eed)
  const parts: Part[] = []
  for (let i = 0; i < 12; i++) {
    parts.push({
      ...reed,
      position: [range(rng, -0.4, 0.4), 0, range(rng, -0.4, 0.4)],
      rotation: [range(rng, -0.12, 0.12), 0, range(rng, -0.12, 0.12)],
      scale: [1, range(rng, 1, 2), 1],
    })
  }
  return assembleParts(parts)
}

// One station at yaw 0, laid out exactly as world.ts places them, with
// full shelves. The lot is a flat slab here; in the world it follows the
// ground like a road.
function sampleFuelStation(): THREE.Group {
  const p = fuelStationParts()
  const L = FUEL_LAYOUT
  const lotFront = L.roadEdgeDistance
  const lot = new THREE.PlaneGeometry(
    lotFront - L.lot.back,
    L.lot.halfWidth * 2
  )
  lot.rotateX(-Math.PI / 2)
  const parts: Part[] = [
    {
      name: 'lot',
      geometry: lot,
      material: applyPS1(
        new THREE.MeshBasicMaterial({
          color: L.lotColor,
          side: THREE.DoubleSide,
        })
      ),
      position: [(lotFront + L.lot.back) / 2, 0.02, 0],
    },
    ...p.store,
    p.canopy,
    { ...p.signPole, position: [L.signDistance, 0, L.signAlong] },
    { ...p.sign, position: [L.signDistance, L.signHeight, L.signAlong] },
  ]
  for (const off of [L.canopyPoleOffset, -L.canopyPoleOffset]) {
    parts.push({ ...p.canopyPole, position: [0, 0, off] })
  }
  for (const off of [L.pumpOffset, -L.pumpOffset]) {
    for (const part of p.pump) parts.push({ ...part, position: [0, 0, off] })
    parts.push({ ...p.canopyLight, position: [0, 0, off] })
  }
  for (const at of L.trashCans) {
    for (const part of p.trashCan) parts.push({ ...part, position: at })
  }
  const group = assembleParts(parts)
  const sprite = makeGlowSprite(p.glow, L.glowScale)
  sprite.position.set(L.signDistance, L.signHeight, L.signAlong)
  group.add(sprite)
  group.add(buildShelfDisplay().group)
  return group
}

// The store with its roof off and its shelves full, for looking down into
// it in the Akashic.
function sampleStoreInterior(): THREE.Group {
  const group = assembleParts(
    storeParts().filter((part) => part.name !== 'store-roof')
  )
  group.add(buildShelfDisplay().group)
  group.add(buildLockerDoors())
  return group
}

// A corner of corn for the Akashic page: two walls meeting square.
function sampleCornWall(): THREE.Group {
  const spans: Span[] = [
    { a: { x: 0, z: 0 }, b: { x: 8, z: 0 } },
    { a: { x: 0, z: 0 }, b: { x: 0, z: 6 } },
  ]
  return buildCornWalls(flatCornPieces(spans), cornWallSize())
}

// The whole maze on flat ground, to hold against the film's.
function sampleCornMaze(): THREE.Group {
  const spans = mazeSpans(SHINING_MAZE, CONFIG.maze.size)
  return buildCornWalls(flatCornPieces(spans), cornWallSize())
}

function sampleShadowSpider(): THREE.Group {
  const spider = buildShadowSpider()
  let last = 0
  setMotion(spider.group, (t) => {
    const dt = Math.max(0, Math.min(0.1, t - last))
    last = t
    spider.update({ dt, speed: 6, burn: 0, perception: false })
  })
  return spider.group
}

// A spider `height` tall striking (a spiderling is a small one).
function sampleStrikingSpider(height: number): () => THREE.Group {
  return () => {
    const spider = buildShadowSpider(height)
    let last = 0
    setMotion(spider.group, (t) => {
      const dt = Math.max(0, Math.min(0.1, t - last))
      last = t
      spider.update({ dt, burn: 0, perception: false, ...strikeLoopAt(t) })
    })
    return spider.group
  }
}

// The guitar standing on its horn, for Akashic.
function sampleGuitar(): THREE.Group {
  const guitar = buildGuitar().group
  guitar.position.y = -Math.min(...GUITAR_OUTLINE.map(([, y]) => y))
  const group = new THREE.Group()
  group.add(guitar)
  return group
}

// Registry for the Akashic page, in cycle order. The truck (with its
// driver) and the shadowman come in from their own modules, because both
// need figure or game code; see src/akashic.ts.
export const WORLD_ASSETS: AkashicAsset[] = [
  { id: 'citgo-station', label: 'Citgo station', build: sampleFuelStation },
  {
    id: 'citgo-interior',
    label: 'Citgo interior',
    build: sampleStoreInterior,
  },
  ...STORE_LAYOUT.signs.map((sign) => ({
    id: `ad-${signId(sign)}`,
    label: `Citgo sign: ${signId(sign)}`,
    build: () =>
      assembleParts([{ ...adSignPart(sign), position: [0, sign.size[1], 0] }]),
  })),
  { id: 'pump', label: 'Gas pump', build: () => assembleParts(pumpParts()) },
  {
    id: 'trash-can',
    label: 'Trash can',
    build: () => assembleParts(trashCanParts()),
  },
  { id: 'tree', label: 'Tree', build: sampleTree },
  { id: 'corn-wall', label: 'Corn maze: wall corner', build: sampleCornWall },
  { id: 'corn-maze', label: 'Corn maze: whole layout', build: sampleCornMaze },
  {
    id: 'corn-maze-sign',
    label: 'Corn maze: sign',
    build: buildCornMazeSign,
  },
  { id: 'enter-sign', label: 'Corn maze: enter sign', build: buildEnterSign },
  {
    id: 'portal',
    label: 'Corn maze: portal',
    build: () => {
      const portal = buildPortal()
      setMotion(portal.group, (t) => portal.update(t))
      return portal.group
    },
  },
  { id: 'pole', label: 'Utility pole', build: samplePole },
  { id: 'streetlight', label: 'Streetlight', build: sampleStreetlight },
  { id: 'reeds', label: 'Reeds (clump of 12)', build: sampleReeds },
  {
    id: 'gravestone',
    label: 'Gravestone',
    build: () => assembleParts([gravestonePart()]),
  },
  {
    id: 'beacon-keep',
    label: "Beacon: Mt. Coleman's Keep",
    build: () => buildLandmarkBeacon('#e879f9'),
  },
  { id: 'cabbage', label: 'Cabbage', build: () => buildPickup('cabbage') },
  ...ITEMS.filter((item) => item.category === 'cigarette').map((item) => ({
    id: `pack-${item.id}`,
    label: `Pack: ${item.label}`,
    build: () => buildCigarettePack(item.id),
  })),
  { id: 'joints', label: 'Joints', build: () => buildPickup('joints') },
  ...ITEMS.filter((item) => item.category === 'drink').map((d) => ({
    id: `drink-${d.id}`,
    label: `Drink: ${d.label}`,
    build: () => buildDrink(d.id),
  })),
  { id: 'berries', label: 'Berries', build: () => buildPickup('berries') },
  { id: 'dimes', label: 'Dimes (12)', build: () => buildDimes(12) },
  {
    id: 'tombstone',
    label: "Tombstone: a shadowman's",
    build: () => buildTombstone('Hush Wren of Bull Valley Road').group,
  },
  {
    id: 'tombstone-spunky',
    label: 'Tombstone (Spunky)',
    build: () =>
      buildTombstone(
        CONFIG.lonePine.grave.name,
        CONFIG.lonePine.grave.seed,
        CONFIG.lonePine.grave.heading
      ).group,
  },
  {
    id: 'gold-bullion',
    label: 'Gold bullion (1 troy oz)',
    build: () => buildPickup('gold-bullion'),
  },
  {
    id: 'flaming-halo',
    label: 'The Flaming Halo',
    build: () => {
      // At a head's height, where it is worn.
      const group = new THREE.Group()
      const halo = buildFlamingHalo()
      halo.group.position.y = 1.85
      group.add(halo.group)
      setMotion(group, halo.update)
      return group
    },
  },
  { id: 'berry-bush', label: 'Berry bush', build: () => buildBerryBush() },
  {
    id: 'caretaker',
    label: 'The Caretaker',
    build: () => buildCaretaker().group,
  },
  {
    id: 'cabbage-stand',
    label: 'Bull Valley Cabbage Stand',
    build: () => buildCabbageStand(),
  },
  ...[2, 3, 4].map((level) => ({
    id: `cabbage-stand-${level}`,
    label: `Bull Valley Cabbage Stand, level ${level}`,
    build: () => {
      const stand = buildCabbageStand()
      stand.add(buildStandDressing(level))
      return stand
    },
  })),
  {
    id: 'wreck',
    label: 'The wreck: a green BMW in a tree',
    build: () => buildWreck().group,
  },
  {
    id: 'dish',
    label: 'A dish from the array behind the spawn Citgo',
    build: () => {
      const dish = buildDishArray([{ x: 0, y: 0, z: 0, yaw: 0 }])
      setMotion(dish.group, (t) => dish.update(t))
      return dish.group
    },
  },
  {
    id: 'shadow-spider',
    label: 'Shadow spider',
    build: sampleShadowSpider,
  },
  {
    id: 'shadow-spider-striking',
    label: 'Shadow spider: winding up and lunging',
    build: sampleStrikingSpider(5.6),
  },
  {
    id: 'spiderling',
    label: 'Spiderling: a burst spider breaks into these',
    build: sampleStrikingSpider(5.6 * CONFIG.shadowmen.spiderling.scale),
  },
  {
    id: 'caretaker-striking',
    label: 'The Caretaker: winding up and lunging',
    build: () => {
      const rig = buildCaretaker()
      setMotion(rig.group, (t) => {
        const { windup, lunge } = strikeLoopAt(t)
        rig.setStrike(windup, lunge)
        rig.update(t)
      })
      return rig.group
    },
  },
  { id: 'twenty', label: '$20 bill', build: () => buildTwenty() },
  {
    id: 'raincloud',
    label: "Gron's raincloud",
    build: () => {
      // Lifted so its rain ends on the floor of the view.
      const cloud = buildRaincloud()
      cloud.group.position.y = 2.6
      return cloud.group
    },
  },
  ...ITEMS.filter((item) => item.category === 'medicine').map((m) => ({
    id: `med-${m.id}`,
    label: `Medicine: ${m.label}`,
    build: () => buildMedicine(m.id),
  })),
  {
    id: 'fire-roots',
    label: "Moab's fire roots",
    build: () => buildFireRoots().group,
  },
  {
    id: 'skeleton-horse',
    label: "Moab's skeleton horse",
    build: () => buildSkeletonHorse().group,
  },
  { id: 'guitar', label: 'Guitar: black LTD EX-400', build: sampleGuitar },
  { id: 'bat', label: 'Baseball bat', build: buildBat },
  { id: 'axe', label: 'Axe', build: buildAxe },
  {
    id: 'flashlight',
    label: 'Flashlight',
    build: () => {
      const flashlight = buildFlashlight()
      flashlight.setOn(true)
      return flashlight.group
    },
  },
  {
    id: 'shadow-burst',
    label: 'Shadowman burst',
    build: () => {
      // Chest high, going off again every few seconds with a new throw.
      const group = new THREE.Group()
      const burst = buildShadowBurst()
      burst.group.position.y = CONFIG.shadowmen.chestHeight
      group.add(burst.group)
      const every = SHADOW_BURST.seconds + 0.6
      setMotion(group, (t) => {
        burst.start(0x5c011 + Math.floor(t / every))
        burst.draw(t % every)
      })
      return group
    },
  },
  { id: 'book', label: 'Paperback', build: buildBook },
  {
    id: 'scroll',
    label: "Moab's burning scroll",
    build: () => {
      // Hung from its top rod, so it stands just off the floor.
      const group = new THREE.Group()
      const scroll = buildScroll()
      scroll.group.position.y = 0.56
      group.add(scroll.group)
      setMotion(group, (t) => scroll.update(t))
      return group
    },
  },
  { id: 'scythe', label: "Moab's scythe", build: buildScythe },
]
