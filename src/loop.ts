// The frame: the clocks, the ride or the walk, the shadowmen and the mist,
// the maze portal, the state frame to the valley, the HUD and the hotbar,
// what E would do, and the draw.

import * as THREE from 'three'
import { pulseMaterials } from './assets.ts'
import { itemsHeld, sightsInReach } from './book.ts'
import { CONFIG } from './config.ts'
import { copy } from './copy.ts'
import { moabOffer } from './cosmetics.ts'
import { dayKey } from './daily.ts'
import { onDay, shownCount } from './dailytask.ts'
import { EMOTES, holds } from './emotes.ts'
import { levelsAt } from './geometrie.ts'
import { ease, stepHand, useLift, useSeconds } from './hands.ts'
import { shakeAt } from './health.ts'
import { cooldownOf, shownSlots } from './hotbar.ts'
import {
  dailyStatus,
  interactionKey,
  interactionPrompt,
  itemLabel,
  resolveInteraction,
} from './interactions.ts'
import { settleTruck } from './marx.ts'
import { inPortal } from './maze.ts'
import { packItemOf } from './packgrid.ts'
import { poseOf, stateChanged } from './presence.ts'
import {
  aimHeightOf,
  beamFrom,
  burstScaleOf,
  headlightBeam,
  headlightsDue,
  inHaven,
} from './shadowmen.ts'
import { formatCash } from './store.ts'
import { tripLevel } from './trip.ts'
import { boardable, clockText, countdown, seatOf } from './worldsync.ts'
import type { Actions } from './actions.ts'
import type { Game } from './game.ts'
import type { BushSpot } from './interactions.ts'
import type { ScopeContact } from './interfaces.ts'
import type { DailyWire, PeerStateWire } from './protocol.ts'
import type { HeadlightsSent } from './shadowmen.ts'
import type { Targets } from './targets.ts'
import type { Pickup } from './world.ts'

