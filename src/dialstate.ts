// Pure: what Bull Valley Dial-Up knows of the account (sharedworld.ts rule
// 29), read off the valley's frames (`applyFrame`): the pack, the locker
// and the wallet, the Cabbage Stand, the XP, the geometrie and the wards,
// the season, the daily task, the Book of Shadows and the Citgos found,
// the quests, who else is in the valley, the chat log and the friends
// list, and the world as the last snapshot left it (the shelves, Erwin's
// stock); and the raider's record as the lobby shows it (`raiderStats`).
// The phone keeps nothing of its own: every number on it is the valley's
// last word. Each frame may also leave a line for the screen to say
// (`said`), and each ask waits on an answer (`pending`). dialmain.ts feeds
// it, with both clocks: no clock is read here. What both apps read the
// same way lives in the pure module it belongs to.

import { BOOK, foundLines } from './book.ts'
import { isLevels } from './buffs.ts'
import {
  CHAT_COPY,
  chatCommand,
  joinedLine,
  onlineLine,
  peerNews,
  pushLine,
  whisperLine,
} from './chat.ts'
import { citgoLines, NO_CITGOS } from './citgos.ts'
import { copy } from './copy.ts'
import { cosmeticById, gainedOf, toCosmetics } from './cosmetics.ts'
import {
  DAILY_TASK,
  NO_TASK,
  shownCount,
  taskLine,
  taskOf,
} from './dailytask.ts'
import { boughtLine, dealRefusal } from './dealer.ts'
import {
  EXPEDITION_IDS,
  isExpeditionRun,
  riskOf,
  wardOf,
} from './expeditions.ts'
import {
  friendNews,
  friendRefusal,
  listAnswer,
  whisperRefusal,
} from './friends.ts'
import { BASE_GEOMETRIE } from './health.ts'
import { toInventory } from './inventory.ts'
import { itemLabel, itemLine } from './itemcopy.ts'
import { doseOf, healsOf, itemById } from './items.ts'
import { outfitById } from './outfits.ts'
import { barOf, levelUp } from './progression.ts'
import { normalizeChat } from './protocol.ts'
import {
  isQuest,
  isQuestStage,
  stepNews,
  stepRefusal,
  toQuests,
} from './quests.ts'
import {
  NO_PROGRESS,
  SEASON,
  seasonLine,
  seasonOf,
  shownKills,
} from './season.ts'
import { buyRefusal } from './shop.ts'
import { isStandLedger, refusalLine, standNews } from './stand.ts'
import { formatCash } from './store.ts'
import { AXES, dose, levelsAt } from './wardlevels.ts'
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
import type { Inventory, WardAxis } from './interfaces.ts'
import type { OutfitId } from './outfits.ts'
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
  // The account's name and body, as Gron leaves them here or in the 3D
  // valley (the valley shows our own peer back to us).
  name: string
  outfit: OutfitId | null
  pack: Inventory
  stash: Inventory
  // Cents.
  cash: number
  cosmetics: CosmeticId[]
  xp: number
  stand: StandLedger | null
  health: number
  healthMax: number
  // The wards as the valley last said them, at local `wardsAt` ms; they
  // fade from there (wardsNow).
  wards: WardLevels
  wardsAt: number
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
  // Each Citgo's name, as the map names it (citgomap.ts citgoNames), once
  // the survey is read; empty before.
  citgoNames: readonly string[]
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
  use: boolean
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
  use: false,
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
  name: '',
  outfit: null,
  pack: {},
  stash: {},
  cash: 0,
  cosmetics: [],
  xp: 0,
  stand: null,
  health: BASE_GEOMETRIE,
  healthMax: BASE_GEOMETRIE,
  wards: NO_WARDS,
  wardsAt: 0,
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
  citgoNames: [],
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

// Each Citgo's name, read off the survey, for the lines that name one.
export function withCitgoNames(
  s: DialState,
  names: readonly string[]
): DialState {
  return { ...s, citgoNames: names }
}

// The log with one more line from the game, at `now` (epoch ms).
function told(s: DialState, text: string, now: number): DialState {
  return { ...s, chat: pushLine(s.chat, { kind: 'system', text, at: now }) }
}

// The game's line, said on the screen and kept in the log.
function news(s: DialState, text: string, at: number, now: number): DialState {
  return told(saying(s, text, at), text, now)
}

