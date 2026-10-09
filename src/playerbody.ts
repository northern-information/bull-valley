// The player's own body, seen in first person: the shared figure in the
// outfit picked at the character select, legs only, under the camera. Look down and
// there are legs. The torso and arms stay hidden: that close to the camera
// they fill the view as big blocks. It stands, walks with the move speed, and crouches; it switches pose
// without blending, the way PS1 characters snapped between animations.

import { applyPose, buildFigure } from './figure.ts'
import { POSES, samplePose } from './poses.ts'
import type { Figure } from './figure.ts'
import type { OutfitId } from './outfits.ts'
import type { PoseName, PoseSample } from './poses.ts'
import type * as THREE from 'three'

// Where the body stands this frame. ground: the y the feet stand on. yaw:
// the player's yaw (0 faces -Z).
export interface PlayerBodyFrame {
  x: number
  ground: number
  z: number
  yaw: number
  speed: number
  crouching: boolean
  // An emote's pose (emotes.ts) and how long it has held, in seconds,
  // over the stand and walk.
  emote?: { pose: PoseName; seconds: number } | null
}

// Metres covered by one full walk cycle (two steps).
const STRIDE = 1.5
// The body sits this far behind the camera, so the camera never ends up
// inside the chest and looking down shows the legs ahead of the feet.
const BACKSET = 0.2

export class PlayerBody {
  figure: Figure
  cycle: number
  private scene: THREE.Object3D

  // guitarFinish colors the guitar on the back, for an outfit with one; it
  // rides along unseen in first person, the same body as the select showed.
  constructor(
    scene: THREE.Object3D,
    outfitId: OutfitId,
    guitarFinish?: string
  ) {
    this.scene = scene
    this.figure = PlayerBody.build(outfitId, guitarFinish)
    scene.add(this.figure.group)
    this.cycle = 0
  }

  // A new body in place of the old, for a new character from Gron. The
  // next update() puts it where the old one stood. The old body's geometry
  // and materials are shared with every figure, so nothing is disposed.
  restyle(outfitId: OutfitId, guitarFinish?: string): void {
    this.scene.remove(this.figure.group)
    this.figure = PlayerBody.build(outfitId, guitarFinish)
    this.scene.add(this.figure.group)
  }

  private static build(outfitId: OutfitId, guitarFinish?: string): Figure {
    const figure = buildFigure(outfitId, { head: false, guitarFinish })
    figure.group.name = 'player-body'
    figure.group.userData.outfit = outfitId
    figure.group.userData.guitarFinish = guitarFinish
    // The arms hang off the spine, so this hides the torso and both arms.
    figure.joints.spine.visible = false
    return figure
  }

  update(
    dt: number,
    { x, ground, z, yaw, speed, crouching, emote }: PlayerBodyFrame
  ): void {
    const group = this.figure.group
    // The figure faces +Z; the player faces -Z at yaw 0.
    group.rotation.y = yaw + Math.PI
    const fx = -Math.sin(yaw)
    const fz = -Math.cos(yaw)
    group.position.set(x - fx * BACKSET, ground, z - fz * BACKSET)

    let pose: PoseSample
    if (crouching) {
      pose = samplePose('crouch')
    } else if (emote) {
      pose = samplePose(emote.pose, emote.seconds)
    } else if (speed > 0.3) {
      this.cycle += (speed * dt) / STRIDE
      pose = samplePose('walk', this.cycle * POSES.walk.seconds)
    } else {
      pose = samplePose('stand')
    }
    applyPose(this.figure, pose)
  }
}
