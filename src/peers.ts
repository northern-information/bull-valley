// The other players in the valley, drawn: one shared figure per peer in
// their outfit, posed from the state they sent, with their name and level
// on a small pixelated sprite overhead, and their geometrie in a thin bar
// under it (sharedworld.ts rule 24). The data lives in presence.ts; this is the
// Three glue that reads it every frame.

import * as THREE from 'three'
import { disposeTree } from './assets.ts'
import { canvas, EGGSHELL, MONO, text } from './canvas.ts'
import { copy } from './copy.ts'
import { EMOTES, isEmote } from './emotes.ts'
import {
  applyJoints,
  applyPose,
  attachCosmetics,
  attachFlashlight,
  buildFigure,
} from './figure.ts'
import { flashlightArm, samplePose, strideOf, stridePose } from './poses.ts'
import {
  applyHealth,
  applyJoined,
  applyLeft,
  applyState,
  applyUpdated,
  applyWelcome,
  createPeerTable,
  samplePeer,
} from './presence.ts'
import type { Flashlight } from './assets.ts'
import type { Figure, Worn } from './figure.ts'
import type { Peer, PeerTable } from './presence.ts'
import type { PeerStateWire, PeerWire } from './protocol.ts'

// The name floats this far above the feet. A figure stands about 1.8 m;
// in the Flaming Halo, the name floats over the fire.
const LABEL_HEIGHT = 2.0
const LABEL_OVER_HALO = 2.25
// The label canvas: power-of-two sides, drawn once per peer.
const LABEL_W = 128
const LABEL_H = 32
// Their geometrie, a thin bar just under the name: canvas pixels, drawn
// again only when the share moves a pixel.
const BAR_W = 64
const BAR_H = 4
const BAR_UNDER = 0.17
// Given back, the bar climbs to its new share over this long rather than
// snapping; a loss lands at once.
const RISE_SECONDS = 0.6
// The party list (partyhud.ts) names this many, nearest first.
const PARTY_MAX = 6

// A peer in the party list: who, their geometrie, and how far off.
export interface PartyMember {
  id: string
  name: string
  health: number
  max: number
  distance: number
}

interface Puppet {
  figure: Figure
  // In the left hand, its own materials: disposed with the label.
  flashlight: Flashlight
  // Their cosmetics, their own too.
  worn: Worn
  label: THREE.Sprite
  texture: THREE.CanvasTexture
  bar: HealthBar
  cycle: number
  // Where they were drawn this frame, for the party list's order; null
  // while unplaced.
  at: { x: number; z: number } | null
}

interface HealthBar {
  sprite: THREE.Sprite
  texture: THREE.CanvasTexture
  ctx: CanvasRenderingContext2D
  // The share drawn now, and the share the valley last said.
  shown: number
  target: number
  // The fill in canvas pixels as last drawn.
  drawn: number
}

function buildHealthBar(): HealthBar {
  const art = canvas([BAR_W, BAR_H])
  const texture = new THREE.CanvasTexture(art.c)
  texture.magFilter = THREE.NearestFilter
  texture.minFilter = THREE.NearestFilter
  texture.colorSpace = THREE.SRGBColorSpace
  const material = new THREE.SpriteMaterial({
    map: texture,
    transparent: true,
    depthWrite: false,
    fog: true,
  })
  const sprite = new THREE.Sprite(material)
  sprite.scale.set(0.6, 0.6 * (BAR_H / BAR_W), 1)
  return { sprite, texture, ctx: art.ctx, shown: 1, target: 1, drawn: -1 }
}

// The bar as Elden Ring draws it: a dull gilt hairline round a dark well,
// filled in deep crimson.
function drawHealthBar(bar: HealthBar): void {
  const inner = BAR_W - 2
  const fill = Math.round(inner * Math.max(0, Math.min(1, bar.shown)))
  if (fill === bar.drawn) return
  bar.drawn = fill
  const { ctx } = bar
  ctx.clearRect(0, 0, BAR_W, BAR_H)
  ctx.fillStyle = 'rgb(150 130 100 / 70%)'
  ctx.fillRect(0, 0, BAR_W, BAR_H)
  ctx.fillStyle = 'rgb(10 6 5 / 85%)'
  ctx.fillRect(1, 1, inner, BAR_H - 2)
  ctx.fillStyle = '#9e1b14'
  ctx.fillRect(1, 1, fill, BAR_H - 2)
  bar.texture.needsUpdate = true
}