// Our own peer as the valley shows it: a name or body changed in the 3D
// valley, taken on and said.
function shownAs(
  s: DialState,
  peer: PeerWire,
  now: number,
  wall: number
): DialState {
  let next = s
  if (peer.name !== s.name) {
    next = news(
      { ...next, name: peer.name },
      copy('gron.renamed', { name: peer.name }),
      now,
      wall
    )
  }
  if (peer.outfit !== s.outfit) {
    next = news(
      { ...next, outfit: peer.outfit },
      copy('gron.became', { name: outfitById(peer.outfit).label }),
      now,
      wall
    )
  }
  return next
}

// The wards at local `now`, faded on the valley's own rates since it last
// said them (wardlevels.ts levelsAt), as the 3D valley and the valley's
// expeditions read them.
export function wardsNow(s: DialState, now: number): WardLevels {
  return levelsAt({ at: s.wardsAt / 1000, levels: s.wards }, now / 1000)
}

// What one use of `kind` would do now (sharedworld.ts rules 24 and 27):
// each ward it moves, faded to now and then dosed, the risk of each
// expedition that ward guards (expeditions.ts riskOf, as the valley judges
// a run sent then), and the geometrie it would mend. Levels and risks are
// 0 to 1.
export interface UseImpact {
  wards: { axis: WardAxis; from: number; to: number }[]
  risks: { id: ExpeditionId; from: number; to: number }[]
  health: { from: number; to: number } | null
}

export function useImpact(s: DialState, kind: string, now: number): UseImpact {
  const before = wardsNow(s, now)
  const after = levelsAt(dose({ at: 0, levels: before }, doseOf(kind), 0), 0)
  const moved = AXES.filter((axis) => after[axis] !== before[axis])
  const risks = EXPEDITION_IDS.flatMap((id) => {
    const axis = wardOf(id)
    if (!axis || !moved.includes(axis)) return []
    return [{ id, from: riskOf(id, before[axis]), to: riskOf(id, after[axis]) }]
  })
  const heal = healsOf(kind, s.healthMax)
  return {
    wards: moved.map((axis) => ({
      axis,
      from: before[axis],
      to: after[axis],
    })),
    risks,
    health:
      heal > 0 && s.health < s.healthMax
        ? { from: s.health, to: Math.min(s.healthMax, s.health + heal) }
        : null,
  }
}

