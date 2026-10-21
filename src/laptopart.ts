// Canvas art for the laptop's screen in the Citgo bathroom
// (laptopmodel.ts): the text editor as it stands when no one is at it,
// white on a dark blue like the DOS editor, a grey menu bar over the
// readme and a status bar under it.

import { canvas, MONO } from './canvas.ts'
import { copy } from './copy.ts'
import { expandTabs } from './laptop.ts'
import type { CanvasArt } from './canvas.ts'

// The editor's colours, the HUD's dialog (laptopdialog.ts) shares them
// through styles.css.
export const EDITOR = {
  blue: '#0b1f8f',
  text: '#f4f4f4',
  bar: '#b4b4b4',
  barText: '#0a0a0a',
  status: '#2aa7a7',
}

// Columns and rows of text the screen fits under its bars.
const COLS = 40
const ROWS = 17
const CHAR = { w: 6, h: 10 }

// The screen, `name` in the title and `text` from its first line, as much
// as fits: tabs every eight columns, long lines cut at the edge.
export function paintEditorScreen(name: string, text: string): CanvasArt {
  const pad = 4
  const w = COLS * CHAR.w + pad * 2
  const h = (ROWS + 3) * CHAR.h + pad
  const art = canvas([w, h], EDITOR.blue)
  const { ctx } = art
  ctx.font = MONO.replace('$', String(CHAR.h - 1))
  ctx.textBaseline = 'top'
  // The menu bar.
  ctx.fillStyle = EDITOR.bar
  ctx.fillRect(0, 0, w, CHAR.h + 2)
  ctx.fillStyle = EDITOR.barText
  ctx.fillText(copy('laptop.menu'), pad, 1)
  // The window's frame and its title.
  ctx.strokeStyle = EDITOR.text
  ctx.lineWidth = 1
  const top = CHAR.h + 2 + CHAR.h / 2
  ctx.strokeRect(1.5, top + 0.5, w - 3, h - top - CHAR.h - 4)
  const title = ` ${name} `
  const tw = ctx.measureText(title).width
  ctx.fillStyle = EDITOR.text
  ctx.fillRect((w - tw) / 2, top - CHAR.h / 2, tw, CHAR.h)
  ctx.fillStyle = EDITOR.blue
  ctx.fillText(title, (w - tw) / 2, top - CHAR.h / 2)
  // The text.
  ctx.fillStyle = EDITOR.text
  const lines = text.split('\n').slice(0, ROWS - 1)
  lines.forEach((line, i) => {
    const shown = expandTabs(line).slice(0, COLS - 1)
    ctx.fillText(shown, pad + 2, top + CHAR.h / 2 + 2 + i * CHAR.h)
  })
  // The cursor, blinking nowhere: drawn once at the top.
  ctx.fillRect(pad + 2, top + CHAR.h / 2 + 2 + CHAR.h - 2, CHAR.w, 2)
  // The status bar.
  ctx.fillStyle = EDITOR.status
  ctx.fillRect(0, h - CHAR.h - 2, w, CHAR.h + 2)
  ctx.fillStyle = EDITOR.barText
  ctx.fillText(copy('laptop.status', { line: 1, col: 1 }), pad, h - CHAR.h - 1)
  return art
}
