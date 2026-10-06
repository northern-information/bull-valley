// Canvas art for worn mud: the trail through the corn maze and the muddy
// shoulders along every road. Across the canvas (u) runs across the mud,
// ragged and see-through at both edges so the material's alphaTest frays
// them into the grass; down it (v) runs along the mud and tiles, ruts and
// all. Drawn small so it survives the PS1 downscale; assets.ts maps it.

import { canvas } from './canvas.ts'
import { mulberry32, range } from './rng.ts'
import type { CanvasArt } from './canvas.ts'
import type { TrailField } from './maze.ts'

// The maze's worn trail (maze.ts trailField), one pixel a sample: mud
// within `half` metres of the middle of every path, its edge wandering a
// little in and out, and see-through everywhere else so the material's
// alphaTest leaves the grass. Canvas x runs along the maze (the field's
// cols), canvas y across it (its rows).
export function paintTrailField(
  field: TrailField,
  half: number,
  seed = 0x7a1
): CanvasArt {
  const rng = mulberry32(seed)
  const { cols, rows, fromMiddle } = field
  const art = canvas([cols, rows])
  const { ctx } = art
  // A coarse lattice of random wobble, read smoothly, so the edge bulges
  // and pinches over a metre or two rather than fizzing pixel by pixel.
  const cell = 6
  const lw = Math.ceil(cols / cell) + 2
  const lattice = Array.from(
    { length: lw * (Math.ceil(rows / cell) + 2) },
    () => rng()
  )
  const wobble = (i: number, j: number) => {
    const x = i / cell
    const y = j / cell
    const x0 = Math.floor(x)
    const y0 = Math.floor(y)
    const sx = x - x0
    const sy = y - y0
    const at = (a: number, b: number) => lattice[b * lw + a]
    return (
      at(x0, y0) * (1 - sx) * (1 - sy) +
      at(x0 + 1, y0) * sx * (1 - sy) +
      at(x0, y0 + 1) * (1 - sx) * sy +
      at(x0 + 1, y0 + 1) * sx * sy
    )
  }
  const image = ctx.createImageData(cols, rows)
  const px = image.data
  const shades = [
    [58, 45, 32],
    [44, 33, 23],
    [74, 58, 41],
    [36, 26, 18],
  ]
  for (let j = 0; j < rows; j++) {
    for (let i = 0; i < cols; i++) {
      const k = j * cols + i
      const edge = half * (0.75 + 0.5 * wobble(i, j))
      if (!(fromMiddle[k] <= edge)) continue
      // Darker down the worn middle, patchy all over.
      const r = rng()
      const shade =
        fromMiddle[k] < half * 0.3 && r < 0.5
          ? shades[3]
          : shades[Math.floor(r * 3)]
      px[k * 4] = shade[0]
      px[k * 4 + 1] = shade[1]
      px[k * 4 + 2] = shade[2]
      px[k * 4 + 3] = 255
    }
  }
  ctx.putImageData(image, 0, 0)
  return art
}

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
