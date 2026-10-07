// What the player does: climb into the truck and out, take, buy, pick a
// berry, use an item, drop one and take a drop up, whistle for the truck,
// talk, the pack and the hotbar.
// Played alone each one moves the valley at once; in the shared valley the
// ones that touch the valley's world are a word to the server, and the
// world frame that comes back moves it (valleysync.ts). The rules are the
// pure modules'; this is the glue that applies them and says so.

import { saveHotbar, saveLook } from './auth.ts'
import { CHAT_COPY, chatCommand, onlineLine } from './chat.ts'
import { CONFIG } from './config.ts'
import { copy } from './copy.ts'
import { stepIndex } from './cycle.ts'
import { isDropPickup } from './dropmeshes.ts'
import {
  DIME_CENTS,
  DIMES,
  dimesFor,
  dropAmount,
  dropSpot,
  isCash,
} from './drops.ts'
import { finishById } from './finishes.ts'
import { dose } from './geometrie.ts'
import { openGronDialog } from './grondialog.ts'
import { assign } from './hotbar.ts'
import { pickupLabel } from './interactions.ts'
import { addItem, consume } from './inventory.ts'
import { getItem, itemById } from './items.ts'
import { board, call, hopOut as hopOutOf, refused } from './marx.ts'
import { npcLine } from './npcs.ts'
import { outfitById } from './outfits.ts'
import { PACK_TABS, packItems } from './packgrid.ts'
import { normalizeChat } from './protocol.ts'
import { callRoute } from './roadgraph.ts'
import { buy as buyItem, settle } from './shop.ts'
import { formatCash } from './store.ts'
import { planLeg } from './truckplan.ts'
import type { Game } from './game.ts'
import type { DailyStatus, ShelfSpot } from './interactions.ts'
import type { XZ } from './interfaces.ts'
import type { Leg, TruckState } from './marx.ts'
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
  // lock the pointer again. Closed by the valley (a strike, the truck),
  // the pointer stays free and the resume prompt shows.
  closeInventory(relock?: boolean): void
  // A or D in the pack: the tab to the left (-1) or right (+1), wrapping.
  stepBagTab(step: number): void
  // A number key over an item in the pack puts it on that slot, or takes
  // it off when it is there already.
  assignSlot(slot: number, kind: string): void
  // The truck drives `leg` (marx.ts): the valley's, or our own alone.
  followLeg(leg: Leg): void
  // Played alone, the truck as it now stands: its leg followed when it
  // changed, and off the bed when it lets us off.
  setAloneTruck(truck: TruckState): void
  hopOut(line?: string): void
  // Off the bed beside the truck, with no word to the valley: it let us
  // off.
  leaveBed(line?: string): void
  // A shadowman touched you.
  strike(by?: 'shadowman' | 'caretaker'): void
  callTruck(): void
  // The buyer's side of a sale, once the valley says the unit is ours.
  pocket(kind: string): void
  // The valley's answer at the bush.
  applyDaily(msg: DailyMessage): void
  // One of an item, used: E over it in the pack, or its hotbar key.
  useKind(kind: string): void
  // X over an item in the pack: one of it set down (the open container,
  // or one of anything else), or with Shift the whole stack.
  dropKind(kind: string, all: boolean): void
  // The valley says a drop came up into our pack.
  applyDropTaken(kind: string, count: number): void
  // Shadowmen burst: played alone, their dimes fall where they were.
  spillDimes(bursts: readonly XZ[]): void
  // The left button: the flashlight up and on, or down and off.
  toggleFlashlight(): void
  // The pickup is ours: into the pack.
  applyTake(pickup: Pickup): void
  // Someone else got it.
  markTaken(pickup: Pickup): void
  // It came back with the day.
  markUntaken(pickup: Pickup): void
  // E: whatever the loop last resolved E to do.
  interact(): void
  // One line to the valley.
  say(typed: string): void
}