// A name tag as the peers wear it, its own material and texture to
// dispose; corpsemeshes.ts floats one over each body too.
export function nameLabel(tag: string): {
  sprite: THREE.Sprite
  texture: THREE.CanvasTexture
} {
  const art = canvas([LABEL_W, LABEL_H])
  text(art.ctx, tag, LABEL_W / 2, LABEL_H / 2, LABEL_W - 8, 18, MONO, EGGSHELL)
  const texture = new THREE.CanvasTexture(art.c)
  texture.magFilter = THREE.NearestFilter
  texture.minFilter = THREE.NearestFilter
  texture.colorSpace = THREE.SRGBColorSpace
  const material = new THREE.SpriteMaterial({
    map: texture,
    transparent: true,
    depthWrite: false,
    fog: true,
  })
  const sprite = new THREE.Sprite(material)
  sprite.scale.set(1.2, 0.3, 1)
  sprite.position.y = LABEL_HEIGHT
  return { sprite, texture }
}

export class Peers {
  table: PeerTable
  private scene: THREE.Object3D
  private puppets = new Map<string, Puppet>()
  // Seconds of drawing, for what burns on them.
  private time = 0

  constructor(scene: THREE.Object3D) {
    this.scene = scene
    this.table = createPeerTable()
  }

  get count(): number {
    return this.table.size
  }

  list(): Peer[] {
    return [...this.table.values()]
  }

  // The server's roster on every welcome replaces whoever we had; those
  // still here keep where they stand (presence.ts applyWelcome).
  welcome(roster: readonly PeerWire[], now: number): void {
    for (const id of [...this.puppets.keys()]) this.dispose(id)
    applyWelcome(this.table, roster, now)
    for (const peer of this.table.values()) this.build(peer)
  }

  // Whether they are new: one we still see, back from a dropped line under
  // the same id, keeps where they stand and is only brought up to date.
  joined(wire: PeerWire, now: number): boolean {
    if (this.table.has(wire.id)) {
      this.updated(wire)
      return false
    }
    this.build(applyJoined(this.table, wire, now))
    return true
  }

  // A peer changed their name or character at Gron, took a cosmetic from
  // Moab, or reached a new level: a new figure and label, where they already stand. Unknown ids are ignored.
  updated(wire: PeerWire): void {
    const peer = applyUpdated(this.table, wire)
    if (!peer) return
    this.dispose(wire.id)
    this.build(peer)
  }

  // A peer's geometrie, from the valley's peer-health frame.
  health(id: string, health: number, max: number): void {
    const peer = applyHealth(this.table, id, health, max)
    const puppet = this.puppets.get(id)
    if (!peer || !puppet) return
    const bar = puppet.bar
    bar.target = peer.health / peer.max
    if (bar.target < bar.shown) bar.shown = bar.target
    drawHealthBar(bar)
  }

  // The raiders placed in the valley, nearest `from` first, as the party
  // list shows them: the ones named `mates` alone, when the raider is in a
  // party (sharedworld.ts rule 34), or else everyone near.
  party(
    from: { x: number; z: number },
    mates: readonly string[] = []
  ): PartyMember[] {
    const members: PartyMember[] = []
    for (const [id, puppet] of this.puppets) {
      const peer = this.table.get(id)
      if (!peer || peer.dialup || !puppet.at) continue
      if (mates.length > 0 && !mates.includes(peer.name)) continue
      const { name, health, max } = peer
      const distance = Math.hypot(puppet.at.x - from.x, puppet.at.z - from.z)
      members.push({ id, name, health, max, distance })
    }
    members.sort((a, b) => a.distance - b.distance)
    return members.slice(0, PARTY_MAX)
  }

  // The raiders named `names` placed in the valley, where their last
  // state put them and which way they face: the party on the map.
  placed(
    names: readonly string[]
  ): { name: string; x: number; z: number; yaw: number }[] {
    return this.list().flatMap(({ name, next, dialup }) =>
      next && !dialup && names.includes(name)
        ? [{ name, x: next.x, z: next.z, yaw: next.yaw }]
        : []
    )
  }

