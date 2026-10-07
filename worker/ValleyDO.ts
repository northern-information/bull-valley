// The valley server: one Durable Object holding everyone who is online and
// the one persistent world they share. Each socket's player lives in its
// attachment (WebSocket Hibernation API), so the object can sleep between
// frames and wake with the roster intact; the world lives in storage and
// survives a restart. Every rule is in src/sharedworld.ts; this is the
// plumbing that reads a frame, runs the reducer, persists, arms the alarm
// for Marx's truck and the day's turn, and sends what came back. Each account's pack and wallet are in D1
// (d1packs.ts): the reducer says what goes in or out, and this writes it
// and tells the account's sockets. A buy runs alone (blockConcurrencyWhile),
// so the wallet it was judged against is the wallet it is paid from.
//
// The shadowmen (rule 11) and the Caretaker (rule 13) are stepped here
// CONFIG.shadowmen.tickHz times a second while anyone is placed in the
// valley, and live in memory only. The
// ticking timer keeps the object awake; it stops itself once no one is
// left, and the object can hibernate again.

import { DurableObject } from 'cloudflare:workers'
import { isSelectable } from '../src/characters.ts'
import { CONFIG } from '../src/config.ts'
import { spillsOf } from '../src/drops.ts'
import {
  CLOSE,
  isValidName,
  normalizeName,
  parseClientMessage,
  PROTOCOL_VERSION,
} from '../src/protocol.ts'
import { mulberry32 } from '../src/rng.ts'
import {
  createShadows,
  createValley,
  dailyFor,
  placeCaretaker,
  placeOf,
  placeShadowman,
  reduce,
  restoreValley,
  stepShadows,
  toWire,
} from '../src/sharedworld.ts'
import { ACCOUNT_HEADER, NAME_HEADER } from './auth.ts'
import { D1AccountStore } from './d1accounts.ts'
import { D1PackStore } from './d1packs.ts'
import type { XZ } from '../src/interfaces.ts'
import type {
  HelloMessage,
  PeerStateWire,
  PeerWire,
  ServerMessage,
} from '../src/protocol.ts'
import type {
  PackChange,
  Reduced,
  Valley,
  ValleyAction,
} from '../src/sharedworld.ts'
import type { AccountStore } from './accounts.ts'
import type { Holdings, PackStore } from './packs.ts'

// Per-socket state, serialized into the socket's attachment (16 KB cap;
// this is well under 1 KB). `me` is null until the hello. The Worker sets
// the rest on the upgrade, never the client: `dev` for a dev server, which
// unlocks the dev frames, and the signed-in account and its username, or
// null when there is no session (the hello is then refused).
interface Attachment {
  dev: boolean
  account: string | null
  name: string | null
  me: PeerWire | null
}

// State frames per second one socket may send before the rest are dropped.
// The client sends at most CONFIG.net.sendHz; three times that is a flood.
const STATE_LIMIT: RateLimit = { count: 30, ms: 1000 }

// Chat lines one socket may send in ten seconds; the rest are nacked.
const CHAT_LIMIT: RateLimit = { count: 5, ms: 10_000 }

// Changes at Gron one socket may make in ten seconds; each one rebuilds a
// figure for everyone, so the rest are nacked.
const APPEARANCE_LIMIT: RateLimit = { count: 5, ms: 10_000 }

// Drops one socket may make in ten seconds; each sends the whole world to
// everyone, so the rest are nacked.
const DROP_LIMIT: RateLimit = { count: 20, ms: 10_000 }

const VALLEY_KEY = 'valley'

interface RateWindow {
  startedAt: number
  count: number
}

interface RateLimit {
  count: number
  ms: number
}

