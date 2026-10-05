import * as THREE from 'three'
import './styles.css'
import { authReturnOf, devSignInUrl, stripAuthQuery } from './account.ts'
import { openAccountPanel } from './accountpanel.ts'
import { buildSky, pulseMaterials } from './assets.ts'
import { BvAudio } from './audio.ts'
import { fetchMe, refreshSession, signOut } from './auth.ts'
import { actionOf, cycleStep, PACK, WORLD } from './bindings.ts'
import { ringItems, stepIndex, syncIndex } from './carousel.ts'
import { loadCharacter } from './characters.ts'
import { mountCharacterSelect } from './characterselect.ts'
import { CHAT_COPY } from './chat.ts'
import { CONFIG } from './config.ts'
import { unitToWorld } from './coords.ts'
import { finishById, loadFinish } from './finishes.ts'
import { createGlow } from './glow.ts'
import { Hud } from './hud.ts'
import {
  interactionPrompt,
  pickupLabel,
  resolveInteraction,
} from './interactions.ts'
import { addItem, loadInventory, saveInventory, useItem } from './inventory.ts'
import { createInventoryView } from './inventoryview.ts'
import { cigaretteToSmoke, getItem, isCigarette, itemById } from './items.ts'
import { KEEP } from './landmarks.ts'
import { MistCards } from './mistcards.ts'
import { NetClient, socketUrl } from './net.ts'
import { Peers } from './peers.ts'
import { Player } from './player.ts'
import { PlayerBody } from './playerbody.ts'
import { poseOf, stateChanged } from './presence.ts'
import { CLOSE, normalizeChat } from './protocol.ts'
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
import { ShadowCards } from './shadowcards.ts'
import { buy as buyItem, settle } from './shop.ts'
import { mountAccountStep } from './signin.ts'
import { mountCard, showSplash, skipTitles } from './splash.ts'
import { facingInView, formatCash, freshStock, insideStore } from './store.ts'
import { buildTerrainMesh, createHeightField, loadTerrain } from './terrain.ts'
import { Truck } from './truck.ts'
import { buildWorld } from './world.ts'
import type { CharacterPick } from './characters.ts'
import type { ChatLine } from './chat.ts'
import type { DailyStatus, Interaction, ShelfSpot } from './interactions.ts'
import type { Geo, Raid, RingItem, Vec3 } from './interfaces.ts'
import type { NetStatus } from './net.ts'
import type { Peer } from './presence.ts'
import type {
  DailyMessage,
  DailyWire,
  NackMessage,
  PeerStateWire,
  RaidMessage,
  RaidWire,
} from './protocol.ts'
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
  shadowmen: ShadowCards
  mist: MistCards
  readonly raid: Raid
  net: {
    readonly status: NetStatus
    readonly id: string | null
    peers(): Peer[]
  }
  // The shared raid as the valley last sent it; null offline.
  readonly shared: RaidWire | null
  // The berry bush as the valley last described it; null offline.
  readonly daily: DailyWire | null
  readonly aboard: boolean
  // What the glow rings right now (glow.ts); null for nothing.
  readonly glow: THREE.Object3D | null
  // In cents.
  readonly cash: number
  // The chat log, oldest first.
  readonly chat: readonly ChatLine[]
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

// The username a dev build signs in under when ?skipSplash finds no session.
const DEV_USERNAME = 'Raider'

// What the titles settle: the outfit chosen at the select, the username of
// the account it raids under, and word of a link round trip that landed on
// the page (a blocked popup falls back to one), to show once in the valley.
type Titles = CharacterPick & { username: string; notice: string | null }

