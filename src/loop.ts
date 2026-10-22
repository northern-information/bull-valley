// The frame: the clocks, the ride or the walk, the shadowmen and the mist,
// the maze portal, the state frame to the valley, the HUD and the hotbar,
// what E would do, and the draw.

import { pulseMaterials } from './assets.ts'
import { itemsHeld, sightsInReach } from './book.ts'
import { activeBuffs } from './buffbar.ts'
import { passTarget, sprintScale } from './buffs.ts'
import { phonesOf, stopAt } from './citgos.ts'
import { CONFIG } from './config.ts'
import { copy } from './copy.ts'
import { moabOffer } from './cosmetics.ts'
import { dayKey } from './daily.ts'
import { onDay, shownCount } from './dailytask.ts'
import { EMOTES, holds } from './emotes.ts'
import { hurts } from './fall.ts'
import { havenNews } from './fireflies.ts'
import { BOX_ROD, inPond, jarRoom, nearestLanding, rodIn } from './fishing.ts'
import { ease, stepHand, useLift, useSeconds } from './hands.ts'
import { shakeAt } from './health.ts'
import {
  baitFor,
  CAST,
  castPose,
  inHand,
  SCOOP,
  scoopPose,
  toolOf,
} from './held.ts'
import { cooldownOf, shownSlots } from './hotbar.ts'
import {
  dailyStatus,
  interactionKey,
  interactionPrompt,
  itemLabel,
  resolveInteraction,
} from './interactions.ts'
import { isLock, passes } from './keys.ts'
import { inPortal } from './maze.ts'
import { packItemOf } from './packgrid.ts'
import { secondsLeft } from './portals.ts'
import { poseOf, stateChanged } from './presence.ts'
import { aimHeightOf, burstScaleOf, headlightsDue } from './shadowmen.ts'
import { drawnAt } from './shadowsync.ts'
import { formatCash } from './store.ts'
import { tripBlur } from './trip.ts'
import { burstHeight, burstScale } from './tunnelrig.ts'
import { levelsAt } from './wardlevels.ts'
import { wardView } from './wardview.ts'
import { boardable, clockText, countdown, seatOf } from './worldsync.ts'
import type { Actions } from './actions.ts'
import type { CaretakerShade } from './caretakerrig.ts'
import type { Game } from './game.ts'
import type { BushSpot } from './interactions.ts'
import type { DailyWire, PeerStateWire } from './protocol.ts'
import type { Cue } from './sfx.ts'
import type { ShadowBodies } from './shadowbodies.ts'
import type { HeadlightsSent } from './shadowmen.ts'
import type { Feet as SlurmFeet } from './slurms.ts'
import type { Targets } from './targets.ts'
import type { Pickup } from './world.ts'

// Under e2e (--mode test) the valley runs but is never drawn. The specs
// read the game through window.__bv, never its pixels, and CI draws WebGL
// in software, where one frame of the whole valley can take seconds.
// ps1.ts turns shadows off there too. The inventory, the dialogs and the
// title cards still draw.
const DRAW_VALLEY = import.meta.env.MODE !== 'test'

// One frame's clocks: now (ms), the capped step (s), and the game clock.
interface FrameClock {
  now: number
  dt: number
  time: number
}

// Where the feet stand and how, for the body and for the wire.
interface Feet {
  feetY: number
  moveSpeed: number
  crouching: boolean
}

