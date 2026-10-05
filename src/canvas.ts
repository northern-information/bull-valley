// Shared 2D canvas helpers for the painted art (packs, drink labels, glows,
// the moon) and for the terrain read-back. DOM only, no three.js.

// A canvas size in pixels: [width, height].
export type CanvasSize = [number, number]

// A painted canvas with its 2D context and size.
export interface CanvasArt {
  c: HTMLCanvasElement
  ctx: CanvasRenderingContext2D
  w: number
  h: number
}

// The 2D context of a canvas. Throws if the browser cannot give one.
export function context2d(
  canvas: HTMLCanvasElement,
  settings?: CanvasRenderingContext2DSettings
): CanvasRenderingContext2D {
  const ctx = canvas.getContext('2d', settings)
  if (!ctx) throw new Error('Canvas 2D context is not available')
  return ctx
}

export function canvas([w, h]: CanvasSize, fill?: string): CanvasArt {
  const c = document.createElement('canvas')
  c.width = w
  c.height = h
  const ctx = context2d(c)
  if (fill) {
    ctx.fillStyle = fill
    ctx.fillRect(0, 0, w, h)
  }
  return { c, ctx, w, h }
}

// Centered text, shrunk until it fits maxW.
// The font is a CSS font string with `$` in place of the pixel size.
export function text(
  ctx: CanvasRenderingContext2D,
  str: string,
  x: number,
  y: number,
  maxW: number,
  px: number,
  font: string,
  color: string
): void {
  let size = px
  ctx.font = `${font.replace('$', String(size))}`
  while (ctx.measureText(str).width > maxW && size > 6) {
    size -= 1
    ctx.font = `${font.replace('$', String(size))}`
  }
  ctx.fillStyle = color
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText(str, x, y)
}

export const SERIF = 'bold $px Georgia, "Times New Roman", serif'
export const SANS = 'bold $px "Helvetica Neue", Arial, sans-serif'
// The game's own face, for UI drawn on canvas (the scope, name tags). Boot
// waits for it to load (main.ts), so the first draw is already IBM Plex Mono.
export const MONO = '600 $px "IBM Plex Mono", ui-monospace, monospace'
