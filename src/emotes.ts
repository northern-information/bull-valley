// Pure: the emotes. A raider types /wave (or /sit, /smoke, /dance, /point,
// /shrug, /kneel) and their body takes a pose (poses.ts) that everyone
// near sees: the pose rides the state frame's `pose` field to the valley
// and on to every peer (protocol.ts PEER_POSES), so nothing else goes on
// the wire. Each holds for its seconds, or until the raider moves for the
// ones with none (sitting, kneeling, dancing); moving, crouching, boarding
// or a strike always ends it. A raider near enough to see it gets a quiet
// line in the log. No three.js, no DOM.

import type { PoseName } from './poses.ts'

export interface Emote {
  // The pose the body takes.
  pose: PoseName
  // How long it holds, in seconds; null holds until the raider moves.
  seconds: number | null
  // Where the eye sinks to in first person while it holds, in metres over
  // the ground; null leaves it standing.
  eye: number | null
}

// Every emote, in the order /emotes lists them. The key is the command
// typed and the value the wire carries.
export const EMOTES = {
  wave: { pose: 'wave', seconds: 3, eye: null },
  sit: { pose: 'rest', seconds: null, eye: 0.95 },
  smoke: { pose: 'smoke', seconds: 8, eye: null },
  dance: { pose: 'dance', seconds: null, eye: null },
  point: { pose: 'point', seconds: 3, eye: null },
  shrug: { pose: 'shrug', seconds: 2.5, eye: null },
  kneel: { pose: 'kneel', seconds: null, eye: 1.1 },
} as const satisfies Record<string, Emote>

export type EmoteId = keyof typeof EMOTES

export const EMOTE_IDS = Object.keys(EMOTES) as EmoteId[]

export function isEmote(value: unknown): value is EmoteId {
  return typeof value === 'string' && Object.hasOwn(EMOTES, value)
}

// The emote a typed command names (`/Wave` as well as `/wave`), or null.
export function emoteOf(command: string): EmoteId | null {
  const name = command.trim().toLowerCase()
  return isEmote(name) ? name : null
}

// An emote under way: which, and since when (seconds on the game clock).
export interface Emoting {
  id: EmoteId
  since: number
}

// Moving any faster than this ends an emote: an idle drift never does.
export const STILL_SPEED = 0.3

// Whether the emote still holds at `now`: not past its seconds, the raider
// standing still, not crouched, and on foot.
export function holds(
  emoting: Emoting | null,
  now: number,
  {
    speed,
    crouching,
    aboard,
  }: { speed: number; crouching: boolean; aboard: boolean }
): emoting is Emoting {
  if (!emoting || aboard || crouching || speed > STILL_SPEED) return false
  const { seconds } = EMOTES[emoting.id]
  return seconds === null || now - emoting.since < seconds
}

// Whether a peer's new state is an emote this raider should be told of: it
// just began (the last state was another pose, or none) and the peer is
// within `radius` metres. Null when there is nothing to say.
export function seenEmote(
  was: string | null,
  now: string,
  distance: number,
  radius: number
): EmoteId | null {
  if (!isEmote(now) || was === now || distance > radius) return null
  return now
}