// engagePointer takes the pointer back once Gron's dialog closes.
export function createActions(game: Game, engagePointer: () => void): Actions {
  const { state: s, hud, net, peers, player, truck, world, graph } = game

  const refreshBag = () => {
    if (s.inventoryOpen) {
      hud.setBag(packItems(s.inventory, hud.bagTab), (kind) =>
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
    if (relock) engagePointer()
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

  // Played alone, this raider's id in the truck's bed.
  const ALONE = 'me'
  const me = () => (s.world ? net.id : ALONE)

  // The truck drives `leg`, against the valley's clock or, alone, the
  // wall clock.
  const followLeg = (leg: Leg) => {
    s.truckLeg = leg
    s.truckPlan = planLeg(leg, game.truckContext)
    const toLocal = s.world
      ? (ms: number) => net.clock.toLocalMs(ms)
      : (ms: number) => performance.now() + (ms - Date.now())
    truck.follow(s.truckPlan, toLocal)
  }

  const setAloneTruck = (next: TruckState) => {
    const before = s.aloneTruck
    s.aloneTruck = next
    if (s.world) return
    if (next.leg !== before.leg) followLeg(next.leg)
    if (s.aboard && !next.riders.includes(ALONE)) leaveBed()
  }

  // Into the bed: of the truck at the Citgo, where the countdown starts,
  // or of the truck we whistled, which drives us home.
  const boardTruck = () => {
    if (s.aboard) return
    closeInventory()
    if (s.world) {
      s.aboard = true
      s.pendingBoard = true
      net.send({ type: 'board' })
      hud.tell(copy('log.board'))
      return
    }
    const next = board(s.aloneTruck, ALONE, Date.now())
    if (refused(next)) return
    s.aboard = true
    hud.tell(copy('log.board'))
    setAloneTruck(next)
  }

  // Off the bed, beside the truck.
  const leaveBed = (line?: string) => {
    s.aboard = false
    const spot = truck.hopOutSpot()
    player.relocate(spot.x, spot.z, player.yaw)
    if (line) hud.tell(line)
  }

  const hopOut = (line?: string) => {
    if (!s.aboard) return
    leaveBed(line)
    if (s.world) {
      net.send({ type: 'hop-out' })
      return
    }
    const next = hopOutOf(s.aloneTruck, ALONE)
    if (!refused(next)) setAloneTruck(next)
  }

  // Static, then you come to on the forecourt: a shadowman's touch, or
  // the Caretaker's.
  const strike = (by: 'shadowman' | 'caretaker' = 'shadowman') => {
    if (s.aboard) return
    s.strikes += 1
    s.strikeUntil = performance.now() + CONFIG.shadowmen.strikeSeconds * 1000
    hud.showStatic(true)
    closeInventory()
    player.keys.clear()
    player.relocate(world.spawn.x, world.spawn.z, world.spawn.yaw)
    hud.tell(copy(by === 'caretaker' ? 'log.caught' : 'log.struck'))
  }

  // T: Marx comes to us, if he is free, and drives us home.
  const callTruck = () => {
    if (s.aboard) return
    const now = Date.now()
    const current = s.world?.truck ?? s.aloneTruck
    const id = me() ?? ''
    // From wherever the truck is, the donut field included.
    const from = { x: truck.x, z: truck.z }
    const to = { x: player.pos.x, z: player.pos.z }
    const next = call(current, id, from, to, now)
    if (refused(next)) {
      hud.tell(copy('log.truck_busy'))
      return
    }
    const route = callRoute(graph, from, to)
    if (!route || route.length < 2) {
      hud.tell(copy('log.whistle_nothing'))
      return
    }
    if (s.world) {
      // One whistle for the whole valley; the world frame drives the truck.
      net.send({ type: 'call', from, to })
      return
    }
    hud.tell(copy('log.whistle'))
    setAloneTruck(next)
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
    if (s.world) {
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

  // E at a bush: ask the valley for today's berry off it, or say why not.
  const collectBerry = (bush: number, status: DailyStatus) => {
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
    net.send({ type: 'collect', bush })
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
    s.geometrie = dose(s.geometrie, itemById(kind)?.geometrie, s.time)
    // The right hand brings it up (fphands.ts).
    s.using = { kind, at: s.time }
    // The unit is the account's: the valley takes it out of the pack.
    net.send({ type: 'use', kind })
    refreshBag()
    const used = itemById(kind)?.used
    if (used) hud.tell(used)
  }

  // Rule 12. In the valley the drop lands where our last state frame put
  // us; the pack shows the units gone at once. Alone it lands at once.
  const dropKind = (kind: string, all: boolean) => {
    if (s.aboard) {
      hud.tell(copy('log.drop_aboard'))
      return
    }
    const count = dropAmount(kind, s.inventory[kind] || 0, all)
    if (count < 1) return
    s.inventory = addItem(s.inventory, kind, -count)
    if (s.world) {
      net.send({ type: 'drop', kind, count })
      refreshBag()
      return
    }
    const id = s.nextDrop++
    const at = { x: player.pos.x, z: player.pos.z, yaw: player.yaw }
    s.drops = [...s.drops, { id, kind, count, ...dropSpot(at, id) }]
    game.drops.sync(s.drops)
    refreshBag()
    hud.tell(copy('log.dropped', { item: pickupLabel({ kind, count }) }))
  }

  // Into the pack, or dimes into the wallet; the valley's pack frame has
  // the last word on both.
  const applyDropTaken = (kind: string, count: number) => {
    if (isCash(kind)) {
      const amount = count * DIME_CENTS
      s.cash += amount
      hud.tell(copy('log.dimes', { count, amount: formatCash(amount) }))
    } else {
      s.inventory = addItem(s.inventory, kind, count)
      hud.tell(copy('log.taken', { item: pickupLabel({ kind, count }) }))
    }
    s.interaction = null
    hud.prompt(null)
    hud.itemLabel(null)
    refreshBag()
  }

  // Shadowmen burst where `bursts` say: played alone each leaves its dimes
  // lying there (sharedworld.ts rule 11). In the valley the valley spills
  // them.
  const spillDimes = (bursts: readonly XZ[]) => {
    if (s.world || bursts.length === 0) return
    const dimes = bursts.map(({ x, z }) => ({
      id: s.nextDrop++,
      kind: DIMES,
      count: dimesFor(Math.random),
      x,
      z,
    }))
    s.drops = [...s.drops, ...dimes]
    game.drops.sync(s.drops)
  }

  const takeDrop = (drop: number) => {
    if (s.world) {
      if (s.pendingDrops.has(drop)) return
      s.pendingDrops.add(drop)
      net.send({ type: 'take-drop', drop })
      return
    }
    const lying = s.drops.find((d) => d.id === drop)
    if (!lying) return
    s.drops = s.drops.filter((d) => d.id !== drop)
    game.drops.sync(s.drops)
    applyDropTaken(lying.kind, lying.count)
  }

  // The light comes on once the hand is up, and goes off as it goes down;
  // the valley hears it with the next state frame.
  const toggleFlashlight = () => {
    s.flashlight = { ...s.flashlight, up: !s.flashlight.up }
  }

  const applyTake = (pickup: Pickup) => {
    markTaken(pickup)
    s.inventory = addItem(s.inventory, pickup.kind, pickup.count)
    hud.tell(copy('log.taken', { item: pickupLabel(pickup) }))
    refreshBag()
    s.interaction = null
    hud.prompt(null)
    hud.itemLabel(null)
  }

  const markTaken = (pickup: Pickup) => {
    pickup.taken = true
    pickup.mesh.visible = false
  }

  const markUntaken = (pickup: Pickup) => {
    pickup.taken = false
    pickup.mesh.visible = true
  }

  const takePickup = (pickup: Pickup) => {
    if (isDropPickup(pickup)) {
      takeDrop(pickup.drop)
      return
    }
    if (!s.world) {
      applyTake(pickup)
      return
    }
    // Pickups are shared by index: ask, and take it when the valley says
    // it is ours.
    const index = world.pickups.indexOf(pickup)
    if (index < 0 || s.pendingTakes.has(index)) return
    s.pendingTakes.add(index)
    net.send({ type: 'take', index })
  }

  // Gron's dialog: the pointer comes free for it and the game stands aside
  // (talking). He changes the name the valley knows and the body worn. The
  // valley does not stop for him.
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
        game.hands.restyle(outfit)
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
    // Whether we are aboard is live; the interaction is from the last frame.
    if (s.aboard) {
      hopOut(copy(truck.moving ? 'log.hop_out_moving' : 'log.hop_out_wait'))
      return
    }
    const interaction = s.interaction
    switch (interaction?.kind) {
      case 'board':
        boardTruck()
        return
      case 'pickup':
        takePickup(interaction.pickup)
        return
      case 'buy':
        buy(interaction)
        return
      case 'collect':
        collectBerry(interaction.bush, interaction.status)
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
  // /online: who is in the valley, by name.
  const tellOnline = () => {
    if (!net.online) {
      hud.tell(CHAT_COPY.offline)
      return
    }
    hud.tell(
      onlineLine(
        game.pick.username,
        peers.list().map((peer) => peer.name)
      )
    )
  }

  const say = (typed: string) => {
    const text = normalizeChat(typed)
    if (!text) return
    const command = chatCommand(text)
    if (command === 'online') {
      tellOnline()
      return
    }
    if (command === 'unknown') {
      hud.tell(copy('chat.unknown_command'))
      return
    }
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
    followLeg,
    setAloneTruck,
    hopOut,
    leaveBed,
    strike,
    callTruck,
    pocket,
    applyDaily,
    useKind,
    dropKind,
    applyDropTaken,
    spillDimes,
    toggleFlashlight,
    applyTake,
    markTaken,
    markUntaken,
    interact,
    say,
  }
}
