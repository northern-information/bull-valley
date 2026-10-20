// Pure: Bull Valley Dial-Up's modem, the splash every launch opens on. A
// tap dials: the script types out on the valley's clock (the build's name
// and the epigraph the 3D valley's colophon gives way to, then ATZ, OK, the
// number, the ring, the carrier, the training) while modemaudio.ts plays
// each step's cue, and then it waits on the line. It prints CONNECT only
// once the valley's welcome has really come (connected), LOGIN for a
// phone no one is signed in on (signedOut), and NO CARRIER for a socket
// that failed (noCarrier), the dial going on when the line comes back.
// Another tap skips what is left of the script, never what it waits on.
// modemhud.ts draws it; dialmain.ts feeds it.

// What the script prints, a COPY.toml [dialup.modem] key each.
export type ModemLine =
  | 'build'
  | 'epigraph'
  | 'atz'
  | 'ok'
  | 'dial'
  | 'ring'
  | 'carrier'
  | 'protocol'
  | 'compression'
  | 'connect'
  | 'login'
  | 'no_carrier'
  | 'redial'

// What modemaudio.ts plays.
export type ModemCue =
  'dialtone' | 'dtmf' | 'ring' | 'answer' | 'train' | 'hush' | 'click'

interface Step {
  // Milliseconds after the tap.
  at: number
  line?: ModemLine
  cue?: ModemCue
}

// The terminal's banner (the build, Based on true events.), then the
// handshake, as a 56k modem made it.
export const SCRIPT: readonly Step[] = [
  { at: 0, line: 'build' },
  { at: 350, line: 'epigraph' },
  { at: 1100, line: 'atz' },
  { at: 1450, line: 'ok' },
  { at: 1800, line: 'dial', cue: 'dialtone' },
  { at: 2800, cue: 'dtmf' },
  { at: 4200, line: 'ring', cue: 'ring' },
  { at: 5800, line: 'carrier', cue: 'answer' },
  { at: 6800, line: 'protocol', cue: 'train' },
  { at: 8400, line: 'compression' },
]

// When the script is done and the modem waits on the line.
export const HANDSHAKE_MS = 8900

// How long CONNECT (or LOGIN) holds before the modem gives way.
export const HOLD_MS = 900

type Outcome = 'connect' | 'login'

export interface Modem {
  // When the dial began (the tap), or null before it.
  dialedAt: number | null
  // When a second tap skipped the rest of the script, or null.
  skippedAt: number | null
  // How the line answered, and when the valley said so.
  outcome: { kind: Outcome; at: number } | null
  // Each time the socket failed before it answered.
  failures: number[]
}

export const IDLE: Modem = {
  dialedAt: null,
  skippedAt: null,
  outcome: null,
  failures: [],
}

// A tap: the dial begins, or, once it has, the script is skipped.
export function tap(m: Modem, now: number): Modem {
  if (m.dialedAt === null) return { ...m, dialedAt: now }
  if (m.skippedAt !== null || scriptDoneAt(m) <= now) return m
  return { ...m, skippedAt: now }
}

// The valley's welcome came.
export function connected(m: Modem, now: number): Modem {
  return m.outcome ? m : { ...m, outcome: { kind: 'connect', at: now } }
}

// No one is signed in on this phone: the line answers with a login.
export function signedOut(m: Modem, now: number): Modem {
  return m.outcome ? m : { ...m, outcome: { kind: 'login', at: now } }
}

// The socket failed; the next welcome still connects.
export function noCarrier(m: Modem, now: number): Modem {
  return m.outcome ? m : { ...m, failures: [...m.failures, now] }
}

// When the script is through, skipped or not (Infinity before the tap).
function scriptDoneAt(m: Modem): number {
  if (m.dialedAt === null) return Infinity
  const full = m.dialedAt + HANDSHAKE_MS
  return m.skippedAt === null ? full : Math.min(full, m.skippedAt)
}

export interface ModemView {
  // Before the tap: say so.
  waiting: boolean
  // Every line printed so far, in order.
  lines: ModemLine[]
  // Every cue due so far, each with when it is due; a skip drops the
  // script's, so the hud plays only what is left.
  cues: { cue: ModemCue; at: number }[]
  // The modem is through: on to the valley (or the sign-in).
  done: boolean
  // The line answered with a login.
  login: boolean
}

export function view(m: Modem, now: number): ModemView {
  if (m.dialedAt === null) {
    return { waiting: true, lines: [], cues: [], done: false, login: false }
  }
  const dialedAt = m.dialedAt
  const lines: ModemLine[] = []
  const cues: { cue: ModemCue; at: number }[] = []
  const skipped = m.skippedAt
  for (const step of SCRIPT) {
    const at = dialedAt + step.at
    const printed = at <= now || (skipped !== null && skipped <= now)
    if (!printed) continue
    if (step.line) lines.push(step.line)
    // A skipped step is printed, never heard.
    if (step.cue && (skipped === null || at < skipped)) {
      cues.push({ cue: step.cue, at })
    }
  }
  const scriptDone = scriptDoneAt(m)
  if (now < scriptDone) {
    return { waiting: false, lines, cues, done: false, login: false }
  }
  // After the script: each failure the line saw, then how it answered.
  for (const at of m.failures) {
    const shown = Math.max(at, scriptDone)
    if (shown > now) continue
    lines.push('no_carrier', 'redial')
    cues.push({ cue: 'click', at: shown })
  }
  const outcome = m.outcome
  if (!outcome) {
    return { waiting: false, lines, cues, done: false, login: false }
  }
  const shown = Math.max(outcome.at, scriptDone)
  if (shown > now) {
    return { waiting: false, lines, cues, done: false, login: false }
  }
  lines.push('connect')
  if (outcome.kind === 'login') lines.push('login')
  cues.push({ cue: 'hush', at: shown })
  return {
    waiting: false,
    lines,
    cues,
    done: now >= shown + HOLD_MS,
    login: outcome.kind === 'login',
  }
}
