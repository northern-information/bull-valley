import * as THREE from 'three'
import './styles.css'
import { createActions } from './actions.ts'
import { buildSky } from './assets.ts'
import { BvAudio } from './audio.ts'
import { refreshSession } from './auth.ts'
import { CaretakerShade } from './caretakerrig.ts'
import { CONFIG } from './config.ts'
import { copy } from './copy.ts'
import { createCorpseMeshes } from './corpsemeshes.ts'
import { installDevHook } from './devhook.ts'
import { donutRoute } from './donuts.ts'
import { createDropMeshes } from './dropmeshes.ts'
import { finishById } from './finishes.ts'
import { FirstPersonHands } from './fphands.ts'
import { createGameState } from './game.ts'
import { createGlow } from './glow.ts'
import { createGravestones } from './gravestones.ts'
import { Hud } from './hud.ts'
import { wireKeys, wirePointer } from './input.ts'
import { createItemThumbs } from './itemthumbs.ts'
import { startLoop } from './loop.ts'
import { MistCards } from './mistcards.ts'
import { createMusic } from './musicrig.ts'
import { NetClient, socketUrl } from './net.ts'
import { Peers } from './peers.ts'
import { Player } from './player.ts'
import { PlayerBody } from './playerbody.ts'
import { createPS1Renderer, setSnapResolution } from './ps1.ts'
import { mulberry32 } from './rng.ts'
import { buildRoadGraph, nearestRoadPoint, wanderRoute } from './roadgraph.ts'
import { Scope } from './scope.ts'
import { createSettingsStore } from './settingsui.ts'
import { createSfx } from './sfxrig.ts'
import { ShadowBursts } from './shadowburst.ts'
import { ShadowCards } from './shadowcards.ts'
import { createTargets } from './targets.ts'
import { buildTerrainMesh, createHeightField, loadTerrain } from './terrain.ts'
import { openAccount, showTitles, signOutAndReload } from './titles.ts'
import { createTrails } from './trails.ts'
import { Truck } from './truck.ts'
import { joyrideMs } from './truckplan.ts'
import { wireValley } from './valleysync.ts'
import { waterMapOf } from './waterside.ts'
import { buildWorld } from './world.ts'
import type { Game } from './game.ts'
import type { Geo } from './interfaces.ts'
import type { TerrainData } from './terrain.ts'
import type { TruckContext } from './truckplan.ts'

// boot() builds the scene and the systems into one Game, then hands it to
// the modules that run it: actions.ts (what the player does), valleysync.ts
// (what the valley says), input.ts (the pointer and the keys), targets.ts
// (what E is aimed at) and loop.ts (the frame).

// The survey and terrain: the game's own map, committed in public/data.
const DATA_BASE = '/data/bull-valley'

// How long boot waits for IBM Plex Mono before it draws in the fallback face.
const FONT_TIMEOUT_MS = 3000

// The weights the HUD and canvas text use; the italic loads on first use.
const FONT_WEIGHTS = [400, 600, 700]

// IBM Plex Mono, loaded before any text exists, so nothing paints in a
// fallback and then reflows when the face lands (index.html preloads it).
// Canvas text (the scope, name tags) is drawn after boot, so it gets the face
// too. A font that never arrives must not hold the game: past the timeout,
// boot goes on.
async function fontsReady(): Promise<void> {
  const timeout = new Promise<void>((resolve) => {
    setTimeout(resolve, FONT_TIMEOUT_MS)
  })
  const load = Promise.all(
    FONT_WEIGHTS.map((w) => document.fonts.load(`${w} 1em "IBM Plex Mono"`))
  ).then(
    () => undefined,
    (err: unknown) => {
      console.error('IBM Plex Mono failed to load:', err)
    }
  )
  await Promise.race([load, timeout])
}

