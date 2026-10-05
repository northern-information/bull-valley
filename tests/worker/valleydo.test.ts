import { describe, expect, it } from 'vitest'
import { STARTING_INVENTORY } from '../../src/inventory.ts'
import { getItem } from '../../src/items.ts'
import { CLOSE, PROTOCOL_VERSION } from '../../src/protocol.ts'
import { MemoryPackStore, STARTING_CASH } from '../../worker/packs.ts'
import { ValleyDO } from '../../worker/ValleyDO.ts'
import type {
  DailyMessage,
  NackMessage,
  PackMessage,
  PeerChatMessage,
  PeerJoinedMessage,
  PeerLeftMessage,
  PeerStateMessage,
  PeerUpdatedMessage,
  RaidMessage,
  ServerMessage,
  WelcomeMessage,
} from '../../src/protocol.ts'
import type { PackStore } from '../../worker/packs.ts'

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

// The valley with its packs in memory instead of D1.
class TestValley extends ValleyDO {
  packStore: PackStore = new MemoryPackStore()
  protected override packs(): PackStore {
    return this.packStore
  }
}

async function valley(state = new MockState(), env: Partial<Env> = {}) {
  const v = new TestValley(asState(state), env as Env)
  // Let the constructor's storage read settle.
  await Promise.resolve()
  return { valley: v, state }
}

// What a build placed: two joints first, then `n - 1` cabbages.
const placed = (n: number) => [
  { kind: 'joints', count: 2 },
  ...Array.from({ length: n - 1 }, () => ({ kind: 'cabbage', count: 1 })),
]

const hello = (
  outfit = 'coleman',
  v = PROTOCOL_VERSION,
  pickups = 70,
  stations = 5
) =>
  JSON.stringify({
    type: 'hello',
    v,
    outfit,
    pickups: placed(pickups),
    stations,
  })

// The last pack frame a socket was sent.
const lastPack = (socket: MockSocket) =>
  socket.frames().findLast((m): m is PackMessage => m.type === 'pack')?.pack

// The last daily frame; a berry picked is followed by a pack frame.
function lastDaily(socket: MockSocket): DailyMessage {
  const daily = socket
    .frames()
    .findLast((m): m is DailyMessage => m.type === 'daily')
  if (!daily) throw new Error('no daily frame')
  return daily
}

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

const chat = (text: string) => JSON.stringify({ type: 'chat', text })

// A socket the Worker stamped as a signed-in raider, as the upgrade would
// (see fetch): the account, and the username the valley shows.
function stamped(name: string, { dev = false, account = `acct-${name}` } = {}) {
  const socket = new MockSocket()
  socket.serializeAttachment({ dev, account, name, me: null })
  return socket
}

