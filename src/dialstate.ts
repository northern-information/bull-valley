// Pure: what Bull Valley Dial-Up knows of the account (sharedworld.ts rule
// 29), read off the valley's frames (`applyFrame`): the pack, the locker
// and the wallet, the Cabbage Stand, the XP, the geometrie and the wards,
// the season, the daily task, the Book of Shadows and the Citgos found,
// the quests, who else is in the valley, the chat log and the friends
// list, and the world as the last snapshot left it (the shelves, Erwin's
// stock); and the raider's record as the lobby shows it (`raiderStats`). The phone keeps nothing of
// its own: every number on it is the valley's last word. Each frame may
// also leave a line for the screen to say (`said`), and each ask waits on
// an answer (`pending`). dialmain.ts feeds it.

import { BOOK } from './book.ts'
import { isLevels } from './buffs.ts'
import { CHAT_COPY, chatCommand, onlineLine, pushLine } from './chat.ts'
import { NO_CITGOS } from './citgos.ts'
import { copy } from './copy.ts'
import { cosmeticById, toCosmetics } from './cosmetics.ts'
import { DAILY_TASK, NO_TASK, shownCount } from './dailytask.ts'
import { dealRefusal } from './dealer.ts'
import { isExpeditionRun } from './expeditions.ts'
import {
  friendLines,
  friendNews,
  friendRefusal,
  settledAsk,
  whisperRefusal,
} from './friends.ts'
import { BASE_GEOMETRIE } from './health.ts'
import { toInventory } from './inventory.ts'
import { itemLabel, itemLine } from './itemcopy.ts'
import { itemById } from './items.ts'
import { barOf } from './progression.ts'
import { normalizeChat } from './protocol.ts'
import {
  isQuest,
  isQuestStage,
  stepNews,
  stepRefusal,
  toQuests,
} from './quests.ts'
import { NO_PROGRESS, SEASON, shownKills } from './season.ts'
import { isStandLedger, refusalLine, standNews } from './stand.ts'
import { formatCash } from './store.ts'
import type { ChatLine } from './chat.ts'
import type { CitgoLog } from './citgos.ts'
import type { CosmeticId } from './cosmetics.ts'
import type { TaskProgress } from './dailytask.ts'
import type {
  ExpeditionId,
  ExpeditionOutcome,
  ExpeditionRun,
} from './expeditions.ts'
import type { PendingAsk } from './friends.ts'
import type { Inventory } from './interfaces.ts'
import type {
  ClientMessage,
  FriendWire,
  NackMessage,
  PeerWire,
  ServerMessage,
  WardLevels,
  WorldMessage,
  WorldWire,
} from './protocol.ts'
import type { QuestId, QuestStage } from './quests.ts'
import type { SeasonProgress } from './season.ts'
import type { StandLedger } from './stand.ts'

export interface DialState {
  // Our id in the valley, from the welcome; null before it.
  id: string | null
  pack: Inventory
  stash: Inventory
  // Cents.
  cash: number
  cosmetics: CosmeticId[]
  xp: number
  stand: StandLedger | null
  health: number
  healthMax: number
  wards: WardLevels
  season: SeasonProgress
  task: TaskProgress
  // The Book of Shadows entries found (book.ts ids).
  book: string[]
  citgos: CitgoLog
  quests: Record<QuestId, QuestStage>
  // The run out on an expedition, or null, and what the last one home
  // brought (rule 30).
  expedition: ExpeditionRun | null
  haul: ExpeditionOutcome | null
  // Everyone else in the valley, the chat log (newest last), and the
  // friends list as the valley last sent it.
  peers: PeerWire[]
  chat: ChatLine[]
  friends: FriendWire[]
  // The last snapshot of the world, or null when no 3D raider has opened
  // one.
  world: WorldWire | null
  // The last word for the screen, and when (local ms).
  said: { text: string; at: number } | null
  // Asks the valley has not answered yet: the stand's, the locker's, a
  // buy (its station and kind), a deal or a quest step with Erwin, a trade
  // with Moab, a friend asked or unasked, the list wanted in the log, and
  // who a whisper went to (for its refusal).
  pending: Pending
}

export interface Pending {
  stand: boolean
  locker: boolean
  buy: { station: number; kind: string } | null
  deal: boolean
  trade: boolean
  expedition: boolean
  ask: PendingAsk | null
  showFriends: boolean
  whisperTo: string | null
}

