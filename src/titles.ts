// What comes before the valley: the colophon, the logo, the account step,
// and the character select, each a black layer stacked over the next.
// Resolves with the account's username and the outfit it raids in.

import { authReturnOf, devSignInUrl, stripAuthQuery } from './account.ts'
import { openAccountPanel } from './accountpanel.ts'
import { fetchMe, saveLook, signOut } from './auth.ts'
import { pickOf } from './characters.ts'
import { mountCharacterSelect } from './characterselect.ts'
import { CONFIG } from './config.ts'
import { copy } from './copy.ts'
import { toHotbar } from './hotbar.ts'
import { mountAccountStep } from './signin.ts'
import { COLOPHON, LOGO, mountCard, showSplash, skipTitles } from './splash.ts'
import type { BvAudio } from './audio.ts'
import type { CharacterPick } from './characters.ts'
import type { Hotbar } from './hotbar.ts'

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
function signOutAndReload(): void {
  void signOut().then(() => window.location.reload())
}

// Colophon → logo → account step → character select; resolves with the
// chosen outfit and the username. The select, the account step, and the
// logo mount first, black and inert, so the cards above them stack in DOM
// order and each reveal uncovers the next. Who is signed in is asked at
// once and is known long before the logo lifts. A page reached from a
// sign-in round trip (?auth=, set by the Worker) skips the colophon and the
// logo: the raider has seen them already.
export async function showTitles(audio: BvAudio): Promise<Titles> {
  const { pathname, search, hash } = window.location
  const returned = authReturnOf(search, copy('auth.sign_in_failed'))
  if (returned) {
    history.replaceState(null, '', pathname + stripAuthQuery(search) + hash)
  }
  const me = fetchMe()
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
    onAccount: () => {
      void openAccountPanel({ onSignOut: signOutAndReload })
    },
    onSignOut: signOutAndReload,
  })
  const account = mountAccountStep()
  if (!skip && !returned) {
    const logo = mountCard({
      audio,
      config: LOGO,
      fog: { downscale: CONFIG.render.downscale },
    })
    await showSplash({ audio, config: COLOPHON })
    logo.start()
    await logo.done
  }
  const known = await me
  const signedIn = !!known?.account?.username
  const username = await account.run(
    known,
    !signedIn && returned && 'error' in returned ? returned.error : null
  )
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
