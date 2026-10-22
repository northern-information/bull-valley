// The pointer and the keys. Pointer lock starts the game and its drop opens the menu (the valley plays on); the
// keys are bindings.ts's (WORLD in the valley, PACK with the pack open,
// BOOK with the Book of Shadows open, CHAT while typing), and what they do
// is actions.ts's.

import {
  actionOf,
  BOOK,
  CHAT,
  FISHING,
  hotbarSlot,
  MAP,
  PACK,
  WORLD,
} from './bindings.ts'
import { othersLine } from './chat.ts'
import { copy } from './copy.ts'
import { stepSlot } from './held.ts'
import { LOCKER_TAB } from './packgrid.ts'
import { SEASON } from './season.ts'
import { formatCash } from './store.ts'
import { exitToMenu } from './titles.ts'
import type { Actions } from './actions.ts'
import type { Game } from './game.ts'

// Wire pointer lock to the Begin button and the canvas; returns the call
// that asks for it again.
export function wirePointer(game: Game): () => void {
  const { state: s, hud, net, peers, player } = game

  const startWithoutLock = () => {
    // Automation-only: headless browsers refuse pointer lock and the valley is
    // unwalkable without it. Never engages for a human — a silent no-lock
    // fallback reads raw cursor movement, which stops at the screen edge and
    // makes turning around impossible.
    if (!import.meta.env.DEV || !navigator.webdriver) return
    player.locked = true
    hud.setLocked(true)
    s.started = true
    hud.showIntro(false)
  }
  // Pointer lock can be refused (browser quirk, gesture rules, the cooldown
  // after Esc). When it is, drop the intro and leave a click on the view as
  // the retry — a gesture on the canvas itself always qualifies. The red
  // edge round the view (hud.ts) says the pointer is free.
  const lockRefused = () => {
    if (import.meta.env.DEV && navigator.webdriver) {
      startWithoutLock()
      return
    }
    s.started = true
    hud.showIntro(false)
  }
  const engagePointer = () => {
    // Given up on the valley: Begin goes back to the menu. Nothing plays
    // until the line is open.
    if (hud.connection === 'lost') {
      exitToMenu()
      return
    }
    if (hud.connection !== 'online') return
    try {
      // Older browsers return undefined instead of a promise.
      const request: Promise<void> | undefined = hud.canvas.requestPointerLock()
      request?.catch(lockRefused)
    } catch {
      lockRefused()
    }
  }
  hud.beginBtn.addEventListener('click', engagePointer)
  document.addEventListener('pointerlockerror', lockRefused)

  // The browser drops pointer lock on Esc and whenever the window loses focus
  // (Alt+Tab, Cmd+number). Neither can be blocked, and the page cannot tell
  // them apart, so every drop opens the menu, in one press, as other
  // browser games do; the valley is live and plays on under it. An open panel or dialog stays open (it freed the
  // pointer itself), and an overlay already up (H, a lost line) stays.
  document.addEventListener('pointerlockchange', () => {
    const locked = document.pointerLockElement === hud.canvas
    player.locked = locked
    hud.setLocked(locked)
    // Keys held when focus left never send keyup. Esc while typing drops
    // the lock too, and the draft with it.
    if (!locked) {
      player.keys.clear()
      hud.closeChat()
    }
    if (locked) {
      s.started = true
      hud.showIntro(false)
      if (!s.greeted) {
        s.greeted = true
        hud.tell(copy('log.greeting'))
        // The season, announced once a page.
        hud.season.live()
        hud.tell(
          copy('log.season_live', {
            goal: SEASON.goal,
            cash: formatCash(SEASON.reward.cash),
          })
        )
        // How many others, once the valley has said; a late welcome says it.
        if (net.online) hud.tell(othersLine(peers.count))
      }
    } else if (
      s.started &&
      !s.inventoryOpen &&
      !s.bookOpen &&
      !s.mapOpen &&
      !s.talking &&
      !hud.introShown
    ) {
      hud.showIntro(true, true)
    }
  })
  window.addEventListener('blur', () => player.keys.clear())
  document.addEventListener('mousemove', (e) => {
    if (!s.inventoryOpen && !s.bookOpen && !s.mapOpen && !s.talking) {
      player.handleMouse(e.movementX, e.movementY)
    }
  })
  return engagePointer
}