const NOTHING_PENDING: Pending = {
  stand: false,
  locker: false,
  buy: null,
  deal: false,
  trade: false,
  expedition: false,
  ask: null,
  showFriends: false,
  whisperTo: null,
}

export const NO_WARDS: WardLevels = {
  high: 0,
  stimulated: 0,
  drunk: 0,
  tripping: 0,
}

export const DIALED: DialState = {
  id: null,
  pack: {},
  stash: {},
  cash: 0,
  cosmetics: [],
  xp: 0,
  stand: null,
  health: BASE_GEOMETRIE,
  healthMax: BASE_GEOMETRIE,
  wards: NO_WARDS,
  season: NO_PROGRESS,
  task: NO_TASK,
  book: [],
  citgos: NO_CITGOS,
  quests: toQuests(null),
  expedition: null,
  haul: null,
  peers: [],
  chat: [],
  friends: [],
  world: null,
  said: null,
  pending: NOTHING_PENDING,
}

// The state with `text` said at `now`.
function saying(s: DialState, text: string | null, now: number): DialState {
  return text ? { ...s, said: { text, at: now } } : s
}

// An ask sent, waiting on the valley: what it changes of `pending`.
export function asked(s: DialState, what: Partial<Pending>): DialState {
  return { ...s, pending: { ...s.pending, ...what }, said: null }
}

// An ask the phone would send, at local `at`: waiting on the valley while
// the line is up; while it is down nothing would answer, so nothing waits
// and the screen says there is no signal.
export function asking(
  s: DialState,
  what: Partial<Pending>,
  online: boolean,
  at: number
): DialState {
  return online ? asked(s, what) : saying(s, copy('dialup.no_signal'), at)
}

// The line to the valley dropped, at local `at` (`now` epoch ms for the
// log): nothing asked of it will be answered, so nothing waits. The
// welcome that ends the drop puts the rest right.
export function lineLost(s: DialState, at: number, now: number): DialState {
  return news(
    { ...s, pending: NOTHING_PENDING },
    copy('log.signal_lost'),
    at,
    now
  )
}

// The log with one more line from the game, at `now` (epoch ms).
function told(s: DialState, text: string, now: number): DialState {
  return { ...s, chat: pushLine(s.chat, { kind: 'system', text, at: now }) }
}

// The game's line, said on the screen and kept in the log.
function news(s: DialState, text: string, at: number, now: number): DialState {
  return told(saying(s, text, at), text, now)
}

