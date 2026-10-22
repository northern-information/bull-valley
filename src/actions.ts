// What the player does: climb into the truck and out, take, buy, pick a
// berry, use an item, drop one and take a drop up, whistle for the truck,
// talk, the pack and the hotbar.
// The ones that touch the valley's world are a word to the server, and
// the world frame that comes back moves it (valleysync.ts). The rules are the
// pure modules'; this is the glue that applies them and says so.

import { saveHotbar, saveLook } from './auth.ts'
import { bountyLine, CHAPTERS, entryOf, knownOf, newlyFound } from './book.ts'
import { portraitOf } from './bookportraits.ts'
import { passTarget } from './buffs.ts'
import {
  CHAT_COPY,
  chatCommand,
  emoteLine,
  emotesLine,
  onlineLine,
} from './chat.ts'
import {
  arrivalAt,
  citgoAt,
  citgoLines,
  fastTravel as fastTravelTo,
} from './citgos.ts'
import { CONFIG } from './config.ts'
import { copy } from './copy.ts'
import { emptied, fallen, isEmpty, spilledDimes } from './corpses.ts'
import { affords, cosmeticById, gainedOf, tradeRefusal } from './cosmetics.ts'
import { crewLines, crewNamed } from './crews.ts'
import { stepIndex } from './cycle.ts'
import { openDealDialog } from './dealdialog.ts'
import { ramble } from './dealer.ts'
import { isDropPickup } from './dropmeshes.ts'
import {
  centsOf,
  DIME_CENTS,
  DIMES,
  dropAmount,
  isCash,
  QUARTERS,
} from './drops.ts'
import { finishById } from './finishes.ts'
import { openGronDialog } from './grondialog.ts'
import { assign, clearSlot as clearHotbarSlot, place, spent } from './hotbar.ts'
import { befriended, partied } from './inspect.ts'
import { openInspectDialog } from './inspectdialog.ts'
import { pickupLabel } from './interactions.ts'
import { addItem, consume } from './inventory.ts'
import { itemLabel, itemLine } from './itemcopy.ts'
import { doseOf, isKeyItem, isUsable, tripSecondsOf } from './items.ts'
import { openLaptopDialog } from './laptopdialog.ts'
import { README } from './laptopreadme.ts'
import { call, refused } from './marx.ts'
import { npcLine } from './npcs.ts'
import { outfitById } from './outfits.ts'
import {
  bagTabs,
  LOCKER_TAB,
  PACK_TABS,
  packItems,
  stashItems,
} from './packgrid.ts'
import { partyLines } from './party.ts'
import { enteredAt, exitFrom, openAt } from './portals.ts'
import { levelOf } from './progression.ts'
import { normalizeChat } from './protocol.ts'
import { dealerStep, roseLine, roseProgress } from './quests.ts'
import { openRecycleDialog } from './recycledialog.ts'
import { callRoute, nearestRoadPoint } from './roadgraph.ts'
import { inHaven } from './shadowmen.ts'
import { buy as buyItem, settle } from './shop.ts'
import { openStandDialog } from './standdialog.ts'
import { move, moveAmount } from './stash.ts'
import { formatCash } from './store.ts'
import { planLeg } from './truckplan.ts'
import { dose, SOBER } from './wardlevels.ts'
import { WARD_OF } from './wards.ts'
import { charterable } from './worldsync.ts'
import type { ChatCommand, CrewFrame } from './chat.ts'
import type { CitgoLog } from './citgos.ts'
import type { CosmeticId } from './cosmetics.ts'
import type { EmoteId } from './emotes.ts'
import type { Hurt } from './fall.ts'
import type { Game } from './game.ts'
import type { Hotbar } from './hotbar.ts'
import type { DailyStatus, ShelfSpot } from './interactions.ts'
import type { WardAxis, XZ } from './interfaces.ts'
import type { Leg } from './marx.ts'
import type { NpcId } from './npcs.ts'
import type { BagAction, BagTab } from './packgrid.ts'
import type {
  DailyMessage,
  InspectWire,
  PassedMessage,
  PeerWire,
  WardLevels,
} from './protocol.ts'
import type { Waypoints } from './waypoints.ts'
import type { Pickup } from './world.ts'

// The valley's word on a touch (a struck frame): what it took, what the
// wards took off it, and the geometrie left of whole.
export interface Struck {
  damage: number
  warded: number
  health: number
  max: number
}

