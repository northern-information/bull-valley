// The trip's constellations as seen (constellations.ts): fuchsia lines
// between the stars, and the stars they join lit fuchsia, in the sky
// group so they ride with it. One set of lines to each lane, filled again
// only when its lane turns over. loop.ts updates them every frame from the
// tripping ward.

import * as THREE from 'three'
import { CONFIG } from './config.ts'
import { constellationOf, constellationsAt, STARS } from './constellations.ts'
import { PSYCH_FUCHSIA } from './fuchsia.ts'
import { STAR_RADIUS } from './sky.ts'

// A touch inside the stars, so the lines meet them in front.
const RADIUS = STAR_RADIUS * 0.995

interface Lane {
  lines: THREE.LineSegments
  points: THREE.Points
  lineMaterial: THREE.LineBasicMaterial
  pointMaterial: THREE.PointsMaterial
  // The turn it was last filled for, and whether that turn drew anything.
  turn: number | null
  filled: boolean
}

// A star where the lines draw it, into `out` at `o`.
function place(i: number, out: Float32Array, o: number) {
  out[o] = STARS[i].x * RADIUS
  out[o + 1] = STARS[i].y * RADIUS
  out[o + 2] = STARS[i].z * RADIUS
}

function positions(geometry: THREE.BufferGeometry): THREE.BufferAttribute {
  return geometry.getAttribute('position') as THREE.BufferAttribute
}

export class Constellations {
  readonly group = new THREE.Group()
  private readonly lanes: Lane[] = []

  constructor(sky: THREE.Object3D) {
    this.group.name = 'constellations'
    const { lanes, starsMax } = CONFIG.psych.constellations
    // A tree of starsMax stars has starsMax - 1 lines; a loop adds one.
    const maxLines = starsMax
    for (let i = 0; i < lanes; i++) {
      const lineGeo = new THREE.BufferGeometry()
      lineGeo.setAttribute(
        'position',
        new THREE.BufferAttribute(new Float32Array(maxLines * 2 * 3), 3)
      )
      const pointGeo = new THREE.BufferGeometry()
      pointGeo.setAttribute(
        'position',
        new THREE.BufferAttribute(new Float32Array(starsMax * 3), 3)
      )
      const lineMaterial = new THREE.LineBasicMaterial({
        color: PSYCH_FUCHSIA,
        transparent: true,
        depthWrite: false,
        fog: false,
      })
      const pointMaterial = new THREE.PointsMaterial({
        color: PSYCH_FUCHSIA,
        size: 3,
        sizeAttenuation: false,
        transparent: true,
        depthWrite: false,
        fog: false,
      })
      const lines = new THREE.LineSegments(lineGeo, lineMaterial)
      const points = new THREE.Points(pointGeo, pointMaterial)
      // Their bounds would be filled once and go stale as they refill.
      lines.frustumCulled = false
      points.frustumCulled = false
      lines.visible = false
      points.visible = false
      this.group.add(lines, points)
      this.lanes.push({
        lines,
        points,
        lineMaterial,
        pointMaterial,
        turn: null,
        filled: false,
      })
    }
    sky.add(this.group)
  }

  // Fill a lane with its turn's constellation; false with none to draw.
  private fill(lane: Lane, index: number, turn: number): boolean {
    const shape = constellationOf(STARS, index, turn)
    if (!shape) return false
    const linePos = positions(lane.lines.geometry)
    const lineArr = linePos.array as Float32Array
    const edges = shape.edges.slice(0, lineArr.length / 6)
    for (const [k, [a, b]] of edges.entries()) {
      place(a, lineArr, k * 6)
      place(b, lineArr, k * 6 + 3)
    }
    linePos.needsUpdate = true
    lane.lines.geometry.setDrawRange(0, edges.length * 2)
    const pointPos = positions(lane.points.geometry)
    const pointArr = pointPos.array as Float32Array
    const stars = shape.stars.slice(0, pointArr.length / 3)
    for (const [k, i] of stars.entries()) place(i, pointArr, k * 3)
    pointPos.needsUpdate = true
    lane.points.geometry.setDrawRange(0, stars.length)
    return true
  }

  // On a trip of `level` at `time`.
  update(level: number, time: number) {
    const shown = new Map(constellationsAt(level, time).map((s) => [s.lane, s]))
    for (const [index, lane] of this.lanes.entries()) {
      const s = shown.get(index)
      if (s && lane.turn !== s.turn) {
        lane.turn = s.turn
        lane.filled = this.fill(lane, index, s.turn)
      }
      const on = s !== undefined && lane.filled
      lane.lines.visible = on
      lane.points.visible = on
      if (s && on) {
        lane.lineMaterial.opacity = s.opacity
        lane.pointMaterial.opacity = s.opacity
      }
    }
  }
}