  // The raiders standing in the valley (placed, and not riding), where
  // their last state put them: who E or G reaches (buffs.ts passTarget).
  standing(): { id: string; name: string; x: number; z: number }[] {
    return this.list().flatMap(({ id, name, next }) =>
      next && !next.riding ? [{ id, name, x: next.x, z: next.z }] : []
    )
  }

  state(id: string, state: PeerStateWire, now: number, due = now): void {
    applyState(this.table, id, state, now, due)
  }

  left(id: string): void {
    this.dispose(id)
    applyLeft(this.table, id)
  }

  clear(): void {
    for (const id of [...this.puppets.keys()]) this.dispose(id)
    this.table.clear()
  }

  // Draws every placed peer at renderAt, a moment behind the present.
  update(dt: number, renderAt: number): void {
    this.time += dt
    for (const [id, puppet] of this.puppets) {
      // Their bar climbs to what was given back.
      const bar = puppet.bar
      if (bar.shown < bar.target) {
        bar.shown = Math.min(bar.target, bar.shown + dt / RISE_SECONDS)
        drawHealthBar(bar)
      }
      const peer = this.table.get(id)
      const at = peer ? samplePeer(peer, renderAt) : null
      const group = puppet.figure.group
      if (!at) {
        group.visible = false
        puppet.at = null
        continue
      }
      group.visible = true
      puppet.at = { x: at.x, z: at.z }
      // The figure faces +Z; a player faces -Z at yaw 0.
      group.rotation.y = at.yaw + Math.PI
      group.position.set(at.x, at.y, at.z)
      if (at.pose === 'crouch') {
        applyPose(puppet.figure, samplePose('crouch'))
      } else if (isEmote(at.pose)) {
        // An emote (emotes.ts), its cycle on this page's clock.
        applyPose(puppet.figure, samplePose(EMOTES[at.pose].pose, this.time))
      } else if (at.pose === 'walk' && at.speed > 0.3) {
        puppet.cycle += (at.speed * dt) / strideOf(at.speed)
        applyPose(puppet.figure, stridePose(puppet.cycle, at.speed))
      } else {
        applyPose(puppet.figure, samplePose('stand'))
      }
      // The flashlight up and on, whatever the legs are doing.
      if (at.light) applyJoints(puppet.figure, flashlightArm(at.pitch))
      puppet.flashlight.setOn(at.light)
      puppet.worn.update(this.time)
    }
  }

  private build(peer: Peer): void {
    const figure = buildFigure(peer.outfit)
    figure.group.name = `peer-${peer.id}`
    figure.group.userData.peer = peer.id
    figure.group.userData.playerName = peer.name
    figure.group.visible = false
    const flashlight = attachFlashlight(figure)
    const worn = attachCosmetics(figure, peer.cosmetics)
    const { sprite, texture } = nameLabel(
      copy('level.tag', { name: peer.name, level: peer.level })
    )
    if (peer.cosmetics.includes('flaming-halo')) {
      sprite.position.y = LABEL_OVER_HALO
    }
    const bar = buildHealthBar()
    bar.sprite.position.y = sprite.position.y - BAR_UNDER
    bar.shown = bar.target = peer.health / peer.max
    drawHealthBar(bar)
    figure.group.add(sprite, bar.sprite)
    this.scene.add(figure.group)
    this.puppets.set(peer.id, {
      figure,
      flashlight,
      worn,
      label: sprite,
      texture,
      bar,
      cycle: 0,
      at: null,
    })
  }

  // The figure's geometry and materials are shared with every other figure
  // in the game and are never disposed; the label and the flashlight are
  // this peer's alone.
  private dispose(id: string): void {
    const puppet = this.puppets.get(id)
    if (!puppet) return
    this.scene.remove(puppet.figure.group)
    // The flashlight's lens glow texture is shared; nothing else of it is.
    disposeTree(puppet.flashlight.group)
    puppet.worn.dispose()
    puppet.label.material.dispose()
    puppet.texture.dispose()
    puppet.bar.sprite.material.dispose()
    puppet.bar.texture.dispose()
    this.puppets.delete(id)
  }
}
