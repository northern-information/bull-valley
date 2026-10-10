// What the valley says, applied: who else is here, the chat, and the
// shared world. Every change to the valley's world arrives as a whole
// snapshot and a reason; worldsync.ts says what it means for this raider,
// and this file does it (the truck, the bed, the pickups, the shelves,
// the drops, the bodies, the lines in the log).

import { knownOf, toFound } from './book.ts'
import { CHAT_COPY, emoteLine, othersLine } from './chat.ts'
import { CONFIG } from './config.ts'
import { copy } from './copy.ts'
import { toCosmetics } from './cosmetics.ts'
import { DAILY_TASK, taskNews } from './dailytask.ts'
import { seenEmote } from './emotes.ts'
import {
  friendLines,
  friendNews,
  friendRefusal,
  settledAsk,
  whisperRefusal,
} from './friends.ts'
import { pickupLabel } from './interactions.ts'
import { toInventory } from './inventory.ts'
import { itemById } from './items.ts'
import { createTruck } from './marx.ts'
import { levelUp } from './progression.ts'
import { CLOSE } from './protocol.ts'
import { SEASON } from './season.ts'
import { isStandLedger, refusalLine } from './stand.ts'
import { formatCash } from './store.ts'
import { aboard, newLeg, settledBy } from './worldsync.ts'
import type { Actions } from './actions.ts'
import type { CosmeticId } from './cosmetics.ts'
import type { Game } from './game.ts'
import type { Inventory } from './interfaces.ts'
import type {
  NackMessage,
  SeasonWire,
  StandMessage,
  TaskWire,
  WorldMessage,
  WorldWire,
} from './protocol.ts'
import type { StandLedger } from './stand.ts'

