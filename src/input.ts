// The pointer and the keys. Pointer lock starts and pauses the game; the
// keys are bindings.ts's (WORLD in the valley, PACK with the pack open,
// CHAT while typing), and what they do is actions.ts's.

import { actionOf, CHAT, hotbarSlot, PACK, WORLD } from './bindings.ts'
import { othersLine } from './chat.ts'
import { copy } from './copy.ts'
import { SEASON } from './season.ts'
import { formatCash } from './store.ts'
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
  // them apart, so every drop is a pause. An open inventory stays open and
  // waits for a click; otherwise the pause overlay shows.
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
    } else if (s.started && !s.inventoryOpen && !s.talking) {
      hud.showIntro(true, true)
    }
  })
  window.addEventListener('blur', () => player.keys.clear())
  document.addEventListener('mousemove', (e) => {
    if (!s.inventoryOpen && !s.talking) {
      player.handleMouse(e.movementX, e.movementY)
    }
  })
  return engagePointer
}

// The keys, and the click on the view; engagePointer is wirePointer's.
export function wireKeys(
  game: Game,
  actions: Actions,
  engagePointer: () => void
): void {
  const { state: s, hud, player, scope } = game

  // A click past the pack closes it; with the pointer free otherwise, a
  // click on the view takes it back.
  hud.canvas.addEventListener('click', () => {
    if (s.inventoryOpen) actions.closeInventory(true)
    else if (s.started && !player.locked) engagePointer()
  })
  // The left button raises the flashlight or puts it down, only with the
  // pointer locked: the click that takes the pointer back never does.
  document.addEventListener('mousedown', (e) => {
    if (e.button !== 0 || !player.locked) return
    if (s.inventoryOpen || s.talking || hud.chatOpen) return
    actions.toggleFlashlight()
  })

  // With the pack open the keys act on the item under the cursor (PACK in
  // bindings.ts) and never reach the player.
  const inventoryKey = (e: KeyboardEvent) => {
    const item = hud.bagHovered
    switch (actionOf(PACK, e.code)) {
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
        if (item && slot !== null) actions.assignSlot(slot, item.kind)
        return
      }
      case 'drop':
        if (item) actions.dropKind(item.kind, e.shiftKey)
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

  // In the valley the keys are WORLD in bindings.ts; the movement keys go
  // to the player as held state.
  document.addEventListener('keydown', (e) => {
    // The pack frees the pointer, so its keys come first.
    if (s.inventoryOpen) {
      inventoryKey(e)
      return
    }
    if (!player.locked || s.talking) return
    // While typing, every key belongs to the field; Enter sends, and
    // PageUp/PageDown scroll the log.
    if (hud.chatOpen) {
      if (e.code === 'Tab') e.preventDefault()
      if (actionOf(WORLD, e.code) === 'chat' && !e.isComposing) {
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
    player.handleKey(e.code, true)
    switch (actionOf(WORLD, e.code)) {
      case 'inventory':
        e.preventDefault()
        actions.openInventory()
        return
      case 'scope':
        scope.toggle()
        return
      case 'hotbar': {
        const slot = hotbarSlot(e.code)
        const kind = slot === null ? null : s.hotbar[slot]
        if (kind) actions.useKind(kind)
        return
      }
      case 'callTruck':
        actions.callTruck()
        return
      case 'interact':
        actions.interact()
        return
      case 'chat':
        e.preventDefault()
        player.keys.clear()
        hud.openChat()
        return
    }
  })
  document.addEventListener('keyup', (e) => player.handleKey(e.code, false))
  // Under pointer lock the wheel lands on the canvas, never the log, so
  // while typing it is passed along.
  document.addEventListener(
    'wheel',
    (e) => {
      if (!hud.chatOpen) return
      e.preventDefault()
      hud.wheelChat(e)
    },
    { passive: false }
  )
}
