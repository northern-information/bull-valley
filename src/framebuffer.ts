// Pure: the last few seconds of the valley's stamped frames, and where one
// thing it carries stands at a moment a little in the past. The valley
// sends ten frames a second and a client draws CONFIG.net.interpolateMs
// behind the present, which reaches back past the newest two; drawing
// between only those two moves the drawing back each time a frame lands.
// Keeping a short run and taking the two either side of the moment never
// does. presence.ts keeps the peers with this, and shadowsync.ts and
// caretakerrig.ts keep the shadows.

import { CONFIG } from './config.ts'

// Anything stamped with the local time it landed.
export interface Stamped {
  at: number
}

// How many frames to keep: at ten frames a second a few seconds, far more
// than the render delay ever reaches back.
export const FRAMES_KEPT = 32
// A frame that comes after a silence of more than GAPS frames (a stalled
// socket, or a peer who stood still and sent nothing) starts its move from
// the last frame, held until one frame's span before it, not spread across
// the whole silence.
const GAPS = 2.5
// The span of one of the valley's shadow frames, and the silence after it.
const FRAME_MS = 1000 / CONFIG.shadowmen.tickHz
export const GAP_MS = GAPS * FRAME_MS

// Adds a frame to the end of the run, the oldest going past FRAMES_KEPT.
// frameMs is one frame's span on the stream the run keeps.
export function keepFrame<T extends Stamped>(
  frames: T[],
  frame: T,
  frameMs = FRAME_MS
): void {
  const last = frames.at(-1)
  if (last && frame.at - last.at > GAPS * frameMs)
    push(frames, { ...last, at: frame.at - frameMs })
  push(frames, frame)
}

function push<T extends Stamped>(frames: T[], frame: T): void {
  frames.push(frame)
  if (frames.length > FRAMES_KEPT) frames.shift()
}

// Where one thing stood at renderAt: the two states either side of it and
// how far between them (from and to the same state where it holds).
export interface Between<V> {
  from: V
  to: V
  t: number
}

// The thing `pick` finds in each frame at renderAt. Between two frames
// that both carry it, it moves from one to the other. Where the frame
// before renderAt lacks it (before the run, or before it came in), it
// holds where it first shows after; past the newest, or where the frame
// after lacks it (it went and came back, or burst and formed again), it
// holds where it last stood. Null when no frame carries it.
export function between<T extends Stamped, V>(
  frames: readonly T[],
  renderAt: number,
  pick: (frame: T) => V | null
): Between<V> | null {
  let i = frames.length - 1
  while (i >= 0 && frames[i].at > renderAt) i -= 1
  const from = i >= 0 ? pick(frames[i]) : null
  if (from === null) {
    for (let j = i + 1; j < frames.length; j++) {
      const first = pick(frames[j])
      if (first !== null) return { from: first, to: first, t: 0 }
    }
    return null
  }
  const after = frames[i + 1]
  const to = after ? pick(after) : null
  if (!after || to === null) return { from, to: from, t: 0 }
  const span = after.at - frames[i].at
  const t = span > 0 ? (renderAt - frames[i].at) / span : 1
  return { from, to, t }
}

// a to b, t of the way.
export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t
}
