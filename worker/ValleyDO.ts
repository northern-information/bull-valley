// The valley server: one Durable Object holding everyone who is online.
// Each socket's player lives in its attachment (WebSocket Hibernation API),
// so the object can sleep between frames and wake with the roster intact.
// Nothing is stored yet beyond the sockets themselves; the shared raid comes
// next and will live in ctx.storage. The rules live in src/protocol.ts.

import { DurableObject } from 'cloudflare:workers'
import {
  CLOSE,
  isOutfitId,
  isValidName,
  normalizeName,
  parseClientMessage,
  PROTOCOL_VERSION,
} from '../src/protocol.ts'
import type {
  HelloMessage,
  PeerStateWire,
  PeerWire,
  ServerMessage,
} from '../src/protocol.ts'

// Per-socket state, serialized into the socket's attachment (16 KB cap;
// this is well under 1 KB).
interface Attachment extends PeerWire {
  joinedAt: number
}

// State frames per second one socket may send before the rest are dropped.
// The client sends at most CONFIG.net.sendHz; three times that is a flood.
const MAX_STATE_PER_SECOND = 30

interface RateWindow {
  startedAt: number
  count: number
}

export class ValleyDO extends DurableObject<Env> {
  // Rate windows live in memory only; a wake from hibernation starts them
  // fresh, which only ever lets a few extra frames through.
  private rate = new WeakMap<WebSocket, RateWindow>()

  fetch(request: Request): Response {
    if (request.headers.get('Upgrade') !== 'websocket') {
      return new Response('Expected a WebSocket upgrade', { status: 426 })
    }
    const pair = new WebSocketPair()
    const [client, server] = [pair[0], pair[1]]
    this.ctx.acceptWebSocket(server)
    return new Response(null, { status: 101, webSocket: client })
  }

  webSocketMessage(ws: WebSocket, data: string | ArrayBuffer): void {
    if (typeof data !== 'string') {
      ws.close(CLOSE.malformed, 'Text frames only')
      return
    }
    const msg = parseClientMessage(data)
    if (!msg) {
      ws.close(CLOSE.malformed, 'Malformed frame')
      return
    }
    const me = this.attachment(ws)
    if (!me) {
      if (msg.type !== 'hello') {
        ws.close(CLOSE.malformed, 'Expected hello first')
        return
      }
      this.hello(ws, msg)
      return
    }
    switch (msg.type) {
      case 'hello':
        ws.close(CLOSE.malformed, 'Already said hello')
        return
      case 'state':
        this.state(ws, me, msg)
        return
      case 'ping':
        send(ws, { type: 'pong', t: msg.t, serverNow: Date.now() })
        return
    }
  }

  webSocketClose(ws: WebSocket): void {
    this.left(ws)
  }

  webSocketError(ws: WebSocket): void {
    this.left(ws)
  }

  private attachment(ws: WebSocket): Attachment | null {
    return (ws.deserializeAttachment() as Attachment | null) ?? null
  }

  private hello(ws: WebSocket, hello: HelloMessage): void {
    if (hello.v !== PROTOCOL_VERSION) {
      ws.close(CLOSE.badVersion, `Protocol ${PROTOCOL_VERSION} required`)
      return
    }
    const name = normalizeName(hello.name)
    if (!isValidName(name)) {
      ws.close(CLOSE.badName, 'Invalid name')
      return
    }
    if (!isOutfitId(hello.outfit)) {
      ws.close(CLOSE.badOutfit, 'Unknown outfit')
      return
    }
    const me: Attachment = {
      id: crypto.randomUUID(),
      name,
      outfit: hello.outfit,
      at: null,
      joinedAt: Date.now(),
    }
    ws.serializeAttachment(me)
    send(ws, {
      type: 'welcome',
      id: me.id,
      serverNow: Date.now(),
      peers: this.roster(ws),
    })
    this.broadcast({ type: 'peer-joined', peer: wire(me) }, ws)
  }

  private state(ws: WebSocket, me: Attachment, state: PeerStateWire): void {
    if (!this.allow(ws)) return
    const { x, y, z, yaw, pose, riding } = state
    me.at = { x, y, z, yaw, pose, riding }
    ws.serializeAttachment(me)
    this.broadcast({ type: 'peer-state', id: me.id, ...me.at }, ws)
  }

  private left(ws: WebSocket): void {
    const me = this.attachment(ws)
    if (!me) return
    // Clear the attachment first so a close that fires twice (close after
    // error) announces the departure once.
    ws.serializeAttachment(null)
    this.broadcast({ type: 'peer-left', id: me.id }, ws)
  }

  // Everyone who has said hello, except the socket asking.
  private roster(exclude: WebSocket): PeerWire[] {
    const peers: PeerWire[] = []
    for (const socket of this.ctx.getWebSockets()) {
      if (socket === exclude) continue
      const other = this.attachment(socket)
      if (other) peers.push(wire(other))
    }
    return peers
  }

  private broadcast(msg: ServerMessage, exclude: WebSocket): void {
    const text = JSON.stringify(msg)
    for (const socket of this.ctx.getWebSockets()) {
      if (socket === exclude || !this.attachment(socket)) continue
      try {
        socket.send(text)
      } catch {
        // Closing sockets throw; their close handler follows.
      }
    }
  }

  // A one-second window per socket. Returns false for frames over the cap.
  private allow(ws: WebSocket): boolean {
    const now = Date.now()
    const window = this.rate.get(ws)
    if (!window || now - window.startedAt >= 1000) {
      this.rate.set(ws, { startedAt: now, count: 1 })
      return true
    }
    window.count += 1
    return window.count <= MAX_STATE_PER_SECOND
  }
}

function wire({ id, name, outfit, at }: Attachment): PeerWire {
  return { id, name, outfit, at }
}

function send(ws: WebSocket, msg: ServerMessage): void {
  ws.send(JSON.stringify(msg))
}
