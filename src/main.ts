import * as THREE from 'three'
import './styles.css'
import { buildSky, pulseMaterials } from './assets.ts'
import { BvAudio } from './audio.ts'
import { ringItems, stepIndex, syncIndex } from './carousel.ts'
import { loadCharacter } from './characters.ts'
import { mountCharacterSelect } from './characterselect.ts'
import { CONFIG } from './config.ts'
import { unitToWorld } from './coords.ts'
import { Hud } from './hud.ts'
import {
  interactionPrompt,
  pickupLabel,
  resolveInteraction,
} from './interactions.ts'
import { addItem, loadInventory, saveInventory, useItem } from './inventory.ts'
import { createInventoryView } from './inventoryview.ts'
import {
  cigaretteToSmoke,
  shopStock as freshShopStock,
  isCigarette,
  itemById,
} from './items.ts'
import { KEEP } from './landmarks.ts'
import { Player } from './player.ts'
import { PlayerBody } from './playerbody.ts'
import { createPS1Renderer, setSnapResolution } from './ps1.ts'
import {
  advance,
  carryLimit,
  createRaid,
  EVENTS,
  loadoutClock,
  STATES,
  summary,
} from './raid.ts'
import { mulberry32 } from './rng.ts'
import {
  buildRoadGraph,
  nearestRoadPoint,
  planRoute,
  wanderRoute,
} from './roadgraph.ts'
import { Scope } from './scope.ts'
import { buy as buyItem } from './shop.ts'
import { mountCard, showSplash, skipTitles } from './splash.ts'
import { buildTerrainMesh, createHeightField, loadTerrain } from './terrain.ts'
import { Truck } from './truck.ts'
import { buildWorld } from './world.ts'
import type { Interaction } from './interactions.ts'
import type { Geo, Raid, RingItem } from './interfaces.ts'
import type { OutfitId } from './outfits.ts'
import type { RoadGraph } from './roadgraph.ts'
import type { TerrainData } from './terrain.ts'
import type { Pickup, World } from './world.ts'

// Dev-only introspection hook; see the bottom of boot().
interface BvHook {
  scene: THREE.Scene
  camera: THREE.PerspectiveCamera
  renderer: THREE.WebGLRenderer
  player: Player
  world: World
  truck: Truck
  graph: RoadGraph
  readonly raid: Raid
  teleport(u: number, v: number): void
  hurryTruck(seconds?: number): void
}

declare global {
  interface Window {
    __bv?: BvHook
  }
}

// Same files the Scaduscope reads; baked by scripts/fetch_bull_valley.cjs.
const DATA_BASE = '/data/bull-valley'

// Colophon → logo → character select; resolves with the chosen outfit.
// The select and the logo mount first, black and inert, so the cards
// above them stack in DOM order and each reveal uncovers the next.
async function showTitles(audio: BvAudio): Promise<OutfitId> {
  if (skipTitles()) return loadCharacter(window.localStorage)
  const select = mountCharacterSelect({
    storage: window.localStorage,
    config: { ...CONFIG.select, downscale: CONFIG.render.downscale },
  })
  const logo = mountCard({
    audio,
    config: CONFIG.logo,
    fog: { downscale: CONFIG.render.downscale },
  })
  await showSplash({ audio, config: CONFIG.splash })
  logo.start()
  await logo.done
  return select.run()
}

