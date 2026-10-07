// What comes before the valley: the colophon, the main menu, the account
// step, and the character select, each a black layer stacked over the next.
// Resolves with the account's username and the outfit it raids in.

import { authReturnOf, devSignInUrl, stripAuthQuery } from './account.ts'
import { openAccountPanel } from './accountpanel.ts'
import { fetchMe, saveLook, signOut } from './auth.ts'
import { pickOf } from './characters.ts'
import { mountCharacterSelect } from './characterselect.ts'
import { CONFIG } from './config.ts'
import { copy } from './copy.ts'
import { toHotbar } from './hotbar.ts'
import { mountMainMenu } from './mainmenu.ts'
import { mountAccountStep } from './signin.ts'
import { COLOPHON, LOGO, showSplash, skipTitles } from './splash.ts'
import type { BvAudio } from './audio.ts'
import type { CharacterPick } from './characters.ts'
import type { Hotbar } from './hotbar.ts'
import type { SettingsStore } from './settingsui.ts'

// The username a dev build signs in under when ?skipSplash finds no session.
const DEV_USERNAME = 'Raider'

// What the titles settle: the outfit chosen at the select, the username of
// the account it raids under, its hotbar, and word of a link round trip
// that landed on the page (a blocked popup falls back to one), to show once
// in the valley.
export type Titles = CharacterPick & {
  username: string
  hotbar: Hotbar
  notice: string | null
}

// Sign out, then start over at the sign-in card.
export function signOutAndReload(): void {
  void signOut().then(() => window.location.reload())
}

// The account panel, from the select or the pause overlay.
export function openAccount(): void {
  void openAccountPanel({ onSignOut: signOutAndReload })
}

// Colophon → main menu → (account step) → character select; resolves with
// the chosen outfit and the username. The menu offers Create Account to a
// visitor with no account, which opens the account step and comes back to
// the menu signed in; signed in, Die goes on to the select, which opens on
// the account's pick every time. The select, the account step and the menu
// mount first, black and inert, so the colophon above them stacks in DOM
// order and lifting it uncovers the menu. Who is signed in is asked at once
// and is known long before the colophon lifts. A page reached from a
// sign-in round trip (?auth=, set by the Worker) skips the colophon: the
// raider has seen it already. One still on the way to an account (a failed
// sign-in, a pending signup, no username yet) goes straight back to the
// account step.
// The account's settings land in `settings` as soon as they are known, so
// the menu's Settings shows them.
export async function showTitles(
  audio: BvAudio,
  settings: SettingsStore
): Promise<Titles> {
  const { pathname, search, hash } = window.location
  const returned = authReturnOf(search, copy('auth.sign_in_failed'))
  if (returned) {
    history.replaceState(null, '', pathname + stripAuthQuery(search) + hash)
  }
  const me = fetchMe().then((known) => {
    if (known?.account) settings.load(known.account.settings)
    return known
  })
  const skip = skipTitles()
  // A signed-in raider's round trip was a link; a signed-out one's error
  // belongs on the sign-in card instead.
  const noticeFor = (signedIn: boolean): string | null => {
    if (!returned || !signedIn) return null
    if ('error' in returned) return returned.error
    return returned.auth === 'linked' ? copy('panel.linked_ok') : null
  }
  if (skip) {
    const known = await me
    const username = known?.account?.username
    if (username) {
      return {
        ...pickOf(known.account?.look),
        username,
        hotbar: toHotbar(known.account?.hotbar),
        notice: noticeFor(true),
      }
    }
    // Sign a dev raider in and come back, once; a second miss (the name
    // taken by another dev account) falls through to the account step.
    if (!returned) {
      window.location.assign(
        devSignInUrl({
          userId: 'dev-user',
          username: DEV_USERNAME,
          redirect: window.location.pathname + window.location.search,
        })
      )
      return new Promise<Titles>(() => {})
    }
  }
  const select = mountCharacterSelect({
    config: { ...CONFIG.select, downscale: CONFIG.render.downscale },
    onAccount: openAccount,
    onSignOut: signOutAndReload,
  })
  const account = mountAccountStep()
  const menu = mountMainMenu({
    audio,
    config: LOGO,
    downscale: CONFIG.render.downscale,
    settings,
    onAccount: openAccount,
    onSignOut: signOutAndReload,
  })
  if (!skip && !returned) await showSplash({ audio, config: COLOPHON })
  let known = await me
  const signedIn = !!known?.account?.username
  // A round trip that has not yet ended in an account goes back to it, and
  // a failed one shows why on the sign-in card.
  let toAccount = !!returned && !signedIn
  let error =
    !signedIn && returned && 'error' in returned ? returned.error : null
  for (;;) {
    if (!toAccount) {
      const choice = await menu.choose(!!known?.account?.username)
      if (choice === 'die') break
    }
    toAccount = false
    const username = await account.run(known, error)
    error = null
    // Back from the sign-in card, or on with a new account: either way the
    // menu is next, and it asks again who is signed in.
    known = (await fetchMe()) ?? known
    if (known?.account) settings.load(known.account.settings)
    if (username && known?.account) known.account.username = username
  }
  menu.remove()
  // Unseen if the raider came signed in; gone already if they signed up.
  account.remove()
  const username = known?.account?.username
  if (!username) throw new Error('Died without an account')
  const chosen = await select.run(username, pickOf(known?.account?.look))
  // The pick is the account's, so it follows the raider to any browser.
  const saved = await saveLook(chosen)
  return {
    ...chosen,
    username,
    hotbar: toHotbar(known?.account?.hotbar),
    notice: saved.ok ? noticeFor(signedIn) : saved.error,
  }
}