export function startLoop(game: Game, actions: Actions, targets: Targets) {
  const {
    state: s,
    hud,
    net,
    renderer,
    scene,
    camera,
    sky,
    world,
    truck,
    radio,
    donutWake,
    music,
    sfx,
    settings,
    player,
    playerBody,
    hands,
    phone,
    shadowmen,
    caretaker,
    bursts,
    mist,
    glow,
    trails,
    solids,
    constellations,
    thumbs,
    peers,
  } = game
  // The back room's locked door lets this raider through while they carry
  // its key, or once they are behind it (keys.ts); everyone else's game
  // decides for them.
  const plaza = world.plaza
  if (plaza) {
    world.walls.setGates(
      (gate, x, z) =>
        isLock(gate) && passes(gate, s.inventory, plaza.inBackRoom(x, z))
    )
  }

  // Marx's countdown, for whoever is in the bed or standing by it, and
  // only with someone else in the valley (with no one else, he leaves once
  // the pick is made). The line is filled again only when its clock reads differently.
  let clockShown = ''
  let clockLine = ''
  const countdownLine = (now: number): string | null => {
    if (!s.world || peers.count === 0) return null
    const left = countdown(s.world.truck, net.clock.serverNow(now))
    if (left === null) return null
    const near =
      s.aboard ||
      truck.distanceTo(player.pos.x, player.pos.z) < CONFIG.truck.countdownReach
    if (!near) return null
    const clock = clockText(left)
    if (clock !== clockShown) {
      clockShown = clock
      clockLine = copy('truck.leaves_in', { clock })
    }
    return clockLine
  }

  // How each bush stands for this player right now: read again when the
  // valley's word on the bushes changes, and when the day turns under it
  // (dailyStatus reads the word against the clock).
  let bushes: BushSpot[] = []
  let bushesFor: DailyWire | null = null
  let bushesPastReset = false
  let bushesStale = true
  const bushSpots = (now: number): BushSpot[] => {
    const daily = net.online ? s.daily : null
    const serverNow = net.clock.serverNow(now)
    const pastReset = daily !== null && serverNow >= daily.resetsAt
    if (bushesStale || daily !== bushesFor || pastReset !== bushesPastReset) {
      bushesStale = false
      bushesFor = daily
      bushesPastReset = pastReset
      bushes = world.bushes.map(({ id, x, z }) => ({
        id,
        x,
        z,
        status: dailyStatus(daily, id, serverNow),
      }))
    }
    return bushes
  }

  // Everything E could take up, the valley's pickups and what lies
  // dropped, as one list: built again when the drops' meshes are.
  let dropPickups = game.drops.pickups
  let pickups: Pickup[] = [...world.pickups, ...dropPickups]
  const allPickups = (): Pickup[] => {
    if (game.drops.pickups !== dropPickups) {
      dropPickups = game.drops.pickups
      pickups = [...world.pickups, ...dropPickups]
    }
    return pickups
  }

  // The prompt and the label for what E would do, kept while the
  // interaction reads the same (interactionKey).
  let promptKey: string | null = null
  let prompt: string | null = null
  let label: ReturnType<typeof itemLabel> = null

  // The last word the valley had from us on Marx's headlights.
  let headlightsSent: HeadlightsSent | null = null

  // What moves on its own is stepped only within the fog's reach of the
  // player (CONFIG.render.liveRadius): each takes a running time, so it is
  // where it should be the moment it comes back into reach.
  const live = (at: { x: number; z: number }, margin = 0) =>
    Math.hypot(at.x - player.pos.x, at.z - player.pos.z) <=
    CONFIG.render.liveRadius + margin

  // The slurms' sounds, heard with the shadows' on the next frame.
  let slurmCues: Cue[] = []
  let moatCues: Cue[] = []
  // A hard landing for the valley to hear, after where we came down.
  let landing: number | null = null
  let last = performance.now()
  // Real seconds since the last frame, and the same capped at maxStep: the
  // capped step moves the player, the item timers, and the animation, so a
  // stalled frame never jumps them ahead.
  const advanceClocks = (): FrameClock => {
    const now = performance.now()
    const elapsed = (now - last) / 1000
    const dt = Math.min(CONFIG.render.maxStep, elapsed)
    last = now
    s.time += dt
    return { now, dt, time: s.time }
  }

  // Where the feet stand and how, for the body and for the wire.
  const rideOrWalk = ({ now, dt, time }: FrameClock): Feet => {
    const smoking = time < s.effects.smoking.end
    let feetY: number
    let moveSpeed = 0
    let crouching = false
    if (s.aboard) {
      // The one place the camera leaves player.update(): ride the bed with
      // free look, keeping player.pos honest for everything that reads it.
      const truckState = truck.update(dt, now)
      const seat = truck.bedSeat(s.world ? seatOf(s.world, net.id) : 0)
      player.relocate(seat.x, seat.z, player.yaw)
      camera.position.set(seat.x, seat.y, seat.z)
      camera.rotation.set(player.pitch, player.yaw, 0)
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
      // Home at the Citgo: everyone off.
      if (truckState.arrived) actions.hopOut(copy('log.end_of_line'))
    } else {
      const playerState = player.update(dt, {
        speedScale:
          (phone.raised ? CONFIG.player.phoneSpeedScale : 1) *
          (smoking ? CONFIG.items.smokingSpeedScale : 1),
        // Rule 27: stimulated, the sprint runs quicker.
        sprintScale: sprintScale(levelsAt(s.wards, s.time)),
        eye: s.emoting ? EMOTES[s.emoting.id].eye : null,
      })
      feetY = player.groundY
      moveSpeed = playerState.speed
      crouching = playerState.crouching
      // A hard landing (rule 24): the valley hears where we came down
      // first (sendState), then how far.
      const fell = playerState.landed
      if (fell !== null && hurts(fell) && now >= s.strikeUntil && net.online) {
        landing = fell
      }
      // An emote holds while the raider stands still; moving, crouching or
      // its seconds running out end it.
      const nowSeconds = now / 1000
      if (
        !holds(s.emoting, nowSeconds, {
          speed: moveSpeed,
          crouching,
          aboard: s.aboard,
        })
      ) {
        s.emoting = null
      }
      playerBody.update(dt, {
        x: player.pos.x,
        ground: feetY,
        z: player.pos.z,
        yaw: player.yaw,
        speed: moveSpeed,
        crouching,
        emote: s.emoting && {
          pose: EMOTES[s.emoting.id].pose,
          seconds: nowSeconds - s.emoting.since,
        },
      })
      truck.update(dt, now)
    }
    truck.castShadowsNear(player.pos.x, player.pos.z)
    return { feetY, moveSpeed, crouching }
  }

  const stepAudio = (now: number) => {
    // The valley's music, at the raider's setting.
    music?.update({
      now,
      started: s.started,
      setting: settings.current.music,
    })
    // Marx's radio while the truck rolls: as cut in the bed, and fading
    // to its lows with the distance everywhere else.
    radio?.update({
      started: s.started,
      setting: settings.current.music,
      engine: truck.engineSeconds(),
      distance: truck.distanceTo(player.pos.x, player.pos.z),
      aboard: s.aboard,
    })
    // The valley's sounds, heard from the camera at the raider's setting.
    sfx?.update({
      started: s.started,
      setting: settings.current.sfx,
      listener: camera,
    })
  }

  // The lines held for the moment Marx's truck starts rolling.
  const tellTruckRolls = () => {
    if (s.onTruckRolls.length && truck.rolling()) {
      for (const line of s.onTruckRolls) hud.tell(line)
      s.onTruckRolls = []
    }
  }

  // The hands: the selected slot's tool raised (held.ts), the flashlight
  // lit once it is all the way up, a jar or a rod held up in its place
  // (the jar scooping on a click, the rod casting), and the item just
  // used brought up once. A new tool comes up from below, the flashlight
  // dark, and a line out goes with the rod. Says whether the flashlight
  // is lit.
  const raiseHands = ({ dt, time }: FrameClock): boolean => {
    const held = toolOf(inHand(s.hotbar, s.selected, s.inventory))
    if (held !== s.held) {
      if (s.held === 'rod') game.fishHud.giveUp()
      s.held = held
      s.flashlight = { up: held === 'jar' || held === 'rod', lift: 0 }
    }
    s.flashlight = stepHand(s.flashlight, dt)
    if (s.using && time - s.using.at >= useSeconds()) s.using = null
    const lit =
      s.held === 'flashlight' && s.flashlight.up && s.flashlight.lift >= 1
    const using = s.using ? useLift(s.using.at, time) : 0
    // The rod's cast, played out once and done with.
    if (
      s.castAt !== null &&
      (s.held !== 'rod' || time - s.castAt >= CAST.lands)
    ) {
      // The bobber down on the water, with a line out to land it on.
      if (s.held === 'rod' && (s.line || s.pending.fish)) {
        game.sfx?.play('bobber-plop')
      }
      s.castAt = null
    }
    // The jar's scoop, played out once and done with.
    if (
      s.scoopAt !== null &&
      (s.held !== 'jar' || time - s.scoopAt >= SCOOP.settle)
    ) {
      s.scoopAt = null
    }
    hands.update({
      left: ease(s.flashlight.lift),
      cast: s.castAt === null ? 0 : castPose(time - s.castAt).tilt,
      scoop: scoopPose(s.scoopAt === null ? -1 : time - s.scoopAt),
      held:
        s.held === 'rod' ? (rodIn(s.inventory) ?? BOX_ROD) : (s.held ?? 'none'),
      right: ease(using),
      kind: s.using?.kind ?? null,
      on: lit,
    })
    // The line in the water, stepped on the clock its bite was set by.
    game.fishHud.update(s.line, performance.now())
    return lit
  }

  // The shadowmen, the Caretaker and the tunnel shades, the valley's,
  // drawn a beat behind the present: their bursts and what they sound
  // like, and the mist. Their touches come in the valley's own frames.
  const stepShadows = ({ dt, time }: FrameClock, renderAt: number) => {
    const perception = time < s.effects.perception.end
    const croft = world.undercroft
    const swarm = shadowmen.update({
      dt,
      player: player.pos,
      perception,
      renderAt,
    })
    for (const at of swarm.bursts) {
      // A spider bursts where its body hung, twice as big; a spiderling
      // half as big.
      const size = burstScaleOf(at.kind ?? 'man', CONFIG.shadowmen)
      const y =
        drawnAt(at, world.ground.at, (x, z, feet) =>
          world.ground.standAt(x, z, feet, CONFIG.fall.climb)
        ) + aimHeightOf(at.kind, CONFIG.shadowmen)
      bursts.spawn(at.x, y, at.z, size)
    }
    // The Caretaker walks the maze on the same terms.
    const keeper = caretaker.update({
      dt,
      time,
      player: player.pos,
      renderAt,
    })
    for (const at of keeper.burned) {
      const y = world.ground.at(at.x, at.z) + CONFIG.caretaker.chestHeight
      bursts.spawn(at.x, y, at.z)
    }
    // And the tunnel shades in the Undercroft, the Warden among them.
    const tunnel = game.tunnel.update({
      dt,
      time,
      player: player.pos,
      renderAt,
    })
    for (const at of tunnel.bursts) {
      const y = world.ground.at(at.x, at.z) + burstHeight(at.kind)
      bursts.spawn(at.x, y, at.z, burstScale(at.kind))
    }
    // A hit the Warden stands throws it into the dark in a smaller burst.
    for (const at of tunnel.wounds) {
      const y = world.ground.at(at.x, at.z) + burstHeight(at.kind)
      bursts.spawn(at.x, y, at.z, burstScale(at.kind) * 0.55)
    }
    const tunnelCues = [...tunnel.bursts, ...tunnel.wounds].map(
      ({ x, z, kind }) => ({
        id: 'shadow-burst' as const,
        x,
        z,
        rate: kind === 'warden' ? 0.6 : 1,
      })
    )
    croft?.update(time)
    bursts.update(dt)
    // What the shadowmen and the Caretaker sound like this frame.
    sfx?.hear(
      [
        ...swarm.heard.cues,
        ...keeper.heard.cues,
        ...tunnelCues,
        ...slurmCues,
        ...moatCues,
      ],
      [...swarm.heard.holds, ...keeper.heard.holds],
      (x, z) => world.ground.at(x, z)
    )
    mist.update({ dt, player: player.pos })
    return { swarm, keeper }
  }

  // What a trip shows that is not there (hallucinations.ts): out ahead
  // while the tripping ward is up, gone with it. This raider's alone.
  const stepHallucinations = ({ dt, time }: FrameClock) => {
    game.hallucinations.update(dt, {
      time,
      tripping: levelsAt(s.wards, time).tripping,
      player: player.pos,
      yaw: player.yaw,
      blocked: world.walls.between,
    })
  }

  // What stands in the valley and moves on its own clock.
  const stepScenery = ({ now, time }: FrameClock, feetY: number) => {
    // Gron's rain falls on its own clock, Moab's fire burns on it too, the
    // wreck smoulders and blinks on it, and the plaza's last tube flickers.
    if (world.gronRig && world.gron && live(world.gron)) {
      world.gronRig.update(time)
    }
    // The stand dressed for this raider's own level (rule 23).
    world.stand?.setLevel(s.stand?.level ?? 1)
    world.moabRigs.forEach((rig, i) => {
      if (live(world.moabs[i])) rig.update(time)
    })
    // Tyler types on in the back of his Jeep.
    if (world.tylerRig && world.tyler && live(world.tyler)) {
      world.tylerRig.update(time)
    }
    // Erwin's rose lies at the heart for a raider who laid it (rule 26).
    if (world.portal) {
      const stage = s.quests?.rose
      world.portal.rose.visible = stage === 'laid' || stage === 'done'
    }
    // The locked door swings open as a raider who may pass comes up to it.
    if (plaza) {
      const { x, z } = player.pos
      const near =
        Math.hypot(x - plaza.doorAt.x, z - plaza.doorAt.z) <
        CONFIG.stripMall.doorReach
      const inside = plaza.inBackRoom(x, z)
      plaza.setDoorOpen(
        (near || inside) && passes(plaza.lock, s.inventory, inside)
      )
      // The building is long: its tube and candles flicker from a way off.
      if (live(plaza.doorAt, 60)) plaza.update(time)
    }
    if (world.wreck && live(world.wreck.group.position)) {
      world.wreck.update(time)
    }
    // The fireflies blink over each pond near enough to see, and the
    // bobber floats while a line is out, off the pond the raider stands
    // at (fishing.ts).
    for (const pond of world.ponds) {
      if (!live(pond.place, pond.place.radius)) continue
      // The bobber is on the water once the cast has flown.
      const line =
        inPond([pond.place], player.pos) && s.castAt === null ? s.line : null
      pond.setLine(
        line !== null,
        line?.hook != null && performance.now() >= line.bitesAt
      )
      pond.update(time, net.clock.serverNow(now) / 1000)
    }
    // Into a pond's firefly haven, or out of it, the log says so; not
    // until the welcome has put the raider where they stand.
    const sheltered = inPond(
      world.ponds.map((pond) => pond.place),
      player.pos
    )
    const news = havenNews(s.placed ? s.inFireflies : null, sheltered)
    if (news)
      hud.tell(copy(news === 'in' ? 'log.fireflies_in' : 'log.fireflies_out'))
    s.inFireflies = s.placed ? sheltered : null
    // The dishes slew on the valley's clock, so every raider sees them
    // look the same way.
    const dishes = world.dishes
    if (dishes && live(dishes.middle, dishes.reach)) {
      dishes.update(net.clock.serverNow(now) / 1000)
    }
    // Castle Entropy bobs and its lighthouse sweeps the valley from
    // anywhere, on the valley's clock, and is made anew when the Central
    // day turns (castle.ts); its moat and cranes move only near.
    const castle = world.castle
    if (castle) {
      const shared = net.clock.serverNow(now)
      moatCues = castle.update(
        shared / 1000,
        dayKey(shared),
        live(castle.middle, 120),
        raidersFeet(feetY)
      )
    }
  }

  // The portals. Says the moment the Citgo portals' clock reads.
  const stepPortals = ({ now, time }: FrameClock): number => {
    // The portal at the maze's heart swirls, and anyone on foot who walks
    // into it comes out on the trail outside the gate.
    const portal = world.portal
    if (portal) {
      if (live(portal.at)) portal.rig.update(time)
      const { x, z } = player.pos
      if (!s.aboard && inPortal(x, z, portal.at, CONFIG.maze.portal.radius)) {
        player.relocate(portal.exit.x, portal.exit.z, portal.exit.yaw)
        hud.tell(copy('log.portal'))
      }
    }
    // The Citgo portals (rule 28), on the valley's clock: drawn, and one
    // walked into takes you out of its twin.
    const portalNow = net.clock.serverNow(now)
    actions.tendPortals(portalNow)
    return portalNow
  }

  // Rule 34: the others in the raider's party, by name.
  const partyMates = () =>
    s.party.members
      .map((m) => m.name)
      .filter((name) => name !== game.pick.username)

  // The Citgo or the found payphone fast travel would leave from.
  const travelFrom = () => {
    if (s.aboard) return null
    const stop = stopAt(player.pos, world.fuelPoints, world.payphones)
    if (stop && 'phone' in stop) {
      return phonesOf(s.citgos).includes(stop.phone) ? stop : null
    }
    return stop
  }

  // The map, while it is open: where you stand, your Citgos and payphones,
  // your party, and your waypoints.
  const drawMap = () => {
    if (s.mapOpen) {
      hud.map?.draw({
        me: { x: player.pos.x, z: player.pos.z, yaw: player.yaw },
        log: s.citgos,
        here: travelFrom(),
        party: peers.placed(partyMates()),
        marks: s.waypoints,
      })
    }
  }

  // The static after a strike, health, and the shake of a touch.
  const feelStrikes = (now: number) => {
    if (now < s.strikeUntil) hud.drawStatic()
    else if (!hud.staticWrap.hidden) hud.showStatic(false)
    hud.setHealth(s.health, s.healthMax)
    const shake = shakeAt((now - s.hurtAt) / 1000)
    if (shake > 0) {
      camera.position.x += (Math.random() * 2 - 1) * shake
      camera.position.y += (Math.random() * 2 - 1) * shake
      camera.rotation.z += (Math.random() * 2 - 1) * shake * 0.5
    }
  }

  // Ours goes out on a fixed cadence, and only when it changed. The same
  // tick paces what need not run every frame (the book's asks), so this
  // says whether it came round.
  const sendState = (
    { now, dt }: FrameClock,
    { feetY, moveSpeed, crouching }: Feet,
    lit: boolean
  ): boolean => {
    s.sinceSent += dt
    const tick = s.sinceSent >= 1 / CONFIG.net.sendHz || landing !== null
    if (tick) s.sinceSent = 0
    if (net.online && tick) {
      const state: PeerStateWire = {
        x: player.pos.x,
        y: feetY,
        z: player.pos.z,
        yaw: player.yaw,
        pitch: player.pitch,
        pose: s.emoting?.id ?? poseOf(moveSpeed, crouching),
        riding: s.aboard,
        light: lit,
        ...(s.held === 'flashlight' ? {} : { held: s.held ?? 'none' }),
      }
      if (stateChanged(s.lastSent, state)) {
        s.lastSent = state
        net.sendState(state)
      }
      if (landing !== null) {
        net.send({ type: 'fall', height: landing })
        landing = null
      }
      // Near Marx's truck, where it stands, so the valley can aim its
      // headlights at the shadowmen round us: as it drives, once where
      // it stops, and then only often enough that the valley remembers.
      if (
        truck.distanceTo(player.pos.x, player.pos.z) <
        CONFIG.shadowmen.despawnRadius
      ) {
        const pose = truck.headlights()
        if (headlightsDue(headlightsSent, pose, truck.moving, now)) {
          headlightsSent = { pose, at: now }
          net.sendHeadlights(pose)
        }
      }
    }
    return tick
  }

  // The compass, the countdown, the hotbar, geometrie and the buffs, the
  // tracker's rows, and the chat log.
  const stepHud = ({ now, time }: FrameClock) => {
    hud.compass.set({
      me: { x: player.pos.x, z: player.pos.z, yaw: player.yaw },
      waypoints: s.waypoints,
      party: peers.placed(partyMates()),
    })
    hud.setCountdown(countdownLine(now))

    hud.setHotbar(
      shownSlots(s.hotbar).flatMap(({ slot, kind }) => {
        const item = packItemOf(kind, s.inventory)
        if (!item) return []
        const cooldown = cooldownOf(kind, s.effects, time)
        return [{ slot, item, icon: thumbs.icon(kind), cooldown }]
      }),
      s.selected
    )
    const levels = levelsAt(s.wards, time)
    hud.setWards(levels)
    hud.turnWards(time)
    hud.setBuffs(activeBuffs(levels, s.effects, time))
    // The daily task as it stands on the valley's day: a count from an
    // earlier day reads as nothing done.
    if (net.online) {
      const day = dayKey(net.clock.serverNow(now))
      hud.task.set({
        count: shownCount(s.task, day),
        done: onDay(s.task, day).claimed,
      })
    } else {
      hud.task.set(null)
    }
    hud.level.set(net.online ? s.xp : null)
    hud.tickChat(performance.now())
  }

  // The phone dials a Citgo portal; the frame it goes through, it opens.
  const stepPhone = (dt: number, portalNow: number) => {
    const mine = s.portals.find((p) => p.id === s.myPortal)
    const through = phone.update(dt, {
      open: mine ? secondsLeft(mine.closes, portalNow) : null,
    })
    if (through) actions.openPortal()
  }

  // The Book of Shadows: the places in reach, a shadow come within sight,
  // and whatever the pack holds, written the first time (actions.ts
  // discover leaves out what is found or asked), looked for on the state
  // frame's cadence.
  const discoverBook = (
    tick: boolean,
    swarm: ReturnType<ShadowBodies['update']>,
    keeper: ReturnType<CaretakerShade['update']>
  ) => {
    if (s.started && tick) {
      const range = CONFIG.book.sightRange
      actions.discover([
        ...sightsInReach(world.sights, player.pos),
        ...(swarm.sighted.includes('man') ? ['shadowman'] : []),
        ...(swarm.sighted.includes('spider') ? ['spider'] : []),
        ...(swarm.sighted.includes('spiderling') ? ['spiderling'] : []),
        ...(keeper.distance !== null && keeper.distance <= range
          ? ['caretaker']
          : []),
        ...game.tunnel.shown
          .filter(
            (t) => Math.hypot(t.x - player.pos.x, t.z - player.pos.z) <= range
          )
          .map((t) => (t.kind === 'warden' ? 'warden' : 'tunnel-shade')),
        ...itemsHeld(s.inventory),
      ])
    }
  }

  // Pickups pulse every frame, whatever the prompt says.
  const pulsePickups = (time: number) => {
    const pulse = 0.35 + Math.sin(time * 3) * 0.2
    for (const pickup of allPickups()) {
      if (pickup.taken) continue
      for (const m of pulseMaterials(pickup.mesh)) m.emissiveIntensity = pulse
    }
  }

  // Every raider on foot this client sees, where their feet are: ours,
  // and each peer's last frame. A slurm under any of them is squashed.
  const raidersFeet = (feetY: number): SlurmFeet[] => {
    const feet: SlurmFeet[] = s.aboard
      ? []
      : [{ x: player.pos.x, y: feetY, z: player.pos.z }]
    for (const peer of peers.list()) {
      const at = peer.next
      if (at && !at.riding) feet.push({ x: at.x, y: at.y, z: at.z })
    }
    return feet
  }

  const followPlayer = (now: number, feetY: number) => {
    // The stocked shelves follow the player to the nearest store.
    // With them the slurms off its dripline, on the valley's clock so
    // everyone at that Citgo sees the same drop (slurms.ts).
    const shelves = world.shelves.update(
      player.pos.x,
      player.pos.z,
      s.storeStock,
      (net.online ? net.clock.serverNow(now) : Date.now()) / 1000,
      raidersFeet(feetY)
    )
    slurmCues = shelves.cues
    if (shelves.curse) actions.npcSays('carlsten', shelves.curse)
    // And the streetlights' real lights to the nearest lamps.
    world.streetlights.update(player.pos.x, player.pos.z)
  }

  // The lookout tower's ladder, and whether the raider is up on its deck.
  const lookoutSpot = () =>
    world.lookout && {
      foot: world.lookout.foot,
      top: world.lookout.top,
      on: world.lookout.on(player.pos.x, player.pos.z),
    }

  // The heart of the maze, while the raider carries Erwin's rose to lay
  // there (rule 26).
  const heartSpot = () =>
    world.portal &&
    s.quests?.rose === 'given' &&
    (s.inventory.rose ?? 0) > 0 &&
    !s.pendingQuest
      ? world.portal.at
      : null

  // The office's door, while it will not let this raider through.
  const lockedDoor = () =>
    world.plaza &&
    !passes(
      world.plaza.lock,
      s.inventory,
      world.plaza.inBackRoom(player.pos.x, player.pos.z)
    )
      ? world.plaza.doorAt
      : null

  // What E would do right now.
  const resolveE = (bushes: BushSpot[]) => {
    const inStore = targets.storeIndex()
    s.interaction = resolveInteraction({
      riding: s.aboard,
      player: player.pos,
      truck: {
        distance: truck.distanceTo(player.pos.x, player.pos.z),
        moving: truck.moving,
        boardable: s.world ? boardable(s.world.truck.leg, net.id) : false,
        at: { x: truck.x, z: truck.z },
      },
      // What lies dropped answers to E like any pickup.
      pickups: allPickups(),
      walled: world.walls.between,
      view: targets.view(),
      shelf: targets.shelfInView(inStore),
      bushes,
      gron: world.gron,
      npcs: targets.npcSpots(inStore),
      moabOffer: s.pending.trade ? null : moabOffer(s.inventory, s.cosmetics),
      corpses: s.corpses.filter(
        (c) => s.myCorpses.includes(c.id) && !s.pending.loots.has(c.id)
      ),
      lockers: targets.lockerSpots(inStore),
      laptops: targets.laptopSpots(inStore),
      stand: world.stand?.at ?? null,
      wreck: world.wreck
        ? { x: world.wreck.group.position.x, z: world.wreck.group.position.z }
        : null,
      // A jar with room anywhere in the pack: E or the click scoops,
      // bringing it to hand (actions.ts jarSlurm).
      slurms: jarRoom(s.inventory) ? world.shelves.crawlingSlurms() : [],
      tackle: nearestLanding(
        world.ponds.map((pond) => pond.place),
        player.pos
      ),
      cast:
        s.held === 'rod' &&
        !s.line &&
        !s.pending.fish &&
        inPond(
          world.ponds.map((pond) => pond.place),
          player.pos
        )
          ? { bait: baitFor(s.bait, s.inventory) }
          : undefined,
      dealer: world.plaza?.dealer.at ?? null,
      trapdoor: world.undercroft?.hatch ?? null,
      ladder: world.undercroft?.foot ?? null,
      lookout: lookoutSpot(),
      heart: heartSpot(),
      locked: lockedDoor(),
      hallucinations: s.aboard ? [] : game.hallucinations.spots(),
      raider: s.aboard
        ? null
        : passTarget(player.pos, player.yaw, game.peers.standing()),
    })
  }

  // What says what E would do: the prompt, the item's label, the glow, the
  // reticle, and the bushes bare or in berry.
  const showE = (now: number, bushes: BushSpot[]) => {
    const interaction = s.interaction
    // Rule 14: Moab makes his offer as you come into his reach.
    const offering =
      interaction?.kind === 'trade' && interaction.offer !== null
        ? interaction.station
        : null
    if (
      interaction?.kind === 'trade' &&
      interaction.offer !== null &&
      offering !== null &&
      offering !== s.offeredBy
    ) {
      actions.offerTrade(interaction.offer)
    }
    s.offeredBy = offering
    const key = interaction ? interactionKey(interaction) : null
    if (key !== promptKey) {
      promptKey = key
      prompt = interaction ? interactionPrompt(interaction) : null
      label = interaction ? itemLabel(interaction) : null
    }
    const labelTo = label ? targets.labelTarget(interaction) : null
    const labelSpot = labelTo ? targets.labelAt(labelTo) : null
    glow.setTarget(targets.glowTarget(interaction))
    // Today's berry picked, a bush stands bare until midnight Central.
    for (const [i, bush] of world.bushes.entries()) {
      bush.setBerries(bushes[i].status !== 'picked')
    }
    const clear = now >= s.strikeUntil
    hud.setReticleActive(clear && interaction !== null)
    hud.itemLabel(
      player.locked && clear && label && labelSpot
        ? { ...label, ...labelSpot }
        : null
    )
    // With the pointer free, the red edge round the view says so (hud.ts).
    hud.prompt(player.locked && clear ? prompt : null)
  }

  const draw = (time: number) => {
    sky.position.set(player.pos.x, 0, player.pos.z)
    // What a trip shows that is not there, round the eye and in the sky.
    const tripping = levelsAt(s.wards, time).tripping
    solids.update(tripping, time, camera.position)
    constellations.update(tripping, time)
    if (s.inventoryOpen) {
      hud.setBagStatus({ cash: formatCash(s.cash) })
    }
    if (!s.talking && DRAW_VALLEY) {
      const view = wardView(
        levelsAt(s.wards, time),
        tripBlur(s.effects.trip, time)
      )
      trails.render(scene, camera, view)
      if (player.locked && !s.inventoryOpen) {
        glow.render(scene, camera, time)
      }
    } else if (!s.talking) {
      // Undrawn, the matrices that drawing brings up to date still are:
      // the item labels project through the camera, and the glow and the
      // shelves read where things stand.
      scene.updateMatrixWorld()
      camera.updateMatrixWorld()
    }
    // While Gron talks, his dialog covers the view and draws its own
    // turntable; the valley runs on behind it undrawn, holding its last
    // frame, so the page is not drawing two scenes at once.
  }

  const frame = () => {
    const clock = advanceClocks()
    const feet = rideOrWalk(clock)
    // The clods his wheels throw and the ruts they cut.
    donutWake?.update(clock.dt, truck)
    stepAudio(clock.now)
    tellTruckRolls()
    const lit = raiseHands(clock)
    // The others are drawn a beat behind the present, so two of their
    // frames always bracket the moment: the peers, and the valley's
    // shadowmen.
    const renderAt = clock.now - CONFIG.net.interpolateMs
    const { swarm, keeper } = stepShadows(clock, renderAt)
    stepScenery(clock, feet.feetY)
    stepHallucinations(clock)
    const portalNow = stepPortals(clock)
    drawMap()
    feelStrikes(clock.now)
    peers.update(clock.dt, renderAt)
    hud.setParty(peers.party(camera.position, partyMates()))
    const tick = sendState(clock, feet, lit)
    stepHud(clock)
    stepPhone(clock.dt, portalNow)
    discoverBook(tick, swarm, keeper)
    pulsePickups(clock.time)
    followPlayer(clock.now, feet.feetY)
    const bushes = bushSpots(clock.now)
    resolveE(bushes)
    showE(clock.now, bushes)
    draw(clock.time)
  }

  // A throw anywhere in the frame would otherwise end the game in
  // silence: Three asks for no next frame after a callback throws, and
  // the view freezes with only a console error behind it. The loop stops
  // for good, and the Begin button says the valley will not resolve.
  renderer.setAnimationLoop(() => {
    try {
      frame()
    } catch (err) {
      renderer.setAnimationLoop(null)
      console.error('Shadow Wars stopped mid-frame:', err)
      if (document.pointerLockElement) document.exitPointerLock()
      hud.showIntro(true, true)
      hud.setBegin('failed')
    }
  })
}
