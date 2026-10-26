import * as THREE from 'three'
import {
  artTexture,
  assembleParts,
  lambert,
  makeGlowSprite,
  makeGlowTexture,
  setMotion,
} from './assetkit.ts'
import { buildBerryBush } from './berrybush.ts'
import { buildCabbageStand, buildStandDressing } from './cabbagestandmodel.ts'
import { buildCampfire } from './campfiremodel.ts'
import { buildCaretaker } from './caretakermodel.ts'
import { castleOf, FORM_KINDS } from './castle.ts'
import { buildCastle } from './castlemodel.ts'
import { CLUTTER_KINDS } from './castleyard.ts'
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
import { copy } from './copy.ts'
import {
  buildCornMazeSign,
  buildCornWalls,
  buildEnterSign,
  buildPortal,
  CITGO_PORTAL,
  cornWallSize,
  flatCornPieces,
} from './cornmazeparts.ts'
import { buildCrane } from './cranemodel.ts'
import { ruinsAt } from './crumble.ts'
import { dayKey } from './daily.ts'
import { buildDishArray } from './dishes.ts'
import { buildDrink } from './drinkmodels.ts'
import { CAR_KINDS, DRIVE_IN, PROJECTOR_AT } from './drivein.ts'
import {
  buildBurntCar,
  buildDriveInBooth,
  buildDriveInScreen,
  buildProjector,
  buildSpeakerPost,
} from './driveinmodel.ts'
import { buildTyler } from './figure.ts'
import { buildFireRoots, buildRaincloud } from './fire.ts'
import {
  buildBobber,
  buildLeaningRod,
  buildOilLantern,
  buildPicnicTable,
  buildRackRod,
  buildStringer,
  buildTackleBox,
} from './fishmodels.ts'
import {
  buildFenceStretch,
  buildForklift,
  buildWarehouse,
  buildWorksProp,
} from './industrialmodel.ts'
import { itemLabel } from './itemcopy.ts'
import { ITEMS } from './items.ts'
import { buildJeep, buildRadarDish } from './jeep.ts'
import { buildJericho } from './jerichomodel.ts'
import { buildBathLaptop } from './laptopmodel.ts'
import { README } from './laptopreadme.ts'
import { buildLookout } from './lookoutmodel.ts'
import { mazeSpans, SHINING_MAZE } from './maze.ts'
import { buildMedicine } from './medicinemodels.ts'
import {
  fireEscapes,
  moatEdges,
  moatFloor,
  moatPipes,
  trickle,
} from './moat.ts'
import { concreteArt } from './moatart.ts'
import { buildMoat } from './moatmodel.ts'
import { buildPayphone } from './payphonemodel.ts'
import {
  buildCigarettePack,
  buildDimes,
  buildPickup,
  buildQuarters,
  buildTwenty,
} from './pickups.ts'
import {
  buildDumpster,
  buildPlazaSign,
  buildShoppingCart,
  buildStripMall,
} from './plazamodel.ts'
import {
  buildAxe,
  buildBat,
  buildBook,
  buildFlamingHalo,
  buildFlashlight,
  buildGuitar,
  buildLaptop,
  buildScroll,
  buildScythe,
  buildTombstone,
  GUITAR_OUTLINE,
} from './props.ts'
import { applyPS1 } from './ps1.ts'
import { buildRecycler } from './recyclermodel.ts'
import { mulberry32, range } from './rng.ts'
import {
  buildLandmarkBeacon,
  buildWaypointPillar,
  gravestonePart,
  POLE_ARM_DROP,
  POLE_INSULATOR_X,
  POLE_SAMPLE,
  poleParts,
  reedPart,
  SODIUM_HALO,
  STREETLIGHT,
  streetlightParts,
  TREE_FORMS,
  TREE_SAMPLE,
  TREE_SPECIES,
  treeParts,
} from './roadsideparts.ts'
import { buildShadowBurst, SHADOW_BURST } from './shadowburstmodel.ts'
import { buildShadowSpider, burnLoopAt, strikeLoopAt } from './shadowspider.ts'
import { buildSkeletonHorse } from './skeletonhorse.ts'
import { buildSlurm } from './slurmmodel.ts'
import { buildForm } from './spomenikmodel.ts'
import { STORE_LAYOUT } from './store.ts'
import { STRIP_MALL } from './stripmall.ts'
import { deathPose, TOPIARIES } from './topiaries.ts'
import { buildTopiary, buildTopiaryParts, poseDeath } from './topiarymodel.ts'
import { buildToolbox } from './torchmodel.ts'
import { buildTunnelShade } from './tunnelshademodel.ts'
import { buildTrapdoor, buildUndercroft } from './undercroftmodel.ts'
import { buildWreck } from './wreck.ts'
import { buildClutter, buildLightTower } from './yardprops.ts'
import type { AkashicAsset, Part } from './assetkit.ts'
import type { FormKind } from './castle.ts'
import type { Span } from './maze.ts'
import type { TreeSpecies } from './roadsideparts.ts'

