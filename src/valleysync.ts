// What the valley says, applied: who else is here, the chat, and the
// shared world. Every change to the valley's world arrives as a whole
// snapshot and a reason; worldsync.ts says what it means for this raider,
// and this file does it (the truck, the bed, the pickups, the shelves,
// the drops, the lines in the log).

import { CHAT_COPY, othersLine } from './chat.ts'
import { CONFIG } from './config.ts'
import { copy } from './copy.ts'
import { toCosmetics } from './cosmetics.ts'
import { pickupLabel } from './interactions.ts'
import { toInventory } from './inventory.ts'
import { itemById } from './items.ts'
import { createTruck } from './marx.ts'
import { CLOSE } from './protocol.ts'
import { formatCash } from './store.ts'
import { aboard, newLeg, settledBy } from './worldsync.ts'
import type { Actions } from './actions.ts'
import type { CosmeticId } from './cosmetics.ts'
import type { Game } from './game.ts'
import type { Inventory } from './interfaces.ts'
import type { NackMessage, WorldMessage, WorldWire } from './protocol.ts'

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
        const was = peers.table.get(msg.peer.id)?.name
        peers.updated(msg.peer)
        if (was && was !== msg.peer.name) {
          hud.tell(copy('log.peer_renamed', { was, name: msg.peer.name }))
        }
        return
      }
      case 'peer-state': {
        const { x, y, z, yaw, pitch, pose, riding, light } = msg
        peers.state(msg.id, { x, y, z, yaw, pitch, pose, riding, light }, now)
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
      case 'error':
        console.warn('Valley:', msg.code, msg.message)
        return
      case 'pong':
        return
      // Rule 13: the valley's shadowmen, every step, and a touch.
      case 'shadowmen':
        game.shadowmen.receive(msg, now)
        game.caretaker.receive(msg, now)
        return
      case 'struck':
        actions.strike(msg.by ?? 'shadowman')
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
      'by' | 'index' | 'station' | 'item' | 'drop' | 'count'
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
    for (const id of s.pendingDrops) {
      if (!wire.drops.some((d) => d.id === id)) s.pendingDrops.delete(id)
    }
    if (dropped?.mine) {
      hud.tell(copy('log.dropped', { item: pickupLabel(dropped) }))
    }
    if (dropTaken?.mine) actions.applyDropTaken(dropTaken.kind, dropTaken.count)

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
    } else if (msg.re === 'drop') {
      // The pack frame that follows a refused drop puts the count right.
      hud.tell(
        copy(msg.reason === 'aboard' ? 'log.drop_aboard' : 'log.drop_refused')
      )
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
    } else if (msg.re === 'rename' || msg.re === 'appearance') {
      // The account kept the change; only the valley's roster missed it.
      hud.tell(copy('log.change_unheard'))
    }
  }

  // The valley's word on the pack and the wallet replaces this client's
  // guesses.
  const applyPack = (
    pack: Inventory,
    wallet: number,
    cosmetics: CosmeticId[]
  ) => {
    s.inventory = toInventory(pack)
    s.cash = wallet
    actions.refreshBag()
    actions.wear(toCosmetics(cosmetics))
  }

  net.on((msg) => {
    if (msg.type === 'welcome') {
      // Back where the account last stood on foot, the first time.
      if (!s.placed && msg.place && !s.aboard) {
        player.relocate(msg.place.x, msg.place.z, msg.place.yaw)
      }
      s.placed = true
      applyWorld(msg.world, 'joined', { by: msg.id })
      s.daily = msg.daily
      // What the account already wears is no news.
      s.cosmetics = toCosmetics(msg.cosmetics)
      applyPack(msg.pack, msg.cash, msg.cosmetics)
    } else if (msg.type === 'pack') {
      applyPack(msg.pack, msg.cash, msg.cosmetics)
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
    }
  })
}
