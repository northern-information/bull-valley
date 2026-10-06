// What the valley says, applied: who else is here, the chat, and the
// shared raid. Every change to the valley's raid arrives as a whole
// snapshot and a reason; raidsync.ts says how it moves this raider's own
// raid, and this file does what that means (the truck, the pickups, the
// shelves, the lines in the log).

import { CHAT_COPY, othersLine } from './chat.ts'
import { CONFIG } from './config.ts'
import { copy } from './copy.ts'
import { toInventory } from './inventory.ts'
import { itemById } from './items.ts'
import { CLOSE } from './protocol.ts'
import { departureKind, reconcile } from './raidsync.ts'
import { callRoute } from './roadgraph.ts'
import { formatCash } from './store.ts'
import type { Actions } from './actions.ts'
import type { Game } from './game.ts'
import type { Inventory } from './interfaces.ts'
import type { NackMessage, RaidMessage, RaidWire } from './protocol.ts'

export function wireValley(game: Game, actions: Actions): void {
  const { state: s, hud, net, peers, world, truck, graph } = game

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
        const { x, y, z, yaw, pose, riding } = msg
        peers.state(msg.id, { x, y, z, yaw, pose, riding }, now)
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

  // The local raid machine still holds what is ours (the arms); the
  // snapshot moves it through the shared moments: the truck leaving, a
  // pickup going, a whistle answered.
  const applyRaid = (
    wire: RaidWire | null,
    reason: RaidMessage['reason'],
    detail: Pick<RaidMessage, 'by' | 'index' | 'station' | 'item'> = {}
  ) => {
    const { by, index, station, item } = detail
    const previous = s.shared
    s.shared = wire
    if (!wire) return
    const me = net.id

    if (reason === 'taken' && index !== undefined) {
      s.pendingTakes.delete(index)
      const pickup = world.pickups[index]
      if (pickup && !pickup.taken) {
        if (by === me) actions.applyTake(pickup)
        else actions.markTaken(pickup)
      }
    }
    // Whatever else is gone, is gone.
    for (const i of wire.taken) {
      const pickup = world.pickups[i]
      if (pickup && !pickup.taken) actions.markTaken(pickup)
    }

    // The shelves are the valley's; a unit it sold us goes in the pocket.
    if (reason === 'bought' && station !== undefined && item) {
      s.pendingBuys.delete(`${station}:${item}`)
      if (by === me) actions.pocket(item)
    }
    s.storeStock = wire.shelves

    const { raid, departed, departure, whistle } = reconcile(
      s.raid,
      previous,
      wire,
      me,
      reason,
      s.raidClock
    )
    s.raid = raid

    if (departed) {
      s.aboard = false
      if (departure === 'rider') {
        s.onTruckRolls = [copy('log.truck_leaves'), copy('log.hop_out_hint')]
      } else if (departure === 'left-behind') {
        s.onTruckRolls = [copy('log.left_behind')]
      } else if (departure === 'long-gone') {
        hud.tell(copy('log.long_gone'))
      }
      if (departure) actions.refreshBag()
      if (wire.departedAt !== null) {
        const at = net.clock.toLocalMs(wire.departedAt)
        const donuts =
          departureKind(wire) === 'donuts' ? game.donutRoute(wire.epoch) : null
        if (donuts) truck.driveDonuts(donuts, at)
        else truck.driveRouteAt(game.departRoute, at)
      }
    }

    const call = wire.call
    if (call && whistle) {
      const route = callRoute(graph, call.from, call.to)
      truck.parkAt(call.from.x, call.from.z, truck.dirX, truck.dirZ)
      truck.driveRouteAt(route, net.clock.toLocalMs(call.at))
      hud.tell(
        whistle === 'mine' ? copy('log.whistle') : copy('log.whistle_other')
      )
    }

    if (reason === 'extracted' && by && by !== me) {
      const name = peers.table.get(by)?.name
      peers.left(by)
      if (name) hud.tell(copy('log.peer_extracted', { name }))
    }
  }

  const applyNack = (msg: NackMessage) => {
    if (msg.re === 'take') {
      if (msg.index !== undefined) s.pendingTakes.delete(msg.index)
      // Still there, but not for us yet.
      if (msg.reason === 'arms-full') {
        hud.tell(copy('log.arms_full'))
        return
      }
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
    }
  }

  // The valley's word on the pack and the wallet replaces this client's
  // guesses.
  const applyPack = (pack: Inventory, wallet: number) => {
    s.inventory = toInventory(pack)
    s.cash = wallet
    actions.refreshBag()
  }

  net.on((msg) => {
    if (msg.type === 'welcome') {
      applyRaid(msg.raid, 'joined', { by: msg.id })
      s.daily = msg.daily
      applyPack(msg.pack, msg.cash)
    } else if (msg.type === 'pack') {
      applyPack(msg.pack, msg.cash)
    } else if (msg.type === 'raid') {
      applyRaid(msg.raid, msg.reason, msg)
    } else if (msg.type === 'nack') {
      applyNack(msg)
    } else if (msg.type === 'daily') {
      actions.applyDaily(msg)
    }
  })
  net.onStatus((status) => {
    // The line dropped: the valley's raid is no longer ours to follow, and
    // what we hold plays on alone.
    if (status === 'offline') {
      s.shared = null
      s.aboard = false
      s.daily = null
      s.pendingCollect = false
      s.pendingTakes.clear()
      s.pendingBuys.clear()
    }
  })
}
