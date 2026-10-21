// Another raider's card (inspect.ts), in both apps: a dialog over the
// valley or the phone, in the frame the NPCs' dialogs share
// (npcdialog.ts). Their name heads it, with whether they are in the
// valley; their figure turns on the left in their character, finish and
// cosmetics (avatarview.ts), and the card's rows sit on the right. Under
// it, the friend button asks them (or accepts their asking), or says how
// the two stand. The caller asks the valley and hands the card in; the
// dialog reads it again every tick, so a fresh answer shows as it lands.

import { AVATAR_PX, createAvatarView } from './avatarview.ts'
import { copy } from './copy.ts'
import { el, finder } from './dom.ts'
import { cardRows, cardStatus, friendButton } from './inspect.ts'
import { npcFooter, npcHeader, sectionHead } from './npcdialog.ts'
import type { InspectWire } from './protocol.ts'

interface InspectDialogOptions {
  // Read again every tick: the card as the valley last sent it.
  card: () => InspectWire
  onFriend: (name: string) => void
}

// How often the card is redrawn.
const TICK_MS = 250

// Mounts the dialog over everything and resolves once it is closed.
export function openInspectDialog(
  options: InspectDialogOptions
): Promise<void> {
  const root = document.createElement('div')
  root.className = 'bv-account bv-npc bv-inspect'
  root.setAttribute('role', 'dialog')
  root.setAttribute('aria-modal', 'true')
  root.setAttribute('aria-labelledby', 'bv-inspect-title')
  root.innerHTML = `
    <div class="bv-npc-ui">
      ${npcHeader({
        titleId: 'bv-inspect-title',
        title: '',
        eyebrow: copy('inspect.eyebrow'),
        where: '',
        status: '',
        speech: false,
      })}
      <section class="bv-npc-section">
        ${sectionHead(copy('inspect.eyebrow'), 'inspect-level')}
        <div class="bv-npc-grid bv-inspect-body">
          <canvas class="bv-inspect-avatar bv-npc-c4" data-bv="inspect-avatar" width="${AVATAR_PX.width}" height="${AVATAR_PX.height}" aria-hidden="true"></canvas>
          <dl class="bv-item-stats bv-inspect-stats bv-npc-c8" data-bv="inspect-rows"></dl>
        </div>
        <div class="bv-npc-grid">
          <button type="button" class="bv-btn bv-btn--stack bv-npc-btn bv-btn--primary bv-npc-c4" data-bv="inspect-friend"></button>
        </div>
      </section>
      ${npcFooter('inspect-said', 'inspect-close', copy('inspect.close'))}
    </div>`
  document.body.appendChild(root)

  const find = finder(root)
  find<HTMLElement>('[data-bv="npc-lede"]').hidden = true
  const title = find<HTMLElement>('#bv-inspect-title')
  const where = find<HTMLElement>('[data-bv="npc-where"]')
  const level = find<HTMLElement>('[data-bv="inspect-level"]')
  const rows = find<HTMLElement>('[data-bv="inspect-rows"]')
  const friend = find<HTMLButtonElement>('[data-bv="inspect-friend"]')
  const closeBtn = find<HTMLButtonElement>('[data-bv="inspect-close"]')
  const avatar = createAvatarView(
    find<HTMLCanvasElement>('[data-bv="inspect-avatar"]'),
    { drag: true }
  )
  // Every label the friend button may wear, stacked so a change never
  // resizes it (bv-btn--stack); all but the one showing are hidden.
  const labels = [
    copy('inspect.add_friend'),
    copy('inspect.accept'),
    copy('inspect.asked'),
    copy('inspect.friends'),
  ].map((label) => el('span', '', label))
  friend.replaceChildren(...labels)

  let shown: InspectWire | null = null
  let dressed = ''
  const refresh = () => {
    const card = options.card()
    if (card === shown) return
    shown = card
    title.textContent = card.name
    where.textContent = cardStatus(card)
    level.textContent = copy('level.title', { level: card.level })
    rows.replaceChildren(
      ...cardRows(card).flatMap((row) => [
        el('dt', '', row.label),
        el('dd', '', row.value),
      ])
    )
    const button = friendButton(card)
    friend.hidden = button === null
    if (button) {
      for (const span of labels) {
        const current = span.textContent === button.label
        span.classList.toggle('bv-btn-label--off', !current)
        span.setAttribute('aria-hidden', String(!current))
      }
      friend.disabled = !button.enabled
    }
    const look = {
      outfit: card.outfit,
      finish: card.finish,
      cosmetics: card.cosmetics,
    }
    const key = JSON.stringify(look)
    if (key !== dressed) {
      dressed = key
      avatar.show(look)
    }
  }

  return new Promise<void>((resolve) => {
    const onKey = (e: KeyboardEvent) => {
      if (e.code !== 'Escape') return
      e.preventDefault()
      close()
    }
    const timer = setInterval(refresh, TICK_MS)

    function close(): void {
      clearInterval(timer)
      avatar.stop()
      document.removeEventListener('keydown', onKey)
      root.remove()
      resolve()
    }

    friend.addEventListener('click', () => {
      if (shown && friendButton(shown)?.enabled) options.onFriend(shown.name)
      refresh()
    })
    closeBtn.addEventListener('click', close)
    document.addEventListener('keydown', onKey)

    refresh()
    closeBtn.focus({ preventScroll: true })
  })
}
