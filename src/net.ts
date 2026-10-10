// The socket to the valley server: DOM glue around src/protocol.ts. Opens
// one WebSocket, says hello, hands every server frame to a listener, and
// reconnects with backoff when the line drops. A 4xxx close is the server
// turning us away, and is final; onRefused hears why (no session, a stale
// build). If the server never answers, the game plays alone: `ready`
// resolves 'offline' and nothing else changes. Who we are rides on the
// session cookie, not in the hello, so every open first refreshes the
// session (beforeOpen); an access cookie lapses in minutes.

import { createClockSync } from './clock.ts'
import {
  CLOSE,
  parseServerMessage,
  PROTOCOL_VERSION,
  VALLEY_PARAM,
  WS_PATH,
} from './protocol.ts'
import type { ClockSync } from './clock.ts'
import type { Metres, XZ } from './interfaces.ts'
import type { TruckRoutes } from './marx.ts'
import type { MazePlace } from './maze.ts'
import type { OutfitId } from './outfits.ts'
import type {
  ClientMessage,
  PeerStateWire,
  PickupSpec,
  ServerMessage,
} from './protocol.ts'
import type { TruckPose } from './shadowmen.ts'
import type { WaterMap } from './waterside.ts'

export type NetStatus = 'connecting' | 'online' | 'offline'

export interface NetConfig {
  // Give up on the first connection after this long and play offline.
  connectTimeoutMs: number
  // How often to measure the clock offset once online.
  pingMs: number
}

export interface NetOptions {
  url: string
  config: NetConfig
  clock?: ClockSync
  // Run before every open; false means there is no session to open with,
  // which is a refusal like CLOSE.unauthenticated.
  beforeOpen?: () => Promise<boolean>
}

export interface NetIdentity {
  outfit: OutfitId
  // Every pickup this build placed, and how many stations; see
  // HelloMessage.
  pickups: PickupSpec[]
  stations: number
  // Each station's forecourt and the survey's size; see HelloMessage.
  havens: XZ[]
  metres: Metres
  // Where the water's edges run; see HelloMessage.
  water: WaterMap
  // Where the corn maze lies (the Caretaker's, rule 13), or null.
  maze: MazePlace | null
  // Where Marx parks and how long his joyride takes.
  truck: TruckRoutes
  // Where the Cabbage Stand stands (rule 23), or null.
  stand: XZ | null
  // Where the squatter deals (rule 24), or null.
  dealer: XZ | null
}

// Reconnect schedule, then give up: the valley is gone.
const BACKOFF_MS = [1_000, 2_000, 4_000, 8_000, 16_000, 30_000]
const MAX_ATTEMPTS = BACKOFF_MS.length + 6

type Listener = (msg: ServerMessage) => void
type StatusListener = (status: NetStatus) => void
type RefusedListener = (code: number, reason: string) => void

// The socket URL for this page: same origin, ws or wss to match. Dev
// builds forward ?valley=<id> so e2e specs each get their own valley.
export function socketUrl(
  location: { protocol: string; host: string; search: string },
  dev: boolean
): string {
  const scheme = location.protocol === 'https:' ? 'wss:' : 'ws:'
  const url = new URL(`${scheme}//${location.host}${WS_PATH}`)
  if (dev) {
    const picked = new URLSearchParams(location.search).get(VALLEY_PARAM)
    if (picked) url.searchParams.set(VALLEY_PARAM, picked)
  }
  return url.toString()
}

export class NetClient {
  readonly clock: ClockSync
  status: NetStatus = 'connecting'
  // Our id in the valley, from the welcome. Changes on every reconnect.
  id: string | null = null
  // Resolves once with the outcome of the first connection.
  readonly ready: Promise<NetStatus>

  private url: string
  private config: NetConfig
  private identity: NetIdentity | null = null
  private ws: WebSocket | null = null
  private attempt = 0
  private listeners: Listener[] = []
  private statusListeners: StatusListener[] = []
  private refusedListeners: RefusedListener[] = []
  private beforeOpen: (() => Promise<boolean>) | null
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null
  private pingTimer: ReturnType<typeof setInterval> | null = null
  private connectTimer: ReturnType<typeof setTimeout> | null = null
  private closed = false
  private resolveReady: (status: NetStatus) => void = () => {}

  constructor({ url, config, clock, beforeOpen }: NetOptions) {
    this.url = url
    this.config = config
    this.beforeOpen = beforeOpen ?? null
    this.clock = clock ?? createClockSync()
    this.ready = new Promise<NetStatus>((resolve) => {
      this.resolveReady = resolve
    })
  }

  get online(): boolean {
    return this.status === 'online'
  }

  connect(identity: NetIdentity): Promise<NetStatus> {
    this.identity = identity
    this.closed = false
    this.attempt = 0
    void this.open(true)
    return this.ready
  }

  close(): void {
    this.closed = true
    this.clearTimers()
    this.ws?.close(1000)
    this.ws = null
    this.setStatus('offline')
  }

