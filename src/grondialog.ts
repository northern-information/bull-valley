// Talking to Gron by the berry bush (sharedworld.ts rule 26): a dialog
// over the valley, opened with E beside him and from Dial-Up's lobby, in
// the frame the stand's and the trade window share (npcdialog.ts). He
// gives his quests one after another (quests.ts GRON_QUESTS), and the
// quest he speaks of shows in the section every quest giver's shares
// (npcdialog.ts questSection), as Erwin's tab shows the rose. The caller
// sends the frames; the dialog reads the game's state again every tick,
// so the valley's answers show as they land.

import { copy } from './copy.ts'
import { finder } from './dom.ts'
import {
  closesDialog,
  npcFooter,
  npcHeader,
  questParts,
  questSection,
  showQuest,
} from './npcdialog.ts'
import type { QuestShown } from './npcdialog.ts'

interface GronDialogOptions {
  // What he says as it opens.
  says: string
  // Read again every tick: whether the valley is there, the quest he
  // speaks of as it stands for this raider, whether a step is still
  // unanswered, and the last word on one.
  open: () => boolean
  quest: () => QuestShown
  pending: () => boolean
  said: () => string | null
  onStep: () => void
}

// What Gron says as you walk up; one at random.
export function gronSays(): string {
  const lines = [copy('gron.says_1'), copy('gron.says_2'), copy('gron.says_3')]
  return lines[Math.floor(Math.random() * lines.length)]
}

// How often the readout is redrawn.
const TICK_MS = 250

// Mounts the dialog over everything and resolves once it is closed.
export function openGronDialog(options: GronDialogOptions): Promise<void> {
  const root = document.createElement('div')
  root.className = 'bv-account bv-npc bv-gron'
  root.setAttribute('role', 'dialog')
  root.setAttribute('aria-modal', 'true')
  root.setAttribute('aria-labelledby', 'bv-gron-title')
  root.innerHTML = `
    <div class="bv-npc-ui">
      ${npcHeader({
        titleId: 'bv-gron-title',
        title: copy('outfits.gron'),
        eyebrow: copy('gron.eyebrow'),
        where: copy('gron.where'),
        status: '',
        speech: true,
      })}
      ${questSection('gron')}
      ${npcFooter('gron-said', 'gron-close', copy('trade.close'))}
    </div>`
  document.body.appendChild(root)

  const find = finder(root)
  find<HTMLParagraphElement>('[data-bv="npc-lede"]').textContent = options.says
  const parts = questParts(root, 'gron')
  const said = find<HTMLParagraphElement>('[data-bv="gron-said"]')
  const closeBtn = find<HTMLButtonElement>('[data-bv="gron-close"]')

  const refresh = () => {
    const open = options.open()
    said.textContent = open ? (options.said() ?? '') : copy('trade.offline')
    showQuest(parts, options.quest(), options.pending() || !open)
  }

  return new Promise<void>((resolve) => {
    // The game listens on the document too, and pointer lock is off while
    // he talks, so its keys do nothing; E, the key that opened it, closes
    // it, as every dialog's does.
    const onKey = (e: KeyboardEvent) => {
      if (!closesDialog(e)) return
      e.preventDefault()
      close()
    }
    const timer = setInterval(refresh, TICK_MS)

    function close(): void {
      clearInterval(timer)
      document.removeEventListener('keydown', onKey)
      root.remove()
      resolve()
    }

    parts.go.addEventListener('click', () => {
      if (!options.pending() && options.open()) options.onStep()
      refresh()
    })
    closeBtn.addEventListener('click', close)
    document.addEventListener('keydown', onKey)

    refresh()
    closeBtn.focus({ preventScroll: true })
  })
}
