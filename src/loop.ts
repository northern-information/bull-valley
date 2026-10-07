// The frame: the clocks, the ride or the walk, the shadowmen and the mist,
// the maze portal, the state frame to the valley, the HUD and the hotbar,
// what E would do, and the draw.

import * as THREE from 'three'
import { pulseMaterials } from './assets.ts'
import { CONFIG } from './config.ts'
import { copy } from './copy.ts'
import { moabOffer } from './cosmetics.ts'
import { levelsAt } from './geometrie.ts'
import { ease, stepHand, useLift, useSeconds } from './hands.ts'
import { cooldownOf, shownSlots } from './hotbar.ts'
import {
  dailyStatus,
  interactionPrompt,
  itemLabel,
  resolveInteraction,
} from './interactions.ts'
import { settleTruck } from './marx.ts'
import { inPortal } from './maze.ts'
import { packItemOf } from './packgrid.ts'
import { poseOf, stateChanged } from './presence.ts'
import { beamFrom } from './shadowmen.ts'
import { formatCash } from './store.ts'
import { tripLevel } from './trip.ts'
import { boardable, clockText, countdown, seatOf } from './worldsync.ts'
import type { Actions } from './actions.ts'
import type { Game } from './game.ts'
import type { PeerStateWire } from './protocol.ts'
import type { Targets } from './targets.ts'

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

  // Marx's countdown, for whoever is in the bed or standing by it.
  const countdownLine = (now: number): string | null => {
    const left = s.world
      ? countdown(s.world.truck, net.clock.serverNow(now))
      : countdown(s.aloneTruck, Date.now())
    if (left === null) return null
    const near =
      s.aboard ||
      truck.distanceTo(player.pos.x, player.pos.z) < CONFIG.truck.countdownReach
    return near ? copy('truck.leaves_in', { clock: clockText(left) }) : null
  }

  // How each bush stands for this player right now.
  const bushSpots = () => {
    const daily = net.online ? s.daily : null
    const now = net.clock.serverNow(performance.now())
    return world.bushes.map(({ id, x, z }) => ({
      id,
      x,
      z,
      status: dailyStatus(daily, id, now),
    }))
  }

  let last = performance.now()
  renderer.setAnimationLoop(() => {
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
          vulnerable: s.started && !s.aboard && now >= s.strikeUntil,
          // The same beam the valley would aim from this raider's frame.
          beam: lit
            ? beamFrom(
                { x: player.pos.x, y: feetY, z: player.pos.z },
                player.yaw,
                player.pitch,
                crouching
              )
            : null,
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
      const y = world.ground.at(at.x, at.z) + CONFIG.shadowmen.chestHeight
      bursts.spawn(at.x, y, at.z)
    }
    // Each leaves its dimes where it burst (the valley's do that itself).
    actions.spillDimes(swarm.bursts)
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
    // Gron's rain falls on its own clock, and Moab's fire burns on it too.
    world.gronRig?.update(time)
    for (const rig of world.moabRigs) rig.update(time)
    // The portal at the maze's heart swirls, and anyone on foot who walks
    // into it comes out on the trail outside the gate.
    const portal = world.portal
    if (portal) {
      portal.rig.update(time)
      const { x, z } = player.pos
      if (!s.aboard && inPortal(x, z, portal.at, CONFIG.maze.portal.radius)) {
        player.relocate(portal.exit.x, portal.exit.z, portal.exit.yaw)
        hud.tell(copy('log.portal'))
      }
    }
    if (now < s.strikeUntil) hud.drawStatic()
    else if (!hud.staticWrap.hidden) hud.showStatic(false)

    // Ours goes out on a fixed cadence, and only when it changed.
    peers.update(dt, renderAt)
    s.sinceSent += dt
    if (net.online && s.sinceSent >= 1 / CONFIG.net.sendHz) {
      s.sinceSent = 0
      const state: PeerStateWire = {
        x: player.pos.x,
        y: feetY,
        z: player.pos.z,
        yaw: player.yaw,
        pitch: player.pitch,
        pose: poseOf(moveSpeed, crouching),
        riding: s.aboard,
        light: lit,
      }
      if (stateChanged(s.lastSent, state)) {
        s.lastSent = state
        net.sendState(state)
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
    hud.tickChat(performance.now())

    scope.draw(dt, {
      contacts: [
        ...swarm.contacts,
        ...(keeper.contact ? [keeper.contact] : []),
        ...peers.contacts(player.pos, CONFIG.scope.rangeMetres, renderAt),
      ],
      forward,
      perception,
    })

    // Pickups pulse every frame, whatever the prompt says.
    const pulse = 0.35 + Math.sin(time * 3) * 0.2
    for (const pickup of [...world.pickups, ...game.drops.pickups]) {
      if (pickup.taken) continue
      for (const m of pulseMaterials(pickup.mesh)) m.emissiveIntensity = pulse
    }

    // The stocked shelves follow the player to the nearest store.
    world.shelves.update(player.pos.x, player.pos.z, s.storeStock)
    // And the streetlights' real lights to the nearest lamps.
    world.streetlights.update(player.pos.x, player.pos.z)

    // --- Interactions: what E would do right now -------------------------
    const inStore = targets.storeIndex()
    const bushes = bushSpots()
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
      pickups: [...world.pickups, ...game.drops.pickups],
      shelf: targets.shelfInView(inStore),
      bushes,
      gron: world.gron,
      npcs: targets.npcSpots(inStore),
      moabOffer: s.pendingTrade ? null : moabOffer(s.inventory, s.cosmetics),
    })
    const interaction = s.interaction
    // Rule 14: Moab makes his offer as you come into his reach.
    const offering = interaction?.kind === 'trade' ? interaction.station : null
    if (offering !== null && offering !== s.offeredBy) actions.offerTrade()
    s.offeredBy = offering
    const prompt = interaction ? interactionPrompt(interaction) : null
    const label = interaction ? itemLabel(interaction) : null
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
  })
}
