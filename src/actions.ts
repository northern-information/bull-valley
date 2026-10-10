// What the player does: climb into the truck and out, take, buy, pick a
// berry, use an item, drop one and take a drop up, whistle for the truck,
// talk, the pack and the hotbar.
// Played alone each one moves the valley at once; in the shared valley the
// ones that touch the valley's world are a word to the server, and the
// world frame that comes back moves it (valleysync.ts). The rules are the
// pure modules'; this is the glue that applies them and says so.

import { saveHotbar, saveLook } from './auth.ts'
import { CHAPTERS, entryOf, newlyFound } from './book.ts'
import { portraitOf } from './bookportraits.ts'
import {
  CHAT_COPY,
  chatCommand,
  emoteLine,
  emotesLine,
  onlineLine,
} from './chat.ts'
import { CONFIG } from './config.ts'
import { copy } from './copy.ts'
import { corpseWire, emptied, fallen, isEmpty, recover } from './corpses.ts'
import { affords, cosmeticById } from './cosmetics.ts'
import { stepIndex } from './cycle.ts'
import { isDropPickup } from './dropmeshes.ts'
import {
  centsOf,
  DIMES,
  dropAmount,
  dropSpot,
  isCash,
  spillsOf,
} from './drops.ts'
import { finishById } from './finishes.ts'
import { dose } from './geometrie.ts'
import { burialsOf, bury } from './graves.ts'
import { openGronDialog } from './grondialog.ts'
import { hit, isWhole, MAX_HEALTH, mend } from './health.ts'
import { assign, clearSlot as clearHotbarSlot, place, spent } from './hotbar.ts'
import { pickupLabel } from './interactions.ts'
import { addItem, consume } from './inventory.ts'
import { getItem, healsOf, itemById } from './items.ts'
import { board, call, hopOut as hopOutOf, refused } from './marx.ts'
import { npcLine } from './npcs.ts'
import { outfitById } from './outfits.ts'
import {
  bagTabs,
  LOCKER_TAB,
  PACK_TABS,
  packItems,
  stashItems,
} from './packgrid.ts'
import { levelOf } from './progression.ts'
import { normalizeChat } from './protocol.ts'
import { callRoute } from './roadgraph.ts'
import { inHaven } from './shadowmen.ts'
import { buy as buyItem, settle } from './shop.ts'
import { openStandDialog } from './standdialog.ts'
import { move, moveAmount } from './stash.ts'
import { formatCash } from './store.ts'
import { planLeg } from './truckplan.ts'
import type { ChatCommand } from './chat.ts'
import type { CosmeticId } from './cosmetics.ts'
import type { EmoteId } from './emotes.ts'
import type { Game } from './game.ts'
import type { Hotbar } from './hotbar.ts'
import type { DailyStatus, ShelfSpot } from './interactions.ts'
import type { Leg, TruckState } from './marx.ts'
import type { NpcId } from './npcs.ts'
import type { BagAction, BagTab } from './packgrid.ts'
import type { DailyMessage } from './protocol.ts'
import type { Burst } from './shadowmen.ts'
import type { Pickup } from './world.ts'

