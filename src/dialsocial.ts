// Bull Valley Dial-Up's Social tab (sharedworld.ts rules 21 and 29): the
// valley's one chat channel, its log and a field to say a line (the 3D
// valley's commands too, dialstate.ts sayLine), the friends list with a
// way to accept an asking or end a friendship, and who is in the valley
// now, each name tapped open on their card (inspect.ts), and the party
// (sharedworld.ts rule 34) with its invites to join and a way to leave. The field is
// kept across redraws, so a line half typed survives the valley's frames.

import { formatStamp } from './chat.ts'
import { copy } from './copy.ts'
import { el, text } from './dom.ts'
import { friendLines } from './friends.ts'
import { CHAT_MAX } from './protocol.ts'
import type { ChatLine } from './chat.ts'
import type { DialState, Self } from './dialstate.ts'

export interface SocialActions {
  say(line: string): void
  friend(name: string): void
  unfriend(name: string): void
  inspect(name: string): void
  invite(name: string): void
  leave(): void
}

export class DialSocial {
  readonly root = el('div', 'bv-dial-social')
  private log = el('ol', 'bv-dial-log')
  private form = el('form', 'bv-dial-say')
  private input = document.createElement('input')
  private friends = el('section', 'bv-dial-friends')
  private online = el('section', 'bv-dial-online')
  private party = el('section', 'bv-dial-party')
  // The newest line drawn, so the log redraws only when one comes.
  private newest: ChatLine | undefined
  private friendActions: SocialActions

  constructor(actions: SocialActions) {
    this.input.className = 'bv-dial-say-field'
    this.input.type = 'text'
    this.input.maxLength = CHAT_MAX
    this.input.autocomplete = 'off'
    this.input.enterKeyHint = 'send'
    this.input.placeholder = copy('dialup.social.placeholder')
    this.input.setAttribute('aria-label', copy('dialup.social.placeholder'))
    const send = text('button', copy('dialup.social.send'), 'bv-dial-btn')
    send.type = 'submit'
    this.form.append(this.input, send)
    this.form.addEventListener('submit', (e) => {
      e.preventDefault()
      const line = this.input.value
      this.input.value = ''
      actions.say(line)
    })
    this.friendActions = actions
    this.root.append(this.log, this.form, this.party, this.friends, this.online)
  }

  render(s: DialState, self: Self): void {
    // The log, redrawn only when a line came, and held at its newest.
    const newest = s.chat.at(-1)
    if (newest !== this.newest) {
      this.newest = newest
      this.log.replaceChildren(
        ...s.chat.map((line) => {
          const li = el('li', 'bv-dial-line')
          li.dataset.kind = line.kind
          li.append(text('span', formatStamp(line.at), 'bv-dial-line-at'))
          if (line.name) {
            li.append(text('span', line.name, 'bv-dial-line-name'))
          }
          li.append(text('span', line.text, 'bv-dial-line-text'))
          return li
        })
      )
      this.log.scrollTop = this.log.scrollHeight
    }
    this.renderParty(s)
    this.renderFriends(s)
    this.online.replaceChildren(
      text('h3', copy('dialup.social.online'), 'bv-dial-social-head'),
      ...[{ ...self, dialup: true }, ...s.peers].map((p) => {
        const row = text(
          'button',
          p.dialup
            ? copy('chat.online_phone', { name: p.name, level: p.level })
            : copy('chat.online_name', { name: p.name, level: p.level }),
          'bv-dial-online-name'
        )
        row.type = 'button'
        row.dataset.raider = p.name
        // One card asked at a time: the valley's answer frees them again.
        row.disabled = s.pending.inspect !== null
        row.addEventListener('click', () => this.friendActions.inspect(p.name))
        return row
      })
    )
  }

  // Rule 34: the party's members and a way out, or the invites waiting;
  // nothing at all while there is neither.
  private renderParty(s: DialState): void {
    const { members, invites } = s.party
    this.party.hidden = members.length === 0 && invites.length === 0
    const rows: HTMLElement[] = members.map((m) =>
      text(
        'p',
        m.online ? m.name : copy('party.away', { name: m.name }),
        'bv-dial-party-name'
      )
    )
    if (members.length > 0) {
      const leave = text('button', copy('party.leave_button'), 'bv-dial-btn')
      leave.type = 'button'
      leave.addEventListener('click', () => this.friendActions.leave())
      rows.push(leave)
    }
    for (const name of invites) {
      const row = el('div', 'bv-dial-friend')
      row.dataset.invite = name
      row.append(
        text(
          'span',
          copy('party.news_invited', { name }),
          'bv-dial-friend-line'
        )
      )
      const join = text('button', copy('party.join_button'), 'bv-dial-btn')
      join.type = 'button'
      // One invite at a time: the valley's answer frees them again.
      join.disabled = s.pending.invite !== null
      join.addEventListener('click', () => this.friendActions.invite(name))
      row.append(join)
      rows.push(row)
    }
    this.party.replaceChildren(
      text('h3', copy('party.heading'), 'bv-dial-social-head'),
      ...rows
    )
  }

  private renderFriends(s: DialState): void {
    const rows = s.friends.map((f) => {
      const row = el('div', 'bv-dial-friend')
      row.dataset.friend = f.name
      row.append(text('span', friendLines([f])[0], 'bv-dial-friend-line'))
      if (f.state === 'asking') {
        const accept = text(
          'button',
          copy('dialup.social.accept'),
          'bv-dial-btn'
        )
        accept.type = 'button'
        // One ask at a time: the valley's answer frees them again.
        accept.disabled = s.pending.ask !== null
        accept.addEventListener('click', () =>
          this.friendActions.friend(f.name)
        )
        row.append(accept)
      }
      const remove = text('button', copy('dialup.social.remove'), 'bv-dial-btn')
      remove.type = 'button'
      remove.disabled = s.pending.ask !== null
      remove.addEventListener('click', () =>
        this.friendActions.unfriend(f.name)
      )
      row.append(remove)
      return row
    })
    this.friends.replaceChildren(
      text('h3', copy('dialup.social.friends'), 'bv-dial-social-head'),
      ...(rows.length > 0
        ? rows
        : [text('p', copy('friends.none'), 'bv-dial-note')])
    )
  }
}