export interface Actions {
  // A line from an NPC into this player's chat log alone (Carlsten's
  // curse after the slurms, slurms.ts).
  npcSays(npc: NpcId, text: string): void
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
  // (book.ts ids): asked of the valley.
  // Anything found or already asked is left out (GameState.known), so the
  // loop may call it on every state-frame tick.
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
  // The truck drives the valley's `leg` (marx.ts).
  followLeg(leg: Leg): void
  hopOut(line?: string): void
  // Off the bed beside the truck, with no word to the valley: it let us
  // off.
  leaveBed(line?: string): void
  // A shadow touched you, or you landed from a fall of `height` metres
  // (sharedworld.ts rule 24): its hit off your geometrie, cut by your wards
  // (rule 27; nothing cuts a fall), the valley's word on what it took and
  // what is left. The last of it shatters your geometrie, and everything
  // the pack held stays on your body where you fell (rule 18).
  strike(by: Hurt, valley: Struck): void
  // G: one of `kind` (the last used, in the valley) passed to the raider
  // in reach in front of you (rule 27).
  passKind(kind?: string | null): void
  // The valley's word on a pass: to us (`from`), or from us (`to`).
  applyPassed(msg: PassedMessage): void
  // The account's wards as the valley keeps them.
  setWards(levels: WardLevels): void
  // Our own name and body as the valley shows them: a change made on the
  // account's other app (Dial-Up's Gron) is taken on and said.
  becomeShown(peer: PeerWire): void
  // The account's geometrie, left and whole, as the valley says it (a
  // forecourt, a use, a new level).
  setHealth(points: number, max: number): void
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
  offerTrade(offer: CosmeticId): void
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
  // Q: the phone dials a Citgo portal, or hangs up on one dialing
  // (sharedworld.ts rule 28).
  dialPortal(): void
  // The dial went through: the portal opens ahead of us (in the valley,
  // asked of it).
  openPortal(): void
  // The valley refused it.
  portalRefused(reason: string): void
  // Every frame, at `now` (the valley's clock): the open portals drawn,
  // and one walked into taking us out of its other end.
  tendPortals(now: number): void
  // The account's Citgos as the valley says (the welcome, a citgos frame):
  // a new one is said, unless `quiet` or before Begin.
  applyCitgos(log: CitgoLog, quiet?: boolean): void
  // Rule 36: the account's waypoints as the valley says (the welcome, a
  // waypoints frame): drawn on the map and the compass, a pillar at each;
  // and a pin the valley would not take yet.
  applyWaypoints(points: Waypoints): void
  waypointsRefused(): void
  // M: the map, over the valley with the pointer free; relock as
  // closeBook's.
  openMap(): void
  closeMap(relock?: boolean): void
  // A Citgo on the map clicked: fast travel there.
  fastTravel(station: number): void
  // Rule 3: the map opened for us to pick where Marx goes ends: a point
  // picked (to), the joyride (null), or nothing asked (undefined: he left,
  // or the bed is not ours).
  endCharter(to?: XZ | null): void
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
  // A raider's card from the valley (inspect.ts): opened, or the open one
  // brought up to date.
  showInspected(card: InspectWire): void
  // One line to the valley.
  say(typed: string): void
}