async function boot() {
  const root = document.getElementById('bv-root')
  if (!root) throw new Error('Missing #bv-root')
  const hud = new Hud(root)
  const audio = new BvAudio()
  // Sound effects are off for now; the splash cue is the only audio, and
  // dev builds mute it too.
  if (import.meta.env.DEV) audio.setMuted(true)
  // The titles cover the terrain resolve: colophon, logo, then the
  // character select, each a black layer stacked over the next, so every
  // reveal uncovers the one beneath and the last discloses the intro
  // dialog already waiting. Not awaited until the player body needs the
  // pick; the scene builds underneath.
  const titles = showTitles(audio)
  hud.showIntro(true, false)
  hud.beginBtn.disabled = true
  hud.beginBtn.textContent = 'Resolving Terrain…'

  let geo: Geo
  let terrain: TerrainData
  try {
    ;[geo, terrain] = await Promise.all([
      fetch(`${DATA_BASE}/geo.json`).then((r) => {
        if (!r.ok) throw new Error(`geo.json ${r.status}`)
        // Our own survey, written by scripts/fetch_bull_valley.cjs.
        return r.json() as Promise<Geo>
      }),
      loadTerrain(`${DATA_BASE}/terrain.png`),
    ])
  } catch (err) {
    console.error('Shadow Wars failed to load its terrain data:', err)
    hud.beginBtn.textContent = 'The Valley Will Not Resolve'
    return
  }

  const field = createHeightField(terrain, geo)
  const heightAt = (x: number, z: number) => field.sample(x, z)

  // --- Scene -------------------------------------------------------------
  const renderer = createPS1Renderer(hud.canvas)

  const scene = new THREE.Scene()
  scene.background = new THREE.Color('#0b1018')
  scene.fog = new THREE.FogExp2('#0b1018', CONFIG.render.fogDensity)

  const camera = new THREE.PerspectiveCamera(
    72,
    window.innerWidth / window.innerHeight,
    0.1,
    CONFIG.render.far
  )

  scene.add(new THREE.HemisphereLight('#33507e', '#1a2013', 1.5))
  const moonlight = new THREE.DirectionalLight('#9db4d8', 0.9)
  moonlight.position.set(0.4, 1, -0.6)
  scene.add(moonlight)

  scene.add(buildTerrainMesh(field, geo))
  const world = buildWorld(geo, heightAt)
  scene.add(world.group)

  // Sky furniture rides along with the player so it never recedes into fog.
  const sky = buildSky()
  scene.add(sky)

  // --- Systems -----------------------------------------------------------
  // The shadowmen are parked until after the MVP loop; src/shadowmen.ts and
  // src/nerves.ts stay in the tree, unwired.
  const graph = buildRoadGraph(geo.roads, geo.metres)
  const truck = new Truck({ scene, heightAt })

  // Park Matthew Marx's Chevy at the road nearest the spawn station, already
  // pointed down tonight's joyride.
  const spawnStation = world.spawnStation
  if (!spawnStation) throw new Error('No fuel station inside the survey')
  const truckPoint = nearestRoadPoint(graph, spawnStation.x, spawnStation.z)
  if (!truckPoint) throw new Error('No road near the spawn station')
  const departRoute = wanderRoute(
    graph,
    truckPoint,
    mulberry32(0xcab42),
    CONFIG.truck.wanderMetres
  )
  {
    const dx = departRoute[1].x - departRoute[0].x
    const dz = departRoute[1].z - departRoute[0].z
    const len = Math.hypot(dx, dz) || 1
    truck.parkAt(truckPoint.x, truckPoint.z, dx / len, dz / len)
    truck.setDriverPost('tailgate')
  }
  // Spawn on the lot between the pump island and the truck, facing the
  // truck — clear of the building, which sits behind the pumps.
  {
    const dx = truck.x - spawnStation.x
    const dz = truck.z - spawnStation.z
    const len = Math.hypot(dx, dz) || 1
    world.spawn.x = spawnStation.x + (dx / len) * CONFIG.raid.spawnOffset
    world.spawn.z = spawnStation.z + (dz / len) * CONFIG.raid.spawnOffset
    world.spawn.yaw = Math.atan2(
      -(truck.x - world.spawn.x),
      -(truck.z - world.spawn.z)
    )
  }

  const player = new Player({
    camera,
    heightAt,
    metres: geo.metres,
    spawn: world.spawn,
  })
  const playerBody = new PlayerBody(scene, await titles)
  const scope = new Scope(hud.scopeCanvas, hud.phone)

  const keep = world.landmarks.find((l) => l.n === KEEP)
  const stand = world.landmarks.find((l) => l.n !== KEEP)

  // --- Game state ----------------------------------------------------------
  let inventory = loadInventory(window.localStorage)
  // The cigarette a bare 1 smokes: the last one picked in the inventory.
  let selectedCigarette: string | null = null
  let raid = createRaid(0)
  let raidClock = 0 // advances only while the pointer is locked
  let shopStock = freshShopStock()
  // The carousel: ring entries from carousel.ts, the selected slot, and
  // its kind so the selection survives the ring changing.
  const inventoryView = createInventoryView()
  let ring: RingItem[] = []
  let ringIndex = 0
  let ringKind: string | null = null
  let time = 0
  let smokingUntil = 0
  let emberUntil = 0
  let perceptionUntil = 0
  let started = false
  let greeted = false
  let ended = false
  let inventoryOpen = false
  // What E would do right now; resolved every frame in the loop.
  let interaction: Interaction<Pickup> | null = null
  const ridingForward = new THREE.Vector3(0, 0, -1)

  player.onEdge = () => hud.toast('The valley ends here.')

  const nearSpawnStation = () =>
    Math.hypot(spawnStation.x - player.pos.x, spawnStation.z - player.pos.z) <
    CONFIG.raid.shopRadius
  const shopOpen = () => raid.state === STATES.LOADOUT && nearSpawnStation()

  // Rebuild the ring after anything that changes what you carry or what the
  // tailgate holds, keeping the selection on the same kind.
  const refreshRing = () => {
    const open = shopOpen()
    ring = ringItems(inventory, raid, open ? shopStock : null)
    ringIndex = syncIndex(ring, ringKind, ringIndex)
    ringKind = ring[ringIndex]?.kind ?? null
    hud.setCarousel({ items: ring, index: ringIndex, shopOpen: open })
  }

  const truckStatus = () => {
    if (raid.state === STATES.LOADOUT) {
      return `Leaves in ${loadoutClock(raid, raidClock)}`
    }
    if (raid.state === STATES.RIDING) return 'Riding the bed'
    return raid.truckCalled ? 'On its way' : 'Gone'
  }

  // The player freezes while the inventory is open; the valley does not.
  const openInventory = () => {
    player.keys.clear()
    refreshRing()
    inventoryView.snapTo(ringIndex)
    inventoryOpen = hud.showInventory(true)
  }

  const closeInventory = () => {
    inventoryOpen = hud.showInventory(false)
  }

  const cycleRing = (dir: number) => {
    if (ring.length < 2) return
    ringIndex = stepIndex(ringIndex, ring.length, dir)
    const kind = ring[ringIndex].kind
    ringKind = kind
    if (isCigarette(kind)) selectedCigarette = kind
    refreshRing()
  }

  const endRaid = () => {
    ended = true
    hud.prompt(null)
    closeInventory()
    if (document.pointerLockElement) document.exitPointerLock()
    player.locked = false
    hud.showIntro(false)
    hud.showSummary(summary(raid))
  }

  const truckLeaves = () => {
    truck.driveRoute(departRoute)
  }

  const boardTruck = () => {
    const next = advance(raid, EVENTS.BOARD_TRUCK, raidClock)
    if (next === raid) return
    raid = next
    truckLeaves()
    hud.toast('You climb into the bed. Marx pulls out.')
    hud.toast('E hops out. Anywhere you like.')
    closeInventory()
  }

  const hopOut = (toastText?: string) => {
    const next = advance(raid, EVENTS.HOP_OUT, raidClock)
    if (next === raid) return
    raid = next
    const spot = truck.hopOutSpot()
    player.relocate(spot.x, spot.z, player.yaw)
    if (toastText) hud.toast(toastText)
  }

  const callTruck = () => {
    if (raid.state !== STATES.ON_FOOT || raid.truckCalled) return
    const from = nearestRoadPoint(graph, truck.x, truck.z)
    const to = nearestRoadPoint(graph, player.pos.x, player.pos.z)
    const route = from && to ? planRoute(graph, from, to) : null
    if (!route || route.length < 2) {
      hud.toast('You whistle into the dark. Nothing turns over.')
      return
    }
    raid = advance(raid, EVENTS.CALL_TRUCK, raidClock)
    truck.driveRoute(route)
    hud.toast('You whistle into the dark. An engine turns over, far off.')
  }

  const buy = (kind: string) => {
    if (!shopOpen()) return
    const { next, toast } = buyItem(
      { raid, stock: shopStock, inventory },
      kind,
      raidClock
    )
    if (next) {
      const inventoryChanged = next.inventory !== inventory
      ;({ raid, stock: shopStock, inventory } = next)
      if (inventoryChanged) saveInventory(window.localStorage, inventory)
      refreshRing()
    }
    if (toast) hud.toast(toast)
  }

  // --- Input ---------------------------------------------------------------
  hud.beginBtn.disabled = false
  hud.beginBtn.textContent = 'Click to Play'
  const startWithoutLock = () => {
    // Automation-only: headless browsers refuse pointer lock and the valley is
    // unwalkable without it. Never engages for a human — a silent no-lock
    // fallback reads raw cursor movement, which stops at the screen edge and
    // makes turning around impossible.
    if (!import.meta.env.DEV || !navigator.webdriver) return
    player.locked = true
    hud.setLocked(true)
    started = true
    hud.showIntro(false)
  }
  // Pointer lock can be refused (browser quirk, gesture rules, the cooldown
  // after Esc). When it is, drop the intro and hand the player a direct
  // click-the-view retry — a gesture on the canvas itself always qualifies.
  // An open inventory hides the prompt and shows its own resume line.
  const lockRefused = () => {
    if (import.meta.env.DEV && navigator.webdriver) {
      startWithoutLock()
      return
    }
    started = true
    hud.showIntro(false)
    if (!inventoryOpen) hud.prompt('Click to Resume')
  }
  const engagePointer = () => {
    try {
      // Older browsers return undefined instead of a promise.
      const request: Promise<void> | undefined = hud.canvas.requestPointerLock()
      request?.catch(lockRefused)
    } catch {
      lockRefused()
    }
  }
  hud.beginBtn.addEventListener('click', engagePointer)
  hud.canvas.addEventListener('click', () => {
    if (started && !player.locked && !ended) engagePointer()
  })
  document.addEventListener('pointerlockerror', lockRefused)

  // The browser drops pointer lock on Esc and whenever the window loses focus
  // (Alt+Tab, Cmd+number). Neither can be blocked, and the page cannot tell
  // them apart, so every drop is a pause. An open inventory stays open and
  // waits for a click; otherwise the pause overlay shows.
  document.addEventListener('pointerlockchange', () => {
    const locked = document.pointerLockElement === hud.canvas
    player.locked = locked
    hud.setLocked(locked)
    // Keys held when focus left never send keyup.
    if (!locked) player.keys.clear()
    if (locked) {
      started = true
      hud.showIntro(false)
      if (!greeted) {
        greeted = true
        hud.toast('Matthew Marx keeps the engine running.')
      }
    } else if (started && !ended && !inventoryOpen) {
      hud.showIntro(true, true)
    }
  })
  window.addEventListener('blur', () => player.keys.clear())
  document.addEventListener('mousemove', (e) => {
    if (!inventoryOpen) player.handleMouse(e.movementX, e.movementY)
  })

  // kind: a cigarette id, 'joints', or 'smoke' for the selected cigarette.
  const useKind = (choice: string) => {
    const kind =
      choice === 'smoke'
        ? cigaretteToSmoke(inventory, selectedCigarette)
        : choice
    if (!kind) {
      hud.toast('No cigarettes left.')
      return
    }
    const item = itemById(kind)
    if (!item) return
    const smoke = item.category === 'cigarette'
    if (smoke && time < smokingUntil) return
    const result = useItem(inventory, kind)
    if (!result.used) {
      if (item.empty) hud.toast(item.empty)
      return
    }
    inventory = result.inv
    if (smoke) selectedCigarette = kind
    saveInventory(window.localStorage, inventory)
    refreshRing()
    if (smoke) {
      smokingUntil = time + (item.smokeSeconds ?? 0)
      emberUntil = smokingUntil + (item.emberSeconds ?? 0)
    } else {
      perceptionUntil = time + (item.perceptionSeconds ?? 0)
    }
    if (item.used) hud.toast(item.used)
  }

  const takePickup = (pickup: Pickup) => {
    if (pickup.kind === 'cabbage') {
      const next = advance(raid, EVENTS.PICK_CABBAGE, raidClock)
      if (next === raid) {
        hud.toast('Your arms are full.')
        return
      }
      raid = next
      pickup.taken = true
      pickup.mesh.visible = false
      hud.toast('Taken: Cabbage')
    } else {
      pickup.taken = true
      pickup.mesh.visible = false
      inventory = addItem(inventory, pickup.kind, pickup.count)
      saveInventory(window.localStorage, inventory)
      hud.toast(`Taken: ${pickupLabel(pickup)}`)
    }
    interaction = null
    hud.prompt(null)
  }

  const interact = () => {
    // The raid state is live; the interaction is from the last frame.
    if (raid.state === STATES.RIDING) {
      hopOut('Boots on gravel. The truck rolls on.')
      return
    }
    switch (interaction?.kind) {
      case 'board':
        boardTruck()
        return
      case 'boardExtract':
        raid = advance(raid, EVENTS.BOARD_TRUCK, raidClock, { arrived: true })
        if (raid.state === STATES.EXTRACTED) endRaid()
        return
      case 'unload': {
        const count = raid.carrying
        raid = advance(raid, EVENTS.DELIVER, raidClock)
        hud.toast(
          `The stand takes your ${count === 1 ? 'cabbage' : `${count} cabbages`}. Somewhere, gratitude.`
        )
        return
      }
      case 'extractFuel':
        raid = advance(raid, EVENTS.EXTRACT_FUEL, raidClock, interaction.name)
        if (raid.state === STATES.EXTRACTED) endRaid()
        return
      case 'extractKeep':
        raid = advance(raid, EVENTS.EXTRACT_KEEP, raidClock)
        if (raid.state === STATES.EXTRACTED) endRaid()
        return
      case 'pickup':
        takePickup(interaction.pickup)
        return
    }
  }

  // With the inventory open the keys drive the carousel and never reach the
  // player: ←/→ or A/D cycle, E or Enter uses, B buys at the tailgate,
  // 1 and 2 still smoke and spark. Esc drops pointer lock, which pauses it.
  const inventoryKey = (e: KeyboardEvent) => {
    const item = ring[ringIndex]
    if (e.code === 'Tab') {
      e.preventDefault()
      closeInventory()
    } else if (e.code === 'ArrowLeft' || e.code === 'KeyA') {
      cycleRing(-1)
    } else if (e.code === 'ArrowRight' || e.code === 'KeyD') {
      cycleRing(1)
    } else if (e.code === 'KeyE' || e.code === 'Enter') {
      if (item?.canUse) useKind(item.kind)
    } else if (e.code === 'KeyB') {
      if (item?.canBuy) buy(item.kind)
    } else if (e.code === 'Digit1') {
      useKind('smoke')
    } else if (e.code === 'Digit2') {
      useKind('joints')
    }
  }

  document.addEventListener('keydown', (e) => {
    if (!player.locked || ended) return
    if (inventoryOpen) {
      inventoryKey(e)
      return
    }
    player.handleKey(e.code, true)
    if (e.code === 'Tab') {
      e.preventDefault()
      openInventory()
    } else if (e.code === 'KeyQ') {
      scope.toggle()
    } else if (e.code === 'Digit1') {
      useKind('smoke')
    } else if (e.code === 'Digit2') {
      useKind('joints')
    } else if (e.code === 'KeyT') {
      callTruck()
    } else if (e.code === 'KeyE') {
      interact()
    }
  })
  document.addEventListener('keyup', (e) => player.handleKey(e.code, false))

  const resize = () => {
    const w = window.innerWidth
    const h = window.innerHeight
    const iw = Math.max(2, Math.floor(w / CONFIG.render.downscale))
    const ih = Math.max(2, Math.floor(h / CONFIG.render.downscale))
    renderer.setSize(iw, ih, false)
    camera.aspect = w / h
    camera.updateProjectionMatrix()
    inventoryView.setAspect(w / h)
    setSnapResolution(iw, ih)
  }
  window.addEventListener('resize', resize)
  resize()

  // --- Loop ----------------------------------------------------------------
  let last = performance.now()
  renderer.setAnimationLoop(() => {
    const now = performance.now()
    const dt = Math.min(CONFIG.render.maxStep, (now - last) / 1000)
    last = now
    time += dt
    // The valley is persistent: once the raid begins, the clock never pauses —
    // not for the intro overlay, not for a dropped pointer lock. The truck
    // keeps its own schedule.
    if (started && !ended) raidClock += dt

    const smoking = time < smokingUntil
    const ember = time < emberUntil
    const perception = time < perceptionUntil

    // The truck leaves on the timer whether you're aboard or not.
    if (raid.state === STATES.LOADOUT && raidClock > raid.loadoutEndsAt) {
      raid = advance(raid, EVENTS.TIMER_EXPIRED, raidClock)
      truckLeaves()
      hud.toast('Taillights. The truck leaves without you.')
      refreshRing()
    }

    let forward = ridingForward
    if (raid.state === STATES.RIDING) {
      // The one place the camera leaves player.update(): ride the bed with
      // free look, keeping player.pos honest for the scope.
      const truckState = truck.update(dt)
      const seat = truck.bedSeat()
      player.relocate(seat.x, seat.z, player.yaw)
      camera.position.set(seat.x, seat.y, seat.z)
      camera.rotation.set(player.pitch, player.yaw, 0)
      ridingForward.set(-Math.sin(player.yaw), 0, -Math.cos(player.yaw))
      // Standing in the bed.
      playerBody.update(dt, {
        x: seat.x,
        ground: seat.y - CONFIG.truck.bedEye,
        z: seat.z,
        yaw: player.yaw,
        speed: 0,
        crouching: false,
      })
      if (truckState.done) {
        hopOut('End of the line. Marx lights a cigarette.')
      }
    } else {
      const playerState = player.update(dt, {
        speedScale:
          (scope.raised ? CONFIG.player.scopeSpeedScale : 1) *
          (smoking ? CONFIG.items.smokingSpeedScale : 1),
        swayAmp: 0,
        driftAmp: perception ? CONFIG.items.perceptionDrift : 0,
      })
      forward = playerState.forward
      playerBody.update(dt, {
        x: player.pos.x,
        ground: heightAt(player.pos.x, player.pos.z),
        z: player.pos.z,
        yaw: player.yaw,
        speed: playerState.speed,
        crouching: playerState.crouching,
      })
      truck.update(dt)
    }

    hud.setCountdown(
      raid.state === STATES.LOADOUT ? loadoutClock(raid, raidClock) : null
    )

    const timers: string[] = []
    if (smoking) timers.push(`Smoking ${Math.ceil(smokingUntil - time)}s`)
    else if (ember) timers.push(`Ember ${Math.ceil(emberUntil - time)}s`)
    if (perception)
      timers.push(`Perception ${Math.ceil(perceptionUntil - time)}s`)
    hud.setTimers(timers)

    scope.draw(dt, {
      contacts: [],
      forward,
      nerves: 0,
      perception,
    })

    // Pickups pulse every frame, whatever the prompt says.
    const pulse = 0.35 + Math.sin(time * 3) * 0.2
    for (const pickup of world.pickups) {
      if (pickup.taken) continue
      for (const m of pulseMaterials(pickup.mesh)) m.emissiveIntensity = pulse
    }

    // --- Interactions: what E would do right now -------------------------
    interaction = resolveInteraction({
      raid,
      ended,
      player: player.pos,
      truck: {
        distance: truck.distanceTo(player.pos.x, player.pos.z),
        moving: truck.moving,
      },
      stand: stand ?? null,
      keep: keep ?? null,
      stations: world.fuelPoints,
      spawnStation,
      pickups: world.pickups,
    })
    const prompt = interaction ? interactionPrompt(interaction) : null
    if (player.locked) {
      hud.prompt(!ended ? prompt : null)
    } else if (started && !ended) {
      hud.prompt('Click to Resume')
    } else {
      hud.prompt(null)
    }

    sky.position.set(player.pos.x, 0, player.pos.z)
    if (inventoryOpen) {
      // The carousel replaces the view; the world keeps running behind it.
      hud.setInventoryStatus({
        carry: `${raid.carrying} / ${carryLimit(raid)}`,
        delivered: raid.delivered,
        truck: truckStatus(),
      })
      inventoryView.update(dt, ring, ringIndex)
      renderer.render(inventoryView.scene, inventoryView.camera)
    } else {
      renderer.render(scene, camera)
    }
  })

  if (import.meta.env.DEV) {
    // Dev-only introspection hook; stripped from production bundles.
    window.__bv = {
      scene,
      camera,
      renderer,
      player,
      world,
      truck,
      graph,
      get raid() {
        return raid
      },
      teleport(u: number, v: number) {
        const { x, z } = unitToWorld(u, v, geo.metres)
        player.relocate(x, z)
      },
      hurryTruck(seconds = 5) {
        raid = { ...raid, loadoutEndsAt: raidClock + seconds }
      },
    }
  }
}

boot().catch((err: unknown) => {
  console.error('Shadow Wars failed to boot:', err)
})