  on(listener: Listener): void {
    this.listeners.push(listener)
  }

  onStatus(listener: StatusListener): void {
    this.statusListeners.push(listener)
  }

  // The server turned us away (a 4xxx close), or beforeOpen found no
  // session. Heard before the status goes offline.
  onRefused(listener: RefusedListener): void {
    this.refusedListeners.push(listener)
  }

  // A new character (Gron): the next hello, after a reconnect, says it.
  // The valley hears of it now from an appearance frame.
  setOutfit(outfit: OutfitId): void {
    if (this.identity) this.identity = { ...this.identity, outfit }
  }

  send(msg: ClientMessage): void {
    if (this.status !== 'online' || !this.ws) return
    this.ws.send(JSON.stringify(msg))
  }

  sendState(state: PeerStateWire): void {
    this.send({ type: 'state', ...state })
  }

  sendHeadlights(pose: TruckPose): void {
    this.send({ type: 'headlights', ...pose })
  }

  private async open(first = false): Promise<void> {
    if (!this.identity || this.closed) return
    if (this.beforeOpen) {
      const ok = await this.beforeOpen()
      if (this.closed) return
      if (!ok) {
        this.refuse(CLOSE.unauthenticated, 'No session')
        return
      }
    }
    // The first connection's deadline starts once the session is fresh,
    // so a slow refresh does not eat into it.
    if (first) {
      this.connectTimer = setTimeout(() => {
        this.connectTimer = null
        if (this.status !== 'online') this.resolveReady('offline')
      }, this.config.connectTimeoutMs)
    }
    const identity = this.identity
    let ws: WebSocket
    try {
      ws = new WebSocket(this.url)
    } catch {
      this.scheduleReconnect()
      return
    }
    this.ws = ws
    let sentAt = 0
    ws.addEventListener('open', () => {
      sentAt = performance.now()
      ws.send(
        JSON.stringify({
          type: 'hello',
          v: PROTOCOL_VERSION,
          outfit: identity.outfit,
          pickups: identity.pickups,
          stations: identity.stations,
          havens: identity.havens,
          metres: identity.metres,
          water: identity.water,
          maze: identity.maze,
          truck: identity.truck,
          stand: identity.stand,
          dealer: identity.dealer,
        } satisfies ClientMessage)
      )
    })
    ws.addEventListener('message', (event: MessageEvent) => {
      if (typeof event.data !== 'string') return
      const msg = parseServerMessage(event.data)
      if (!msg) return
      if (msg.type === 'welcome') {
        this.attempt = 0
        this.id = msg.id
        // The hello and the welcome bracket the server's first clock read.
        this.clock.observe({
          sentAt,
          receivedAt: performance.now(),
          serverNow: msg.serverNow,
        })
        this.startPings()
        this.setStatus('online')
        this.resolveReady('online')
      } else if (msg.type === 'pong') {
        this.clock.observe({
          sentAt: msg.t,
          receivedAt: performance.now(),
          serverNow: msg.serverNow,
        })
      }
      for (const listener of this.listeners) listener(msg)
    })
    ws.addEventListener('close', (event: CloseEvent) => {
      if (this.ws !== ws) return
      this.ws = null
      this.stopPings()
      if (this.closed) return
      // The server turned us away; do not knock again.
      if (event.code >= 4000 && event.code < 5000) {
        console.info(
          `Valley refused the connection: ${event.code} ${event.reason}`
        )
        this.refuse(event.code, event.reason)
        return
      }
      this.scheduleReconnect()
    })
    // The close event follows every error and owns the decision.
    ws.addEventListener('error', () => {})
  }

  private refuse(code: number, reason: string): void {
    for (const listener of this.refusedListeners) listener(code, reason)
    this.setStatus('offline')
    this.resolveReady('offline')
  }

  private scheduleReconnect(): void {
    if (this.closed) return
    if (this.attempt >= MAX_ATTEMPTS) {
      this.setStatus('offline')
      this.resolveReady('offline')
      return
    }
    const delay = BACKOFF_MS[Math.min(this.attempt, BACKOFF_MS.length - 1)]
    this.attempt += 1
    // The first connection keeps 'connecting' until the timeout decides.
    if (this.status === 'online') this.setStatus('offline')
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null
      void this.open()
    }, delay)
  }

  private startPings(): void {
    this.stopPings()
    this.pingTimer = setInterval(() => {
      this.send({ type: 'ping', t: performance.now() })
    }, this.config.pingMs)
  }

  private stopPings(): void {
    if (this.pingTimer !== null) clearInterval(this.pingTimer)
    this.pingTimer = null
  }

  private clearTimers(): void {
    this.stopPings()
    if (this.reconnectTimer !== null) clearTimeout(this.reconnectTimer)
    if (this.connectTimer !== null) clearTimeout(this.connectTimer)
    this.reconnectTimer = null
    this.connectTimer = null
  }

  private setStatus(next: NetStatus): void {
    if (this.status === next) return
    this.status = next
    for (const listener of this.statusListeners) listener(next)
  }
}
