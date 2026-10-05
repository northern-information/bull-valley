// The account panel, opened from the character select: who you are, the
// providers that sign you in, Link Another Account, and Sign Out. A black
// overlay over the select, mounted on open and removed on close.
//
// Linking runs in a popup so the select underneath keeps its state: the
// popup walks the provider round trip and lands on auth-done.html, which
// posts the ?auth= result here (LINK_MESSAGE) and closes. The panel then
// reads the account again. A blocked popup falls back to a full-page round
// trip that lands back on the game. Unlinking is refused for the last
// provider, so there is always a way back in. The routes are worker/auth.ts.

import {
  authReturnOf,
  LINK_MESSAGE,
  linkable,
  linkUrl,
  PROVIDER_COLORS,
  PROVIDER_LABELS,
} from './account.ts'
import { fetchMe, fetchProviders, unlinkProvider } from './auth.ts'
import { copy } from './copy.ts'
import type { AccountWire, Provider, ProviderWire } from './account.ts'

export interface AccountPanelOptions {
  // Sign Out was pressed.
  onSignOut: () => void
}

// How often to look for the link popup closing.
const POPUP_POLL_MS = 300

const POPUP_FEATURES = 'popup=1,width=520,height=680'

// Mounts the panel over everything and resolves once it is closed.
export function openAccountPanel({
  onSignOut,
}: AccountPanelOptions): Promise<void> {
  const root = document.createElement('div')
  root.className = 'bv-account bv-panel'
  root.setAttribute('role', 'dialog')
  root.setAttribute('aria-modal', 'true')
  root.setAttribute('aria-labelledby', 'bv-panel-title')
  root.innerHTML = `
    <div class="bv-account-ui">
      <h2 id="bv-panel-title">${copy('panel.title')}</h2>
      <div class="bv-panel-who">
        <img class="bv-avatar" alt="" hidden>
        <p class="bv-panel-username" data-bv="panel-username"></p>
      </div>
      <h3>${copy('panel.linked')}</h3>
      <ul class="bv-panel-linked" data-bv="panel-linked"></ul>
      <h3 data-bv="panel-link-heading" hidden>${copy('panel.link_another')}</h3>
      <div class="bv-account-providers" data-bv="panel-link"></div>
      <p class="bv-account-status" data-bv="panel-status" aria-live="polite"></p>
      <div class="bv-select-actions">
        <button type="button" class="bv-btn" data-bv="panel-sign-out">${copy('panel.sign_out')}</button>
        <button type="button" class="bv-btn bv-btn--primary" data-bv="panel-close">${copy('panel.close')}</button>
      </div>
    </div>`
  document.body.appendChild(root)

  const find = <T extends Element>(selector: string): T => {
    const found = root.querySelector<T>(selector)
    if (!found) throw new Error(`Missing ${selector}`)
    return found
  }
  const avatar = find<HTMLImageElement>('.bv-avatar')
  const usernameEl = find<HTMLParagraphElement>('[data-bv="panel-username"]')
  const linkedList = find<HTMLUListElement>('[data-bv="panel-linked"]')
  const linkHeading = find<HTMLHeadingElement>('[data-bv="panel-link-heading"]')
  const linkRow = find<HTMLDivElement>('[data-bv="panel-link"]')
  const status = find<HTMLParagraphElement>('[data-bv="panel-status"]')
  const signOutBtn = find<HTMLButtonElement>('[data-bv="panel-sign-out"]')
  const closeBtn = find<HTMLButtonElement>('[data-bv="panel-close"]')
  const returnFocus =
    document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null

  return new Promise<void>((resolve) => {
    let offered: Provider[] = []
    let busy = false
    let popupTimer: ReturnType<typeof setInterval> | null = null

    // Whether the status is a wait ("Linking…") that a closed popup with no
    // word should clear.
    let waiting = false

    const say = (text: string, tone: 'ok' | 'bad' | null = null) => {
      waiting = false
      status.textContent = text
      if (tone) status.dataset.tone = tone
      else delete status.dataset.tone
    }

    const setBusy = (next: boolean) => {
      busy = next
      for (const button of root.querySelectorAll<HTMLButtonElement>(
        '[data-unlink], [data-link]'
      )) {
        button.disabled = next
      }
    }

    const linkedRow = (entry: ProviderWire, only: boolean): HTMLLIElement => {
      const item = document.createElement('li')
      const chip = document.createElement('span')
      chip.className = 'bv-chip'
      chip.style.setProperty('--provider', PROVIDER_COLORS[entry.provider])
      chip.textContent = PROVIDER_LABELS[entry.provider]
      const who = document.createElement('span')
      who.className = 'bv-panel-as'
      who.textContent = entry.displayName
      item.append(chip, who)
      if (only) {
        const note = document.createElement('span')
        note.className = 'bv-panel-only'
        note.textContent = copy('panel.only_way_in')
        item.append(note)
      } else {
        const unlink = document.createElement('button')
        unlink.type = 'button'
        unlink.className = 'bv-link'
        unlink.dataset.unlink = entry.provider
        unlink.textContent = copy('panel.unlink')
        unlink.setAttribute(
          'aria-label',
          copy('panel.unlink_label', {
            provider: PROVIDER_LABELS[entry.provider],
            who: entry.displayName,
          })
        )
        unlink.addEventListener('click', () => void unlinkOne(entry.provider))
        item.append(unlink)
      }
      return item
    }

    const linkButton = (provider: Provider): HTMLButtonElement => {
      const button = document.createElement('button')
      button.type = 'button'
      button.className = 'bv-btn bv-provider'
      button.dataset.link = provider
      button.style.setProperty('--provider', PROVIDER_COLORS[provider])
      button.textContent = copy('panel.link', {
        provider: PROVIDER_LABELS[provider],
      })
      button.addEventListener('click', () => link(provider))
      return button
    }

    const render = (account: AccountWire) => {
      usernameEl.textContent = account.username ?? account.displayName
      if (account.avatarUrl) {
        avatar.src = account.avatarUrl
        avatar.hidden = false
      } else {
        avatar.hidden = true
      }
      const only = account.providers.length <= 1
      linkedList.replaceChildren(
        ...account.providers.map((entry) => linkedRow(entry, only))
      )
      const more = linkable(
        offered,
        account.providers.map((entry) => entry.provider)
      )
      linkHeading.hidden = more.length === 0
      linkRow.replaceChildren(...more.map(linkButton))
      setBusy(busy)
    }

    // The account as the server has it now, or a message when it is gone.
    const reload = async (): Promise<boolean> => {
      const me = await fetchMe()
      if (!me?.account) {
        say(copy('panel.session_ended'), 'bad')
        return false
      }
      render(me.account)
      return true
    }

    async function unlinkOne(provider: Provider): Promise<void> {
      if (busy) return
      setBusy(true)
      say(copy('panel.unlinking'))
      const result = await unlinkProvider(provider)
      setBusy(false)
      if (await reload()) {
        if (result.ok)
          say(
            copy('panel.unlinked', { provider: PROVIDER_LABELS[provider] }),
            'ok'
          )
        else say(result.error, 'bad')
      }
      closeBtn.focus()
    }

    function link(provider: Provider): void {
      if (busy) return
      const devUserId =
        provider === 'dev'
          ? `dev-${Math.random().toString(36).slice(2, 10)}`
          : undefined
      const popup = window.open(
        linkUrl(provider, devUserId),
        'bv-link',
        POPUP_FEATURES
      )
      if (!popup) {
        // Blocked: the whole page makes the round trip and lands back here.
        window.location.assign(
          linkUrl(
            provider,
            devUserId,
            window.location.pathname + window.location.search
          )
        )
        return
      }
      setBusy(true)
      say(copy('panel.linking', { provider: PROVIDER_LABELS[provider] }))
      waiting = true
      popupTimer = setInterval(() => {
        if (!popup.closed) return
        if (popupTimer !== null) clearInterval(popupTimer)
        popupTimer = null
        setBusy(false)
        void reload().then((ok) => {
          // The popup's own message has said how it went, if it got that
          // far; a closed popup with no word is a cancelled link.
          if (ok && waiting) say('')
        })
      }, POPUP_POLL_MS)
    }

    // The popup's word on how the round trip went.
    const onMessage = (e: MessageEvent) => {
      if (e.origin !== window.location.origin) return
      const data = e.data as { type?: unknown; search?: unknown } | null
      if (data?.type !== LINK_MESSAGE || typeof data.search !== 'string') {
        return
      }
      const outcome = authReturnOf(data.search, copy('auth.sign_in_failed'))
      if (!outcome) return
      if ('error' in outcome) say(outcome.error, 'bad')
      else if (outcome.auth === 'linked') say(copy('panel.linked_ok'), 'ok')
    }

    // The select underneath listens on the document too; while the panel is
    // open, its keys are the panel's alone. Buttons still activate.
    const onKey = (e: KeyboardEvent) => {
      e.stopPropagation()
      if (e.code === 'Escape') {
        e.preventDefault()
        close()
      }
    }

    function close(): void {
      if (popupTimer !== null) clearInterval(popupTimer)
      document.removeEventListener('keydown', onKey, true)
      window.removeEventListener('message', onMessage)
      root.remove()
      returnFocus?.focus()
      resolve()
    }

    closeBtn.addEventListener('click', close)
    signOutBtn.addEventListener('click', () => {
      signOutBtn.disabled = true
      onSignOut()
    })
    document.addEventListener('keydown', onKey, true)
    window.addEventListener('message', onMessage)
    closeBtn.focus()

    void (async () => {
      say(copy('panel.loading'))
      offered = await fetchProviders()
      if (await reload()) say('')
    })()
  })
}
