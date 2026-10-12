// Pure: the valley's shadowmen as this client draws them (and the
// Undercroft's tunnel shades, tunnelrig.ts, on the same terms). The valley
// sends every step (sharedworld.ts rule 11); the client keeps the last two
// and draws a beat behind the present, between them, the way it draws
// peers (presence.ts). One in the newer frame only has just come in, and
// shows where it is; one in the older only has gone (out of the bubble,
// or burst), and is no longer drawn.

import type { ShadowmanWire } from './protocol.ts'

// Anything the valley steps and sends whole every step.
interface Stepped {
  id: number
  x: number
  z: number
  burn: number
}

// One frame, stamped with this client's clock when it landed.
export interface ShadowFrame<T extends Stepped = ShadowmanWire> {
  at: number
  shadowmen: readonly T[]
}

export interface ShadowTable<T extends Stepped = ShadowmanWire> {
  prev: ShadowFrame<T> | null
  next: ShadowFrame<T> | null
}

export function createShadowTable<
  T extends Stepped = ShadowmanWire,
>(): ShadowTable<T> {
  return { prev: null, next: null }
}

// A frame landed at `at` (local ms).
export function applyShadowFrame<T extends Stepped>(
  table: ShadowTable<T>,
  shadowmen: readonly T[],
  at: number
): void {
  table.prev = table.next
  table.next = { at, shadowmen }
}

// The valley's shadowmen at renderAt (local ms), between the two frames;
// before the first or after the newest it holds, never extrapolating.
export function sampleShadowmen<T extends Stepped>(
  table: ShadowTable<T>,
  renderAt: number
): T[] {
  const { prev, next } = table
  if (!next) return []
  if (!prev || next.at <= prev.at) return [...next.shadowmen]
  const t = Math.min(1, Math.max(0, (renderAt - prev.at) / (next.at - prev.at)))
  const before = new Map(prev.shadowmen.map((s) => [s.id, s]))
  return next.shadowmen.map((s) => {
    const was = before.get(s.id)
    if (!was) return s
    return {
      ...s,
      x: was.x + (s.x - was.x) * t,
      z: was.z + (s.z - was.z) * t,
      burn: was.burn + (s.burn - was.burn) * t,
    }
  })
}
