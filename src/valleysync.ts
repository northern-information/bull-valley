// What the valley says, applied: who else is here, the chat, and the
// shared world. Every change to the valley's world arrives as a whole
// snapshot and a reason; worldsync.ts says what it means for this raider,
// and this file does it (the truck, the bed, the pickups, the shelves,
// the drops, the bodies, the lines in the log).

import { knownOf, toFound } from './book.ts'
import { isLevels } from './buffs.ts'
import { fanfareOf } from './catchfanfare.ts'
import {
  CHAT_COPY,
  crewChatLine,
  emoteLine,
  joinedLine,
  othersLine,
  partyChatLine,
  peerNews,
  whisperLine,
} from './chat.ts'
import { CONFIG } from './config.ts'
import { copy } from './copy.ts'
import { toCosmetics } from './cosmetics.ts'
import { crewNews, crewRefusal } from './crews.ts'
import { DAILY_TASK, taskLine, taskNews, taskOf } from './dailytask.ts'
import { boughtLine, dealRefusal } from './dealer.ts'
import { seenEmote } from './emotes.ts'
import { lineOutOf, toAnglerWire } from './fishing.ts'
import {
  anglerNews,
  catchLine,
  fishRefusal,
  jarRefusal,
  skillUpLine,
} from './fishlines.ts'
import {
  friendNews,
  friendRefusal,
  listAnswer,
  whisperRefusal,
} from './friends.ts'
import { freshPending } from './game.ts'
import { inspectRefusal } from './inspect.ts'
import { pickupLabel } from './interactions.ts'
import { toInventory } from './inventory.ts'
import { itemLabel } from './itemcopy.ts'
import { partyNews, partyRefusal } from './party.ts'
import { levelUp } from './progression.ts'
import { CLOSE } from './protocol.ts'
import {
  isQuest,
  isQuestStage,
  stepNews,
  stepRefusal,
  toQuests,
} from './quests.ts'
import { toResearch } from './recycling.ts'
import { foundLine, recycleRefusal, researchNews } from './researchlines.ts'
import { seasonOf } from './season.ts'
import { buyRefusal } from './shop.ts'
import { isStandLedger, refusalLine, standNews } from './stand.ts'
import { formatCash } from './store.ts'
import { tradeFanfare } from './tradefanfare.ts'
import { toWaypoints } from './waypoints.ts'
import { jarSlurm } from './world.ts'
import {
  giftsIn,
  newLeg,
  portalNews,
  reconcileBed,
  settledBy,
  toolsIn,
} from './worldsync.ts'
import type { Actions } from './actions.ts'
import type { CosmeticId } from './cosmetics.ts'
import type { Game } from './game.ts'
import type { Inventory } from './interfaces.ts'
import type {
  NackMessage,
  SeasonWire,
  TaskWire,
  WorldMessage,
  WorldWire,
} from './protocol.ts'

