// The other players in the valley, drawn: one shared figure per peer in
// their outfit, posed from the state they sent, with their name on a small
// pixelated sprite overhead. The data lives in presence.ts; this is the
// Three glue that reads it every frame.

import * as THREE from 'three'
import { canvas, SANS, text } from './canvas.ts'
import { applyPose, buildFigure } from './figure.ts'
import { POSES, samplePose } from './poses.ts'
import {
  applyJoined,
  applyLeft,
  applyState,
  applyWelcome,
  createPeerTable,
  peerContacts,
  samplePeer,
} from './presence.ts'
import type { Figure } from './figure.ts'
import type { ScopeContact, XZ } from './interfaces.ts'
import type { Peer, PeerTable } from './presence.ts'
import type { PeerStateWire, PeerWire } from './protocol.ts'

// Metres covered by one full walk cycle; the same stride as playerbody.ts.
const STRIDE = 1.5
// The name floats this far above the feet. A figure stands about 1.8 m.
const LABEL_HEIGHT = 2.0
// The label canvas: power-of-two sides, drawn once per peer.
const LABEL_W = 128
const LABEL_H = 32
const EGGSHELL = '#f0ead6' // --bv-eggshell; canvas cannot read CSS vars

interface Puppet {
  figure: Figure
  label: THREE.Sprite
  texture: THREE.CanvasTexture
  cycle: number
}

function buildLabel(name: string): {
  sprite: THREE.Sprite
  texture: THREE.CanvasTexture
} {
  const art = canvas([LABEL_W, LABEL_H])
  text(art.ctx, name, LABEL_W / 2, LABEL_H / 2, LABEL_W - 8, 18, SANS, EGGSHELL)
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

  // The server's roster on every welcome replaces whoever we had.
  welcome(roster: readonly PeerWire[], now: number): void {
    for (const id of [...this.puppets.keys()]) this.dispose(id)
    applyWelcome(this.table, roster, now)
    for (const peer of this.table.values()) this.build(peer)
  }

  joined(wire: PeerWire, now: number): void {
    if (this.puppets.has(wire.id)) this.dispose(wire.id)
    this.build(applyJoined(this.table, wire, now))
  }

  state(id: string, state: PeerStateWire, now: number): void {
    applyState(this.table, id, state, now)
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
    for (const [id, puppet] of this.puppets) {
      const peer = this.table.get(id)
      const at = peer ? samplePeer(peer, renderAt) : null
      const group = puppet.figure.group
      if (!at) {
        group.visible = false
        continue
      }
      group.visible = true
      // The figure faces +Z; a player faces -Z at yaw 0.
      group.rotation.y = at.yaw + Math.PI
      group.position.set(at.x, at.y, at.z)
      if (at.pose === 'crouch') {
        applyPose(puppet.figure, samplePose('crouch'))
      } else if (at.pose === 'walk' && at.speed > 0.3) {
        puppet.cycle += (at.speed * dt) / STRIDE
        applyPose(
          puppet.figure,
          samplePose('walk', puppet.cycle * POSES.walk.seconds)
        )
      } else {
        applyPose(puppet.figure, samplePose('stand'))
      }
    }
  }

  contacts(origin: XZ, rangeMetres: number, renderAt: number): ScopeContact[] {
    return peerContacts(this.table, origin, rangeMetres, renderAt)
  }

  private build(peer: Peer): void {
    const figure = buildFigure(peer.outfit)
    figure.group.name = `peer-${peer.id}`
    figure.group.userData.peer = peer.id
    figure.group.userData.playerName = peer.name
    figure.group.visible = false
    const { sprite, texture } = buildLabel(peer.name)
    figure.group.add(sprite)
    this.scene.add(figure.group)
    this.puppets.set(peer.id, { figure, label: sprite, texture, cycle: 0 })
  }

  // The figure's geometry and materials are shared with every other figure
  // in the game and are never disposed; the label is this peer's alone.
  private dispose(id: string): void {
    const puppet = this.puppets.get(id)
    if (!puppet) return
    this.scene.remove(puppet.figure.group)
    puppet.label.material.dispose()
    puppet.texture.dispose()
    this.puppets.delete(id)
  }
}