// Colophon → logo → account step → character select; resolves with the
// chosen outfit and the username. The select, the account step, and the logo mount first,
// black and inert, so the cards above them stack in DOM order and each
// reveal uncovers the next. Who is signed in is asked at once and is known
// long before the logo lifts. A page reached from a sign-in round trip
// (?auth=, set by the Worker) skips the colophon and the logo: the raider
// has seen them already.
async function showTitles(audio: BvAudio): Promise<Titles> {
  const { pathname, search, hash } = window.location
  const returned = authReturnOf(search)
  if (returned) {
    history.replaceState(null, '', pathname + stripAuthQuery(search) + hash)
  }
  const me = fetchMe()
  const skip = skipTitles()
  // A signed-in raider's round trip was a link; a signed-out one's error
  // belongs on the sign-in card instead.
  const noticeFor = (signedIn: boolean): string | null => {
    if (!returned || !signedIn) return null
    if ('error' in returned) return returned.error
    return returned.auth === 'linked' ? 'Linked.' : null
  }
  if (skip) {
    const known = await me
    const username = known?.account?.username
    if (username) {
      return {
        outfit: loadCharacter(window.localStorage),
        username,
        notice: noticeFor(true),
      }
    }
    // Sign a dev raider in and come back, once; a second miss (the name
    // taken by another dev account) falls through to the account step.
    if (!returned) {
      window.location.assign(
        devSignInUrl({
          userId: 'dev-user',
          username: DEV_USERNAME,
          redirect: window.location.pathname + window.location.search,
        })
      )
      return new Promise<Titles>(() => {})
    }
  }
  const select = mountCharacterSelect({
    storage: window.localStorage,
    config: { ...CONFIG.select, downscale: CONFIG.render.downscale },
    onAccount: () => {
      void openAccountPanel({ onSignOut: signOutAndReload })
    },
    onSignOut: signOutAndReload,
  })
  const account = mountAccountStep()
  if (!skip && !returned) {
    const logo = mountCard({
      audio,
      config: CONFIG.logo,
      fog: { downscale: CONFIG.render.downscale },
    })
    await showSplash({ audio, config: CONFIG.splash })
    logo.start()
    await logo.done
  }
  const known = await me
  const signedIn = !!known?.account?.username
  const username = await account.run(
    known,
    !signedIn && returned && 'error' in returned ? returned.error : null
  )
  return {
    ...(await select.run(username)),
    username,
    notice: noticeFor(signedIn),
  }
}