// The state after one frame from the valley, at local `now`.
export function applyFrame(
  s: DialState,
  msg: ServerMessage,
  now: number
): DialState {
  switch (msg.type) {
    case 'welcome':
      return {
        ...s,
        id: msg.id,
        pack: toInventory(msg.pack),
        stash: toInventory(msg.stash),
        cash: msg.cash,
        cosmetics: toCosmetics(msg.cosmetics),
        xp: msg.xp,
        stand: isStandLedger(msg.stand) ? msg.stand : null,
        health: msg.health,
        healthMax: msg.healthMax,
        wards: isLevels(msg.wards) ? msg.wards : NO_WARDS,
        season: { kills: msg.season.kills, claimed: msg.season.claimed },
        task: {
          day: msg.task.day,
          count: msg.task.count,
          claimed: msg.task.claimed,
        },
        book: [...msg.book],
        citgos: msg.citgos,
        quests: toQuests(msg.quests),
        expedition: isExpeditionRun(msg.expedition) ? msg.expedition : null,
        peers: [...msg.peers],
        world: msg.world,
        pending: NOTHING_PENDING,
      }
    case 'pack': {
      const cosmetics = toCosmetics(msg.cosmetics)
      const next: DialState = {
        ...s,
        pack: toInventory(msg.pack),
        stash: toInventory(msg.stash),
        cash: msg.cash,
        cosmetics,
        pending: { ...s.pending, locker: false, trade: false },
      }
      // Rule 14: a cosmetic Moab traded, worn now.
      const worn = cosmetics.find((id) => !s.cosmetics.includes(id))
      if (!worn) return next
      return news(next, cosmeticById(worn)?.worn ?? worn, now, Date.now())
    }
    case 'stand': {
      if (!isStandLedger(msg.stand)) return s
      const next = {
        ...s,
        stand: msg.stand,
        pending: { ...s.pending, stand: false },
      }
      return saying(next, standNews(msg, s.stand), now)
    }
    case 'xp':
      return { ...s, xp: Math.max(s.xp, msg.xp) }
    case 'health':
      return { ...s, health: msg.health, healthMax: msg.max }
    case 'wards':
      return isLevels(msg.wards) ? { ...s, wards: msg.wards } : s
    case 'world':
      return msg.world ? worldNews({ ...s, world: msg.world }, msg, now) : s
    case 'quest': {
      if (!isQuest(msg.quest) || !isQuestStage(msg.stage)) return s
      const next = {
        ...s,
        quests: { ...s.quests, [msg.quest]: msg.stage },
        pending: { ...s.pending, deal: false },
      }
      return news(next, stepNews(msg.step), now, Date.now())
    }
    case 'expedition': {
      const next: DialState = {
        ...s,
        expedition: isExpeditionRun(msg.run) ? msg.run : null,
        pending: { ...s.pending, expedition: false },
        ...(msg.outcome ? { haul: msg.outcome } : {}),
      }
      if (msg.outcome) {
        return news(next, haulLine(msg.outcome), now, Date.now())
      }
      return next.expedition
        ? news(
            next,
            copy('dialup.expeditions.sent', {
              run: expeditionName(next.expedition.id),
            }),
            now,
            Date.now()
          )
        : next
    }
    case 'peer-joined':
      // Back from a dropped line under the id we still see: no news.
      if (s.peers.some((p) => p.id === msg.peer.id)) {
        return {
          ...s,
          peers: s.peers.map((p) => (p.id === msg.peer.id ? msg.peer : p)),
        }
      }
      return told(
        {
          ...s,
          peers: [...s.peers.filter((p) => p.id !== msg.peer.id), msg.peer],
        },
        msg.peer.dialup
          ? copy('log.peer_dialed', { name: msg.peer.name })
          : copy('log.peer_joined', { name: msg.peer.name }),
        Date.now()
      )
    case 'peer-updated':
      return {
        ...s,
        peers: s.peers.map((p) => (p.id === msg.peer.id ? msg.peer : p)),
      }
    case 'peer-left': {
      const gone = s.peers.find((p) => p.id === msg.id)
      const next = { ...s, peers: s.peers.filter((p) => p.id !== msg.id) }
      return gone
        ? told(next, copy('log.peer_left', { name: gone.name }), Date.now())
        : next
    }
    case 'chat':
      return {
        ...s,
        chat: pushLine(s.chat, {
          kind: 'say',
          name: msg.name,
          text: msg.text,
          at: msg.at,
        }),
      }
    case 'whisper':
      return {
        ...s,
        chat: pushLine(s.chat, {
          kind: 'whisper',
          name: msg.outgoing
            ? copy('chat.whisper_to', { name: msg.to })
            : copy('chat.whisper_from', { name: msg.from }),
          text: msg.text,
          at: msg.at,
        }),
      }
    case 'friends': {
      const settled = s.pending.ask && settledAsk(s.pending.ask, msg.friends)
      let next: DialState = {
        ...s,
        friends: msg.friends,
        pending: {
          ...s.pending,
          ask: settled ? null : s.pending.ask,
          showFriends: false,
        },
      }
      if (settled) next = news(next, settled, now, Date.now())
      if (s.pending.showFriends) {
        for (const line of friendLines(msg.friends)) {
          next = told(next, line, Date.now())
        }
      }
      return next
    }
    case 'friend-news':
      return told(s, friendNews(msg.news, msg.name), Date.now())
    case 'season':
      return {
        ...s,
        season: { kills: msg.season.kills, claimed: msg.season.claimed },
      }
    case 'task':
      return {
        ...s,
        task: {
          day: msg.task.day,
          count: msg.task.count,
          claimed: msg.task.claimed,
        },
      }
    case 'book':
      return {
        ...s,
        book: [...s.book, ...msg.found.filter((id) => !s.book.includes(id))],
      }
    case 'citgos':
      return { ...s, citgos: msg.citgos }
    case 'nack':
      switch (msg.re) {
        case 'stand-stock':
        case 'stand-collect':
        case 'stand-upgrade':
          return saying(
            { ...s, pending: { ...s.pending, stand: false } },
            refusalLine(msg.reason),
            now
          )
        case 'stow':
        case 'unstow':
          return saying(
            { ...s, pending: { ...s.pending, locker: false } },
            copy('log.locker_refused'),
            now
          )
        default:
          return refused(s, msg, now)
      }
    default:
      return s
  }
}

