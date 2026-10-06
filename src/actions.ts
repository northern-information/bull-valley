// What the player does: board and hop out, take, buy, pick the berry, use
// an item, whistle for the truck, talk, extract, the pack and the hotbar.
// Played alone each one moves the raid at once; in the shared valley the
// ones that touch the valley's raid are a word to the server, and the raid
// frame that comes back moves it (valleysync.ts). The rules are the pure
// modules'; this is the glue that applies them and says so.

import { saveHotbar, saveLook } from './auth.ts'
import { CHAT_COPY } from './chat.ts'
import { CONFIG } from './config.ts'
import { copy } from './copy.ts'
import { stepIndex } from './cycle.ts'
import { finishById } from './finishes.ts'
import { openGronDialog } from './grondialog.ts'
import { assign } from './hotbar.ts'
import { pickupLabel } from './interactions.ts'
import { addItem, consume } from './inventory.ts'
import { getItem, itemById } from './items.ts'
import { npcLine } from './npcs.ts'
import { outfitById } from './outfits.ts'
import { PACK_TABS, packItems } from './packgrid.ts'
import { normalizeChat } from './protocol.ts'
import { advance, canPick, EVENTS, STATES, summary } from './raid.ts'
import { callRoute } from './roadgraph.ts'
import { buy as buyItem, settle } from './shop.ts'
import type { Game } from './game.ts'
import type { DailyStatus, ShelfSpot } from './interactions.ts'
import type { NpcId } from './npcs.ts'
import type { PackTab } from './packgrid.ts'
import type { DailyMessage } from './protocol.ts'
import type { Pickup } from './world.ts'

export interface Actions {
  // Redraw the open pack after anything that changes what you carry. The
  // hotbar follows on its own, every frame.
  refreshBag(): void
  openInventory(): void
  // relock: closed by the player's own key or click, a gesture that may
  // lock the pointer again. Closed by the raid (a strike, the truck, the
  // end), the pointer stays free and the resume prompt shows.
  closeInventory(relock?: boolean): void
  // A or D in the pack: the tab to the left (-1) or right (+1), wrapping.
  stepBagTab(step: number): void
  // A number key over an item in the pack puts it on that slot, or takes
  // it off when it is there already.
  assignSlot(slot: number, kind: string): void
  // The truck leaves from the spawn station: the joyride, or donuts.
  truckLeaves(aboard: boolean): void
  hopOut(line?: string): void
  // A shadowman touched you.
  strike(): void
  callTruck(): void
  // The buyer's side of a sale, once the valley says the unit is ours.
  pocket(kind: string): void
  // The valley's answer at the bush.
  applyDaily(msg: DailyMessage): void
  // One of an item, used: E over it in the pack, or its hotbar key.
  useKind(kind: string): void
  // The pickup is ours: into the arms or the pack.
  applyTake(pickup: Pickup): void
  // Someone else got it.
  markTaken(pickup: Pickup): void
  // E: whatever the loop last resolved E to do.
  interact(): void
  // One line to the valley.
  say(typed: string): void
}