async function boot() {
  const root = document.getElementById('bv-root')
  if (!root) throw new Error('Missing #bv-root')
  await fontsReady()
  const hud = new Hud(root)
  const audio = new BvAudio()
  // The title-card cues; dev builds mute them.
  if (import.meta.env.DEV) audio.setMuted(true)
  // The titles cover the terrain resolve: colophon, logo, account step, then
  // the character select, each a black layer stacked over the next, so every
  // reveal uncovers the one beneath and the last discloses the intro
  // dialog already waiting. Not awaited until the player body needs the
  // pick; the scene builds underneath.
  // The raider's settings: the menu's Audio and the pause overlay share
  // them, and the music reads them every frame.
  const settings = createSettingsStore()
  // The valley's music, from the main menu on. Under e2e the valley is
  // never heard.
  const music = import.meta.env.MODE === 'test' ? null : createMusic()
  const titles = showTitles(audio, settings, music)
  hud.showIntro(true, false)
  hud.setBegin('loading')

  let geo: Geo
  let terrain: TerrainData
  try {
    ;[geo, terrain] = await Promise.all([
      fetch(`${DATA_BASE}/geo.json`).then((r) => {
        if (!r.ok) throw new Error(`geo.json ${r.status}`)
        // Our own survey (public/data/bull-valley/geo.json).
        return r.json() as Promise<Geo>
      }),
      loadTerrain(`${DATA_BASE}/terrain.png`),
    ])
  } catch (err) {
    console.error('Shadow Wars failed to load its terrain data:', err)
    hud.setBegin('failed')
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
  const drops = createDropMeshes(world.ground.at)
  scene.add(drops.group)
  const graves = createGravestones(world.ground.at)
  scene.add(graves.group)
  const corpses = createCorpseMeshes(world.ground.at)
  scene.add(corpses.group)

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
  const homeDir = (() => {
    const dx = departRoute[1].x - departRoute[0].x
    const dz = departRoute[1].z - departRoute[0].z
    const len = Math.hypot(dx, dz) || 1
    return { x: dx / len, z: dz / len }
  })()
  truck.setHome(truckPoint, homeDir)
  truck.parkHome()
  // The roads Matthew Marx drives: home, the joyride, his donuts.
  const truckContext: TruckContext = {
    graph,
    home: { x: truckPoint.x, z: truckPoint.z },
    homeDir,
    departRoute,
    donutRoute: (seed) =>
      world.donutField
        ? donutRoute(
            truckPoint,
            homeDir,
            world.donutField,
            mulberry32(seed),
            CONFIG.truck.donuts
          )
        : null,
  }
  // What the valley is told of them: it never knows the roads.
  const truckRoutes = {
    home: truckContext.home,
    joyrideMs: joyrideMs(truckContext),
  }
  // Spawn on the lot between the pump island and the truck, facing the
  // truck — clear of the building, which sits behind the pumps.
  {
    const dx = truck.x - spawnStation.x
    const dz = truck.z - spawnStation.z
    const len = Math.hypot(dx, dz) || 1
    world.spawn.x = spawnStation.x + (dx / len) * CONFIG.spawn.offset
    world.spawn.z = spawnStation.z + (dz / len) * CONFIG.spawn.offset
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
  if (pick.notice) hud.tell(pick.notice)
  hud.setRaider(pick.username)
  hud.setSettings(settings)
  hud.accountBtn.addEventListener('click', openAccount)
  hud.signOutBtn.addEventListener('click', () => {
    hud.signOutBtn.disabled = true
    signOutAndReload()
  })
  const playerBody = new PlayerBody(
    scene,
    pick.outfit,
    finishById(pick.finish).color
  )
  // The hands hang off the camera, so the camera joins the scene.
  scene.add(camera)
  const hands = new FirstPersonHands(camera, pick.outfit)

  // --- The valley server -------------------------------------------------
  // Everyone online shares one valley. The socket is same-origin and the
  // session cookie says who we are; if the server is down or unreachable
  // the valley is simply empty, and it plays as the player's alone.
  const net = new NetClient({
    url: socketUrl(window.location, import.meta.env.DEV),
    config: CONFIG.net,
    beforeOpen: () => refreshSession(),
  })

  // Where the water's edges run: the valley's spiders come up near them.
  const water = waterMapOf(geo.water, geo.metres)
  const game: Game = {
    state: createGameState(world.fuelPoints.length, pick.hotbar),
    geo,
    hud,
    renderer,
    scene,
    camera,
    sky,
    world,
    drops,
    graves,
    corpses,
    graph,
    truck,
    music,
    // Under e2e the valley is never heard.
    // A dev build with ?sfx=local auditions files from public/sfx/.
    sfx:
      import.meta.env.MODE === 'test'
        ? null
        : createSfx(
            import.meta.env.DEV &&
              new URLSearchParams(window.location.search).get('sfx') === 'local'
              ? { base: '/sfx/', probe: true }
              : {}
          ),
    settings,
    truckContext,
    truckRoutes,
    spawnStation,
    player,
    playerBody,
    hands,
    pick,
    scope: new Scope(hud.scopeCanvas, hud.phone),
    // The shadowmen feed the scope.
    shadowmen: new ShadowCards({
      scene,
      groundAt: world.ground.at,
      metres: geo.metres,
      havens: world.fuelPoints,
      water,
    }),
    caretaker: new CaretakerShade({
      scene,
      groundAt: world.ground.at,
      place: world.mazePlace,
    }),
    bursts: new ShadowBursts(scene),
    // Ground mist drifts around the player.
    mist: new MistCards({
      scene,
      groundAt: world.ground.at,
      player: player.pos,
    }),
    // The ring around whatever E would act on.
    glow: createGlow(renderer, scene),
    trails: createTrails(renderer),
    thumbs: createItemThumbs(),
    peers: new Peers(scene),
    net,
  }

  player.onEdge = () => hud.tell(copy('log.edge'))
  // The hovered item in the pack spins on its card.
  hud.onBagHover = (item) => {
    if (item) game.thumbs.spin(hud.cardCanvas, item.kind)
    else game.thumbs.stop()
  }

  // --- Input and the valley ----------------------------------------------
  hud.setBegin('play')
  const engagePointer = wirePointer(game)
  const actions = createActions(game, engagePointer)
  wireValley(game, actions)
  // Not awaited: the game never waits on the network.
  void net.connect({
    outfit: pick.outfit,
    pickups: world.pickups.map(({ kind, count }) => ({ kind, count })),
    stations: world.fuelPoints.length,
    havens: world.fuelPoints.map(({ x, z }) => ({ x, z })),
    metres: geo.metres,
    water,
    maze: world.mazePlace,
    truck: truckRoutes,
    stand: world.stand ? world.stand.at : null,
  })
  wireKeys(game, actions, engagePointer)

  const resize = () => {
    const w = window.innerWidth
    const h = window.innerHeight
    const iw = Math.max(2, Math.floor(w / CONFIG.render.downscale))
    const ih = Math.max(2, Math.floor(h / CONFIG.render.downscale))
    renderer.setSize(iw, ih, false)
    game.glow.setSize(iw, ih)
    game.trails.setSize(iw, ih)
    camera.aspect = w / h
    camera.updateProjectionMatrix()
    setSnapResolution(iw, ih)
  }
  window.addEventListener('resize', resize)
  resize()

  startLoop(game, actions, createTargets(game))

  // Dev-only introspection hook; stripped from production bundles.
  if (import.meta.env.DEV) installDevHook(game, actions)
}

boot().catch((err: unknown) => {
  console.error('Shadow Wars failed to boot:', err)
})