// How far the wheel turns for one step along the hotbar (a mouse's notch
// is about 100), and the least time between two steps, ms.
const WHEEL_NOTCH = 50
// The keys that send a chat line: the chat binding's, but T, which only
// opens the field.
const SENDS: readonly string[] = WORLD.chat.codes.filter((c) => c !== 'KeyT')
const WHEEL_MS = 150

// The keys, and the click on the view; engagePointer is wirePointer's.
export function wireKeys(
  game: Game,
  actions: Actions,
  engagePointer: () => void
): void {
  const { state: s, hud, player } = game

  // A click past the pack or the book closes it; with the pointer free
  // otherwise, a click on the view takes it back.
  hud.canvas.addEventListener('click', () => {
    if (s.inventoryOpen) actions.closeInventory(true)
    else if (s.bookOpen) actions.closeBook(true)
    else if (s.mapOpen) actions.closeMap(true)
    else if (s.started && !player.locked) engagePointer()
  })
  // The left button uses what the hand holds (held.ts): the flashlight
  // up or down, the jar's catch, the rod's cast and reel, the phone
  // dialed, the whistle blown, anything usable used. Only with the pointer
  // locked: the click that takes the pointer back never does. The right
  // button is kept for a second use; nothing has one yet, and the
  // browser's menu never opens over the view.
  document.addEventListener('mousedown', (e) => {
    if (e.button !== 0 || !player.locked) return
    if (
      s.inventoryOpen ||
      s.bookOpen ||
      s.mapOpen ||
      s.talking ||
      hud.chatOpen
    ) {
      return
    }
    actions.useHand()
  })
  hud.canvas.addEventListener('contextmenu', (e) => e.preventDefault())

  // With the pack open the keys act on the item under the cursor (PACK in
  // bindings.ts) and never reach the player.
  const inventoryKey = (e: KeyboardEvent) => {
    hud.closeBagMenu()
    const item = hud.bagHovered
    const action = actionOf(PACK, e.code)
    // What the locker holds only moves, back into the pack.
    const inLocker = hud.bagTab === LOCKER_TAB
    if (inLocker && (action === 'use' || action === 'assign')) {
      e.preventDefault()
      return
    }
    switch (action) {
      case 'close':
        e.preventDefault()
        actions.closeInventory(true)
        return
      case 'use':
        // Enter would also click a focused cell.
        e.preventDefault()
        if (item?.canUse) actions.useKind(item.kind)
        return
      case 'assign': {
        const slot = hotbarSlot(e.code)
        if (slot === null) return
        if (item) actions.assignSlot(slot, item.kind)
        else actions.clearSlot(slot)
        return
      }
      case 'drop':
        if (item && !inLocker) actions.dropKind(item.kind, e.shiftKey)
        return
      case 'pass':
        if (item?.canUse && !inLocker) actions.passKind(item.kind)
        return
      case 'stow':
        if (!item || !s.lockerOpen) return
        if (inLocker) actions.unstowKind(item.kind, e.shiftKey)
        else actions.stowKind(item.kind, e.shiftKey)
        return
      case 'prevTab':
        e.preventDefault()
        actions.stepBagTab(-1)
        return
      case 'nextTab':
        e.preventDefault()
        actions.stepBagTab(1)
        return
    }
  }

  // With the book open its keys turn the pages (BOOK in bindings.ts) and
  // never reach the player.
  const bookKey = (e: KeyboardEvent) => {
    const action = actionOf(BOOK, e.code)
    if (action) e.preventDefault()
    switch (action) {
      case 'close':
        actions.closeBook(true)
        return
      case 'prevChapter':
        actions.stepChapter(-1)
        return
      case 'nextChapter':
        actions.stepChapter(1)
        return
      case 'prevEntry':
        actions.stepEntry(-1)
        return
      case 'nextEntry':
        actions.stepEntry(1)
        return
    }
  }

  // In the valley the keys are WORLD in bindings.ts; the movement keys go
  // to the player as held state.
  document.addEventListener('keydown', (e) => {
    // The pack frees the pointer, so its keys come first.
    if (s.inventoryOpen) {
      inventoryKey(e)
      return
    }
    if (s.bookOpen) {
      bookKey(e)
      return
    }
    // The map's keys close it, and opened for a charter hop out of the
    // bed; a click on it fast travels, or picks where Marx goes.
    if (s.mapOpen) {
      const action = actionOf(MAP, e.code)
      if (action === 'close') {
        e.preventDefault()
        actions.closeMap(true)
      } else if (action === 'hopOut' && s.charting) {
        e.preventDefault()
        actions.hopOut()
      }
      return
    }
    if (!player.locked || s.talking) return
    // While typing, every key belongs to the field; Enter sends (T only
    // opens it, and types once it is open), and PageUp/PageDown scroll
    // the log.
    if (hud.chatOpen) {
      if (e.code === 'Tab') e.preventDefault()
      if (SENDS.includes(e.code) && !e.isComposing) {
        e.preventDefault()
        actions.say(hud.closeChat())
      }
      const scroll = actionOf(CHAT, e.code)
      if (scroll) {
        e.preventDefault()
        hud.pageChat(scroll === 'scrollUp' ? -1 : 1)
      }
      return
    }
    // A line in the water holds the raider at the bank: A and D (and the
    // arrows) answer the fish, and nothing walks.
    if (game.fishHud.out) {
      const dir = actionOf(FISHING, e.code)
      if (dir === 'left' || dir === 'right') {
        e.preventDefault()
        game.fishHud.press(dir)
        return
      }
      if (actionOf(WORLD, e.code) === 'move') return
    }
    player.handleKey(e.code, true)
    switch (actionOf(WORLD, e.code)) {
      case 'inventory':
        e.preventDefault()
        actions.openInventory()
        return
      case 'book':
        e.preventDefault()
        actions.openBook()
        return
      case 'map':
        e.preventDefault()
        actions.openMap()
        return
      case 'pass':
        actions.passKind(actions.inHand())
        return
      case 'drop': {
        const kind = actions.inHand()
        if (kind) actions.dropKind(kind, false)
        return
      }
      case 'hotbar': {
        const slot = hotbarSlot(e.code)
        if (slot !== null) actions.select(slot)
        return
      }
      case 'interact':
        actions.interact()
        return
      case 'chat':
        // The T that opens the field never lands in it.
        e.preventDefault()
        player.keys.clear()
        hud.openChat()
        return
      // The overlay first, so the drop that follows leaves it standing.
      case 'controls':
        e.preventDefault()
        hud.showIntro(true, true, 'controls')
        document.exitPointerLock()
        return
    }
  })
  document.addEventListener('keyup', (e) => player.handleKey(e.code, false))
  // Under pointer lock the wheel lands on the canvas, never the log, so
  // while typing it is passed along. Otherwise, in the valley, it steps
  // the hand along the hotbar: down the next slot, up the one before.
  // A trackpad sends a flurry of small deltas, so they add up to a notch,
  // and one step at most lands in a notch's time.
  let wheeled = 0
  let steppedAt = 0
  document.addEventListener(
    'wheel',
    (e) => {
      if (hud.chatOpen) {
        e.preventDefault()
        hud.wheelChat(e)
        return
      }
      if (
        !player.locked ||
        s.inventoryOpen ||
        s.bookOpen ||
        s.mapOpen ||
        s.talking
      ) {
        return
      }
      e.preventDefault()
      wheeled += e.deltaY
      const now = performance.now()
      if (Math.abs(wheeled) < WHEEL_NOTCH || now - steppedAt < WHEEL_MS) return
      actions.select(stepSlot(s.selected, wheeled > 0 ? 1 : -1))
      wheeled = 0
      steppedAt = now
    },
    { passive: false }
  )
}