export function wireValley(game: Game, actions: Actions): void {
  const { state: s, hud, net, peers, world, player } = game

  // A lost session is not a lost signal: send the raider back to sign in.
  net.onRefused((code) => {
    if (code !== CLOSE.unauthenticated) return
    hud.tell(copy('log.signed_out'))
    setTimeout(() => window.location.reload(), CONFIG.net.signedOutReloadMs)
  })

  // Who else is in the valley, and what they say.
  net.on((msg) => {
    const now = performance.now()
    switch (msg.type) {
      case 'welcome': {
        peers.welcome(msg.peers, now)
        // Before Begin, the greeting says it; after, a reconnect does.
        if (s.greeted) hud.tell(othersLine(peers.count))
        return
      }
      case 'peer-joined':
        peers.joined(msg.peer, now)
        hud.tell(copy('log.peer_joined', { name: msg.peer.name }))
        return
      case 'peer-updated': {
        // Our own comes back too; the dialog has said so already.
        if (msg.peer.id === net.id) return
        const was = peers.table.get(msg.peer.id)
        const { name, level } = msg.peer
        const wasLevel = was?.level
        const wasName = was?.name
        peers.updated(msg.peer)
        if (wasName && wasName !== name) {
          hud.tell(copy('log.peer_renamed', { was: wasName, name }))
        }
        // Rule 22.
        if (wasLevel !== undefined && level > wasLevel) {
          hud.tell(copy('log.peer_level', { name, level }))
        }
        return
      }
      case 'peer-state': {
        const { x, y, z, yaw, pitch, pose, riding, light } = msg
        const peer = peers.table.get(msg.id)
        const was = peer?.next?.pose ?? null
        peers.state(msg.id, { x, y, z, yaw, pitch, pose, riding, light }, now)
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
        hud.chatLine(
          {
            kind: 'whisper',
            name: msg.outgoing
              ? copy('chat.whisper_to', { name: msg.to })
              : copy('chat.whisper_from', { name: msg.from }),
            text: msg.text,
            at: msg.at,
          },
          now
        )
        return
      case 'friends': {
        s.friends = msg.friends
        const settled = s.pendingAsk && settledAsk(s.pendingAsk, msg.friends)
        if (settled) {
          s.pendingAsk = null
          hud.tell(settled)
        }
        if (s.showFriends) {
          s.showFriends = false
          for (const line of friendLines(msg.friends)) hud.tell(line)
        }
        return
      }
      case 'friend-news':
        hud.tell(friendNews(msg.news, msg.name))
        return
      case 'error':
        console.warn('Valley:', msg.code, msg.message)
        return
      case 'pong':
        return
      // Rule 11: the valley's shadowmen, every step, and a touch.
      case 'shadowmen':
        game.shadowmen.receive(msg, now)
        game.caretaker.receive(msg, now)
        return
      // Rule 24: a touch, and the health it left; health given back.
      case 'struck':
        actions.strike(msg.by ?? 'shadowman', msg.health)
        return
      case 'health':
        actions.setHealth(msg.health)
        return
    }
  })
  let wasOnline = false
  net.onStatus((status) => {
    if (status === 'online') {
      wasOnline = true
    } else if (status === 'offline') {
      peers.clear()
      if (wasOnline) hud.tell(copy('log.signal_lost'))
    }
  })

  // The world as the valley has it now. Every snapshot is the whole of it.
  const applyWorld = (
    wire: WorldWire | null,
    reason: WorldMessage['reason'],
    detail: Pick<
      WorldMessage,
      'by' | 'index' | 'station' | 'item' | 'drop' | 'count' | 'corpse'
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
      s.pendingTakes.delete(take.index)
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
      } else if (pickup.taken && !s.pendingTakes.has(i)) {
        actions.markUntaken(pickup)
      }
    })

    // The shelves are the valley's; a unit it sold us goes in the pocket.
    if (sale) {
      s.pendingBuys.delete(`${sale.station}:${sale.item}`)
      if (sale.mine) actions.pocket(sale.item)
    }
    s.storeStock = wire.shelves

    // Rule 12: what lies dropped is the valley's word. A drop of ours is
    // said so; one taken up by us goes into the pack.
    s.drops = wire.drops
    game.drops.sync(s.drops)
    // Rule 17: the tombstones too.
    s.graves = wire.graves
    game.graves.sync(s.graves)
    for (const id of s.pendingDrops) {
      if (!wire.drops.some((d) => d.id === id)) s.pendingDrops.delete(id)
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
    for (const id of s.pendingLoots) {
      if (!wire.corpses.some((c) => c.id === id)) s.pendingLoots.delete(id)
    }
    if (reason === 'looted' && detail.by === me) hud.tell(copy('log.looted'))

    // Rule 3: the truck drives the valley's leg, and the bed is the
    // valley's word on who is in it.
    const leg = wire.truck.leg
    if (newLeg(s.truckLeg, leg)) actions.followLeg(leg)
    const inBed = aboard(wire, me)
    if (inBed) s.pendingBoard = false
    if (s.aboard && !inBed && !s.pendingBoard) {
      // Let off at the Citgo.
      actions.leaveBed(reason === 'home' ? copy('log.end_of_line') : undefined)
    }
    if (!s.pendingBoard) s.aboard = inBed
    if (reason === 'depart' && inBed) {
      s.onTruckRolls = [copy('log.truck_leaves'), copy('log.hop_out_hint')]
    }
    if (reason === 'ferry' && detail.by === me) hud.tell(copy('log.ride_home'))
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
      if (msg.index !== undefined) s.pendingTakes.delete(msg.index)
      if (msg.reason !== 'gone') return
      const pickup =
        msg.index === undefined ? undefined : world.pickups[msg.index]
      if (pickup) actions.markTaken(pickup)
      hud.tell(copy('log.taken_first'))
    } else if (msg.re === 'buy') {
      if (msg.station !== undefined && msg.item) {
        s.pendingBuys.delete(`${msg.station}:${msg.item}`)
      }
      const price = msg.item ? itemById(msg.item)?.price : undefined
      if (msg.reason === 'sold-out') hud.tell(copy('log.sold_out'))
      else if (msg.reason === 'short' && price !== undefined) {
        hud.tell(
          copy('log.short', {
            amount: formatCash(Math.max(0, price - s.cash)),
          })
        )
      } else hud.tell(copy('log.refused'))
    } else if (msg.re === 'call') {
      hud.tell(copy('log.truck_busy'))
    } else if (msg.re === 'collect') {
      s.pendingCollect = false
      hud.tell(copy('log.berry_refused'))
    } else if (msg.re === 'chat') {
      hud.tell(CHAT_COPY.tooFast)
    } else if (msg.re === 'whisper') {
      hud.tell(whisperRefusal(msg.reason, s.whisperTo ?? ''))
    } else if (msg.re === 'friend' || msg.re === 'unfriend') {
      hud.tell(friendRefusal(msg.reason, s.pendingAsk?.name ?? ''))
      s.pendingAsk = null
    } else if (msg.re === 'drop') {
      // The pack frame that follows a refused drop puts the count right.
      hud.tell(
        copy(msg.reason === 'aboard' ? 'log.drop_aboard' : 'log.drop_refused')
      )
    } else if (msg.re === 'discover') {
      actions.bookRefused()
    } else if (msg.re === 'take-drop') {
      if (msg.drop !== undefined) s.pendingDrops.delete(msg.drop)
      if (msg.reason === 'gone') hud.tell(copy('log.taken_first'))
      else hud.tell(copy('log.drop_refused'))
    } else if (msg.re === 'board') {
      // The bed is not ours after all.
      s.pendingBoard = false
      s.aboard = false
      hud.tell(copy('log.board_refused'))
    } else if (msg.re === 'hop-out') {
      s.aboard = false
    } else if (msg.re === 'use') {
      // The pack frame that follows puts the count right.
      hud.tell(copy('log.none_left'))
    } else if (msg.re === 'trade') {
      actions.tradeRefused(msg.reason)
    } else if (msg.re === 'loot') {
      if (msg.corpse !== undefined) s.pendingLoots.delete(msg.corpse)
      hud.tell(copy('log.loot_refused'))
    } else if (msg.re === 'stow' || msg.re === 'unstow') {
      // The pack frame that follows puts both sides right.
      hud.tell(copy('log.locker_refused'))
    } else if (
      msg.re === 'stand-stock' ||
      msg.re === 'stand-collect' ||
      msg.re === 'stand-upgrade'
    ) {
      s.pendingStand = false
      s.standSaid = refusalLine(msg.reason)
      hud.tell(s.standSaid)
    } else if (msg.re === 'rename' || msg.re === 'appearance') {
      // The account kept the change; only the valley's roster missed it.
      hud.tell(copy('log.change_unheard'))
    }
  }

  // The valley's word on the pack, the wallet, the locker and which bodies
  // are ours replaces this client's guesses.
  const applyPack = ({
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
  }) => {
    s.inventory = toInventory(pack)
    s.cash = cash
    s.stash = toInventory(stash)
    s.myCorpses = corpses
    actions.refreshBag()
    actions.wear(toCosmetics(cosmetics))
  }

  // The account's progress through the season, when it is this season's;
  // false for another's.
  const applySeason = (wire: SeasonWire): boolean => {
    if (wire.season !== SEASON.id) return false
    s.season = { kills: wire.kills, claimed: wire.claimed }
    hud.season.set(s.season)
    return true
  }

  // The account's progress on the daily task, when it is this task's;
  // false for another's.
  const applyTask = (wire: TaskWire): boolean => {
    if (wire.task !== DAILY_TASK.id) return false
    s.task = { day: wire.day, count: wire.count, claimed: wire.claimed }
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
      applyWorld(msg.world, 'joined', { by: msg.id })
      s.daily = msg.daily
      // What the account already wears is no news.
      s.cosmetics = toCosmetics(msg.cosmetics)
      applyPack(msg)
      applySeason(msg.season)
      applyTask(msg.task)
      // What the account has found already is no news.
      actions.setBook(toFound(msg.book))
      s.xp = msg.xp
      s.stand = isStandLedger(msg.stand) ? msg.stand : null
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
      s.pendingStand = false
      s.standSaid = standNews(msg, was)
      if (s.standSaid) hud.tell(s.standSaid)
    } else if (msg.type === 'task') {
      // Rule 16: credited with a burn. A reward's pack frame follows.
      if (!applyTask(msg.task)) return
      const { goal } = DAILY_TASK
      const cash = formatCash(DAILY_TASK.reward)
      const news = taskNews(s.task, msg.rewarded)
      if (news === 'done') {
        hud.season.announce({
          kicker: copy('task.kicker'),
          headline: copy('task.banner_done'),
          detail: copy('task.banner_paid', { cash }),
          gold: true,
        })
        hud.tell(copy('log.task_reward', { goal, cash }))
      } else if (news === 'burned') {
        hud.tell(copy('log.task_burned', { count: s.task.count, goal }))
      }
      if (news !== 'past') hud.season.flash()
    } else if (msg.type === 'season') {
      // Rule 15: credited with unmaking the Caretaker. A reward's pack
      // frame follows.
      if (applySeason(msg.season)) {
        hud.tell(hud.season.unmade(s.season, msg.rewarded))
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
  net.onStatus((status) => {
    // The line dropped: the valley's world is no longer ours to follow,
    // and what we hold plays on alone, the truck from where it stands.
    if (status === 'offline') {
      s.world = null
      s.pendingBoard = false
      if (s.aboard) actions.leaveBed()
      actions.setAloneTruck(createTruck(Date.now()))
      actions.followLeg(s.aloneTruck.leg)
      s.daily = null
      s.pendingCollect = false
      s.pendingTakes.clear()
      s.pendingBuys.clear()
      s.pendingTrade = false
      s.bookAsked.clear()
      s.known = knownOf(s.book, s.bookAsked)
      s.pendingLoots.clear()
      s.stand = null
      s.pendingStand = false
      // The valley's bodies are out of reach; ours alone are drawn.
      if (s.lockerOpen) actions.closeInventory()
      actions.showAloneCorpses()
    }
  })
}

// What the log says of the stand as the valley wrote it: the goods put
// out (whatever the table holds more of than `was`), the cents collected,
// or the new level.
function standNews(msg: StandMessage, was: StandLedger | null): string | null {
  const { stand } = msg
  switch (msg.re) {
    case 'stock': {
      for (const [kind, count] of Object.entries(stand.stock)) {
        const more = count - (was?.stock[kind] ?? 0)
        if (more > 0) {
          return copy('log.stand_stocked', {
            item: pickupLabel({ kind, count: more }),
          })
        }
      }
      return null
    }
    case 'collect':
      return copy('log.stand_collected', {
        amount: formatCash(msg.cents ?? 0),
      })
    case 'upgrade':
      return copy('log.stand_upgraded', { level: stand.level })
  }
}