// What a snapshot means to this raider: a unit they bought, a deal of
// theirs with Erwin.
function worldNews(s: DialState, msg: WorldMessage, now: number): DialState {
  if (s.id === null || msg.by !== s.id || !msg.item) return s
  if (msg.reason === 'bought') {
    return news(
      { ...s, pending: { ...s.pending, buy: null } },
      itemLine(msg.item, 'bought') ??
        copy('dialup.citgo.bought', { item: itemLabel(msg.item) }),
      now,
      Date.now()
    )
  }
  if (msg.reason === 'dealt') {
    return news(
      { ...s, pending: { ...s.pending, deal: false } },
      copy('dealer.bought', { item: itemLabel(msg.item) }),
      now,
      Date.now()
    )
  }
  return s
}

// The valley's refusal of a buy, a deal, a quest step, a trade, a line, a
// whisper or a friend asked.
function refused(s: DialState, msg: NackMessage, now: number): DialState {
  const done = (pending: Partial<Pending>, text: string) =>
    news({ ...s, pending: { ...s.pending, ...pending } }, text, now, Date.now())
  switch (msg.re) {
    case 'buy':
      return done({ buy: null }, buyRefusal(s, msg))
    case 'deal':
      return done({ deal: false }, dealRefusal(msg.reason))
    case 'quest':
      return done({ deal: false }, stepRefusal(msg.reason))
    case 'trade':
      return done({ trade: false }, copy('log.trade_refused'))
    case 'expedition-send':
    case 'expedition-claim':
      return done({ expedition: false }, expeditionRefusal(msg.reason))
    case 'chat':
      return done({}, CHAT_COPY.tooFast)
    case 'whisper':
      return done(
        { whisperTo: null },
        whisperRefusal(msg.reason, s.pending.whisperTo ?? '')
      )
    case 'friend':
    case 'unfriend':
      return done(
        { ask: null },
        friendRefusal(msg.reason, s.pending.ask?.name ?? '')
      )
    default:
      return s
  }
}

// Why the valley would not sell: sold out, short, a Citgo the account has
// not stood at, or no world to buy in.
function buyRefusal(s: DialState, msg: NackMessage): string {
  const price = msg.item ? itemById(msg.item)?.price : undefined
  switch (msg.reason) {
    case 'sold-out':
      return copy('log.sold_out')
    case 'short':
      return price === undefined
        ? copy('log.refused')
        : copy('log.short', {
            amount: formatCash(Math.max(0, price - s.cash)),
          })
    case 'not-visited':
      return copy('dialup.citgo.not_visited')
    case 'not-in-valley':
      return copy('dialup.citgo.no_world')
    default:
      return copy('log.refused')
  }
}

// One line of the raider's record: what it counts, how far along, and how
// full its bar reads (0 to 1), or null where it has none.
export interface RaiderStat {
  id: 'xp' | 'season' | 'task' | 'book' | 'citgos' | 'worn'
  label: string
  value: string
  share: number | null
}

// The raider's record as the lobby shows it, on the Central `day`
// (daily.ts dayKey) for the daily task.
export function raiderStats(s: DialState, day: string): RaiderStat[] {
  const bar = barOf(s.xp)
  const kills = shownKills(s.season)
  const burned = shownCount(s.task, day)
  const found = new Set(s.book).size
  const worn = s.cosmetics.map((id) => cosmeticById(id)?.label ?? id)
  const stats: RaiderStat[] = [
    {
      id: 'xp',
      label: copy('dialup.raider.xp'),
      value:
        bar.span === null
          ? copy('dialup.raider.xp_max')
          : copy('dialup.raider.of', { done: bar.into, goal: bar.span }),
      share: bar.span === null ? 1 : bar.into / Math.max(1, bar.span),
    },
    {
      id: 'season',
      label: copy('dialup.raider.season'),
      value: s.season.claimed
        ? copy('dialup.raider.done')
        : copy('dialup.raider.of', { done: kills, goal: SEASON.goal }),
      share: kills / SEASON.goal,
    },
    {
      id: 'task',
      label: copy('dialup.raider.task'),
      value:
        s.task.day === day && s.task.claimed
          ? copy('dialup.raider.done')
          : copy('dialup.raider.of', { done: burned, goal: DAILY_TASK.goal }),
      share: burned / DAILY_TASK.goal,
    },
    {
      id: 'book',
      label: copy('dialup.raider.book'),
      value: copy('dialup.raider.of', { done: found, goal: BOOK.length }),
      share: found / BOOK.length,
    },
    {
      id: 'citgos',
      label: copy('dialup.raider.citgos'),
      value: String(s.citgos.visited.length),
      share: null,
    },
  ]
  if (worn.length > 0) {
    stats.push({
      id: 'worn',
      label: copy('dialup.raider.worn'),
      value: worn.join(', '),
      share: null,
    })
  }
  return stats
}

