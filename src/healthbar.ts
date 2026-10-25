// The health bar as Elden Ring floats one over whatever has some: a dull
// gilt hairline round a dark well, filled in deep crimson, on a small
// pixelated sprite. A peer wears one under their name (peers.ts), and a
// topiary hurt by a torch shows one over its back (topiaryrig.ts). A loss
// lands at once; given back, the fill climbs to its new share over
// RISE_SECONDS (stepHealthBar) rather than snapping. The canvas is drawn
// again only when the fill moves a pixel.

import * as THREE from 'three'
import { canvas } from './canvas.ts'

// The canvas: power-of-two sides.
const BAR_W = 64
const BAR_H = 4
const RISE_SECONDS = 0.6

export interface HealthBar {
  sprite: THREE.Sprite
  texture: THREE.CanvasTexture
  ctx: CanvasRenderingContext2D
  // The share drawn now, and the share last said.
  shown: number
  target: number
  // The fill in canvas pixels as last drawn.
  drawn: number
}

// A bar `width` metres across.
export function buildHealthBar(width = 0.6): HealthBar {
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
  sprite.scale.set(width, width * (BAR_H / BAR_W), 1)
  return { sprite, texture, ctx: art.ctx, shown: 1, target: 1, drawn: -1 }
}

export function drawHealthBar(bar: HealthBar): void {
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

// The share said now: a loss shown at once, a gain climbed to.
export function setHealthBar(bar: HealthBar, share: number): void {
  bar.target = share
  if (bar.target < bar.shown) bar.shown = bar.target
  drawHealthBar(bar)
}

// The fill climbing to what was given back, `dt` seconds on.
export function stepHealthBar(bar: HealthBar, dt: number): void {
  if (bar.shown >= bar.target) return
  bar.shown = Math.min(bar.target, bar.shown + dt / RISE_SECONDS)
  drawHealthBar(bar)
}

export function disposeHealthBar(bar: HealthBar): void {
  bar.sprite.material.dispose()
  bar.texture.dispose()
}