// A socket that has connected (dev or not), signed in as `name`, and said
// hello.
async function join(
  v: ValleyDO,
  s: MockState,
  name: string,
  {
    outfit = 'coleman',
    dev = false,
    pickups = 70,
    account = `acct-${name}`,
  } = {}
) {
  const socket = stamped(name, { dev, account })
  s.acceptWebSocket(socket)
  await v.webSocketMessage(ws(socket), hello(outfit, PROTOCOL_VERSION, pickups))
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

  it('takes who is signed in from the Worker stamps on the upgrade', async () => {
    const { valley: v, state: s } = await valley()
    // Node has no WebSocketPair, and no 101 responses; stand both in.
    const realPair = (globalThis as { WebSocketPair?: unknown }).WebSocketPair
    Object.assign(globalThis, {
      WebSocketPair: function () {
        return [new MockSocket(), new MockSocket()]
      },
    })
    const realResponse = globalThis.Response
    globalThis.Response = class extends realResponse {
      constructor(body: BodyInit | null, init?: ResponseInit) {
        super(body, { ...init, status: 200 })
      }
    } as typeof Response
    try {
      v.fetch(
        new Request('https://do/ws', {
          headers: {
            Upgrade: 'websocket',
            'x-bv-account': 'acct-9',
            'x-bv-name': 'Dave',
          },
        })
      )
      v.fetch(
        new Request('https://do/ws', { headers: { Upgrade: 'websocket' } })
      )
    } finally {
      globalThis.Response = realResponse
      Object.assign(globalThis, { WebSocketPair: realPair })
    }
    expect(s.sockets).toHaveLength(2)
    expect(s.sockets[0].attachment).toEqual({
      dev: false,
      account: 'acct-9',
      name: 'Dave',
      me: null,
    })
    expect(s.sockets[1].attachment).toEqual({
      dev: false,
      account: null,
      name: null,
      me: null,
    })
  })

  it('turns away a hello with no signed-in account', async () => {
    const { valley: v, state: s } = await valley()
    const bare = new MockSocket()
    s.acceptWebSocket(bare)
    await v.webSocketMessage(ws(bare), hello())
    expect(bare.closeCode).toBe(CLOSE.unauthenticated)
    const unstamped = new MockSocket()
    unstamped.serializeAttachment({
      dev: true,
      account: null,
      name: null,
      me: null,
    })
    s.acceptWebSocket(unstamped)
    await v.webSocketMessage(ws(unstamped), hello())
    expect(unstamped.closeCode).toBe(CLOSE.unauthenticated)
    expect(s.storage.map.get('valley')).toBeUndefined()
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
    const a = stamped('Dave')
    s.acceptWebSocket(a)
    await v.webSocketMessage(ws(a), state(1, 1))
    expect(a.closeCode).toBe(CLOSE.malformed)
    const b = await join(v, s, 'Dave')
    await v.webSocketMessage(ws(b), hello())
    expect(b.closeCode).toBe(CLOSE.malformed)
  })

  it('turns away the wrong protocol, a bad name, an unknown outfit, and a stale build', async () => {
    const { valley: v, state: s } = await valley()
    const old = stamped('Dave')
    s.acceptWebSocket(old)
    await v.webSocketMessage(ws(old), hello('coleman', PROTOCOL_VERSION + 1))
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
    const moved = stamped('Third')
    s.acceptWebSocket(moved)
    await v.webSocketMessage(
      ws(moved),
      hello('coleman', PROTOCOL_VERSION, 70, 6)
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
      {
        id: welcomeA.id,
        name: 'Dave Coleman',
        phase: 'LOBBY',
        boarded: false,
        carrying: 0,
        delivered: 0,
        sack: false,
      },
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

  it('says a chat line to everyone, the sender too, under the held name', async () => {
    const { valley: v, state: s } = await valley()
    const a = await join(v, s, '  Dave  Coleman ')
    const b = await join(v, s, 'B')
    const stranger = new MockSocket()
    s.acceptWebSocket(stranger)
    await v.webSocketMessage(ws(a), chat('cabbages by the keep'))
    for (const socket of [a, b]) {
      expect(socket.last()).toMatchObject({
        type: 'chat',
        id: idOf(a),
        name: 'Dave Coleman',
        text: 'cabbages by the keep',
      })
    }
    expect(typeof b.last<PeerChatMessage>().at).toBe('number')
    expect(stranger.sent).toEqual([])
  })

  it('nacks a flood of chat lines and refuses chat before hello', async () => {
    const { valley: v, state: s } = await valley()
    const a = await join(v, s, 'A')
    const b = await join(v, s, 'B')
    const before = b.sent.length
    for (let i = 0; i < 8; i++) await v.webSocketMessage(ws(a), chat(`${i}`))
    expect(b.sent.length - before).toBe(5)
    expect(a.last()).toMatchObject({ type: 'nack', re: 'chat' })
    expect(a.closeCode).toBeNull()
    const early = new MockSocket()
    s.acceptWebSocket(early)
    await v.webSocketMessage(ws(early), chat('hi'))
    expect(early.closeCode).toBe(CLOSE.malformed)
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
    const perItem = a.last<WelcomeMessage>().raid.shelves[0].pbr.length
    for (let unit = 0; unit < perItem; unit++) {
      await v.webSocketMessage(
        ws(a),
        JSON.stringify({ type: 'buy', station: 0, kind: 'pbr', unit })
      )
    }
    const bought = b.last<RaidMessage>()
    expect(bought).toMatchObject({
      reason: 'bought',
      by: idOf(a),
      station: 0,
      item: 'pbr',
    })
    expect(bought.raid?.shelves[0].pbr).toEqual(Array(perItem).fill(false))
    expect(bought.raid?.shelves[1].pbr).toEqual(Array(perItem).fill(true))
    await v.webSocketMessage(
      ws(b),
      '{"type":"buy","station":0,"kind":"pbr","unit":0}'
    )
    expect(b.last<NackMessage>()).toEqual({
      type: 'nack',
      re: 'buy',
      reason: 'sold-out',
      station: 0,
      item: 'pbr',
    })
  })

  it('hands out one berry a day per account, and says so in the welcome', async () => {
    const { valley: v, state: s } = await valley()
    const before = Date.now()
    const a = await join(v, s, 'Dave')
    const welcome = a.last<WelcomeMessage>()
    expect(welcome.daily.collected).toBe(false)
    expect(welcome.daily.resetsAt).toBeGreaterThan(before)
    await v.webSocketMessage(ws(a), '{"type":"collect"}')
    const picked = lastDaily(a)
    expect(picked).toMatchObject({
      type: 'daily',
      picked: true,
      daily: { collected: true },
    })
    expect(picked.daily.resetsAt).toBe(welcome.daily.resetsAt)
    await v.webSocketMessage(ws(a), '{"type":"collect"}')
    expect(lastDaily(a)).toMatchObject({
      type: 'daily',
      picked: false,
    })
    // The same account on another socket already had today's.
    const twin = await join(v, s, 'Dave')
    expect(twin.last<WelcomeMessage>().daily.collected).toBe(true)
    await v.webSocketMessage(ws(twin), '{"type":"collect"}')
    expect(lastDaily(twin).picked).toBe(false)
    // Another account has its own, even under a name that looks the same.
    const b = await join(v, s, 'Dave', { account: 'acct-other' })
    expect(b.last<WelcomeMessage>().daily.collected).toBe(false)
    // Nobody else heard a thing.
    expect(b.frames().some((m) => m.type === 'daily')).toBe(false)
    // The record is persisted with the valley.
    const stored = s.storage.map.get('valley') as {
      dailies: Record<string, string>
    }
    expect(Object.keys(stored.dailies)).toEqual(['acct-Dave'])
  })

  it('wakes a valley stored before the bush existed', async () => {
    const shared = new MockState()
    shared.storage.map.set('valley', { epoch: 3, raid: null, members: {} })
    const { valley: v } = await valley(shared)
    const a = await join(v, shared, 'Dave')
    expect(a.last<WelcomeMessage>().daily.collected).toBe(false)
    await v.webSocketMessage(ws(a), '{"type":"collect"}')
    expect(lastDaily(a).picked).toBe(true)
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
    await first.webSocketMessage(ws(a), '{"type":"take","index":0}')
    // Hibernation: a new object over the same storage and sockets.
    const woken = (await valley(shared)).valley
    const b = await join(woken, shared, 'B')
    const welcome = b.last<WelcomeMessage>()
    expect(welcome.peers.map((p) => p.name)).toEqual(['A'])
    expect(welcome.raid.taken).toEqual([0])
    expect(welcome.raid.members.map((m) => m.name)).toEqual(['A', 'B'])
    expect(a.last<RaidMessage>()).toMatchObject({
      reason: 'joined',
      by: idOf(b),
    })
  })

  it('shows a new character from Gron to everyone', async () => {
    const { valley: v, state: s } = await valley()
    const a = await join(v, s, 'A')
    const b = await join(v, s, 'B')
    await v.webSocketMessage(
      ws(a),
      JSON.stringify({ type: 'appearance', outfit: 'church' })
    )
    for (const socket of [a, b]) {
      expect(socket.last<PeerUpdatedMessage>()).toEqual({
        type: 'peer-updated',
        peer: { id: idOf(a), name: 'A', outfit: 'church', at: null },
      })
    }
    // A raider arriving later sees the new character in the roster.
    const c = await join(v, s, 'C')
    expect(
      c.last<WelcomeMessage>().peers.find((p) => p.id === idOf(a))?.outfit
    ).toBe('church')
    const stored = s.storage.map.get('valley') as {
      members: Record<string, { outfit: string }>
    }
    expect(stored.members[idOf(a)].outfit).toBe('church')
  })

  it('refuses an unknown character and a flood of changes', async () => {
    const { valley: v, state: s } = await valley()
    const a = await join(v, s, 'A')
    await v.webSocketMessage(
      ws(a),
      JSON.stringify({ type: 'appearance', outfit: 'tuxedo' })
    )
    expect(a.last<NackMessage>()).toMatchObject({
      re: 'appearance',
      reason: 'unknown-outfit',
    })
    const b = await join(v, s, 'B')
    const before = b.sent.length
    for (let i = 0; i < 8; i++) {
      await v.webSocketMessage(
        ws(b),
        JSON.stringify({ type: 'appearance', outfit: 'church' })
      )
    }
    expect(b.sent.length - before).toBe(5 + 3)
    expect(b.last<NackMessage>()).toMatchObject({
      re: 'appearance',
      reason: 'too-fast',
    })
  })

  it("renames a raider to the account's new username, read from the database", async () => {
    // The accounts table as D1 would answer a lookup by account id.
    const usernames: Record<string, string | null> = {
      'acct-A': 'NewName',
      'acct-B': null,
    }
    const db = {
      prepare: () => ({
        bind: (accountId: string) => ({
          first: () =>
            Promise.resolve(
              accountId in usernames
                ? {
                    account_id: accountId,
                    username: usernames[accountId],
                    role: 'user',
                    primary_provider: 'dev:x',
                    created_at: 0,
                    last_login_at: 0,
                  }
                : null
            ),
        }),
      }),
    } as unknown as D1Database
    const { valley: v, state: s } = await valley(new MockState(), { DB: db })
    const a = await join(v, s, 'A')
    const b = await join(v, s, 'B')
    await v.webSocketMessage(ws(a), JSON.stringify({ type: 'rename' }))
    for (const socket of [a, b]) {
      expect(socket.last<PeerUpdatedMessage>().peer).toMatchObject({
        id: idOf(a),
        name: 'NewName',
      })
    }
    // The new name sticks: chat goes out under it.
    await v.webSocketMessage(ws(a), chat('hello'))
    expect(b.last<PeerChatMessage>().name).toBe('NewName')
    // An account with no username has nothing to show.
    await v.webSocketMessage(ws(b), JSON.stringify({ type: 'rename' }))
    expect(b.last<NackMessage>()).toMatchObject({
      re: 'rename',
      reason: 'no-username',
    })
  })

  it("keeps the account's pack: the welcome, a berry, a pickup, a use", async () => {
    const { valley: v, state: s } = await valley()
    const a = await join(v, s, 'A')
    // A second socket on the same account shares the pack.
    const a2 = await join(v, s, 'A2', { account: 'acct-A' })
    const b = await join(v, s, 'B')
    expect(a.frames()[0]).toMatchObject({
      type: 'welcome',
      pack: STARTING_INVENTORY,
    })
    await v.webSocketMessage(ws(a), '{"type":"collect"}')
    expect(lastPack(a)?.berries).toBe(1)
    expect(lastPack(a2)?.berries).toBe(1)
    expect(lastPack(b)).toBeUndefined()
    // Pickup 0 is two joints.
    await v.webSocketMessage(ws(a), '{"type":"take","index":0}')
    expect(lastPack(a)?.joints).toBe(STARTING_INVENTORY.joints + 2)
    await v.webSocketMessage(ws(a2), '{"type":"use","kind":"berries"}')
    expect(lastPack(a)?.berries).toBe(0)
    // Nothing left to use: refused, and the pack put right.
    await v.webSocketMessage(ws(a2), '{"type":"use","kind":"berries"}')
    expect(a2.frames().at(-2)).toEqual({
      type: 'nack',
      re: 'use',
      reason: 'none-left',
    })
    expect(lastPack(a2)?.berries).toBe(0)
    // The pack outlives the socket: a new one opens on it.
    await v.webSocketClose(ws(a))
    await v.webSocketClose(ws(a2))
    const back = await join(v, s, 'A', { account: 'acct-A' })
    expect(back.frames()[0]).toMatchObject({
      type: 'welcome',
      pack: { joints: STARTING_INVENTORY.joints + 2, berries: 0 },
    })
  })

  it('closes a hello whose pack cannot be read', async () => {
    const { valley: v, state: s } = await valley()
    v.packStore = {
      open: () => Promise.reject(new Error('D1 is down')),
      get: () => Promise.reject(new Error('D1 is down')),
      change: () => Promise.reject(new Error('D1 is down')),
      spend: () => Promise.reject(new Error('D1 is down')),
    }
    const errors: unknown[] = []
    const error = console.error
    console.error = (...args: unknown[]) => errors.push(args)
    try {
      const a = await join(v, s, 'A')
      expect(a.closeCode).toBe(CLOSE.serverError)
      expect(errors).toHaveLength(1)
    } finally {
      console.error = error
    }
  })

  it("pays for a sale out of the account's wallet, and refuses one it cannot", async () => {
    const { valley: v, state: s } = await valley()
    const a = await join(v, s, 'A')
    const b = await join(v, s, 'B')
    expect(a.frames()[0]).toMatchObject({
      type: 'welcome',
      cash: STARTING_CASH,
    })
    const price = getItem('pbr').price ?? 0
    await v.webSocketMessage(
      ws(a),
      '{"type":"buy","station":0,"kind":"pbr","unit":0}'
    )
    expect(b.last<RaidMessage>()).toMatchObject({ reason: 'bought' })
    expect(a.last<PackMessage>()).toMatchObject({
      type: 'pack',
      cash: STARTING_CASH - price,
    })
    expect(lastPack(a)?.pbr).toBe(1)
    // The wallet is the account's: spent down, it stays spent.
    v.packStore = new MemoryPackStore()
    await v.packStore.open('acct-A')
    await v.packStore.spend('acct-A', STARTING_CASH - price + 1)
    const before = b.frames().length
    await v.webSocketMessage(
      ws(a),
      '{"type":"buy","station":0,"kind":"pbr","unit":1}'
    )
    expect(a.last<NackMessage>()).toEqual({
      type: 'nack',
      re: 'buy',
      reason: 'short',
      station: 0,
      item: 'pbr',
    })
    // Nobody heard of a sale, and the unit is still on the shelf.
    expect(b.frames()).toHaveLength(before)
    const stored = s.storage.map.get('valley') as {
      raid: { shelves: Record<string, number>[] }
    }
    expect(stored.raid.shelves[0].pbr).toEqual([false, true, true])
  })
})
