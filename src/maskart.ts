// Canvas art for the masks a face can wear (outfits.ts MaskId): a
// photograph under public/textures, cut to the face's oval and laid on
// face paint that covers the rest of the front of the head. figure.ts
// wraps the canvas over the head's front half, projected straight on, so
// the canvas spans the head's width and its height from the jaw (the
// bottom edge) to the crown (the top edge); the hair cap hides what lies
// under it.
//
// The canvas is ready at once in the paint alone, and the photograph is
// drawn over it when the file arrives (texture.needsUpdate), so a figure
// is built without waiting.
//   kabuki   David Coleman: #1's white kabuki mask, with its black eyes
//            and the lines running down from them. 184×236.

import * as THREE from 'three'
import { canvas } from './canvas.ts'
import type { MaskId } from './outfits.ts'

interface MaskArt {
  url: string
  // The face paint under the photograph, out to the edges of the face.
  paint: string
  // Where the photograph lands on the canvas: x, y, width, height.
  photo: [number, number, number, number]
  // The oval of the photograph that shows: centre x, centre y, radii.
  face: [number, number, number, number]
}

// The head's front half is 0.184 m across and 0.235 m from the jaw to
// the crown: 1000 pixels a metre. The hairline is about 50 px down and
// the chin about 220.
const SIZE: [number, number] = [184, 236]

const MASKS: Record<MaskId, MaskArt> = {
  kabuki: {
    url: '/textures/coleman-1-mask.png',
    paint: '#e6e3df',
    // The photograph is 92×78: its hairline at row 8 and its chin at row
    // 76, so 2.5× puts them on the canvas's hairline and chin.
    photo: [-23, 30, 230, 195],
    face: [92, 138, 66, 90],
  },
}

const textures = new Map<MaskId, THREE.CanvasTexture>()

// One texture a mask, kept: every figure wearing it shares it.
export function maskTexture(id: MaskId): THREE.CanvasTexture {
  const had = textures.get(id)
  if (had) return had
  const mask = MASKS[id]
  const art = canvas(SIZE, mask.paint)
  const texture = new THREE.CanvasTexture(art.c)
  texture.colorSpace = THREE.SRGBColorSpace
  textures.set(id, texture)
  const image = new Image()
  image.onload = () => {
    const { ctx } = art
    const [cx, cy, rx, ry] = mask.face
    ctx.save()
    ctx.beginPath()
    ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2)
    ctx.clip()
    ctx.drawImage(image, ...mask.photo)
    ctx.restore()
    texture.needsUpdate = true
  }
  image.src = mask.url
  return texture
}