// Sign out, then start over at the sign-in card.
function signOutAndReload(): void {
  void signOut().then(() => window.location.reload())
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
  const graph = buildRoadGraph(geo.roads, geo.metres)
  // The truck and the player stand on the ground (roads and lots included),
  // never on the bare terrain.
  const truck = new Truck({ scene, groundAt: world.ground.at })

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
    groundAt: world.ground.at,
    collide: world.walls.resolve,
    metres: geo.metres,
    spawn: world.spawn,
  })
  const pick = await titles
  if (pick.notice) hud.toast(pick.notice)
  const playerBody = new PlayerBody(
    scene,
    pick.outfit,
    finishById(loadFinish(window.localStorage)).color
  )
  const scope = new Scope(hud.scopeCanvas, hud.phone)
  // The shadowmen feed the scope; nerves and the audio static stay parked
  // (src/nerves.ts is in the tree, unwired).
  const shadowmen = new ShadowCards({
    scene,
    groundAt: world.ground.at,
    metres: geo.metres,
    havens: world.fuelPoints,
    player: player.pos,
  })
  // Ground mist drifts around the player; under prefers-reduced-motion it
  // holds still, like the logo card's fog.
  const mist = new MistCards({
    scene,
    groundAt: world.ground.at,
    player: player.pos,
    still: window.matchMedia('(prefers-reduced-motion: reduce)').matches,
  })
  // The ring around whatever E would act on; it holds its pulse still
  // under prefers-reduced-motion too.
  const glow = createGlow(
    renderer,
    scene,
    window.matchMedia('(prefers-reduced-motion: reduce)').matches
  )

  // --- The valley server -------------------------------------------------
  // Everyone online shares one valley. The socket is same-origin and the
  // session cookie says who we are; if the server is down or unreachable
  // the valley is simply empty, and the raid plays as it always has.
  const peers = new Peers(scene)
  const net = new NetClient({
    url: socketUrl(window.location, import.meta.env.DEV),
    config: CONFIG.net,
    beforeOpen: () => refreshSession(),
  })
  // A lost session is not a lost signal: send the raider back to sign in.
  net.onRefused((code) => {
    if (code !== CLOSE.unauthenticated) return
    hud.toast('Signed out. Sign in again to raid.')
    setTimeout(() => window.location.reload(), CONFIG.net.signedOutReloadMs)
  })
  net.on((msg) => {
    const now = performance.now()
    switch (msg.type) {
      case 'welcome': {
        peers.welcome(msg.peers, now)
        const n = msg.peers.length
        if (n > 0) {
          hud.toast(
            n === 1 ? 'One other in the valley.' : `${n} others in the valley.`
          )
        }
        return
      }
      case 'peer-joined':
        peers.joined(msg.peer, now)
        hud.toast(`${msg.peer.name} is in the valley.`)
        return
      case 'peer-state': {
        const { x, y, z, yaw, pose, riding } = msg
        peers.state(msg.id, { x, y, z, yaw, pose, riding }, now)
        return
      }
      case 'peer-left': {
        const name = peers.table.get(msg.id)?.name
        peers.left(msg.id)
        if (name) hud.toast(`${name} is gone.`)
        return
      }
      case 'chat':
        hud.chatLine({ kind: 'say', name: msg.name, text: msg.text }, now)
        return
      case 'error':
        console.warn('Valley:', msg.code, msg.message)
        return
      case 'pong':
        return
    }
  })
  let wasOnline = false
  net.onStatus((status) => {
    if (status === 'online') {
      wasOnline = true
    } else if (status === 'offline') {
      peers.clear()
      if (wasOnline) hud.toast('Signal lost. The valley goes quiet.')
    }
  })
  // Not awaited: the game never waits on the network.
  void net.connect({
    outfit: pick.outfit,
    pickups: world.pickups.length,
    stations: world.fuelPoints.length,
  })

  const keep = world.landmarks.find((l) => l.n === KEEP)
  const stand = world.landmarks.find((l) => l.n !== KEEP)

  // --- Game state ----------------------------------------------------------
  let inventory = loadInventory(window.localStorage)
  // The cigarette a bare 1 smokes: the last one picked in the inventory.
  let selectedCigarette: string | null = null
  let raid = createRaid(0)
  let raidClock = 0 // advances only while the pointer is locked
  // Every player starts every raid with the same cash, in cents, and every
  // Citgo with full shelves (one stock per station, like world.fuelPoints).
  let cash = CONFIG.store.startingCash
  let storeStock = freshStock(world.fuelPoints.length)
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
  // The static after a shadowman's touch runs until this local ms
  // (performance.now). It is wall-clock, not `time`: `time` advances at most
  // CONFIG.render.maxStep a frame, so on a slow machine 1.6 s of it can take
  // half a minute, and the player would sit in static the whole while.
  let strikeUntil = 0
  let started = false
  let greeted = false
  let ended = false
  let inventoryOpen = false
  // What E would do right now; resolved every frame in the loop.
  let interaction: Interaction<Pickup> | null = null
  // The last state frame sent to the valley, and time since.
  let lastSent: PeerStateWire | null = null
  let sinceSent = 0
  // The shared raid, once the valley has answered. Null offline, where the
  // raid is this player's alone and runs as it always has.
  let shared: RaidWire | null = null
  // Standing in the bed during the lobby, waiting on the others.
  let aboard = false
  // Pickups asked of the valley and not yet answered.
  const pendingTakes = new Set<number>()
  // Shelf units asked of the valley and not yet answered, as station:kind.
  const pendingBuys = new Set<string>()
  // The berry bush as the valley last described it (the welcome, then
  // every daily frame); null offline. The day's berry is the valley's.
  let daily: DailyWire | null = null
  // A berry asked of the valley and not yet answered.
  let pendingCollect = false
  const ridingForward = new THREE.Vector3(0, 0, -1)

  player.onEdge = () => hud.toast('The valley ends here.')

  // Rebuild the ring after anything that changes what you carry, keeping
  // the selection on the same kind.
  const refreshRing = () => {
    ring = ringItems(inventory, raid)
    ringIndex = syncIndex(ring, ringKind, ringIndex)
    ringKind = ring[ringIndex]?.kind ?? null
    hud.setCarousel({ items: ring, index: ringIndex })
  }

  // The countdown, with the lobby's headcount when others are in it.
  const lobbyLine = () => {
    const clock = loadoutClock(raid, raidClock)
    if (!shared) return clock
    const lobby = shared.members.filter((m) => m.phase === 'LOBBY')
    if (lobby.length < 2) return clock
    const boarded = lobby.filter((m) => m.boarded).length
    return `${clock} · ${boarded} of ${lobby.length} aboard`
  }

  const truckStatus = () => {
    if (raid.state === STATES.LOADOUT) return `Leaves in ${lobbyLine()}`
    if (raid.state === STATES.RIDING) return 'Riding the bed'
    if (raid.truckCalled) return 'On its way'
    return shared?.call ? 'On a call' : 'Gone'
  }

  // Which bed seat is ours: by boarding order in the lobby, by the
  // valley's rider order once it has left.
  const mySeat = () => {
    const me = net.id
    if (!shared || me === null) return 0
    const order =
      shared.phase === 'LOBBY'
        ? shared.members.filter((m) => m.boarded).map((m) => m.id)
        : shared.riders
    return Math.max(0, order.indexOf(me))
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
    if (shared && raid.extract)
      net.send({ type: 'extract', kind: raid.extract })
  }

  const truckLeaves = () => {
    truck.driveRoute(departRoute)
  }

  const boardTruck = () => {
    if (shared) {
      // In the valley the truck waits for everyone in the lobby, or for
      // the clock. Boarding is a word to the server; the raid frame that
      // comes back moves the raid.
      if (aboard || raid.state !== STATES.LOADOUT) return
      aboard = true
      net.send({ type: 'board' })
      hud.toast('You climb into the bed.')
      closeInventory()
      return
    }
    const next = advance(raid, EVENTS.BOARD_TRUCK, raidClock)
    if (next === raid) return
    raid = next
    truckLeaves()
    hud.toast('You climb into the bed. Marx pulls out.')
    hud.toast('E hops out. Anywhere you like.')
    closeInventory()
  }

  const hopOut = (toastText?: string) => {
    if (aboard) {
      // Back off the bed before it leaves.
      aboard = false
      net.send({ type: 'unboard' })
      const spot = truck.hopOutSpot()
      player.relocate(spot.x, spot.z, player.yaw)
      if (toastText) hud.toast(toastText)
      return
    }
    const next = advance(raid, EVENTS.HOP_OUT, raidClock)
    if (next === raid) return
    raid = next
    const spot = truck.hopOutSpot()
    player.relocate(spot.x, spot.z, player.yaw)
    if (toastText) hud.toast(toastText)
    if (shared) net.send({ type: 'hop-out' })
  }

  // A shadowman touched you. Static, then you come to on the forecourt.
  const strike = () => {
    const next = advance(raid, EVENTS.STRUCK, raidClock)
    if (next === raid) return
    raid = next
    strikeUntil = performance.now() + CONFIG.shadowmen.strikeSeconds * 1000
    hud.showStatic(true)
    closeInventory()
    player.keys.clear()
    player.relocate(world.spawn.x, world.spawn.z, world.spawn.yaw)
    hud.toast('You are somewhere else. Time is missing.')
  }

  const callTruck = () => {
    if (raid.state !== STATES.ON_FOOT || raid.truckCalled) return
    if (shared?.call) {
      hud.toast('Marx is already on a call.')
      return
    }
    const from = nearestRoadPoint(graph, truck.x, truck.z)
    const to = nearestRoadPoint(graph, player.pos.x, player.pos.z)
    const route = from && to ? planRoute(graph, from, to) : null
    if (!from || !to || !route || route.length < 2) {
      hud.toast('You whistle into the dark. Nothing turns over.')
      return
    }
    if (shared) {
      // One whistle for the whole valley; the raid frame drives the truck.
      net.send({
        type: 'call',
        from: { x: from.x, z: from.z },
        to: { x: to.x, z: to.z },
      })
      return
    }
    raid = advance(raid, EVENTS.CALL_TRUCK, raidClock)
    truck.driveRoute(route)
    hud.toast('You whistle into the dark. An engine turns over, far off.')
  }

  // The buyer's side of a sale, once the unit is ours.
  const pocket = (kind: string) => {
    const { next, toast } = settle({ raid, inventory, cash }, kind, raidClock)
    if (next) {
      const inventoryChanged = next.inventory !== inventory
      raid = next.raid
      inventory = next.inventory
      cash = next.cash
      if (inventoryChanged) saveInventory(window.localStorage, inventory)
      refreshRing()
    }
    if (toast) hud.toast(toast)
  }

  const buy = (shelf: ShelfSpot) => {
    const { next, toast } = buyItem(
      { raid, stock: storeStock, inventory, cash },
      shelf.station,
      shelf.item,
      raidClock
    )
    if (!next) {
      if (toast) hud.toast(toast)
      return
    }
    if (shared) {
      // The shelf is the valley's: ask, and pocket the unit when the
      // valley says it was still there. The judgement above (stock as
      // last heard, cash, the sack) stands; the valley settles the race.
      const key = `${shelf.station}:${shelf.item}`
      if (pendingBuys.has(key)) return
      pendingBuys.add(key)
      net.send({ type: 'buy', station: shelf.station, kind: shelf.item })
      return
    }
    const inventoryChanged = next.inventory !== inventory
    raid = next.raid
    storeStock = [...next.stock]
    inventory = next.inventory
    cash = next.cash
    if (inventoryChanged) saveInventory(window.localStorage, inventory)
    refreshRing()
    if (toast) hud.toast(toast)
  }

  // How the bush stands for this player right now. The valley's word is
  // read against the valley's clock, so once midnight Central passes the
  // berry is back before the valley is asked again.
  const dailyStatus = (): DailyStatus => {
    if (!net.online || !daily) return 'offline'
    const now = net.clock.serverNow(performance.now())
    return daily.collected && now < daily.resetsAt ? 'picked' : 'ready'
  }

  // E at the bush: ask the valley for today's berry, or say why not.
  const collectBerry = (status: DailyStatus) => {
    if (status === 'offline') {
      hud.toast('No signal. The bush keeps its berries.')
      return
    }
    if (status === 'picked') {
      hud.toast('Picked clean. The bush fills again at midnight.')
      return
    }
    if (pendingCollect) return
    pendingCollect = true
    net.send({ type: 'collect' })
  }

  // The valley's answer: a berry into the pack, or not today.
  const applyDaily = (msg: DailyMessage) => {
    pendingCollect = false
    daily = msg.daily
    if (!msg.picked) {
      hud.toast('Picked clean. The bush fills again at midnight.')
      return
    }
    inventory = addItem(inventory, 'berries', 1)
    saveInventory(window.localStorage, inventory)
    refreshRing()
    hud.toast(getItem('berries').collected)
  }

  // The store the player stands inside, as an index into world.fuelPoints,
  // or -1 outside every one.
  const storeIndex = () =>
    world.fuelPoints.findIndex((station) =>
      insideStore(station, player.pos.x, player.pos.z)
    )

  // The shelf facing in view inside a store, for the interaction resolver.
  const look = new THREE.Vector3()
  const shelfInView = (station: number): ShelfSpot | null => {
    if (station < 0) return null
    camera.getWorldDirection(look)
    const eye: Vec3 = [camera.position.x, camera.position.y, camera.position.z]
    // A sack in hand is one too many: the shelf stops offering it.
    const stock = raid.sack
      ? { ...storeStock[station], sack: 0 }
      : storeStock[station]
    const facing = facingInView(world.facings[station], stock, eye, [
      look.x,
      look.y,
      look.z,
    ])
    const item = facing ? itemById(facing.kind) : null
    if (!item || item.price === undefined) return null
    return {
      item: item.id,
      station,
      price: item.price,
      affordable: cash >= item.price,
    }
  }

  // What the glow rings for an interaction: the pickup, the shelf unit a
  // buy would take, or the bush while today's berry is on it. Nothing for
  // the truck, the stand, or an extraction.
  const glowTarget = (
    action: Interaction<Pickup> | null
  ): THREE.Object3D | null => {
    switch (action?.kind) {
      case 'pickup':
        return action.pickup.mesh
      case 'buy':
        return world.shelves.unitFor(
          action.station,
          action.item,
          storeStock[action.station]?.[action.item] ?? 0
        )
      case 'collect':
        return action.status === 'ready' ? world.bushObject : null
      default:
        return null
    }
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
    // Keys held when focus left never send keyup. Esc while typing drops
    // the lock too, and the draft with it.
    if (!locked) {
      player.keys.clear()
      hud.closeChat()
    }
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

  // The pickup is ours: into the arms or the pack.
  const applyTake = (pickup: Pickup) => {
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

  // Someone else got it.
  const markTaken = (pickup: Pickup) => {
    pickup.taken = true
    pickup.mesh.visible = false
  }

  const takePickup = (pickup: Pickup) => {
    if (!shared) {
      applyTake(pickup)
      return
    }
    // Pickups are shared by index: ask, and take it when the valley says
    // it is ours. A full pair of arms is refused here, not there.
    const index = world.pickups.indexOf(pickup)
    if (index < 0 || pendingTakes.has(index)) return
    if (
      pickup.kind === 'cabbage' &&
      advance(raid, EVENTS.PICK_CABBAGE, raidClock) === raid
    ) {
      hud.toast('Your arms are full.')
      return
    }
    pendingTakes.add(index)
    net.send({ type: 'take', index })
  }

  // --- The shared raid -----------------------------------------------------
  // Every change to the valley's raid arrives as a whole snapshot and a
  // reason. The local raid machine still holds what is ours (the arms, the
  // deliveries, the sack); the snapshot moves it through the shared
  // moments: the truck leaving, a pickup going, a whistle answered.
  const applyRaid = (
    wire: RaidWire | null,
    reason: RaidMessage['reason'],
    detail: Pick<RaidMessage, 'by' | 'index' | 'station' | 'item'> = {}
  ) => {
    const { by, index, station, item } = detail
    const previous = shared
    shared = wire
    if (!wire) return
    const me = net.id

    // The lobby clock, in raidClock seconds.
    raid = {
      ...raid,
      loadoutEndsAt: (wire.loadoutEndsAt - wire.startedAt) / 1000,
    }

    if (reason === 'taken' && index !== undefined) {
      pendingTakes.delete(index)
      const pickup = world.pickups[index]
      if (pickup && !pickup.taken) {
        if (by === me) applyTake(pickup)
        else markTaken(pickup)
      }
    }
    // Whatever else is gone, is gone.
    for (const i of wire.taken) {
      const pickup = world.pickups[i]
      if (pickup && !pickup.taken) markTaken(pickup)
    }

    // The shelves are the valley's; a unit it sold us goes in the pocket.
    if (reason === 'bought' && station !== undefined && item) {
      pendingBuys.delete(`${station}:${item}`)
      if (by === me) pocket(item)
    }
    storeStock = wire.shelves

    // The truck left: with us, or without us, or before we got here.
    const justLeft =
      wire.phase === 'OUT' &&
      (previous === null ||
        previous.epoch !== wire.epoch ||
        previous.phase === 'LOBBY')
    if (justLeft) {
      const rider = me !== null && wire.riders.includes(me)
      aboard = false
      if (raid.state === STATES.LOADOUT) {
        raid = advance(
          raid,
          rider ? EVENTS.BOARD_TRUCK : EVENTS.TIMER_EXPIRED,
          raidClock
        )
        if (rider) {
          hud.toast('Marx pulls out.')
          hud.toast('E hops out. Anywhere you like.')
        } else if (reason === 'depart') {
          hud.toast('Taillights. The truck leaves without you.')
        } else {
          hud.toast('The truck is long gone. You are on foot.')
        }
        refreshRing()
      }
      if (wire.departedAt !== null) {
        truck.driveRouteAt(departRoute, net.clock.toLocalMs(wire.departedAt))
      }
    }

    // A whistle, answered for everyone.
    const call = wire.call
    if (call && (!previous?.call || previous.call.at !== call.at)) {
      const from = nearestRoadPoint(graph, call.from.x, call.from.z)
      const to = nearestRoadPoint(graph, call.to.x, call.to.z)
      const route = from && to ? planRoute(graph, from, to) : null
      truck.parkAt(call.from.x, call.from.z, truck.dirX, truck.dirZ)
      truck.driveRouteAt(route, net.clock.toLocalMs(call.at))
      if (call.by === me) {
        raid = advance(raid, EVENTS.CALL_TRUCK, raidClock)
        hud.toast('You whistle into the dark. An engine turns over, far off.')
      } else {
        hud.toast('Far off, an engine turns over. Someone whistled.')
      }
    }

    if (reason === 'extracted' && by && by !== me) {
      const name = peers.table.get(by)?.name
      peers.left(by)
      if (name) hud.toast(`${name} made it out.`)
    }
  }

  const applyNack = (msg: NackMessage) => {
    if (msg.re === 'take') {
      if (msg.index !== undefined) {
        pendingTakes.delete(msg.index)
        const pickup = world.pickups[msg.index]
        if (pickup) markTaken(pickup)
      }
      hud.toast('Someone got there first.')
    } else if (msg.re === 'buy') {
      if (msg.station !== undefined && msg.item) {
        pendingBuys.delete(`${msg.station}:${msg.item}`)
      }
      hud.toast(
        msg.reason === 'sold-out' ? 'Sold out.' : 'The clerk shakes his head.'
      )
    } else if (msg.re === 'call') {
      hud.toast('Marx is already on a call.')
    } else if (msg.re === 'collect') {
      pendingCollect = false
      hud.toast('The bush gives you nothing.')
    } else if (msg.re === 'chat') {
      hud.chatLine(
        { kind: 'system', text: CHAT_COPY.tooFast },
        performance.now()
      )
    }
  }

  net.on((msg) => {
    if (msg.type === 'welcome') {
      applyRaid(msg.raid, 'joined', { by: msg.id })
      daily = msg.daily
    } else if (msg.type === 'raid') {
      applyRaid(msg.raid, msg.reason, msg)
    } else if (msg.type === 'nack') {
      applyNack(msg)
    } else if (msg.type === 'daily') {
      applyDaily(msg)
    }
  })
  net.onStatus((status) => {
    // The line dropped: the valley's raid is no longer ours to follow, and
    // what we hold plays on alone.
    if (status === 'offline') {
      shared = null
      aboard = false
      daily = null
      pendingCollect = false
      pendingTakes.clear()
      pendingBuys.clear()
    }
  })

  const interact = () => {
    // The raid state is live; the interaction is from the last frame.
    if (aboard) {
      hopOut('Boots on gravel. Marx waits.')
      return
    }
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
      case 'buy':
        buy(interaction)
        return
      case 'collect':
        collectBerry(interaction.status)
        return
    }
  }

  // With the inventory open the keys drive the carousel (PACK in
  // bindings.ts) and never reach the player. Esc drops pointer lock, which
  // pauses it.
  const inventoryKey = (e: KeyboardEvent) => {
    const item = ring[ringIndex]
    switch (actionOf(PACK, e.code)) {
      case 'close':
        e.preventDefault()
        closeInventory()
        return
      case 'cycle':
        cycleRing(cycleStep(e.code))
        return
      case 'use':
        if (item?.canUse) useKind(item.kind)
        return
      case 'smoke':
        useKind('smoke')
        return
      case 'spark':
        useKind('joints')
        return
    }
  }

  // One line to the valley, which echoes it back to everyone. Offline the
  // line still shows, to no one else.
  const say = (typed: string) => {
    const text = normalizeChat(typed)
    if (!text) return
    if (net.online) {
      net.send({ type: 'chat', text })
      return
    }
    const now = performance.now()
    hud.chatLine({ kind: 'say', name: pick.username, text }, now)
    hud.chatLine({ kind: 'system', text: CHAT_COPY.offline }, now)
  }

  // In the valley the keys are WORLD in bindings.ts; the movement keys go
  // to the player as held state.
  document.addEventListener('keydown', (e) => {
    if (!player.locked || ended) return
    // While typing, every key belongs to the field; Enter sends.
    if (hud.chatOpen) {
      if (e.code === 'Tab') e.preventDefault()
      if (actionOf(WORLD, e.code) === 'chat' && !e.isComposing) {
        e.preventDefault()
        say(hud.closeChat())
      }
      return
    }
    if (inventoryOpen) {
      inventoryKey(e)
      return
    }
    player.handleKey(e.code, true)
    switch (actionOf(WORLD, e.code)) {
      case 'inventory':
        e.preventDefault()
        openInventory()
        return
      case 'scope':
        scope.toggle()
        return
      case 'smoke':
        useKind('smoke')
        return
      case 'spark':
        useKind('joints')
        return
      case 'callTruck':
        callTruck()
        return
      case 'interact':
        interact()
        return
      case 'chat':
        e.preventDefault()
        player.keys.clear()
        hud.openChat()
        return
    }
  })
  document.addEventListener('keyup', (e) => player.handleKey(e.code, false))

  const resize = () => {
    const w = window.innerWidth
    const h = window.innerHeight
    const iw = Math.max(2, Math.floor(w / CONFIG.render.downscale))
    const ih = Math.max(2, Math.floor(h / CONFIG.render.downscale))
    renderer.setSize(iw, ih, false)
    glow.setSize(iw, ih)
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
    // Real seconds since the last frame, and the same capped at maxStep: the
    // capped step moves the player, the item timers, and the animation, so
    // a stalled frame never jumps them ahead.
    const elapsed = (now - last) / 1000
    const dt = Math.min(CONFIG.render.maxStep, elapsed)
    last = now
    time += dt
    // The valley is persistent: once the raid begins, the clock never pauses —
    // not for the intro overlay, not for a dropped pointer lock. The truck
    // keeps its own schedule. In the shared valley the clock is the
    // server's, read through the offset, so every player counts together.
    // Alone it is the wall clock too, never the capped step: at a few frames
    // a second the capped step would stretch the five-minute loadout into
    // half an hour.
    if (shared) {
      raidClock = Math.max(
        0,
        (net.clock.serverNow(now) - shared.startedAt) / 1000
      )
    } else if (started && !ended) {
      raidClock += elapsed
    }

    const smoking = time < smokingUntil
    const ember = time < emberUntil
    const perception = time < perceptionUntil

    // The truck leaves on the timer whether you're aboard or not. In the
    // shared valley the server's clock says when.
    if (
      !shared &&
      raid.state === STATES.LOADOUT &&
      raidClock > raid.loadoutEndsAt
    ) {
      raid = advance(raid, EVENTS.TIMER_EXPIRED, raidClock)
      truckLeaves()
      hud.toast('Taillights. The truck leaves without you.')
    }

    let forward = ridingForward
    // Where the feet stand and how, for the body and for the wire.
    let feetY: number
    let moveSpeed = 0
    let crouching = false
    if (raid.state === STATES.RIDING || aboard) {
      // The one place the camera leaves player.update(): ride the bed with
      // free look, keeping player.pos honest for the scope.
      const truckState = truck.update(dt, now)
      const seat = truck.bedSeat(mySeat())
      player.relocate(seat.x, seat.z, player.yaw)
      camera.position.set(seat.x, seat.y, seat.z)
      camera.rotation.set(player.pitch, player.yaw, 0)
      ridingForward.set(-Math.sin(player.yaw), 0, -Math.cos(player.yaw))
      // Standing in the bed.
      feetY = seat.y - CONFIG.truck.bedEye
      playerBody.update(dt, {
        x: seat.x,
        ground: feetY,
        z: seat.z,
        yaw: player.yaw,
        speed: 0,
        crouching: false,
      })
      if (truckState.done && raid.state === STATES.RIDING) {
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
      feetY = player.groundY
      moveSpeed = playerState.speed
      crouching = playerState.crouching
      playerBody.update(dt, {
        x: player.pos.x,
        ground: feetY,
        z: player.pos.z,
        yaw: player.yaw,
        speed: moveSpeed,
        crouching,
      })
      truck.update(dt, now)
    }

    // The shadowmen cross whatever the raid is doing, but only rush and touch
    // a player on foot who is not already coming to from the last strike.
    const vulnerable =
      started && !ended && raid.state === STATES.ON_FOOT && now >= strikeUntil
    const swarm = shadowmen.update({
      dt,
      player: player.pos,
      vulnerable,
      perception,
    })
    if (swarm.struck) strike()
    mist.update({ dt, player: player.pos })
    if (now < strikeUntil) hud.drawStatic()
    else if (!hud.staticWrap.hidden) hud.showStatic(false)

    // The others are drawn a beat behind the present, so two of their
    // frames always bracket the moment. Ours goes out on a fixed cadence,
    // and only when it changed.
    const renderAt = now - CONFIG.net.interpolateMs
    peers.update(dt, renderAt)
    sinceSent += dt
    if (net.online && !ended && sinceSent >= 1 / CONFIG.net.sendHz) {
      sinceSent = 0
      const state: PeerStateWire = {
        x: player.pos.x,
        y: feetY,
        z: player.pos.z,
        yaw: player.yaw,
        pose: poseOf(moveSpeed, crouching),
        riding: raid.state === STATES.RIDING || aboard,
      }
      if (stateChanged(lastSent, state)) {
        lastSent = state
        net.sendState(state)
      }
    }

    hud.setCountdown(raid.state === STATES.LOADOUT ? lobbyLine() : null)

    const timers: string[] = []
    if (smoking) timers.push(`Smoking ${Math.ceil(smokingUntil - time)}s`)
    else if (ember) timers.push(`Ember ${Math.ceil(emberUntil - time)}s`)
    if (perception)
      timers.push(`Perception ${Math.ceil(perceptionUntil - time)}s`)
    hud.setTimers(timers)
    hud.tickChat(performance.now())

    scope.draw(dt, {
      contacts: [
        ...swarm.contacts,
        ...peers.contacts(player.pos, CONFIG.scope.rangeMetres, renderAt),
      ],
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

    // The stocked shelves follow the player to the nearest store.
    world.shelves.update(player.pos.x, player.pos.z, storeStock)

    // --- Interactions: what E would do right now -------------------------
    const inStore = storeIndex()
    interaction = aboard
      ? { kind: 'hopOut' }
      : resolveInteraction({
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
          shelf: shelfInView(inStore),
          insideStore: inStore >= 0,
          bush: world.bush,
          daily: dailyStatus(),
        })
    const prompt = interaction ? interactionPrompt(interaction) : null
    glow.setTarget(glowTarget(interaction))
    // Today's berry picked, the bush stands bare until midnight Central.
    world.setBerries(dailyStatus() !== 'picked')
    if (player.locked) {
      hud.prompt(!ended && now >= strikeUntil ? prompt : null)
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
        cash: formatCash(cash),
      })
      inventoryView.update(dt, ring, ringIndex)
      renderer.render(inventoryView.scene, inventoryView.camera)
    } else {
      renderer.render(scene, camera)
      if (player.locked && !ended) glow.render(scene, camera, time)
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
      shadowmen,
      mist,
      get raid() {
        return raid
      },
      net: {
        get status() {
          return net.status
        },
        get id() {
          return net.id
        },
        peers: () => peers.list(),
      },
      get shared() {
        return shared
      },
      get daily() {
        return daily
      },
      get aboard() {
        return aboard
      },
      get glow() {
        return glow.target
      },
      get cash() {
        return cash
      },
      get chat() {
        return hud.chatLines
      },
      teleport(u: number, v: number) {
        const { x, z } = unitToWorld(u, v, geo.metres)
        player.relocate(x, z)
      },
      hurryTruck(seconds = 5) {
        // In the shared valley the server holds the clock; a dev server
        // lets a spec move it.
        if (shared) net.send({ type: 'dev', op: 'hurry', seconds })
        else raid = { ...raid, loadoutEndsAt: raidClock + seconds }
      },
    }
  }
}

boot().catch((err: unknown) => {
  console.error('Shadow Wars failed to boot:', err)
})