// The state after one frame from the valley, at local `now` (what the
// screen says is timed by it) and `wall` epoch ms (what the log keeps).
export function applyFrame(
  s: DialState,
  msg: ServerMessage,
  now: number,
  wall: number
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
        wardsAt: now,
        season: seasonOf(msg.season) ?? NO_PROGRESS,
        task: taskOf(msg.task) ?? NO_TASK,
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
        pending: { ...s.pending, locker: false, trade: false, use: false },
      }
      // Rule 14: a cosmetic Moab traded, worn now.
      return gainedOf(s.cosmetics, cosmetics).reduce(
        (after, id) => news(after, cosmeticById(id)?.worn ?? id, now, wall),
        next
      )
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
    // What the account did, here or in the 3D valley, goes into the log
    // alone: the screen's word (`said`) is the valley's answer to an ask
    // of the phone's own, which a dialog may be showing.
    case 'xp': {
      // Rule 22: XP only grows, so a frame overtaken by a later one is old
      // news.
      const xp = Math.max(s.xp, msg.xp)
      const level = levelUp(s.xp, xp)
      const next = { ...s, xp }
      return level === null
        ? next
        : told(next, copy('log.level_up', { level }), wall)
    }
    case 'health':
      return { ...s, health: msg.health, healthMax: msg.max }
    case 'wards':
      return isLevels(msg.wards) ? { ...s, wards: msg.wards, wardsAt: now } : s
    case 'world':
      return msg.world
        ? worldNews({ ...s, world: msg.world }, msg, now, wall)
        : s
    case 'quest': {
      if (!isQuest(msg.quest) || !isQuestStage(msg.stage)) return s
      const next = {
        ...s,
        quests: { ...s.quests, [msg.quest]: msg.stage },
        pending: { ...s.pending, deal: false },
      }
      return news(next, stepNews(msg.step), now, wall)
    }
    case 'expedition': {
      const next: DialState = {
        ...s,
        expedition: isExpeditionRun(msg.run) ? msg.run : null,
        pending: { ...s.pending, expedition: false },
        ...(msg.outcome ? { haul: msg.outcome } : {}),
      }
      if (msg.outcome) {
        return news(next, haulLine(msg.outcome), now, wall)
      }
      return next.expedition
        ? news(
            next,
            copy('dialup.expeditions.sent', {
              run: expeditionName(next.expedition.id),
            }),
            now,
            wall
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
        joinedLine(msg.peer),
        wall
      )
    case 'peer-updated': {
      const was = s.peers.find((p) => p.id === msg.peer.id)
      const next = {
        ...s,
        peers: s.peers.map((p) => (p.id === msg.peer.id ? msg.peer : p)),
      }
      // Our own comes back too: from Gron here, said already, or from the
      // account's Gron in the 3D valley, which we take on and say.
      if (msg.peer.id === s.id) return shownAs(next, msg.peer, now, wall)
      // The account in the 3D valley (a username is one account's): its
      // news is ours, and said already.
      if (msg.peer.name === s.name) return next
      return peerNews(was, msg.peer).reduce(
        (after, line) => told(after, line, wall),
        next
      )
    }
    case 'peer-left': {
      const gone = s.peers.find((p) => p.id === msg.id)
      const next = { ...s, peers: s.peers.filter((p) => p.id !== msg.id) }
      return gone
        ? told(next, copy('log.peer_left', { name: gone.name }), wall)
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
      return { ...s, chat: pushLine(s.chat, whisperLine(msg)) }
    case 'friends': {
      const { settled, lines } = listAnswer(
        s.pending.ask,
        s.pending.showFriends,
        msg.friends
      )
      let next: DialState = {
        ...s,
        friends: msg.friends,
        pending: {
          ...s.pending,
          ask: settled ? null : s.pending.ask,
          showFriends: false,
        },
      }
      if (settled) next = news(next, settled, now, wall)
      for (const line of lines) next = told(next, line, wall)
      return next
    }
    case 'friend-news':
      return told(s, friendNews(msg.news, msg.name), wall)
    // Another season's or another task's progress says nothing of this
    // one's.
    case 'season': {
      const season = seasonOf(msg.season)
      if (!season) return s
      return told({ ...s, season }, seasonLine(season, msg.rewarded), wall)
    }
    case 'task': {
      const task = taskOf(msg.task)
      if (!task) return s
      const line = taskLine(task, msg.rewarded)
      const next = { ...s, task }
      return line ? told(next, line, wall) : next
    }
    case 'book': {
      // A page already written is never written twice, nor said again.
      const fresh = msg.found.filter((id) => !s.book.includes(id))
      return foundLines(fresh).reduce(
        (after, line) => told(after, line, wall),
        { ...s, book: [...s.book, ...fresh] }
      )
    }
    case 'citgos': {
      const lines = citgoLines(
        s.citgos,
        msg.citgos,
        (station) => s.citgoNames[station] ?? '',
        s.world !== null
      )
      return lines.reduce((after, line) => told(after, line, wall), {
        ...s,
        citgos: msg.citgos,
      })
    }
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
          return refused(s, msg, now, wall)
      }
    default:
      return s
  }
}

// What a snapshot means to this raider: a unit they bought, a deal of
// theirs with Erwin.
function worldNews(
  s: DialState,
  msg: WorldMessage,
  now: number,
  wall: number
): DialState {
  if (s.id === null || msg.by !== s.id || !msg.item) return s
  if (msg.reason === 'bought') {
    return news(
      { ...s, pending: { ...s.pending, buy: null } },
      itemLine(msg.item, 'bought') ??
        copy('dialup.citgo.bought', { item: itemLabel(msg.item) }),
      now,
      wall
    )
  }
  if (msg.reason === 'dealt') {
    return news(
      { ...s, pending: { ...s.pending, deal: false } },
      boughtLine(msg.item),
      now,
      wall
    )
  }
  return s
}

// The valley's refusal of a buy, a deal, a quest step, a trade, a line, a
// whisper or a friend asked.
function refused(
  s: DialState,
  msg: NackMessage,
  now: number,
  wall: number
): DialState {
  const done = (pending: Partial<Pending>, text: string) =>
    news({ ...s, pending: { ...s.pending, ...pending } }, text, now, wall)
  switch (msg.re) {
    case 'buy':
      return done({ buy: null }, buyRefusal(msg.reason, msg.item, s.cash))
    case 'deal':
      return done({ deal: false }, dealRefusal(msg.reason))
    case 'quest':
      return done({ deal: false }, stepRefusal(msg.reason))
    case 'trade':
      return done({ trade: false }, copy('log.trade_refused'))
    case 'use':
      return done({ use: false }, copy('log.use_refused'))
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
    case 'rename':
    case 'appearance':
      // The account kept the change; only the valley's roster missed it.
      return done({}, copy('log.change_unheard'))
    default:
      return s
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