export class ValleyDO extends DurableObject<Env> {
  private valley: Valley = createValley()
  // Rate windows live in memory only; a wake from hibernation starts them
  // fresh, which only ever lets a few extra frames through.
  private stateRate = new WeakMap<WebSocket, RateWindow>()
  private chatRate = new WeakMap<WebSocket, RateWindow>()
  private appearanceRate = new WeakMap<WebSocket, RateWindow>()
  private dropRate = new WeakMap<WebSocket, RateWindow>()
  // Rule 13, in memory only: gone whenever the object sleeps.
  private shadows = createShadows()
  private shadowRng = mulberry32(Math.floor(Math.random() * 2 ** 32))
  // A dev server's quiet valley (the specs'): no crossing shadowman rushes.
  private calm = false
  private ticker: unknown = null

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env)
    // The world is read once per wake, before any frame is handled.
    void this.ctx.blockConcurrencyWhile(async () => {
      const stored = await this.ctx.storage.get<Valley>(VALLEY_KEY)
      // A valley stored by an older build is made current (sharedworld.ts).
      if (stored) this.valley = restoreValley(stored)
    })
  }

  fetch(request: Request): Response {
    if (request.headers.get('Upgrade') !== 'websocket') {
      return new Response('Expected a WebSocket upgrade', { status: 426 })
    }
    const pair = new WebSocketPair()
    const [client, server] = [pair[0], pair[1]]
    this.ctx.acceptWebSocket(server)
    const attachment: Attachment = {
      dev: request.headers.get('x-bv-dev') === '1',
      account: request.headers.get(ACCOUNT_HEADER),
      name: request.headers.get(NAME_HEADER),
      me: null,
    }
    server.serializeAttachment(attachment)
    return new Response(null, { status: 101, webSocket: client })
  }

  async webSocketMessage(
    ws: WebSocket,
    data: string | ArrayBuffer
  ): Promise<void> {
    if (typeof data !== 'string') {
      ws.close(CLOSE.malformed, 'Text frames only')
      return
    }
    const msg = parseClientMessage(data)
    if (!msg) {
      ws.close(CLOSE.malformed, 'Malformed frame')
      return
    }
    const attachment = this.attachment(ws)
    const me = attachment.me
    if (!me) {
      if (msg.type !== 'hello') {
        ws.close(CLOSE.malformed, 'Expected hello first')
        return
      }
      await this.hello(ws, attachment, msg)
      return
    }
    switch (msg.type) {
      case 'hello':
        ws.close(CLOSE.malformed, 'Already said hello')
        return
      case 'state':
        this.state(ws, attachment, me, msg)
        this.startShadows()
        return
      case 'ping':
        send(ws, { type: 'pong', t: msg.t, serverNow: Date.now() })
        return
      case 'board':
      case 'hop-out':
        await this.act(ws, { type: msg.type, id: me.id })
        return
      case 'take':
        await this.act(ws, { type: 'take', id: me.id, index: msg.index })
        return
      case 'buy':
        await this.purchase(ws, attachment, {
          type: 'buy',
          id: me.id,
          station: msg.station,
          kind: msg.kind,
          unit: msg.unit,
        })
        return
      case 'call':
        await this.act(ws, {
          type: 'call',
          id: me.id,
          from: msg.from,
          to: msg.to,
        })
        return
      case 'collect':
        await this.act(ws, { type: 'collect', id: me.id, bush: msg.bush })
        return
      case 'use':
        await this.act(ws, { type: 'use', id: me.id, kind: msg.kind })
        return
      case 'drop': {
        // Where the raider's own last state frame put them, never the
        // drop frame's word.
        const at = me.at ? { x: me.at.x, z: me.at.z, yaw: me.at.yaw } : null
        await this.setDown(ws, attachment.account, {
          type: 'drop',
          id: me.id,
          kind: msg.kind,
          count: msg.count,
          at,
        })
        return
      }
      case 'take-drop':
        await this.act(ws, { type: 'take-drop', id: me.id, drop: msg.drop })
        return
      case 'chat':
        this.chat(ws, me, msg.text)
        return
      case 'appearance':
        await this.restyle(ws, attachment, me, msg.outfit)
        return
      case 'rename':
        await this.rename(ws, attachment, me)
        return
      case 'dev':
        if (!attachment.dev) {
          send(ws, { type: 'nack', re: 'dev', reason: 'not-a-dev-server' })
          return
        }
        if (msg.op === 'shadowman') {
          placeShadowman(this.shadows, msg.x, msg.z)
          this.startShadows()
          return
        }
        if (msg.op === 'calm') {
          this.calm = true
          return
        }
        if (msg.op === 'caretaker') {
          placeCaretaker(this.valley, this.shadows, msg.x, msg.z)
          this.startShadows()
          return
        }
        if (msg.op === 'reset') this.shadows = createShadows()
        await this.act(
          ws,
          msg.op === 'hurry'
            ? { type: 'hurry', seconds: msg.seconds }
            : { type: 'reset' }
        )
        return
    }
  }

  async webSocketClose(ws: WebSocket): Promise<void> {
    await this.left(ws)
  }

  async webSocketError(ws: WebSocket): Promise<void> {
    await this.left(ws)
  }

  // Marx's truck or the day is due to move on.
  async alarm(): Promise<void> {
    const reduced = reduce(this.valley, { type: 'clock' }, this.context())
    await this.apply(reduced)
    for (const msg of reduced.broadcast) this.broadcast(msg, null)
  }

  // Where the accounts are kept; the Worker tests hand in a memory store.
  protected accounts(): AccountStore {
    return new D1AccountStore(this.env.DB)
  }

  // Where the packs are kept; the Worker tests hand in a memory store.
  protected packs(): PackStore {
    return new D1PackStore(this.env.DB)
  }

  // The shadowmen's clock; the Worker tests step them by hand instead.
  protected startTicker(step: () => void, ms: number): unknown {
    return setInterval(step, ms)
  }

  protected stopTicker(ticker: unknown): void {
    clearInterval(ticker as ReturnType<typeof setInterval>)
  }

  // Rule 11: step the shadowmen while anyone is placed in the valley.
  private startShadows(): void {
    if (this.ticker !== null) return
    this.ticker = this.startTicker(
      () => this.tickShadows(),
      1000 / CONFIG.shadowmen.tickHz
    )
  }

  // One step of the shadowmen and the Caretaker: the frame to everyone, a
  // strike to each raider touched, saying when it was the Caretaker. Stops the clock when there is no one to step round.
  protected tickShadows(): void {
    const placed = this.roster(null).map(({ id, at }) => ({ id, at }))
    const out = stepShadows(this.valley, this.shadows, placed, this.shadowRng, {
      now: Date.now(),
      dt: 1 / CONFIG.shadowmen.tickHz,
      calm: this.calm,
    })
    if (!out) {
      if (this.ticker !== null) this.stopTicker(this.ticker)
      this.ticker = null
      return
    }
    this.broadcast(out.message, null)
    const { bursts, unmade } = out.message
    if (bursts.length || unmade) void this.spill(bursts, unmade)
    if (out.struck.length === 0) return
    for (const socket of this.ctx.getWebSockets()) {
      const me = this.attachment(socket).me
      if (!me || !out.struck.includes(me.id)) continue
      try {
        send(
          socket,
          out.caught.includes(me.id)
            ? { type: 'struck', by: 'caretaker' }
            : { type: 'struck' }
        )
      } catch {
        // Closing sockets throw; their close handler follows.
      }
    }
  }

  private attachment(ws: WebSocket): Attachment {
    return (
      // A socket with nothing attached has no session, so its hello fails.
      (ws.deserializeAttachment() as Attachment | null) ?? {
        dev: false,
        account: null,
        name: null,
        me: null,
      }
    )
  }

  private context() {
    return { now: Date.now(), present: this.presentIds(null) }
  }

  private async hello(
    ws: WebSocket,
    attachment: Attachment,
    hello: HelloMessage
  ): Promise<void> {
    if (hello.v !== PROTOCOL_VERSION) {
      ws.close(CLOSE.badVersion, `Protocol ${PROTOCOL_VERSION} required`)
      return
    }
    const { account } = attachment
    if (!account) {
      ws.close(CLOSE.unauthenticated, 'Sign in to raid')
      return
    }
    // The username the Worker stamped; checked again, since it is shown to
    // everyone.
    const name = normalizeName(attachment.name ?? '')
    if (!isValidName(name)) {
      ws.close(CLOSE.badName, 'Invalid name')
      return
    }
    // Only the select's roster: an NPC's or a shadowman's outfit is not a
    // raider's to wear.
    if (!isSelectable(hello.outfit)) {
      ws.close(CLOSE.badOutfit, 'Unknown outfit')
      return
    }
    // The pack first: a valley that cannot read it lets no one in to change
    // it.
    let holdings: Holdings
    try {
      holdings = await this.packs().open(account)
    } catch (err) {
      console.error('The pack could not be opened', err)
      ws.close(CLOSE.serverError, 'The valley lost the pack')
      return
    }
    const id = crypto.randomUUID()
    const reduced = reduce(
      this.valley,
      {
        type: 'join',
        id,
        account,
        name,
        outfit: hello.outfit,
        pickups: hello.pickups,
        stations: hello.stations,
        havens: hello.havens,
        metres: hello.metres,
        maze: hello.maze,
        routes: hello.truck,
      },
      { now: Date.now(), present: this.presentIds(ws) }
    )
    if (reduced.reject) {
      ws.close(CLOSE.staleBuild, 'This build placed a different valley')
      return
    }
    await this.apply(reduced)
    const me: PeerWire = { id, name, outfit: hello.outfit, at: null }
    ws.serializeAttachment({ ...attachment, me } satisfies Attachment)
    const world = toWire(this.valley)
    if (!world || !this.valley.members[id]) {
      ws.close(CLOSE.serverError, 'The valley lost the world')
      return
    }
    const now = Date.now()
    send(ws, {
      type: 'welcome',
      id,
      serverNow: now,
      peers: this.roster(ws),
      world,
      place: placeOf(this.valley, account),
      daily: dailyFor(this.valley, account, now),
      pack: holdings.pack,
      cash: holdings.cash,
    })
    this.broadcast({ type: 'peer-joined', peer: me }, ws)
    for (const msg of reduced.broadcast) this.broadcast(msg, ws)
  }

  private state(
    ws: WebSocket,
    attachment: Attachment,
    me: PeerWire,
    state: PeerStateWire
  ): void {
    if (!allow(this.stateRate, ws, STATE_LIMIT)) return
    const { x, y, z, yaw, pitch, pose, riding, light } = state
    const at = { x, y, z, yaw, pitch, pose, riding, light }
    const next: PeerWire = { ...me, at }
    ws.serializeAttachment({ ...attachment, me: next } satisfies Attachment)
    this.broadcast({ type: 'peer-state', id: me.id, ...at }, ws)
  }

  // A chat line to everyone, the sender included. Nothing is stored.
  private chat(ws: WebSocket, me: PeerWire, text: string): void {
    if (!allow(this.chatRate, ws, CHAT_LIMIT)) {
      send(ws, { type: 'nack', re: 'chat', reason: 'too-fast' })
      return
    }
    this.broadcast(
      { type: 'chat', id: me.id, name: me.name, text, at: Date.now() },
      null
    )
  }

  // A new character from Gron, for everyone to see.
  private async restyle(
    ws: WebSocket,
    attachment: Attachment,
    me: PeerWire,
    outfit: string
  ): Promise<void> {
    if (!allow(this.appearanceRate, ws, APPEARANCE_LIMIT)) {
      send(ws, { type: 'nack', re: 'appearance', reason: 'too-fast' })
      return
    }
    if (!isSelectable(outfit)) {
      send(ws, { type: 'nack', re: 'appearance', reason: 'unknown-outfit' })
      return
    }
    await this.reshow(ws, attachment, { ...me, outfit })
  }

  // A new username from Gron. The frame names nothing: the account's
  // username is read from the accounts database, which PUT /auth/username
  // has just changed, so no client can show itself under another name.
  private async rename(
    ws: WebSocket,
    attachment: Attachment,
    me: PeerWire
  ): Promise<void> {
    if (!allow(this.appearanceRate, ws, APPEARANCE_LIMIT)) {
      send(ws, { type: 'nack', re: 'rename', reason: 'too-fast' })
      return
    }
    const account = attachment.account
      ? await this.accounts().get(attachment.account)
      : null
    const name = normalizeName(account?.username ?? '')
    if (!isValidName(name)) {
      send(ws, { type: 'nack', re: 'rename', reason: 'no-username' })
      return
    }
    await this.reshow(ws, { ...attachment, name }, { ...me, name })
  }

  // Stores the raider as now shown, and shows them so to everyone,
  // themselves included.
  private async reshow(
    ws: WebSocket,
    attachment: Attachment,
    me: PeerWire
  ): Promise<void> {
    ws.serializeAttachment({ ...attachment, me } satisfies Attachment)
    await this.apply(
      reduce(
        this.valley,
        { type: 'appearance', id: me.id, name: me.name, outfit: me.outfit },
        this.context()
      )
    )
    this.broadcast({ type: 'peer-updated', peer: me }, null)
  }

  // A world action from one player: run it, persist, answer, tell everyone.
  private async act(ws: WebSocket, action: ValleyAction): Promise<void> {
    const reduced = reduce(this.valley, action, this.context())
    await this.apply(reduced)
    if (reduced.reply) send(ws, reduced.reply)
    if (reduced.daily) send(ws, reduced.daily)
    for (const msg of reduced.broadcast) this.broadcast(msg, null)
    if (reduced.pack) await this.repack(ws, reduced.pack)
    if (reduced.earn) await this.pay(ws, reduced.earn)
  }

  // Dimes taken up (sharedworld.ts rule 11): into the wallet, then the
  // pack and wallet to every socket on the account.
  private async pay(
    ws: WebSocket,
    { account, amount }: { account: string; amount: number }
  ): Promise<void> {
    try {
      await this.packs().earn(account, amount)
    } catch (err) {
      console.error('The dimes could not be paid in', account, amount, err)
    }
    await this.repack(ws, null, account)
  }

  // Each shadowman that burst leaves its dimes where it was (sharedworld.ts
  // rule 11), how many drawn here, so the reducer stays pure, and the
  // Caretaker unmade its gold bullion (rule 13).
  private async spill(bursts: readonly XZ[], unmade: XZ | null): Promise<void> {
    const spills = spillsOf(bursts, unmade, this.shadowRng)
    const reduced = reduce(
      this.valley,
      { type: 'spill', spills },
      this.context()
    )
    await this.apply(reduced)
    for (const msg of reduced.broadcast) this.broadcast(msg, null)
  }

  // A buy, alone: no other frame runs between reading the wallet, judging
  // the sale against it, and paying. A wallet that cannot be read or that
  // does not cover the sale leaves the valley as it was.
  private async purchase(
    ws: WebSocket,
    attachment: Attachment,
    action: Extract<ValleyAction, { type: 'buy' }>
  ): Promise<void> {
    const { account } = attachment
    if (!account) return
    const refuse = (reason: string) => {
      send(ws, {
        type: 'nack',
        re: 'buy',
        reason,
        station: action.station,
        item: action.kind,
      })
    }
    await this.ctx.blockConcurrencyWhile(async () => {
      const packs = this.packs()
      let cash: number
      try {
        cash = (await packs.get(account)).cash
      } catch (err) {
        console.error('The wallet could not be read', err)
        refuse('unavailable')
        return
      }
      const reduced = reduce(this.valley, action, { ...this.context(), cash })
      if (reduced.spend) {
        // The charge and the unit go in together, so a failed write never
        // takes the cash without the item.
        let paid: boolean
        try {
          paid = await packs.purchase(
            account,
            reduced.spend.amount,
            reduced.pack ?? null
          )
        } catch (err) {
          console.error('The sale could not be written', err)
          refuse('unavailable')
          return
        }
        if (!paid) {
          refuse('short')
          return
        }
      }
      await this.apply(reduced)
      if (reduced.reply) send(ws, reduced.reply)
      for (const msg of reduced.broadcast) this.broadcast(msg, null)
      if (reduced.spend) await this.repack(ws, null, account)
      else if (reduced.pack) await this.repack(ws, reduced.pack)
    })
  }

  // A drop, alone (rule 14): the pack gives the units up before the drop
  // stands, so nothing is set down that the pack did not hold. A cabbage
  // comes out of the arms, which are the valley's, and needs no write. The
  // client took the units out of its own pack at once, so every refusal
  // sends the pack as it is to put that right.
  private async setDown(
    ws: WebSocket,
    account: string | null,
    action: Extract<ValleyAction, { type: 'drop' }>
  ): Promise<void> {
    const refuse = async (reason: string) => {
      send(ws, { type: 'nack', re: 'drop', reason })
      await this.repack(ws, null, account ?? undefined)
    }
    if (!allow(this.dropRate, ws, DROP_LIMIT)) {
      await refuse('too-fast')
      return
    }
    await this.ctx.blockConcurrencyWhile(async () => {
      const reduced = reduce(this.valley, action, this.context())
      if (reduced.reply) {
        await refuse(reduced.reply.reason)
        return
      }
      const change = reduced.pack
      if (change) {
        let given: boolean
        try {
          given = await this.packs().change(
            change.account,
            change.kind,
            change.delta
          )
        } catch (err) {
          console.error('The drop could not be written', err)
          await refuse('unavailable')
          return
        }
        if (!given) {
          await refuse('none-left')
          return
        }
      }
      await this.apply(reduced)
      for (const msg of reduced.broadcast) this.broadcast(msg, null)
      if (change) await this.repack(ws, null, change.account)
    })
  }

  // Writes a pack change, if there is one, and sends the account's pack and
  // wallet to every socket signed in to it. A use the pack cannot cover is
  // refused to the actor, who gets the pack too, so a guess made in the
  // meantime is put right.
  private async repack(
    ws: WebSocket,
    change: PackChange | null,
    account = change?.account
  ): Promise<void> {
    if (!account) return
    try {
      const packs = this.packs()
      if (change) {
        const done = await packs.change(account, change.kind, change.delta)
        if (!done) send(ws, { type: 'nack', re: 'use', reason: 'none-left' })
      }
      const { pack, cash } = await packs.get(account)
      for (const socket of this.ctx.getWebSockets()) {
        const attachment = this.attachment(socket)
        if (attachment.account !== account || !attachment.me) continue
        try {
          send(socket, { type: 'pack', pack, cash })
        } catch {
          // Closing sockets throw; their close handler follows.
        }
      }
    } catch (err) {
      console.error('The pack could not be changed', change, err)
    }
  }

  private async left(ws: WebSocket): Promise<void> {
    const attachment = this.attachment(ws)
    const me = attachment.me
    if (!me) return
    // Clear the attachment first so a close that fires twice (close after
    // error) announces the departure once.
    ws.serializeAttachment({ ...attachment, me: null } satisfies Attachment)
    this.broadcast({ type: 'peer-left', id: me.id }, ws)
    // Where they last stood is where they come back (sharedworld.ts
    // rule 2).
    const reduced = reduce(
      this.valley,
      { type: 'leave', id: me.id, at: me.at },
      this.context()
    )
    await this.apply(reduced)
    for (const msg of reduced.broadcast) this.broadcast(msg, ws)
  }

  // Persist the valley and arm the alarm for its next change, or clear it
  // with nobody here to see one.
  private async apply(reduced: Reduced): Promise<void> {
    this.valley = reduced.valley
    await this.ctx.storage.put(VALLEY_KEY, this.valley)
    if (reduced.alarm === null) {
      await this.ctx.storage.deleteAlarm()
    } else {
      await this.ctx.storage.setAlarm(reduced.alarm)
    }
  }

  // Ids of everyone who has said hello, except the socket given.
  private presentIds(exclude: WebSocket | null): string[] {
    return this.roster(exclude).map((peer) => peer.id)
  }

  // Everyone who has said hello, except the socket given.
  private roster(exclude: WebSocket | null): PeerWire[] {
    const peers: PeerWire[] = []
    for (const socket of this.ctx.getWebSockets()) {
      if (socket === exclude) continue
      const other = this.attachment(socket).me
      if (other) peers.push(other)
    }
    return peers
  }

  private broadcast(msg: ServerMessage, exclude: WebSocket | null): void {
    const text = JSON.stringify(msg)
    for (const socket of this.ctx.getWebSockets()) {
      if (socket === exclude || !this.attachment(socket).me) continue
      try {
        socket.send(text)
      } catch {
        // Closing sockets throw; their close handler follows.
      }
    }
  }
}

// A fixed window per socket. Returns false for frames over the cap.
function allow(
  windows: WeakMap<WebSocket, RateWindow>,
  ws: WebSocket,
  limit: RateLimit
): boolean {
  const now = Date.now()
  const window = windows.get(ws)
  if (!window || now - window.startedAt >= limit.ms) {
    windows.set(ws, { startedAt: now, count: 1 })
    return true
  }
  window.count += 1
  return window.count <= limit.count
}

function send(ws: WebSocket, msg: ServerMessage): void {
  ws.send(JSON.stringify(msg))
}
