import { describe, expect, it, onTestFinished, vi } from 'vitest'
import { heartPoint, theMaze } from '../../src/caretaker.ts'
import { CONFIG } from '../../src/config.ts'
import { dayKey } from '../../src/daily.ts'
import { DAILY_TASK, NO_TASK } from '../../src/dailytask.ts'
import { DIME_CENTS } from '../../src/drops.ts'
import { STARTING_INVENTORY } from '../../src/inventory.ts'
import { getItem } from '../../src/items.ts'
import { XP, xpToReach } from '../../src/progression.ts'
import { CLOSE, PROTOCOL_VERSION } from '../../src/protocol.ts'
import { SEASON } from '../../src/season.ts'
import { standXp } from '../../src/stand.ts'
import { dryMap } from '../../src/waterside.ts'
import { MemoryAccountStore } from '../../worker/accounts.ts'
import { MemoryPackStore, STARTING_CASH } from '../../worker/packs.ts'
import { ValleyDO } from '../../worker/ValleyDO.ts'
import type {
  BookMessage,
  DailyMessage,
  NackMessage,
  PackMessage,
  PeerChatMessage,
  PeerJoinedMessage,
  PeerLeftMessage,
  PeerStateMessage,
  PeerUpdatedMessage,
  SeasonMessage,
  ServerMessage,
  ShadowmenMessage,
  StandMessage,
  TaskMessage,
  WelcomeMessage,
  WorldMessage,
  XpMessage,
} from '../../src/protocol.ts'
import type { AccountStore } from '../../worker/accounts.ts'
import type { PackStore } from '../../worker/packs.ts'

// Mocks for the slice of the Workers runtime the object touches.

