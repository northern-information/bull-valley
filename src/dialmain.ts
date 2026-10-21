// Bull Valley Dial-Up's boot (sharedworld.ts rule 29), picked by entry.ts
// for a phone: no three.js, no world. The modem first (modemhud.ts): a tap
// dials the valley with a `dial` instead of a hello (net.ts), and CONNECT
// prints only once its welcome comes; a phone no one is signed in on gets
// LOGIN and the sign-in card (signin.ts). Then the shell (dialshell.ts),
// fed by the valley's frames through dialstate.ts, and the stand's dialog
// borrowed whole from the 3D valley (standdialog.ts).

import './styles.css'
import './dialup.css'
import { openAccountPanel } from './accountpanel.ts'
import { fetchMe, refreshSession, saveLook, signOut } from './auth.ts'
import { mountBuildTag } from './buildtag.ts'
import { pickOf } from './characters.ts'
import { citgoNames } from './citgomap.ts'
import { CONFIG } from './config.ts'
import { copy } from './copy.ts'
import { openDealDialog } from './dealdialog.ts'
import { ramble } from './dealer.ts'
import { switchUrl } from './dialpick.ts'
import { DialShell } from './dialshell.ts'
import {
  applyFrame,
  asking,
  DIALED,
  lineLost,
  sayLine,
  withCitgoNames,
} from './dialstate.ts'
import { text } from './dom.ts'
import { fontsReady } from './fonts.ts'
import { itemLine } from './itemcopy.ts'
import { mountModem } from './modemhud.ts'
import { NetClient, socketUrl } from './net.ts'
import { GRAIN_URL, imagesReady } from './preload.ts'
import { levelOf } from './progression.ts'
import { CLOSE } from './protocol.ts'
import { dealerStep, roseLine, roseProgress } from './quests.ts'
import { createSettingsStore } from './settingsui.ts'
import { mountAccountStep } from './signin.ts'
import { SILENT } from './silent.ts'
import { openStandDialog } from './standdialog.ts'
import type { DialState, Pending } from './dialstate.ts'
import type { Geo } from './interfaces.ts'
import type { ClientMessage } from './protocol.ts'

// The phone's own name and colours, for adding it to the home screen.
function brand(): void {
  document.title = copy('dialup.title')
  const manifest = document.createElement('link')
  manifest.rel = 'manifest'
  manifest.href = '/dialup.webmanifest'
  document.head.append(manifest)
  document.documentElement.classList.add('bv-dialup')
}

