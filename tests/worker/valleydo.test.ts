import { describe, expect, it } from 'vitest'
import { CLOSE, PROTOCOL_VERSION } from '../../src/protocol.ts'
import { ValleyDO } from '../../worker/ValleyDO.ts'
import type {
  PeerJoinedMessage,
  PeerLeftMessage,
  PeerStateMessage,
  ServerMessage,
  WelcomeMessage,
} from '../../src/protocol.ts'

// Mocks for the slice of the Workers runtime the object touches.

class MockSocket {
  attachment: unknown = null
  sent: string[] = []
  closeCode: number | null = null
  closeReason = ''

  send(data: string): void {
    this.sent.push(data)
  }
  close(code?: number, reason?: string): void {
    this.closeCode = code ?? 1000
    this.closeReason = reason ?? ''
  }
  serializeAttachment(value: unknown): void {
    this.attachment = value
  }
  deserializeAttachment(): unknown {
    return this.attachment
  }
  // Parsed frames, newest last.
  frames(): ServerMessage[] {
    return this.sent.map((text) => JSON.parse(text) as ServerMessage)
  }
  last<T extends ServerMessage>(): T {
    return this.frames().at(-1) as T
  }
}

class MockState {
  sockets: MockSocket[] = []
  acceptWebSocket(ws: MockSocket): void {
    this.sockets.push(ws)
  }
  getWebSockets(): MockSocket[] {
    return this.sockets
  }
}

const ws = (s: MockSocket) => s as unknown as WebSocket

function valley(): { valley: ValleyDO; state: MockState } {
  const state = new MockState()
  const env = {} as Env
  const v = new ValleyDO(state as unknown as DurableObjectState, env)
  return { valley: v, state }
}

const hello = (name = 'Dave', outfit = 'coleman', v = PROTOCOL_VERSION) =>
  JSON.stringify({ type: 'hello', v, name, outfit })

const state = (x: number, z: number) =>
  JSON.stringify({
    type: 'state',
    x,
    y: 0,
    z,
    yaw: 0.5,
    pose: 'walk',
    riding: false,
  })

// A socket that has said hello.
function join(v: ValleyDO, s: MockState, name: string, outfit = 'coleman') {
  const socket = new MockSocket()
  s.acceptWebSocket(socket)
  v.webSocketMessage(ws(socket), hello(name, outfit))
  return socket
}