// engagePointer takes the pointer back once Gron's dialog closes.
export function createActions(game: Game, engagePointer: () => void): Actions {
  const { state: s, hud, net, player, truck, world, graph } = game

  const refreshBag = () => {
    if (s.inventoryOpen) {
      hud.setBag(packItems(s.inventory, s.raid, hud.bagTab), (kind) =>
        game.thumbs.icon(kind)
      )
    }
  }

  const showBagTab = (tab: PackTab) => {
    hud.selectBagTab(tab)
    refreshBag()
  }
  hud.onBagTab = showBagTab

  // The pack opens over the valley with the pointer free for it, as Gron's
  // dialog does, on its first tab; the player freezes, the valley does not.
  const openInventory = () => {
    player.keys.clear()
    s.inventoryOpen = hud.showBag(true)
    showBagTab(PACK_TABS[0])
    if (document.pointerLockElement) document.exitPointerLock()
  }

  const closeInventory = (relock = false) => {
    if (!s.inventoryOpen) return
    s.inventoryOpen = hud.showBag(false)
    if (relock && !s.ended) engagePointer()
  }

  // The tab `step` places from the shown one, wrapping.
  const stepBagTab = (step: number) => {
    const at = PACK_TABS.indexOf(hud.bagTab)
    showBagTab(PACK_TABS[stepIndex(at, PACK_TABS.length, step)])
  }

  const assignSlot = (slot: number, kind: string) => {
    const bar = assign(s.hotbar, slot, kind)
    s.hotbar = bar
    s.hotbarSaved = s.hotbarSaved
      .then(() => saveHotbar(bar))
      .then((saved) => {
        if (!saved.ok) hud.tell(saved.error)
      })
  }

  const endRaid = () => {
    s.ended = true
    hud.prompt(null)
    hud.itemLabel(null)
    closeInventory()
    if (document.pointerLockElement) document.exitPointerLock()
    player.locked = false
    hud.showIntro(false)
    hud.showSummary(summary(s.raid))
    if (s.shared && s.raid.extract)
      net.send({ type: 'extract', kind: s.raid.extract })
  }

  // Played alone the truck leaves on the joyride with the player aboard,
  // or, when the clock runs out on an empty bed, for Matthew Marx's donuts.
  const truckLeaves = (aboard: boolean) => {
    const donuts = aboard ? null : game.donutRoute(Date.now())
    if (donuts) truck.driveDonuts(donuts, null)
    else truck.driveRoute(game.departRoute)
  }

  const boardTruck = () => {
    if (s.shared) {
      // In the valley the truck waits for everyone in the lobby, or for
      // the clock. Boarding is a word to the server; the raid frame that
      // comes back moves the raid.
      if (s.aboard || s.raid.state !== STATES.LOADOUT) return
      s.aboard = true
      net.send({ type: 'board' })
      hud.tell(copy('log.board'))
      closeInventory()
      return
    }
    const next = advance(s.raid, EVENTS.BOARD_TRUCK, s.raidClock)
    if (next === s.raid) return
    s.raid = next
    truckLeaves(true)
    hud.tell(copy('log.board'))
    s.onTruckRolls = [copy('log.truck_leaves'), copy('log.hop_out_hint')]
    closeInventory()
  }

  const hopOut = (line?: string) => {
    if (s.aboard) {
      // Back off the bed before it leaves.
      s.aboard = false
      net.send({ type: 'unboard' })
      const spot = truck.hopOutSpot()
      player.relocate(spot.x, spot.z, player.yaw)
      if (line) hud.tell(line)
      return
    }
    const next = advance(s.raid, EVENTS.HOP_OUT, s.raidClock)
    if (next === s.raid) return
    s.raid = next
    const spot = truck.hopOutSpot()
    player.relocate(spot.x, spot.z, player.yaw)
    if (line) hud.tell(line)
    if (s.shared) net.send({ type: 'hop-out' })
  }

  // Static, then you come to on the forecourt.
  const strike = () => {
    const next = advance(s.raid, EVENTS.STRUCK, s.raidClock)
    if (next === s.raid) return
    s.raid = next
    s.strikeUntil = performance.now() + CONFIG.shadowmen.strikeSeconds * 1000
    hud.showStatic(true)
    closeInventory()
    player.keys.clear()
    player.relocate(world.spawn.x, world.spawn.z, world.spawn.yaw)
    hud.tell(copy('log.struck'))
  }

  const callTruck = () => {
    if (s.raid.state !== STATES.ON_FOOT || s.raid.truckCalled) return
    if (s.shared?.call) {
      hud.tell(copy('log.truck_busy'))
      return
    }
    // From wherever the truck is, the donut field included.
    const from = { x: truck.x, z: truck.z }
    const to = { x: player.pos.x, z: player.pos.z }
    const route = callRoute(graph, from, to)
    if (!route || route.length < 2) {
      hud.tell(copy('log.whistle_nothing'))
      return
    }
    if (s.shared) {
      // One whistle for the whole valley; the raid frame drives the truck.
      net.send({ type: 'call', from, to })
      return
    }
    s.raid = advance(s.raid, EVENTS.CALL_TRUCK, s.raidClock)
    truck.driveRoute(route)
    hud.tell(copy('log.whistle'))
  }

  const pocket = (kind: string) => {
    const { next, line } = settle(
      { inventory: s.inventory, cash: s.cash },
      kind
    )
    if (next) {
      const inventoryChanged = next.inventory !== s.inventory
      s.inventory = next.inventory
      s.cash = next.cash
      if (inventoryChanged) refreshBag()
    }
    if (line) hud.tell(line)
  }

  const buy = (shelf: ShelfSpot) => {
    const { next, line } = buyItem(
      { stock: s.storeStock, inventory: s.inventory, cash: s.cash },
      shelf.station,
      shelf.item,
      shelf.unit
    )
    if (!next) {
      if (line) hud.tell(line)
      return
    }
    if (s.shared) {
      // The shelf is the valley's: ask, and pocket the unit when the
      // valley says it was still there. The judgement above (stock as
      // last heard, cash) stands; the valley settles the race.
      const key = `${shelf.station}:${shelf.item}`
      if (s.pendingBuys.has(key)) return
      s.pendingBuys.add(key)
      net.send({
        type: 'buy',
        station: shelf.station,
        kind: shelf.item,
        unit: shelf.unit,
      })
      return
    }
    const inventoryChanged = next.inventory !== s.inventory
    s.storeStock = [...next.stock]
    s.inventory = next.inventory
    s.cash = next.cash
    if (inventoryChanged) refreshBag()
    if (line) hud.tell(line)
  }

  // E at the bush: ask the valley for today's berry, or say why not.
  const collectBerry = (status: DailyStatus) => {
    if (status === 'offline') {
      hud.tell(copy('log.berry_offline'))
      return
    }
    if (status === 'picked') {
      hud.tell(copy('log.berry_picked'))
      return
    }
    if (s.pendingCollect) return
    s.pendingCollect = true
    net.send({ type: 'collect' })
  }

  // A berry into the pack, or not today.
  const applyDaily = (msg: DailyMessage) => {
    s.pendingCollect = false
    s.daily = msg.daily
    if (!msg.picked) {
      hud.tell(copy('log.berry_picked'))
      return
    }
    s.inventory = addItem(s.inventory, 'berries', 1)
    refreshBag()
    hud.tell(getItem('berries').collected)
  }

  // Marx, Carlsten and Moab each say their next line into this player's
  // chat log alone; the valley never hears it.
  const speakTo = (npc: NpcId) => {
    hud.chatLine(
      {
        kind: 'npc',
        name: outfitById(npc).label,
        text: npcLine(npc, s.npcSaid[npc]++),
        at: Date.now(),
      },
      performance.now()
    )
  }

  // An item with no effect yet does nothing, and a cigarette waits for the
  // one burning.
  const useKind = (kind: string) => {
    const result = consume(s.inventory, kind, s.effects, s.time)
    if (!result.used) {
      const empty = result.reason === 'empty' ? itemById(kind)?.empty : null
      if (empty) hud.tell(empty)
      return
    }
    s.inventory = result.inv
    s.effects = result.effects
    // The unit is the account's: the valley takes it out of the pack.
    net.send({ type: 'use', kind })
    refreshBag()
    const used = itemById(kind)?.used
    if (used) hud.tell(used)
  }

  const applyTake = (pickup: Pickup) => {
    if (pickup.kind === 'cabbage') {
      if (!canPick(s.raid)) {
        hud.tell(copy('log.arms_full'))
        return
      }
      s.raid = advance(s.raid, EVENTS.PICK_CABBAGE, s.raidClock)
      markTaken(pickup)
      hud.tell(copy('log.taken', { item: copy('labels.cabbage') }))
    } else {
      markTaken(pickup)
      s.inventory = addItem(s.inventory, pickup.kind, pickup.count)
      hud.tell(copy('log.taken', { item: pickupLabel(pickup) }))
    }
    s.interaction = null
    hud.prompt(null)
    hud.itemLabel(null)
  }

  const markTaken = (pickup: Pickup) => {
    pickup.taken = true
    pickup.mesh.visible = false
  }

  const takePickup = (pickup: Pickup) => {
    if (!s.shared) {
      applyTake(pickup)
      return
    }
    // Pickups are shared by index: ask, and take it when the valley says
    // it is ours. A full pair of arms is refused here, not there.
    const index = world.pickups.indexOf(pickup)
    if (index < 0 || s.pendingTakes.has(index)) return
    if (pickup.kind === 'cabbage' && !canPick(s.raid)) {
      hud.tell(copy('log.arms_full'))
      return
    }
    s.pendingTakes.add(index)
    net.send({ type: 'take', index })
  }

  // Gron's dialog: the pointer comes free for it and the game stands aside
  // (talking). He changes the name the valley knows and the body worn. The
  // raid clock does not stop for him.
  const talkToGron = () => {
    if (s.talking) return
    s.talking = true
    player.keys.clear()
    if (document.pointerLockElement) document.exitPointerLock()
    const { pick } = game
    void openGronDialog({
      username: pick.username,
      outfit: pick.outfit,
      finish: pick.finish,
      onRenamed: (name) => {
        pick.username = name
        hud.setRaider(name)
        net.send({ type: 'rename' })
      },
      onBecome: (outfit, finish) => {
        void saveLook({ outfit, finish }).then((saved) => {
          if (!saved.ok) hud.tell(saved.error)
        })
        pick.finish = finish
        game.playerBody.restyle(outfit, finishById(finish).color)
        pick.outfit = outfit
        // A reconnect says hello in the new body too.
        net.setOutfit(outfit)
        net.send({ type: 'appearance', outfit })
      },
    }).then(() => {
      s.talking = false
      engagePointer()
    })
  }

  const interact = () => {
    // The raid state is live; the interaction is from the last frame.
    if (s.aboard) {
      hopOut(copy('log.hop_out_wait'))
      return
    }
    if (s.raid.state === STATES.RIDING) {
      hopOut(copy('log.hop_out_moving'))
      return
    }
    const interaction = s.interaction
    switch (interaction?.kind) {
      case 'board':
        boardTruck()
        return
      case 'boardExtract':
        s.raid = advance(s.raid, EVENTS.BOARD_TRUCK, s.raidClock, {
          arrived: true,
        })
        if (s.raid.state === STATES.EXTRACTED) endRaid()
        return
      case 'extractFuel':
        s.raid = advance(
          s.raid,
          EVENTS.EXTRACT_FUEL,
          s.raidClock,
          interaction.name
        )
        if (s.raid.state === STATES.EXTRACTED) endRaid()
        return
      case 'extractKeep':
        s.raid = advance(s.raid, EVENTS.EXTRACT_KEEP, s.raidClock)
        if (s.raid.state === STATES.EXTRACTED) endRaid()
        return
      case 'pickup':
        takePickup(interaction.pickup)
        return
      case 'buy':
        buy(interaction)
        return
      case 'collect':
        collectBerry(interaction.status)
        return
      case 'talk':
        talkToGron()
        return
      case 'speak':
        speakTo(interaction.npc)
        return
    }
  }

  // The valley echoes the line back to everyone. Offline the line still
  // shows, to no one else.
  const say = (typed: string) => {
    const text = normalizeChat(typed)
    if (!text) return
    if (net.online) {
      net.send({ type: 'chat', text })
      return
    }
    hud.chatLine(
      { kind: 'say', name: game.pick.username, text, at: Date.now() },
      performance.now()
    )
    hud.tell(CHAT_COPY.offline)
  }

  return {
    refreshBag,
    openInventory,
    closeInventory,
    stepBagTab,
    assignSlot,
    truckLeaves,
    hopOut,
    strike,
    callTruck,
    pocket,
    applyDaily,
    useKind,
    applyTake,
    markTaken,
    interact,
    say,
  }
}
