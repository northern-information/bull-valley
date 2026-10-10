// The valley server: one Durable Object holding everyone who is online and
// the one persistent world they share. Each socket's player lives in its
// attachment (WebSocket Hibernation API), so the object can sleep between
// frames and wake with the roster intact; the world lives in storage and
// survives a restart. Every rule is in src/sharedworld.ts; this is the
// plumbing that reads a frame, runs the reducer, persists, arms the alarm
// for Marx's truck and the day's turn, and sends what came back. Each account's pack and wallet are in D1
// (d1packs.ts): the reducer says what goes in or out, and this writes it
// and tells the account's sockets.
//
// Every change to the valley runs under one lock (`locked`): the reducer
// is run and its result applied with nothing else between, D1 writes
// included, so a buy is paid from the wallet it was judged against, a
// trade with Moab taken from the pack it was judged against, a strike's
// body laid from the pack it emptied (rule 18), a body looted and a move
// to or from the locker (rule 19) done with no unit in two places, and
// the shadowmen's step never lands between a handler's reduce and its
// apply (a step's hit, spill or mend would otherwise be overwritten by a
// valley reduced before it). blockConcurrencyWhile would not do: it holds
// inbound events, not the step's timer. State frames and chat touch no
// valley and never wait on the lock. What is one account's alone (the
// season's tally, rule 15, so an unmaking is counted once; the daily
// task's, rule 16; the Book of Shadows, rule 20) runs under that
// account's own lock (`forAccount`), so no one else's input waits on its
// D1 round trips. XP (rule 22) needs no lock: each account's is added in
// one statement (PackStore.gainXp), whatever lands beside it.
//
// The shadowmen (rule 11) and the Caretaker (rule 13) are stepped here
// CONFIG.shadowmen.tickHz times a second while anyone is placed in the
// valley, and live in memory only. The
// ticking timer keeps the object awake; it stops itself once no one is
// left, and the object can hibernate again.

import { DurableObject } from 'cloudflare:workers'
import { isSelectable } from '../src/characters.ts'
import { CONFIG } from '../src/config.ts'
import { toCosmetics } from '../src/cosmetics.ts'
import { dayKey } from '../src/daily.ts'
import { DAILY_TASK, tallyTask } from '../src/dailytask.ts'
import { spillsOf } from '../src/drops.ts'
import { sameName, whereabouts } from '../src/friends.ts'
import { burialsOf } from '../src/graves.ts'
import { healsOf } from '../src/items.ts'
import { levelOf, levelUp, totals } from '../src/progression.ts'
import {
  CLOSE,
  isValidName,
  normalizeName,
  parseClientMessage,
  PROTOCOL_VERSION,
} from '../src/protocol.ts'
import { mulberry32 } from '../src/rng.ts'
import { SEASON, tally } from '../src/season.ts'
import {
  corpsesOf,
  createShadows,
  createValley,
  dailyFor,
  forecourtMends,
  healthFor,
  placeCaretaker,
  placeOf,
  placeShadowman,
  reduce,
  restoreValley,
  seeHeadlights,
  shadowmenNear,
  stepShadows,
  toWire,
} from '../src/sharedworld.ts'
import { ACCOUNT_HEADER, NAME_HEADER } from './auth.ts'
import { D1AccountStore } from './d1accounts.ts'
import { D1PackStore } from './d1packs.ts'
import type { CosmeticId } from '../src/cosmetics.ts'
import type { TaskProgress } from '../src/dailytask.ts'
import type { FriendRow } from '../src/friends.ts'
import type { Inventory, XZ } from '../src/interfaces.ts'
import type { XpGrant } from '../src/progression.ts'
import type {
  HelloMessage,
  PackMessage,
  PeerStateWire,
  PeerWire,
  SeasonWire,
  ServerMessage,
  TaskWire,
} from '../src/protocol.ts'
import type { SeasonProgress } from '../src/season.ts'
import type {
  PackChange,
  Reduced,
  Valley,
  ValleyAction,
} from '../src/sharedworld.ts'
import type { StandLedger } from '../src/stand.ts'
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
// Where Marx's truck stands, on the state frame's cadence.
const HEADLIGHTS_LIMIT: RateLimit = STATE_LIMIT

// Chat lines one socket may send in ten seconds; the rest are nacked.
const CHAT_LIMIT: RateLimit = { count: 5, ms: 10_000 }

// Friend requests and removals one socket may make in ten seconds.
const FRIEND_LIMIT: RateLimit = { count: 5, ms: 10_000 }

// Changes at Gron one socket may make in ten seconds; each one rebuilds a
// figure for everyone, so the rest are nacked.
const APPEARANCE_LIMIT: RateLimit = { count: 5, ms: 10_000 }
// A trade with Moab: a change to the look, at its pace.
const TRADE_LIMIT: RateLimit = APPEARANCE_LIMIT

// Drops one socket may make in ten seconds; each sends the whole world to
// everyone, so the rest are nacked.
const DROP_LIMIT: RateLimit = { count: 20, ms: 10_000 }
// Every other write to the pack (the locker, the stand): the same pace.
const PACK_LIMIT: RateLimit = DROP_LIMIT