describe('ValleyDO', () => {
  it('refuses a plain HTTP request', () => {
    const { valley: v } = valley()
    const res = v.fetch(new Request('https://do/ws'))
    expect(res.status).toBe(426)
  })

  it('closes binary and malformed frames', () => {
    const { valley: v, state: s } = valley()
    const a = new MockSocket()
    s.acceptWebSocket(a)
    v.webSocketMessage(ws(a), new ArrayBuffer(4))
    expect(a.closeCode).toBe(CLOSE.malformed)
    const b = new MockSocket()
    s.acceptWebSocket(b)
    v.webSocketMessage(ws(b), '{"type":"dance"}')
    expect(b.closeCode).toBe(CLOSE.malformed)
  })

  it('wants a hello first, and only once', () => {
    const { valley: v, state: s } = valley()
    const a = new MockSocket()
    s.acceptWebSocket(a)
    v.webSocketMessage(ws(a), state(1, 1))
    expect(a.closeCode).toBe(CLOSE.malformed)
    const b = join(v, s, 'Dave')
    v.webSocketMessage(ws(b), hello('Dave again'))
    expect(b.closeCode).toBe(CLOSE.malformed)
  })

  it('turns away the wrong protocol, a bad name, and an unknown outfit', () => {
    const { valley: v, state: s } = valley()
    const old = new MockSocket()
    s.acceptWebSocket(old)
    v.webSocketMessage(ws(old), hello('Dave', 'coleman', PROTOCOL_VERSION + 1))
    expect(old.closeCode).toBe(CLOSE.badVersion)
    const blank = join(v, s, '   ')
    expect(blank.closeCode).toBe(CLOSE.badName)
    const long = join(v, s, 'x'.repeat(17))
    expect(long.closeCode).toBe(CLOSE.badName)
    const tuxedo = join(v, s, 'Dave', 'tuxedo')
    expect(tuxedo.closeCode).toBe(CLOSE.badOutfit)
    expect(tuxedo.attachment).toBeNull()
  })

  it('welcomes a player with the roster and tells the others', () => {
    const { valley: v, state: s } = valley()
    const a = join(v, s, '  Dave  Coleman ')
    const welcomeA = a.last<WelcomeMessage>()
    expect(welcomeA.type).toBe('welcome')
    expect(welcomeA.peers).toEqual([])
    expect(typeof welcomeA.serverNow).toBe('number')
    expect(a.attachment).toMatchObject({ name: 'Dave Coleman', at: null })

    v.webSocketMessage(ws(a), state(5, 6))
    const b = join(v, s, 'Kvistad', 'kvistad')
    const welcomeB = b.last<WelcomeMessage>()
    expect(welcomeB.peers).toHaveLength(1)
    expect(welcomeB.peers[0]).toMatchObject({
      id: welcomeA.id,
      name: 'Dave Coleman',
      outfit: 'coleman',
      at: { x: 5, z: 6, pose: 'walk' },
    })
    const joined = a.last<PeerJoinedMessage>()
    expect(joined.type).toBe('peer-joined')
    expect(joined.peer).toMatchObject({
      id: welcomeB.id,
      name: 'Kvistad',
      outfit: 'kvistad',
      at: null,
    })
    expect(welcomeA.id).not.toBe(welcomeB.id)
  })

  it('fans a state out to everyone else, not the sender', () => {
    const { valley: v, state: s } = valley()
    const a = join(v, s, 'A')
    const b = join(v, s, 'B')
    const stranger = new MockSocket()
    s.acceptWebSocket(stranger)
    const beforeA = a.sent.length
    v.webSocketMessage(ws(a), state(7, 8))
    expect(a.sent.length).toBe(beforeA)
    const fanned = b.last<PeerStateMessage>()
    expect(fanned).toMatchObject({ type: 'peer-state', x: 7, z: 8, yaw: 0.5 })
    expect(fanned.id).toBe((a.attachment as { id: string }).id)
    // A socket that never said hello hears nothing.
    expect(stranger.sent).toEqual([])
  })

  it('drops a flood of state frames', () => {
    const { valley: v, state: s } = valley()
    const a = join(v, s, 'A')
    const b = join(v, s, 'B')
    const before = b.sent.length
    for (let i = 0; i < 100; i++) v.webSocketMessage(ws(a), state(i, 0))
    expect(b.sent.length - before).toBe(30)
    expect(a.closeCode).toBeNull()
  })

  it('answers pings with the server clock', () => {
    const { valley: v, state: s } = valley()
    const a = join(v, s, 'A')
    v.webSocketMessage(ws(a), JSON.stringify({ type: 'ping', t: 42 }))
    expect(a.last()).toMatchObject({ type: 'pong', t: 42 })
  })

  it('announces a departure once', () => {
    const { valley: v, state: s } = valley()
    const a = join(v, s, 'A')
    const b = join(v, s, 'B')
    const idB = (b.attachment as { id: string }).id
    const before = a.sent.length
    v.webSocketError(ws(b))
    v.webSocketClose(ws(b))
    expect(a.sent.length).toBe(before + 1)
    expect(a.last<PeerLeftMessage>()).toEqual({ type: 'peer-left', id: idB })
  })

  it('rebuilds the roster from attachments after waking', () => {
    const shared = new MockState()
    const first = new ValleyDO(
      shared as unknown as DurableObjectState,
      {} as Env
    )
    const a = join(first, shared, 'A')
    // Hibernation: a new object over the same sockets and attachments.
    const woken = new ValleyDO(
      shared as unknown as DurableObjectState,
      {} as Env
    )
    const b = join(woken, shared, 'B')
    expect(b.last<WelcomeMessage>().peers.map((p) => p.name)).toEqual(['A'])
    expect(a.last<PeerJoinedMessage>().peer.name).toBe('B')
  })
})
