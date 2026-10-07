// Pure: the valley's shadowmen as this client draws them. The valley sends
// every step (sharedworld.ts rule 11); the client keeps the last two and
// draws a beat behind the present, between them, the way it draws peers
// (presence.ts). One in the newer frame only has just come in, and shows
// where it is; one in the older only has gone (out of the bubble, or
// burst), and is no longer drawn.

import type { ShadowmanWire } from './protocol.ts'

// One frame, stamped with this client's clock when it landed.
export interface ShadowFrame {
  at: number
  shadowmen: readonly ShadowmanWire[]
}

export interface ShadowTable {
  prev: ShadowFrame | null
  next: ShadowFrame | null
}

export function createShadowTable(): ShadowTable {
  return { prev: null, next: null }
}

// A frame landed at `at` (local ms).
export function applyShadowFrame(
  table: ShadowTable,
  shadowmen: readonly ShadowmanWire[],
  at: number
): void {
  table.prev = table.next
  table.next = { at, shadowmen }
}

// The valley's shadowmen at renderAt (local ms), between the two frames;
// before the first or after the newest it holds, never extrapolating.
export function sampleShadowmen(
  table: ShadowTable,
  renderAt: number
): ShadowmanWire[] {
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