class MockSocket {
  attachment: unknown = null
  // How many times the valley read the attachment off the socket.
  deserialized = 0
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
    this.deserialized++
    return this.attachment
  }
  frames(): ServerMessage[] {
    return this.sent.map((text) => JSON.parse(text) as ServerMessage)
  }
  last<T extends ServerMessage>(): T {
    return this.frames().at(-1) as T
  }
  // Every world frame's reason, in order.
  reasons(): string[] {
    return this.frames()
      .filter((m): m is WorldMessage => m.type === 'world')
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

// The valley with its accounts and packs in memory instead of D1.
class TestValley extends ValleyDO {
  accountStore = new MemoryAccountStore()
  packStore: PackStore = new MemoryPackStore()
  // The shadowmen's clock, stepped by hand: ticking says whether the
  // valley has it running.
  ticking = false
  protected override accounts(): AccountStore {
    return this.accountStore
  }
  protected override packs(): PackStore {
    return this.packStore
  }
  protected override startTicker(): unknown {
    this.ticking = true
    return 1
  }
  protected override stopTicker(): void {
    this.ticking = false
  }
  tick(): void {
    this.tickShadows()
  }
  // A strike's fall, as the step would make it, for a socket on `account`.
  fallFor(
    account: string,
    id: string,
    at: { x: number; z: number; yaw: number } | null
  ): Promise<void> {
    return this.fall(account, id, at)
  }
}

// Lets the writes a step started (a strike, its fall, a mend) land.
const settle = () => new Promise((resolve) => setTimeout(resolve, 0))

// Steps the shadowmen by hand until `socket` hears it was struck, through
// the windup; the strike and its fall written after.
async function tickUntilStruck(v: TestValley, socket: MockSocket) {
  for (let i = 0; i < 30; i++) {
    v.tick()
    await settle()
    if (socket.frames().some((m) => m.type === 'struck')) return
  }
}

async function valley(state = new MockState(), env: Partial<Env> = {}) {
  const v = new TestValley(asState(state), env as Env)
  // Let the constructor's storage read settle.
  await Promise.resolve()
  return { valley: v, state }
}

// Where a build puts its corn maze: far from where the specs stand, so
// the Caretaker keeps to itself unless a test goes looking for it.
const MAZE = { x: 5000, z: 5000, yaw: 0 }

// Where a build sets up the Cabbage Stand: on the first station's lot.
const STAND = { x: -4, z: -17 }

// What a build placed: two joints first, then `n - 1` cabbages.
// What a build placed: two joints first, then `n - 1` cabbages, all at
// the origin, where the first station and every bush stand too.
const placed = (n: number) => [
  { kind: 'joints', count: 2, x: 0, z: 0 },
  ...Array.from({ length: n - 1 }, () => ({
    kind: 'cabbage',
    count: 1,
    x: 0,
    z: 0,
  })),
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
    havens: Array.from({ length: stations }, (_, i) => ({ x: i * 1000, z: 0 })),
    metres: { width: 15059, height: 15038 },
    water: dryMap({ width: 15059, height: 15038 }),
    maze: MAZE,
    truck: { home: { x: 10, z: 10 }, joyrideMs: 600_000 },
    stand: STAND,
    bushes: Array.from({ length: 7 }, () => ({ x: 0, z: 0 })),
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

const state = (x: number, z: number, light = false) =>
  JSON.stringify({
    type: 'state',
    x,
    y: 0,
    z,
    yaw: 0.5,
    pitch: 0,
    pose: 'walk',
    riding: false,
    light,
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
    // An NPC's outfit is not on the roster.
    const marx = await join(v, s, 'Dave', { outfit: 'marx' })
    expect(marx.closeCode).toBe(CLOSE.badOutfit)
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

  it('welcomes a player with the roster and the world, and tells the others', async () => {
    const { valley: v, state: s } = await valley()
    const a = await join(v, s, '  Dave  Coleman ')
    const welcomeA = a.last<WelcomeMessage>()
    expect(welcomeA.type).toBe('welcome')
    expect(welcomeA.peers).toEqual([])
    expect(typeof welcomeA.serverNow).toBe('number')
    expect(welcomeA.place).toBeNull()
    expect(welcomeA.world.members).toEqual([
      { id: welcomeA.id, name: 'Dave Coleman' },
    ])
    expect(welcomeA.world.truck.leg).toMatchObject({
      kind: 'parked',
      leavesAt: null,
    })
    // Woken when Marx is done reading.
    expect(s.storage.alarm).toBe(
      welcomeA.world.truck.leg.at + CONFIG.truck.readSeconds * 1000
    )

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
    expect(welcomeB.world.members.map((m) => m.name)).toEqual([
      'Dave Coleman',
      'Kvistad',
    ])
    const [joined, world] = a.frames().slice(-2) as [
      PeerJoinedMessage,
      WorldMessage,
    ]
    expect(joined.type).toBe('peer-joined')
    expect(joined.peer).toMatchObject({
      id: welcomeB.id,
      name: 'Kvistad',
      at: null,
    })
    expect(world).toMatchObject({
      type: 'world',
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
    await v.webSocketMessage(ws(a), state(7, 8, true))
    expect(a.sent.length).toBe(beforeA)
    const fanned = b.last<PeerStateMessage>()
    expect(fanned).toMatchObject({
      type: 'peer-state',
      x: 7,
      z: 8,
      yaw: 0.5,
      light: true,
    })
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

  it('runs the truck: the bed, the countdown, the joyride, and pickups', async () => {
    vi.useFakeTimers({ toFake: ['Date'], now: Date.now() })
    onTestFinished(() => {
      vi.useRealTimers()
    })
    const { valley: v, state: s } = await valley()
    const a = await join(v, s, 'A')
    const b = await join(v, s, 'B')
    // Both heard at the Citgo: the bed is there, and so is pickup 4.
    await v.webSocketMessage(ws(a), state(10, 10))
    await v.webSocketMessage(ws(b), state(0, 0))
    await v.webSocketMessage(ws(a), '{"type":"board"}')
    const boarded = a.last<WorldMessage>()
    expect(boarded).toMatchObject({ reason: 'boarded', by: idOf(a) })
    expect(b.last<WorldMessage>().reason).toBe('boarded')
    // Woken when the countdown runs out.
    const leg = boarded.world?.truck.leg
    if (leg?.kind !== 'parked' || leg.leavesAt === null) {
      throw new Error('no countdown')
    }
    expect(s.storage.alarm).toBe(leg.leavesAt)
    // The alarm before its time changes nothing; at its time he leaves.
    const before = a.sent.length
    await v.alarm()
    expect(a.sent.length).toBe(before)
    vi.setSystemTime(leg.leavesAt)
    await v.alarm()
    const depart = a.last<WorldMessage>()
    expect(depart.reason).toBe('depart')
    expect(depart.world?.truck.riders).toEqual([idOf(a)])
    // B takes a pickup; A is told; B's second try is refused.
    await v.webSocketMessage(ws(b), '{"type":"take","index":4}')
    expect(a.last<WorldMessage>()).toMatchObject({
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
    // A goes over the side; B is told.
    await v.webSocketMessage(ws(a), '{"type":"hop-out"}')
    expect(b.last<WorldMessage>()).toMatchObject({
      reason: 'hopped-out',
      by: idOf(a),
    })
    // The world is persisted.
    const stored = s.storage.map.get('valley') as { world: { taken: number[] } }
    expect(stored.world.taken).toEqual([4])
  })

  it('sells a shelf unit once, to the first to ask', async () => {
    const { valley: v, state: s } = await valley()
    const a = await join(v, s, 'A')
    const b = await join(v, s, 'B')
    expect(a.last<WelcomeMessage>().world.shelves).toHaveLength(5)
    const perItem = a.last<WelcomeMessage>().world.shelves[0].pbr.length
    // Both on station 0's lot.
    await v.webSocketMessage(ws(a), state(0, 0))
    await v.webSocketMessage(ws(b), state(0, 0))
    for (let unit = 0; unit < perItem; unit++) {
      await v.webSocketMessage(
        ws(a),
        JSON.stringify({ type: 'buy', station: 0, kind: 'pbr', unit })
      )
    }
    const bought = b.last<WorldMessage>()
    expect(bought).toMatchObject({
      reason: 'bought',
      by: idOf(a),
      station: 0,
      item: 'pbr',
    })
    expect(bought.world?.shelves[0].pbr).toEqual(Array(perItem).fill(false))
    expect(bought.world?.shelves[1].pbr).toEqual(Array(perItem).fill(true))
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
    expect(welcome.daily.collected).toEqual([])
    expect(welcome.daily.resetsAt).toBeGreaterThan(before)
    await v.webSocketMessage(ws(a), state(0, 0))
    await v.webSocketMessage(ws(a), '{"type":"collect","bush":0}')
    const picked = lastDaily(a)
    expect(picked).toMatchObject({
      type: 'daily',
      bush: 0,
      picked: true,
      daily: { collected: [0] },
    })
    expect(picked.daily.resetsAt).toBe(welcome.daily.resetsAt)
    await v.webSocketMessage(ws(a), '{"type":"collect","bush":0}')
    expect(lastDaily(a)).toMatchObject({
      type: 'daily',
      picked: false,
    })
    // The berry earned XP once (rule 22).
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(a.frames().filter((m) => m.type === 'xp')).toEqual([
      { type: 'xp', xp: XP.berry, gained: XP.berry },
    ])
    // The same account on another socket already had today's.
    const twin = await join(v, s, 'Dave')
    expect(twin.last<WelcomeMessage>().daily.collected).toEqual([0])
    await v.webSocketMessage(ws(twin), state(0, 0))
    await v.webSocketMessage(ws(twin), '{"type":"collect","bush":0}')
    expect(lastDaily(twin).picked).toBe(false)
    // A maze bush has a berry of its own.
    await v.webSocketMessage(ws(twin), '{"type":"collect","bush":4}')
    expect(lastDaily(twin)).toMatchObject({
      bush: 4,
      picked: true,
      daily: { collected: [0, 4] },
    })
    // Another account has its own, even under a name that looks the same.
    const b = await join(v, s, 'Dave', { account: 'acct-other' })
    expect(b.last<WelcomeMessage>().daily.collected).toEqual([])
    // Nobody else heard a thing.
    expect(b.frames().some((m) => m.type === 'daily')).toBe(false)
    // The record is persisted with the valley.
    const stored = s.storage.map.get('valley') as {
      dailies: Record<string, string>
    }
    expect(Object.keys(stored.dailies)).toEqual(['acct-Dave', 'acct-Dave/4'])
  })

  it('wakes a valley stored before the bush existed', async () => {
    const shared = new MockState()
    // An older build's valley: a raid, and no bushes.
    shared.storage.map.set('valley', { epoch: 3, raid: null, members: {} })
    const { valley: v } = await valley(shared)
    const a = await join(v, shared, 'Dave')
    expect(a.last<WelcomeMessage>().daily.collected).toEqual([])
    await v.webSocketMessage(ws(a), state(0, 0))
    await v.webSocketMessage(ws(a), '{"type":"collect","bush":0}')
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
    const hurried = dev.last<WorldMessage>()
    expect(hurried.reason).toBe('hurry')
    // Marx's reading now ends a second after the hurry.
    const leg = hurried.world?.truck.leg
    expect(s.storage.alarm).toBe(
      (leg?.at ?? 0) + CONFIG.truck.readSeconds * 1000
    )
  })

  it('lets go of a socket silent too long, so a vanished tab leaves no ghost', async () => {
    vi.useFakeTimers({ toFake: ['Date'], now: Date.now() })
    onTestFinished(() => {
      vi.useRealTimers()
    })
    const { valley: v, state: s } = await valley()
    const a = await join(v, s, 'A')
    const b = await join(v, s, 'B')
    const idA = idOf(a)
    v.tick()
    // B keeps pinging; A has gone quiet.
    vi.advanceTimersByTime(CONFIG.net.silentMs - 1000)
    await v.webSocketMessage(ws(b), JSON.stringify({ type: 'ping', t: 1 }))
    v.tick()
    expect(a.closeCode).toBeNull()
    vi.advanceTimersByTime(2000)
    await v.webSocketMessage(ws(b), JSON.stringify({ type: 'ping', t: 2 }))
    const before = b.sent.length
    v.tick()
    await new Promise((resolve) => setTimeout(resolve, 0))
    // Not a refusal: a client that was only asleep reconnects.
    expect(a.closeCode).toBe(1001)
    expect(b.closeCode).toBeNull()
    expect(
      b
        .frames()
        .slice(before)
        .find((m) => m.type === 'peer-left')
    ).toEqual({ type: 'peer-left', id: idA })
  })

  it('retires the socket a reconnect names, so no one sees a ghost', async () => {
    const { valley: v, state: s } = await valley()
    const a = await join(v, s, 'A')
    const twin = await join(v, s, 'A2', { account: 'acct-A' })
    const b = await join(v, s, 'B')
    const was = idOf(a)
    // The line dropped; the valley has not heard the old socket close.
    const back = stamped('A', { account: 'acct-A' })
    s.acceptWebSocket(back)
    const before = b.sent.length
    const frame = JSON.parse(hello()) as object
    await v.webSocketMessage(ws(back), JSON.stringify({ ...frame, was }))
    expect(a.closeCode).toBe(CLOSE.replaced)
    expect(
      b
        .frames()
        .slice(before)
        .find((m) => m.type === 'peer-left')
    ).toEqual({ type: 'peer-left', id: was })
    // The welcome shows the raider everyone else, and not their old self.
    const roster = back.frames()[0] as WelcomeMessage
    expect(roster.peers.map((p) => p.id).sort()).toEqual(
      [idOf(twin), idOf(b)].sort()
    )
    // Another account cannot retire someone else's socket.
    const c = await join(v, s, 'C')
    const other = stamped('D', { account: 'acct-D' })
    s.acceptWebSocket(other)
    await v.webSocketMessage(
      ws(other),
      JSON.stringify({ ...frame, was: idOf(c) })
    )
    expect(c.closeCode).toBeNull()
  })

  it('announces a departure once, and keeps the world when the last one goes', async () => {
    const { valley: v, state: s } = await valley()
    const a = await join(v, s, 'A')
    const b = await join(v, s, 'B')
    await v.webSocketMessage(ws(b), state(0, 0))
    await v.webSocketMessage(ws(b), '{"type":"take","index":3}')
    const before = a.sent.length
    const idB = idOf(b)
    await v.webSocketError(ws(b))
    await v.webSocketClose(ws(b))
    const frames = a.frames().slice(before)
    expect(frames.map((m) => m.type)).toEqual(['peer-left', 'world'])
    expect((frames[0] as PeerLeftMessage).id).toBe(idB)
    expect((frames[1] as WorldMessage).reason).toBe('left')
    // The last one out leaves the world as it was, and nothing to wake for.
    await v.webSocketClose(ws(a))
    const stored = s.storage.map.get('valley') as {
      world: { taken: number[] }
      members: object
    }
    expect(stored.world.taken).toEqual([3])
    expect(stored.members).toEqual({})
    expect(s.storage.alarm).toBeNull()
  })

  it('brings a raider back where they last stood on foot', async () => {
    const { valley: v, state: s } = await valley()
    const a = await join(v, s, 'A')
    await v.webSocketMessage(ws(a), state(321, -45))
    await v.webSocketClose(ws(a))
    const again = await join(v, s, 'A')
    expect(again.last<WelcomeMessage>().place).toEqual({
      x: 321,
      z: -45,
      yaw: 0.5,
    })
    // Another account starts at the Citgo.
    const b = await join(v, s, 'B')
    expect(b.last<WelcomeMessage>().place).toBeNull()
  })

  it('wakes with the world from storage and the roster from attachments', async () => {
    const shared = new MockState()
    const first = (await valley(shared)).valley
    const a = await join(first, shared, 'A')
    await first.webSocketMessage(ws(a), state(0, 0))
    await first.webSocketMessage(ws(a), '{"type":"take","index":0}')
    // Hibernation: a new object over the same storage and sockets.
    const woken = (await valley(shared)).valley
    const b = await join(woken, shared, 'B')
    const welcome = b.last<WelcomeMessage>()
    expect(welcome.peers.map((p) => p.name)).toEqual(['A'])
    expect(welcome.world.taken).toEqual([0])
    expect(welcome.world.members.map((m) => m.name)).toEqual(['A', 'B'])
    expect(a.last<WorldMessage>()).toMatchObject({
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
        peer: {
          id: idOf(a),
          name: 'A',
          outfit: 'church',
          cosmetics: [],
          level: 1,
          at: null,
        },
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
    // A shadowman is an outfit, but not a raider's.
    await v.webSocketMessage(
      ws(a),
      JSON.stringify({ type: 'appearance', outfit: 'shadow' })
    )
    expect(a.last<NackMessage>()).toMatchObject({ reason: 'unknown-outfit' })
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

  // Accounts in the store under the names their sockets join with.
  async function named(v: TestValley, ...names: string[]) {
    for (const name of names) {
      const id = `acct-${name}`
      await v.accountStore.create(
        {
          accountId: id,
          username: name,
          role: 'user',
          primaryProvider: `dev:${id}`,
          createdAt: 0,
          lastLoginAt: 0,
        },
        {
          providerKey: `dev:${id}`,
          accountId: id,
          provider: 'dev',
          providerId: id,
          displayName: id,
          avatarUrl: null,
          linkedAt: 0,
        }
      )
    }
  }

  const ofType = <T extends ServerMessage['type']>(
    socket: MockSocket,
    type: T
  ) =>
    socket
      .frames()
      .filter((m): m is Extract<ServerMessage, { type: T }> => m.type === type)

  it('whispers to one raider by name, echoing it to the sender alone', async () => {
    const { valley: v, state: s } = await valley()
    const a = await join(v, s, 'Able')
    const b = await join(v, s, 'Baker')
    const c = await join(v, s, 'Charlie')
    await v.webSocketMessage(
      ws(a),
      JSON.stringify({ type: 'whisper', to: 'baker', text: 'at the maze' })
    )
    expect(ofType(b, 'whisper')).toEqual([
      expect.objectContaining({
        from: 'Able',
        to: 'Baker',
        text: 'at the maze',
        outgoing: false,
      }),
    ])
    expect(ofType(a, 'whisper')).toEqual([
      expect.objectContaining({ from: 'Able', to: 'Baker', outgoing: true }),
    ])
    expect(ofType(c, 'whisper')).toEqual([])
    // Nobody by that name here, and no whispering to yourself.
    for (const [to, reason] of [
      ['Nobody', 'not-here'],
      ['ABLE', 'self'],
    ]) {
      await v.webSocketMessage(
        ws(a),
        JSON.stringify({ type: 'whisper', to, text: 'hi' })
      )
      expect(a.last()).toEqual({ type: 'nack', re: 'whisper', reason })
    }
    // The chat's rate covers whispers too.
    for (let i = 0; i < 3; i++) {
      await v.webSocketMessage(
        ws(a),
        JSON.stringify({ type: 'whisper', to: 'Baker', text: 'hi' })
      )
    }
    expect(a.last()).toEqual({
      type: 'nack',
      re: 'whisper',
      reason: 'too-fast',
    })
  })

  it('asks, accepts, lists and unfriends by username, and says when a friend comes in', async () => {
    const { valley: v, state: s } = await valley()
    await named(v, 'Able', 'Baker')
    const a = await join(v, s, 'Able')
    const b = await join(v, s, 'Baker')
    // Nothing on either list yet, so no hello brought one.
    expect(ofType(a, 'friends')).toEqual([])
    const ask = (socket: MockSocket, type: string, name: string) =>
      v.webSocketMessage(ws(socket), JSON.stringify({ type, name }))
    await ask(a, 'friend', 'baker')
    expect(ofType(b, 'friend-news')).toEqual([
      { type: 'friend-news', news: 'asked', name: 'Able' },
    ])
    expect(ofType(a, 'friends').at(-1)?.friends).toEqual([
      { name: 'Baker', state: 'asked', online: false, where: null },
    ])
    expect(ofType(b, 'friends').at(-1)?.friends).toEqual([
      { name: 'Able', state: 'asking', online: false, where: null },
    ])
    await ask(a, 'friend', 'Baker')
    expect(a.last()).toEqual({
      type: 'nack',
      re: 'friend',
      reason: 'already-asked',
    })
    await ask(a, 'friend', 'Nobody')
    expect(a.last()).toEqual({ type: 'nack', re: 'friend', reason: 'unknown' })
    // Baker asks back: friends, and each sees the other in the valley.
    await ask(b, 'friend', 'Able')
    expect(ofType(a, 'friend-news').at(-1)).toEqual({
      type: 'friend-news',
      news: 'accepted',
      name: 'Baker',
    })
    expect(ofType(a, 'friends').at(-1)?.friends).toEqual([
      { name: 'Baker', state: 'friend', online: true, where: null },
    ])
    // Roughly where, from Baker's last state frame, on asking.
    await v.webSocketMessage(ws(b), state(900, 900))
    await v.webSocketMessage(ws(a), JSON.stringify({ type: 'friends' }))
    expect(ofType(a, 'friends').at(-1)?.friends).toEqual([
      { name: 'Baker', state: 'friend', online: true, where: 'valley' },
    ])
    // Baker goes and comes back: Able hears it, once.
    await v.webSocketClose(ws(b))
    await v.webSocketMessage(ws(a), JSON.stringify({ type: 'friends' }))
    expect(ofType(a, 'friends').at(-1)?.friends).toEqual([
      { name: 'Baker', state: 'friend', online: false, where: null },
    ])
    const back = await join(v, s, 'Baker')
    expect(ofType(a, 'friend-news').at(-1)).toEqual({
      type: 'friend-news',
      news: 'online',
      name: 'Baker',
    })
    // A second socket on the same account is no news.
    const before = ofType(a, 'friend-news').length
    await join(v, s, 'Baker')
    expect(ofType(a, 'friend-news')).toHaveLength(before)
    // Able ends it; there is nothing left to end.
    await ask(a, 'unfriend', 'Baker')
    expect(ofType(back, 'friends').at(-1)?.friends).toEqual([])
    await ask(a, 'unfriend', 'Baker')
    expect(a.last()).toEqual({
      type: 'nack',
      re: 'unfriend',
      reason: 'not-friends',
    })
  })

  it('refuses a friends change it cannot write, and too many at once', async () => {
    const { valley: v, state: s } = await valley()
    await named(v, 'Able', 'Baker')
    const a = await join(v, s, 'Able')
    const store = v.accountStore
    const error = console.error
    console.error = () => {}
    onTestFinished(() => {
      console.error = error
    })
    store.askFriend = () => Promise.reject(new Error('D1 is down'))
    await v.webSocketMessage(
      ws(a),
      JSON.stringify({ type: 'friend', name: 'Baker' })
    )
    expect(a.last()).toEqual({ type: 'nack', re: 'friend', reason: 'server' })
    for (let i = 0; i < 5; i++) {
      await v.webSocketMessage(
        ws(a),
        JSON.stringify({ type: 'friend', name: 'Baker' })
      )
    }
    expect(a.last()).toEqual({ type: 'nack', re: 'friend', reason: 'too-fast' })
  })

  it("renames a raider to the account's new username, read from the database", async () => {
    const { valley: v, state: s } = await valley()
    for (const [id, username] of [
      ['acct-A', 'NewName'],
      ['acct-B', null],
    ] as const) {
      await v.accountStore.create(
        {
          accountId: id,
          username,
          role: 'user',
          primaryProvider: `dev:${id}`,
          createdAt: 0,
          lastLoginAt: 0,
        },
        {
          providerKey: `dev:${id}`,
          accountId: id,
          provider: 'dev',
          providerId: id,
          displayName: id,
          avatarUrl: null,
          linkedAt: 0,
        }
      )
    }
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
    await v.webSocketMessage(ws(a), state(0, 0))
    await v.webSocketMessage(ws(a), '{"type":"collect","bush":0}')
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
      purchase: () => Promise.reject(new Error('D1 is down')),
      earn: () => Promise.reject(new Error('D1 is down')),
      trade: () => Promise.reject(new Error('D1 is down')),
      season: () => Promise.reject(new Error('D1 is down')),
      strip: () => Promise.reject(new Error('D1 is down')),
      give: () => Promise.reject(new Error('D1 is down')),
      stow: () => Promise.reject(new Error('D1 is down')),
      stand: () => Promise.reject(new Error('D1 is down')),
      tend: () => Promise.reject(new Error('D1 is down')),
      score: () => Promise.reject(new Error('D1 is down')),
      book: () => Promise.reject(new Error('D1 is down')),
      discover: () => Promise.reject(new Error('D1 is down')),
      task: () => Promise.reject(new Error('D1 is down')),
      scoreTask: () => Promise.reject(new Error('D1 is down')),
      xp: () => Promise.reject(new Error('D1 is down')),
      gainXp: () => Promise.reject(new Error('D1 is down')),
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
    await v.webSocketMessage(ws(a), state(0, 0))
    await v.webSocketMessage(
      ws(a),
      '{"type":"buy","station":0,"kind":"pbr","unit":0}'
    )
    expect(b.last<WorldMessage>()).toMatchObject({ reason: 'bought' })
    expect(a.last<PackMessage>()).toMatchObject({
      type: 'pack',
      cash: STARTING_CASH - price,
    })
    expect(lastPack(a)?.pbr).toBe(1)
    // The wallet is the account's: spent down, it stays spent.
    v.packStore = new MemoryPackStore()
    await v.packStore.open('acct-A')
    await v.packStore.purchase('acct-A', STARTING_CASH - price + 1, null)
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
      world: { shelves: Record<string, number>[] }
    }
    expect(stored.world.shelves[0].pbr).toEqual([false, true, true])
  })

  it('sells nothing when the wallet cannot be read or the sale cannot be written', async () => {
    const { valley: v, state: s } = await valley()
    const a = await join(v, s, 'A')
    const b = await join(v, s, 'B')
    await v.webSocketMessage(ws(a), state(0, 0))
    const store = v.packStore
    const errors: unknown[] = []
    const error = console.error
    console.error = (...args: unknown[]) => errors.push(args)
    const buy = () =>
      v.webSocketMessage(
        ws(a),
        '{"type":"buy","station":0,"kind":"pbr","unit":0}'
      )
    try {
      const before = b.frames().length
      v.packStore = { ...store, get: () => Promise.reject(new Error('down')) }
      await buy()
      expect(a.last<NackMessage>()).toMatchObject({ reason: 'unavailable' })
      v.packStore = {
        open: (id) => store.open(id),
        get: (id) => store.get(id),
        change: (id, kind, delta) => store.change(id, kind, delta),
        purchase: () => Promise.reject(new Error('down')),
        earn: (id, amount) => store.earn(id, amount),
        trade: (id, price, cosmetic) => store.trade(id, price, cosmetic),
        season: (id, season) => store.season(id, season),
        book: (id) => store.book(id),
        discover: (id, entries, now) => store.discover(id, entries, now),
        strip: (id) => store.strip(id),
        give: (id, items) => store.give(id, items),
        stow: (id, kind, delta) => store.stow(id, kind, delta),
        stand: (id) => store.stand(id),
        tend: (id, rev, change) => store.tend(id, rev, change),
        score: (id, season, progress, reward) =>
          store.score(id, season, progress, reward),
        task: (id, task) => store.task(id, task),
        scoreTask: (id, task, progress, reward) =>
          store.scoreTask(id, task, progress, reward),
        xp: (id) => store.xp(id),
        gainXp: (id, amount) => store.gainXp(id, amount),
      }
      await buy()
      expect(a.last<NackMessage>()).toMatchObject({ reason: 'unavailable' })
      expect(errors).toHaveLength(2)
      // Nobody heard of a sale, the unit is still on the shelf, and the
      // wallet is whole.
      expect(b.frames()).toHaveLength(before)
      const stored = s.storage.map.get('valley') as {
        world: { shelves: Record<string, boolean[]>[] }
      }
      expect(stored.world.shelves[0].pbr).toEqual([true, true, true])
      expect((await store.get('acct-A')).cash).toBe(STARTING_CASH)
    } finally {
      console.error = error
    }
  })
})

describe('ValleyDO: drops', () => {
  const drop = (kind: string, count = 1) =>
    JSON.stringify({ type: 'drop', kind, count })
  const worldFrames = (socket: MockSocket) =>
    socket.frames().filter((m): m is WorldMessage => m.type === 'world')

  it('sets an item down out of the pack, and anyone can take it up', async () => {
    const { valley: v, state: s } = await valley()
    const a = await join(v, s, 'A')
    const b = await join(v, s, 'B')
    await v.webSocketMessage(ws(a), state(40, 60))
    await v.webSocketMessage(ws(a), drop('joints'))
    expect(lastPack(a)?.joints).toBe(STARTING_INVENTORY.joints - 1)
    const dropped = worldFrames(b).at(-1)
    expect(dropped).toMatchObject({
      reason: 'dropped',
      by: idOf(a),
      item: 'joints',
      drop: 0,
      count: 1,
    })
    const [lying] = dropped?.world?.drops ?? []
    // Where A's own state frame put them, not anywhere the frame said.
    expect(Math.hypot(lying.x - 40, lying.z - 60)).toBeLessThan(2)
    await v.webSocketMessage(ws(b), state(40, 60))
    await v.webSocketMessage(ws(b), '{"type":"take-drop","drop":0}')
    expect(lastPack(b)?.joints).toBe(STARTING_INVENTORY.joints + 1)
    expect(worldFrames(a).at(-1)).toMatchObject({
      reason: 'drop-taken',
      by: idOf(b),
      world: { drops: [] },
    })
  })

  it('sets down nothing the pack does not hold, or with no place to put it', async () => {
    const { valley: v, state: s } = await valley()
    const a = await join(v, s, 'A')
    const b = await join(v, s, 'B')
    await v.webSocketMessage(ws(a), drop('joints'))
    expect(a.frames().at(-2)).toEqual({
      type: 'nack',
      re: 'drop',
      reason: 'no-position',
    })
    // Every refusal sends the pack, to put the client's guess right.
    expect(lastPack(a)?.joints).toBe(STARTING_INVENTORY.joints)
    await v.webSocketMessage(ws(a), state(40, 60))
    const before = b.frames().length
    await v.webSocketMessage(
      ws(a),
      drop('joints', STARTING_INVENTORY.joints + 1)
    )
    expect(a.frames().at(-2)).toEqual({
      type: 'nack',
      re: 'drop',
      reason: 'none-left',
    })
    // The pack, as it is, puts the guess right; nobody saw a drop.
    expect(lastPack(a)?.joints).toBe(STARTING_INVENTORY.joints)
    expect(b.frames()).toHaveLength(before)
    const stored = s.storage.map.get('valley') as {
      world: { drops: unknown[] }
    }
    expect(stored.world.drops).toEqual([])
  })

  it('sets down nothing when the pack cannot be written', async () => {
    const { valley: v, state: s } = await valley()
    const a = await join(v, s, 'A')
    await v.webSocketMessage(ws(a), state(40, 60))
    const store = v.packStore
    v.packStore = {
      open: (id) => store.open(id),
      get: (id) => store.get(id),
      purchase: (id, amount, item) => store.purchase(id, amount, item),
      trade: (id, price, cosmetic) => store.trade(id, price, cosmetic),
      season: (id, season) => store.season(id, season),
      book: (id) => store.book(id),
      discover: (id, entries, now) => store.discover(id, entries, now),
      strip: (id) => store.strip(id),
      give: (id, items) => store.give(id, items),
      stow: (id, kind, delta) => store.stow(id, kind, delta),
      stand: (id) => store.stand(id),
      tend: (id, rev, change) => store.tend(id, rev, change),
      score: (id, season, progress, reward) =>
        store.score(id, season, progress, reward),
      task: (id, task) => store.task(id, task),
      scoreTask: (id, task, progress, reward) =>
        store.scoreTask(id, task, progress, reward),
      xp: (id) => store.xp(id),
      gainXp: (id, amount) => store.gainXp(id, amount),
      change: () => Promise.reject(new Error('down')),
      earn: (id, amount) => store.earn(id, amount),
    }
    const error = console.error
    console.error = () => {}
    try {
      await v.webSocketMessage(ws(a), drop('joints'))
    } finally {
      console.error = error
    }
    expect(
      a.frames().findLast((m): m is NackMessage => m.type === 'nack')
    ).toMatchObject({ re: 'drop', reason: 'unavailable' })
    expect(
      (s.storage.map.get('valley') as { world: { drops: unknown[] } }).world
        .drops
    ).toEqual([])
  })

  it('refuses a flood of drops', async () => {
    const { valley: v, state: s } = await valley()
    const a = await join(v, s, 'A')
    await v.webSocketMessage(ws(a), state(40, 60))
    await v.packStore.change('acct-A', 'joints', 50)
    for (let i = 0; i < 21; i++) {
      await v.webSocketMessage(ws(a), drop('joints'))
    }
    expect(a.frames().at(-2)).toMatchObject({
      re: 'drop',
      reason: 'too-fast',
    })
    expect(a.last<PackMessage>().type).toBe('pack')
    const stored = s.storage.map.get('valley') as {
      world: { drops: unknown[] }
    }
    expect(stored.world.drops).toHaveLength(20)
  })
})

describe('ValleyDO: corpse runs', () => {
  const lastFrame = (socket: MockSocket) =>
    socket.frames().findLast((m): m is PackMessage => m.type === 'pack')
  const worldFrames = (socket: MockSocket) =>
    socket.frames().filter((m): m is WorldMessage => m.type === 'world')

  // A, out on foot with one point of health left, is touched by a
  // shadowman; B stands far off.
  async function struck() {
    const { valley: v, state: s } = await valley()
    const a = await join(v, s, 'A', { dev: true })
    const b = await join(v, s, 'B')
    await v.alarm()
    await v.webSocketMessage(ws(a), state(500, 500))
    await v.webSocketMessage(ws(b), state(900, 900))
    await v.webSocketMessage(ws(a), '{"type":"dev","op":"calm"}')
    await v.webSocketMessage(ws(a), '{"type":"dev","op":"health","points":1}')
    await v.webSocketMessage(
      ws(a),
      '{"type":"dev","op":"shadowman","x":500,"z":501}'
    )
    await tickUntilStruck(v, a)
    return { v, s, a, b }
  }

  it('leaves everything the pack held on a body where the raider fell', async () => {
    const { a, b } = await struck()
    expect(a.frames().some((m) => m.type === 'struck')).toBe(true)
    const pack = lastFrame(a)
    expect(Object.values(pack?.pack ?? {}).every((n) => n === 0)).toBe(true)
    expect(pack).toMatchObject({ cash: STARTING_CASH, corpses: [0] })
    const fell = worldFrames(b).at(-1)
    expect(fell).toMatchObject({ reason: 'fell', by: idOf(a), corpse: 0 })
    expect(fell?.world?.corpses).toEqual([
      { id: 0, x: 500, z: 500, yaw: 0.5, name: 'A', outfit: 'coleman' },
    ])
    // B's pack never names A's body.
    expect(lastFrame(b)?.corpses ?? []).toEqual([])
  })

  it('gives the things back to the account that fell, and no one else', async () => {
    const { v, a, b } = await struck()
    await v.webSocketMessage(ws(b), '{"type":"loot","corpse":0}')
    expect(b.last<NackMessage>()).toMatchObject({
      type: 'nack',
      re: 'loot',
      reason: 'not-yours',
    })
    await v.webSocketMessage(ws(a), '{"type":"loot","corpse":0}')
    expect(lastFrame(a)).toMatchObject({
      pack: STARTING_INVENTORY,
      corpses: [],
    })
    expect(worldFrames(b).at(-1)).toMatchObject({
      reason: 'looted',
      world: { corpses: [] },
    })
    await v.webSocketMessage(ws(a), '{"type":"loot","corpse":0}')
    expect(a.last<NackMessage>()).toMatchObject({ reason: 'gone' })
  })

  it('tells a raider coming back which bodies are theirs', async () => {
    const { v, s, a } = await struck()
    await v.webSocketClose(ws(a))
    const back = await join(v, s, 'A')
    expect(back.frames()[0]).toMatchObject({
      type: 'welcome',
      corpses: [0],
      world: { corpses: [{ id: 0 }] },
    })
  })

  it('leaves the pack as it was when no body can be laid or written', async () => {
    const { valley: v, state: s } = await valley()
    const a = await join(v, s, 'A')
    // Nowhere the valley heard them stand: the pack is given back.
    await v.fallFor('acct-A', idOf(a), null)
    // Where the bodies below are laid.
    await v.webSocketMessage(ws(a), state(1, 2))
    expect(lastFrame(a)).toMatchObject({
      pack: STARTING_INVENTORY,
      corpses: [],
    })
    const store = v.packStore
    v.packStore = {
      ...store,
      open: (id) => store.open(id),
      get: (id) => store.get(id),
      strip: () => Promise.reject(new Error('down')),
    }
    const error = console.error
    console.error = () => {}
    try {
      await v.fallFor('acct-A', idOf(a), { x: 1, z: 2, yaw: 0 })
      expect(lastFrame(a)).toMatchObject({ pack: STARTING_INVENTORY })
      // A body that cannot be looted stays lying, with its things.
      v.packStore = store
      await v.fallFor('acct-A', idOf(a), { x: 1, z: 2, yaw: 0 })
      v.packStore = {
        open: (id) => store.open(id),
        get: (id) => store.get(id),
        change: (id, kind, delta) => store.change(id, kind, delta),
        purchase: (id, amount, item) => store.purchase(id, amount, item),
        earn: (id, amount) => store.earn(id, amount),
        trade: (id, price, cosmetic) => store.trade(id, price, cosmetic),
        season: (id, season) => store.season(id, season),
        score: (id, season, progress, reward) =>
          store.score(id, season, progress, reward),
        strip: (id) => store.strip(id),
        give: () => Promise.reject(new Error('down')),
        stow: (id, kind, delta) => store.stow(id, kind, delta),
        stand: (id) => store.stand(id),
        tend: (id, rev, change) => store.tend(id, rev, change),
        book: (id) => store.book(id),
        discover: (id, entries, now) => store.discover(id, entries, now),
        task: (id, task) => store.task(id, task),
        scoreTask: (id, task, progress, reward) =>
          store.scoreTask(id, task, progress, reward),
        xp: (id) => store.xp(id),
        gainXp: (id, amount) => store.gainXp(id, amount),
      }
      await v.webSocketMessage(ws(a), '{"type":"loot","corpse":0}')
      expect(a.last<NackMessage>()).toMatchObject({ reason: 'unavailable' })
      expect(lastFrame(a)?.corpses).toEqual([0])
      // And with the store back, nothing is lost.
      v.packStore = store
      await v.webSocketMessage(ws(a), '{"type":"loot","corpse":0}')
      expect(lastFrame(a)).toMatchObject({
        pack: STARTING_INVENTORY,
        corpses: [],
      })
    } finally {
      console.error = error
    }
  })
})

describe('ValleyDO: the stash', () => {
  const move = (type: 'stow' | 'unstow', kind: string, count = 1) =>
    JSON.stringify({ type, kind, count })
  const lastFrame = (socket: MockSocket) =>
    socket.frames().findLast((m): m is PackMessage => m.type === 'pack')

  it('moves an item into the locker at a Citgo, and back', async () => {
    const { valley: v, state: s } = await valley()
    const a = await join(v, s, 'A', { dev: true })
    const other = await join(v, s, 'A2', { account: 'acct-A' })
    await v.webSocketMessage(
      ws(a),
      '{"type":"dev","op":"grant","kind":"joints","count":2}'
    )
    const held = STARTING_INVENTORY.joints + 2
    // In the back room of the second station.
    await v.webSocketMessage(ws(a), state(1000 - 17, 2))
    await v.webSocketMessage(ws(a), move('stow', 'joints', 2))
    expect(lastFrame(a)).toMatchObject({
      pack: { joints: held - 2 },
      stash: { joints: 2 },
    })
    // Every socket on the account hears it.
    expect(lastFrame(other)?.stash.joints).toBe(2)
    await v.webSocketMessage(ws(a), move('unstow', 'joints'))
    expect(lastFrame(a)).toMatchObject({
      pack: { joints: held - 1 },
      stash: { joints: 1 },
    })
    // Only what the side holds.
    await v.webSocketMessage(ws(a), move('unstow', 'joints', 5))
    expect(
      a.frames().findLast((m): m is NackMessage => m.type === 'nack')
    ).toMatchObject({ re: 'unstow', reason: 'none-left' })
    expect(lastFrame(a)?.stash.joints).toBe(1)
  })

  it('keeps the locker shut away from a Citgo, or when it cannot be written', async () => {
    const { valley: v, state: s } = await valley()
    const a = await join(v, s, 'A')
    await v.webSocketMessage(ws(a), move('stow', 'joints'))
    const nacks = () =>
      a.frames().filter((m): m is NackMessage => m.type === 'nack')
    expect(nacks().at(-1)).toMatchObject({ re: 'stow', reason: 'no-locker' })
    await v.webSocketMessage(ws(a), state(500, 500))
    await v.webSocketMessage(ws(a), move('stow', 'joints'))
    expect(nacks().at(-1)).toMatchObject({ reason: 'no-locker' })
    expect(lastFrame(a)?.pack.joints).toBe(STARTING_INVENTORY.joints)
    await v.webSocketMessage(ws(a), state(5, 5))
    const store = v.packStore
    v.packStore = {
      ...store,
      open: (id) => store.open(id),
      get: (id) => store.get(id),
      stow: () => Promise.reject(new Error('down')),
    }
    const error = console.error
    console.error = () => {}
    try {
      await v.webSocketMessage(ws(a), move('stow', 'joints'))
    } finally {
      console.error = error
    }
    expect(nacks().at(-1)).toMatchObject({ reason: 'unavailable' })
    expect(lastFrame(a)?.stash.joints).toBe(0)
  })

  it('refuses a flood of moves', async () => {
    const { valley: v, state: s } = await valley()
    const a = await join(v, s, 'A', { dev: true })
    await v.webSocketMessage(ws(a), state(5, 5))
    await v.webSocketMessage(
      ws(a),
      '{"type":"dev","op":"grant","kind":"joints","count":40}'
    )
    for (let i = 0; i < 25; i++) {
      await v.webSocketMessage(ws(a), move('stow', 'joints'))
    }
    expect(
      a.frames().findLast((m): m is NackMessage => m.type === 'nack')
    ).toMatchObject({ re: 'stow', reason: 'too-fast' })
  })
})

describe('ValleyDO: the Cabbage Stand', () => {
  const HOUR = 60 * 60 * 1000
  const [one, two] = CONFIG.stand.levels
  const frames = (socket: MockSocket) =>
    socket.frames().filter((m): m is StandMessage => m.type === 'stand')
  const nack = (socket: MockSocket) =>
    socket.frames().findLast((m): m is NackMessage => m.type === 'nack')
  const lastFrame = (socket: MockSocket) =>
    socket.frames().findLast((m): m is PackMessage => m.type === 'pack')

  it('welcomes a raider with a fresh stand', async () => {
    const { valley: v, state: s } = await valley()
    const a = await join(v, s, 'A')
    expect(a.frames()[0]).toMatchObject({
      type: 'welcome',
      stand: { level: 1, stock: {}, banked: 0 },
    })
  })

  it('stocks the table out of the pack, banks on the clock, and collects into the wallet', async () => {
    vi.useFakeTimers({ toFake: ['Date'], now: Date.now() })
    onTestFinished(() => {
      vi.useRealTimers()
    })
    const { valley: v, state: s } = await valley()
    const a = await join(v, s, 'A', { dev: true })
    const other = await join(v, s, 'A2', { account: 'acct-A' })
    await v.webSocketMessage(
      ws(a),
      `{"type":"dev","op":"grant","kind":"cabbage","count":${one.shelf}}`
    )
    await v.webSocketMessage(ws(a), state(STAND.x + 1, STAND.z))
    await v.webSocketMessage(
      ws(a),
      JSON.stringify({ type: 'stand-stock', kind: 'cabbage', count: one.shelf })
    )
    expect(frames(a).at(-1)).toMatchObject({
      re: 'stock',
      stand: { stock: { cabbage: one.shelf } },
    })
    // Every socket on the account hears it, and the pack after.
    expect(frames(other).at(-1)?.stand.stock.cabbage).toBe(one.shelf)
    expect(lastFrame(a)?.pack.cabbage).toBe(0)
    vi.setSystemTime(Date.now() + 2 * HOUR)
    await v.webSocketMessage(ws(a), '{"type":"stand-collect"}')
    expect(frames(a).at(-1)).toMatchObject({
      re: 'collect',
      cents: 2 * one.rate,
    })
    expect(lastFrame(a)?.cash).toBe(STARTING_CASH + 2 * one.rate)
    // Rule 22: XP by the cents it paid, to every socket on the account.
    await vi.waitFor(() => {
      const gained = XP.stand * standXp(2 * one.rate)
      expect(other.frames().filter((m) => m.type === 'xp')).toContainEqual({
        type: 'xp',
        xp: gained,
        gained,
      })
    })
    // Nothing more to collect yet.
    await v.webSocketMessage(ws(a), '{"type":"stand-collect"}')
    expect(nack(a)).toMatchObject({ re: 'stand-collect', reason: 'empty' })
  })

  it('sells the next level for cash and goods, all or nothing', async () => {
    const { valley: v, state: s } = await valley()
    const a = await join(v, s, 'A', { dev: true })
    const price = two.price
    if (!price) throw new Error('priced')
    await v.webSocketMessage(ws(a), state(STAND.x, STAND.z + 1))
    await v.webSocketMessage(ws(a), '{"type":"stand-upgrade"}')
    expect(nack(a)).toMatchObject({ re: 'stand-upgrade', reason: 'short' })
    for (const [kind, count] of Object.entries(price.items)) {
      if (count < 1) continue
      await v.webSocketMessage(
        ws(a),
        JSON.stringify({ type: 'dev', op: 'grant', kind, count })
      )
    }
    const store = v.packStore as MemoryPackStore
    await store.earn('acct-A', price.cash)
    await v.webSocketMessage(ws(a), '{"type":"stand-upgrade"}')
    expect(frames(a).at(-1)).toMatchObject({
      re: 'upgrade',
      stand: { level: 2 },
    })
    expect(lastFrame(a)).toMatchObject({
      cash: STARTING_CASH,
      pack: { cabbage: 0 },
    })
  })

  it('stays shut away from the stand, or when it cannot be read or written', async () => {
    const { valley: v, state: s } = await valley()
    const a = await join(v, s, 'A')
    await v.webSocketMessage(ws(a), '{"type":"stand-collect"}')
    expect(nack(a)).toMatchObject({ re: 'stand-collect', reason: 'no-stand' })
    await v.webSocketMessage(ws(a), state(STAND.x, STAND.z))
    const store = v.packStore
    const error = console.error
    console.error = () => {}
    try {
      v.packStore = {
        ...store,
        open: (id) => store.open(id),
        get: (id) => store.get(id),
        stand: () => Promise.reject(new Error('down')),
      }
      await v.webSocketMessage(ws(a), '{"type":"stand-collect"}')
      expect(nack(a)).toMatchObject({ reason: 'unavailable' })
      v.packStore = {
        ...store,
        open: (id) => store.open(id),
        get: (id) => store.get(id),
        stand: (id) => store.stand(id),
        tend: () => Promise.reject(new Error('down')),
      }
      await v.webSocketMessage(
        ws(a),
        '{"type":"stand-stock","kind":"cabbage","count":1}'
      )
      expect(nack(a)).toMatchObject({ reason: 'none-left' })
      await (store as MemoryPackStore).change('acct-A', 'cabbage', 1)
      await v.webSocketMessage(
        ws(a),
        '{"type":"stand-stock","kind":"cabbage","count":1}'
      )
      expect(nack(a)).toMatchObject({ reason: 'unavailable' })
      v.packStore = {
        ...store,
        open: (id) => store.open(id),
        get: (id) => store.get(id),
        stand: (id) => store.stand(id),
        tend: () => Promise.resolve(false),
      }
      await v.webSocketMessage(
        ws(a),
        '{"type":"stand-stock","kind":"cabbage","count":1}'
      )
      expect(nack(a)).toMatchObject({ reason: 'short' })
    } finally {
      console.error = error
    }
    expect(frames(a)).toEqual([])
  })

  it('refuses a flood of tending', async () => {
    const { valley: v, state: s } = await valley()
    const a = await join(v, s, 'A')
    await v.webSocketMessage(ws(a), state(STAND.x, STAND.z))
    for (let i = 0; i < 25; i++) {
      await v.webSocketMessage(ws(a), '{"type":"stand-collect"}')
    }
    expect(nack(a)).toMatchObject({ reason: 'too-fast' })
  })
})

describe('ValleyDO: the shadowmen', () => {
  const shadowFrames = (socket: MockSocket) =>
    socket.frames().filter((m): m is ShadowmenMessage => m.type === 'shadowmen')

  it('steps them for everyone once someone is placed, and stops with no one left', async () => {
    const { valley: v, state: s } = await valley()
    const a = await join(v, s, 'A')
    const b = await join(v, s, 'B')
    expect(v.ticking).toBe(false)
    await v.webSocketMessage(ws(a), state(0, 0))
    expect(v.ticking).toBe(true)
    v.tick()
    const [seenByA] = shadowFrames(a)
    expect(seenByA.shadowmen.length).toBeGreaterThan(0)
    expect(shadowFrames(b)).toEqual([seenByA])
    await v.webSocketClose(ws(a))
    await v.webSocketClose(ws(b))
    v.tick()
    expect(v.ticking).toBe(false)
  })

  it('strikes the raider a shadowman touches, and no one else', async () => {
    const { valley: v, state: s } = await valley()
    const a = await join(v, s, 'A', { dev: true })
    const b = await join(v, s, 'B')
    // The truck leaves without them: both are on foot.
    await v.alarm()
    await v.webSocketMessage(ws(a), state(500, 500))
    await v.webSocketMessage(ws(b), state(900, 900))
    // Only the shadowman placed here rushes anyone.
    await v.webSocketMessage(ws(a), '{"type":"dev","op":"calm"}')
    await v.webSocketMessage(
      ws(a),
      '{"type":"dev","op":"shadowman","x":500,"z":501}'
    )
    await tickUntilStruck(v, a)
    expect(a.frames()).toContainEqual({ type: 'struck', health: 2 })
    expect(b.frames().some((m) => m.type === 'struck')).toBe(false)
  })

  it("says when it was the Caretaker's touch, and sends where it floats", async () => {
    const { valley: v, state: s } = await valley()
    const a = await join(v, s, 'A', { dev: true })
    const b = await join(v, s, 'B')
    await v.alarm()
    // A stands in the court at the maze's heart; B far off.
    const heart = heartPoint(theMaze())
    const hx = MAZE.x + heart.x
    const hz = MAZE.z + heart.z
    await v.webSocketMessage(ws(a), state(hx, hz + 2))
    await v.webSocketMessage(ws(b), state(900, 900))
    // No crossing shadowman rushes anyone: only the Caretaker strikes.
    await v.webSocketMessage(ws(a), '{"type":"dev","op":"calm"}')
    await v.webSocketMessage(
      ws(a),
      `{"type":"dev","op":"caretaker","x":${hx},"z":${hz}}`
    )
    v.tick()
    const frame = a.last<ShadowmenMessage>()
    expect(frame.type).toBe('shadowmen')
    expect(frame.caretaker).toMatchObject({ target: idOf(a) })
    await tickUntilStruck(v, a)
    expect(a.frames()).toContainEqual({
      type: 'struck',
      by: 'caretaker',
      health: 2,
    })
    expect(b.frames().some((m) => m.type === 'struck')).toBe(false)
  })

  it('leaves two 1 troy ounce gold bars where two beams unmade the Caretaker', async () => {
    const { valley: v, state: s } = await valley()
    const a = await join(v, s, 'A', { dev: true })
    const b = await join(v, s, 'B')
    const heart = heartPoint(theMaze())
    const hx = MAZE.x + heart.x
    const hz = MAZE.z + heart.z
    // Both down the court from it, looking at it (+z is yaw pi), from the
    // bed so it never comes for them.
    const lit = (dx: number) =>
      JSON.stringify({
        ...JSON.parse(state(hx + dx, hz - 8, true)),
        yaw: Math.PI,
        riding: true,
      })
    await v.webSocketMessage(ws(a), lit(0))
    await v.webSocketMessage(ws(b), lit(0.5))
    await v.webSocketMessage(
      ws(a),
      `{"type":"dev","op":"caretaker","x":${hx},"z":${hz}}`
    )
    const ticks =
      Math.ceil(CONFIG.caretaker.burnSeconds * CONFIG.shadowmen.tickHz) + 2
    for (let i = 0; i < ticks; i++) v.tick()
    // The spill is written after the step.
    await new Promise((resolve) => setTimeout(resolve, 0))
    const spilled = b
      .frames()
      .findLast((m): m is WorldMessage => m.type === 'world')
    expect(spilled?.reason).toBe('spilled')
    const bars = (spilled?.world?.drops ?? []).filter(
      (d) => d.kind === 'gold-bullion'
    )
    expect(bars).toHaveLength(2)
    for (const bar of bars) {
      expect(bar.count).toBe(1)
      expect(Math.hypot(bar.x - hx, bar.z - hz)).toBeLessThan(0.5)
    }
    for (const bar of bars) {
      await v.webSocketMessage(ws(b), `{"type":"take-drop","drop":${bar.id}}`)
    }
    expect(b.last<PackMessage>().pack).toMatchObject({ 'gold-bullion': 2 })
  })

  // A, light on, burns a shadowman standing in the beam 5 m ahead (riding,
  // so it stands to burn rather than rushing them); B stands far off. The
  // dimes it left, as B was told.
  async function burst(
    seed: (v: TestValley) => Promise<void> = async () => {}
  ) {
    const { valley: v, state: s } = await valley()
    await seed(v)
    const a = await join(v, s, 'A', { dev: true })
    const b = await join(v, s, 'B')
    await v.webSocketMessage(
      ws(a),
      JSON.stringify({ ...JSON.parse(state(500, 500, true)), riding: true })
    )
    await v.webSocketMessage(ws(b), state(900, 900))
    // No crossing shadowman rushes B: a strike would empty their pack.
    await v.webSocketMessage(ws(a), '{"type":"dev","op":"calm"}')
    const x = 500 - Math.sin(0.5) * 5
    const z = 500 - Math.cos(0.5) * 5
    await v.webSocketMessage(
      ws(a),
      `{"type":"dev","op":"shadowman","x":${x},"z":${z}}`
    )
    for (let i = 0; i < 10; i++) v.tick()
    // The spill is written after the step.
    await new Promise((resolve) => setTimeout(resolve, 0))
    const spilled = b
      .frames()
      .findLast((m): m is WorldMessage => m.type === 'world')
    expect(spilled?.reason).toBe('spilled')
    const [dimes] = spilled?.world?.drops ?? []
    const [grave] = spilled?.world?.graves ?? []
    return { v, a, b, dimes, grave, x, z }
  }

  it("burns one in Marx's headlights, as a raider near the truck says where it stands", async () => {
    const { valley: v, state: s } = await valley()
    const a = await join(v, s, 'A', { dev: true })
    // In the bed, light down, so the one placed stands to burn.
    await v.webSocketMessage(
      ws(a),
      JSON.stringify({ ...JSON.parse(state(500, 500)), riding: true })
    )
    await v.webSocketMessage(ws(a), '{"type":"dev","op":"calm"}')
    // The truck 20 m east, facing north (-Z), the shadowman 15 m ahead.
    await v.webSocketMessage(
      ws(a),
      JSON.stringify({
        type: 'headlights',
        x: 520,
        y: 0,
        z: 500,
        heading: Math.PI,
      })
    )
    await v.webSocketMessage(
      ws(a),
      '{"type":"dev","op":"shadowman","x":520,"z":485}'
    )
    for (let i = 0; i < 10; i++) v.tick()
    await new Promise((resolve) => setTimeout(resolve, 0))
    const spilled = a
      .frames()
      .findLast((m): m is WorldMessage => m.type === 'world')
    expect(spilled?.reason).toBe('spilled')
    // The headlights credit no one with the burn.
    expect(tasks(a)).toEqual([])
  })

  it('leaves a named tombstone a step from where one burst', async () => {
    const { grave, x, z } = await burst()
    expect(grave.name.length).toBeGreaterThan(0)
    expect(Math.hypot(grave.x - x, grave.z - z)).toBeCloseTo(
      CONFIG.graves.offset,
      1
    )
  })

  const tasks = (socket: MockSocket) =>
    socket.frames().filter((m): m is TaskMessage => m.type === 'task')

  it("credits the account whose beam burst it with a burn toward today's task", async () => {
    const { a, b } = await burst()
    // The welcome said nothing was done yet.
    expect(a.frames()[0]).toMatchObject({
      type: 'welcome',
      task: { task: DAILY_TASK.id, ...NO_TASK },
    })
    // A's beam burned it; B, far off, had no part. A crossing shadowman
    // may burn in the same beam too, crediting a second.
    expect(tasks(a)[0]).toEqual({
      type: 'task',
      task: {
        task: DAILY_TASK.id,
        day: dayKey(Date.now()),
        count: 1,
        claimed: false,
      },
      rewarded: false,
    })
    expect(tasks(b)).toEqual([])
  })

  const xps = (socket: MockSocket) =>
    socket.frames().filter((m): m is XpMessage => m.type === 'xp')

  it('earns the account whose beam burst it XP (rule 22)', async () => {
    const { a, b } = await burst()
    expect(a.frames()[0]).toMatchObject({ type: 'welcome', xp: 0 })
    // A crossing shadowman may burn in the same beam too.
    const [first] = xps(a)
    expect(first.gained).toBeGreaterThanOrEqual(XP.burn)
    expect(first.xp).toBe(first.gained)
    expect(xps(b)).toEqual([])
  })

  it('shows everyone the level a burn reaches', async () => {
    const store = new MemoryPackStore()
    const { a, b } = await burst(async (v) => {
      v.packStore = store
      await store.open('acct-A')
      await store.gainXp('acct-A', xpToReach(2) - 1)
    })
    // The welcome and the roster carried the level the account had.
    expect(a.frames()[0]).toMatchObject({ xp: xpToReach(2) - 1 })
    const roster = b.frames()[0] as WelcomeMessage
    expect(roster.peers).toMatchObject([{ name: 'A', level: 1 }])
    const updated = b
      .frames()
      .filter((m): m is PeerUpdatedMessage => m.type === 'peer-updated')
    expect(updated).toMatchObject([{ peer: { name: 'A', level: 2 } }])
    expect(await store.xp('acct-A')).toBeGreaterThanOrEqual(
      xpToReach(2) - 1 + XP.burn
    )
  })

  it("pays the day's reward on the burn that finishes the task", async () => {
    const store = new MemoryPackStore()
    const { a } = await burst(async (v) => {
      v.packStore = store
      await store.open('acct-A')
      await store.scoreTask(
        'acct-A',
        DAILY_TASK.id,
        { day: dayKey(Date.now()), count: DAILY_TASK.goal - 1, claimed: false },
        null
      )
    })
    expect(tasks(a).at(-1)).toMatchObject({
      task: { count: DAILY_TASK.goal, claimed: true },
      rewarded: true,
    })
    const paid = a.frames().findLast((m): m is PackMessage => m.type === 'pack')
    expect(paid?.cash).toBe(STARTING_CASH + DAILY_TASK.reward)
  })

  it('leaves dimes where one burst, paid into the wallet of whoever takes them up', async () => {
    const { v, b, dimes, x, z } = await burst()
    expect(dimes).toMatchObject({ kind: 'dimes' })
    expect(Math.hypot(dimes.x - x, dimes.z - z)).toBeLessThan(0.1)
    const { min, max } = CONFIG.shadowmen.dimes
    expect(dimes.count).toBeGreaterThanOrEqual(min)
    expect(dimes.count).toBeLessThanOrEqual(max)
    await v.webSocketMessage(ws(b), state(dimes.x, dimes.z))
    await v.webSocketMessage(ws(b), `{"type":"take-drop","drop":${dimes.id}}`)
    const paid = b.last<PackMessage>()
    expect(paid).toMatchObject({
      type: 'pack',
      cash: STARTING_CASH + dimes.count * DIME_CENTS,
    })
    // Dimes are never an item.
    expect(paid.pack).not.toHaveProperty('dimes')
  })

  it('still sends the wallet when the dimes cannot be paid in', async () => {
    const { v, b, dimes } = await burst()
    const store = v.packStore
    v.packStore = {
      open: (id) => store.open(id),
      get: (id) => store.get(id),
      change: (id, kind, delta) => store.change(id, kind, delta),
      purchase: (id, amount, item) => store.purchase(id, amount, item),
      earn: () => Promise.reject(new Error('down')),
      trade: (id, price, cosmetic) => store.trade(id, price, cosmetic),
      season: (id, season) => store.season(id, season),
      book: (id) => store.book(id),
      discover: (id, entries, now) => store.discover(id, entries, now),
      strip: (id) => store.strip(id),
      give: (id, items) => store.give(id, items),
      stow: (id, kind, delta) => store.stow(id, kind, delta),
      stand: (id) => store.stand(id),
      tend: (id, rev, change) => store.tend(id, rev, change),
      score: (id, season, progress, reward) =>
        store.score(id, season, progress, reward),
      task: (id, task) => store.task(id, task),
      scoreTask: (id, task, progress, reward) =>
        store.scoreTask(id, task, progress, reward),
      xp: (id) => store.xp(id),
      gainXp: (id, amount) => store.gainXp(id, amount),
    }
    const error = console.error
    console.error = () => {}
    try {
      await v.webSocketMessage(ws(b), state(dimes.x, dimes.z))
      await v.webSocketMessage(ws(b), `{"type":"take-drop","drop":${dimes.id}}`)
    } finally {
      console.error = error
    }
    expect(b.last<PackMessage>()).toMatchObject({ cash: STARTING_CASH })
  })

  it('credits both beams with unmaking the Caretaker, and pays the season out once', async () => {
    const { valley: v, state: s } = await valley()
    const a = await join(v, s, 'A', { dev: true })
    const b = await join(v, s, 'B')
    // A second socket on A's account, standing far off.
    const a2 = await join(v, s, 'A2', { account: 'acct-A' })
    expect(a.frames()[0]).toMatchObject({
      type: 'welcome',
      season: { season: SEASON.id, kills: 0, claimed: false },
    })
    await v.alarm()
    const heart = heartPoint(theMaze())
    const hx = MAZE.x + heart.x
    const hz = MAZE.z + heart.z
    // Down the court from it, looking at it (+z is yaw pi), from the bed
    // so it never comes for them.
    const lit = (dx: number) =>
      JSON.stringify({
        type: 'state',
        x: hx + dx,
        y: 0,
        z: hz - 8,
        yaw: Math.PI,
        pitch: 0,
        pose: 'stand',
        riding: true,
        light: true,
      })
    await v.webSocketMessage(ws(a2), state(900, 900))
    // No crossing shadowman rushes A2: a strike would empty the account's
    // pack onto a body.
    await v.webSocketMessage(ws(a), '{"type":"dev","op":"calm"}')
    const seasonFrames = (socket: MockSocket) =>
      socket.frames().filter((m): m is SeasonMessage => m.type === 'season')
    const unmake = async () => {
      await v.webSocketMessage(ws(a), lit(0))
      await v.webSocketMessage(ws(b), lit(0.5))
      await v.webSocketMessage(
        ws(a),
        `{"type":"dev","op":"caretaker","x":${hx},"z":${hz}}`
      )
      const ticks = Math.ceil(
        CONFIG.caretaker.burnSeconds * CONFIG.shadowmen.tickHz
      )
      for (let i = 0; i <= ticks; i++) v.tick()
      // The tally runs after the tick, alone.
      await new Promise((resolve) => setTimeout(resolve, 0))
    }
    const wallet = (await v.packStore.get('acct-A')).cash
    const reds = (await v.packStore.get('acct-A')).pack.marlboro
    for (let n = 1; n <= SEASON.goal; n++) {
      await unmake()
      expect(seasonFrames(a)).toHaveLength(n)
      expect(seasonFrames(b)).toHaveLength(n)
    }
    // Every socket on the account hears it, the far one too.
    expect(seasonFrames(a2)).toEqual(seasonFrames(a))
    expect(seasonFrames(a).map((m) => m.rewarded)).toEqual([
      false,
      false,
      false,
      false,
      true,
    ])
    expect(a.last<PackMessage>()).toMatchObject({
      type: 'pack',
      cash: wallet + SEASON.reward.cash,
    })
    expect((await v.packStore.get('acct-A')).pack.marlboro).toBe(
      reds + SEASON.reward.count
    )
    // Once: a sixth unmaking counts, and pays nothing.
    await unmake()
    expect(seasonFrames(a).at(-1)).toEqual({
      type: 'season',
      season: { season: SEASON.id, kills: SEASON.goal + 1, claimed: true },
      rewarded: false,
    })
    expect((await v.packStore.get('acct-A')).cash).toBe(
      wallet + SEASON.reward.cash
    )
    // And the progress comes back in the next welcome.
    const back = await join(v, s, 'B2', { account: 'acct-B' })
    expect(back.frames()[0]).toMatchObject({
      season: { kills: SEASON.goal + 1, claimed: true },
    })
  })

  it('tallies nothing when the season cannot be written', async () => {
    const { valley: v, state: s } = await valley()
    const a = await join(v, s, 'A', { dev: true })
    const b = await join(v, s, 'B')
    await v.alarm()
    const store = v.packStore
    v.packStore = {
      open: (id) => store.open(id),
      get: (id) => store.get(id),
      change: (id, kind, delta) => store.change(id, kind, delta),
      purchase: (id, amount, item) => store.purchase(id, amount, item),
      earn: (id, amount) => store.earn(id, amount),
      trade: (id, price, cosmetic) => store.trade(id, price, cosmetic),
      season: (id, season) => store.season(id, season),
      book: (id) => store.book(id),
      discover: (id, entries, now) => store.discover(id, entries, now),
      strip: (id) => store.strip(id),
      give: (id, items) => store.give(id, items),
      stow: (id, kind, delta) => store.stow(id, kind, delta),
      stand: (id) => store.stand(id),
      tend: (id, rev, change) => store.tend(id, rev, change),
      score: () => Promise.reject(new Error('down')),
      task: (id, task) => store.task(id, task),
      scoreTask: (id, task, progress, reward) =>
        store.scoreTask(id, task, progress, reward),
      xp: (id) => store.xp(id),
      gainXp: (id, amount) => store.gainXp(id, amount),
    }
    const heart = heartPoint(theMaze())
    const hx = MAZE.x + heart.x
    const hz = MAZE.z + heart.z
    const lit = (dx: number) =>
      JSON.stringify({
        type: 'state',
        x: hx + dx,
        y: 0,
        z: hz - 8,
        yaw: Math.PI,
        pitch: 0,
        pose: 'stand',
        riding: true,
        light: true,
      })
    await v.webSocketMessage(ws(a), lit(0))
    await v.webSocketMessage(ws(b), lit(0.5))
    await v.webSocketMessage(
      ws(a),
      `{"type":"dev","op":"caretaker","x":${hx},"z":${hz}}`
    )
    const errors: unknown[] = []
    const error = console.error
    console.error = (...args: unknown[]) => errors.push(args)
    try {
      for (let i = 0; i <= 20; i++) v.tick()
      await new Promise((resolve) => setTimeout(resolve, 0))
    } finally {
      console.error = error
    }
    expect(errors).toHaveLength(2)
    expect(a.frames().some((m) => m.type === 'season')).toBe(false)
  })

  it('places a shadowman only for a dev socket', async () => {
    const { valley: v, state: s } = await valley()
    const a = await join(v, s, 'A')
    await v.webSocketMessage(ws(a), state(0, 0))
    await v.webSocketMessage(
      ws(a),
      '{"type":"dev","op":"shadowman","x":0,"z":1}'
    )
    expect(a.last<NackMessage>()).toMatchObject({
      re: 'dev',
      reason: 'not-a-dev-server',
    })
  })
})

describe("ValleyDO: Moab's trade", () => {
  const trade = (offer = 'flaming-halo') =>
    JSON.stringify({ type: 'trade', offer })
  const grant = (kind = 'gold-bullion', count = 1) =>
    JSON.stringify({ type: 'dev', op: 'grant', kind, count })

  it('trades the Flaming Halo for an ounce of gold, for everyone to see', async () => {
    const { valley: v, state: s } = await valley()
    const a = await join(v, s, 'A', { dev: true })
    const b = await join(v, s, 'B')
    expect(a.frames()[0]).toMatchObject({ type: 'welcome', cosmetics: [] })
    await v.webSocketMessage(ws(a), trade())
    expect(a.last<NackMessage>()).toEqual({
      type: 'nack',
      re: 'trade',
      reason: 'short',
    })
    await v.webSocketMessage(ws(a), grant('gold-bullion', 2))
    expect(lastPack(a)?.['gold-bullion']).toBe(2)
    await v.webSocketMessage(ws(a), trade())
    const pack = a.frames().findLast((m): m is PackMessage => m.type === 'pack')
    expect(pack).toMatchObject({
      pack: { 'gold-bullion': 1 },
      cosmetics: ['flaming-halo'],
    })
    for (const socket of [a, b]) {
      expect(socket.last<PeerUpdatedMessage>()).toMatchObject({
        type: 'peer-updated',
        peer: { id: idOf(a), name: 'A', cosmetics: ['flaming-halo'] },
      })
    }
    // Had for good: never sold twice.
    await v.webSocketMessage(ws(a), trade())
    expect(a.last<NackMessage>()).toMatchObject({ reason: 'owned' })
    expect((await v.packStore.get('acct-A')).pack['gold-bullion']).toBe(1)
    // Anyone arriving later sees it worn, and so does the wearer's welcome.
    const c = await join(v, s, 'C')
    const welcome = c.frames()[0] as WelcomeMessage
    expect(welcome.peers.find((p) => p.id === idOf(a))?.cosmetics).toEqual([
      'flaming-halo',
    ])
    a.close()
    await v.webSocketClose(ws(a))
    const back = await join(v, s, 'A')
    expect(back.frames()[0]).toMatchObject({ cosmetics: ['flaming-halo'] })
  })

  it('refuses an offer Moab does not make, and grants nothing off a dev server', async () => {
    const { valley: v, state: s } = await valley()
    const a = await join(v, s, 'A')
    await v.webSocketMessage(ws(a), trade('golden-crown'))
    expect(a.last<NackMessage>()).toMatchObject({
      re: 'trade',
      reason: 'no-such-offer',
    })
    await v.webSocketMessage(ws(a), grant())
    expect(a.last<NackMessage>()).toMatchObject({ re: 'dev' })
    expect((await v.packStore.get('acct-A')).pack['gold-bullion']).toBe(0)
  })

  it('trades nothing when the pack cannot be read or the trade cannot be written', async () => {
    const { valley: v, state: s } = await valley()
    const a = await join(v, s, 'A')
    const b = await join(v, s, 'B')
    const store = v.packStore
    await store.change('acct-A', 'gold-bullion', 1)
    const error = console.error
    console.error = () => {}
    try {
      const before = b.frames().length
      v.packStore = { ...store, get: () => Promise.reject(new Error('down')) }
      await v.webSocketMessage(ws(a), trade())
      expect(a.last<NackMessage>()).toMatchObject({ reason: 'unavailable' })
      v.packStore = {
        open: (id) => store.open(id),
        get: (id) => store.get(id),
        change: (id, kind, delta) => store.change(id, kind, delta),
        purchase: (id, amount, item) => store.purchase(id, amount, item),
        earn: (id, amount) => store.earn(id, amount),
        trade: () => Promise.reject(new Error('down')),
        season: (id, season) => store.season(id, season),
        book: (id) => store.book(id),
        discover: (id, entries, now) => store.discover(id, entries, now),
        strip: (id) => store.strip(id),
        give: (id, items) => store.give(id, items),
        stow: (id, kind, delta) => store.stow(id, kind, delta),
        stand: (id) => store.stand(id),
        tend: (id, rev, change) => store.tend(id, rev, change),
        score: (id, season, progress, reward) =>
          store.score(id, season, progress, reward),
        task: (id, task) => store.task(id, task),
        scoreTask: (id, task, progress, reward) =>
          store.scoreTask(id, task, progress, reward),
        xp: (id) => store.xp(id),
        gainXp: (id, amount) => store.gainXp(id, amount),
      }
      await v.webSocketMessage(ws(a), trade())
      expect(a.last<NackMessage>()).toMatchObject({ reason: 'unavailable' })
      // Nobody saw a halo, and the gold is still in the pack.
      expect(b.frames()).toHaveLength(before)
      expect(await store.get('acct-A')).toMatchObject({
        pack: { 'gold-bullion': 1 },
        cosmetics: [],
      })
    } finally {
      console.error = error
    }
  })
})

describe('ValleyDO: the Book of Shadows', () => {
  const discover = (...entries: unknown[]) =>
    JSON.stringify({ type: 'discover', entries })
  const books = (socket: MockSocket) =>
    socket.frames().filter((m): m is BookMessage => m.type === 'book')

  it("writes what the raider came across in the account's book, once", async () => {
    const { valley: v, state: s } = await valley()
    const a = await join(v, s, 'A')
    const a2 = await join(v, s, 'A2', { account: 'acct-A' })
    const b = await join(v, s, 'B')
    expect(a.frames()[0]).toMatchObject({ type: 'welcome', book: [] })
    await v.webSocketMessage(ws(a), discover('citgo', 'nowhere', 'marlboro'))
    // Every socket on the account hears it; no one else does.
    for (const socket of [a, a2]) {
      expect(books(socket)).toEqual([
        { type: 'book', found: ['citgo', 'marlboro'] },
      ])
    }
    expect(books(b)).toEqual([])
    // Asked again, it is no news.
    await v.webSocketMessage(ws(a2), discover('citgo', 'marx'))
    expect(books(a).at(-1)).toEqual({ type: 'book', found: ['marx'] })
    await v.webSocketMessage(ws(a), discover('marx'))
    expect(books(a)).toHaveLength(2)
    // The book outlives the socket.
    await v.webSocketClose(ws(a))
    await v.webSocketClose(ws(a2))
    const back = await join(v, s, 'A', { account: 'acct-A' })
    expect(back.frames()[0]).toMatchObject({
      type: 'welcome',
      book: ['citgo', 'marlboro', 'marx'],
    })
  })

  it('nacks an ask too soon after the last ten, and one it cannot write', async () => {
    const { valley: v, state: s } = await valley()
    const a = await join(v, s, 'A')
    for (let i = 0; i < 10; i++) {
      await v.webSocketMessage(ws(a), discover('citgo'))
    }
    await v.webSocketMessage(ws(a), discover('marx'))
    expect(a.last<NackMessage>()).toEqual({
      type: 'nack',
      re: 'discover',
      reason: 'too-fast',
    })
    const b = await join(v, s, 'B')
    const store = v.packStore
    v.packStore = {
      ...store,
      open: (id) => store.open(id),
      get: (id) => store.get(id),
      season: (id, season) => store.season(id, season),
      book: (id) => store.book(id),
      discover: () => Promise.reject(new Error('down')),
    }
    const error = console.error
    console.error = () => {}
    try {
      await v.webSocketMessage(ws(b), discover('gron'))
    } finally {
      console.error = error
    }
    expect(b.last<NackMessage>()).toEqual({
      type: 'nack',
      re: 'discover',
      reason: 'unwritten',
    })
    expect(books(b)).toEqual([])
  })
})

describe('ValleyDO: health', () => {
  const healthOf = (socket: MockSocket) =>
    socket
      .frames()
      .filter((m) => m.type === 'health' || m.type === 'struck')
      .map((m) => (m as { health: number }).health)

  // A, on foot far from any forecourt, with a second socket on the same
  // account standing elsewhere; B far off.
  async function out() {
    const { valley: v, state: s } = await valley()
    const a = await join(v, s, 'A', { dev: true })
    const a2 = await join(v, s, 'A2', { account: 'acct-A' })
    const b = await join(v, s, 'B')
    await v.alarm()
    await v.webSocketMessage(ws(a), state(500, 500))
    await v.webSocketMessage(ws(a2), state(700, 700))
    await v.webSocketMessage(ws(b), state(900, 900))
    await v.webSocketMessage(ws(a), '{"type":"dev","op":"calm"}')
    return { v, s, a, a2, b }
  }

  it('welcomes an account whole', async () => {
    const { valley: v, state: s } = await valley()
    const a = await join(v, s, 'A')
    expect(a.frames()[0]).toMatchObject({
      type: 'welcome',
      health: CONFIG.health.max,
    })
  })

  it('takes one point for a touch, and leaves the pack and the raider be', async () => {
    const { v, a, a2, b } = await out()
    await v.webSocketMessage(
      ws(a),
      '{"type":"dev","op":"shadowman","x":500,"z":501}'
    )
    await tickUntilStruck(v, a)
    expect(a.frames()).toContainEqual({
      type: 'struck',
      health: CONFIG.health.max - 1,
    })
    // The account's other socket hears its health, not a strike.
    expect(a2.frames()).toContainEqual({
      type: 'health',
      health: CONFIG.health.max - 1,
    })
    expect(a2.frames().some((m) => m.type === 'struck')).toBe(false)
    // No body, and the pack as it was.
    const worlds = b
      .frames()
      .filter((m): m is WorldMessage => m.type === 'world')
    expect(worlds.some((m) => m.reason === 'fell')).toBe(false)
    expect(lastPack(a) ?? STARTING_INVENTORY).toEqual(STARTING_INVENTORY)
  })

  it('remembers the account across a reconnect', async () => {
    const { valley: v, state: s } = await valley()
    const a = await join(v, s, 'A', { dev: true })
    await v.webSocketMessage(ws(a), '{"type":"dev","op":"health","points":1}')
    expect(healthOf(a)).toEqual([1])
    await v.webSocketClose(ws(a))
    const back = await join(v, s, 'A')
    expect(back.frames()[0]).toMatchObject({ type: 'welcome', health: 1 })
  })

  it('shatters on the last point: the strike, then whole again', async () => {
    const { v, s, a } = await out()
    await v.webSocketMessage(ws(a), '{"type":"dev","op":"health","points":1}')
    await v.webSocketMessage(
      ws(a),
      '{"type":"dev","op":"shadowman","x":500,"z":501}'
    )
    await tickUntilStruck(v, a)
    expect(a.frames()).toContainEqual({ type: 'struck', health: 0 })
    expect(
      a.frames().findLast((m): m is PackMessage => m.type === 'pack')
    ).toMatchObject({ corpses: [0] })
    await v.webSocketClose(ws(a))
    const back = await join(v, s, 'A')
    expect(back.frames()[0]).toMatchObject({
      type: 'welcome',
      health: CONFIG.health.max,
    })
  })

  it('makes whole on a Citgo forecourt', async () => {
    const { v, a, a2 } = await out()
    await v.webSocketMessage(ws(a), '{"type":"dev","op":"health","points":1}')
    // The hello put a forecourt at the origin.
    await v.webSocketMessage(ws(a), state(5, 5))
    v.tick()
    await settle()
    expect(healthOf(a).at(-1)).toBe(CONFIG.health.max)
    expect(healthOf(a2).at(-1)).toBe(CONFIG.health.max)
    // Whole, it hears nothing more.
    const heard = healthOf(a).length
    v.tick()
    await settle()
    expect(healthOf(a).length).toBe(heard)
  })

  it('gives a point back for a pill that heals, once the pack gives it up', async () => {
    const { v, a } = await out()
    await v.webSocketMessage(ws(a), '{"type":"dev","op":"health","points":1}')
    // None carried: refused, and no point back.
    await v.webSocketMessage(ws(a), '{"type":"use","kind":"aspirin"}')
    expect(healthOf(a)).toEqual([1])
    await v.webSocketMessage(
      ws(a),
      '{"type":"dev","op":"grant","kind":"aspirin","count":24}'
    )
    await v.webSocketMessage(ws(a), '{"type":"use","kind":"aspirin"}')
    expect(healthOf(a)).toEqual([1, 2])
    expect(lastPack(a)?.aspirin).toBe(23)
    // Medicine that does not heal gives nothing back.
    await v.webSocketMessage(
      ws(a),
      '{"type":"dev","op":"grant","kind":"benadryl","count":24}'
    )
    await v.webSocketMessage(ws(a), '{"type":"use","kind":"benadryl"}')
    expect(healthOf(a)).toEqual([1, 2])
  })

  it('keeps a touch that lands while another change waits on D1', async () => {
    const { v, s, a } = await out()
    await v.webSocketMessage(
      ws(a),
      '{"type":"dev","op":"shadowman","x":500,"z":501}'
    )
    // A drop whose pack write takes long enough for the shadowman to wind
    // up and lunge meanwhile: the step's hit must not be overwritten by
    // the valley the drop was reduced from.
    const store = v.packStore
    const change = store.change.bind(store)
    store.change = async (...args) => {
      for (let i = 0; i < 30; i++) {
        v.tick()
        await settle()
      }
      return change(...args)
    }
    await v.webSocketMessage(ws(a), '{"type":"drop","kind":"joints","count":1}')
    await settle()
    expect(a.reasons()).toContain('dropped')
    expect(a.frames()).toContainEqual({
      type: 'struck',
      health: CONFIG.health.max - 1,
    })
    await v.webSocketClose(ws(a))
    const back = await join(v, s, 'A')
    expect(back.frames()[0]).toMatchObject({
      type: 'welcome',
      health: CONFIG.health.max - 1,
    })
  })

  it('reads each socket off the wire once, however many frames go round', async () => {
    const { v, a, b } = await out()
    const read = b.deserialized
    for (let i = 0; i < 20; i++) {
      await v.webSocketMessage(ws(a), state(500 + i, 500))
    }
    v.tick()
    expect(b.frames().length).toBeGreaterThan(20)
    expect(b.deserialized).toBe(read)
  })
})
