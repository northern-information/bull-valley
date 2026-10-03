import { describe, expect, it } from 'vitest'
import { CLOSE, PROTOCOL_VERSION } from '../../src/protocol.ts'
import { ValleyDO } from '../../worker/ValleyDO.ts'
import type {
  DailyMessage,
  NackMessage,
  PeerJoinedMessage,
  PeerLeftMessage,
  PeerStateMessage,
  RaidMessage,
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
  frames(): ServerMessage[] {
    return this.sent.map((text) => JSON.parse(text) as ServerMessage)
  }
  last<T extends ServerMessage>(): T {
    return this.frames().at(-1) as T
  }
  // Every raid frame's reason, in order.
  reasons(): string[] {
    return this.frames()
      .filter((m): m is RaidMessage => m.type === 'raid')
      .map((m) => m.reason)
  }
}

class MockStorage {
  map = new Map<string, unknown>()
  alarm: number | null = null
  get<T>(key: string): Promise<T | undefined> {
    return Promise.resolve(this.map.get(key) as T | undefined)
  }
  put<T>(key: string, value: T): Promise<void> {
    this.map.set(key, value)
    return Promise.resolve()
  }
  setAlarm(at: number): Promise<void> {
    this.alarm = at
    return Promise.resolve()
  }
  deleteAlarm(): Promise<void> {
    this.alarm = null
    return Promise.resolve()
  }
}

class MockState {
  storage = new MockStorage()
  sockets: MockSocket[] = []
  acceptWebSocket(ws: MockSocket): void {
    this.sockets.push(ws)
  }
  getWebSockets(): MockSocket[] {
    return this.sockets
  }
  blockConcurrencyWhile<T>(fn: () => Promise<T>): Promise<T> {
    return fn()
  }
}

const ws = (s: MockSocket) => s as unknown as WebSocket
const asState = (s: MockState) => s as unknown as DurableObjectState

async function valley(state = new MockState()) {
  const v = new ValleyDO(asState(state), {} as Env)
  // Let the constructor's storage read settle.
  await Promise.resolve()
  return { valley: v, state }
}

const hello = (
  name = 'Dave',
  outfit = 'coleman',
  v = PROTOCOL_VERSION,
  pickups = 70,
  stations = 5
) => JSON.stringify({ type: 'hello', v, name, outfit, pickups, stations })

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

// A socket that has connected (dev or not) and said hello.
async function join(
  v: ValleyDO,
  s: MockState,
  name: string,
  { outfit = 'coleman', dev = false, pickups = 70 } = {}
) {
  const socket = new MockSocket()
  socket.serializeAttachment({ dev, me: null })
  s.acceptWebSocket(socket)
  await v.webSocketMessage(
    ws(socket),
    hello(name, outfit, PROTOCOL_VERSION, pickups)
  )
  return socket
}

const idOf = (socket: MockSocket) =>
  (socket.attachment as { me: { id: string } }).me.id

