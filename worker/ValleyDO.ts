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
// season's tally, rule 15, so a burning is counted once; the daily
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
import { GIFTS } from '../src/book.ts'
import { isSelectable, mayRaidAs } from '../src/characters.ts'
import { CONFIG } from '../src/config.ts'
import { toCosmetics } from '../src/cosmetics.ts'
import { crewWire, isValidCrewName, isValidTag, showTag } from '../src/crews.ts'
import { dayKey } from '../src/daily.ts'
import { DAILY_TASK, tallyTask } from '../src/dailytask.ts'
import { spillsOf } from '../src/drops.ts'
import { sameName, whereabouts } from '../src/friends.ts'
import { burialsOf } from '../src/graves.ts'
import {
  DATA_BASE,
  readHeightGrid,
  valleyGround,
  valleyStairs,
} from '../src/heightmap.ts'
import { cardOf } from '../src/inspect.ts'
import { healsOf } from '../src/items.ts'
import { listingFor, saveRefusal } from '../src/laptop.ts'
import { partyOf, standing as partyStanding, partyWire } from '../src/party.ts'
import { levelOf, levelUp, totals } from '../src/progression.ts'
import {
  CLOSE,
  isValidName,
  normalizeName,
  parseClientMessage,
  PROTOCOL_VERSION,
} from '../src/protocol.ts'
import { isQuest } from '../src/quests.ts'
import { emptyOf } from '../src/recycling.ts'
import { mulberry32 } from '../src/rng.ts'
import { SEASON, tally } from '../src/season.ts'
import {
  citgoVisits,
  createShadows,
  forecourtMends,
  phoneVisits,
  placeCaretaker,
  placeShadowman,
  seeHeadlights,
  shadowmenNear,
  stepShadows,
} from '../src/shadowstep.ts'
import {
  anglerFor,
  citgosFor,
  corpsesOf,
  createValley,
  dailyFor,
  findsPay,
  giftsOwed,
  healthFor,
  inTheBed,
  maxFor,
  placeOf,
  reduce,
  restoreValley,
  toWire,
  wardsFor,
  waypointsFor,
} from '../src/sharedworld.ts'
import { ACCOUNT_HEADER, NAME_HEADER } from './auth.ts'
import { D1AccountStore } from './d1accounts.ts'
import { D1CrewStore } from './d1crews.ts'
import { D1PackStore } from './d1packs.ts'
import type { CosmeticId } from '../src/cosmetics.ts'
import type { CrewRow } from '../src/crews.ts'
import type { TaskProgress } from '../src/dailytask.ts'
import type { Facing } from '../src/drops.ts'
import type { ExpeditionRun } from '../src/expeditions.ts'
import type { FriendRow } from '../src/friends.ts'
import type { HeightAt, Inventory, XZ } from '../src/interfaces.ts'
import type { MazePlace } from '../src/maze.ts'
import type { XpGrant } from '../src/progression.ts'
import type {
  ClientMessage,
  CrewNewsMessage,
  DialMessage,
  HelloMessage,
  NackMessage,
  PackMessage,
  PartyWire,
  PeerStateWire,
  PeerWire,
  SeasonWire,
  ServerMessage,
  TaskWire,
} from '../src/protocol.ts'
import type { QuestId, QuestStage, QuestStages } from '../src/quests.ts'
import type { Research } from '../src/recycling.ts'
import type { SeasonProgress } from '../src/season.ts'
import type { StairPath } from '../src/shadowclimb.ts'
import type { ShadeKind, TruckPose } from '../src/shadowmen.ts'
import type {
  PackChange,
  Reduced,
  Valley,
  ValleyAction,
  ValleyContext,
} from '../src/sharedworld.ts'
import type { StandLedger } from '../src/stand.ts'
import type { ShadowHit } from '../src/wards.ts'
import type { Account, AccountStore } from './accounts.ts'
import type { CrewStore, Parted } from './crews.ts'
import type { ExpeditionRead, Holdings, PackStore } from './packs.ts'

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

// Inspects one socket may make in ten seconds; each reads D1 six ways.
const INSPECT_LIMIT: RateLimit = { count: 10, ms: 10_000 }

// The laptop's frames one socket may send in ten seconds (rule 31):
// opening folders and files, and saving.
const LAPTOP_LIMIT: RateLimit = { count: 20, ms: 10_000 }

// Changes of character at Moab one socket may make in ten seconds; each
// one rebuilds a figure for everyone, so the rest are nacked.
const APPEARANCE_LIMIT: RateLimit = { count: 5, ms: 10_000 }
// A trade with Moab: a change to the look, at its pace.
const TRADE_LIMIT: RateLimit = APPEARANCE_LIMIT

// Drops one socket may make in ten seconds; each sends the whole world to
// everyone, so the rest are nacked.
const DROP_LIMIT: RateLimit = { count: 20, ms: 10_000 }
// Every other write to the pack (the locker, the stand): the same pace.
const PACK_LIMIT: RateLimit = DROP_LIMIT

// Waypoint frames one socket may send in ten seconds (rule 37): a pin at
// a click, so the rest are nacked.
const MARK_LIMIT: RateLimit = { count: 20, ms: 10_000 }

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

// The Worker's own assets answer any origin; a dev server's (Vite, behind
// the binding) refuses a host it does not know, so ask as localhost.
const ASSET_ORIGIN = 'http://localhost'

