// The frame: the clocks, the ride or the walk, the shadowmen and the mist,
// the maze portal, the state frame to the valley, the HUD and the hotbar,
// what E would do, and the draw.

import * as THREE from 'three'
import { pulseMaterials } from './assets.ts'
import { CONFIG } from './config.ts'
import { copy } from './copy.ts'
import { ease, stepHand, useLift, useSeconds } from './hands.ts'
import { cooldownOf, shownSlots } from './hotbar.ts'
import {
  dailyStatus,
  interactionPrompt,
  itemLabel,
  resolveInteraction,
} from './interactions.ts'
import { inPortal } from './maze.ts'
import { packItemOf } from './packgrid.ts'
import { poseOf, stateChanged } from './presence.ts'
import { advance, EVENTS, loadoutClock, STATES, timedOut } from './raid.ts'
import { lobbyCount, seatOf } from './raidsync.ts'
import { formatCash } from './store.ts'
import type { Actions } from './actions.ts'
import type { Game } from './game.ts'
import type { PeerStateWire } from './protocol.ts'
import type { Beam } from './shadowmen.ts'
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
    bursts,
    mist,
    glow,
    thumbs,
    peers,
  } = game
  const ridingForward = new THREE.Vector3(0, 0, -1)
  // Where the eye looks, for the flashlight's beam.
  const sight = new THREE.Vector3()

  // The countdown, with the lobby's headcount when others are in it.
  const lobbyLine = () => {
    const clock = loadoutClock(s.raid, s.raidClock)
    const count = lobbyCount(s.shared)
    return count ? copy('truck.lobby_count', { clock, ...count }) : clock
  }

  // How the bush stands for this player right now.
  const daily = () =>
    dailyStatus(
      net.online ? s.daily : null,
      net.clock.serverNow(performance.now())
    )

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
    // The valley is persistent: once the raid begins, the clock never pauses —
    // not for the intro overlay, not for a dropped pointer lock. The truck
    // keeps its own schedule. In the shared valley the clock is the
    // server's, read through the offset, so every player counts together.
    // Alone it is the wall clock too, never the capped step: at a few frames
    // a second the capped step would stretch the five-minute loadout into
    // half an hour.
    if (s.shared) {
      s.raidClock = Math.max(
        0,
        (net.clock.serverNow(now) - s.shared.startedAt) / 1000
      )
    } else if (s.started && !s.ended) {
      s.raidClock += elapsed
    }

    const smoking = time < s.effects.smoking.end
    const perception = time < s.effects.perception.end

    // The truck leaves on the timer whether you're aboard or not. In the
    // shared valley the server's clock says when.
    if (!s.shared && timedOut(s.raid, s.raidClock)) {
      s.raid = advance(s.raid, EVENTS.TIMER_EXPIRED, s.raidClock)
      actions.truckLeaves()
      s.onTruckRolls = [copy('log.left_behind')]
    }

    let forward = ridingForward
    // Where the feet stand and how, for the body and for the wire.
    let feetY: number
    let moveSpeed = 0
    let crouching = false
    if (s.raid.state === STATES.RIDING || s.aboard) {
      // The one place the camera leaves player.update(): ride the bed with
      // free look, keeping player.pos honest for the scope.
      const truckState = truck.update(dt, now)
      const seat = truck.bedSeat(seatOf(s.shared, net.id))
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
      if (truckState.done && s.raid.state === STATES.RIDING) {
        actions.hopOut(copy('log.end_of_line'))
      }
    } else {
      const playerState = player.update(dt, {
        speedScale:
          (scope.raised ? CONFIG.player.scopeSpeedScale : 1) *
          (smoking ? CONFIG.items.smokingSpeedScale : 1),
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
    if (s.onTruckRolls.length && truck.rolling()) {
      for (const line of s.onTruckRolls) hud.tell(line)
      s.onTruckRolls = []
    }

    // The hands: the flashlight lit once it is all the way up, and the
    // item just used brought up once. Under prefers-reduced-motion they
    // are up or down, never between.
    s.flashlight = stepHand(s.flashlight, dt)
    if (s.using && time - s.using.at >= useSeconds()) s.using = null
    const lit = s.flashlight.up && s.flashlight.lift >= 1
    const using = s.using ? useLift(s.using.at, time) : 0
    hands.update({
      left: game.still ? Number(s.flashlight.up) : ease(s.flashlight.lift),
      right: game.still ? Number(using > 0) : ease(using),
      kind: s.using?.kind ?? null,
      on: lit,
    })
    let beam: Beam | null = null
    if (lit) {
      camera.getWorldDirection(sight)
      beam = {
        origin: camera.position,
        dir: sight,
        range: CONFIG.flashlight.range,
        halfAngle: CONFIG.flashlight.halfAngle,
      }
    }

    // The shadowmen cross whatever the raid is doing, but only rush and touch
    // a player on foot who is not already coming to from the last strike.
    const vulnerable =
      s.started &&
      !s.ended &&
      s.raid.state === STATES.ON_FOOT &&
      now >= s.strikeUntil
    const swarm = shadowmen.update({
      dt,
      player: player.pos,
      vulnerable,
      perception,
      beam,
    })
    if (swarm.struck) actions.strike()
    for (const at of swarm.bursts) {
      const y = world.ground.at(at.x, at.z) + CONFIG.shadowmen.chestHeight
      bursts.spawn(at.x, y, at.z)
    }
    bursts.update(dt)
    mist.update({ dt, player: player.pos })
    // Gron's rain falls on its own clock; under prefers-reduced-motion it
    // hangs still under the cloud.
    world.gronRig?.update(game.still ? 0.37 : time)
    // Moab's fire burns on the same clock, and holds still with the rain.
    for (const rig of world.moabRigs) rig.update(game.still ? 0.4 : time)
    // The portal at the maze's heart swirls, and anyone on foot who walks
    // into it comes out on the trail outside the gate.
    const portal = world.portal
    if (portal) {
      portal.rig.update(game.still ? 0.5 : time)
      const { x, z } = player.pos
      if (!s.aboard && inPortal(x, z, portal.at, CONFIG.maze.portal.radius)) {
        player.relocate(portal.exit.x, portal.exit.z, portal.exit.yaw)
        hud.tell(copy('log.portal'))
      }
    }
    if (now < s.strikeUntil) hud.drawStatic()
    else if (!hud.staticWrap.hidden) hud.showStatic(false)

    // The others are drawn a beat behind the present, so two of their
    // frames always bracket the moment. Ours goes out on a fixed cadence,
    // and only when it changed.
    const renderAt = now - CONFIG.net.interpolateMs
    peers.update(dt, renderAt)
    s.sinceSent += dt
    if (net.online && !s.ended && s.sinceSent >= 1 / CONFIG.net.sendHz) {
      s.sinceSent = 0
      const state: PeerStateWire = {
        x: player.pos.x,
        y: feetY,
        z: player.pos.z,
        yaw: player.yaw,
        pose: poseOf(moveSpeed, crouching),
        riding: s.raid.state === STATES.RIDING || s.aboard,
        light: s.flashlight.up,
      }
      if (stateChanged(s.lastSent, state)) {
        s.lastSent = state
        net.sendState(state)
      }
    }

    hud.setCountdown(s.raid.state === STATES.LOADOUT ? lobbyLine() : null)

    hud.setHotbar(
      shownSlots(s.hotbar).flatMap(({ slot, kind }) => {
        const item = packItemOf(kind, s.inventory, s.raid)
        if (!item) return []
        const cooldown = cooldownOf(kind, s.effects, time)
        return [{ slot, item, icon: thumbs.icon(kind), cooldown }]
      })
    )
    hud.tickChat(performance.now())

    scope.draw(dt, {
      contacts: [
        ...swarm.contacts,
        ...peers.contacts(player.pos, CONFIG.scope.rangeMetres, renderAt),
      ],
      forward,
      perception,
    })

    // Pickups pulse every frame, whatever the prompt says.
    const pulse = 0.35 + Math.sin(time * 3) * 0.2
    for (const pickup of world.pickups) {
      if (pickup.taken) continue
      for (const m of pulseMaterials(pickup.mesh)) m.emissiveIntensity = pulse
    }

    // The stocked shelves follow the player to the nearest store.
    world.shelves.update(player.pos.x, player.pos.z, s.storeStock)
    // And the streetlights' real lights to the nearest lamps.
    world.streetlights.update(player.pos.x, player.pos.z)

    // --- Interactions: what E would do right now -------------------------
    const inStore = targets.storeIndex()
    const bush = daily()
    s.interaction = s.aboard
      ? { kind: 'hopOut' }
      : resolveInteraction({
          raid: s.raid,
          ended: s.ended,
          player: player.pos,
          truck: {
            distance: truck.distanceTo(player.pos.x, player.pos.z),
            moving: truck.moving,
          },
          keep: game.keep,
          stations: world.fuelPoints,
          spawnStation: game.spawnStation,
          pickups: world.pickups,
          shelf: targets.shelfInView(inStore),
          insideStore: inStore >= 0,
          bush: world.bush,
          daily: bush,
          gron: world.gron,
          npcs: targets.npcSpots(inStore),
        })
    const interaction = s.interaction
    const prompt = interaction ? interactionPrompt(interaction) : null
    const label = interaction ? itemLabel(interaction) : null
    const labelTo = label ? targets.labelTarget(interaction) : null
    const labelSpot = labelTo ? targets.labelAt(labelTo) : null
    glow.setTarget(targets.glowTarget(interaction))
    // Today's berry picked, the bush stands bare until midnight Central.
    world.setBerries(bush !== 'picked')
    const clear = !s.ended && now >= s.strikeUntil
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
      renderer.render(scene, camera)
      if (player.locked && !s.ended && !s.inventoryOpen) {
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