describe('ValleyDO', () => {
  it('refuses a plain HTTP request', async () => {
    const { valley: v } = await valley()
    const res = v.fetch(new Request('https://do/ws'))
    expect(res.status).toBe(426)
  })

  it('closes binary and malformed frames', async () => {
    const { valley: v, state: s } = await valley()
    const a = new MockSocket()
    s.acceptWebSocket(a)
    await v.webSocketMessage(ws(a), new ArrayBuffer(4))
    expect(a.closeCode).toBe(CLOSE.malformed)
    const b = new MockSocket()
    s.acceptWebSocket(b)
    await v.webSocketMessage(ws(b), '{"type":"dance"}')
    expect(b.closeCode).toBe(CLOSE.malformed)
  })

  it('wants a hello first, and only once', async () => {
    const { valley: v, state: s } = await valley()
    const a = new MockSocket()
    s.acceptWebSocket(a)
    await v.webSocketMessage(ws(a), state(1, 1))
    expect(a.closeCode).toBe(CLOSE.malformed)
    const b = await join(v, s, 'Dave')
    await v.webSocketMessage(ws(b), hello('Dave again'))
    expect(b.closeCode).toBe(CLOSE.malformed)
  })

  it('turns away the wrong protocol, a bad name, an unknown outfit, and a stale build', async () => {
    const { valley: v, state: s } = await valley()
    const old = new MockSocket()
    s.acceptWebSocket(old)
    await v.webSocketMessage(
      ws(old),
      hello('Dave', 'coleman', PROTOCOL_VERSION + 1)
    )
    expect(old.closeCode).toBe(CLOSE.badVersion)
    const blank = await join(v, s, '   ')
    expect(blank.closeCode).toBe(CLOSE.badName)
    const long = await join(v, s, 'x'.repeat(17))
    expect(long.closeCode).toBe(CLOSE.badName)
    const tuxedo = await join(v, s, 'Dave', { outfit: 'tuxedo' })
    expect(tuxedo.closeCode).toBe(CLOSE.badOutfit)
    expect((tuxedo.attachment as { me: unknown }).me).toBeNull()
    await join(v, s, 'First')
    const stale = await join(v, s, 'Second', { pickups: 71 })
    expect(stale.closeCode).toBe(CLOSE.staleBuild)
    const moved = new MockSocket()
    moved.serializeAttachment({ dev: false, me: null })
    s.acceptWebSocket(moved)
    await v.webSocketMessage(
      ws(moved),
      hello('Third', 'coleman', PROTOCOL_VERSION, 70, 6)
    )
    expect(moved.closeCode).toBe(CLOSE.staleBuild)
  })

  it('welcomes a player with the roster and the raid, and tells the others', async () => {
    const { valley: v, state: s } = await valley()
    const a = await join(v, s, '  Dave  Coleman ')
    const welcomeA = a.last<WelcomeMessage>()
    expect(welcomeA.type).toBe('welcome')
    expect(welcomeA.peers).toEqual([])
    expect(typeof welcomeA.serverNow).toBe('number')
    expect(welcomeA.phase).toBe('LOBBY')
    expect(welcomeA.raid.phase).toBe('LOBBY')
    expect(welcomeA.raid.members).toEqual([
      { id: welcomeA.id, name: 'Dave Coleman', phase: 'LOBBY', boarded: false },
    ])
    // The lobby clock is armed.
    expect(s.storage.alarm).toBe(welcomeA.raid.loadoutEndsAt)

    await v.webSocketMessage(ws(a), state(5, 6))
    const b = await join(v, s, 'Kvistad', { outfit: 'kvistad' })
    const welcomeB = b.last<WelcomeMessage>()
    expect(welcomeB.peers).toHaveLength(1)
    expect(welcomeB.peers[0]).toMatchObject({
      id: welcomeA.id,
      name: 'Dave Coleman',
      outfit: 'coleman',
      at: { x: 5, z: 6, pose: 'walk' },
    })
    expect(welcomeB.raid.members.map((m) => m.name)).toEqual([
      'Dave Coleman',
      'Kvistad',
    ])
    const [joined, raid] = a.frames().slice(-2) as [
      PeerJoinedMessage,
      RaidMessage,
    ]
    expect(joined.type).toBe('peer-joined')
    expect(joined.peer).toMatchObject({
      id: welcomeB.id,
      name: 'Kvistad',
      at: null,
    })
    expect(raid).toMatchObject({
      type: 'raid',
      reason: 'joined',
      by: welcomeB.id,
    })
    expect(welcomeA.id).not.toBe(welcomeB.id)
  })

  it('fans a state out to everyone else, not the sender', async () => {
    const { valley: v, state: s } = await valley()
    const a = await join(v, s, 'A')
    const b = await join(v, s, 'B')
    const stranger = new MockSocket()
    s.acceptWebSocket(stranger)
    const beforeA = a.sent.length
    await v.webSocketMessage(ws(a), state(7, 8))
    expect(a.sent.length).toBe(beforeA)
    const fanned = b.last<PeerStateMessage>()
    expect(fanned).toMatchObject({ type: 'peer-state', x: 7, z: 8, yaw: 0.5 })
    expect(fanned.id).toBe(idOf(a))
    expect(stranger.sent).toEqual([])
  })

  it('drops a flood of state frames', async () => {
    const { valley: v, state: s } = await valley()
    const a = await join(v, s, 'A')
    const b = await join(v, s, 'B')
    const before = b.sent.length
    for (let i = 0; i < 100; i++) await v.webSocketMessage(ws(a), state(i, 0))
    expect(b.sent.length - before).toBe(30)
    expect(a.closeCode).toBeNull()
  })

  it('answers pings with the server clock', async () => {
    const { valley: v, state: s } = await valley()
    const a = await join(v, s, 'A')
    await v.webSocketMessage(ws(a), JSON.stringify({ type: 'ping', t: 42 }))
    expect(a.last()).toMatchObject({ type: 'pong', t: 42 })
  })

  it('runs the raid: boarding, the alarm, pickups, and extraction', async () => {
    const { valley: v, state: s } = await valley()
    const a = await join(v, s, 'A')
    const b = await join(v, s, 'B')
    await v.webSocketMessage(ws(a), '{"type":"board"}')
    expect(a.last<RaidMessage>()).toMatchObject({
      reason: 'boarded',
      by: idOf(a),
    })
    expect(b.last<RaidMessage>().reason).toBe('boarded')
    // The clock runs out with A aboard.
    await v.alarm()
    const depart = a.last<RaidMessage>()
    expect(depart.reason).toBe('depart')
    expect(depart.raid?.riders).toEqual([idOf(a)])
    expect(s.storage.alarm).toBeNull()
    // B is on foot and takes a pickup; A is told; B's second try is refused.
    await v.webSocketMessage(ws(b), '{"type":"take","index":4}')
    expect(a.last<RaidMessage>()).toMatchObject({
      reason: 'taken',
      by: idOf(b),
      index: 4,
    })
    await v.webSocketMessage(ws(b), '{"type":"take","index":4}')
    expect(b.last<NackMessage>()).toEqual({
      type: 'nack',
      re: 'take',
      reason: 'gone',
      index: 4,
    })
    // A hops out and extracts; B is told.
    await v.webSocketMessage(ws(a), '{"type":"hop-out"}')
    await v.webSocketMessage(ws(a), '{"type":"extract","kind":"keep"}')
    expect(b.last<RaidMessage>()).toMatchObject({
      reason: 'extracted',
      by: idOf(a),
      kind: 'keep',
    })
    // The raid is persisted.
    const stored = s.storage.map.get('valley') as { raid: { taken: number[] } }
    expect(stored.raid.taken).toEqual([4])
  })

  it('sells a shelf unit once, to the first to ask', async () => {
    const { valley: v, state: s } = await valley()
    const a = await join(v, s, 'A')
    const b = await join(v, s, 'B')
    expect(a.last<WelcomeMessage>().raid.shelves).toHaveLength(5)
    const perItem = a.last<WelcomeMessage>().raid.shelves[0].pbr
    for (let i = 0; i < perItem; i++) {
      await v.webSocketMessage(ws(a), '{"type":"buy","station":0,"kind":"pbr"}')
    }
    const bought = b.last<RaidMessage>()
    expect(bought).toMatchObject({
      reason: 'bought',
      by: idOf(a),
      station: 0,
      item: 'pbr',
    })
    expect(bought.raid?.shelves[0].pbr).toBe(0)
    expect(bought.raid?.shelves[1].pbr).toBe(perItem)
    await v.webSocketMessage(ws(b), '{"type":"buy","station":0,"kind":"pbr"}')
    expect(b.last<NackMessage>()).toEqual({
      type: 'nack',
      re: 'buy',
      reason: 'sold-out',
      station: 0,
      item: 'pbr',
    })
  })

  it('hands out one berry a day per name, and says so in the welcome', async () => {
    const { valley: v, state: s } = await valley()
    const before = Date.now()
    const a = await join(v, s, 'Dave')
    const welcome = a.last<WelcomeMessage>()
    expect(welcome.daily.collected).toBe(false)
    expect(welcome.daily.resetsAt).toBeGreaterThan(before)
    await v.webSocketMessage(ws(a), '{"type":"collect"}')
    const picked = a.last<DailyMessage>()
    expect(picked).toMatchObject({
      type: 'daily',
      picked: true,
      daily: { collected: true },
    })
    expect(picked.daily.resetsAt).toBe(welcome.daily.resetsAt)
    await v.webSocketMessage(ws(a), '{"type":"collect"}')
    expect(a.last<DailyMessage>()).toMatchObject({
      type: 'daily',
      picked: false,
    })
    // The same name on another socket already had today's.
    const twin = await join(v, s, ' Dave ')
    expect(twin.last<WelcomeMessage>().daily.collected).toBe(true)
    await v.webSocketMessage(ws(twin), '{"type":"collect"}')
    expect(twin.last<DailyMessage>().picked).toBe(false)
    // Another name has its own.
    const b = await join(v, s, 'Kvistad')
    expect(b.last<WelcomeMessage>().daily.collected).toBe(false)
    // Nobody else heard a thing.
    expect(b.frames().some((m) => m.type === 'daily')).toBe(false)
    // The record is persisted with the valley.
    const stored = s.storage.map.get('valley') as {
      dailies: Record<string, string>
    }
    expect(Object.keys(stored.dailies)).toEqual(['Dave'])
  })

  it('wakes a valley stored before the bush existed', async () => {
    const shared = new MockState()
    shared.storage.map.set('valley', { epoch: 3, raid: null, members: {} })
    const { valley: v } = await valley(shared)
    const a = await join(v, shared, 'Dave')
    expect(a.last<WelcomeMessage>().daily.collected).toBe(false)
    await v.webSocketMessage(ws(a), '{"type":"collect"}')
    expect(a.last<DailyMessage>().picked).toBe(true)
  })

  it('keeps the dev frames for dev sockets', async () => {
    const { valley: v, state: s } = await valley()
    const plain = await join(v, s, 'A')
    await v.webSocketMessage(
      ws(plain),
      '{"type":"dev","op":"hurry","seconds":1}'
    )
    expect(plain.last<NackMessage>()).toMatchObject({
      re: 'dev',
      reason: 'not-a-dev-server',
    })
    const dev = await join(v, s, 'B', { dev: true })
    await v.webSocketMessage(ws(dev), '{"type":"dev","op":"hurry","seconds":1}')
    expect(dev.last<RaidMessage>().reason).toBe('hurry')
    expect(s.storage.alarm).toBe(dev.last<RaidMessage>().raid?.loadoutEndsAt)
  })

  it('announces a departure once and settles the raid', async () => {
    const { valley: v, state: s } = await valley()
    const a = await join(v, s, 'A')
    const b = await join(v, s, 'B')
    const before = a.sent.length
    const idB = idOf(b)
    await v.webSocketError(ws(b))
    await v.webSocketClose(ws(b))
    const frames = a.frames().slice(before)
    expect(frames.map((m) => m.type)).toEqual(['peer-left', 'raid'])
    expect((frames[0] as PeerLeftMessage).id).toBe(idB)
    expect((frames[1] as RaidMessage).reason).toBe('left')
    // The last one out resets the valley.
    await v.webSocketClose(ws(a))
    const stored = s.storage.map.get('valley') as { raid: unknown }
    expect(stored.raid).toBeNull()
    expect(s.storage.alarm).toBeNull()
  })

  it('wakes with the raid from storage and the roster from attachments', async () => {
    const shared = new MockState()
    const first = (await valley(shared)).valley
    const a = await join(first, shared, 'A')
    await first.webSocketMessage(ws(a), '{"type":"take","index":9}')
    // Hibernation: a new object over the same storage and sockets.
    const woken = (await valley(shared)).valley
    const b = await join(woken, shared, 'B')
    const welcome = b.last<WelcomeMessage>()
    expect(welcome.peers.map((p) => p.name)).toEqual(['A'])
    expect(welcome.raid.taken).toEqual([9])
    expect(welcome.raid.members.map((m) => m.name)).toEqual(['A', 'B'])
    expect(a.last<RaidMessage>()).toMatchObject({
      reason: 'joined',
      by: idOf(b),
    })
  })
})