function samePlace(a: MazePlace | null, b: MazePlace | null): boolean {
  if (!a || !b) return a === b
  return a.x === b.x && a.z === b.z && a.yaw === b.yaw
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
  private laptopRate = new WeakMap<WebSocket, RateWindow>()
  private inspectRate = new WeakMap<WebSocket, RateWindow>()
  private dropRate = new WeakMap<WebSocket, RateWindow>()
  // Rule 2: when and where each socket's place was last kept, and
  // whether the valley had it in the bed at its last state frame.
  private placeKept = new WeakMap<
    WebSocket,
    { t: number; x: number; z: number }
  >()
  private rode = new WeakMap<WebSocket, boolean>()
  private discoverRate = new WeakMap<WebSocket, RateWindow>()
  private markRate = new WeakMap<WebSocket, RateWindow>()
  // Rules 11 and 13, in memory only: gone whenever the object sleeps.
  private shadows = createShadows()
  private shadowRng = mulberry32(Math.floor(Math.random() * 2 ** 32))
  // A dev server's quiet valley (the specs'): no crossing shadowman rushes.
  private calm = false
  // Rule 11: the terrain as the map has it, read from the Worker's own
  // assets once a wake (null until then, and for good if it cannot be),
  // and the ground the shadowmen walk, with the world's moat cut in and
  // its fire escapes hung.
  private terrain: HeightAt | null = null
  private reading: Promise<void> | null = null
  private ground: {
    moat: MazePlace | null
    at: HeightAt
    stairs: StairPath[]
  } | null = null
  private ticker: unknown = null
  // Steps since a forecourt last gave back its share (rule 24).
  private forecourtSteps = 0
  // When each socket was last heard from, in memory only: a socket missing
  // here (after a wake) counts as heard now.
  private heard = new WeakMap<WebSocket, number>()
  // Sockets whose hello is still reading D1: a second hello on one of them
  // meanwhile is dropped, or both would join and the first stay a ghost.
  private greeting = new WeakSet<WebSocket>()
  // Raiders whose socket went, still standing for everyone else until
  // CONFIG.net.lingerMs is up (then everyone hears them leave), so a
  // reconnect that names one of its own takes it back unseen. In memory
  // only: the pending timer keeps the object awake.
  private lingering = new Map<
    string,
    { account: string; me: PeerWire; timer: unknown }
  >()
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
    const { me } = attachment
    if (me) {
      await this.frame(ws, attachment, me, msg)
    } else if (msg.type === 'hello' || msg.type === 'dial') {
      if (this.greeting.has(ws)) return
      this.greeting.add(ws)
      try {
        await this.hello(ws, attachment, msg)
      } finally {
        this.greeting.delete(ws)
      }
    } else {
      ws.close(CLOSE.malformed, 'Expected hello first')
    }
  }

  // One frame from a raider who has said hello, by its type: each is the
  // valley's action, or a method of its own below. Every reach is held to
  // where the raider's own last state frame put them, never to a frame's
  // word (sharedworld.ts).
  private async frame(
    ws: WebSocket,
    attachment: Attachment,
    me: PeerWire,
    msg: ClientMessage
  ): Promise<void> {
    const { id } = me
    const { account } = attachment
    const at = standing(me)
    switch (msg.type) {
      case 'hello':
      case 'dial':
        ws.close(CLOSE.malformed, 'Already said hello')
        return
      case 'state':
        // Rule 29: dialed in, never placed.
        if (me.dialup) return
        this.state(ws, attachment, me, msg)
        this.startShadows()
        return
      case 'headlights':
        if (me.dialup) return
        this.headlights(ws, me, msg)
        return
      case 'ping':
        send(ws, { type: 'pong', t: msg.t, serverNow: Date.now() })
        return
      case 'hop-out': {
        const aboard = inTheBed(this.valley, id)
        await this.act(ws, { type: 'hop-out', id })
        // Rule 2: where they land is kept with their next frame.
        if (aboard && !inTheBed(this.valley, id)) this.rode.set(ws, true)
        return
      }
      case 'board':
        await this.act(ws, { type: 'board', id, at })
        return
      case 'charter':
        await this.act(ws, { type: 'charter', id, to: msg.to })
        return
      case 'take':
        await this.act(ws, { type: 'take', id, index: msg.index, at })
        return
      case 'buy':
        await this.purchase(ws, attachment, { ...msg, id, at })
        return
      case 'call':
        // Rule 38: the whistle is read out of the pack.
        await this.withPack(ws, account, {
          type: 'call',
          id,
          from: msg.from,
          at,
        })
        return
      case 'collect':
        await this.act(ws, { type: 'collect', id, bush: msg.bush, at })
        return
      case 'use':
        await this.use(ws, id, msg.kind)
        return
      case 'pass':
        await this.pass(ws, me, msg.kind, msg.to)
        return
      case 'drop':
        await this.setDown(ws, account, { ...msg, id, at: facing(me) })
        return
      case 'take-drop':
        await this.takeDrop(ws, account, {
          type: 'take-drop',
          id,
          drop: msg.drop,
          at,
          roll: this.roll(),
        })
        return
      case 'portal':
        // Rule 28: ahead of the raider, the way they face; rule 38: the
        // phone is read out of the pack.
        await this.withPack(ws, account, {
          type: 'open-portal',
          id,
          at: facing(me),
        })
        return
      case 'loot':
        await this.loot(ws, account, { ...msg, id, at })
        return
      case 'fall':
        // Rule 24: landed hard, by the client's word.
        if (account) await this.plunge(ws, account, id, msg.height)
        return
      case 'stow':
      case 'unstow':
        await this.restash(ws, account, { ...msg, id, at })
        return
      case 'stand-stock':
      case 'stand-collect':
      case 'stand-upgrade':
        await this.tend(ws, account, { ...msg, id, at })
        return
      case 'research':
        if (account) await this.sendResearch(ws, account)
        return
      case 'recycle':
        await this.recycle(ws, account, { ...msg, id, at })
        return
      // Rule 36.
      case 'angler':
        if (account) {
          send(ws, {
            type: 'angler',
            angler: anglerFor(this.valley, account, Date.now()),
          })
        }
        return
      case 'tackle':
        await this.withPack(ws, account, { type: 'tackle', id, at })
        return
      case 'jar-slurm':
        await this.withPack(ws, account, { ...msg, id, at })
        return
      // Rule 39.
      case 'toolbox':
        await this.withPack(ws, account, { type: 'toolbox', id, at })
        return
      // Rule 41.
      case 'thread':
        await this.act(ws, { type: 'thread', id, film: msg.film, at })
        return
      case 'torch':
        await this.withPack(ws, account, {
          type: 'torch',
          id,
          index: msg.index,
          at,
          roll: this.roll(),
        })
        return
      case 'cast':
        await this.withPack(ws, account, {
          type: 'cast',
          id,
          bait: msg.bait,
          at,
          roll: this.roll(),
          seed: Math.floor(this.roll() * 2 ** 32),
        })
        return
      case 'dig':
        await this.act(ws, { type: 'dig', id, at, roll: this.roll() })
        return
      case 'reel':
        await this.act(ws, {
          type: 'reel',
          id,
          landed: msg.landed,
          roll: this.roll(),
          bonus: this.roll(),
          skillRoll: this.roll(),
        })
        return
      case 'expedition-send':
        await this.expedition(ws, account, {
          ...msg,
          id,
          seed: Math.floor(this.roll() * 2 ** 32),
        })
        return
      case 'expedition-claim':
        await this.expedition(ws, account, { ...msg, id })
        return
      case 'trade':
        await this.trade(ws, attachment, { ...msg, id })
        return
      case 'quest':
        // Beside Erwin, or at the heart of the maze.
        await this.questStep(ws, attachment, { ...msg, id, at })
        return
      case 'deal':
        await this.barter(ws, attachment, { ...msg, id, at })
        return
      // Rule 40: written as a barter is.
      case 'cook':
        await this.barter(ws, attachment, { ...msg, id, at })
        return
      case 'discover':
        await this.discover(ws, account, msg.entries)
        return
      case 'waypoints':
        await this.mark(ws, id, msg.points)
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
        if (account) await this.sendFriends(account)
        return
      case 'inspect':
        if (account) await this.inspect(ws, account, msg.name)
        return
      case 'invite':
        if (!allow(this.friendRate, ws, FRIEND_LIMIT)) {
          send(ws, { type: 'nack', re: 'invite', reason: 'too-fast' })
          return
        }
        await this.act(ws, { type: 'invite', id, name: msg.name })
        return
      case 'party-leave':
        await this.act(ws, { type: 'party-leave', id })
        return
      case 'party-chat':
        this.partyChat(ws, attachment, me, msg.text)
        return
      case 'crew-create':
      case 'crew-invite':
      case 'crew-join':
      case 'crew-leave':
      case 'crew-kick':
        await this.crewAct(ws, attachment, me, msg)
        return
      case 'crew-chat':
        await this.crewChat(ws, attachment, me, msg.text)
        return
      case 'laptop-list':
      case 'laptop-read':
      case 'laptop-save':
      case 'laptop-delete':
        await this.laptop(ws, msg, id, at)
        return
      case 'appearance':
        await this.restyle(ws, attachment, me, msg.outfit)
        return
      case 'rename':
        await this.rename(ws, attachment, me)
        return
      case 'dev':
        if (attachment.dev) {
          await this.dev(ws, account, id, msg)
        } else {
          send(ws, { type: 'nack', re: 'dev', reason: 'not-a-dev-server' })
        }
        return
    }
  }

  // Rule 11: where Marx's truck stands, for its headlights.
  private headlights(ws: WebSocket, me: PeerWire, pose: TruckPose): void {
    if (!allow(this.headlightsRate, ws, HEADLIGHTS_LIMIT)) return
    const { x, y, z, heading } = pose
    seeHeadlights(this.shadows, me.at, { x, y, z, heading }, Date.now())
  }

  // Rules 24, 27 and 32: once the pack has given the unit up, it doses the
  // wards, gives its share of geometrie back, and leaves its empty.
  // All under one lock, so no strike lands between the unit going and its
  // dose: a raider shattered in between is never dosed after.
  private use(ws: WebSocket, id: string, kind: string): Promise<void> {
    return this.locked(async () => {
      const used = await this.actHeld(ws, { type: 'use', id, kind })
      if (!used) return
      await this.doseHeld({ type: 'dose', id, kind })
      if (healsOf(kind, 100) > 0) await this.mendHeld(id, kind)
      await this.emptyHeld(ws, id, kind)
    })
  }

  // Rule 32: what the unit of `kind` just out of `id`'s pack leaves there,
  // judged from what the pack holds now. Nothing is read for a kind that
  // never leaves anything.
  // Held: the caller has the valley's lock.
  private async emptyHeld(
    ws: WebSocket,
    id: string,
    kind: string
  ): Promise<void> {
    const account = this.valley.members[id]?.account
    if (!account || emptyOf(kind, 0) === null) return
    let left: number
    try {
      left = (await this.packs().get(account)).pack[kind] ?? 0
    } catch (err) {
      console.error('The pack could not be read for its empty', kind, err)
      return
    }
    await this.actHeld(ws, { type: 'empty', id, kind, left })
  }

  // The dev server's frames, for the specs (the Worker stamped the socket).
  private async dev(
    ws: WebSocket,
    account: string | null,
    id: string,
    msg: DevMessage
  ): Promise<void> {
    switch (msg.op) {
      case 'shadowman':
        placeShadowman(this.shadows, msg.x, msg.z, msg.kind ?? 'man')
        this.startShadows()
        return
      case 'caretaker':
        placeCaretaker(this.valley, this.shadows, msg.x, msg.z)
        this.startShadows()
        return
      case 'calm':
        this.calm = true
        return
      case 'grant':
        if (account) {
          await this.repack(ws, { account, kind: msg.kind, delta: msg.count })
        }
        return
      case 'earn':
        if (account) {
          await this.packs().earn(account, msg.cents)
          await this.repack(ws, null, account)
        }
        return
      case 'health':
        await this.setHealth(id, msg.points)
        return
      case 'hurry':
        await this.act(ws, { type: 'hurry', seconds: msg.seconds })
        return
      case 'reset':
        this.shadows = createShadows()
        await this.act(ws, { type: 'reset' })
        return
    }
  }

  // The account at `points` of health, for the specs (rule 24).
  private async setHealth(id: string, points: number): Promise<void> {
    await this.locked(async () => {
      const reduced = reduce(
        this.valley,
        { type: 'set-health', id, points },
        this.context()
      )
      await this.apply(reduced)
      if (reduced.health) this.tellHealth(reduced.health)
    })
  }

  // Rule 24: every socket on the account hears its geometrie.
  private tellHealth({
    account,
    points,
    max,
  }: {
    account: string
    points: number
    max: number
  }): void {
    this.toAccount(account, { type: 'health', health: points, max })
    this.tellPeersHealth(account, points, max)
  }

  // Rule 24: everyone in the valley hears an account's geometrie, once for
  // each of its sockets, so every raider sees every other's bar.
  private tellPeersHealth(account: string, health: number, max: number): void {
    for (const socket of this.ctx.getWebSockets()) {
      const attachment = this.attachment(socket)
      const me = attachment.me
      if (attachment.account !== account || !me) continue
      this.broadcast({ type: 'peer-health', id: me.id, health, max }, null)
    }
  }

  // A peer as everyone is shown it: its geometrie stamped on from the
  // valley's wounds (rule 24), which the socket's own record never holds.
  private shown(me: PeerWire, account: string | null): PeerWire {
    if (!account) return me
    return {
      ...me,
      health: healthFor(this.valley, account),
      max: maxFor(this.valley, account),
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
  // Rule 35: the crews, on the same D1.
  protected crews(): CrewStore {
    return (this.d1Crews ??= new D1CrewStore(this.env.DB))
  }
  private d1Crews: CrewStore | null = null

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
      this.tickFailed = false
    } catch (err) {
      // A throw in a timer has no request to fail; say so once for a run
      // of failing steps rather than every tenth of a second, and again
      // for the next run after a step goes through.
      if (!this.tickFailed) console.error('The shadowmen could not step', err)
      this.tickFailed = true
    }
  }
  private tickFailed = false

  // Rule 11: the ground the shadowmen walk, or null while the terrain is
  // still being read (the first step asks for it).
  private groundNow(): HeightAt | null {
    if (!this.terrain) {
      this.readTerrain()
      return null
    }
    const moat = this.valley.world?.moat ?? null
    if (!this.ground || !samePlace(this.ground.moat, moat)) {
      this.ground = {
        moat,
        at: valleyGround(this.terrain, moat),
        stairs: valleyStairs(this.terrain, moat),
      }
    }
    return this.ground.at
  }

  private readTerrain(): void {
    const assets = (this.env as Partial<Env>).ASSETS
    if (this.reading || !assets) return
    const get = async (file: string) => {
      const res = await assets.fetch(`${ASSET_ORIGIN}${DATA_BASE}/${file}`)
      if (!res.ok) throw new Error(`${file}: ${res.status}`)
      return res
    }
    this.reading = (async () => {
      const [png, geo] = await Promise.all([
        get('terrain.png').then((r) => r.arrayBuffer()),
        get('geo.json').then((r) => r.text()),
      ])
      this.terrain = (await readHeightGrid(new Uint8Array(png), geo)).raw
    })().catch((err: unknown) => {
      // Flat until the next wake: every shadow reaches every height.
      console.error('The valley could not read its ground', err)
    })
  }

  private tickShadowsUnguarded(): void {
    this.sweep(Date.now())
    const placed = this.roster(null).map(({ id, at }) => ({ id, at }))
    const out = stepShadows(this.valley, this.shadows, placed, this.shadowRng, {
      now: Date.now(),
      dt: 1 / CONFIG.shadowmen.tickHz,
      calm: this.calm,
      ground: this.groundNow(),
      stairs: this.ground?.stairs ?? [],
    })
    if (!out) {
      if (this.ticker !== null) this.stopTicker(this.ticker)
      this.ticker = null
      return
    }
    // Each socket the field round its own raider: the whole of it, to
    // everyone, grows with the raiders squared.
    // A phone dialed in (rule 29) has no body to draw them round.
    for (const socket of this.ctx.getWebSockets()) {
      const me = this.attachment(socket).me
      if (!me || me.dialup) continue
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
    // The tunnel shades burst into dimes too, but leave no stones: only a
    // shadowman is buried.
    const { burned, tunnelBursts } = out.message
    const bursts = [
      ...out.message.bursts,
      ...tunnelBursts.map(({ x, z }) => ({ x, z })),
    ]
    if (bursts.length || burned) {
      void this.spill(bursts, out.message.bursts, burned)
    }
    // Rule 24: a forecourt gives back its share every few seconds.
    const every = CONFIG.health.forecourt.everySeconds * CONFIG.shadowmen.tickHz
    if (++this.forecourtSteps >= every) {
      this.forecourtSteps = 0
      for (const id of forecourtMends(this.valley, placed)) {
        void this.mend(id)
      }
    }
    // Rule 28: a Citgo stood at is written in the account's log.
    for (const { id, station } of citgoVisits(this.valley, placed)) {
      void this.visit(id, station)
    }
    for (const { id, phone } of phoneVisits(this.valley, placed)) {
      void this.findPhone(id, phone)
    }
    if (out.struck.length === 0) return
    // Rule 24: each account struck takes its hit, once however many of its
    // sockets were touched.
    const hit = new Map<string, { id: string; sockets: WebSocket[] }>()
    for (const socket of this.ctx.getWebSockets()) {
      const { account, me } = this.attachment(socket)
      if (!account || !me || !out.struck.includes(me.id)) continue
      const struck = hit.get(account)
      if (struck) struck.sockets.push(socket)
      else hit.set(account, { id: me.id, sockets: [socket] })
    }
    for (const [account, { id, sockets }] of hit) {
      void this.strike(account, id, sockets, out.strikers[id] ?? 'man')
    }
  }

  // A touch (rule 24): the shadow's hit off the account, cut by its wards.
  // The sockets touched hear they were struck, by what, for how much and
  // how much is left, the account's others its geometrie. The last of it
  // is rule 18's strike: everything the pack held goes onto a body.
  protected async strike(
    account: string,
    id: string,
    sockets: readonly WebSocket[],
    by: ShadowHit
  ): Promise<void> {
    await this.locked(() => this.strikeHeld(account, id, sockets, by))
  }

  // A fall (rule 24): landed from `height` metres, by the socket's word,
  // heard like a touch, on that socket alone.
  private async plunge(
    ws: WebSocket,
    account: string,
    id: string,
    height: number
  ): Promise<void> {
    await this.locked(() =>
      this.hurtHeld(account, id, [ws], { type: 'plunge', id, height })
    )
  }

  private async strikeHeld(
    account: string,
    id: string,
    sockets: readonly WebSocket[],
    by: ShadowHit
  ): Promise<void> {
    await this.hurtHeld(account, id, sockets, {
      type: 'hit',
      id,
      by,
      roll: this.roll(),
    })
  }

  // A hit or a fall off the account, with the lock held.
  private async hurtHeld(
    account: string,
    id: string,
    sockets: readonly WebSocket[],
    action: Extract<ValleyAction, { type: 'hit' | 'plunge' }>
  ): Promise<void> {
    const reduced = reduce(this.valley, action, this.context())
    await this.apply(reduced)
    const change = reduced.health
    if (!change?.hit) return
    const { points: health, max } = change
    const { by, damage, warded } = change.hit
    for (const socket of this.ctx.getWebSockets()) {
      const attachment = this.attachment(socket)
      if (attachment.account !== account || !attachment.me) continue
      try {
        if (!sockets.includes(socket)) {
          send(socket, { type: 'health', health, max })
        } else {
          send(socket, { type: 'struck', by, damage, warded, health, max })
        }
      } catch {
        // Closing sockets throw; their close handler follows.
      }
    }
    this.tellPeersHealth(account, health, max)
    this.tellWards(reduced)
    if (!change.fatal) return
    const me = this.attachment(sockets[0]).me
    await this.fallHeld(account, id, me ? facing(me) : null)
  }

  // Rule 24's draw for a touch's spread; the Worker tests replace it.
  protected roll(): number {
    return Math.random()
  }

  // Rule 27: every socket on each account dosed hears its wards.
  private tellWards(reduced: Reduced): void {
    for (const { account, levels } of reduced.wards ?? []) {
      this.toAccount(account, { type: 'wards', wards: levels })
    }
  }

  // Rule 27: a use or a pass, once the pack gave the unit up, doses.
  // Held: the caller has the valley's lock.
  private async doseHeld(
    action: Extract<ValleyAction, { type: 'dose' }>
  ): Promise<void> {
    const reduced = reduce(this.valley, action, this.context())
    await this.apply(reduced)
    this.tellWards(reduced)
  }

  // Rule 27: a unit passed to the raider `to` (a peer id), both where
  // their own last state frames put them. Once the giver's pack gives it
  // up, the taker is dosed in full and given its heal, the giver dosed
  // their share, and both sides hear who and what.
  private async pass(
    ws: WebSocket,
    me: PeerWire,
    kind: string,
    to: string
  ): Promise<void> {
    let taker: PeerWire | null = null
    for (const socket of this.ctx.getWebSockets()) {
      const other = this.attachment(socket).me
      if (other?.id === to) taker = other
    }
    const spot = (peer: PeerWire | null) =>
      peer?.at ? { x: peer.at.x, z: peer.at.z } : null
    // The check, the giver's pack, the doses and the heal together, alone
    // in the valley, so no strike lands between them.
    const passed = await this.locked(async () => {
      const reduced = reduce(
        this.valley,
        {
          type: 'pass',
          id: me.id,
          to,
          kind,
          from: spot(me),
          at: spot(taker),
        },
        this.context()
      )
      await this.apply(reduced)
      if (reduced.reply) send(ws, reduced.reply)
      const { passed, pack } = reduced
      if (!passed || !pack) return null
      if (!(await this.repack(ws, pack, pack.account, 'pass'))) return null
      await this.doseHeld({ type: 'dose', id: me.id, kind, to })
      if (healsOf(kind, 100) > 0) await this.mendHeld(to, kind)
      await this.emptyHeld(ws, me.id, kind)
      return { taker: passed.account, giver: pack.account }
    })
    if (!passed || !taker) return
    this.toAccount(passed.taker, { type: 'passed', kind, from: me.name })
    this.toAccount(passed.giver, { type: 'passed', kind, to: taker.name })
  }

  // A raider stands at a Citgo (rule 28): every socket on the account hears
  // its Citgos when the log changed.
  protected async visit(id: string, station: number): Promise<void> {
    await this.locked(async () => {
      const reduced = reduce(
        this.valley,
        { type: 'visit', id, station },
        this.context()
      )
      // The first time at this Citgo pays its bounty, written before the
      // log that says it was found: a write that fails leaves the Citgo
      // unfound, and the next step's visit pays it then.
      if ((await this.write(undefined, reduced.earn)) !== 'done') return
      await this.apply(reduced)
      const change = reduced.citgos
      if (change) {
        this.toAccount(change.account, { type: 'citgos', citgos: change.log })
      }
      if (reduced.earn) await this.repack(null, null, reduced.earn.account)
    })
  }

  // The raider's waypoints, all of them (rule 37): every socket on the
  // account hears the ones the valley kept.
  private async mark(
    ws: WebSocket,
    id: string,
    points: readonly XZ[]
  ): Promise<void> {
    if (!allow(this.markRate, ws, MARK_LIMIT)) {
      send(ws, { type: 'nack', re: 'waypoints', reason: 'too-fast' })
      return
    }
    await this.locked(async () => {
      const reduced = reduce(
        this.valley,
        { type: 'mark', id, points },
        this.context()
      )
      await this.apply(reduced)
      const kept = reduced.waypoints
      if (kept) {
        this.toAccount(kept.account, { type: 'waypoints', points: kept.points })
      }
    })
  }

  // A raider finds a payphone (rule 28): every socket on the account hears
  // its Citgos, the payphone with them.
  protected async findPhone(id: string, phone: number): Promise<void> {
    await this.locked(async () => {
      const reduced = reduce(
        this.valley,
        { type: 'find-phone', id, phone },
        this.context()
      )
      await this.apply(reduced)
      const change = reduced.citgos
      if (change) {
        this.toAccount(change.account, { type: 'citgos', citgos: change.log })
      }
    })
  }

  // Geometrie given back (rule 24): a use of `kind`'s share, or the
  // forecourt's. Every socket on the account hears it.
  protected mend(id: string, kind?: string): Promise<void> {
    return this.locked(() => this.mendHeld(id, kind))
  }

  // Held: the caller has the valley's lock.
  private async mendHeld(id: string, kind?: string): Promise<void> {
    const action: ValleyAction =
      kind === undefined ? { type: 'mend', id } : { type: 'mend', id, kind }
    const reduced = reduce(this.valley, action, this.context())
    await this.apply(reduced)
    if (reduced.health) this.tellHealth(reduced.health)
  }

  // A strike, alone (rule 18): the pack is emptied, then a body laid where
  // the raider fell with everything it held, in place of any body the
  // account had (what that held is lost); a body the valley cannot lay
  // gives it all back. Every socket on the account hears the pack after,
  // so the client's own emptying is put right either way.
  protected async fall(
    account: string,
    id: string,
    at: Facing | null
  ): Promise<void> {
    await this.locked(() => this.fallHeld(account, id, at))
  }

  // The fall, with the lock held (a strike's, under its own).
  private async fallHeld(
    account: string,
    id: string,
    at: Facing | null
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
    // Rule 18: the strike spills a share of the wallet. Unread, or not
    // taken out of it, nothing spills.
    let cash = 0
    try {
      cash = (await packs.get(account)).cash
    } catch (err) {
      console.error('The wallet could not be read for a fall', err)
    }
    const fall: ValleyAction = { type: 'fall', id, items, at }
    let reduced = reduce(this.valley, fall, { ...this.context(), cash })
    if (reduced.spend) {
      let paid = false
      try {
        paid = await packs.purchase(account, reduced.spend.amount, null)
      } catch (err) {
        console.error('The fall could not take from the wallet', err)
      }
      if (!paid) {
        reduced = reduce(this.valley, fall, { ...this.context(), cash: 0 })
      }
    }
    if (reduced.corpse === undefined) {
      try {
        await packs.give(account, items)
      } catch (err) {
        console.error('The pack could not be given back', account, err)
      }
    }
    // Even with no new body, a second fall takes the first away.
    await this.apply(reduced)
    for (const msg of reduced.broadcast) this.broadcast(msg, null)
    // Whole again, or as the fall left them.
    this.tellPeersHealth(
      account,
      healthFor(this.valley, account),
      maxFor(this.valley, account)
    )
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

  // Key items off the account's bodies, alone (rule 18): into the pack
  // first, so a failed write leaves them lying on the body for the next
  // time the account comes in.
  private async keysBack(account: string): Promise<void> {
    await this.locked(async () => {
      const reduced = reduce(
        this.valley,
        { type: 'keys-back', account },
        this.context()
      )
      const give = reduced.give
      if (!give) return
      try {
        await this.packs().give(give.account, give.items)
      } catch (err) {
        console.error('The keys could not be given back', account, err)
        return
      }
      await this.apply(reduced)
      for (const msg of reduced.broadcast) this.broadcast(msg, null)
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

  // An expedition sent or claimed, alone (rule 30): no other frame runs
  // between reading the run, judging the send or the claim, and writing it
  // with the haul into the pack and the wallet. Every socket on the
  // account hears the expedition, and the pack after a claim.
  private async expedition(
    ws: WebSocket,
    account: string | null,
    action: Extract<
      ValleyAction,
      { type: 'expedition-send' | 'expedition-claim' }
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
      let read: ExpeditionRead
      try {
        read = await packs.expedition(account)
      } catch (err) {
        console.error('The expedition could not be read', err)
        refuse('unavailable')
        return
      }
      // A send reads the wallet for its buy-in.
      let cash: number | undefined
      if (action.type === 'expedition-send') {
        try {
          cash = (await packs.get(account)).cash
        } catch (err) {
          console.error('The wallet could not be read', err)
          refuse('unavailable')
          return
        }
      }
      const reduced = reduce(this.valley, action, {
        ...this.context(),
        expedition: { run: read.run },
        ...(cash === undefined ? {} : { cash }),
      })
      if (reduced.reply) {
        send(ws, reduced.reply)
        return
      }
      const change = reduced.expedition
      if (!change) return
      let written: boolean
      try {
        written = change.outcome
          ? await packs.homecoming(account, read.rev, {
              items: change.outcome.items,
              cents: change.outcome.cents,
            })
          : change.run
            ? await packs.embark(
                account,
                read.rev,
                change.run,
                reduced.spend?.amount ?? 0
              )
            : false
      } catch (err) {
        console.error('The expedition could not be written', err)
        refuse('unavailable')
        return
      }
      if (!written) {
        refuse('busy')
        return
      }
      await this.apply(reduced)
      if (reduced.health) this.tellHealth(reduced.health)
      this.toAccount(account, {
        type: 'expedition',
        run: change.run,
        ...(change.outcome ? { outcome: change.outcome } : {}),
      })
      if (change.outcome || reduced.spend) {
        await this.repack(null, null, account)
      }
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

  // A hello from the 3D valley, or a dial from Bull Valley Dial-Up (rule
  // 29), which carries nothing of the world and is never placed.
  private async hello(
    ws: WebSocket,
    attachment: Attachment,
    hello: HelloMessage | DialMessage
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
    // Rule 18: any key item still on one of the account's bodies (laid
    // before strikes kept them) back into the pack, before it is read.
    await this.keysBack(account)
    // The pack first: a valley that cannot read it lets no one in to change
    // it.
    let holdings: Holdings
    let season: SeasonProgress
    let book: string[]
    let task: TaskProgress
    let xp: number
    let stand: StandLedger
    let quests: Record<QuestId, QuestStage>
    let expedition: ExpeditionRun | null
    try {
      ;({ holdings, season, book, task, xp, stand, quests, expedition } =
        await this.packs().welcome(account, SEASON.id, DAILY_TASK.id))
      // Rule 38: an account that met Marx before his whistle was a thing
      // is given it now, under its own lock.
      const owed = giftsOwed(holdings.pack, holdings.stash, book)
      if (Object.keys(owed).length > 0) {
        const gave = await this.forAccount(account, () =>
          this.giveOwed(account)
        )
        if (gave) holdings = await this.packs().get(account)
      }
    } catch (err) {
      console.error('The pack could not be opened', err)
      ws.close(CLOSE.serverError, 'The valley lost the pack')
      return
    }
    // Rule 35: the crew's tag on their name tag; none when it cannot be
    // read, until the next change shows it.
    let crew: string | null = null
    try {
      crew = await this.crews().tagOf(account)
    } catch (err) {
      console.error('The crew could not be read', err)
    }
    // A character Moab trades for, only once the account has traded for it.
    if (!mayRaidAs(hello.outfit, holdings.cosmetics)) {
      ws.close(CLOSE.badOutfit, 'Outfit not unlocked')
      return
    }
    let id: string = crypto.randomUUID()
    // A reconnect inside CONFIG.net.lingerMs takes its place back: the same
    // id, standing where it stood, so no one sees it leave or come.
    let back = null as PeerWire | null
    const reduced = await this.locked(async () => {
      // A reconnect: the socket this client had may not have closed here
      // yet. Retire it first, so the roster never shows the raider their
      // own ghost.
      if (hello.was) await this.retire(ws, account, hello.was)
      await this.keepPlacesOf(ws, account)
      back = hello.was ? this.takeBack(account, hello.was) : null
      if (back) id = back.id
      else this.letGo(account)
      const reduced = reduce(
        this.valley,
        hello.type === 'dial'
          ? {
              type: 'dial',
              id,
              account,
              name,
              outfit: hello.outfit,
              level: levelOf(xp),
            }
          : {
              type: 'join',
              id,
              account,
              name,
              outfit: hello.outfit,
              pickups: hello.pickups,
              stations: hello.stations,
              havens: hello.havens,
              metres: hello.metres,
              lairs: hello.lairs,
              lurks: hello.lurks,
              maze: hello.maze,
              routes: hello.truck,
              stand: hello.stand,
              recyclers: hello.recyclers,
              ponds: hello.ponds,
              bushes: hello.bushes,
              dealer: hello.dealer,
              gron: hello.gron,
              disk: hello.disk,
              undercroft: hello.undercroft,
              moat: hello.moat,
              rings: hello.rings,
              payphones: hello.payphones,
              level: levelOf(xp),
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
      at: back?.at ?? null,
      ...(hello.type === 'dial' ? { dialup: true as const } : {}),
      ...(crew ? { crew: showTag(crew) } : {}),
    }
    this.attach(ws, { ...attachment, me })
    const world = toWire(this.valley)
    // Only a dial may come into a valley no one has opened a world in.
    if ((!world && hello.type !== 'dial') || !this.valley.members[id]) {
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
      healthMax: maxFor(this.valley, account),
      wards: wardsFor(this.valley, account, now),
      citgos: citgosFor(this.valley, account),
      waypoints: waypointsFor(this.valley, account),
      xp,
      stand,
      quests,
      expedition,
    })
    // Back from a dropped line: everyone who still sees them hears no news
    // (the clients take a known id as no arrival), and their friends no
    // greeting.
    this.broadcast({ type: 'peer-joined', peer: this.shown(me, account) }, ws)
    for (const msg of reduced.broadcast) this.broadcast(msg, ws)
    // Rule 34: the party it is in, or the invites waiting on it (the
    // client starts with none).
    const party = this.partyFrame(account)
    if (party.members.length > 0 || party.invites.length > 0) {
      send(ws, party)
    }
    await this.sendCrew(account, ws)
    if (!back) await this.greetFriends(ws, account, name)
  }

  private state(
    ws: WebSocket,
    attachment: Attachment,
    me: PeerWire,
    state: PeerStateWire
  ): void {
    if (!allow(this.stateRate, ws, STATE_LIMIT)) return
    const { x, y, z, yaw, pitch, pose, riding, light, held } = state
    const at = held
      ? { x, y, z, yaw, pitch, pose, riding, light, held }
      : { x, y, z, yaw, pitch, pose, riding, light }
    const next: PeerWire = { ...me, at }
    this.attach(ws, { ...attachment, me: next })
    this.broadcast({ type: 'peer-state', id: me.id, ...at, t: Date.now() }, ws)
    this.keepPlace(ws, me.id, at)
  }

  // Rule 2: where a raider stands is kept as they walk, not only when
  // their socket closes, so a tab that vanished without closing (or whose
  // close lands after its next hello) comes back near where it was. At
  // most every CONFIG.net.placeEveryMs, and only once they have moved.
  private keepPlace(ws: WebSocket, id: string, at: PeerStateWire): void {
    const now = Date.now()
    const kept = this.placeKept.get(ws)
    // Down off the truck (hopped out, or let off where it went): kept at
    // once, wherever the last place was kept. The valley's bed says so,
    // never the frame's word.
    const aboard = inTheBed(this.valley, id)
    const landed = this.rode.get(ws) === true && !aboard
    this.rode.set(ws, aboard)
    if (!landed && kept) {
      if (now - kept.t < CONFIG.net.placeEveryMs) return
      if (Math.hypot(at.x - kept.x, at.z - kept.z) < CONFIG.net.placeMoved) {
        return
      }
    }
    this.placeKept.set(ws, { t: now, x: at.x, z: at.z })
    void this.locked(async () => {
      // Gone since: the leave kept a fresher place.
      if (this.attachment(ws).me?.id === id) await this.stand(id, at)
    }).catch((err: unknown) => console.error('The place was not kept', err))
  }

  // Rule 2: where the account's other sockets stand, kept before a new
  // arrival reads its place: the tab it reloaded from may not have closed
  // here yet.
  private async keepPlacesOf(ws: WebSocket, account: string): Promise<void> {
    for (const socket of this.ctx.getWebSockets()) {
      if (socket === ws) continue
      const { account: theirs, me } = this.attachment(socket)
      if (theirs !== account || !me?.at || me.dialup) continue
      await this.stand(me.id, me.at)
    }
  }

  // Rule 2: the place kept, with the lock held.
  private async stand(id: string, at: PeerStateWire): Promise<void> {
    const reduced = reduce(
      this.valley,
      { type: 'stand', id, at },
      this.context()
    )
    await this.apply(reduced)
    for (const msg of reduced.broadcast) this.broadcast(msg, null)
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

  // Rule 34: a line to the raider's party, under the chat rules and its
  // rate, delivered to every member's sockets. Nothing is stored.
  private partyChat(
    ws: WebSocket,
    attachment: Attachment,
    me: PeerWire,
    text: string
  ): void {
    if (!allow(this.chatRate, ws, CHAT_LIMIT)) {
      send(ws, { type: 'nack', re: 'party-chat', reason: 'too-fast' })
      return
    }
    const party = attachment.account
      ? partyOf(this.valley.parties, attachment.account)
      : null
    if (!party) {
      send(ws, { type: 'nack', re: 'party-chat', reason: 'no-party' })
      return
    }
    const line = { type: 'party-chat' as const, from: me.name, text }
    const at = Date.now()
    for (const member of party.members) {
      this.toAccount(member.account, { ...line, at })
    }
  }

  // Rule 31: the laptop's files, listed, read, saved or deleted. The
  // reducer says whether the raider stands at a laptop; the files are
  // D1's, written alone for the account so two saves never both pass the
  // writer's count.
  private async laptop(
    ws: WebSocket,
    msg: Extract<
      ClientMessage,
      {
        type: 'laptop-list' | 'laptop-read' | 'laptop-save' | 'laptop-delete'
      }
    >,
    id: string,
    at: XZ | null
  ): Promise<void> {
    const re = msg.type
    const refuse = (reason: string) => {
      send(ws, { type: 'nack', re, reason })
    }
    if (!allow(this.laptopRate, ws, LAPTOP_LIMIT)) {
      refuse('too-fast')
      return
    }
    const reduced = reduce(
      this.valley,
      { type: 'laptop', id, re, at },
      this.context()
    )
    if (reduced.reply) {
      send(ws, reduced.reply)
      return
    }
    const account = reduced.laptop?.account
    if (!account) return
    const accounts = this.accounts()
    const list = async () => {
      send(ws, {
        type: 'laptop-files',
        files: listingFor(await accounts.laptopFiles(), account),
      })
    }
    try {
      switch (msg.type) {
        case 'laptop-list':
          await list()
          return
        case 'laptop-read': {
          const body = await accounts.laptopBody(msg.id)
          if (body === null) refuse('gone')
          else send(ws, { type: 'laptop-file', id: msg.id, body })
          return
        }
        case 'laptop-delete':
          await this.forAccount(account, async () => {
            if (!(await accounts.deleteLaptopFile(account, msg.id))) {
              refuse('not-yours')
            }
          })
          await list()
          return
        case 'laptop-save': {
          const saved = await this.forAccount(account, async () => {
            const own = (await accounts.laptopFiles()).filter(
              (f) => f.account === account
            )
            const why = saveRefusal(own, msg.id, msg.name)
            if (why) {
              refuse(why)
              return null
            }
            const kept = await accounts.saveLaptopFile(
              account,
              msg.id,
              crypto.randomUUID().replaceAll('-', ''),
              msg.name,
              msg.body,
              Date.now()
            )
            if (!kept) refuse('name-taken')
            return kept
          })
          if (saved)
            send(ws, { type: 'laptop-saved', id: saved, name: msg.name })
          await list()
          return
        }
      }
    } catch (err) {
      console.error('The laptop could not be read or written', err)
      refuse('unavailable')
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
        // Under the account's lock: the cap is read, then the row
        // written, and two asks from one account must not interleave.
        const result = await this.forAccount(account, () =>
          accounts.askFriend(account, other.accountId, Date.now())
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

  // A raider's card (inspect.ts), read from D1 and sent to the asker's
  // socket alone, whether the raider is in the valley or not.
  private async inspect(
    ws: WebSocket,
    account: string,
    name: string
  ): Promise<void> {
    const refuse = (reason: string) => {
      send(ws, { type: 'nack', re: 'inspect', reason })
    }
    if (!allow(this.inspectRate, ws, INSPECT_LIMIT)) {
      refuse('too-fast')
      return
    }
    try {
      const accounts = this.accounts()
      const packs = this.packs()
      const other = await accounts.accountByUsername(name)
      if (!other) {
        refuse('unknown')
        return
      }
      const them = other.accountId
      const crews = this.crews()
      const [xp, look, cosmetics, found, season, friends, theirCrew, myCrew] =
        await Promise.all([
          packs.xp(them),
          accounts.lookOf(them),
          accounts.cosmeticsOf(them),
          packs.book(them),
          packs.season(them, SEASON.id),
          accounts.friendsOf(account),
          crews.crewOf(them),
          crews.crewOf(account),
        ])
      const card = cardOf({
        name: other.username,
        xp,
        look,
        cosmetics,
        found,
        season,
        self: them === account,
        friend: friends.find((row) => row.accountId === them),
        party: partyStanding(this.valley.parties, account, them, Date.now()),
        crew: theirCrew && { name: theirCrew.name, tag: theirCrew.tag },
        crewInvite:
          myCrew !== null && myCrew.leader === account && theirCrew === null,
        online: this.hasSocket(them),
      })
      send(ws, { type: 'inspected', card })
    } catch (err) {
      console.error('A card could not be read', err)
      refuse('unavailable')
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
          where: here ? whereabouts(here.at, world, here.dialup) : null,
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

  // A new character from Moab, for everyone to see.
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
    // The cosmetics the valley holds for the raider, never the client's word.
    if (!mayRaidAs(outfit, me.cosmetics)) {
      send(ws, { type: 'nack', re: 'appearance', reason: 'locked-outfit' })
      return
    }
    await this.reshowAccount(ws, attachment, me, { outfit })
  }

  // A new username from Your Name. The frame names nothing: the account's
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
    let account: Account | null
    try {
      account = attachment.account
        ? await this.accounts().get(attachment.account)
        : null
    } catch (err) {
      console.error('The account could not be read', err)
      send(ws, { type: 'nack', re: 'rename', reason: 'unavailable' })
      return
    }
    const name = normalizeName(account?.username ?? '')
    if (!isValidName(name)) {
      send(ws, { type: 'nack', re: 'rename', reason: 'no-username' })
      return
    }
    await this.reshowAccount(ws, attachment, me, { name })
  }

  // A new name or body for the account, on every socket it has signed in
  // (the 3D valley and Dial-Up both, rule 11), the asker's last: each of
  // the others hears its own change before anyone's news of it.
  private async reshowAccount(
    ws: WebSocket,
    attachment: Attachment,
    me: PeerWire,
    change: Partial<Pick<PeerWire, 'name' | 'outfit'>>
  ): Promise<void> {
    const named = (a: Attachment): Attachment =>
      change.name ? { ...a, name: change.name } : a
    if (attachment.account) {
      for (const socket of this.ctx.getWebSockets()) {
        if (socket === ws) continue
        const other = this.attachment(socket)
        if (other.account !== attachment.account || !other.me) continue
        try {
          await this.reshow(socket, named(other), { ...other.me, ...change })
        } catch {
          // Closing sockets throw; their close handler follows.
        }
      }
    }
    await this.reshow(ws, named(attachment), { ...me, ...change })
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
    this.broadcast(
      { type: 'peer-updated', peer: this.shown(me, attachment.account) },
      null
    )
  }

  // A world action from one player: run it, write what it moves into or
  // out of the pack or the wallet, and only then persist the world, answer
  // and tell everyone. A write that fails leaves the valley as it was, so
  // a pickup, a berry or a drop is never gone from it without reaching
  // the pack. Whether the pack change the action asked for, if any, was
  // made.
  private act(ws: WebSocket, action: ValleyAction): Promise<boolean> {
    return this.locked(() => this.actHeld(ws, action))
  }

  // Rule 33: a drop taken up, with the taker's research read first, so
  // loose change can find more over a burst's dimes. A research that
  // cannot be read finds nothing more; the drop is taken all the same.
  private takeDrop(
    ws: WebSocket,
    account: string | null,
    action: Extract<ValleyAction, { type: 'take-drop' }>
  ): Promise<boolean> {
    return this.locked(async () => {
      let levels: Research | null = null
      if (account) {
        try {
          levels = await this.packs().research(account)
        } catch (err) {
          console.error('The research could not be read', err)
        }
      }
      return this.actHeld(ws, action, levels ? { research: { levels } } : {})
    })
  }

  // Rule 36: a rod out of the tackle box or a cast, with the pack read
  // first, so the valley knows the rod and the bait are in it; rule 38: a
  // whistle or a portal, the whistle or the phone; rule 39: a torch out of
  // the toolbox, or a swing of one. A pack that cannot be
  // read is refused.
  private withPack(
    ws: WebSocket,
    account: string | null,
    action: Extract<
      ValleyAction,
      {
        type:
          | 'tackle'
          | 'cast'
          | 'jar-slurm'
          | 'call'
          | 'open-portal'
          | 'toolbox'
          | 'torch'
      }
    >
  ): Promise<boolean> {
    return this.locked(async () => {
      if (!account) return false
      let holdings: Holdings
      try {
        holdings = await this.packs().get(account)
      } catch (err) {
        console.error('The pack could not be read', err)
        const re = action.type === 'open-portal' ? 'portal' : action.type
        send(ws, { type: 'nack', re, reason: 'unavailable' })
        return false
      }
      return this.actHeld(ws, action, { holdings })
    })
  }

  // Rule 33: the account's research, to the socket that asked.
  private async sendResearch(ws: WebSocket, account: string): Promise<void> {
    try {
      const research = await this.packs().research(account)
      send(ws, { type: 'research', research })
    } catch (err) {
      console.error('The research could not be read', err)
      send(ws, { type: 'nack', re: 'recycle', reason: 'unavailable' })
    }
  }

  // The next level on a research line, alone (rule 33): no other frame
  // runs between reading the research and the pack, judging the level
  // against them, and writing both together. Every socket on the account
  // hears the research and the pack after.
  private async recycle(
    ws: WebSocket,
    account: string | null,
    action: Extract<ValleyAction, { type: 'recycle' }>
  ): Promise<void> {
    if (!account) return
    const refuse = (reason: string) => {
      send(ws, { type: 'nack', re: 'recycle', reason })
    }
    if (!allow(this.dropRate, ws, PACK_LIMIT)) {
      refuse('too-fast')
      return
    }
    await this.locked(async () => {
      const packs = this.packs()
      let levels: Research
      let holdings: Holdings
      try {
        levels = await packs.research(account)
        holdings = await packs.get(account)
      } catch (err) {
        console.error('The research could not be read', err)
        refuse('unavailable')
        return
      }
      const reduced = reduce(this.valley, action, {
        ...this.context(),
        research: { levels, pack: holdings.pack },
      })
      if (reduced.reply) {
        send(ws, reduced.reply)
        return
      }
      const change = reduced.research
      if (!change) return
      let written: boolean
      try {
        written = await packs.recycle(
          account,
          change.line,
          change.level - 1,
          change.items
        )
      } catch (err) {
        console.error('The research could not be written', err)
        refuse('unavailable')
        return
      }
      if (!written) {
        refuse('short')
        return
      }
      await this.apply(reduced)
      this.toAccount(account, {
        type: 'research',
        research: { ...levels, [change.line]: change.level },
        line: change.line,
      })
      await this.repack(null, null, account)
    })
  }

  // Held: the caller has the valley's lock.
  private async actHeld(
    ws: WebSocket,
    action: ValleyAction,
    read: Pick<ValleyContext, 'research' | 'holdings'> = {}
  ): Promise<boolean> {
    const reduced = reduce(this.valley, action, { ...this.context(), ...read })
    const account = reduced.pack?.account ?? reduced.earn?.account
    const written = await this.write(reduced.pack, reduced.earn)
    if (written !== 'done') {
      if (written === 'none-left' && action.type === 'cast') {
        // Rule 36: the bait went from the pack since it was read.
        send(ws, { type: 'nack', re: 'cast', reason: 'no-bait' })
      } else if (written === 'none-left') {
        send(ws, { type: 'nack', re: 'use', reason: 'none-left' })
      } else {
        const nack = unwrittenNack(action)
        if (nack) send(ws, nack)
      }
      if (account) await this.repack(ws, null, account)
      return false
    }
    await this.apply(reduced)
    if (reduced.reply) send(ws, reduced.reply)
    if (reduced.daily) send(ws, reduced.daily)
    if (reduced.found) {
      this.toAccount(reduced.found.account, {
        type: 'found',
        dimes: reduced.found.dimes,
      })
    }
    // Rule 36: the angler to every socket on the account, and the line or
    // the catch to the one that fished.
    if (reduced.angler) {
      this.toAccount(reduced.angler.account, reduced.angler.message)
    }
    if (reduced.fished) send(ws, reduced.fished)
    if (reduced.jarred) this.broadcast(reduced.jarred, null)
    for (const msg of reduced.broadcast) this.broadcast(msg, null)
    if (account) await this.repack(ws, null, account)
    return !reduced.reply
  }

  // The pack change and the cash an action moves, written before the
  // world that takes them is: 'none-left' when the pack had no unit to
  // give up, 'failed' when D1 would not take the write.
  private async write(
    change: PackChange | undefined,
    earn: { account: string; amount: number } | undefined
  ): Promise<'done' | 'none-left' | 'failed'> {
    try {
      const packs = this.packs()
      if (change) {
        const done = await packs.change(
          change.account,
          change.kind,
          change.delta
        )
        if (!done) return 'none-left'
      }
      if (earn) await packs.earn(earn.account, earn.amount)
      return 'done'
    } catch (err) {
      console.error(
        'The pack or wallet could not be written',
        change,
        earn,
        err
      )
      return 'failed'
    }
  }

  // Each shadow that burst leaves its dimes where it was (sharedworld.ts
  // rule 11), how many drawn here, so the reducer stays pure, and each
  // shadowman among `shades` its tombstone, its name drawn here too (rule
  // 17); the Caretaker burned leaves its gold bullion (rule 13).
  private async spill(
    bursts: readonly (XZ & { kind?: ShadeKind })[],
    shades: readonly (XZ & { kind: ShadeKind })[],
    burned: XZ | null
  ): Promise<void> {
    const spills = spillsOf(bursts, burned, this.shadowRng)
    const burials = burialsOf(shades, this.shadowRng)
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

  // A buy off a Citgo shelf, alone (rule 7): no other frame runs between
  // reading the wallet, judging the sale against it, and paying. A wallet
  // that cannot be read or that does not cover the sale leaves the valley
  // as it was.
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

  // A quest's step, alone (rule 26): no other frame runs between reading
  // the stage and the pack, judging the step against them, and writing
  // both. On success every socket on the account hears the stage, then
  // the pack.
  private async questStep(
    ws: WebSocket,
    attachment: Attachment,
    action: Extract<ValleyAction, { type: 'quest' }>
  ): Promise<void> {
    const { account } = attachment
    if (!account) return
    const refuse = (reason: string) => {
      send(ws, { type: 'nack', re: 'quest', reason })
    }
    if (!isQuest(action.quest)) {
      refuse('no-such-quest')
      return
    }
    await this.locked(async () => {
      const packs = this.packs()
      let quest: { stages: QuestStages; pack: Inventory }
      try {
        const [stages, holdings] = await Promise.all([
          packs.quests(account),
          packs.get(account),
        ])
        quest = { stages, pack: holdings.pack }
      } catch (err) {
        console.error('The quest could not be read', err)
        refuse('unavailable')
        return
      }
      const reduced = reduce(this.valley, action, {
        ...this.context(),
        quest,
      })
      if (reduced.reply) {
        send(ws, reduced.reply)
        return
      }
      const step = reduced.quest
      if (!step) return
      let stepped: boolean
      try {
        stepped = await packs.quest(
          account,
          step.quest,
          step.from,
          step.to,
          step.change
        )
      } catch (err) {
        console.error('The quest could not be written', err)
        refuse('unavailable')
        return
      }
      if (!stepped) {
        refuse('not-now')
        return
      }
      await this.apply(reduced)
      this.toAccount(account, {
        type: 'quest',
        quest: step.quest,
        step: step.step,
        stage: step.to,
      })
      await this.repack(ws, null, account)
    })
  }

  // A barter with Erwin von Dutch, alone (rule 25), or fish cooked over
  // the campfire (rule 40), written the same way: no other frame runs
  // between reading the pack, judging the change against it, and writing
  // both sides of it. On success everyone sees his stock go down, the
  // account's sockets hear what cooked, and they get the pack.
  private async barter(
    ws: WebSocket,
    attachment: Attachment,
    action: Extract<ValleyAction, { type: 'deal' | 'cook' }>
  ): Promise<void> {
    const { account } = attachment
    if (!account) return
    const refuse = (reason: string) => {
      send(ws, { type: 'nack', re: action.type, reason, item: action.kind })
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
      const deal = reduced.barter
      if (!deal) return
      let dealt: boolean
      try {
        dealt = await packs.barter(account, deal.give, deal.take)
      } catch (err) {
        console.error('The barter could not be written', err)
        refuse('unavailable')
        return
      }
      if (!dealt) {
        refuse('short')
        return
      }
      await this.apply(reduced)
      for (const msg of reduced.broadcast) this.broadcast(msg, null)
      const cooked = reduced.cooked
      if (cooked) {
        this.toAccount(account, {
          type: 'cooked',
          kind: cooked.kind,
          count: cooked.count,
          into: cooked.into,
        })
      }
      await this.repack(ws, null, account)
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
      this.broadcast(
        { type: 'peer-updated', peer: this.shown(next, account) },
        null
      )
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
    account = change?.account,
    re: 'use' | 'pass' = 'use'
  ): Promise<boolean> {
    if (!account) return false
    let done = true
    try {
      const packs = this.packs()
      if (change) {
        done = await packs.change(account, change.kind, change.delta)
        if (!done && ws) {
          send(ws, { type: 'nack', re, reason: 'none-left' })
        }
      }
      this.toAccount(account, this.packFrame(account, await packs.get(account)))
    } catch (err) {
      console.error('The pack could not be changed', change, err)
      return false
    }
    return done
  }

  // Rule 15: each account credited with burning the Caretaker, tallied
  // alone, so two burnings never read the same progress. Every socket on
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

  // Rule 38: what the account's book is owed and its pack and locker do
  // not hold (Marx's whistle), given; whether anything was. Run under the
  // account's own lock, so two sockets never give it twice.
  private async giveOwed(account: string): Promise<boolean> {
    const packs = this.packs()
    const [holdings, book] = await Promise.all([
      packs.get(account),
      packs.book(account),
    ])
    const owed = giftsOwed(holdings.pack, holdings.stash, book)
    if (Object.keys(owed).length === 0) return false
    await packs.give(account, owed)
    return true
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
        const packs = this.packs()
        // The finds and their bounty (rule 20) in one write.
        const found = await packs.discover(
          account,
          entries,
          Date.now(),
          (fresh) => findsPay(account, fresh).cents
        )
        if (found.length > 0) this.toAccount(account, { type: 'book', found })
        const { cents, xp } = findsPay(account, found)
        // Rule 38: a find that gives (Marx's whistle) gives it now.
        const gave = found.some((entry) => GIFTS[entry] !== undefined)
          ? await this.giveOwed(account)
          : false
        if (cents > 0 || gave) {
          this.toAccount(
            account,
            this.packFrame(account, await packs.get(account))
          )
        }
        if (xp.length > 0) void this.award(xp)
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
        if (level !== null) {
          this.relevel(account, level)
          await this.levelUp(account, level)
        }
      } catch (err) {
        console.error('The XP could not be written', account, gained, err)
      }
    }
  }

  // Rule 24: a new level's larger whole, which every socket on the account
  // hears.
  private async levelUp(account: string, level: number): Promise<void> {
    await this.locked(async () => {
      const reduced = reduce(
        this.valley,
        { type: 'level', account, level },
        this.context()
      )
      await this.apply(reduced)
      if (reduced.health) this.tellHealth(reduced.health)
    })
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
      this.broadcast(
        { type: 'peer-updated', peer: this.shown(next, account) },
        null
      )
    }
  }

  // Rule 35: every socket on `account` shown to everyone wearing `tag`
  // (null: none).
  private recrew(account: string, tag: string | null): void {
    for (const socket of this.ctx.getWebSockets()) {
      const attachment = this.attachment(socket)
      const me = attachment.me
      if (attachment.account !== account || !me) continue
      const { crew: _, ...rest } = me
      const next: PeerWire = tag ? { ...rest, crew: showTag(tag) } : rest
      this.attach(socket, { ...attachment, me: next })
      this.broadcast(
        { type: 'peer-updated', peer: this.shown(next, account) },
        null
      )
    }
  }

  // Rule 35: the account's crew and the invites waiting on it, to every
  // socket on it (or to `ws` alone, at hello, and only when there is
  // anything to say).
  private async sendCrew(account: string, ws?: WebSocket): Promise<void> {
    try {
      const store = this.crews()
      const crew = await store.crewOf(account)
      const invites = await store.invitesOf(
        account,
        Date.now() - CONFIG.crews.inviteMs
      )
      const wire = crewWire(
        crew,
        invites.map(({ tag, name }) => ({ tag: showTag(tag), name })),
        (other) => this.hasSocket(other)
      )
      const msg: ServerMessage = { type: 'crew', ...wire }
      if (!ws) this.toAccount(account, msg)
      else if (wire.crew || wire.invites.length > 0) send(ws, msg)
    } catch (err) {
      console.error('The crew could not be read', err)
    }
  }

  // Rule 35: news of `crew` to each of `accounts`.
  private crewNews(
    accounts: readonly string[],
    crew: CrewRow,
    news: CrewNewsMessage['news'],
    name: string
  ): void {
    const msg: ServerMessage = {
      type: 'crew-news',
      news,
      name,
      tag: showTag(crew.tag),
      crew: crew.name,
    }
    for (const account of accounts) this.toAccount(account, msg)
  }

  // Rule 35: a crew started, a raider invited to it, an invite taken up,
  // the crew left, or a member put out. All under the valley's lock, so a
  // read and the write it decides stand together; the store keeps them in
  // D1.
  private async crewAct(
    ws: WebSocket,
    attachment: Attachment,
    me: PeerWire,
    msg: Extract<
      ClientMessage,
      {
        type:
          | 'crew-create'
          | 'crew-invite'
          | 'crew-join'
          | 'crew-leave'
          | 'crew-kick'
      }
    >
  ): Promise<void> {
    const account = attachment.account
    if (!account) return
    const re = msg.type
    const refuse = (reason: string) => {
      send(ws, { type: 'nack', re, reason })
    }
    if (!allow(this.friendRate, ws, FRIEND_LIMIT)) {
      refuse('too-fast')
      return
    }
    const store = this.crews()
    const now = Date.now()
    const accounts = (crew: CrewRow) => crew.members.map((m) => m.account)
    try {
      await this.locked(async () => {
        const mine = await store.crewOf(account)
        switch (msg.type) {
          case 'crew-create': {
            if (!isValidTag(msg.tag)) return refuse('bad-tag')
            if (!isValidCrewName(msg.name)) return refuse('bad-name')
            if (mine) return refuse('in-crew')
            const made = await store.create(
              account,
              crypto.randomUUID(),
              msg.name,
              msg.tag,
              CONFIG.crews.cost,
              now
            )
            if (made !== 'ok') return refuse(made)
            const crew = await store.crewOf(account)
            if (!crew) return
            await this.repack(ws, null, account)
            this.recrew(account, crew.tag)
            this.crewNews([account], crew, 'created', me.name)
            await this.sendCrew(account)
            return
          }
          case 'crew-invite': {
            if (!mine) return refuse('no-crew')
            if (mine.leader !== account) return refuse('not-leader')
            const other = await this.accounts().accountByUsername(msg.name)
            if (!other) return refuse('unknown')
            if (other.accountId === account) return refuse('self')
            if (await store.tagOf(other.accountId)) return refuse('their-crew')
            if (mine.members.length >= CONFIG.crews.size) return refuse('full')
            await store.invite(mine.id, other.accountId, now)
            this.crewNews([other.accountId], mine, 'invited', me.name)
            this.crewNews([account], mine, 'sent', other.username)
            await this.sendCrew(other.accountId)
            return
          }
          case 'crew-join': {
            if (mine) return refuse('in-crew')
            const crew = await store.crewByTag(msg.tag)
            const waiting = crew
              ? (
                  await store.invitesOf(account, now - CONFIG.crews.inviteMs)
                ).some((i) => i.id === crew.id)
              : false
            if (!crew || !waiting) return refuse('no-invite')
            if (crew.members.length >= CONFIG.crews.size) return refuse('full')
            await store.join(crew.id, account, now)
            this.recrew(account, crew.tag)
            const everyone = [...accounts(crew), account]
            this.crewNews(everyone, crew, 'joined', me.name)
            for (const member of everyone) await this.sendCrew(member)
            return
          }
          case 'crew-leave': {
            const parted = await store.leave(account)
            if (!parted) return refuse('no-crew')
            await this.parted(account, me.name, parted, 'left')
            return
          }
          case 'crew-kick': {
            if (!mine) return refuse('no-crew')
            if (mine.leader !== account) return refuse('not-leader')
            const member = mine.members.find((m) =>
              sameName(m.username, msg.name)
            )
            if (!member) return refuse('not-member')
            if (member.account === account) return refuse('self')
            const parted = await store.leave(member.account)
            if (parted) {
              await this.parted(
                member.account,
                member.username,
                parted,
                'kicked'
              )
            }
            return
          }
        }
      })
    } catch (err) {
      console.error('The crew could not be changed', err)
      refuse('unavailable')
    }
  }

  // Rule 35: `account` (named `name`) out of its crew: its tag off, every
  // member told (a new leader too), and every member sent the crew again.
  private async parted(
    account: string,
    name: string,
    parted: Parted,
    news: 'left' | 'kicked'
  ): Promise<void> {
    const { crew, leader } = parted
    const all = crew.members.map((m) => m.account)
    this.recrew(account, null)
    this.crewNews(all, crew, news, name)
    if (leader !== null && leader !== crew.leader) {
      const led = crew.members.find((m) => m.account === leader)
      const rest = all.filter((other) => other !== account)
      this.crewNews(rest, crew, 'leader', led?.username ?? '')
    }
    for (const member of all) await this.sendCrew(member)
  }

  // Rule 35: a line to the raider's crew, under the chat rules and its
  // rate, delivered to every member's sockets. Nothing is stored.
  private async crewChat(
    ws: WebSocket,
    attachment: Attachment,
    me: PeerWire,
    text: string
  ): Promise<void> {
    if (!allow(this.chatRate, ws, CHAT_LIMIT)) {
      send(ws, { type: 'nack', re: 'crew-chat', reason: 'too-fast' })
      return
    }
    let crew: CrewRow | null = null
    try {
      crew = attachment.account
        ? await this.crews().crewOf(attachment.account)
        : null
    } catch (err) {
      console.error('The crew could not be read', err)
    }
    if (!crew) {
      send(ws, { type: 'nack', re: 'crew-chat', reason: 'no-crew' })
      return
    }
    const line = { type: 'crew-chat' as const, from: me.name, text }
    const at = Date.now()
    for (const member of crew.members) {
      this.toAccount(member.account, { ...line, at })
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
    if (attachment.account) this.linger(attachment.account, me)
    else this.broadcast({ type: 'peer-left', id: me.id }, ws)
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

  // A raider gone from the valley's rules stays standing for everyone
  // else a while; then everyone hears them leave.
  private linger(account: string, me: PeerWire): void {
    const timer = this.later(() => {
      if (this.lingering.get(me.id)?.timer !== timer) return
      this.lingering.delete(me.id)
      this.broadcast({ type: 'peer-left', id: me.id }, null)
      void this.dropFromParty(account)
    }, CONFIG.net.lingerMs)
    this.lingering.set(me.id, { account, me, timer })
  }

  // `run` after `ms`, and how to call it off; the Worker tests replace
  // both to step the lingering by hand.
  protected later(run: () => void, ms: number): unknown {
    return setTimeout(run, ms)
  }

  protected cancel(timer: unknown): void {
    clearTimeout(timer as ReturnType<typeof setTimeout>)
  }

  // The lingering raider `id`, taken back by a reconnect on its own
  // account; null when there is none to take (another account's, or gone).
  private takeBack(account: string, id: string): PeerWire | null {
    const held = this.lingering.get(id)
    if (!held || held.account !== account) return null
    this.cancel(held.timer)
    this.lingering.delete(id)
    return held.me
  }

  // A new arrival on an account that is not a reconnect (a reload): its
  // lingering raiders leave now, so no one sees two of them.
  private letGo(account: string): void {
    for (const [id, held] of [...this.lingering]) {
      if (held.account !== account) continue
      this.cancel(held.timer)
      this.lingering.delete(id)
      this.broadcast({ type: 'peer-left', id }, null)
    }
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
    this.tellParties(reduced)
  }

  // Rule 34: each account whose party changed, sent it again, and the
  // news to the ones it is news to.
  private tellParties(reduced: Reduced): void {
    for (const account of reduced.party ?? []) {
      this.toAccount(account, this.partyFrame(account))
    }
    for (const { account, news, name } of reduced.partyNews ?? []) {
      this.toAccount(account, { type: 'party-news', news, name })
    }
  }

  // Rule 34: the party as `account` is sent it.
  private partyFrame(account: string): { type: 'party' } & PartyWire {
    return {
      type: 'party',
      ...partyWire(
        this.valley.parties,
        account,
        (other) => this.hasSocket(other),
        Date.now()
      ),
    }
  }

  // Rule 34: an account whose linger ran out with no socket left, out of
  // its party.
  private dropFromParty(account: string): Promise<void> {
    return this.locked(async () => {
      const reduced = reduce(
        this.valley,
        { type: 'party-drop', account },
        this.context()
      )
      await this.apply(reduced)
    })
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
      const { me: other, account } = this.attachment(socket)
      if (other) peers.push(this.shown(other, account))
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

// The dev server's frames.
type DevMessage = Extract<ClientMessage, { type: 'dev' }>

// Where the raider's own last state frame put them.
function standing(me: PeerWire): XZ | null {
  return me.at ? { x: me.at.x, z: me.at.z } : null
}

// The same, and which way they face: where a drop or a portal goes.
// Where `me` stands and faces, and the height of their feet: what a drop,
// a portal or a body is laid from (drops.ts Facing).
function facing(me: PeerWire): Facing | null {
  return me.at ? { x: me.at.x, y: me.at.y, z: me.at.z, yaw: me.at.yaw } : null
}

function send(ws: WebSocket, msg: ServerMessage): void {
  ws.send(JSON.stringify(msg))
}

// The refusal for a take, a berry or a drop taken up whose pack or wallet
// write failed, naming what was asked so the client lets go of it. A use
// that failed is not answered: the pack frame after it puts the count
// right.
function unwrittenNack(action: ValleyAction): NackMessage | null {
  const reason = 'unwritten'
  switch (action.type) {
    case 'take':
      return { type: 'nack', re: 'take', reason, index: action.index }
    case 'take-drop':
      return { type: 'nack', re: 'take-drop', reason, drop: action.drop }
    case 'collect':
      return { type: 'nack', re: 'collect', reason }
    case 'tackle':
    case 'dig':
    case 'cast':
    case 'reel':
    case 'jar-slurm':
    case 'toolbox':
      return { type: 'nack', re: action.type, reason }
    default:
      return null
  }
}
