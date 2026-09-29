import * as THREE from 'three'
import './styles.css'
import { CONFIG } from './config.js'
import { loadTerrain, createHeightField, buildTerrainMesh } from './terrain.js'
import { buildWorld } from './world.js'
import { Player } from './player.js'
import { Scope } from './scope.js'
import { Hud } from './hud.js'
import { BvAudio } from './audio.js'
import { Truck } from './truck.js'
import {
  STATES,
  EVENTS,
  createRaid,
  advance,
  carryLimit,
  summary,
} from './raid.js'
import {
  buildRoadGraph,
  nearestRoadPoint,
  planRoute,
  wanderRoute,
} from './roadgraph.js'
import { KEEP } from './landmarks.js'
import { addItem, useItem, loadInventory, saveInventory } from './inventory.js'
import {
  worldToUnit,
  unitToWorld,
  unitToLatLon,
  formatLatLon,
  pointSegmentDistance,
} from './coords.js'
import { setSnapResolution } from './ps1.js'
import { mulberry32 } from './rng.js'

// Same files the Scaduscope reads; baked by scripts/fetch_bull_valley.cjs.
const DATA_BASE = '/data/bull-valley'

const PICKUP_LABEL = {
  cigarettes: 'Cigarettes ×3',
  joints: 'Joints ×2',
  cabbage: 'Cabbage',
}