async function boot(): Promise<void> {
  const root = document.getElementById('bv-root')
  if (!root) throw new Error('Missing #bv-root')
  brand()
  // The face, the grain and the logos before the modem paints.
  const [known] = await Promise.all([
    fetchMe(),
    fontsReady(),
    imagesReady([GRAIN_URL, CONFIG.splash.imageSrc, CONFIG.logo.imageSrc]),
  ])
  mountBuildTag()
  const account = known?.account ?? null
  // The account's volumes, shared with the 3D valley and saved to the
  // account a moment after a slider is let go (settingsui.ts).
  const settings = createSettingsStore()
  settings.load(account?.settings)
  const net = new NetClient({
    url: socketUrl(window.location, import.meta.env.DEV),
    config: CONFIG.net,
    beforeOpen: () => refreshSession(),
  })

  let state: DialState = DIALED
  // Takes on a name or body the valley shows back (set once the shell is
  // up).
  let takeOnShown = () => {}
  // Each Citgo's name off the survey, read once: the Citgo sheet lists
  // them, and the log names a Citgo found.
  let named: Promise<string[]> | null = null
  const names = () =>
    (named ??= fetch('/data/bull-valley/geo.json')
      .then((res) => res.json() as Promise<Geo>)
      .then(citgoNames))
  let shell: DialShell | null = null
  const modem = mountModem(root, {
    // A silent page (silent.ts) is never heard.
    volume: SILENT ? null : settings.current.sfx / 100,
    onDial: () => {
      if (!account?.username) {
        modem.signedOut()
        return
      }
      void net.dial(pickOf(account.look).outfit).then((status) => {
        if (status === 'offline' && !shell) modem.noCarrier()
      })
    },
  })
  net.on((msg) => {
    if (msg.type === 'welcome') {
      modem.connected()
      // Without the survey a Citgo found goes unnamed in the log.
      void names()
        .then((list) => {
          state = withCitgoNames(state, list)
          shell?.render(state)
        })
        .catch(() => undefined)
      // The friends list, for the Social tab.
      net.send({ type: 'friends' })
    }
    const next = applyFrame(state, msg, performance.now(), Date.now())
    // A frame that changes nothing the phone shows (a pong, a peer's
    // state) leaves the screen be.
    if (next === state) return
    state = next
    takeOnShown()
    shell?.render(state)
  })
  net.onRefused((code) => {
    // A session lost mid-play, as the 3D valley says it: the modem is long
    // gone, so say so and come back to it, where the line answers LOGIN.
    if (code === CLOSE.unauthenticated && shell) {
      say(copy('log.signed_out'))
      setTimeout(() => window.location.reload(), CONFIG.net.signedOutReloadMs)
      return
    }
    if (code === CLOSE.unauthenticated) {
      modem.signedOut()
      return
    }
    root.replaceChildren(text('p', copy('dialup.refused'), 'bv-dial-note'))
  })

  const login = await modem.done
  if (login || !account?.username) {
    // Sign in (a full-page round trip that comes back here, modem and
    // all), or choose a username; Back dials again.
    await mountAccountStep().run(known, null)
    window.location.reload()
    return
  }

  // An ask waits on the valley only while the line is up; a tap on a
  // dropped line says so and leaves every button free.
  const send = (msg: ClientMessage, what: Partial<Pending>) => {
    state = asking(state, what, net.online, performance.now())
    net.send(msg)
    shell?.render(state)
  }
  // The line dropped: net.ts redials on its own, and nothing asked of it
  // is answered now, so nothing waits on it.
  net.onStatus((status) => {
    if (status !== 'offline' || !shell) return
    state = lineLost(state, performance.now(), Date.now())
    shell.render(state)
  })
  const now = () => net.clock.serverNow(performance.now())
  // Signed out, the modem dials again and the line answers LOGIN.
  const signOutAndRedial = () => {
    void signOut().then(() => window.location.reload())
  }
  // The valley's word on the screen, for what the phone itself says.
  const say = (text: string) => {
    state = { ...state, said: { text, at: performance.now() } }
    shell?.render(state)
  }
  // Who the raider is, as Gron leaves them, here or in the 3D valley.
  let username = account.username
  let look = pickOf(account.look)
  state = { ...state, name: username, outfit: look.outfit }
  // A name or body changed in the 3D valley comes back as our own peer
  // (dialstate.ts): the shell and a redial's dial take it on.
  takeOnShown = () => {
    if (state.name !== username) {
      username = state.name
      shell?.setName(username)
    }
    if (state.outfit && state.outfit !== look.outfit) {
      look = { ...look, outfit: state.outfit }
      shell?.setLook(look.outfit, look.finish)
      net.setOutfit(look.outfit)
    }
  }
  // Erwin's rambles, in turn.
  let rambled = 0
  shell = new DialShell(root, {
    name: username,
    outfit: look.outfit,
    finish: look.finish,
    models: () => import('./dial3d.ts'),
    now,
    switchHref: switchUrl(window.location, 'valley'),
    settings,
    // The 3D valley's own panel: providers to link and unlink, and Sign
    // Out.
    openAccount: () => {
      void openAccountPanel({ onSignOut: signOutAndRedial }).then(() =>
        shell?.render(state)
      )
    },
    signOut: signOutAndRedial,
    pack: {
      // Rule 27: the valley takes the unit and doses and mends the
      // account; the phone says it as the 3D valley does.
      use: (kind) => {
        send({ type: 'use', kind }, { use: true })
        const used = itemLine(kind, 'used')
        if (net.online && used) say(used)
      },
      move: (type, kind, count) => {
        if (count > 0) send({ type, kind, count }, { locker: true })
      },
    },
    openErwin: () => {
      void openDealDialog({
        says: ramble(rambled++),
        stock: () => state.world?.dealer ?? null,
        pack: () => state.pack,
        pending: () => state.pending.deal,
        said: () => state.said?.text ?? null,
        quest: () => ({
          ...roseLine(state.quests.rose, state.pack),
          step: roseProgress(state.quests.rose, state.pack),
        }),
        onDeal: (kind, pay) =>
          send({ type: 'deal', kind, pay }, { deal: true }),
        onQuest: () => {
          const step = dealerStep(state.quests.rose)
          if (step) send({ type: 'quest', quest: 'rose', step }, { deal: true })
        },
      }).then(() => shell?.render(state))
    },
    openGron: () => {
      void import('./dial3d.ts').then(({ openGronDialog }) =>
        openGronDialog({
          username,
          outfit: look.outfit,
          finish: look.finish,
          cosmetics: state.cosmetics,
          onRenamed: (name) => {
            username = name
            state = { ...state, name }
            shell?.setName(name)
            net.send({ type: 'rename' })
          },
          onBecome: (outfit, finish) => {
            look = { outfit, finish }
            state = { ...state, outfit }
            void saveLook(look).then((saved) => {
              if (!saved.ok) say(saved.error)
            })
            shell?.setLook(outfit, finish)
            // A redial says hello in the new body too.
            net.setOutfit(outfit)
            net.send({ type: 'appearance', outfit })
          },
        })
      )
    },
    citgo: {
      buy: (station, kind, unit) =>
        send({ type: 'buy', station, kind, unit }, { buy: { station, kind } }),
    },
    citgoNames: names,
    trade: (offer) => send({ type: 'trade', offer }, { trade: true }),
    expeditions: {
      send: (kind) =>
        send({ type: 'expedition-send', kind }, { expedition: true }),
      claim: () => send({ type: 'expedition-claim' }, { expedition: true }),
    },
    social: {
      say: (line) => {
        const said = sayLine(
          state,
          line,
          { name: username, level: levelOf(state.xp) },
          Date.now()
        )
        if (said.frame && !net.online) {
          say(copy('dialup.no_signal'))
          return
        }
        state = said.state
        if (said.frame) net.send(said.frame)
        shell?.render(state)
      },
      friend: (name) =>
        send({ type: 'friend', name }, { ask: { op: 'friend', name } }),
      unfriend: (name) =>
        send({ type: 'unfriend', name }, { ask: { op: 'unfriend', name } }),
    },
    openStand: () => {
      void openStandDialog({
        goods: CONFIG.stand.goods,
        ledger: () => state.stand,
        pack: () => state.pack,
        cash: () => state.cash,
        now,
        pending: () => state.pending.stand,
        said: () => state.said?.text ?? null,
        onStock: (kind, count) =>
          send({ type: 'stand-stock', kind, count }, { stand: true }),
        onCollect: () => send({ type: 'stand-collect' }, { stand: true }),
        onUpgrade: () => send({ type: 'stand-upgrade' }, { stand: true }),
      }).then(() => shell?.render(state))
    },
  })
  shell.render(state)
  setInterval(() => shell?.tick(), 1000)
}

boot().catch((err: unknown) => {
  console.error('Bull Valley Dial-Up failed to boot:', err)
})
