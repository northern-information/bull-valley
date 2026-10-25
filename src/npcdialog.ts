// The frame the Cabbage Stand's dialog and the trade window share
// (standdialog.ts, tradewindow.ts), and that the menu overlay (hud.ts) and
// the pack (packhud.ts) wear too: a header (an eyebrow, the status on the
// right, the title, the keeper's line), sections each opened by a head
// row, and a footer with the valley's last word and the way out. The
// markup is styles.css's .bv-npc; each dialog fills its own sections on
// the 12-column grid. A quest's section is here too, one for every quest
// giver (a trader's quest tab, tradewindow.ts; Gron's, grondialog.ts).

import { actionOf, DIALOG } from './bindings.ts'
import { el } from './dom.ts'
import type { QuestCard, QuestNow } from './quests.ts'

// The header as markup. The caller sets the line under the title as text
// ([data-bv="npc-lede"]), so a quote is never markup; `speech` inks it as
// the keeper's words.
export function npcHeader(options: {
  titleId: string
  title: string
  eyebrow: string
  where: string
  status: string
  speech: boolean
}): string {
  const lede = options.speech ? 'bv-npc-lede bv-npc-say' : 'bv-npc-lede'
  return `
    <header class="bv-npc-grid bv-npc-head">
      <p class="bv-npc-eyebrows bv-npc-c8">
        <span class="bv-npc-eyebrow bv-npc-lead">${options.eyebrow}</span>
        <span class="bv-npc-eyebrow" data-bv="npc-where">${options.where}</span>
      </p>
      <div class="bv-npc-status bv-npc-c4">${options.status}</div>
      <h2 class="bv-npc-title bv-npc-c12" id="${options.titleId}">${options.title}</h2>
      <p class="${lede} bv-npc-c10" data-bv="npc-lede"></p>
    </header>`
}

// A section's head row: its name in Citgo red, a rule, and a meta line on
// the right named `meta` (set by the caller, it changes).
export function sectionHead(name: string, meta: string): string {
  return `
    <div class="bv-npc-sh">
      <span class="bv-npc-eyebrow bv-npc-lead" data-bv="${meta}-name">${name}</span>
      <span class="bv-npc-rule"></span>
      <span class="bv-npc-label" data-bv="${meta}"></span>
    </div>`
}

// Whether a key closes the dialog: its close key (E, the key that opened
// it), never Esc, which only ever frees the pointer. Not while a field
// holds the caret, where E types, nor on the repeat of the E held down
// from opening it.
export function closesDialog(e: KeyboardEvent): boolean {
  if (e.repeat || actionOf(DIALOG, e.code) !== 'close') return false
  const target = e.target
  return !(
    target instanceof HTMLInputElement ||
    target instanceof HTMLTextAreaElement ||
    (target instanceof HTMLElement && target.isContentEditable)
  )
}

// The footer: the valley's last word on the left, the way out (E) on the
// right.
export function npcFooter(said: string, close: string, label: string): string {
  return `
    <footer class="bv-npc-foot">
      <p class="bv-account-status" data-bv="${said}" aria-live="polite"></p>
      <button type="button" class="bv-btn bv-npc-btn bv-npc-leave" data-bv="${close}"><span class="bv-npc-key">${DIALOG.close.key}</span>${label}</button>
    </footer>`
}

// `of` square pips into `row`, the first `lit` filled.
export function setPips(row: HTMLElement, lit: number, of: number): void {
  if (row.childElementCount !== of) {
    row.replaceChildren(
      ...Array.from({ length: of }, () => el('span', 'bv-npc-pip'))
    )
  }
  Array.from(row.children).forEach((pip, i) => {
    pip.classList.toggle('bv-npc-pip--on', i < lit)
  })
}

// A quest as its section shows it, read again every tick: its card (the
// title, the prize, the steps), the giver's line, the button that takes
// the next step (null for none), and the step under way.
export type QuestShown = QuestCard & Omit<QuestNow, 'next'>

// A quest's section as markup, its parts named `${bv}-…`: the head (its
// title and prize), the steps, the giver's line and the button.
export function questSection(bv: string, hidden = false): string {
  return `
    <section class="bv-npc-section bv-npc-quest" data-bv="${bv}-quest"${hidden ? ' hidden' : ''}>
      ${sectionHead('', `${bv}-prize`)}
      <div class="bv-npc-steps" data-bv="${bv}-steps"></div>
      <div class="bv-npc-grid">
        <p class="bv-npc-say bv-npc-c8" data-bv="${bv}-quest-line"></p>
        <button type="button" class="bv-btn bv-npc-btn bv-btn--primary bv-npc-c4" data-bv="${bv}-quest-go"></button>
      </div>
    </section>`
}

export interface QuestParts {
  box: HTMLElement
  title: HTMLElement
  prize: HTMLElement
  steps: HTMLElement
  line: HTMLElement
  go: HTMLButtonElement
  // The steps drawn, so they are built again only when the quest changes.
  shown: string
}

// The section's parts, found under `root`.
export function questParts(root: HTMLElement, bv: string): QuestParts {
  const find = <T extends HTMLElement>(name: string): T => {
    const found = root.querySelector<T>(`[data-bv="${name}"]`)
    if (!found) throw new Error(`No [data-bv="${name}"]`)
    return found
  }
  return {
    box: find(`${bv}-quest`),
    title: find(`${bv}-prize-name`),
    prize: find(`${bv}-prize`),
    steps: find(`${bv}-steps`),
    line: find(`${bv}-quest-line`),
    go: find<HTMLButtonElement>(`${bv}-quest-go`),
    shown: '',
  }
}

// Draws `quest` into its section: the steps lit up to the one under way,
// the line, and the button, held while an ask is unanswered.
export function showQuest(
  parts: QuestParts,
  quest: QuestShown,
  pending: boolean
): void {
  const key = [quest.title, ...quest.steps.flat()].join('|')
  if (key !== parts.shown) {
    parts.shown = key
    parts.title.textContent = quest.title
    parts.prize.textContent = quest.prize
    parts.steps.replaceChildren(
      ...quest.steps.map(([name, where]) => {
        const row = el('div', 'bv-npc-step')
        row.append(
          el('span', 'bv-npc-label', name),
          el('span', 'bv-npc-where', where)
        )
        return row
      })
    )
  }
  Array.from(parts.steps.children).forEach((row, i) => {
    row.classList.toggle('bv-npc-step--done', i < quest.step)
    row.classList.toggle('bv-npc-step--now', i === quest.step)
  })
  parts.line.textContent = quest.line
  parts.go.hidden = quest.button === null
  parts.go.textContent = quest.button ?? ''
  parts.go.disabled = pending
}
