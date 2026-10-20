// Pure: the valley's shadowmen as this client draws them (and the
// Undercroft's tunnel shades, tunnelrig.ts, on the same terms). The valley
// sends every step (sharedworld.ts rule 11); the client keeps the last few
// seconds of them (framebuffer.ts) and draws a beat behind the present,
// between the two frames either side of that moment, the way it draws
// peers (presence.ts). The newest frame says which are drawn: one only in
// it has just come in, and holds where it first showed until the drawing
// reaches it; one gone from it (out of the bubble, or burst) is no longer
// drawn.

import { between, keepFrame, lerp } from './framebuffer.ts'
import type { ShadowmanWire } from './protocol.ts'

// Anything the valley steps and sends whole every step.
interface Stepped {
  id: number
  x: number
  z: number
  burn: number
}

// One frame, stamped with this client's clock when it landed, its
// shadowmen by id: the sample is taken every drawn frame, the valley's
// land ten times a second.
interface ShadowFrame<T extends Stepped = ShadowmanWire> {
  at: number
  shadowmen: readonly T[]
  byId: ReadonlyMap<T['id'], T>
}

export interface ShadowTable<T extends Stepped = ShadowmanWire> {
  // The frames landed, oldest first (framebuffer.ts FRAMES_KEPT at most).
  frames: ShadowFrame<T>[]
}

export function createShadowTable<
  T extends Stepped = ShadowmanWire,
>(): ShadowTable<T> {
  return { frames: [] }
}

// A frame landed at `at` (local ms).
export function applyShadowFrame<T extends Stepped>(
  table: ShadowTable<T>,
  shadowmen: readonly T[],
  at: number
): void {
  const byId = new Map(shadowmen.map((s) => [s.id, s]))
  keepFrame(table.frames, { at, shadowmen, byId })
}

// The valley's shadowmen at renderAt (local ms): the newest frame's, each
// between the two frames either side of renderAt; before the first or
// after the newest it holds, never extrapolating. Everything but where it
// stands and how far it has burned is the newest frame's.
export function sampleShadowmen<T extends Stepped>(
  table: ShadowTable<T>,
  renderAt: number
): T[] {
  const { frames } = table
  const newest = frames.at(-1)
  if (!newest) return []
  return newest.shadowmen.map((s) => {
    const at = between(frames, renderAt, (f) => f.byId.get(s.id) ?? null)
    if (!at) return s
    const { from, to, t } = at
    return {
      ...s,
      x: lerp(from.x, to.x, t),
      z: lerp(from.z, to.z, t),
      burn: lerp(from.burn, to.burn, t),
    }
  })
}