// Under e2e (--mode test) the valley runs but is never drawn. The specs
// read the game through window.__bv, never its pixels, and CI draws WebGL
// in software, where one frame of the whole valley can take seconds.
// ps1.ts turns shadows off there too. The inventory, the dialogs and the
// title cards still draw.
const DRAW_VALLEY = import.meta.env.MODE !== 'test'

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
    music,
    settings,
    player,
    playerBody,
    hands,
    scope,
    shadowmen,
    caretaker,
    bursts,
    mist,
    glow,
    trails,
    thumbs,
    peers,
  } = game
  const ridingForward = new THREE.Vector3(0, 0, -1)

  // Marx's countdown, for whoever is in the bed or standing by it. The
  // line is filled again only when its clock reads differently.
  let clockShown = ''
  let clockLine = ''
  const countdownLine = (now: number): string | null => {
    const left = s.world
      ? countdown(s.world.truck, net.clock.serverNow(now))
      : countdown(s.aloneTruck, Date.now())
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

  // The scope's contacts, one list filled each frame it is raised.
  const scopeContacts: ScopeContact[] = []

  // The prompt and the label for what E would do, kept while the
  // interaction reads the same (interactionKey).
  let promptKey: string | null = null
  let prompt: string | null = null
  let label: ReturnType<typeof itemLabel> = null

  // The last word the valley had from us on Marx's headlights.
  let headlightsSent: HeadlightsSent | null = null

  let last = performance.now()
  const frame = () => {
    const now = performance.now()
    // Real seconds since the last frame, and the same capped at maxStep: the
    // capped step moves the player, the item timers, and the animation, so
    // a stalled frame never jumps them ahead.
    const elapsed = (now - last) / 1000
    const dt = Math.min(CONFIG.render.maxStep, elapsed)
    last = now
    s.time += dt
    const { time } = s

    const smoking = time < s.effects.smoking.end
    const perception = time < s.effects.perception.end

    // Played alone, Matthew Marx keeps his day on the wall clock, never the
    // capped step, which on a slow machine would stretch it out of shape.
    // In the shared valley the valley keeps it and says so.
    if (!s.world) {
      const settled = settleTruck(s.aloneTruck, Date.now(), game.truckRoutes)
      if (settled.changes.length > 0) {
        actions.setAloneTruck(settled.truck)
        for (const change of settled.changes) {
          if (change === 'donuts') hud.tell(copy('log.marx_donuts'))
          if (change === 'back') hud.tell(copy('log.marx_back'))
          if (change === 'depart' && s.aboard) {
            s.onTruckRolls = [
              copy('log.truck_leaves'),
              copy('log.hop_out_hint'),
            ]
          }
        }
      }
    }

    let forward = ridingForward
    // Where the feet stand and how, for the body and for the wire.
    let feetY: number
    let moveSpeed = 0
    let crouching = false
    if (s.aboard) {
      // The one place the camera leaves player.update(): ride the bed with
      // free look, keeping player.pos honest for the scope.
      const truckState = truck.update(dt, now)
      const seat = truck.bedSeat(
        s.world
          ? seatOf(s.world, net.id)
          : Math.max(0, s.aloneTruck.riders.indexOf('me'))
      )
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
      // Home at the Citgo: everyone off.
      if (truckState.arrived) actions.hopOut(copy('log.end_of_line'))
    } else {
      const playerState = player.update(dt, {
        speedScale:
          (scope.raised ? CONFIG.player.scopeSpeedScale : 1) *
          (smoking ? CONFIG.items.smokingSpeedScale : 1),
        eye: s.emoting ? EMOTES[s.emoting.id].eye : null,
      })
      forward = playerState.forward
      feetY = player.groundY
      moveSpeed = playerState.speed
      crouching = playerState.crouching
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
    // The valley's music, at the raider's setting.
    music?.update({
      now,
      started: s.started,
      setting: settings.current.music,
    })
    if (s.onTruckRolls.length && truck.rolling()) {
      for (const line of s.onTruckRolls) hud.tell(line)
      s.onTruckRolls = []
    }

    // The hands: the flashlight lit once it is all the way up, and the
    // item just used brought up once.
    s.flashlight = stepHand(s.flashlight, dt)
    if (s.using && time - s.using.at >= useSeconds()) s.using = null
    const lit = s.flashlight.up && s.flashlight.lift >= 1
    const using = s.using ? useLift(s.using.at, time) : 0
    hands.update({
      left: ease(s.flashlight.lift),
      right: ease(using),
      kind: s.using?.kind ?? null,
      on: lit,
    })
    // The others are drawn a beat behind the present, so two of their
    // frames always bracket the moment: the peers, and the valley's
    // shadowmen.
    const renderAt = now - CONFIG.net.interpolateMs

    // The shadowmen cross whatever anyone is doing, but only rush and touch
    // a player on foot who is not already coming to from the last strike.
    // In the shared valley they are the valley's, and it says when one
    // touches you; played alone, this client steps them.
    const alone = net.online
      ? null
      : {
          vulnerable:
            s.started &&
            !s.aboard &&
            now >= s.strikeUntil &&
            now >= s.graceUntil,
          // The same beam the valley would aim from this raider's frame.
          beam: lit
            ? beamFrom(
                { x: player.pos.x, y: feetY, z: player.pos.z },
                player.yaw,
                player.pitch,
                crouching
              )
            : null,
          lights: [headlightBeam(truck.headlights())],
        }
    const swarm = shadowmen.update({
      dt,
      player: player.pos,
      perception,
      alone,
      renderAt,
      myId: net.id,
    })
    if (swarm.struck) actions.strike()
    for (const at of swarm.bursts) {
      // A spider bursts where its body hung, twice as big; a spiderling
      // half as big.
      const size = burstScaleOf(at.kind ?? 'man', CONFIG.shadowmen)
      const y =
        world.ground.at(at.x, at.z) + aimHeightOf(at.kind, CONFIG.shadowmen)
      bursts.spawn(at.x, y, at.z, size)
    }
    // Each leaves its dimes (a spider its $20) and its tombstone where it
    // burst (the valley's do that itself).
    actions.spillBursts(swarm.bursts)
    // The Caretaker walks the maze on the same terms; played alone, one
    // beam is never enough to unmake it.
    const keeper = caretaker.update({
      dt,
      time,
      player: player.pos,
      alone,
      renderAt,
      myId: net.id,
    })
    if (keeper.struck) actions.strike('caretaker')
    for (const at of keeper.unmade) {
      const y = world.ground.at(at.x, at.z) + CONFIG.caretaker.chestHeight
      bursts.spawn(at.x, y, at.z)
    }
    bursts.update(dt)
    mist.update({ dt, player: player.pos })
    // What moves on its own is stepped only within the fog's reach of
    // the player (CONFIG.render.liveRadius): each takes a running time,
    // so it is where it should be the moment it comes back into reach.
    const live = (at: { x: number; z: number }, margin = 0) =>
      Math.hypot(at.x - player.pos.x, at.z - player.pos.z) <=
      CONFIG.render.liveRadius + margin
    // Gron's rain falls on its own clock, Moab's fire burns on it too, and
    // the wreck smoulders and blinks on it.
    if (world.gronRig && world.gron && live(world.gron)) {
      world.gronRig.update(time)
    }
    // The stand dressed for this raider's own level (rule 23).
    world.stand?.setLevel(s.stand?.level ?? 1)
    world.moabRigs.forEach((rig, i) => {
      if (live(world.moabs[i])) rig.update(time)
    })
    if (world.wreck && live(world.wreck.group.position)) {
      world.wreck.update(time)
    }
    // The dishes slew on the valley's clock, so every raider sees them
    // look the same way.
    const dishes = world.dishes
    if (dishes && live(dishes.middle, dishes.reach)) {
      dishes.update(net.clock.serverNow(now) / 1000)
    }
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
    if (now < s.strikeUntil) hud.drawStatic()
    else if (!hud.staticWrap.hidden) hud.showStatic(false)
    // Rule 24: played alone, a forecourt makes whole (the valley does
    // that itself). A touch shakes the view a moment.
    if (
      alone &&
      s.started &&
      !s.aboard &&
      inHaven(player.pos, world.fuelPoints, CONFIG.shadowmen.havenRadius)
    ) {
      actions.mendAtForecourt()
    }
    hud.setHealth(s.health)
    const shake = shakeAt((now - s.hurtAt) / 1000)
    if (shake > 0) {
      camera.position.x += (Math.random() * 2 - 1) * shake
      camera.position.y += (Math.random() * 2 - 1) * shake
      camera.rotation.z += (Math.random() * 2 - 1) * shake * 0.5
    }

    // Ours goes out on a fixed cadence, and only when it changed. The
    // same tick paces what need not run every frame (the book's asks).
    peers.update(dt, renderAt)
    s.sinceSent += dt
    const tick = s.sinceSent >= 1 / CONFIG.net.sendHz
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
      }
      if (stateChanged(s.lastSent, state)) {
        s.lastSent = state
        net.sendState(state)
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

    hud.setCountdown(countdownLine(now))

    hud.setHotbar(
      shownSlots(s.hotbar).flatMap(({ slot, kind }) => {
        const item = packItemOf(kind, s.inventory)
        if (!item) return []
        const cooldown = cooldownOf(kind, s.effects, time)
        return [{ slot, item, icon: thumbs.icon(kind), cooldown }]
      })
    )
    hud.setGeometrie(levelsAt(s.geometrie, time))
    // The daily task as it stands on the valley's day: a count from an
    // earlier day reads as nothing done. Alone, nothing is kept to show.
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

    if (scope.raised) {
      scopeContacts.length = 0
      for (const c of swarm.contacts) scopeContacts.push(c)
      if (keeper.contact) scopeContacts.push(keeper.contact)
      for (const c of peers.contacts(
        player.pos,
        CONFIG.scope.rangeMetres,
        renderAt
      )) {
        scopeContacts.push(c)
      }
      scope.draw(dt, { contacts: scopeContacts, forward, perception })
    }

    // The Book of Shadows: the places in reach, a shadow come within
    // sight, and whatever the pack holds, written the first time
    // (actions.ts discover leaves out what is found or asked), looked for
    // on the state frame's cadence.
    if (s.started && tick) {
      const range = CONFIG.book.sightRange
      actions.discover([
        ...sightsInReach(world.sights, player.pos),
        ...(swarm.contacts.some((c) => c.dist <= range) ? ['shadowman'] : []),
        ...(swarm.sighted.includes('spiderling') ? ['spiderling'] : []),
        ...(keeper.contact && keeper.contact.dist <= range
          ? ['caretaker']
          : []),
        ...itemsHeld(s.inventory),
      ])
    }

    // Pickups pulse every frame, whatever the prompt says.
    const pulse = 0.35 + Math.sin(time * 3) * 0.2
    for (const pickup of allPickups()) {
      if (pickup.taken) continue
      for (const m of pulseMaterials(pickup.mesh)) m.emissiveIntensity = pulse
    }

    // The stocked shelves follow the player to the nearest store.
    world.shelves.update(player.pos.x, player.pos.z, s.storeStock)
    // And the streetlights' real lights to the nearest lamps.
    world.streetlights.update(player.pos.x, player.pos.z)

    // --- Interactions: what E would do right now -------------------------
    const inStore = targets.storeIndex()
    const bushes = bushSpots(now)
    const leg = s.world?.truck.leg ?? s.aloneTruck.leg
    s.interaction = resolveInteraction({
      riding: s.aboard,
      player: player.pos,
      truck: {
        distance: truck.distanceTo(player.pos.x, player.pos.z),
        moving: truck.moving,
        boardable: boardable(leg, s.world ? net.id : 'me'),
      },
      // What lies dropped answers to E like any pickup.
      pickups: allPickups(),
      shelf: targets.shelfInView(inStore),
      bushes,
      gron: world.gron,
      npcs: targets.npcSpots(inStore),
      moabOffer: s.pending.trade ? null : moabOffer(s.inventory, s.cosmetics),
      corpses: s.corpses.filter(
        (c) => s.myCorpses.includes(c.id) && !s.pending.loots.has(c.id)
      ),
      lockers: targets.lockerSpots(inStore),
      stand: world.stand?.at ?? null,
    })
    const interaction = s.interaction
    // Rule 14: Moab makes his offer as you come into his reach.
    const offering = interaction?.kind === 'trade' ? interaction.station : null
    if (offering !== null && offering !== s.offeredBy) actions.offerTrade()
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

    sky.position.set(player.pos.x, 0, player.pos.z)
    if (s.inventoryOpen) {
      hud.setBagStatus({ cash: formatCash(s.cash) })
    }
    if (!s.talking && DRAW_VALLEY) {
      trails.render(scene, camera, tripLevel(s.effects.trip, time))
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
