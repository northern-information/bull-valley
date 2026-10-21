import * as THREE from 'three'
import { context2d } from './canvas.ts'
import { STARS } from './constellations.ts'

// --- Sky -----------------------------------------------------------------

// How far off the stars hang, metres from the eye.
export const STAR_RADIUS = 1200

// Stars and the moon. loop.ts moves the group with the player so the sky
// never recedes into fog.
export function buildSky(): THREE.Group {
  const sky = new THREE.Group()
  // The stars are constellations.ts's, so a trip's lines meet them.
  const starPositions = new Float32Array(STARS.length * 3)
  for (const [i, star] of STARS.entries()) {
    starPositions[i * 3] = star.x * STAR_RADIUS
    starPositions[i * 3 + 1] = star.y * STAR_RADIUS
    starPositions[i * 3 + 2] = star.z * STAR_RADIUS
  }
  const starGeo = new THREE.BufferGeometry()
  starGeo.setAttribute('position', new THREE.BufferAttribute(starPositions, 3))
  sky.add(
    new THREE.Points(
      starGeo,
      new THREE.PointsMaterial({
        color: '#aab6cf',
        size: 2,
        sizeAttenuation: false,
        fog: false,
        transparent: true,
        opacity: 0.75,
      })
    )
  )
  const moonCanvas = document.createElement('canvas')
  moonCanvas.width = 64
  moonCanvas.height = 64
  const mctx = context2d(moonCanvas)
  const mgrad = mctx.createRadialGradient(32, 32, 6, 32, 32, 30)
  mgrad.addColorStop(0, 'rgba(226, 232, 240, 0.95)')
  mgrad.addColorStop(0.45, 'rgba(190, 205, 228, 0.35)')
  mgrad.addColorStop(1, 'rgba(190, 205, 228, 0)')
  mctx.fillStyle = mgrad
  mctx.fillRect(0, 0, 64, 64)
  const moon = new THREE.Sprite(
    new THREE.SpriteMaterial({
      map: new THREE.CanvasTexture(moonCanvas),
      fog: false,
      transparent: true,
      depthWrite: false,
    })
  )
  moon.position.set(450, 750, -680)
  moon.scale.setScalar(170)
  sky.add(moon)
  return sky
}