// The Akashic page's registry of the world's assets (akashic.ts adds the
// truck, the figures and the shadowmen, which need figure or game code),
// and the samples that show an instanced part or a whole station as one
// object. Nothing in the game imports this; it pulls in every builder.

// One of each kind of tree, as buildTrees (scatter.ts) sizes it.
function sampleTree(species: TreeSpecies): THREE.Group {
  const { trunk, canopy } = treeParts(species)
  const form = TREE_FORMS[species]
  const { trunkH, canopyH, canopyR, tint } = TREE_SAMPLE
  const h = trunkH * form.trunk
  const r = canopyR * form.radius
  canopy.material.color.set(form.low).lerp(new THREE.Color(form.high), tint)
  return assembleParts([
    { ...trunk, scale: [1, h, 1] },
    {
      ...canopy,
      position: [0, h * form.seat, 0],
      scale: [r, canopyH * form.height, r],
    },
  ])
}

const TREE_LABELS: Record<TreeSpecies, string> = {
  whiteOak: 'White oak',
  hickory: 'Hickory',
  ash: 'Ash',
  elm: 'Elm',
  spruce: 'Spruce',
  pine: 'Pine',
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

// A slurm inching along on the spot, baring its tooth now and then.
function sampleSlurm(): THREE.Group {
  const slurm = buildSlurm()
  const pose = (t: number) =>
    slurm.pose({
      stretch: (t * 1.4) % 1,
      tooth: Math.max(0, Math.min(1, (Math.sin(t * 4) - 0.25) / 0.5)),
      splat: null,
    })
  pose(0)
  setMotion(slurm.group, pose)
  return slurm.group
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
// The plaza whole for the Akashic: the building on its slab, its pylon,
// the dumpsters and the carts in their places on flat ground.
function samplePlaza(): THREE.Group {
  const group = new THREE.Group()
  group.add(buildStripMall().group)
  const { props } = STRIP_MALL
  const pylon = buildPlazaSign()
  pylon.position.set(props.pylon.x, 0, props.pylon.z)
  group.add(pylon)
  for (const spot of props.dumpsters) {
    const dumpster = buildDumpster(spot.fallen)
    dumpster.position.set(spot.x, 0, spot.z)
    dumpster.rotation.y = spot.yaw + Math.PI / 2
    group.add(dumpster)
  }
  for (const spot of props.carts) {
    const cart = buildShoppingCart(spot.fallen)
    cart.position.set(spot.x, 0, spot.z)
    cart.rotation.y = spot.yaw
    group.add(cart)
  }
  return group
}

function sampleGuitar(): THREE.Group {
  const guitar = buildGuitar().group
  guitar.position.y = -Math.min(...GUITAR_OUTLINE.map(([, y]) => y))
  const group = new THREE.Group()
  group.add(guitar)
  return group
}

// The firefly pond's fish (items.ts), smallest first, named for the page.
const FISH_LABELS: [string, string][] = [
  ['bluegill', 'Bluegill'],
  ['pumpkinseed', 'Pumpkinseed'],
  ['yellow-perch', 'Yellow perch'],
  ['black-crappie', 'Black crappie'],
  ['bullhead', 'Bullhead'],
  ['largemouth-bass', 'Largemouth bass'],
  ['channel-catfish', 'Channel catfish'],
  ['common-carp', 'Common carp'],
  ['ghost-catfish', 'Ghost catfish'],
  ['shadow-carp', 'Shadow carp'],
]

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
  ...TREE_SPECIES.map((species) => ({
    id: `tree-${species}`,
    label: `Tree: ${TREE_LABELS[species]}`,
    build: () => sampleTree(species),
  })),
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
  {
    id: 'citgo-portal',
    label: 'Citgo portal',
    build: () => {
      const portal = buildPortal(CITGO_PORTAL)
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
  {
    id: 'waypoint-pillar',
    label: 'Waypoint pillar',
    build: buildWaypointPillar,
  },
  { id: 'cabbage', label: 'Cabbage', build: () => buildPickup('cabbage') },
  ...ITEMS.filter((item) => item.category === 'cigarette').map((item) => ({
    id: `pack-${item.id}`,
    label: `Pack: ${itemLabel(item.id)}`,
    build: () => buildCigarettePack(item.id),
  })),
  { id: 'joints', label: 'Joints', build: () => buildPickup('joints') },
  ...ITEMS.filter((item) => item.category === 'drink').map((d) => ({
    id: `drink-${d.id}`,
    label: `Drink: ${itemLabel(d.id)}`,
    build: () => buildDrink(d.id),
  })),
  { id: 'berries', label: 'Berries', build: () => buildPickup('berries') },
  { id: 'dimes', label: 'Dimes (12)', build: () => buildDimes(12) },
  { id: 'quarters', label: 'Quarters (8)', build: () => buildQuarters(8) },
  {
    id: 'mushrooms',
    label: 'Mushrooms',
    build: () => buildPickup('mushrooms'),
  },
  {
    id: 'vault-key',
    label: 'Video Vault key',
    build: () => buildPickup('vault-key'),
  },
  {
    id: 'lsd',
    label: 'LSD: a sheet of blotter',
    build: () => buildPickup('lsd'),
  },
  { id: 'adderall', label: 'Adderall', build: () => buildPickup('adderall') },
  { id: 'rose', label: "Erwin's rose", build: () => buildPickup('rose') },
  {
    id: 'floppy-disk',
    label: "Gron's floppy disk",
    build: () => buildPickup('floppy-disk'),
  },
  {
    id: 'flashlight-item',
    label: 'Flashlight (in the pack)',
    build: () => buildPickup('flashlight'),
  },
  {
    id: 'citgo-phone',
    label: 'Citgo phone',
    build: () => buildPickup('citgo-phone'),
  },
  {
    id: 'marx-whistle',
    label: "Marx's whistle",
    build: () => buildPickup('marx-whistle'),
  },
  ...FISH_LABELS.map(([id, label]) => ({
    id: `fish-${id}`,
    label: `Fish: ${label}`,
    build: () => buildPickup(id),
  })),
  {
    id: 'food-fried-panfish',
    label: 'Food: a panfish fried over the campfire',
    build: () => buildPickup('fried-panfish'),
  },
  {
    id: 'food-grilled-fillet',
    label: 'Food: a fillet grilled over the campfire',
    build: () => buildPickup('grilled-fillet'),
  },
  {
    id: 'fishing-rod',
    label: 'Fishing rod',
    build: () => buildPickup('fishing-rod'),
  },
  { id: 'torch', label: 'Torch', build: () => buildPickup('torch') },
  {
    id: 'slurm-jar',
    label: 'Slurm jar',
    build: () => buildPickup('slurm-jar'),
  },
  {
    id: 'slurm-caught',
    label: 'Slurm, caught',
    build: () => buildPickup('slurm'),
  },
  ...ITEMS.filter((item) => item.category === 'rod').flatMap(({ id }) => [
    { id, label: `Rod: ${itemLabel(id)}`, build: () => buildPickup(id) },
    {
      id: `${id}-racked`,
      label: `Rod: ${itemLabel(id)}, on the rack`,
      build: () => buildRackRod(id),
    },
  ]),
  {
    id: 'nightcrawlers',
    label: 'Nightcrawlers',
    build: () => buildPickup('nightcrawlers'),
  },
  { id: 'tackle-box', label: 'Tackle box', build: () => buildTackleBox() },
  { id: 'toolbox', label: 'Toolbox of torches', build: () => buildToolbox() },
  {
    id: 'picnic-table',
    label: 'Picnic table',
    build: () => buildPicnicTable(),
  },
  { id: 'stringer', label: 'Stringer of fish', build: () => buildStringer() },
  {
    id: 'leaning-rod',
    label: 'Rod leaning on the table',
    build: () => buildLeaningRod('zebco-33', 1.05),
  },
  {
    id: 'oil-lantern',
    label: 'Oil lantern',
    build: () => buildOilLantern().group,
  },
  { id: 'bobber', label: 'Bobber', build: () => buildBobber() },
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
    id: 'empty-can',
    label: 'Empty can',
    build: () => buildPickup('empty-can'),
  },
  {
    id: 'empty-bottle',
    label: 'Empty glass bottle',
    build: () => buildPickup('empty-bottle'),
  },
  {
    id: 'empty-plastic',
    label: 'Empty plastic bottle',
    build: () => buildPickup('empty-plastic'),
  },
  {
    id: 'empty-pack',
    label: 'Empty cigarette pack',
    build: () => buildPickup('empty-pack'),
  },
  {
    id: 'empty-pill-bottle',
    label: 'Empty pill bottle',
    build: () => buildPickup('empty-pill-bottle'),
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
  // One of each hedge animal, as long as one stands across a corridor.
  ...[...new Set(TOPIARIES)].map((kind) => ({
    id: `topiary-${kind}`,
    label: `Topiary ${kind}`,
    build: () => buildTopiary(kind, CONFIG.topiaries.length),
  })),
  // A lion burned away, over and over: ablaze, over on its back, kicking,
  // and down into ash, a beat of standing between.
  {
    id: 'topiary-dying',
    label: 'Topiary lion: burned away',
    build: () => {
      const parts = buildTopiaryParts('lion', CONFIG.topiaries.length)
      const loop = CONFIG.topiaries.deathSeconds + 1
      setMotion(parts.group, (t) => {
        const into = t % loop
        poseDeath(parts, into < 1 ? null : deathPose(into - 1), t)
      })
      return parts.group
    },
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
    id: 'campfire',
    label: 'The campfire by the firefly pond',
    build: () => buildCampfire().group,
  },
  {
    id: 'recycler',
    label: 'The recycling machine by the Citgo door',
    build: buildRecycler,
  },
  {
    id: 'jeep',
    label: "Tyler's red Jeep Wrangler, the back open",
    build: buildJeep,
  },
  {
    id: 'tyler-jeep',
    label: 'Tyler in his Jeep, the radar dish on the roof cabled to the laptop',
    build: () => buildTyler().group,
  },
  {
    id: 'radar-dish',
    label: "Tyler's portable radar dish",
    build: () => buildRadarDish().group,
  },
  {
    id: 'lookout',
    label: 'The lookout tower by the corn maze',
    build: () => buildLookout(),
  },
  {
    id: 'drive-in-screen',
    label: 'The drive-in’s screen, past the corn maze',
    build: () => buildDriveInScreen().group,
  },
  {
    id: 'drive-in-booth',
    label: 'The drive-in’s projection booth, the projector inside',
    build: () => {
      const booth = buildDriveInBooth().group
      const projector = buildProjector().group
      projector.position.set(0, 0.12, PROJECTOR_AT.z - DRIVE_IN.booth.z)
      booth.add(projector)
      return booth
    },
  },
  {
    id: 'projector',
    label: 'The drive-in’s 35mm projector',
    build: () => buildProjector().group,
  },
  ...CAR_KINDS.map((kind) => ({
    id: `burnt-${kind}`,
    label: `A burnt-out ${kind} at the drive-in`,
    build: () => buildBurntCar(kind, 7),
  })),
  {
    id: 'speaker-post',
    label: 'A drive-in speaker post',
    build: () => buildSpeakerPost(3),
  },
  {
    id: 'castle-entropy',
    label: 'Castle Entropy, as it stands today',
    build: () => sampleCastle(0),
  },
  {
    id: 'castle-entropy-tomorrow',
    label: 'Castle Entropy, as it will stand tomorrow',
    build: () => sampleCastle(1),
  },
  {
    id: 'castle-entropy-crumbling',
    label: 'Castle Entropy, a wing of it crumbling away',
    build: sampleCrumbling,
  },
  ...FORM_KINDS.map((kind) => ({
    id: `spomenik-${kind}`,
    label: `A spomenik's form on Castle Entropy: ${kind}`,
    build: () => sampleForm(kind),
  })),
  {
    id: 'castle-moat',
    label: "Castle Entropy's moat, with its fire escapes",
    build: sampleMoat,
  },
  {
    id: 'moat-crane',
    label: "A crane rotting on the moat's rim",
    build: () => buildCrane(0xc4a1).group,
  },
  ...CLUTTER_KINDS.map((kind) => ({
    id: `yard-${kind}`,
    label: `Left lying round the castle's rim: ${kind}`,
    build: () => buildClutter(kind, 0x51ed),
  })),
  {
    id: 'light-tower',
    label: "A light tower on the castle's rim",
    build: () => buildLightTower(0x1a90).group,
  },
  {
    id: 'payphone',
    label: "The payphone on the castle's rim",
    build: buildPayphone,
  },
  {
    id: 'jericho',
    label: 'Jericho, the Candlebearer, by the payphone',
    build: () => buildJericho().group,
  },
  {
    id: 'strip-mall',
    label: 'Bull Valley Plaza, the dead strip mall',
    build: samplePlaza,
  },
  {
    id: 'undercroft',
    label: 'The Undercroft, under the plaza',
    build: () => buildUndercroft().group,
  },
  { id: 'trapdoor', label: 'The trapdoor in the office', build: buildTrapdoor },
  {
    id: 'warehouse',
    label: 'Bull Valley Box & Carton, in the industrial park',
    build: () => {
      const rig = buildWarehouse(4)
      setMotion(rig.group, (t) => rig.update(t))
      return rig.group
    },
  },
  {
    id: 'park-sign',
    label: 'The sign out front of Bull Valley Industrial Park #4',
    build: () => buildWorksProp({ kind: 'sign', x: 0, z: 0, yaw: 0 }),
  },
  {
    id: 'forklift',
    label: 'A dead forklift in an industrial park warehouse',
    build: buildForklift,
  },
  {
    id: 'pallet-load',
    label: 'A pallet of boxes left in an industrial park truck court',
    build: () =>
      buildWorksProp({ kind: 'load', x: 0, z: 0, yaw: 0, layers: 3 }),
  },
  {
    id: 'chain-link',
    label: 'The rusted chain-link round an industrial park truck court',
    build: buildFenceStretch,
  },
  {
    id: 'semi-trailer',
    label: 'A semi trailer left at a bay in the industrial park',
    build: () => buildWorksProp({ kind: 'trailer', x: 0, z: 0, yaw: 0 }),
  },
  {
    id: 'tunnel-shade',
    label: 'A tunnel shade',
    build: () => {
      const rig = buildTunnelShade('shade')
      setMotion(rig.group, (t) => rig.update(t))
      return rig.group
    },
  },
  {
    id: 'warden',
    label: 'The Warden',
    build: () => {
      const rig = buildTunnelShade('warden')
      // Walking its chamber, at its patrol.
      setMotion(rig.group, (t) =>
        rig.update(t, CONFIG.tunnel.warden.patrolSpeed)
      )
      return rig.group
    },
  },
  {
    id: 'plaza-sign',
    label: 'Bull Valley Plaza: the pylon by the road',
    build: buildPlazaSign,
  },
  { id: 'dumpster', label: 'Dumpster', build: () => buildDumpster() },
  {
    id: 'dumpster-fallen',
    label: 'Dumpster, over on its side',
    build: () => buildDumpster(true),
  },
  {
    id: 'shopping-cart',
    label: 'Shopping cart',
    build: () => buildShoppingCart(),
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
    id: 'slurm',
    label: 'Slurm: a black slug off the Citgo dripline',
    build: sampleSlurm,
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
    id: 'shadow-spider-burning',
    label: 'Shadow spider: burning in a beam, thrashing',
    build: () => {
      const spider = buildShadowSpider(5.6)
      let last = 0
      setMotion(spider.group, (t) => {
        const dt = Math.max(0, Math.min(0.1, t - last))
        last = t
        spider.update({ dt, speed: 0, burn: burnLoopAt(t), perception: false })
      })
      return spider.group
    },
  },
  {
    id: 'caretaker-burning',
    label: 'The Caretaker: burning in two lights, thrashing',
    build: () => {
      const rig = buildCaretaker()
      setMotion(rig.group, (t) => {
        rig.setBurn(burnLoopAt(t))
        rig.update(t)
      })
      return rig.group
    },
  },
  ...(['shade', 'warden'] as const).map((kind) => ({
    id: `${kind === 'shade' ? 'tunnel-shade' : 'warden'}-burning`,
    label: `${kind === 'shade' ? 'A tunnel shade' : 'The Warden'}: burning in a beam, thrashing`,
    build: () => {
      const rig = buildTunnelShade(kind)
      setMotion(rig.group, (t) => {
        rig.setBurn(burnLoopAt(t))
        rig.update(t)
      })
      return rig.group
    },
  })),
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
    label: `Medicine: ${itemLabel(m.id)}`,
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
    id: 'laptop',
    label: "Tyler's laptop, hunting for a lock",
    build: () => buildLaptop().group,
  },
  {
    id: 'bath-laptop',
    label: 'The bathroom laptop, the readme up, its own light',
    build: () => buildBathLaptop(copy('laptop.readme_name'), README).group,
  },
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

// Castle Entropy `days` from now, on the Central calendar (castle.ts).
function sampleCastle(days: number): THREE.Object3D {
  const rig = buildCastle(castleOf(dayKey(Date.now() + days * 86_400_000)))
  return rig.group
}

// Today's castle from the first moment a mass of it starts to crumble,
// so its fall plays from the start and the bits keep falling.
function sampleCrumbling(): THREE.Object3D {
  const layout = castleOf(dayKey(Date.now()))
  const rig = buildCastle(layout)
  let start = 0
  for (let t = 0; t < CONFIG.castle.ruin.cycle * 20; t += 0.5) {
    const crumbling = ruinsAt(layout, t).masses.some(
      (r) => r.stage === 'crumbling' && r.since < 0.5
    )
    if (crumbling) {
      start = t
      break
    }
  }
  setMotion(rig.group, (t) => rig.update(start + t))
  rig.update(start)
  return rig.group
}

// The moat on rolling ground of its own, at the origin.
function sampleMoat(): THREE.Object3D {
  const place = { x: 0, z: 0, yaw: 0 }
  const raw = (x: number, z: number) =>
    4 * Math.sin(x / 40) + 3 * Math.cos(z / 55)
  const floor = moatFloor(raw, place)
  const edges = moatEdges(place)
  const stairs = fireEscapes(raw, place, floor)
  const rig = buildMoat({
    ...edges,
    raw,
    floor,
    stairs,
    pipes: moatPipes(raw, place, floor, stairs),
    trickle: trickle(place),
    middle: place,
  })
  // The floor on the grid, the rim up over it.
  const lifted = new THREE.Group()
  rig.group.position.y = -floor
  lifted.add(rig.group)
  setMotion(lifted, (t) => rig.update(t))
  return lifted
}

// The first of a spomenik's `kind` in the days from now, at its foot.
function sampleForm(kind: FormKind): THREE.Object3D {
  for (let days = 0; days < 400; days++) {
    const form = castleOf(dayKey(Date.now() + days * 86_400_000)).forms.find(
      (f) => f.kind === kind
    )
    if (!form) continue
    const concrete = lambert({
      map: artTexture(concreteArt('#8f8c86')),
      side: THREE.DoubleSide,
    })
    return buildForm(
      { ...form, x: 0, y: 0, z: 0 },
      concrete,
      lambert({ color: '#0c0d10' })
    )
  }
  return new THREE.Group()
}