// Discover frames one socket may send in ten seconds; each reads and
// writes D1, so the rest are nacked (the client asks again).
const DISCOVER_LIMIT: RateLimit = { count: 10, ms: 10_000 }

const VALLEY_KEY = 'valley'
// How far round a raider the shadowmen frame reaches: past where their
// own bubble lets one go, so none crosses the edge unseen.
const SHADOW_FRAME_RADIUS = CONFIG.shadowmen.despawnRadius + 40

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
  private headlightsRate = new WeakMap<WebSocket, RateWindow>()
  private chatRate = new WeakMap<WebSocket, RateWindow>()
  private appearanceRate = new WeakMap<WebSocket, RateWindow>()
  private friendRate = new WeakMap<WebSocket, RateWindow>()
  private dropRate = new WeakMap<WebSocket, RateWindow>()
  private discoverRate = new WeakMap<WebSocket, RateWindow>()
  // Rules 11 and 13, in memory only: gone whenever the object sleeps.
  private shadows = createShadows()
  private shadowRng = mulberry32(Math.floor(Math.random() * 2 ** 32))
  // A dev server's quiet valley (the specs'): no crossing shadowman rushes.
  private calm = false
  private ticker: unknown = null
  // When each socket was last heard from, in memory only: a socket missing
  // here (after a wake) counts as heard now.
  private heard = new WeakMap<WebSocket, number>()
  private sweptAt = 0
  // Each socket's attachment as last written, so reading one (every
  // broadcast reads every socket's) is a lookup, not a structured clone;
  // a socket missing here (after a wake) is read from the socket once.
  private attachments = new WeakMap<WebSocket, Attachment>()
  // The valley's lock: the tail of the chain every change waits on.
  private chain: Promise<unknown> = Promise.resolve()
  // Each account's lock, for what is that account's alone.
  private accountChains = new Map<string, Promise<unknown>>()

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
    this.attach(server, attachment)
    return new Response(null, { status: 101, webSocket: client })
  }

  async webSocketMessage(
    ws: WebSocket,
    data: string | ArrayBuffer
  ): Promise<void> {
    this.heard.set(ws, Date.now())
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
    // Where the raider's own last state frame put them, never a frame's
    // word: what the valley holds every reach to (sharedworld.ts).
    const at = me.at ? { x: me.at.x, z: me.at.z } : null
    switch (msg.type) {
      case 'hello':
        ws.close(CLOSE.malformed, 'Already said hello')
        return
      case 'state':
        this.state(ws, attachment, me, msg)
        this.startShadows()
        return
      case 'headlights':
        // Rule 11: where Marx's truck stands, for its headlights.
        if (allow(this.headlightsRate, ws, HEADLIGHTS_LIMIT)) {
          const { x, y, z, heading } = msg
          seeHeadlights(this.shadows, me.at, { x, y, z, heading }, Date.now())
        }
        return
      case 'ping':
        send(ws, { type: 'pong', t: msg.t, serverNow: Date.now() })
        return
      case 'hop-out':
        await this.act(ws, { type: 'hop-out', id: me.id })
        return
      case 'board':
        await this.act(ws, { type: 'board', id: me.id, at })
        return
      case 'take':
        await this.act(ws, { type: 'take', id: me.id, index: msg.index, at })
        return
      case 'buy':
        await this.purchase(ws, attachment, {
          type: 'buy',
          id: me.id,
          station: msg.station,
          kind: msg.kind,
          unit: msg.unit,
          at,
        })
        return
      case 'call':
        await this.act(ws, { type: 'call', id: me.id, from: msg.from, at })
        return
      case 'collect':
        await this.act(ws, { type: 'collect', id: me.id, bush: msg.bush, at })
        return
      case 'use': {
        // Rule 24: medicine that heals gives its points back once the pack
        // has given the unit up.
        const used = await this.act(ws, {
          type: 'use',
          id: me.id,
          kind: msg.kind,
        })
        const heals = healsOf(msg.kind)
        if (used && heals > 0) await this.mend(me.id, heals)
        return
      }
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
        await this.act(ws, { type: 'take-drop', id: me.id, drop: msg.drop, at })
        return
      case 'loot':
        await this.loot(ws, attachment.account, {
          type: 'loot',
          id: me.id,
          corpse: msg.corpse,
          at,
        })
        return
      case 'stow':
      case 'unstow': {
        // At the locker where the raider's own last state frame put them.
        const at = me.at ? { x: me.at.x, z: me.at.z } : null
        await this.restash(ws, attachment.account, {
          type: msg.type,
          id: me.id,
          kind: msg.kind,
          count: msg.count,
          at,
        })
        return
      }
      case 'stand-stock':
      case 'stand-collect':
      case 'stand-upgrade': {
        // Beside the stand where the raider's own last state frame put
        // them.
        const at = me.at ? { x: me.at.x, z: me.at.z } : null
        await this.tend(
          ws,
          attachment.account,
          msg.type === 'stand-stock'
            ? { ...msg, id: me.id, at }
            : { type: msg.type, id: me.id, at }
        )
        return
      }
      case 'trade':
        await this.trade(ws, attachment, {
          type: 'trade',
          id: me.id,
          offer: msg.offer,
        })
        return
      case 'discover':
        await this.discover(ws, attachment.account, msg.entries)
        return
      case 'chat':
        this.chat(ws, me, msg.text)
        return
      case 'whisper':
        this.whisper(ws, attachment, me, msg.to, msg.text)
        return
      case 'friend':
      case 'unfriend':
        await this.befriend(ws, attachment, me, msg.type, msg.name)
        return
      case 'friends':
        if (attachment.account) await this.sendFriends(attachment.account)
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
          placeShadowman(this.shadows, msg.x, msg.z, msg.kind ?? 'man')
          this.startShadows()
          return
        }
        if (msg.op === 'calm') {
          this.calm = true
          return
        }
        if (msg.op === 'grant') {
          const { account } = attachment
          if (!account) return
          await this.repack(ws, { account, kind: msg.kind, delta: msg.count })
          return
        }
        if (msg.op === 'health') {
          const { points } = msg
          await this.locked(async () => {
            const reduced = reduce(
              this.valley,
              { type: 'set-health', id: me.id, points },
              this.context()
            )
            await this.apply(reduced)
            if (reduced.health) {
              this.toAccount(reduced.health.account, {
                type: 'health',
                health: reduced.health.points,
              })
            }
          })
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
    await this.locked(async () => {
      const reduced = reduce(this.valley, { type: 'clock' }, this.context())
      await this.apply(reduced)
      for (const msg of reduced.broadcast) this.broadcast(msg, null)
    })
  }

  // Runs `fn` once every change queued before it has landed, and makes
  // every change queued after wait on it: the valley's lock. A throw
  // inside fails only `fn`; the chain goes on.
  private locked<T>(fn: () => Promise<T>): Promise<T> {
    const run = this.chain.then(fn, fn)
    this.chain = run.catch(() => undefined)
    return run
  }

  // Runs `fn` alone among `account`'s own writes, with no one else's
  // input waiting on it.
  private forAccount<T>(account: string, fn: () => Promise<T>): Promise<T> {
    const before = this.accountChains.get(account) ?? Promise.resolve()
    const run = before.then(fn, fn)
    const after = run
      .catch(() => undefined)
      .then(() => {
        if (this.accountChains.get(account) === after) {
          this.accountChains.delete(account)
        }
      })
    this.accountChains.set(account, after)
    return run
  }

  // Where the accounts are kept; the Worker tests hand in a memory store.
  protected accounts(): AccountStore {
    return (this.d1Accounts ??= new D1AccountStore(this.env.DB))
  }
  private d1Accounts: AccountStore | null = null

  // Where the packs are kept; the Worker tests hand in a memory store.
  protected packs(): PackStore {
    return (this.d1Packs ??= new D1PackStore(this.env.DB))
  }
  private d1Packs: PackStore | null = null

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
    try {
      this.tickShadowsUnguarded()
    } catch (err) {
      // A throw in a timer has no request to fail; say so once a step
      // rather than every tenth of a second.
      if (!this.tickFailed) console.error('The shadowmen could not step', err)
      this.tickFailed = true
    }
  }
  private tickFailed = false

  private tickShadowsUnguarded(): void {
    this.sweep(Date.now())
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
    // Each socket the field round its own raider: the whole of it, to
    // everyone, grows with the raiders squared.
    for (const socket of this.ctx.getWebSockets()) {
      const me = this.attachment(socket).me
      if (!me) continue
      const at = me.at ? { x: me.at.x, z: me.at.z } : null
      try {
        send(socket, shadowmenNear(out.message, at, SHADOW_FRAME_RADIUS))
      } catch {
        // Closing sockets throw; their close handler follows.
      }
    }
    if (out.credited.length > 0) void this.credit(out.credited)
    if (out.burned.length > 0) void this.creditBurns(out.burned)
    if (out.xp.length > 0) void this.award(out.xp)
    const { bursts, unmade } = out.message
    if (bursts.length || unmade) void this.spill(bursts, unmade)
    // Rule 24: a forecourt makes whole.
    for (const id of forecourtMends(this.valley, placed)) {
      void this.mend(id)
    }
    if (out.struck.length === 0) return
    // Rule 24: each account struck loses one point, once however many of
    // its sockets were touched.
    const hit = new Map<string, { id: string; sockets: WebSocket[] }>()
    for (const socket of this.ctx.getWebSockets()) {
      const { account, me } = this.attachment(socket)
      if (!account || !me || !out.struck.includes(me.id)) continue
      const struck = hit.get(account)
      if (struck) struck.sockets.push(socket)
      else hit.set(account, { id: me.id, sockets: [socket] })
    }
    for (const [account, { id, sockets }] of hit) {
      void this.strike(account, id, sockets, out.caught.includes(id))
    }
  }

  // A touch (rule 24): one point off the account. The sockets touched hear
  // they were struck and how much is left, the account's others its
  // health. The last point is rule 18's strike: everything the pack held
  // goes onto a body.
  protected async strike(
    account: string,
    id: string,
    sockets: readonly WebSocket[],
    caught: boolean
  ): Promise<void> {
    await this.locked(() => this.strikeHeld(account, id, sockets, caught))
  }

  private async strikeHeld(
    account: string,
    id: string,
    sockets: readonly WebSocket[],
    caught: boolean
  ): Promise<void> {
    const reduced = reduce(this.valley, { type: 'hit', id }, this.context())
    await this.apply(reduced)
    const change = reduced.health
    if (!change) return
    const health = change.points
    for (const socket of this.ctx.getWebSockets()) {
      const attachment = this.attachment(socket)
      if (attachment.account !== account || !attachment.me) continue
      try {
        if (!sockets.includes(socket)) send(socket, { type: 'health', health })
        else if (caught)
          send(socket, { type: 'struck', by: 'caretaker', health })
        else send(socket, { type: 'struck', health })
      } catch {
        // Closing sockets throw; their close handler follows.
      }
    }
    if (!change.fatal) return
    const me = this.attachment(sockets[0]).me
    const at = me?.at ? { x: me.at.x, z: me.at.z, yaw: me.at.yaw } : null
    await this.fallHeld(account, id, at)
  }

  // Points given back (rule 24): `by` of them, or whole on a forecourt.
  // Every socket on the account hears its health.
  protected async mend(id: string, by?: number): Promise<void> {
    const action: ValleyAction =
      by === undefined ? { type: 'mend', id } : { type: 'mend', id, by }
    await this.locked(async () => {
      const reduced = reduce(this.valley, action, this.context())
      await this.apply(reduced)
      const change = reduced.health
      if (change) {
        this.toAccount(change.account, {
          type: 'health',
          health: change.points,
        })
      }
    })
  }

  // A strike, alone (rule 18): the pack is emptied, then a body laid where
  // the raider fell with everything it held; a body the valley cannot lay
  // gives it all back. Every socket on the account hears the pack after,
  // so the client's own emptying is put right either way.
  protected async fall(
    account: string,
    id: string,
    at: { x: number; z: number; yaw: number } | null
  ): Promise<void> {
    await this.locked(() => this.fallHeld(account, id, at))
  }

  // The fall, with the lock held (a strike's, under its own).
  private async fallHeld(
    account: string,
    id: string,
    at: { x: number; z: number; yaw: number } | null
  ): Promise<void> {
    const packs = this.packs()
    let items: Inventory
    try {
      items = await packs.strip(account)
    } catch (err) {
      console.error('The pack could not be emptied onto a body', err)
      await this.repack(null, null, account)
      return
    }
    const reduced = reduce(
      this.valley,
      { type: 'fall', id, items, at },
      this.context()
    )
    if (reduced.corpse === undefined) {
      try {
        await packs.give(account, items)
      } catch (err) {
        console.error('The pack could not be given back', account, err)
      }
    } else {
      await this.apply(reduced)
      for (const msg of reduced.broadcast) this.broadcast(msg, null)
    }
    await this.repack(null, null, account)
  }

  // A body looted, alone (rule 18): the things go back into the pack before
  // the body is gone, so a failed write leaves it lying with them.
  private async loot(
    ws: WebSocket,
    account: string | null,
    action: Extract<ValleyAction, { type: 'loot' }>
  ): Promise<void> {
    await this.locked(async () => {
      const reduced = reduce(this.valley, action, this.context())
      if (reduced.reply) {
        send(ws, reduced.reply)
        return
      }
      const give = reduced.give
      if (give) {
        try {
          await this.packs().give(give.account, give.items)
        } catch (err) {
          console.error('The body could not be looted', err)
          send(ws, {
            type: 'nack',
            re: 'loot',
            reason: 'unavailable',
            corpse: action.corpse,
          })
          return
        }
      }
      await this.apply(reduced)
      for (const msg of reduced.broadcast) this.broadcast(msg, null)
      if (give) await this.repack(ws, null, give.account)
      else if (account) await this.repack(ws, null, account)
    })
  }

  // Into the locker or out of it, alone (rule 19). The client moved the
  // units at once, so every refusal sends the pack and locker as they are
  // to put that right.
  private async restash(
    ws: WebSocket,
    account: string | null,
    action: Extract<ValleyAction, { type: 'stow' | 'unstow' }>
  ): Promise<void> {
    const refuse = async (reason: string) => {
      send(ws, { type: 'nack', re: action.type, reason })
      await this.repack(ws, null, account ?? undefined)
    }
    if (!allow(this.dropRate, ws, PACK_LIMIT)) {
      await refuse('too-fast')
      return
    }
    await this.locked(async () => {
      const reduced = reduce(this.valley, action, this.context())
      if (reduced.reply) {
        await refuse(reduced.reply.reason)
        return
      }
      const change = reduced.stash
      if (!change) return
      let moved: boolean
      try {
        moved = await this.packs().stow(
          change.account,
          change.kind,
          change.delta
        )
      } catch (err) {
        console.error('The locker could not be written', err)
        await refuse('unavailable')
        return
      }
      if (!moved) {
        await refuse('none-left')
        return
      }
      await this.repack(ws, null, change.account)
    })
  }

  // The account's Cabbage Stand tended, alone (rule 23): no other frame
  // runs between reading the ledger, the pack and the wallet, judging the
  // change against them, and writing all three together. Every socket on
  // the account hears the stand and the pack after.
  private async tend(
    ws: WebSocket,
    account: string | null,
    action: Extract<
      ValleyAction,
      { type: 'stand-stock' | 'stand-collect' | 'stand-upgrade' }
    >
  ): Promise<void> {
    if (!account) return
    const refuse = (reason: string) => {
      send(ws, { type: 'nack', re: action.type, reason })
    }
    if (!allow(this.dropRate, ws, PACK_LIMIT)) {
      refuse('too-fast')
      return
    }
    await this.locked(async () => {
      const packs = this.packs()
      let read: { ledger: StandLedger; rev: number }
      let holdings: Holdings
      try {
        read = await packs.stand(account)
        holdings = await packs.get(account)
      } catch (err) {
        console.error('The stand could not be read', err)
        refuse('unavailable')
        return
      }
      const reduced = reduce(this.valley, action, {
        ...this.context(),
        stand: {
          ledger: read.ledger,
          pack: holdings.pack,
          cash: holdings.cash,
        },
      })
      if (reduced.reply) {
        send(ws, reduced.reply)
        return
      }
      const change = reduced.stand
      if (!change) return
      let written: boolean
      try {
        written = await packs.tend(account, read.rev, change)
      } catch (err) {
        console.error('The stand could not be written', err)
        refuse('unavailable')
        return
      }
      if (!written) {
        refuse('short')
        return
      }
      await this.apply(reduced)
      for (const msg of reduced.broadcast) this.broadcast(msg, null)
      this.toAccount(account, {
        type: 'stand',
        re: change.re,
        stand: change.ledger,
        ...(change.re === 'collect' ? { cents: change.cash } : {}),
      })
      await this.repack(null, null, account)
    })
  }

  private attachment(ws: WebSocket): Attachment {
    const cached = this.attachments.get(ws)
    if (cached) return cached
    const attachment =
      // A socket with nothing attached has no session, so its hello fails.
      (ws.deserializeAttachment() as Attachment | null) ?? {
        dev: false,
        account: null,
        name: null,
        me: null,
      }
    this.attachments.set(ws, attachment)
    return attachment
  }

  // Writes the socket's attachment, where it survives hibernation, and
  // keeps it to read.
  private attach(ws: WebSocket, attachment: Attachment): void {
    ws.serializeAttachment(attachment)
    this.attachments.set(ws, attachment)
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
    // Sockets gone silent are let go here too, since the step that sweeps
    // them runs only while someone is placed.
    this.sweep(Date.now())
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
    let season: SeasonProgress
    let book: string[]
    let task: TaskProgress
    let xp: number
    let stand: StandLedger
    try {
      ;({ holdings, season, book, task, xp, stand } =
        await this.packs().welcome(account, SEASON.id, DAILY_TASK.id))
    } catch (err) {
      console.error('The pack could not be opened', err)
      ws.close(CLOSE.serverError, 'The valley lost the pack')
      return
    }
    const id = crypto.randomUUID()
    const reduced = await this.locked(async () => {
      // A reconnect: the socket this client had may not have closed here
      // yet. Retire it first, so the roster never shows the raider their
      // own ghost.
      if (hello.was) await this.retire(ws, account, hello.was)
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
          water: hello.water,
          maze: hello.maze,
          routes: hello.truck,
          stand: hello.stand,
          bushes: hello.bushes,
        },
        { now: Date.now(), present: this.presentIds(ws) }
      )
      if (!reduced.reject) await this.apply(reduced)
      return reduced
    })
    if (reduced.reject) {
      ws.close(CLOSE.staleBuild, 'This build placed a different valley')
      return
    }
    const me: PeerWire = {
      id,
      name,
      outfit: hello.outfit,
      cosmetics: holdings.cosmetics,
      level: levelOf(xp),
      at: null,
    }
    this.attach(ws, { ...attachment, me })
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
      cosmetics: holdings.cosmetics,
      stash: holdings.stash,
      corpses: corpsesOf(this.valley, account),
      season: seasonWire(season),
      book,
      task: taskWire(task),
      health: healthFor(this.valley, account),
      xp,
      stand,
    })
    this.broadcast({ type: 'peer-joined', peer: me }, ws)
    for (const msg of reduced.broadcast) this.broadcast(msg, ws)
    await this.greetFriends(ws, account, name)
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
    this.attach(ws, { ...attachment, me: next })
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

  // Rule 21: a whisper to the raider signed in as `to`, under the chat
  // rules and its rate, delivered to their sockets and echoed to the
  // sender's. Nothing is stored.
  private whisper(
    ws: WebSocket,
    attachment: Attachment,
    me: PeerWire,
    to: string,
    text: string
  ): void {
    if (!allow(this.chatRate, ws, CHAT_LIMIT)) {
      send(ws, { type: 'nack', re: 'whisper', reason: 'too-fast' })
      return
    }
    const target = this.ctx
      .getWebSockets()
      .map((socket) => this.attachment(socket))
      .find((a) => a.me && a.account && sameName(a.me.name, to))
    if (!target?.me || !target.account) {
      send(ws, { type: 'nack', re: 'whisper', reason: 'not-here' })
      return
    }
    if (target.account === attachment.account) {
      send(ws, { type: 'nack', re: 'whisper', reason: 'self' })
      return
    }
    const line = { from: me.name, to: target.me.name, text, at: Date.now() }
    this.toAccount(target.account, {
      type: 'whisper',
      ...line,
      outgoing: false,
    })
    if (attachment.account) {
      this.toAccount(attachment.account, {
        type: 'whisper',
        ...line,
        outgoing: true,
      })
    }
  }

  // Rule 21: ask `name` to be friends (or accept their asking), or no
  // longer be friends. Both lists go to every socket on both accounts, and
  // the news to the one it is news to.
  private async befriend(
    ws: WebSocket,
    attachment: Attachment,
    me: PeerWire,
    op: 'friend' | 'unfriend',
    name: string
  ): Promise<void> {
    const account = attachment.account
    if (!account) return
    if (!allow(this.friendRate, ws, FRIEND_LIMIT)) {
      send(ws, { type: 'nack', re: op, reason: 'too-fast' })
      return
    }
    try {
      const accounts = this.accounts()
      const other = await accounts.accountByUsername(name)
      if (!other) {
        send(ws, { type: 'nack', re: op, reason: 'unknown' })
        return
      }
      if (op === 'unfriend') {
        if (!(await accounts.unfriend(account, other.accountId))) {
          send(ws, { type: 'nack', re: op, reason: 'not-friends' })
          return
        }
      } else {
        const result = await accounts.askFriend(
          account,
          other.accountId,
          Date.now()
        )
        if (result !== 'requested' && result !== 'accepted') {
          send(ws, { type: 'nack', re: op, reason: result })
          return
        }
        this.toAccount(other.accountId, {
          type: 'friend-news',
          news: result === 'accepted' ? 'accepted' : 'asked',
          name: me.name,
        })
      }
      await this.sendFriends(account)
      await this.sendFriends(other.accountId)
    } catch (err) {
      console.error('The friends list could not be changed', err)
      send(ws, { type: 'nack', re: op, reason: 'server' })
    }
  }

  // Rule 21: the account's list to every socket on it: each name, and for
  // a friend whether they are in the valley and roughly where. A request
  // either way says nothing of where anyone is.
  private async sendFriends(account: string): Promise<void> {
    if (!this.hasSocket(account)) return
    let rows: FriendRow[]
    try {
      rows = await this.accounts().friendsOf(account)
    } catch (err) {
      console.error('The friends list could not be read', err)
      return
    }
    this.listFriends(account, rows)
  }

  private listFriends(account: string, rows: readonly FriendRow[]): void {
    const world = this.valley.world
    this.toAccount(account, {
      type: 'friends',
      friends: rows.map((row) => {
        const here =
          row.state === 'friend' ? this.placedAs(row.accountId) : undefined
        return {
          name: row.username,
          state: row.state,
          online: here !== undefined,
          where: here ? whereabouts(here.at, world) : null,
        }
      }),
    })
  }

  // A raider coming in: their own list, when there is anything on it (the
  // client starts with an empty one), and the news to every friend in the
  // valley, unless this account was already here on another socket.
  private async greetFriends(
    ws: WebSocket,
    account: string,
    name: string
  ): Promise<void> {
    const already = this.ctx.getWebSockets().some((socket) => {
      const a = this.attachment(socket)
      return socket !== ws && a.account === account && a.me !== null
    })
    try {
      const rows = await this.accounts().friendsOf(account)
      if (rows.length > 0) this.listFriends(account, rows)
      if (already) return
      for (const row of rows) {
        if (row.state !== 'friend') continue
        this.toAccount(row.accountId, {
          type: 'friend-news',
          news: 'online',
          name,
        })
      }
    } catch (err) {
      console.error('Friends could not be told', err)
    }
  }

  // Whether any socket on `account` has said hello.
  private hasSocket(account: string): boolean {
    return this.placedAs(account) !== undefined
  }

  // The player of the first socket on `account` that has said hello.
  private placedAs(account: string): PeerWire | undefined {
    for (const socket of this.ctx.getWebSockets()) {
      const a = this.attachment(socket)
      if (a.account === account && a.me) return a.me
    }
    return undefined
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
    this.attach(ws, { ...attachment, me })
    await this.locked(() =>
      this.apply(
        reduce(
          this.valley,
          { type: 'appearance', id: me.id, name: me.name, outfit: me.outfit },
          this.context()
        )
      )
    )
    this.broadcast({ type: 'peer-updated', peer: me }, null)
  }

  // A world action from one player: run it, persist, answer, tell everyone.
  // Whether the pack change the action asked for, if any, was made.
  private act(ws: WebSocket, action: ValleyAction): Promise<boolean> {
    return this.locked(async () => {
      const reduced = reduce(this.valley, action, this.context())
      await this.apply(reduced)
      if (reduced.reply) send(ws, reduced.reply)
      if (reduced.daily) send(ws, reduced.daily)
      for (const msg of reduced.broadcast) this.broadcast(msg, null)
      let changed = !reduced.reply
      if (reduced.pack) changed = await this.repack(ws, reduced.pack)
      if (reduced.earn) await this.pay(ws, reduced.earn)
      return changed
    })
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
  // rule 11), how many drawn here, so the reducer stays pure, and its
  // tombstone, its name drawn here too (rule 17); the Caretaker unmade
  // leaves its gold bullion (rule 13).
  private async spill(bursts: readonly XZ[], unmade: XZ | null): Promise<void> {
    const spills = spillsOf(bursts, unmade, this.shadowRng)
    const burials = burialsOf(bursts, this.shadowRng)
    await this.locked(async () => {
      const reduced = reduce(
        this.valley,
        { type: 'spill', spills, burials },
        this.context()
      )
      await this.apply(reduced)
      for (const msg of reduced.broadcast) this.broadcast(msg, null)
    })
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
    await this.locked(async () => {
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

  // A trade with Moab, alone (rule 14): no other frame runs between
  // reading the pack, judging the trade against it, and writing it. On
  // success the account's sockets get the pack, and everyone sees the
  // cosmetic worn.
  private async trade(
    ws: WebSocket,
    attachment: Attachment,
    action: Extract<ValleyAction, { type: 'trade' }>
  ): Promise<void> {
    const { account } = attachment
    if (!account) return
    const refuse = (reason: string) => {
      send(ws, { type: 'nack', re: 'trade', reason })
    }
    if (!allow(this.appearanceRate, ws, TRADE_LIMIT)) {
      refuse('too-fast')
      return
    }
    await this.locked(async () => {
      const packs = this.packs()
      let holdings: Holdings
      try {
        holdings = await packs.get(account)
      } catch (err) {
        console.error('The pack could not be read', err)
        refuse('unavailable')
        return
      }
      const reduced = reduce(this.valley, action, {
        ...this.context(),
        holdings,
      })
      if (reduced.reply) {
        send(ws, reduced.reply)
        return
      }
      const deal = reduced.trade
      if (!deal) return
      let traded: boolean
      try {
        traded = await packs.trade(account, deal.price, deal.cosmetic)
      } catch (err) {
        console.error('The trade could not be written', err)
        refuse('unavailable')
        return
      }
      if (!traded) {
        refuse('short')
        return
      }
      await this.apply(reduced)
      for (const msg of reduced.broadcast) this.broadcast(msg, null)
      await this.repack(ws, null, account)
      this.rewear(account, [...holdings.cosmetics, deal.cosmetic])
    })
  }

  // Every socket on `account` shown to everyone wearing `cosmetics`.
  private rewear(account: string, cosmetics: CosmeticId[]): void {
    for (const socket of this.ctx.getWebSockets()) {
      const attachment = this.attachment(socket)
      const me = attachment.me
      if (attachment.account !== account || !me) continue
      const next: PeerWire = { ...me, cosmetics: toCosmetics(cosmetics) }
      this.attach(socket, { ...attachment, me: next })
      this.broadcast({ type: 'peer-updated', peer: next }, null)
    }
  }

  // A drop, alone (rule 12): the pack gives the units up before the drop
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
    await this.locked(async () => {
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
  // wallet to every socket signed in to it; whether the change was made. A
  // use the pack cannot cover is refused to the actor, who gets the pack
  // too, so a guess made in the meantime is put right.
  private async repack(
    ws: WebSocket | null,
    change: PackChange | null,
    account = change?.account
  ): Promise<boolean> {
    if (!account) return false
    let done = true
    try {
      const packs = this.packs()
      if (change) {
        done = await packs.change(account, change.kind, change.delta)
        if (!done && ws) {
          send(ws, { type: 'nack', re: 'use', reason: 'none-left' })
        }
      }
      this.toAccount(account, this.packFrame(account, await packs.get(account)))
    } catch (err) {
      console.error('The pack could not be changed', change, err)
      return false
    }
    return done
  }

  // Rule 15: each account credited with unmaking the Caretaker, tallied
  // alone, so two unmakings never read the same progress. Every socket on
  // the account hears the new count, and the pack and wallet when the
  // tally paid the reward.
  private async credit(accounts: readonly string[]): Promise<void> {
    const packs = this.packs()
    await Promise.all(
      accounts.map((account) =>
        this.forAccount(account, async () => {
          try {
            const { progress, reward } = tally(
              await packs.season(account, SEASON.id)
            )
            await packs.score(account, SEASON.id, progress, reward)
            this.toAccount(account, {
              type: 'season',
              season: seasonWire(progress),
              rewarded: reward !== null,
            })
            if (reward) {
              this.toAccount(
                account,
                this.packFrame(account, await packs.get(account))
              )
            }
          } catch (err) {
            console.error('The season could not be tallied', account, err)
          }
        })
      )
    )
  }

  // Rule 20: the entries the raider came across, written in the account's
  // Book of Shadows alone, so two sockets on one account never both call
  // one new. Every socket on the account hears what was new; a frame too
  // soon, or one the book could not take, is nacked, and the client asks
  // again.
  private async discover(
    ws: WebSocket,
    account: string | null,
    entries: readonly string[]
  ): Promise<void> {
    if (!account) return
    if (!allow(this.discoverRate, ws, DISCOVER_LIMIT)) {
      send(ws, { type: 'nack', re: 'discover', reason: 'too-fast' })
      return
    }
    await this.forAccount(account, async () => {
      try {
        const found = await this.packs().discover(account, entries, Date.now())
        if (found.length > 0) this.toAccount(account, { type: 'book', found })
      } catch (err) {
        console.error('The book could not be written', account, err)
        send(ws, { type: 'nack', re: 'discover', reason: 'unwritten' })
      }
    })
  }

  // Rule 16: each account credited with a burn, tallied alone against
  // today's progress, so two burns never read the same count. Every socket
  // on the account hears the new count, and the wallet when the tally paid
  // the day's reward.
  private async creditBurns(accounts: readonly string[]): Promise<void> {
    const packs = this.packs()
    const day = dayKey(Date.now())
    await Promise.all(
      accounts.map((account) =>
        this.forAccount(account, async () => {
          try {
            const { progress, reward } = tallyTask(
              await packs.task(account, DAILY_TASK.id),
              day
            )
            await packs.scoreTask(account, DAILY_TASK.id, progress, reward)
            this.toAccount(account, {
              type: 'task',
              task: taskWire(progress),
              rewarded: reward !== null,
            })
            if (reward) {
              this.toAccount(
                account,
                this.packFrame(account, await packs.get(account))
              )
            }
          } catch (err) {
            console.error('The daily task could not be tallied', account, err)
          }
        })
      )
    )
  }

  // Rule 22: the XP each account earned, added to its own; every socket on
  // the account hears its XP in all, and everyone sees a new level.
  private async award(grants: readonly XpGrant[]): Promise<void> {
    const packs = this.packs()
    for (const [account, gained] of totals(grants)) {
      try {
        const xp = await packs.gainXp(account, gained)
        this.toAccount(account, { type: 'xp', xp, gained })
        const level = levelUp(xp - gained, xp)
        if (level !== null) this.relevel(account, level)
      } catch (err) {
        console.error('The XP could not be written', account, gained, err)
      }
    }
  }

  // Every socket on `account` shown to everyone at `level`. Two grants
  // landing out of order never take a level back.
  private relevel(account: string, level: number): void {
    for (const socket of this.ctx.getWebSockets()) {
      const attachment = this.attachment(socket)
      const me = attachment.me
      if (attachment.account !== account || !me || me.level >= level) continue
      const next: PeerWire = { ...me, level }
      this.attach(socket, { ...attachment, me: next })
      this.broadcast({ type: 'peer-updated', peer: next }, null)
    }
  }

  // The account's pack frame: its holdings, and its bodies lying in the
  // valley.
  private packFrame(account: string, holdings: Holdings): PackMessage {
    const { pack, cash, cosmetics, stash } = holdings
    return {
      type: 'pack',
      pack,
      cash,
      cosmetics,
      stash,
      corpses: corpsesOf(this.valley, account),
    }
  }

  // To every socket signed in to `account` that has said hello.
  private toAccount(account: string, msg: ServerMessage): void {
    for (const socket of this.ctx.getWebSockets()) {
      const attachment = this.attachment(socket)
      if (attachment.account !== account || !attachment.me) continue
      try {
        send(socket, msg)
      } catch {
        // Closing sockets throw; their close handler follows.
      }
    }
  }

  // About once a second, lets go of every socket silent past
  // CONFIG.net.silentMs: a tab gone without a close leaves no ghost. The
  // close is not a refusal, so a client that was only asleep reconnects.
  private sweep(now: number): void {
    if (now - this.sweptAt < 1000) return
    this.sweptAt = now
    for (const socket of this.ctx.getWebSockets()) {
      if (!this.attachment(socket).me) continue
      const heard = this.heard.get(socket)
      if (heard === undefined) {
        this.heard.set(socket, now)
        continue
      }
      if (now - heard <= CONFIG.net.silentMs) continue
      void this.left(socket)
      try {
        socket.close(1001, 'Silent too long')
      } catch {
        // Already closing.
      }
    }
  }

  // The socket that was `id` on `account`, if it is still here, is gone:
  // everyone hears it leave, and it is closed.
  private async retire(
    ws: WebSocket,
    account: string,
    id: string
  ): Promise<void> {
    for (const socket of this.ctx.getWebSockets()) {
      if (socket === ws) continue
      const attachment = this.attachment(socket)
      if (attachment.account !== account || attachment.me?.id !== id) continue
      await this.leftHeld(socket)
      try {
        socket.close(CLOSE.replaced, 'Reconnected')
      } catch {
        // Already closing.
      }
    }
  }

  private async left(ws: WebSocket): Promise<void> {
    if (!this.attachment(ws).me) return
    await this.locked(() => this.leftHeld(ws))
  }

  // The departure, with the lock held.
  private async leftHeld(ws: WebSocket): Promise<void> {
    const attachment = this.attachment(ws)
    const me = attachment.me
    if (!me) return
    // Clear the attachment first so a close that fires twice (close after
    // error) announces the departure once.
    this.attach(ws, { ...attachment, me: null })
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
  // with nobody here to see one; and what the action earned (rule 22).
  private async apply(reduced: Reduced): Promise<void> {
    this.valley = reduced.valley
    await this.ctx.storage.put(VALLEY_KEY, this.valley)
    if (reduced.alarm === null) {
      await this.ctx.storage.deleteAlarm()
    } else {
      await this.ctx.storage.setAlarm(reduced.alarm)
    }
    if (reduced.xp) void this.award(reduced.xp)
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

function seasonWire(progress: SeasonProgress): SeasonWire {
  return { season: SEASON.id, ...progress }
}

function taskWire(progress: TaskProgress): TaskWire {
  return { task: DAILY_TASK.id, ...progress }
}

function send(ws: WebSocket, msg: ServerMessage): void {
  ws.send(JSON.stringify(msg))
}