export interface Actions {
  // Redraw the open pack after anything that changes what you carry. The
  // hotbar follows on its own, every frame.
  refreshBag(): void
  // The pack; at the locker, with the Locker tab after its own.
  openInventory(atLocker?: boolean): void
  // relock: closed by the player's own key or click, a gesture that may
  // lock the pointer again. Closed by the valley (a strike, the truck),
  // the pointer stays free and the resume prompt shows.
  closeInventory(relock?: boolean): void
  // A or D in the pack: the tab to the left (-1) or right (+1), wrapping.
  stepBagTab(step: number): void
  // B: the Book of Shadows over the valley, with the pointer free for it.
  openBook(): void
  // relock as closeInventory's.
  closeBook(relock?: boolean): void
  // A or D in the book: the chapter to the left or right, wrapping; W or
  // S: the entry above or below.
  stepChapter(step: number): void
  stepEntry(step: number): void
  // Entries of the Book of Shadows this raider has just come across
  // (book.ts ids): asked of the valley, or played alone written at once.
  // Anything found or already asked is left out, so the loop may call it
  // every frame.
  discover(ids: readonly string[]): void
  // Entries the valley wrote in the account's book: news, each one.
  applyBook(found: readonly string[]): void
  // The valley could not take the last ask; ask again.
  bookRefused(): void
  // The account's book as the valley keeps it (the welcome): no news.
  setBook(found: ReadonlySet<string>): void
  // A number key over an item in the pack puts it on that slot, or takes
  // it off when it is there already.
  assignSlot(slot: number, kind: string): void
  // A number key over nothing in the pack empties that slot, as for a kind
  // the pack has run out of.
  clearSlot(slot: number): void
  // The truck drives `leg` (marx.ts): the valley's, or our own alone.
  followLeg(leg: Leg): void
  // Played alone, the truck as it now stands: its leg followed when it
  // changed, and off the bed when it lets us off.
  setAloneTruck(truck: TruckState): void
  hopOut(line?: string): void
  // Off the bed beside the truck, with no word to the valley: it let us
  // off.
  leaveBed(line?: string): void
  // A shadow touched you: one point of health off (sharedworld.ts rule
  // 22), the valley's word on what is left, or alone our own. The last one
  // shatters your geometrie, and everything the pack held stays on your
  // body where you fell (rule 18).
  strike(by?: 'shadowman' | 'caretaker', health?: number): void
  // The account's health as the valley says it (a forecourt, medicine).
  setHealth(points: number): void
  // Played alone, a forecourt makes whole.
  mendAtForecourt(): void
  // Played alone, the bodies this raider left, drawn and offered to E.
  showAloneCorpses(): void
  // F at the locker: one of an item (the open container, or one of
  // anything else) into the locker off a pack tab, or out of it on the
  // Locker tab; with Shift the whole stack (rule 19).
  stowKind(kind: string, all: boolean): void
  unstowKind(kind: string, all: boolean): void
  callTruck(): void
  // The buyer's side of a sale, once the valley says the unit is ours.
  pocket(kind: string): void
  // The valley's answer at the bush.
  applyDaily(msg: DailyMessage): void
  // Moab, within reach, makes his offer (once per approach).
  offerTrade(): void
  // The account's cosmetics as the valley has them now; a new one is
  // Moab's trade landing.
  wear(cosmetics: CosmeticId[]): void
  // The valley refused the trade.
  tradeRefused(reason: string): void
  // One of an item, used: E over it in the pack, or its hotbar key.
  useKind(kind: string): void
  // X over an item in the pack: one of it set down (the open container,
  // or one of anything else), or with Shift the whole stack.
  dropKind(kind: string, all: boolean): void
  // The valley says a drop came up into our pack.
  applyDropTaken(kind: string, count: number): void
  // Shadowmen burst: played alone, their dimes (a spider's $20) fall where
  // they were and their tombstones stand beside them.
  spillBursts(bursts: readonly Burst[]): void
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

// After the valley refuses a Book of Shadows ask, the next waits this long.
const BOOK_RETRY_MS = 3000

// engagePointer takes the pointer back once Gron's dialog closes.
export function createActions(game: Game, engagePointer: () => void): Actions {
  const { state: s, hud, net, peers, player, truck, world, graph } = game

  const refreshBag = () => {
    if (s.inventoryOpen) {
      const tab = hud.bagTab
      hud.setBag(
        tab === LOCKER_TAB ? stashItems(s.stash) : packItems(s.inventory, tab),
        (kind) => game.thumbs.icon(kind)
      )
    }
  }

  const showBagTab = (tab: BagTab) => {
    hud.selectBagTab(tab)
    refreshBag()
  }
  hud.onBagTab = showBagTab

  // The pack opens over the valley with the pointer free for it, as Gron's
  // dialog does, on its first tab; the player freezes, the valley does not.
  const openInventory = (atLocker = false) => {
    player.keys.clear()
    s.lockerOpen = atLocker
    hud.setLocker(atLocker)
    s.inventoryOpen = hud.showBag(true)
    showBagTab(PACK_TABS[0])
    if (document.pointerLockElement) document.exitPointerLock()
  }

  const closeInventory = (relock = false) => {
    if (!s.inventoryOpen) return
    s.inventoryOpen = hud.showBag(false)
    s.lockerOpen = false
    hud.setLocker(false)
    if (relock) engagePointer()
  }

  // The tab `step` places from the shown one, wrapping.
  const stepBagTab = (step: number) => {
    const tabs = bagTabs(s.lockerOpen)
    const at = tabs.indexOf(hud.bagTab)
    showBagTab(tabs[stepIndex(at, tabs.length, step)])
  }

  // The book turns its pages through these, and draws each on the
  // pack's renderer.
  const bookHud = hud.book
  bookHud.onChapter = (chapter) => bookHud.showChapter(chapter)
  bookHud.onSelect = (id) => bookHud.select(id)
  bookHud.onPage = (entry, found) => {
    const { build, fitAs } = portraitOf(entry)
    game.thumbs.spinModel(
      bookHud.portrait,
      `book:${entry.id}`,
      build,
      !found,
      fitAs
    )
  }

  const openBook = () => {
    closeInventory()
    player.keys.clear()
    s.bookOpen = hud.showBook(true)
    if (document.pointerLockElement) document.exitPointerLock()
  }

  const closeBook = (relock = false) => {
    if (!s.bookOpen) return
    s.bookOpen = hud.showBook(false)
    game.thumbs.stop()
    if (relock) engagePointer()
  }

  const stepChapter = (step: number) => {
    const at = CHAPTERS.indexOf(bookHud.chapter)
    bookHud.showChapter(CHAPTERS[stepIndex(at, CHAPTERS.length, step)])
  }

  const stepEntry = (step: number) => bookHud.step(step)

  const setBook = (found: ReadonlySet<string>) => {
    s.book = new Set(found)
    s.bookAsked.clear()
    bookHud.setFound(s.book)
  }

  const applyBook = (found: readonly string[]) => {
    const names: string[] = []
    for (const id of found) {
      s.bookAsked.delete(id)
      if (s.book.has(id)) continue
      s.book.add(id)
      const entry = entryOf(id)
      if (entry) names.push(entry.name)
    }
    bookHud.setFound(s.book)
    bookHud.announce(names)
  }

  // A refused ask waits this long before the next (local ms), so the loop
  // never asks again every frame.
  let bookWaitUntil = 0
  const bookRefused = () => {
    s.bookAsked.clear()
    bookWaitUntil = performance.now() + BOOK_RETRY_MS
  }

  const discover = (ids: readonly string[]) => {
    if (ids.length === 0 || performance.now() < bookWaitUntil) return
    const fresh = newlyFound(new Set([...s.book, ...s.bookAsked]), ids)
    if (fresh.length === 0) return
    // Online, the valley writes it and says so. Before it has welcomed us,
    // or while it is out of reach after it had, nothing is asked, and a
    // later frame asks again; only played alone is it written here.
    if (net.online && s.world) {
      for (const id of fresh) s.bookAsked.add(id)
      net.send({ type: 'discover', entries: fresh })
    } else if (net.status === 'offline' && !s.world) {
      applyBook(fresh)
    }
  }

  const keepHotbar = (bar: Hotbar) => {
    if (bar === s.hotbar) return
    s.hotbar = bar
    s.hotbarSaved = s.hotbarSaved
      .then(() => saveHotbar(bar))
      .then((saved) => {
        if (!saved.ok) hud.tell(saved.error)
      })
  }

  const assignSlot = (slot: number, kind: string) =>
    keepHotbar(assign(s.hotbar, slot, kind))

  const clearSlot = (slot: number) =>
    keepHotbar(clearHotbarSlot(s.hotbar, slot))

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

  // Played alone, the bodies are ours to draw and offer.
  const showAloneCorpses = () => {
    if (s.world) return
    s.corpses = s.aloneCorpses.map(corpseWire)
    s.myCorpses = s.aloneCorpses.map((c) => c.id)
    game.corpses.sync(s.corpses)
  }

  // Static, then you come to on the forecourt: a shadowman's touch, or
  // the Caretaker's. Everything the pack held stays on your body where you
  // fell (rule 18): in the valley the valley lays it and its pack frame has
  // the last word, so the pack shows empty at once; alone it lies at once.
  const strike = (
    by: 'shadowman' | 'caretaker' = 'shadowman',
    health?: number
  ) => {
    if (s.aboard) {
      // Touched as we climbed in: the valley's count stands all the same.
      if (health !== undefined) s.health = health > 0 ? health : MAX_HEALTH
      return
    }
    const now = performance.now()
    s.emoting = null
    s.health = health ?? hit(s.health).points
    s.graceUntil = now + CONFIG.health.graceSeconds * 1000
    s.hurtAt = now
    hud.hurt()
    if (s.health > 0) {
      hud.tell(copy(by === 'caretaker' ? 'log.hit_caretaker' : 'log.hit'))
      return
    }
    // Shattered: whole again where you come to.
    s.health = MAX_HEALTH
    s.strikes += 1
    s.strikeUntil = now + CONFIG.shadowmen.strikeSeconds * 1000
    hud.showStatic(true)
    closeInventory()
    closeBook()
    player.keys.clear()
    const items = fallen(s.inventory)
    if (!isEmpty(items)) {
      if (!s.world) {
        s.aloneCorpses = [
          ...s.aloneCorpses,
          {
            id: s.nextCorpse++,
            x: player.pos.x,
            z: player.pos.z,
            yaw: player.yaw,
            name: game.pick.username,
            outfit: game.pick.outfit,
            items,
          },
        ]
        showAloneCorpses()
      }
      s.inventory = emptied(s.inventory)
      refreshBag()
    }
    player.relocate(world.spawn.x, world.spawn.z, world.spawn.yaw)
    hud.tell(copy(by === 'caretaker' ? 'log.caught' : 'log.struck'))
    if (!isEmpty(items)) hud.tell(copy('log.fell'))
  }

  // Made whole standing at a Citgo: the lights did it.
  const setHealth = (points: number) => {
    const mended =
      isWhole(points) &&
      !isWhole(s.health) &&
      inHaven(player.pos, world.fuelPoints, CONFIG.shadowmen.havenRadius)
    s.health = points
    if (mended) hud.tell(copy('log.mended'))
  }

  // Played alone, a forecourt makes whole (rule 24).
  const mendAtForecourt = () => {
    if (isWhole(s.health)) return
    s.health = MAX_HEALTH
    hud.tell(copy('log.mended'))
  }

  // E over your own body: everything it holds back into the pack. In the
  // valley the valley says it was still there (valleysync.ts) and its pack
  // frame brings the things back; alone they come back at once.
  const lootCorpse = (id: number) => {
    if (s.world) {
      if (s.pendingLoots.has(id)) return
      s.pendingLoots.add(id)
      net.send({ type: 'loot', corpse: id })
      return
    }
    const corpse = s.aloneCorpses.find((c) => c.id === id)
    if (!corpse) return
    s.aloneCorpses = s.aloneCorpses.filter((c) => c.id !== id)
    showAloneCorpses()
    s.inventory = recover(s.inventory, corpse.items)
    refreshBag()
    hud.tell(copy('log.looted'))
  }

  // E at the lockers: the pack with the Locker tab. The stash is the
  // account's, so played alone there is none to open.
  const openLocker = () => {
    if (!s.world) {
      hud.tell(copy('log.locker_offline'))
      return
    }
    openInventory(true)
  }

  // One side of the locker to the other, shown at once; the valley's pack
  // frame has the last word.
  const restash = (kind: string, all: boolean, stow: boolean) => {
    if (!s.lockerOpen || !s.world) return
    const from = stow ? s.inventory : s.stash
    const count = moveAmount(kind, from[kind] || 0, all)
    const moved = stow
      ? move(s.inventory, s.stash, kind, count)
      : move(s.stash, s.inventory, kind, count)
    if (!moved) return
    s.inventory = stow ? moved.from : moved.to
    s.stash = stow ? moved.to : moved.from
    keepHotbar(spent(s.hotbar, kind, s.inventory))
    net.send({ type: stow ? 'stow' : 'unstow', kind, count })
    refreshBag()
    hud.tell(
      copy(stow ? 'log.stowed' : 'log.unstowed', {
        item: pickupLabel({ kind, count }),
      })
    )
  }

  // E at the Cabbage Stand: its dialog, the pointer free for it as for
  // Gron's. The stand is the account's (rule 23), so played alone there is
  // none. Every change is the valley's to make: the dialog asks, and the
  // stand and pack frames that answer show in it as they land.
  const tendStand = () => {
    if (s.talking) return
    if (!s.world || !s.stand) {
      hud.tell(copy('log.stand_offline'))
      return
    }
    s.talking = true
    s.standSaid = null
    player.keys.clear()
    if (document.pointerLockElement) document.exitPointerLock()
    const ask = (msg: Parameters<typeof net.send>[0]) => {
      s.pendingStand = true
      s.standSaid = null
      net.send(msg)
    }
    void openStandDialog({
      goods: CONFIG.stand.goods,
      ledger: () => (s.world ? s.stand : null),
      pack: () => s.inventory,
      cash: () => s.cash,
      now: () => net.clock.serverNow(performance.now()),
      pending: () => s.pendingStand,
      said: () => s.standSaid,
      onStock: (kind, count) => ask({ type: 'stand-stock', kind, count }),
      onCollect: () => ask({ type: 'stand-collect' }),
      onUpgrade: () => ask({ type: 'stand-upgrade' }),
    }).then(() => {
      s.talking = false
      engagePointer()
    })
  }

  const stowKind = (kind: string, all: boolean) => restash(kind, all, true)
  const unstowKind = (kind: string, all: boolean) => restash(kind, all, false)

  // The mouse in the open pack, done as its keys do it (input.ts).
  const bagAction = (action: BagAction) => {
    switch (action.type) {
      case 'use':
        if (hud.bagTab !== LOCKER_TAB) useKind(action.kind)
        return
      case 'place':
        keepHotbar(place(s.hotbar, action.slot, action.kind))
        return
      case 'clear':
        clearSlot(action.slot)
        return
      case 'drop':
        if (hud.bagTab !== LOCKER_TAB) dropKind(action.kind, action.all)
        return
      case 'move':
        restash(action.kind, action.all, hud.bagTab !== LOCKER_TAB)
        return
    }
  }
  hud.onBagAction = bagAction

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
      // One whistle for the whole valley; the world frame drives the truck
      // to where the valley last heard the whistler.
      net.send({ type: 'call', from })
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

  // A line from an NPC into this player's chat log alone; the valley never
  // hears it.
  const npcSays = (npc: NpcId, text: string) => {
    hud.chatLine(
      { kind: 'npc', name: outfitById(npc).label, text, at: Date.now() },
      performance.now()
    )
  }

  // Marx, Carlsten and Moab each say their next line.
  const speakTo = (npc: NpcId) => {
    npcSays(npc, npcLine(npc, s.npcSaid[npc]++))
  }

  // Rule 14: Moab's offer, taken. In the shared valley the valley trades
  // and the pack frame that follows says it landed (wear); alone, the pack
  // pays at once.
  const offerTrade = () => {
    npcSays('moab', copy('moab.offer'))
  }

  const wear = (cosmetics: CosmeticId[]) => {
    const gained = cosmetics.filter((id) => !s.cosmetics.includes(id))
    s.cosmetics = cosmetics
    s.pendingTrade = false
    for (const id of gained) {
      npcSays('moab', copy('moab.traded'))
      const label = cosmeticById(id)?.label ?? id
      hud.tell(copy('log.cosmetic_worn', { cosmetic: label }))
    }
  }

  const tradeRefused = (reason: string) => {
    s.pendingTrade = false
    const cosmetic =
      s.interaction?.kind === 'trade' ? cosmeticById(s.interaction.offer) : null
    if (reason === 'short' && cosmetic) {
      hud.tell(
        copy('log.trade_short', {
          count: cosmetic.price.count,
          price: itemById(cosmetic.price.kind)?.label ?? cosmetic.price.kind,
        })
      )
    } else if (reason === 'owned' && cosmetic) {
      hud.tell(copy('log.trade_owned', { cosmetic: cosmetic.label }))
    } else hud.tell(copy('log.trade_refused'))
  }

  const trade = (offer: CosmeticId) => {
    if (s.pendingTrade) return
    const cosmetic = cosmeticById(offer)
    if (!cosmetic || s.cosmetics.includes(offer)) return
    if (!affords(s.inventory, offer)) {
      tradeRefused('short')
      return
    }
    if (s.world) {
      s.pendingTrade = true
      net.send({ type: 'trade', offer })
      return
    }
    const { kind, count } = cosmetic.price
    s.inventory = { ...s.inventory, [kind]: (s.inventory[kind] ?? 0) - count }
    refreshBag()
    wear([...s.cosmetics, offer])
  }

  // An item with no effect yet does nothing, and a cigarette waits for the
  // one burning.
  const useKind = (kind: string) => {
    // Medicine that heals is kept for when it is wanted.
    const heals = healsOf(kind)
    if (heals > 0 && isWhole(s.health) && (s.inventory[kind] ?? 0) > 0) {
      hud.tell(copy('log.whole'))
      return
    }
    const result = consume(s.inventory, kind, s.effects, s.time)
    if (!result.used) {
      const empty = result.reason === 'empty' ? itemById(kind)?.empty : null
      if (empty) hud.tell(empty)
      return
    }
    s.inventory = result.inv
    keepHotbar(spent(s.hotbar, kind, s.inventory))
    s.effects = result.effects
    s.geometrie = dose(s.geometrie, itemById(kind)?.geometrie, s.time)
    // The right hand brings it up (fphands.ts).
    s.using = { kind, at: s.time }
    // The unit is the account's: the valley takes it out of the pack, and
    // gives back what it heals; alone it heals at once.
    net.send({ type: 'use', kind })
    if (!s.world && heals > 0) s.health = mend(s.health, heals)
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
    keepHotbar(spent(s.hotbar, kind, s.inventory))
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

  // Into the pack, or cash (dimes, a spider's $20) into the wallet; the
  // valley's pack frame has the last word on both.
  const applyDropTaken = (kind: string, count: number) => {
    if (isCash(kind)) {
      const amount = count * centsOf(kind)
      s.cash += amount
      const paid = formatCash(amount)
      hud.tell(
        kind === DIMES
          ? copy('log.dimes', { count, amount: paid })
          : copy('log.twenty', { amount: paid })
      )
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
  // lying there, and each spider its $20 (sharedworld.ts rule 11), and its
  // tombstone, named, beside them (rule 17). In the valley the valley does
  // both.
  const spillBursts = (bursts: readonly Burst[]) => {
    if (s.world || bursts.length === 0) return
    const cash = spillsOf(bursts, null, Math.random).map((spill) => ({
      id: s.nextDrop++,
      ...spill,
    }))
    s.drops = [...s.drops, ...cash]
    game.drops.sync(s.drops)
    const buried = bury(s.graves, s.nextGrave, burialsOf(bursts, Math.random))
    s.graves = buried.graves
    s.nextGrave = buried.next
    game.graves.sync(s.graves)
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
      cosmetics: s.cosmetics,
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
        discover(['gron'])
        talkToGron()
        return
      case 'speak':
        discover([interaction.npc])
        speakTo(interaction.npc)
        return
      case 'trade':
        discover(['moab'])
        trade(interaction.offer)
        return
      case 'loot':
        lootCorpse(interaction.corpse)
        return
      case 'locker':
        openLocker()
        return
      case 'stand':
        tendStand()
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
        { name: game.pick.username, level: levelOf(s.xp) },
        peers.list().map(({ name, level }) => ({ name, level }))
      )
    )
  }

  // An emote (emotes.ts): the body takes its pose, which the next state
  // frame carries to everyone; never from the bed.
  const emote = (id: EmoteId) => {
    if (s.aboard) {
      hud.tell(copy('emotes.in_bed'))
      return
    }
    s.emoting = { id, since: performance.now() / 1000 }
    hud.tell(emoteLine(id, null))
  }

  // A slash command (chat.ts chatCommand). The friends' and the whisper's
  // go to the valley (rule 21); their answers come back in valleysync.ts.
  const runCommand = (command: ChatCommand) => {
    switch (command.name) {
      case 'online':
        tellOnline()
        return
      case 'emotes':
        hud.tell(emotesLine())
        return
      case 'emote':
        emote(command.id)
        return
      case 'unknown':
        hud.tell(copy('chat.unknown_command'))
        return
      case 'usage':
        hud.tell(command.line)
        return
    }
    if (!net.online) {
      hud.tell(CHAT_COPY.offline)
      return
    }
    switch (command.name) {
      case 'friends':
        s.showFriends = true
        net.send({ type: 'friends' })
        return
      case 'whisper':
        s.whisperTo = command.to
        net.send({ type: 'whisper', to: command.to, text: command.text })
        return
      case 'friend':
      case 'unfriend':
        s.pendingAsk = { op: command.name, name: command.who }
        net.send({ type: command.name, name: command.who })
        return
    }
  }

  const say = (typed: string) => {
    const text = normalizeChat(typed)
    if (!text) return
    const command = chatCommand(text)
    if (command) {
      runCommand(command)
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
    openBook,
    closeBook,
    stepChapter,
    stepEntry,
    discover,
    applyBook,
    bookRefused,
    setBook,
    assignSlot,
    clearSlot,
    followLeg,
    setAloneTruck,
    hopOut,
    leaveBed,
    strike,
    setHealth,
    mendAtForecourt,
    showAloneCorpses,
    stowKind,
    unstowKind,
    callTruck,
    pocket,
    applyDaily,
    offerTrade,
    wear,
    tradeRefused,
    useKind,
    dropKind,
    applyDropTaken,
    spillBursts,
    toggleFlashlight,
    applyTake,
    markTaken,
    markUntaken,
    interact,
    say,
  }
}
