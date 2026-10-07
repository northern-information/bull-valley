// Canvas art for a shadowman's tombstone (assets.ts buildTombstone):
// weathered granite, R.I.P. over a small cross, and the shadowman's name
// (names.ts) cut into the face. Carved letters, like trade dress, are
// painted here and not worded in COPY.toml.

import { canvas, SERIF, text } from './canvas.ts'
import { mulberry32 } from './rng.ts'
import type { CanvasArt, CanvasSize } from './canvas.ts'

// The face's pixels, in the face's proportions (assets.ts TOMBSTONE.face).
export const TOMBSTONE_FACE_SIZE: CanvasSize = [128, 160]

const STONE = '#80858b'
// A cut letter: the shadow inside the cut, then its lit lower edge.
const CUT = '#121416'
const LIT = '#b4b9be'

// The words of `name`, broken into lines of at most `chars` letters.
export function nameLines(name: string, chars = 11): string[] {
  const lines: string[] = []
  for (const word of name.split(/\s+/).filter(Boolean)) {
    const last = lines.length - 1
    if (last >= 0 && lines[last].length + 1 + word.length <= chars) {
      lines[last] += ` ${word}`
    } else {
      lines.push(word)
    }
  }
  return lines
}

export function paintTombstone(name: string, seed = 0x6a7e): CanvasArt {
  const art = canvas(TOMBSTONE_FACE_SIZE, STONE)
  const { ctx, w, h } = art
  const rng = mulberry32(seed)
  // Lichen and weather: soft blotches, lighter and darker.
  for (let i = 0; i < 70; i++) {
    const shade = rng() < 0.5 ? 'rgba(20,24,20,0.10)' : 'rgba(210,214,200,0.08)'
    ctx.fillStyle = shade
    ctx.beginPath()
    ctx.arc(rng() * w, rng() * h, 2 + rng() * 9, 0, Math.PI * 2)
    ctx.fill()
  }
  // A border cut round the face.
  ctx.strokeStyle = CUT
  ctx.lineWidth = 2
  ctx.strokeRect(7, 7, w - 14, h - 14)
  const carve = (str: string, y: number, px: number) => {
    text(ctx, str, w / 2, y + 1, w - 24, px, SERIF, LIT)
    text(ctx, str, w / 2, y, w - 24, px, SERIF, CUT)
  }
  carve('R.I.P.', 22, 20)
  // A small cross under it.
  ctx.fillStyle = CUT
  ctx.fillRect(w / 2 - 2, 34, 4, 16)
  ctx.fillRect(w / 2 - 7, 39, 14, 4)
  const lines = nameLines(name).slice(0, 4)
  const step = 23
  const top = 58 + ((4 - lines.length) * step) / 2 + step / 2
  lines.forEach((line, i) => carve(line, top + i * step, 21))
  return art
}