// After the valley refuses a Book of Shadows ask, the next waits this long.
const BOOK_RETRY_MS = 3000
// After a portal or fast travel, no portal takes us for this long.
const GRACE_MS = CONFIG.portal.graceSeconds * 1000
// A hallucination bursting sounds as a shadowman does, pitched up.
const HALLUCINATION_BURST_RATE = 1.8

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
  hud.pack.onTab = showBagTab

  // A panel over the valley (the pack, the book) with the pointer free for
  // it, as Gron's dialog has it; the player freezes, the valley does not.
  const withPanel = (open: () => void) => {
    player.keys.clear()
    open()
    if (document.pointerLockElement) document.exitPointerLock()
  }

  // A dialog over the valley (Gron's, the stand's): the game stands aside
  // (talking) with the pointer free until it closes, then takes it back.
  // The valley does not stop for it.
  const withDialog = (open: () => Promise<void>) => {
    s.talking = true
    player.keys.clear()
    if (document.pointerLockElement) document.exitPointerLock()
    void open().then(() => {
      s.talking = false
      engagePointer()
    })
  }

  // The pack opens on its first tab.
  const openInventory = (atLocker = false) =>
    withPanel(() => {
      s.lockerOpen = atLocker
      hud.setLocker(atLocker)
      s.inventoryOpen = hud.showBag(true, {
        outfit: game.pick.outfit,
        finish: game.pick.finish,
        cosmetics: s.cosmetics,
      })
      showBagTab(PACK_TABS[0])
    })

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
    withPanel(() => {
      s.bookOpen = hud.showBook(true)
    })
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
    s.pending.book.clear()
    s.known = knownOf(s.book, s.pending.book)
    bookHud.setFound(s.book)
  }

  const applyBook = (found: readonly string[]) => {
    const names: string[] = []
    for (const id of found) {
      s.pending.book.delete(id)
      s.known.add(id)
      if (s.book.has(id)) continue
      s.book.add(id)
      const entry = entryOf(id)
      if (entry) names.push(entry.name)
    }
    bookHud.setFound(s.book)
    bookHud.announce(names)
    // In the valley a landmark found pays its bounty (book.ts bountyOf).
    const bounty = s.world ? bountyLine(found) : null
    if (bounty) hud.tell(bounty)
  }

  // A refused ask waits this long before the next (local ms), so the loop
  // never asks again every frame.
  let bookWaitUntil = 0
  const bookRefused = () => {
    s.pending.book.clear()
    s.known = knownOf(s.book, s.pending.book)
    bookWaitUntil = performance.now() + BOOK_RETRY_MS
  }

  const discover = (ids: readonly string[]) => {
    if (ids.length === 0 || performance.now() < bookWaitUntil) return
    const fresh = newlyFound(s.known, ids)
    if (fresh.length === 0) return
    // The valley writes it and says so. Before it has welcomed us, or
    // while it is out of reach, nothing is asked, and a later frame asks
    // again.
    if (!net.online || !s.world) return
    for (const id of fresh) {
      s.pending.book.add(id)
      s.known.add(id)
    }
    net.send({ type: 'discover', entries: fresh })
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

  // The truck drives `leg` against the valley's clock.
  const followLeg = (leg: Leg) => {
    // He has left: no pick to make any more.
    if (leg.kind !== 'parked') endCharter()
    s.truckLeg = leg
    s.truckPlan = planLeg(leg, game.truckContext)
    truck.follow(s.truckPlan, (ms: number) => net.clock.toLocalMs(ms))
  }

  // Into the bed: of the truck at the Citgo, where the countdown starts
  // and the first one in picks on the map where he goes (rule 3), or of
  // the truck we whistled, which drives us home.
  const boardTruck = () => {
    if (s.aboard || !s.world) return
    closeInventory()
    const first = charterable(s.world.truck, net.id)
    s.aboard = true
    s.pending.board = true
    net.send({ type: 'board' })
    hud.tell(copy('log.board'))
    if (first) openCharter()
  }

  // The map, for the first one in to pick where Marx drives.
  const openCharter = () => {
    if (!hud.map) return
    closeBook()
    s.charting = true
    withPanel(() => {
      s.mapOpen = hud.showMap(true, true)
    })
  }

  // The charter's map closes: with a point picked (snapped to the nearest
  // road, where the truck will stop), the joyride (null), or no word sent
  // at all (undefined).
  const endCharter = (to?: XZ | null) => {
    if (!s.charting) return
    s.charting = false
    s.mapOpen = hud.showMap(false)
    if (s.started) engagePointer()
    if (to === undefined || !s.aboard) return
    const spot = to && nearestRoadPoint(game.truckContext.graph, to.x, to.z)
    const dest = spot ? { x: spot.x, z: spot.z } : null
    hud.tell(
      dest && hud.map
        ? copy('log.charter', { place: hud.map.placeOf(dest) })
        : copy('log.charter_joyride')
    )
    net.send({ type: 'charter', to: dest })
  }

  // Off the bed, beside the truck.
  const leaveBed = (line?: string) => {
    endCharter()
    s.aboard = false
    const spot = truck.hopOutSpot()
    player.relocate(spot.x, spot.z, player.yaw)
    if (line) hud.tell(line)
  }

  const hopOut = (line?: string) => {
    if (!s.aboard) return
    leaveBed(line)
    net.send({ type: 'hop-out' })
  }

  // What a ward taking the edge off a touch says in the log.
  const wardedLine = (ward: WardAxis): string => {
    switch (ward) {
      case 'high':
        return copy('log.warded_high')
      case 'stimulated':
        return copy('log.warded_stimulated')
      case 'drunk':
        return copy('log.warded_drunk')
      case 'tripping':
        return copy('log.warded_tripping')
    }
  }
  // The wards that have said so in the log this session, once each.
  const wardsTold = new Set<WardAxis>()
  // Struck by a shadow, or landed hard (a fall): the valley's word on it.
  // Static, then you come to on the forecourt when it is the last of you.
  // Everything the pack held stays on your body where you fell (rule 18):
  // the valley lays it and its pack frame has the last word, so the pack
  // shows empty at once.
  const strike = (by: Hurt, valley: Struck) => {
    if (s.aboard) {
      // Touched as we climbed in: the valley's count stands all the same.
      s.healthMax = valley.max
      s.health = valley.health > 0 ? valley.health : valley.max
      return
    }
    const now = performance.now()
    const { damage, warded } = valley
    s.emoting = null
    // A touch knocks the phone down mid-dial.
    game.phone.hangUp()
    s.healthMax = valley.max
    s.health = valley.health
    s.graceUntil = now + CONFIG.health.graceSeconds * 1000
    s.hurtAt = now
    const ward = by === 'fall' ? null : WARD_OF[by]
    hud.hurt()
    hud.popDamage(damage, warded, ward)
    game.sfx?.play(s.health > 0 ? 'hit' : 'shatter')
    if (s.health > 0) {
      hud.tell(
        copy(
          by === 'caretaker'
            ? 'log.hit_caretaker'
            : by === 'fall'
              ? 'log.hit_fall'
              : 'log.hit'
        )
      )
      // The first time a ward takes the edge off, it says so.
      if (ward && warded > 0 && !wardsTold.has(ward)) {
        wardsTold.add(ward)
        hud.tell(wardedLine(ward))
      }
      return
    }
    // Shattered: whole again where you come to, and sober.
    s.health = s.healthMax
    s.wards = SOBER
    s.strikes += 1
    s.strikeUntil = now + CONFIG.shadowmen.strikeSeconds * 1000
    hud.showStatic(true)
    closeInventory()
    closeBook()
    player.keys.clear()
    const items = fallen(s.inventory)
    if (!isEmpty(items)) {
      s.inventory = emptied(s.inventory)
      refreshBag()
    }
    player.relocate(world.spawn.x, world.spawn.z, world.spawn.yaw)
    hud.tell(
      copy(
        by === 'caretaker'
          ? 'log.caught'
          : by === 'shade' || by === 'warden'
            ? 'log.tunneled'
            : by === 'fall'
              ? 'log.plunged'
              : 'log.struck'
      )
    )
    if (!isEmpty(items)) hud.tell(copy('log.fell'))
    // Rule 18: the strike spilled a share of the wallet where you fell.
    const spilled = spilledDimes(s.cash) * DIME_CENTS
    if (spilled > 0)
      hud.tell(copy('log.spilled', { amount: formatCash(spilled) }))
  }

  // Made whole standing at a Citgo: the lights did it.
  const setHealth = (points: number, max: number) => {
    const mended =
      points >= max &&
      s.health < s.healthMax &&
      inHaven(player.pos, world.fuelPoints, CONFIG.shadowmen.havenRadius)
    s.health = points
    s.healthMax = max
    if (mended) hud.tell(copy('log.mended'))
  }

  // E over your own body: everything it holds back into the pack. The
  // valley says it was still there (valleysync.ts) and its pack frame
  // brings the things back.
  const lootCorpse = (id: number) => {
    if (s.pending.loots.has(id)) return
    s.pending.loots.add(id)
    net.send({ type: 'loot', corpse: id })
  }

  // E at the lockers: the pack with the Locker tab.
  const openLocker = () => {
    if (!s.world) return
    openInventory(true)
  }

  // E at the laptop in the Citgo bathroom: it fills the view with the
  // pointer free, as Gron's dialog does, and opens on the editor and the
  // readme. The files are the valley's (rule 31): the screen asks, and the
  // answers land in it (valleysync.ts). Played alone only the readme is
  // there to read.
  const useLaptop = () => {
    if (s.talking) return
    withDialog(() => {
      const { screen, closed } = openLaptopDialog({
        me: game.pick.username,
        readme: README,
        readmeName: copy('laptop.readme_name'),
        online: s.world !== null,
        send: (msg) => net.send(msg),
      })
      s.laptop = screen
      return closed.then(() => {
        s.laptop = null
      })
    })
  }

  // One side of the locker to the other, shown at once; the valley's pack
  // frame has the last word.
  const restash = (kind: string, all: boolean, stow: boolean) => {
    if (!s.lockerOpen || !s.world) return
    // A key item stays in the pack (items.ts isKeyItem).
    if (stow && isKeyItem(kind)) {
      hud.tell(copy('log.stow_key_item'))
      return
    }
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
  // Gron's. The stand is the account's (rule 23): every change is the
  // valley's to make; the dialog asks, and the stand and pack frames that
  // answer show in it as they land.
  const tendStand = () => {
    if (s.talking || !s.world || !s.stand) return
    s.standSaid = null
    const ask = (msg: Parameters<typeof net.send>[0]) => {
      s.pending.stand = true
      s.standSaid = null
      net.send(msg)
    }
    withDialog(() =>
      openStandDialog({
        goods: CONFIG.stand.goods,
        ledger: () => (s.world ? s.stand : null),
        pack: () => s.inventory,
        cash: () => s.cash,
        now: () => net.clock.serverNow(performance.now()),
        pending: () => s.pending.stand,
        said: () => s.standSaid,
        onStock: (kind, count) => ask({ type: 'stand-stock', kind, count }),
        onCollect: () => ask({ type: 'stand-collect' }),
        onUpgrade: () => ask({ type: 'stand-upgrade' }),
      })
    )
  }

  // E at the wreck: the Recycling Center, the pointer free for it as at
  // the stand. The research is the account's (rule 33): the dialog asks
  // the valley for it as it opens, and asks for each level; the research
  // and pack frames that answer show in it as they land.
  const recycle = () => {
    if (s.talking || !s.world) return
    s.researchSaid = null
    net.send({ type: 'research' })
    withDialog(() =>
      openRecycleDialog({
        research: () => (s.world ? s.research : null),
        pack: () => s.inventory,
        pending: () => s.pending.recycle,
        said: () => s.researchSaid,
        onRecycle: (line) => {
          s.pending.recycle = true
          s.researchSaid = null
          net.send({ type: 'recycle', line })
        },
      })
    )
  }

  // E beside Erwin von Dutch, the squatter in the plaza: what he deals
  // and what he wants for it, and his quest, in a dialog with the pointer
  // free, as at the stand (rules 25 and 26).
  const openDeal = () => {
    if (s.talking) return
    discover(['squatter'])
    if (!s.world) return
    s.talking = true
    s.dealSaid = null
    player.keys.clear()
    if (document.pointerLockElement) document.exitPointerLock()
    const says = ramble(s.rambled++)
    void openDealDialog({
      says,
      stock: () => s.world?.dealer ?? null,
      pack: () => s.inventory,
      pending: () => s.pendingDeal || s.pendingQuest,
      said: () => s.dealSaid,
      quest: () =>
        s.quests
          ? {
              ...roseLine(s.quests.rose, s.inventory),
              step: roseProgress(s.quests.rose, s.inventory),
            }
          : null,
      onDeal: (kind, pay) => {
        s.pendingDeal = true
        s.dealSaid = null
        net.send({ type: 'deal', kind, pay })
      },
      onQuest: () => {
        const step = s.quests ? dealerStep(s.quests.rose) : null
        if (!step) return
        s.pendingQuest = true
        s.dealSaid = null
        net.send({ type: 'quest', quest: 'rose', step })
      },
    }).then(() => {
      s.talking = false
      engagePointer()
    })
  }

  // E at the heart of the maze with Erwin's rose (rule 26): the valley
  // takes it out of the pack and writes it laid.
  const layRose = () => {
    if (!s.world || s.pendingQuest) return
    s.pendingQuest = true
    net.send({ type: 'quest', quest: 'rose', step: 'lay' })
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
  hud.pack.onAction = bagAction

  // T: Marx comes to us, if he is free, and drives us home. No whistle
  // carries up out of the Undercroft.
  const callTruck = () => {
    if (s.aboard || !s.world) return
    if (world.undercroft?.inside(player.pos.x, player.pos.z)) {
      hud.tell(copy('log.whistle_below'))
      return
    }
    // From wherever the truck is, the donut field included.
    const from = { x: truck.x, z: truck.z }
    const to = { x: player.pos.x, z: player.pos.z }
    const now = net.clock.serverNow(performance.now())
    const next = call(s.world.truck, net.id ?? '', from, to, now)
    if (refused(next)) {
      hud.tell(copy('log.truck_busy'))
      return
    }
    const route = callRoute(graph, from, to)
    if (!route || route.length < 2) {
      hud.tell(copy('log.whistle_nothing'))
      return
    }
    // One whistle for the whole valley; the world frame drives the truck
    // to where the valley last heard the whistler.
    net.send({ type: 'call', from })
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
    // The shelf is the valley's: ask, and pocket the unit when the valley
    // says it was still there. The judgement above (stock as last heard,
    // cash) stands; the valley settles the race.
    const key = `${shelf.station}:${shelf.item}`
    if (s.pending.buys.has(key)) return
    s.pending.buys.add(key)
    net.send({
      type: 'buy',
      station: shelf.station,
      kind: shelf.item,
      unit: shelf.unit,
    })
  }

  // E at a bush: ask the valley for today's berry off it, or say why not.
  const collectBerry = (bush: number, status: DailyStatus) => {
    if (status === 'offline') return
    if (status === 'picked') {
      hud.tell(copy('log.berry_picked'))
      return
    }
    if (s.pending.collect) return
    s.pending.collect = true
    net.send({ type: 'collect', bush })
  }

  // A berry into the pack, or not today.
  const applyDaily = (msg: DailyMessage) => {
    s.pending.collect = false
    s.daily = msg.daily
    if (!msg.picked) {
      hud.tell(copy('log.berry_picked'))
      return
    }
    s.inventory = addItem(s.inventory, 'berries', 1)
    refreshBag()
    const collected = itemLine('berries', 'collected')
    if (collected) hud.tell(collected)
  }

  // A line from an NPC into this player's chat log alone; the valley never
  // hears it.
  const npcSays = (npc: NpcId, text: string) => {
    hud.chatLine(
      { kind: 'npc', name: outfitById(npc).label, text, at: Date.now() },
      performance.now()
    )
  }

  // Marx, Carlsten, Moab and Tyler each say their next line.
  const speakTo = (npc: NpcId) => {
    npcSays(npc, npcLine(npc, s.npcSaid[npc]++))
  }

  // Rule 14: Moab's offer, taken. The valley trades and the pack frame
  // that follows says it landed (wear).
  const offerTrade = (offer: CosmeticId) => {
    const cosmetic = cosmeticById(offer)
    if (cosmetic) npcSays('moab', cosmetic.offer)
  }

  const wear = (cosmetics: CosmeticId[]) => {
    const gained = gainedOf(s.cosmetics, cosmetics)
    s.cosmetics = cosmetics
    s.pending.trade = false
    for (const id of gained) {
      const cosmetic = cosmeticById(id)
      if (!cosmetic) continue
      npcSays('moab', cosmetic.traded)
      hud.tell(cosmetic.worn)
    }
  }

  const tradeRefused = (reason: string) => {
    s.pending.trade = false
    const offer = s.interaction?.kind === 'trade' ? s.interaction.offer : null
    hud.tell(tradeRefusal(reason, offer))
  }

  const trade = (offer: CosmeticId) => {
    if (s.pending.trade) return
    const cosmetic = cosmeticById(offer)
    if (!cosmetic || s.cosmetics.includes(offer)) return
    if (!affords(s.inventory, offer)) {
      tradeRefused('short')
      return
    }
    s.pending.trade = true
    net.send({ type: 'trade', offer })
  }

  // An item with no effect yet does nothing, and a cigarette waits for the
  // one burning.
  const useKind = (kind: string) => {
    const result = consume(s.inventory, kind, s.effects, s.time)
    if (!result.used) {
      const empty = result.reason === 'empty' ? itemLine(kind, 'empty') : null
      if (empty) hud.tell(empty)
      return
    }
    s.inventory = result.inv
    keepHotbar(spent(s.hotbar, kind, s.inventory))
    s.effects = result.effects
    s.wards = dose(s.wards, doseOf(kind), s.time)
    // The right hand brings it up (fphands.ts).
    s.using = { kind, at: s.time }
    s.lastUsed = kind
    // The unit is the account's: the valley takes it out of the pack, and
    // gives back what it heals.
    net.send({ type: 'use', kind })
    refreshBag()
    const used = itemLine(kind, 'used')
    if (used) hud.tell(used)
  }

  // Rule 27. Passed to the nearest raider on foot in reach and in front,
  // where their last frame put them; the valley checks. The unit leaves
  // the pack at once, and the valley's pack frame has the last word.
  const passKind = (kind: string | null = s.lastUsed) => {
    if (!kind || !isUsable(kind) || (s.inventory[kind] ?? 0) < 1) {
      hud.tell(copy('log.pass_nothing'))
      return
    }
    if (!s.world) return
    if (s.aboard) {
      hud.tell(copy('log.pass_aboard'))
      return
    }
    const to = passTarget(player.pos, player.yaw, game.peers.standing())
    if (!to) {
      hud.tell(copy('log.pass_no_one'))
      return
    }
    s.inventory = addItem(s.inventory, kind, -1)
    keepHotbar(spent(s.hotbar, kind, s.inventory))
    refreshBag()
    net.send({ type: 'pass', kind, to: to.id })
  }

  // The valley's word: taken from us, or passed to us. What it does to
  // the wards and health comes in its own frames; the trip is ours to
  // draw.
  const applyPassed = (msg: PassedMessage) => {
    const item = itemLabel(msg.kind)
    if (msg.to !== undefined) {
      s.using = { kind: msg.kind, at: s.time }
      hud.tell(copy('log.passed', { item, name: msg.to }))
      return
    }
    const end = Math.max(s.effects.trip.end, s.time + tripSecondsOf(msg.kind))
    if (end > s.time) s.effects = { ...s.effects, trip: { start: s.time, end } }
    s.using = { kind: msg.kind, at: s.time }
    hud.tell(copy('log.passed_you', { item, name: msg.from ?? '' }))
  }

  // Rule 27: the valley's levels, as of now on our own clock.
  const setWards = (levels: WardLevels) => {
    s.wards = { at: s.time, levels }
  }

  const becomeShown = (peer: PeerWire) => {
    const { pick } = game
    if (peer.name !== pick.username) {
      pick.username = peer.name
      hud.setRaider(peer.name)
      hud.tell(copy('gron.renamed', { name: peer.name }))
    }
    if (peer.outfit !== pick.outfit) {
      game.playerBody.restyle(peer.outfit, finishById(pick.finish).color)
      game.hands.restyle(peer.outfit)
      pick.outfit = peer.outfit
      net.setOutfit(peer.outfit)
      hud.tell(copy('gron.became', { name: outfitById(peer.outfit).label }))
    }
  }

  // Rule 12. The drop lands where our last state frame put us; the pack
  // shows the units gone at once.
  const dropKind = (kind: string, all: boolean) => {
    // A key item stays in the pack (items.ts isKeyItem).
    if (isKeyItem(kind)) {
      hud.tell(copy('log.drop_key_item'))
      return
    }
    if (s.aboard) {
      hud.tell(copy('log.drop_aboard'))
      return
    }
    const count = dropAmount(kind, s.inventory[kind] || 0, all)
    if (count < 1) return
    s.inventory = addItem(s.inventory, kind, -count)
    keepHotbar(spent(s.hotbar, kind, s.inventory))
    net.send({ type: 'drop', kind, count })
    refreshBag()
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
          : kind === QUARTERS
            ? copy('log.quarters', { count, amount: paid })
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

  const takeDrop = (drop: number) => {
    if (s.pending.drops.has(drop)) return
    s.pending.drops.add(drop)
    net.send({ type: 'take-drop', drop })
  }

  // The light comes on once the hand is up, and goes off as it goes down;
  // the valley hears it with the next state frame.
  const toggleFlashlight = () => {
    s.flashlight = { ...s.flashlight, up: !s.flashlight.up }
    game.sfx?.play(s.flashlight.up ? 'flashlight-on' : 'flashlight-off')
  }

  // A pickup taken: into the pack, or cash (the plaza's quarters, the $20
  // in its back room) into the wallet, as a drop taken up is.
  const applyTake = (pickup: Pickup) => {
    markTaken(pickup)
    applyDropTaken(pickup.kind, pickup.count)
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
    // Pickups are shared by index: ask, and take it when the valley says
    // it is ours.
    const index = world.pickups.indexOf(pickup)
    if (index < 0 || s.pending.takes.has(index)) return
    s.pending.takes.add(index)
    net.send({ type: 'take', index })
  }

  // Gron's dialog: the game stands aside for it (talking). He changes the
  // name the valley knows and the body worn.
  const talkToGron = () => {
    if (s.talking) return
    const { pick } = game
    withDialog(() =>
      openGronDialog({
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
      })
    )
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
      case 'laptop':
        useLaptop()
        return
      case 'inspect':
        inspect(interaction.name)
        return
      case 'stand':
        tendStand()
        return
      case 'recycle':
        recycle()
        return
      case 'deal':
        openDeal()
        return
      case 'lay':
        layRose()
        return
      case 'descend':
      case 'ascend': {
        // Down the ladder into the Undercroft, or up it into the office.
        const croft = world.undercroft
        if (!croft) return
        const to =
          interaction.kind === 'descend' ? croft.ladder : croft.trapdoor
        player.relocate(to.x, to.z, to.yaw)
        hud.tell(
          copy(interaction.kind === 'descend' ? 'log.descend' : 'log.ascend')
        )
        return
      }
      case 'climbTower':
      case 'leaveTower': {
        // Up the lookout's ladder onto the deck, or back down to its foot.
        const tower = world.lookout
        if (!tower) return
        const up = interaction.kind === 'climbTower'
        const to = up ? tower.top : tower.foot
        player.relocate(to.x, to.z, to.yaw)
        hud.tell(copy(up ? 'log.climb_tower' : 'log.leave_tower'))
        return
      }
      case 'locked':
        hud.tell(copy('log.locked'))
        return
      case 'hallucination': {
        // It was never there: it bursts in fuchsia, and is gone.
        const at = game.hallucinations.burst(interaction.id)
        if (!at) return
        s.interaction = null
        game.sfx?.play('shadow-burst', at, HALLUCINATION_BURST_RATE)
        hud.tell(
          copy(
            interaction.shape === 'thing'
              ? 'hallucinations.thing'
              : 'hallucinations.person'
          )
        )
        return
      }
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
        peers.list().map(({ name, level, dialup }) => ({ name, level, dialup }))
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
      case 'party':
        for (const line of partyLines(s.party)) hud.tell(line)
        return
      case 'crew':
        for (const line of crewLines(s.crew)) hud.tell(line)
        return
    }
    if (!net.online) {
      hud.tell(CHAT_COPY.offline)
      return
    }
    switch (command.name) {
      case 'friends':
        s.pending.showFriends = true
        net.send({ type: 'friends' })
        return
      case 'whisper':
        s.pending.whisperTo = command.to
        net.send({ type: 'whisper', to: command.to, text: command.text })
        return
      case 'friend':
      case 'unfriend':
        s.pending.ask = { op: command.name, name: command.who }
        net.send({ type: command.name, name: command.who })
        return
      case 'inspect':
        inspect(command.who)
        return
      case 'invite':
        invite(command.who)
        return
      case 'leave':
        net.send({ type: 'party-leave' })
        return
      case 'partySay':
        net.send({ type: 'party-chat', text: command.text })
        return
      case 'crewFrame':
        sendCrew(command.frame)
        return
    }
  }

  // Rule 35: a crew frame, with what it named kept for a refusal's line.
  const sendCrew = (frame: CrewFrame) => {
    if (!net.online) {
      hud.tell(CHAT_COPY.offline)
      return
    }
    s.pending.crew = crewNamed(frame)
    net.send(frame)
  }

  // Rule 34: an invite to the party, or theirs taken up; the valley's
  // answer says which (valleysync.ts).
  const invite = (name: string) => {
    if (!net.online) {
      hud.tell(CHAT_COPY.offline)
      return
    }
    s.pending.invite = name
    net.send({ type: 'invite', name })
  }

  // A raider's card (inspect.ts), asked of the valley by E or /inspect;
  // it opens when the answer lands (showInspected).
  const inspect = (name: string) => {
    if (!net.online) {
      hud.tell(CHAT_COPY.offline)
      return
    }
    s.pending.inspect = name
    net.send({ type: 'inspect', name })
  }

  // The valley's answer: the card, opened over the valley, or brought up
  // to date while it is open. Another dialog open keeps it shut.
  const showInspected = (card: InspectWire) => {
    s.pending.inspect = null
    const open = s.inspected !== null
    s.inspected = card
    if (open) return
    if (s.talking) {
      s.inspected = null
      return
    }
    withDialog(() =>
      openInspectDialog({
        card: () => s.inspected ?? card,
        // Asked (or their asking accepted) at once; the friends list that
        // comes back says so in the log (valleysync.ts).
        onFriend: (name) => {
          if (!net.online) {
            hud.tell(CHAT_COPY.offline)
            return
          }
          s.pending.ask = { op: 'friend', name }
          net.send({ type: 'friend', name })
          if (s.inspected) s.inspected = befriended(s.inspected)
        },
        onCrew: (name) => sendCrew({ type: 'crew-invite', name }),
        onParty: (name) => {
          if (!net.online) {
            hud.tell(CHAT_COPY.offline)
            return
          }
          invite(name)
          if (s.inspected) s.inspected = partied(s.inspected)
        },
      }).then(() => {
        s.inspected = null
      })
    )
  }

  // --- Rule 28: Citgos, Citgo portals and fast travel ---------------------

  const citgoLabel = (station: number | null) =>
    station === null ? '' : (hud.map?.label(station) ?? '')

  const applyCitgos = (log: CitgoLog, quiet = false) => {
    const before = s.citgos
    s.citgos = log
    // Before Begin there is no one to tell: the spawn Citgo is found then.
    if (quiet || !s.started) return
    for (const line of citgoLines(before, log, citgoLabel, s.world !== null)) {
      hud.tell(line)
    }
  }

  // Q. The phone dials first; aboard it has no signal.
  const dialPortal = () => {
    if (s.aboard) {
      hud.tell(copy('log.portal_aboard'))
      return
    }
    if (!game.phone.dial()) hud.tell(copy('log.portal_hung_up'))
  }

  const portalRefusal = (reason: string): string => {
    switch (reason) {
      case 'aboard':
        return copy('log.portal_aboard')
      case 'at-citgo':
        return copy('log.portal_at_citgo')
      case 'no-citgo':
        return copy('log.portal_no_citgo')
      case 'busy':
        return copy('log.portal_busy')
      default:
        return copy('log.portal_refused')
    }
  }

  const portalRefused = (reason: string) => {
    s.pendingPortal = false
    game.phone.hangUp()
    hud.tell(portalRefusal(reason))
  }

  // The portal opens where our last state frame put us, and the world
  // frame that comes back says so (valleysync.ts).
  const openPortal = () => {
    const at = { x: player.pos.x, z: player.pos.z, yaw: player.yaw }
    const station = s.citgos.last
    if (s.aboard) return portalRefused('aboard')
    if (station === null) return portalRefused('no-citgo')
    if (citgoAt(at, [world.fuelPoints[station]]) !== null) {
      return portalRefused('at-citgo')
    }
    if (s.pendingPortal) return
    s.pendingPortal = true
    net.send({ type: 'portal' })
  }

  const tendPortals = (now: number) => {
    const open = openAt(s.portals, now)
    game.portals.sync(open)
    game.portals.update(s.time)
    if (s.aboard || performance.now() < s.portalGraceUntil) return
    const walked = enteredAt(open, player.pos, now)
    if (!walked) return
    const out = exitFrom(walked.portal, walked.side)
    player.relocate(out.x, out.z, out.yaw)
    s.portalGraceUntil = performance.now() + GRACE_MS
    hud.tell(
      walked.side === 'field'
        ? copy('log.portal_citgo')
        : walked.portal.id === s.myPortal
          ? copy('log.portal_back')
          : copy('log.portal_through', { name: walked.portal.name })
    )
  }

  const openMap = () => {
    if (!hud.map) return
    closeInventory()
    closeBook()
    withPanel(() => {
      s.mapOpen = hud.showMap(true)
    })
  }

  const closeMap = (relock = false) => {
    // Closed without a pick, the charter's map is the joyride.
    if (s.charting) {
      endCharter(null)
      return
    }
    if (!s.mapOpen) return
    s.mapOpen = hud.showMap(false)
    if (relock) engagePointer()
  }

  // From the Citgo we stand at to one visited (citgos.ts fastTravel): set
  // down in the middle of its portal ring. Where we stand is our own word,
  // so the valley hears it from the next state frame.
  const fastTravel = (station: number) => {
    if (s.aboard) {
      hud.tell(copy('log.travel_aboard'))
      return
    }
    const here = citgoAt(player.pos, world.fuelPoints)
    const verdict = fastTravelTo(s.citgos, here, station)
    if (verdict !== 'ok') {
      hud.tell(
        verdict === 'not-at-citgo'
          ? copy('log.travel_away')
          : verdict === 'here'
            ? copy('log.travel_here')
            : copy('log.travel_unvisited', { citgo: citgoLabel(station) })
      )
      return
    }
    const to = arrivalAt(world.rings[station], world.fuelPoints[station])
    player.relocate(to.x, to.z, to.yaw)
    s.emoting = null
    s.portalGraceUntil = performance.now() + GRACE_MS
    closeMap(true)
    hud.tell(copy('log.travel', { citgo: citgoLabel(station) }))
  }
  // --- Rule 36: waypoints -------------------------------------------------

  const applyWaypoints = (points: Waypoints) => {
    s.waypoints = points
    game.pillars.sync(points)
  }

  // A pin placed or lifted on the map: the valley keeps them, and its
  // answer draws them. Offline there is no valley, and they last the
  // session.
  const markWaypoints = (points: Waypoints) => {
    if (net.online) net.send({ type: 'waypoints', points: [...points] })
    else applyWaypoints(points)
  }

  const waypointsRefused = () => hud.tell(copy('log.waypoints_refused'))

  if (hud.map) {
    hud.map.onTravel = fastTravel
    hud.map.onCharter = (to) => endCharter(to)
    hud.map.onMark = markWaypoints
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
    npcSays,
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
    hopOut,
    leaveBed,
    strike,
    setHealth,
    stowKind,
    unstowKind,
    callTruck,
    pocket,
    applyDaily,
    offerTrade,
    wear,
    tradeRefused,
    useKind,
    passKind,
    applyPassed,
    setWards,
    becomeShown,
    dropKind,
    dialPortal,
    openPortal,
    portalRefused,
    tendPortals,
    applyCitgos,
    applyWaypoints,
    waypointsRefused,
    openMap,
    closeMap,
    fastTravel,
    endCharter,
    applyDropTaken,
    toggleFlashlight,
    applyTake,
    markTaken,
    markUntaken,
    interact,
    showInspected,
    say,
  }
}
