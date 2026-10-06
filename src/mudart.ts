// Canvas art for worn mud: the trail through the corn maze and the muddy
// shoulders along every road. Across the canvas (u) runs across the mud,
// ragged and see-through at both edges so the material's alphaTest frays
// them into the grass; down it (v) runs along the mud and tiles, ruts and
// all. Drawn small so it survives the PS1 downscale; assets.ts maps it.

import { canvas } from './canvas.ts'
import { mulberry32, range } from './rng.ts'
import type { CanvasArt } from './canvas.ts'

// How many metres of mud one copy of the canvas covers, along it.
export const MUD_TILE_LENGTH = 6

export function paintMud(seed = 0x3dd): CanvasArt {
  const rng = mulberry32(seed)
  const art = canvas([32, 64])
  const { ctx, w, h } = art
  ctx.fillStyle = '#3a2d20'
  ctx.fillRect(0, 0, w, h)
  // Wet and dry patches.
  for (let i = 0; i < 40; i++) {
    ctx.fillStyle = rng() < 0.5 ? '#2c2117' : '#4a3a29'
    const x = range(rng, 0, w)
    const y = range(rng, 0, h)
    ctx.fillRect(x, y, range(rng, 2, 6), range(rng, 2, 8))
  }
  // Two ruts worn along it, a puddle's sheen in each now and then.
  for (const x of [w * 0.32, w * 0.68]) {
    ctx.fillStyle = '#241a12'
    ctx.fillRect(Math.round(x) - 1, 0, 3, h)
    if (rng() < 0.6) {
      ctx.fillStyle = '#3d3a35'
      ctx.fillRect(Math.round(x) - 1, range(rng, 0, h - 5), 2, range(rng, 2, 4))
    }
  }
  // Fray both edges: a random walk eats into each side, and the walk ends
  // where it began so the tile meets its next copy.
  const edge = () => {
    const depths: number[] = []
    let d = range(rng, 1, 4)
    for (let y = 0; y < h; y++) {
      d = Math.max(0, Math.min(6, d + range(rng, -1.5, 1.5)))
      depths.push(d)
    }
    const drift = depths[h - 1] - depths[0]
    return depths.map((v, y) => Math.max(0, v - (drift * y) / (h - 1)))
  }
  const left = edge()
  const right = edge()
  for (let y = 0; y < h; y++) {
    ctx.clearRect(0, y, Math.round(left[y]), 1)
    ctx.clearRect(w - Math.round(right[y]), y, Math.round(right[y]), 1)
  }
  return art
}
