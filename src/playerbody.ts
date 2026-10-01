// The player's own body, seen in first person: the shared figure in the
// player outfit, legs and coat hem only, under the camera. Look down and
// there are legs. The torso and arms stay hidden: that close to the camera
// they fill the view as big blocks. It stands, walks with the move speed, and crouches; it switches pose
// without blending, the way PS1 characters snapped between animations.

import { applyPose, buildFigure } from './figure.ts'
import { POSES, samplePose } from './poses.ts'
import type { Figure } from './figure.ts'
import type { PoseSample } from './poses.ts'
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
}

// Metres covered by one full walk cycle (two steps).
const STRIDE = 1.5
// The body sits this far behind the camera, so the camera never ends up
// inside the chest and looking down shows the legs ahead of the feet.
const BACKSET = 0.2

export class PlayerBody {
  figure: Figure
  cycle: number

  constructor(scene: THREE.Object3D) {
    this.figure = buildFigure('player', { head: false })
    this.figure.group.name = 'player-body'
    // The arms hang off the spine, so this hides the torso and both arms.
    this.figure.joints.spine.visible = false
    scene.add(this.figure.group)
    this.cycle = 0
  }

  update(
    dt: number,
    { x, ground, z, yaw, speed, crouching }: PlayerBodyFrame
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
    } else if (speed > 0.3) {
      this.cycle += (speed * dt) / STRIDE
      pose = samplePose('walk', this.cycle * POSES.walk.seconds)
    } else {
      pose = samplePose('stand')
    }
    applyPose(this.figure, pose)
  }
}