// A run's name, as the phone shows it.
export function expeditionName(id: ExpeditionId): string {
  switch (id) {
    case 'ride':
      return copy('dialup.expeditions.ride')
    case 'corn':
      return copy('dialup.expeditions.corn')
    case 'undercroft':
      return copy('dialup.expeditions.undercroft')
  }
}

// What a run brought home, in a line: each kind and the cash, and whether
// it came back hurt.
export function haulLine(outcome: ExpeditionOutcome): string {
  const parts = [
    ...Object.entries(outcome.items).map(([kind, count]) =>
      copy('dialup.expeditions.haul_item', { count, item: itemLabel(kind) })
    ),
    ...(outcome.cents > 0 ? [formatCash(outcome.cents)] : []),
  ]
  const haul =
    parts.length > 0 ? parts.join(', ') : copy('dialup.expeditions.nothing')
  return outcome.hurt
    ? copy('dialup.expeditions.home_hurt', { haul })
    : copy('dialup.expeditions.home', { haul })
}

// Why the valley would not send a run or bring one home.
function expeditionRefusal(reason: string): string {
  switch (reason) {
    case 'busy':
      return copy('dialup.expeditions.busy')
    case 'locked':
      return copy('dialup.expeditions.locked_refused')
    case 'out':
      return copy('dialup.expeditions.out')
    default:
      return copy('dialup.expeditions.refused')
  }
}

// One kind on a Citgo's shelves as the phone lists it: its price, how
// many are left, and the unit a buy takes (the first still on the shelf),
// or null when none are.
export interface ShelfRow {
  kind: string
  price: number
  left: number
  unit: number | null
}

// A Citgo's shelves as the valley last sent them, in the store's own
// order; none with no world, or a station it has no shelf for.
export function shelfOf(s: DialState, station: number): ShelfRow[] {
  const shelf = s.world?.shelves[station]
  if (!shelf) return []
  return Object.entries(shelf).flatMap(([kind, units]) => {
    const price = itemById(kind)?.price
    if (price === undefined) return []
    const unit = units.indexOf(true)
    return [
      {
        kind,
        price,
        left: units.filter(Boolean).length,
        unit: unit < 0 ? null : unit,
      },
    ]
  })
}

// Who this raider is, for /online.
export interface Self {
  name: string
  level: number
}

// A line typed into the phone's chat: the state after it, and the frame
// it sends the valley (null when it is answered here). A line is said to
// everyone; /online is answered from the peers; /friends, /w, /friend
// and /unfriend go to the valley and wait on its answer; an emote needs
// a body (sharedworld.ts rule 29), so the phone says so.
export function sayLine(
  s: DialState,
  typed: string,
  self: Self,
  now: number
): { state: DialState; frame: ClientMessage | null } {
  const text = normalizeChat(typed)
  if (!text) return { state: s, frame: null }
  const command = chatCommand(text)
  if (!command) return { state: s, frame: { type: 'chat', text } }
  const answer = (line: string) => ({
    state: told(s, line, now),
    frame: null,
  })
  switch (command.name) {
    case 'online':
      return answer(
        onlineLine(
          { ...self, dialup: true },
          s.peers.map((p) => ({
            name: p.name,
            level: p.level,
            dialup: p.dialup,
          }))
        )
      )
    case 'emotes':
    case 'emote':
      return answer(copy('dialup.social.no_body'))
    case 'usage':
      return answer(command.line)
    case 'unknown':
      return answer(copy('chat.unknown_command'))
    case 'friends':
      return {
        state: asked(s, { showFriends: true }),
        frame: { type: 'friends' },
      }
    case 'whisper':
      return {
        state: asked(s, { whisperTo: command.to }),
        frame: { type: 'whisper', to: command.to, text: command.text },
      }
    case 'friend':
    case 'unfriend':
      return {
        state: asked(s, { ask: { op: command.name, name: command.who } }),
        frame: { type: command.name, name: command.who },
      }
  }
}