export function wireValley(game: Game, actions: Actions): void {
  const { state: s, hud, net, peers, world, player } = game

  // A lost session is not a lost signal: send the raider back to sign in.
  net.onRefused((code) => {
    if (code !== CLOSE.unauthenticated) {
      // Turned away for good (a stale build, a bad frame): nothing plays,
      // and the overlay offers the way back to the menu.
      hud.setConnection('lost')
      return
    }
    hud.tell(copy('log.signed_out'))
    setTimeout(() => window.location.reload(), CONFIG.net.signedOutReloadMs)
  })

  // Who else is in the valley, and what they say.
  net.on((msg) => {
    const now = performance.now()
    switch (msg.type) {
      case 'welcome': {
        peers.welcome(msg.peers, now)
        // A new socket has told the valley nothing yet: the next tick
        // sends where we stand, moving or not.
        s.lastSent = null
        // Before Begin, the greeting says it; after, a reconnect does.
        if (s.greeted) hud.tell(othersLine(peers.count))
        return
      }
      case 'peer-joined':
        // Back from a dropped line under the id we still see: no news.
        if (!peers.joined(msg.peer, now)) return
        hud.tell(joinedLine(msg.peer))
        return
      case 'peer-updated': {
        // Our own comes back too: from Gron here, said already, or from
        // the account's Gron on the phone, which we take on.
        if (msg.peer.id === net.id) {
          actions.becomeShown(msg.peer)
          return
        }
        const was = peers.table.get(msg.peer.id)
        peers.updated(msg.peer)
        // The account on the phone (a username is one account's): its
        // news is ours, and said already.
        if (msg.peer.name === game.pick.username) return
        for (const line of peerNews(was, msg.peer)) hud.tell(line)
        return
      }
      case 'peer-state': {
        const { x, y, z, yaw, pitch, pose, riding, light } = msg
        const peer = peers.table.get(msg.id)
        const was = peer?.next?.pose ?? null
        // When it was due here: the server's stamp, brought to our clock,
        // half a round trip on (presence.ts stampOf).
        const due =
          msg.t !== undefined && net.clock.synced
            ? net.clock.toLocalMs(msg.t) + net.clock.rttMs / 2
            : now
        peers.state(
          msg.id,
          { x, y, z, yaw, pitch, pose, riding, light },
          now,
          due
        )
        // An emote just begun near enough to see: a quiet line in the log.
        const emote = seenEmote(
          was,
          pose,
          Math.hypot(x - player.pos.x, z - player.pos.z),
          CONFIG.emotes.seenRadius
        )
        if (emote && peer) hud.tell(emoteLine(emote, peer.name))
        return
      }
      case 'peer-left': {
        const name = peers.table.get(msg.id)?.name
        peers.left(msg.id)
        if (name) hud.tell(copy('log.peer_left', { name }))
        return
      }
      case 'chat':
        hud.chatLine(
          { kind: 'say', name: msg.name, text: msg.text, at: msg.at },
          now
        )
        return
      // Rule 21: a whisper, to this raider or echoed from one they sent.
      case 'whisper':
        hud.chatLine(whisperLine(msg), now)
        return
      case 'friends': {
        s.friends = msg.friends
        const { settled, lines } = listAnswer(
          s.pending.ask,
          s.pending.showFriends,
          msg.friends
        )
        if (settled) {
          s.pending.ask = null
          hud.tell(settled)
        }
        s.pending.showFriends = false
        for (const line of lines) hud.tell(line)
        return
      }
      case 'friend-news':
        hud.tell(friendNews(msg.news, msg.name))
        return
      // A raider's card, asked for by E or /inspect.
      case 'inspected':
        actions.showInspected(msg.card)
        return
      // Rule 34: the party, its news, and a line said to it.
      case 'party':
        s.party = { members: msg.members, invites: msg.invites }
        return
      case 'party-news':
        if (msg.news === 'sent' || msg.news === 'joined') {
          s.pending.invite = null
        }
        hud.tell(partyNews(msg.news, msg.name, game.pick.username))
        return
      case 'party-chat':
        hud.chatLine(partyChatLine(msg), now)
        return
      // Rule 35: the crew, its news, and a line said to it.
      case 'crew':
        s.crew = { crew: msg.crew, invites: msg.invites }
        return
      case 'crew-news':
        s.pending.crew = null
        hud.tell(crewNews(msg, game.pick.username))
        return
      case 'crew-chat':
        hud.chatLine(crewChatLine(msg), now)
        return
      case 'pong':
        return
      // Rule 11: the valley's shadowmen, every step, and a touch.
      case 'shadowmen':
        game.shadowmen.receive(msg, now)
        game.caretaker.receive(msg, now)
        game.tunnel.receive(msg, now)
        return
      // Rule 24: a touch, and the geometrie it left; geometrie given back.
      case 'struck':
        actions.strike(msg.by, msg)
        return
      case 'health':
        actions.setHealth(msg.health, msg.max)
        return
      // Rule 24: another raider's geometrie, for their bar.
      case 'peer-health':
        peers.health(msg.id, msg.health, msg.max)
        return
      // Rule 27: the account's wards, and something passed.
      case 'wards':
        if (isLevels(msg.wards)) actions.setWards(msg.wards)
        return
      case 'passed':
        actions.applyPassed(msg)
        return
      // Rule 28: a Citgo stood at, written.
      case 'citgos':
        actions.applyCitgos(msg.citgos)
        return
      // Rule 37: a pin placed or lifted, on any socket of the account.
      case 'waypoints':
        actions.applyWaypoints(toWaypoints(msg.points))
        return
      // Rule 31: the laptop's answers, to its screen while it is open.
      case 'laptop-files':
        s.laptop?.files(msg.files)
        return
      case 'laptop-file':
        s.laptop?.file(msg.id, msg.body)
        return
      case 'laptop-saved':
        s.laptop?.saved(msg.id, msg.name)
        return
    }
  })

  // The world as the valley has it now. Every snapshot is the whole of it.
  const applyWorld = (
    wire: WorldWire | null,
    reason: WorldMessage['reason'],
    detail: Pick<
      WorldMessage,
      | 'by'
      | 'index'
      | 'station'
      | 'item'
      | 'drop'
      | 'count'
      | 'corpse'
      | 'portal'
    > = {}
  ) => {
    s.world = wire
    if (!wire) return
    const me = net.id
    const { take, sale, dropped, dropTaken } = settledBy(
      { reason, ...detail },
      me
    )

    if (take) {
      s.pending.takes.delete(take.index)
      const pickup = world.pickups[take.index]
      if (pickup && !pickup.taken) {
        if (take.mine) actions.applyTake(pickup)
        else actions.markTaken(pickup)
      }
    }
    // Whatever is gone today is gone; whatever came back with the day is
    // back.
    const taken = new Set(wire.taken)
    world.pickups.forEach((pickup, i) => {
      if (taken.has(i)) {
        if (!pickup.taken) actions.markTaken(pickup)
      } else if (pickup.taken && !s.pending.takes.has(i)) {
        actions.markUntaken(pickup)
      }
    })

    // Rule 25: a deal of ours, done; the pack frame after it carries the
    // goods and the wallet.
    if (reason === 'dealt' && me !== null && detail.by === me) {
      s.pendingDeal = false
      s.dealSaid = boughtLine(detail.item ?? '')
      hud.tell(s.dealSaid)
      if (detail.item) {
        s.tradeCheer = tradeFanfare(
          'dealer',
          detail.item,
          itemLabel(detail.item)
        )
      }
    }
    // The shelves are the valley's; a unit it sold us goes in the pocket.
    if (sale) {
      s.pending.buys.delete(`${sale.station}:${sale.item}`)
      if (sale.mine) {
        actions.pocket(sale.item)
        s.tradeCheer = tradeFanfare('shop', sale.item, itemLabel(sale.item))
      }
    }
    s.storeStock = wire.shelves

    // Rule 12: what lies dropped is the valley's word. A drop of ours is
    // said so; one taken up by us goes into the pack.
    s.drops = wire.drops
    game.drops.sync(s.drops)
    // Rule 17: the tombstones too.
    s.graves = wire.graves
    game.graves.sync(s.graves)
    for (const id of s.pending.drops) {
      if (!wire.drops.some((d) => d.id === id)) s.pending.drops.delete(id)
    }
    if (dropped?.mine) {
      hud.tell(copy('log.dropped', { item: pickupLabel(dropped) }))
    }
    if (dropTaken?.mine) actions.applyDropTaken(dropTaken.kind, dropTaken.count)

    // Rule 18: the bodies are the valley's word; which are ours, its pack
    // frames say. One we took back is said so, and its things follow in
    // the pack frame.
    s.corpses = wire.corpses
    game.corpses.sync(s.corpses)
    for (const id of s.pending.loots) {
      if (!wire.corpses.some((c) => c.id === id)) s.pending.loots.delete(id)
    }
    if (reason === 'looted' && detail.by === me) hud.tell(copy('log.looted'))

    // Rule 28: the Citgo portals are the valley's word. One opening is
    // said, ours or another's; ours closing is said too.
    s.portals = wire.portals
    const portals = portalNews({ reason, ...detail }, wire, me, s.myPortal)
    s.myPortal = portals.mine
    if (portals.opened?.mine) {
      s.pendingPortal = false
      const citgo = hud.map?.label(portals.opened.portal.station) ?? ''
      hud.tell(copy('log.portal_opened', { citgo }))
    } else if (portals.opened) {
      hud.tell(copy('log.portal_other', { name: portals.opened.portal.name }))
    }
    if (portals.closed) hud.tell(copy('log.portal_closed'))

    // Rule 3: the truck drives the valley's leg, and the bed is the
    // valley's word on who is in it.
    const leg = wire.truck.leg
    if (newLeg(s.truckLeg, leg)) actions.followLeg(leg)
    const bed = reconcileBed(
      wire,
      me,
      { aboard: s.aboard, pendingBoard: s.pending.board },
      reason
    )
    s.pending.board = bed.pendingBoard
    if (bed.letOff) {
      // Let off at the Citgo, or where the first one in picked.
      actions.leaveBed(
        reason === 'home'
          ? copy('log.end_of_line')
          : reason === 'dropoff'
            ? copy('log.dropoff')
            : undefined
      )
    }
    s.aboard = bed.aboard
    if (bed.rolling) {
      s.onTruckRolls = [copy('log.truck_leaves'), copy('log.hop_out_hint')]
    }
    if (reason === 'ferry' && detail.by === me) hud.tell(copy('log.ride_home'))
    // The first one in picked where he goes: the rest of the bed hears it.
    if (reason === 'charted' && bed.aboard && detail.by !== me) {
      const dest = leg.kind === 'parked' ? leg.dest : undefined
      hud.tell(
        dest && hud.map
          ? copy('log.charter_other', { place: hud.map.placeOf(dest) })
          : copy('log.charter_other_joyride')
      )
    }
    if (reason === 'called') {
      hud.tell(
        detail.by === me ? copy('log.whistle') : copy('log.whistle_other')
      )
    }
    // His comings and goings, for everyone.
    if (reason === 'donuts') hud.tell(copy('log.marx_donuts'))
    if (reason === 'back') hud.tell(copy('log.marx_back'))
  }

  const applyNack = (msg: NackMessage) => {
    if (msg.re === 'take') {
      if (msg.index !== undefined) s.pending.takes.delete(msg.index)
      if (msg.reason !== 'gone') return
      const pickup =
        msg.index === undefined ? undefined : world.pickups[msg.index]
      if (pickup) actions.markTaken(pickup)
      hud.tell(copy('log.taken_first'))
    } else if (msg.re === 'buy') {
      if (msg.station !== undefined && msg.item) {
        s.pending.buys.delete(`${msg.station}:${msg.item}`)
      }
      s.shopSaid = buyRefusal(msg.reason, msg.item, s.cash)
      hud.tell(s.shopSaid)
    } else if (msg.re === 'call') {
      hud.tell(
        copy(msg.reason === 'no-whistle' ? 'log.no_whistle' : 'log.truck_busy')
      )
    } else if (msg.re === 'collect') {
      s.pending.collect = false
      hud.tell(copy('log.berry_refused'))
    } else if (msg.re === 'chat') {
      hud.tell(CHAT_COPY.tooFast)
    } else if (msg.re === 'whisper') {
      hud.tell(whisperRefusal(msg.reason, s.pending.whisperTo ?? ''))
    } else if (msg.re.startsWith('crew-')) {
      hud.tell(crewRefusal(msg.reason, s.pending.crew ?? ''))
      s.pending.crew = null
    } else if (
      msg.re === 'invite' ||
      msg.re === 'party-leave' ||
      msg.re === 'party-chat'
    ) {
      hud.tell(partyRefusal(msg.reason, s.pending.invite ?? ''))
      s.pending.invite = null
    } else if (msg.re === 'inspect') {
      hud.tell(inspectRefusal(msg.reason, s.pending.inspect ?? ''))
      s.pending.inspect = null
    } else if (msg.re === 'friend' || msg.re === 'unfriend') {
      hud.tell(friendRefusal(msg.reason, s.pending.ask?.name ?? ''))
      s.pending.ask = null
    } else if (msg.re === 'drop') {
      // The pack frame that follows a refused drop puts the count right.
      hud.tell(
        copy(msg.reason === 'aboard' ? 'log.drop_aboard' : 'log.drop_refused')
      )
    } else if (msg.re === 'pass') {
      // The pack frame that follows puts the count right.
      hud.tell(passRefusal(msg.reason))
    } else if (msg.re === 'discover') {
      actions.bookRefused()
    } else if (msg.re === 'waypoints') {
      actions.waypointsRefused()
    } else if (msg.re === 'take-drop') {
      if (msg.drop !== undefined) s.pending.drops.delete(msg.drop)
      if (msg.reason === 'gone') hud.tell(copy('log.taken_first'))
      else hud.tell(copy('log.drop_refused'))
    } else if (msg.re === 'board') {
      // The bed is not ours after all.
      actions.endCharter()
      s.pending.board = false
      s.aboard = false
      hud.tell(copy('log.board_refused'))
    } else if (msg.re === 'charter') {
      hud.tell(copy('log.charter_refused'))
    } else if (msg.re === 'hop-out') {
      s.aboard = false
    } else if (msg.re === 'use') {
      // The pack frame that follows puts the count right.
      hud.tell(copy('log.none_left'))
    } else if (msg.re === 'trade') {
      actions.tradeRefused(msg.reason)
    } else if (msg.re === 'quest') {
      s.pendingQuest = false
      s.dealSaid = stepRefusal(msg.reason)
      hud.tell(s.dealSaid)
    } else if (msg.re === 'deal') {
      s.pendingDeal = false
      s.dealSaid = dealRefusal(msg.reason)
      hud.tell(s.dealSaid)
    } else if (msg.re === 'loot') {
      if (msg.corpse !== undefined) s.pending.loots.delete(msg.corpse)
      hud.tell(copy('log.loot_refused'))
    } else if (msg.re === 'stow' || msg.re === 'unstow') {
      // The pack frame that follows puts both sides right.
      hud.tell(copy('log.locker_refused'))
    } else if (
      msg.re === 'stand-stock' ||
      msg.re === 'stand-collect' ||
      msg.re === 'stand-upgrade'
    ) {
      s.pending.stand = false
      s.standSaid = refusalLine(msg.reason)
      hud.tell(s.standSaid)
    } else if (msg.re === 'recycle') {
      s.pending.recycle = false
      s.researchSaid = recycleRefusal(msg.reason)
      hud.tell(s.researchSaid)
    } else if (msg.re === 'jar-slurm') {
      // Rule 36: gone, out of reach, or no jar with room in it.
      s.pending.jar = false
      hud.tell(jarRefusal(msg.reason))
    } else if (
      msg.re === 'tackle' ||
      msg.re === 'dig' ||
      msg.re === 'cast' ||
      msg.re === 'reel'
    ) {
      // Rule 36. A reel refused has no line left to reel.
      s.pending.fish = false
      if (msg.re === 'reel') s.line = null
      s.fishSaid = fishRefusal(msg.reason)
      hud.tell(s.fishSaid)
    } else if (msg.re.startsWith('laptop-')) {
      s.laptop?.refused(msg.reason)
    } else if (msg.re === 'portal') {
      actions.portalRefused(msg.reason)
    } else if (msg.re === 'rename' || msg.re === 'appearance') {
      // The account kept the change; only the valley's roster missed it.
      hud.tell(copy('log.change_unheard'))
    }
  }

  // The valley's word on the pack, the wallet, the locker and which bodies
  // are ours replaces this client's guesses.
  // `welcomed`: the welcome's pack, which is no news; a later frame's
  // gift (sharedworld.ts rule 38, worldsync.ts giftsIn) is said.
  const applyPack = (
    {
      pack,
      cash,
      cosmetics,
      stash,
      corpses,
    }: {
      pack: Inventory
      cash: number
      cosmetics: CosmeticId[]
      stash: Inventory
      corpses: number[]
    },
    welcomed = false
  ) => {
    const next = toInventory(pack)
    const gifts = welcomed ? [] : giftsIn(s.inventory, next)
    const tools = welcomed ? [] : toolsIn(s.inventory, next)
    s.inventory = next
    s.cash = cash
    s.stash = toInventory(stash)
    s.myCorpses = corpses
    actions.refreshBag()
    actions.wear(toCosmetics(cosmetics))
    if (welcomed) actions.seedKit()
    for (const kind of tools) actions.shelve(kind)
    for (const kind of gifts) actions.gifted(kind)
  }

  // The account's progress through the season, when it is this season's;
  // false for another's.
  const applySeason = (wire: SeasonWire): boolean => {
    const progress = seasonOf(wire)
    if (!progress) return false
    s.season = progress
    hud.season.set(s.season)
    return true
  }

  // The account's progress on the daily task, when it is this task's;
  // false for another's.
  const applyTask = (wire: TaskWire): boolean => {
    const progress = taskOf(wire)
    if (!progress) return false
    s.task = progress
    return true
  }

  net.on((msg) => {
    if (msg.type === 'welcome') {
      // Back where the account last stood on foot, the first time.
      if (!s.placed && msg.place && !s.aboard) {
        player.relocate(msg.place.x, msg.place.z, msg.place.yaw)
      }
      s.placed = true
      s.health = msg.health
      s.healthMax = msg.healthMax
      if (isLevels(msg.wards)) actions.setWards(msg.wards)
      applyWorld(msg.world, 'joined', { by: msg.id })
      s.daily = msg.daily
      // What the account already wears is no news.
      s.cosmetics = toCosmetics(msg.cosmetics)
      applyPack(msg, true)
      applySeason(msg.season)
      applyTask(msg.task)
      // What the account has found already is no news.
      actions.setBook(toFound(msg.book))
      s.xp = msg.xp
      s.stand = isStandLedger(msg.stand) ? msg.stand : null
      s.quests = toQuests(msg.quests)
      // The Citgos the account has stood at already are no news.
      actions.applyCitgos(msg.citgos, true)
      actions.applyWaypoints(toWaypoints(msg.waypoints))
    } else if (msg.type === 'quest') {
      // Rule 26: a step of a quest went through, to every socket on the
      // account. Its pack frame follows.
      if (!isQuest(msg.quest) || !isQuestStage(msg.stage)) return
      s.quests = { ...(s.quests ?? toQuests(null)), [msg.quest]: msg.stage }
      s.pendingQuest = false
      s.dealSaid = stepNews(msg.step)
      hud.tell(s.dealSaid)
    } else if (msg.type === 'book') {
      // Rule 20: written in the account's Book of Shadows.
      actions.applyBook(msg.found)
    } else if (msg.type === 'xp') {
      // Rule 22: XP only grows, so a frame overtaken by a later one is
      // old news.
      const before = s.xp
      s.xp = Math.max(s.xp, msg.xp)
      const level = levelUp(before, s.xp)
      if (s.xp > before) hud.season.flash()
      if (level !== null) {
        hud.season.announce({
          kicker: copy('level.kicker'),
          headline: copy('level.banner', { level }),
        })
        hud.tell(copy('log.level_up', { level }))
      }
    } else if (msg.type === 'stand') {
      // Rule 23: the stand as the valley wrote it, to every socket on the
      // account. Its pack frame follows.
      if (!isStandLedger(msg.stand)) return
      const was = s.stand
      s.stand = msg.stand
      s.pending.stand = false
      s.standSaid = standNews(msg, was)
      if (s.standSaid) hud.tell(s.standSaid)
    } else if (msg.type === 'research') {
      // Rule 33: the research as the valley read or wrote it, to the
      // socket that asked, or after a level to every socket on the
      // account. A level's pack frame follows.
      s.research = toResearch(msg.research)
      if (!msg.line) return
      s.pending.recycle = false
      s.researchSaid = researchNews(msg)
      if (s.researchSaid) hud.tell(s.researchSaid)
    } else if (msg.type === 'found') {
      // Rule 33: loose change, already in the wallet the pack frame says.
      hud.tell(foundLine(msg.dimes))
    } else if (msg.type === 'angler') {
      // Rule 36: the angler as read, or after a dig, the rod or a catch,
      // to every socket on the account. A dig's and the rod's pack frame
      // follows.
      const angler = toAnglerWire(msg.angler)
      if (angler) s.angler = angler
      const news = anglerNews(msg)
      if (!news) return
      s.pending.fish = false
      s.fishSaid = news
      hud.tell(news)
    } else if (msg.type === 'line') {
      // Rule 36: the line in the water, as dealt; the dialog plays it.
      s.pending.fish = false
      s.fishSaid = null
      s.line = lineOutOf(msg, performance.now())
    } else if (msg.type === 'slurm-jarred') {
      // Rule 36: a slurm off the lot into someone's jar; ours, its pack
      // frame follows.
      jarSlurm(world, msg.station, msg.slot, msg.index)
      if (msg.by !== net.id) return
      s.pending.jar = false
      game.sfx?.play('jar-clink')
      hud.tell(copy('log.slurm_jarred'))
    } else if (msg.type === 'catch') {
      // Rule 36: how the line came out; a landed fish's pack frame
      // follows.
      s.pending.fish = false
      s.line = null
      s.fishSaid = catchLine(msg)
      // A fish too big for the skill breaks the line as it comes in.
      if (msg.outcome === 'snap') game.sfx?.play('line-snap')
      hud.tell(s.fishSaid)
      if (msg.up) hud.tell(skillUpLine(msg.skill))
      // A fish landed is a big deal: the banner, the fireflies, the
      // fanfare, and the fish up out of the water on the line.
      const fanfare = fanfareOf(msg)
      if (!fanfare) return
      hud.celebrateCatch(fanfare)
      game.sfx?.play('fish-fanfare')
      s.hoist = { kind: fanfare.kind, at: s.time }
    } else if (msg.type === 'task') {
      // Rule 16: credited with a burn. A reward's pack frame follows.
      if (!applyTask(msg.task)) return
      const news = taskNews(s.task, msg.rewarded)
      if (news === 'done') {
        hud.season.announce({
          kicker: copy('task.kicker'),
          headline: copy('task.banner_done'),
          detail: copy('task.banner_paid', {
            cash: formatCash(DAILY_TASK.reward),
          }),
          gold: true,
        })
      }
      const line = taskLine(s.task, msg.rewarded)
      if (line) hud.tell(line)
      if (news !== 'past') hud.season.flash()
    } else if (msg.type === 'season') {
      // Rule 15: credited with burning the Caretaker. A reward's pack
      // frame follows.
      if (applySeason(msg.season)) {
        hud.tell(hud.season.burned(s.season, msg.rewarded))
      }
    } else if (msg.type === 'pack') {
      applyPack(msg)
    } else if (msg.type === 'world') {
      applyWorld(msg.world, msg.reason, msg)
    } else if (msg.type === 'nack') {
      applyNack(msg)
    } else if (msg.type === 'daily') {
      actions.applyDaily(msg)
    }
  })
  // The line to the valley. Nothing plays while it is down: the raider
  // is stopped with the pointer free and the overlay saying so while the
  // client reconnects, and after CONFIG.net.giveUpMs without the valley
  // the overlay offers the way back to the menu. Peers and the world stay
  // as last said, frozen, and the welcome that ends the drop puts them
  // right.
  let giveUp: ReturnType<typeof setTimeout> | null = null
  net.onStatus((status) => {
    if (status === 'online') {
      if (giveUp !== null) clearTimeout(giveUp)
      giveUp = null
      hud.setConnection('online')
      return
    }
    if (status !== 'offline' || hud.connection === 'lost') return
    // Nothing asked of it will be answered now.
    s.pending = freshPending()
    s.known = knownOf(s.book, s.pending.book)
    player.keys.clear()
    actions.closeInventory()
    actions.closeBook()
    actions.closeMap()
    if (document.pointerLockElement) document.exitPointerLock()
    if (s.started) {
      hud.tell(copy('log.signal_lost'))
      hud.showIntro(true, true)
    }
    hud.setConnection(s.started ? 'reconnecting' : 'connecting')
    giveUp ??= setTimeout(() => {
      giveUp = null
      if (!net.online) hud.setConnection('lost')
    }, CONFIG.net.giveUpMs)
  })
}

// Rule 27: why the valley would not take a pass.
function passRefusal(reason: string): string {
  switch (reason) {
    case 'too-far':
    case 'no-one':
      return copy('log.pass_no_one')
    case 'not-on-foot':
      return copy('log.pass_aboard')
    default:
      return copy('log.pass_refused')
  }
}
