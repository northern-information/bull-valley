// The chat log as seen (chat.ts): the valley's lines in the lower left,
// each stamped and inked by who said it, and the field that shows while
// typing. Hud builds it as hud.chat; input.ts opens and closes the field
// and scrolls the log, loop.ts ticks its fade, and valleysync.ts and
// actions.ts add the lines.

import { CHAT_LINES, formatStamp, isFaded, pushLine } from './chat.ts'
import { copy } from './copy.ts'
import { el } from './dom.ts'
import { CHAT_MAX } from './protocol.ts'
import type { ChatLine } from './chat.ts'

export class ChatHud {
  root: HTMLDivElement
  log: HTMLDivElement
  input: HTMLInputElement
  lines: ChatLine[] = []
  lastAt: number | null = null
  hovered = false

  constructor(dock: HTMLElement) {
    this.root = el('div', 'bv-chat bv-chat--faded')
    this.log = el('div', 'bv-chat-log')
    this.log.setAttribute('role', 'log')
    this.log.setAttribute('aria-label', copy('hud.chat_log_label'))
    // Paused, with the cursor free, hovering holds the log up and the
    // wheel scrolls it.
    this.log.addEventListener('pointerenter', () => {
      this.hovered = true
    })
    this.log.addEventListener('pointerleave', () => {
      this.hovered = false
    })
    this.input = el('input', 'bv-chat-input')
    this.input.type = 'text'
    this.input.maxLength = CHAT_MAX
    this.input.autocomplete = 'off'
    this.input.spellcheck = false
    this.input.setAttribute('aria-label', copy('hud.chat_input_label'))
    this.input.hidden = true
    this.root.append(this.log, this.input)
    dock.appendChild(this.root)
  }

  // A line the game says to the player alone.
  tell(text: string): void {
    this.line({ kind: 'system', text, at: Date.now() }, performance.now())
  }

  // One line into the log, stamped and colored by who said it. Text from
  // the valley is untrusted, so it goes in as text, never markup. A reader
  // scrolled back through the log stays where they are.
  line(line: ChatLine, now: number): void {
    this.lines = pushLine(this.lines, line)
    this.lastAt = now
    const log = this.log
    const atBottom = log.scrollHeight - log.scrollTop - log.clientHeight < 2
    const stamp = el('span', 'bv-chat-stamp')
    stamp.textContent = formatStamp(line.at)
    const p = el('p', `bv-chat-line bv-chat-line--${line.kind}`)
    p.append(stamp, line.name ? `${line.name}: ${line.text}` : line.text)
    log.appendChild(p)
    while (log.childElementCount > CHAT_LINES) log.firstElementChild?.remove()
    if (atBottom) log.scrollTop = log.scrollHeight
  }

  private get lineHeight(): number {
    return parseFloat(getComputedStyle(this.log).lineHeight) || 20
  }

  // The wheel while typing, in pixels whatever unit the browser counts in.
  wheel(e: WheelEvent): void {
    const unit =
      e.deltaMode === WheelEvent.DOM_DELTA_LINE
        ? this.lineHeight
        : e.deltaMode === WheelEvent.DOM_DELTA_PAGE
          ? this.log.clientHeight
          : 1
    this.log.scrollTop += e.deltaY * unit
  }

  // Scroll the log a page up (-1) or down (1), keeping one line in view.
  page(dir: 1 | -1): void {
    const line = this.lineHeight
    this.log.scrollTop += dir * Math.max(line, this.log.clientHeight - line)
  }

  // Whether the field is open for typing.
  get open(): boolean {
    return !this.input.hidden
  }

  openField(): void {
    this.input.value = ''
    this.input.hidden = false
    this.input.focus()
  }

  // Closes the field and returns what was typed; the log goes back to the
  // newest line.
  closeField(): string {
    const typed = this.input.value
    this.input.value = ''
    this.input.hidden = true
    this.input.blur()
    this.log.scrollTop = this.log.scrollHeight
    return typed
  }

  // The loop calls this every frame: the log fades once it goes quiet,
  // unless it is held by typing or the cursor.
  tick(now: number): void {
    const held = this.open || this.hovered
    const faded = isFaded(this.lastAt, now, held)
    this.root.classList.toggle('bv-chat--faded', faded)
    this.root.classList.toggle('bv-chat--held', held)
  }
}
