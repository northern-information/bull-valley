// The frame the Cabbage Stand's and Erwin von Dutch's dialogs share
// (standdialog.ts, dealdialog.ts), and that the pause overlay (hud.ts) and
// the pack (packhud.ts) wear too: a header (an eyebrow, the status on the
// right, the title, the keeper's line), numbered sections each opened by a
// head row, and a footer with the valley's last word and the way out. The
// markup is styles.css's .bv-npc; each dialog fills its own sections on
// the 12-column grid.

import { DIALOG } from './bindings.ts'
import { el } from './dom.ts'

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

// A section's head row: its number in Citgo red, its name, a rule, and a
// meta line on the right named `meta` (set by the caller, it changes).
export function sectionHead(n: number, name: string, meta: string): string {
  return `
    <div class="bv-npc-sh">
      <span class="bv-npc-num">${String(n).padStart(2, '0')}</span>
      <span class="bv-npc-eyebrow" data-bv="${meta}-name">${name}</span>
      <span class="bv-npc-rule"></span>
      <span class="bv-npc-label" data-bv="${meta}"></span>
    </div>`
}

// The footer: the valley's last word on the left, the way out (Esc) on the
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
