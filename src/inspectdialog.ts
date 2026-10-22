// Another raider's card (inspect.ts), in both apps: a dialog over the
// valley or the phone, in the frame the NPCs' dialogs share
// (npcdialog.ts). Their name heads it, with whether they are in the
// valley; their figure turns on the left in their character, finish and
// cosmetics (avatarview.ts), and the card's rows sit on the right. Under
// it, the friend button asks them (or accepts their asking), the party
// button invites them (or joins their party, rule 34), and for a crew's
// leader the crew button invites them to it (rule 35), or each says how
// the two stand. The caller asks the valley and hands the card in; the
// dialog reads it again every tick, so a fresh answer shows as it lands.

import { AVATAR_PX, createAvatarView } from './avatarview.ts'
import { copy } from './copy.ts'
import { el, finder } from './dom.ts'
import {
  cardRows,
  cardStatus,
  crewButton,
  friendButton,
  partyButton,
} from './inspect.ts'
import { closesDialog, npcFooter, npcHeader, sectionHead } from './npcdialog.ts'
import type { InspectWire } from './protocol.ts'

interface InspectDialogOptions {
  // Read again every tick: the card as the valley last sent it.
  card: () => InspectWire
  onFriend: (name: string) => void
  onParty: (name: string) => void
  onCrew: (name: string) => void
}

// A button wearing one of `labels` at a time, all stacked in it so a
// change never resizes it (bv-btn--stack); none hides it.
function stacked(
  button: HTMLButtonElement,
  labels: readonly string[]
): (shown: { label: string; enabled: boolean } | null) => void {
  const spans = labels.map((label) => el('span', '', label))
  button.replaceChildren(...spans)
  return (shown) => {
    button.hidden = shown === null
    if (!shown) return
    for (const span of spans) {
      const current = span.textContent === shown.label
      span.classList.toggle('bv-btn-label--off', !current)
      span.setAttribute('aria-hidden', String(!current))
    }
    button.disabled = !shown.enabled
  }
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
          <button type="button" class="bv-btn bv-btn--stack bv-npc-btn bv-npc-c4" data-bv="inspect-party"></button>
          <button type="button" class="bv-btn bv-btn--stack bv-npc-btn bv-npc-c4" data-bv="inspect-crew"></button>
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
  const party = find<HTMLButtonElement>('[data-bv="inspect-party"]')
  const crew = find<HTMLButtonElement>('[data-bv="inspect-crew"]')
  const closeBtn = find<HTMLButtonElement>('[data-bv="inspect-close"]')
  const avatar = createAvatarView(
    find<HTMLCanvasElement>('[data-bv="inspect-avatar"]'),
    { drag: true }
  )
  const showFriend = stacked(friend, [
    copy('inspect.add_friend'),
    copy('inspect.accept'),
    copy('inspect.asked'),
    copy('inspect.friends'),
  ])
  const showCrew = stacked(crew, [
    copy('crew.invite_button'),
    copy('crew.invited_button'),
  ])
  // Rule 35: an invite to the asker's crew sent from this card.
  let crewSent = false
  const showParty = stacked(party, [
    copy('party.invite_button'),
    copy('party.join_button'),
    copy('party.invited_button'),
    copy('party.member_button'),
  ])

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
    showFriend(friendButton(card))
    showParty(partyButton(card))
    showCrew(crewButton(card, crewSent))
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
      if (!closesDialog(e)) return
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
    party.addEventListener('click', () => {
      if (shown && partyButton(shown)?.enabled) options.onParty(shown.name)
      refresh()
    })
    crew.addEventListener('click', () => {
      if (shown && crewButton(shown, crewSent)?.enabled) {
        crewSent = true
        options.onCrew(shown.name)
        shown = null
      }
      refresh()
    })
    closeBtn.addEventListener('click', close)
    document.addEventListener('keydown', onKey)

    refresh()
    closeBtn.focus({ preventScroll: true })
  })
}