async function boot() {
  const root = document.getElementById('bv-root')
  const hud = new Hud(root)
  hud.showIntro(true, false)
  hud.beginBtn.disabled = true
  hud.beginBtn.textContent = 'Resolving Terrain…'

  let geo
  let terrain
  try {
    ;[geo, terrain] = await Promise.all([
      fetch(`${DATA_BASE}/geo.json`).then((r) => {
        if (!r.ok) throw new Error(`geo.json ${r.status}`)
        return r.json()
      }),
      loadTerrain(`${DATA_BASE}/terrain.png`),
    ])
  } catch (err) {
    console.error('Cabbage Wars failed to load its terrain data:', err)
    hud.beginBtn.textContent = 'The Valley Will Not Resolve'
    return
  }

  const field = createHeightField(terrain, geo)
  const heightAt = (x, z) => field.sample(x, z)

  // --- Scene -------------------------------------------------------------
  const renderer = new THREE.WebGLRenderer({
    canvas: hud.canvas,
    antialias: false,
    powerPreference: 'high-performance',
  })
  renderer.setPixelRatio(1)

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
  const sky = new THREE.Group()
  const starRng = mulberry32(0x57a25)
  const starPositions = new Float32Array(700 * 3)
  for (let i = 0; i < 700; i++) {
    const az = starRng() * Math.PI * 2
    const el = Math.asin(starRng() * 0.95 + 0.05)
    const r = 1200
    starPositions[i * 3] = Math.cos(el) * Math.sin(az) * r
    starPositions[i * 3 + 1] = Math.sin(el) * r
    starPositions[i * 3 + 2] = Math.cos(el) * Math.cos(az) * r
  }
  const starGeo = new THREE.BufferGeometry()
  starGeo.setAttribute('position', new THREE.BufferAttribute(starPositions, 3))
  sky.add(
    new THREE.Points(
      starGeo,
      new THREE.PointsMaterial({
        color: '#aab6cf',
        size: 2,
        sizeAttenuation: false,
        fog: false,
        transparent: true,
        opacity: 0.75,
      })
    )
  )
  const moonCanvas = document.createElement('canvas')
  moonCanvas.width = 64
  moonCanvas.height = 64
  const mctx = moonCanvas.getContext('2d')
  const mgrad = mctx.createRadialGradient(32, 32, 6, 32, 32, 30)
  mgrad.addColorStop(0, 'rgba(226, 232, 240, 0.95)')
  mgrad.addColorStop(0.45, 'rgba(190, 205, 228, 0.35)')
  mgrad.addColorStop(1, 'rgba(190, 205, 228, 0)')
  mctx.fillStyle = mgrad
  mctx.fillRect(0, 0, 64, 64)
  const moon = new THREE.Sprite(
    new THREE.SpriteMaterial({
      map: new THREE.CanvasTexture(moonCanvas),
      fog: false,
      transparent: true,
      depthWrite: false,
    })
  )
  moon.position.set(450, 750, -680)
  moon.scale.setScalar(170)
  sky.add(moon)
  scene.add(sky)

  // --- Systems -----------------------------------------------------------
  // The shadowmen are parked until after the MVP loop; src/shadowmen.js and
  // src/nerves.js stay in the tree, unwired.
  const graph = buildRoadGraph(geo.roads, geo.metres)
  const truck = new Truck({ scene, heightAt })

  // Park Matthew Marx's Chevy at the road nearest the spawn station, already
  // pointed down tonight's joyride.
  const spawnStation = world.spawnStation
  const truckPoint = nearestRoadPoint(graph, spawnStation.x, spawnStation.z)
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
  }
  // Spawn on the forecourt between the station and the truck, facing the
  // truck — clear of the building, which sits behind the pumps.
  {
    const dx = truck.x - spawnStation.x
    const dz = truck.z - spawnStation.z
    const len = Math.hypot(dx, dz) || 1
    world.spawn.x = spawnStation.x + (dx / len) * 12
    world.spawn.z = spawnStation.z + (dz / len) * 12
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
  const scope = new Scope(hud.scopeCanvas)
  const audio = new BvAudio()

  const keep = world.landmarks.find((l) => l.n === KEEP)
  const stand = world.landmarks.find((l) => l.n !== KEEP)

  // Road segments in metres, for the readout's nearest-road line.
  const roadSegs = []
  for (const road of geo.roads) {
    if (!road.n) continue
    for (let i = 0; i < road.p.length - 1; i++) {
      roadSegs.push({
        name: road.n,
        ax: (road.p[i][0] - 0.5) * geo.metres.width,
        ay: (road.p[i][1] - 0.5) * geo.metres.height,
        bx: (road.p[i + 1][0] - 0.5) * geo.metres.width,
        by: (road.p[i + 1][1] - 0.5) * geo.metres.height,
      })
    }
  }

  // --- Game state ----------------------------------------------------------
  let inventory = loadInventory(window.localStorage)
  hud.setInventory(inventory)
  let raid = createRaid(0)
  let raidClock = 0 // advances only while the pointer is locked
  const shopStock = {
    cigarettes: CONFIG.shop.cigarettes,
    joints: CONFIG.shop.joints,
    sack: 1,
  }
  hud.setShop(shopStock)
  let time = 0
  let smokingUntil = 0
  let emberUntil = 0
  let perceptionUntil = 0
  let started = false
  let greeted = false
  let ended = false
  let inventoryOpen = false
  let nearPickup = null
  let nearExtract = null // { type: 'fuel' | 'keep', name }
  let canBoard = false
  let canBoardExtract = false
  let canUnload = false
  let readoutTimer = 0
  let roadTimer = 0
  let roadName = ''
  const ridingForward = new THREE.Vector3(0, 0, -1)

  player.onEdge = () => hud.toast('The valley ends here.')
  player.onStep = (sprinting) => audio.step(sprinting)

  const nearSpawnStation = () =>
    Math.hypot(spawnStation.x - player.pos.x, spawnStation.z - player.pos.z) <
    25

  const endRaid = () => {
    ended = true
    hud.prompt(null)
    hud.showInventory(false)
    inventoryOpen = false
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
    hud.showInventory(false)
    inventoryOpen = false
  }

  const hopOut = (toastText) => {
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
    const route = planRoute(graph, from, to)
    if (!route || route.length < 2) {
      hud.toast('You whistle into the dark. Nothing turns over.')
      return
    }
    raid = advance(raid, EVENTS.CALL_TRUCK, raidClock)
    truck.driveRoute(route)
    hud.toast('You whistle into the dark. An engine turns over, far off.')
  }

  const buy = (kind) => {
    if (raid.state !== STATES.LOADOUT || !nearSpawnStation()) return
    if (kind === 'sack') {
      const next = advance(raid, EVENTS.BUY_SACK, raidClock)
      if (next === raid || shopStock.sack < 1) return
      raid = next
      shopStock.sack = 0
      hud.setShop(shopStock)
      hud.toast('The burlap sack. Room for five.')
      return
    }
    if (shopStock[kind] < 1) {
      hud.toast('The tailgate is bare.')
      return
    }
    shopStock[kind] -= 1
    inventory = addItem(inventory, kind, 1)
    hud.setInventory(inventory)
    saveInventory(window.localStorage, inventory)
    hud.setShop(shopStock)
    audio.pickup()
    hud.toast(
      kind === 'cigarettes' ? 'One pack, pocketed.' : 'One joint, pocketed.'
    )
  }

  // --- Input ---------------------------------------------------------------
  hud.beginBtn.disabled = false
  hud.beginBtn.textContent = 'Begin the Raid'
  const startWithoutLock = () => {
    // Dev-only: headless and some embedded browsers refuse pointer lock, and
    // the valley is unwalkable without it. Never engages in production.
    if (!import.meta.env.DEV) return
    player.locked = true
    started = true
    hud.showIntro(false)
  }
  hud.beginBtn.addEventListener('click', () => {
    audio.init()
    try {
      const request = hud.canvas.requestPointerLock()
      if (request && typeof request.catch === 'function') {
        request.catch(startWithoutLock)
      }
    } catch {
      startWithoutLock()
    }
  })
  document.addEventListener('pointerlockerror', startWithoutLock)
  hud.soundBtn.addEventListener('click', () => {
    const on = hud.soundBtn.getAttribute('aria-pressed') !== 'true'
    hud.soundBtn.setAttribute('aria-pressed', String(on))
    hud.soundBtn.textContent = on ? 'Sound On' : 'Sound Off'
    audio.setMuted(!on)
  })

  document.addEventListener('pointerlockchange', () => {
    const locked = document.pointerLockElement === hud.canvas
    player.locked = locked
    if (locked) {
      started = true
      hud.showIntro(false)
      if (!greeted) {
        greeted = true
        hud.toast('Matthew Marx keeps the engine running.')
      }
    } else if (started && !ended) {
      hud.showIntro(true, true)
    }
  })
  document.addEventListener('mousemove', (e) => {
    player.handleMouse(e.movementX, e.movementY)
  })

  const useKind = (kind) => {
    if (kind === 'cigarettes' && time < smokingUntil) return
    const result = useItem(inventory, kind)
    if (!result.used) {
      hud.toast(
        kind === 'cigarettes' ? 'No cigarettes left.' : 'No joints left.'
      )
      return
    }
    inventory = result.inv
    hud.setInventory(inventory)
    saveInventory(window.localStorage, inventory)
    audio.use(kind)
    if (kind === 'cigarettes') {
      smokingUntil = time + CONFIG.items.cigaretteSeconds
      emberUntil = smokingUntil + CONFIG.items.emberSeconds
      hud.toast('You light a cigarette. Breathe.')
    } else {
      perceptionUntil = time + CONFIG.items.perceptionSeconds
      hud.toast('You spark the joint. The valley sharpens.')
    }
  }

  const takePickup = () => {
    if (!nearPickup) return
    if (nearPickup.kind === 'cabbage') {
      const next = advance(raid, EVENTS.PICK_CABBAGE, raidClock)
      if (next === raid) {
        hud.toast('Your arms are full.')
        return
      }
      raid = next
      nearPickup.taken = true
      nearPickup.mesh.visible = false
      audio.pickup()
      hud.toast('Taken: Cabbage')
    } else {
      nearPickup.taken = true
      nearPickup.mesh.visible = false
      inventory = addItem(inventory, nearPickup.kind, nearPickup.count)
      hud.setInventory(inventory)
      saveInventory(window.localStorage, inventory)
      audio.pickup()
      hud.toast(`Taken: ${PICKUP_LABEL[nearPickup.kind]}`)
    }
    nearPickup = null
    hud.prompt(null)
  }

  const interact = () => {
    if (raid.state === STATES.RIDING) {
      hopOut('Boots on gravel. The truck rolls on.')
      return
    }
    if (canBoard) {
      boardTruck()
      return
    }
    if (canBoardExtract) {
      raid = advance(raid, EVENTS.BOARD_TRUCK, raidClock, { arrived: true })
      if (raid.state === STATES.EXTRACTED) endRaid()
      return
    }
    if (canUnload) {
      const count = raid.carrying
      raid = advance(raid, EVENTS.DELIVER, raidClock)
      audio.pickup()
      hud.toast(
        `The stand takes your ${count === 1 ? 'cabbage' : `${count} cabbages`}. Somewhere, gratitude.`
      )
      return
    }
    if (nearExtract) {
      raid = advance(
        raid,
        nearExtract.type === 'keep' ? EVENTS.EXTRACT_KEEP : EVENTS.EXTRACT_FUEL,
        raidClock,
        nearExtract.name
      )
      if (raid.state === STATES.EXTRACTED) endRaid()
      return
    }
    takePickup()
  }

  document.addEventListener('keydown', (e) => {
    if (!player.locked || ended) return
    player.handleKey(e.code, true)
    if (e.code === 'Tab') {
      e.preventDefault()
      inventoryOpen = hud.showInventory(!inventoryOpen)
      hud.showShop(raid.state === STATES.LOADOUT && nearSpawnStation())
    } else if (e.code === 'KeyQ') {
      scope.toggle()
    } else if (e.code === 'Digit1') {
      useKind('cigarettes')
    } else if (e.code === 'Digit2') {
      useKind('joints')
    } else if (e.code === 'Digit3') {
      buy('cigarettes')
    } else if (e.code === 'Digit4') {
      buy('joints')
    } else if (e.code === 'Digit5') {
      buy('sack')
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
    setSnapResolution(iw, ih)
  }
  window.addEventListener('resize', resize)
  resize()

  // --- Loop ----------------------------------------------------------------
  let last = performance.now()
  renderer.setAnimationLoop(() => {
    const now = performance.now()
    const dt = Math.min(0.05, (now - last) / 1000)
    last = now
    time += dt
    if (player.locked && !ended) raidClock += dt

    const smoking = time < smokingUntil
    const ember = time < emberUntil
    const perception = time < perceptionUntil

    // The truck leaves on the timer whether you're aboard or not.
    if (raid.state === STATES.LOADOUT && raidClock > raid.loadoutEndsAt) {
      raid = advance(raid, EVENTS.TIMER_EXPIRED, raidClock)
      truckLeaves()
      hud.toast('Taillights. The truck leaves without you.')
      hud.showShop(false)
    }

    let forward = ridingForward
    if (raid.state === STATES.RIDING) {
      // The one place the camera leaves player.update(): ride the bed with
      // free look, keeping player.pos honest for the readout and scope.
      const truckState = truck.update(dt)
      const seat = truck.bedSeat()
      player.relocate(seat.x, seat.z, player.yaw)
      camera.position.set(seat.x, seat.y, seat.z)
      camera.rotation.set(player.pitch, player.yaw, 0)
      ridingForward.set(-Math.sin(player.yaw), 0, -Math.cos(player.yaw))
      if (truckState.done) {
        hopOut('End of the line. Marx lights a cigarette.')
      }
    } else {
      const playerState = player.update(dt, {
        speedScale:
          (scope.raised ? CONFIG.player.scopeSpeedScale : 1) *
          (smoking ? 0.85 : 1),
        swayAmp: 0,
        driftAmp: perception ? 0.5 : 0,
      })
      forward = playerState.forward
      truck.update(dt)
    }

    const timers = []
    if (raid.state === STATES.LOADOUT) {
      const left = Math.max(0, Math.ceil(raid.loadoutEndsAt - raidClock))
      const mm = Math.floor(left / 60)
      const ss = String(left % 60).padStart(2, '0')
      timers.push(`Truck leaves ${mm}:${ss}`)
    }
    if (smoking) timers.push(`Smoking ${Math.ceil(smokingUntil - time)}s`)
    else if (ember) timers.push(`Ember ${Math.ceil(emberUntil - time)}s`)
    if (perception)
      timers.push(`Perception ${Math.ceil(perceptionUntil - time)}s`)
    hud.setTimers(timers)

    audio.update(dt)
    scope.draw(dt, {
      contacts: [],
      forward,
      nerves: 0,
      perception,
    })

    // --- Interactions: what E would do right now -------------------------
    canBoard = false
    canBoardExtract = false
    canUnload = false
    nearExtract = null
    nearPickup = null
    let prompt = null
    if (!ended && raid.state === STATES.RIDING) {
      prompt = 'E — Hop Out'
    } else if (!ended && raid.state !== STATES.EXTRACTED) {
      const truckClose =
        truck.distanceTo(player.pos.x, player.pos.z) < CONFIG.truck.boardRange
      if (raid.state === STATES.LOADOUT && truckClose) {
        canBoard = true
        prompt = 'E — Climb into the Bed'
      } else if (
        raid.state === STATES.ON_FOOT &&
        raid.truckCalled &&
        !truck.moving &&
        truckClose
      ) {
        canBoardExtract = true
        prompt = 'E — Board (End the Raid)'
      } else if (
        raid.state === STATES.ON_FOOT &&
        raid.carrying > 0 &&
        stand &&
        Math.hypot(stand.x - player.pos.x, stand.z - player.pos.z) <
          CONFIG.cabbage.dropRadius
      ) {
        canUnload = true
        prompt = `E — Unload ${raid.carrying} ${raid.carrying === 1 ? 'Cabbage' : 'Cabbages'}`
      } else if (raid.state === STATES.ON_FOOT) {
        // Extraction: any station but the spawn, or the Keep.
        for (const f of world.fuelPoints) {
          if (f === spawnStation) continue
          if (
            Math.hypot(f.x - player.pos.x, f.z - player.pos.z) <
            CONFIG.extract.fuelRadius
          ) {
            nearExtract = { type: 'fuel', name: f.name }
            prompt = `E — End the Raid at ${f.name || 'the Station'}`
            break
          }
        }
        if (
          !nearExtract &&
          keep &&
          Math.hypot(keep.x - player.pos.x, keep.z - player.pos.z) <
            CONFIG.extract.keepRadius
        ) {
          nearExtract = { type: 'keep' }
          prompt = "E — End the Raid at Mt. Coleman's Keep"
        }
      }
      if (!prompt) {
        // Pickups: pulse, and offer the nearest within reach.
        let bestPickup = 2.6
        for (const pickup of world.pickups) {
          if (pickup.taken) continue
          pickup.mesh.material.emissiveIntensity =
            0.35 + Math.sin(time * 3) * 0.2
          const d = Math.hypot(pickup.x - player.pos.x, pickup.z - player.pos.z)
          if (d < bestPickup) {
            bestPickup = d
            nearPickup = pickup
          }
        }
        if (nearPickup) prompt = `E — Take ${PICKUP_LABEL[nearPickup.kind]}`
      }
    }
    hud.prompt(player.locked && !ended ? prompt : null)

    // Readout, throttled.
    readoutTimer -= dt
    roadTimer -= dt
    if (roadTimer <= 0) {
      roadTimer = 1
      roadName = ''
      let bestRoad = 14
      for (const seg of roadSegs) {
        const d = pointSegmentDistance(
          player.pos.x,
          player.pos.z,
          seg.ax,
          seg.ay,
          seg.bx,
          seg.by
        )
        if (d < bestRoad) {
          bestRoad = d
          roadName = seg.name
        }
      }
    }
    if (readoutTimer <= 0) {
      readoutTimer = 0.25
      const { u, v } = worldToUnit(player.pos.x, player.pos.z, geo.metres)
      hud.setReadout({
        pos: formatLatLon(unitToLatLon(u, v, geo.bbox)),
        clock: new Date().toLocaleTimeString('en-US', {
          hour12: false,
          timeZone: 'America/Chicago',
        }),
        road: roadName,
        cabbages: `${raid.carrying}/${carryLimit(raid)} · ${raid.delivered} delivered`,
      })
    }

    sky.position.set(player.pos.x, 0, player.pos.z)
    renderer.render(scene, camera)
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
      teleport(u, v) {
        const { x, z } = unitToWorld(u, v, geo.metres)
        player.relocate(x, z)
      },
      hurryTruck(seconds = 5) {
        raid = { ...raid, loadoutEndsAt: raidClock + seconds }
      },
    }
  }
}

boot()
