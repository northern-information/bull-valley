// Bull Valley Dial-Up's boot (sharedworld.ts rule 29), picked by entry.ts
// for a phone: no three.js, no world. The modem first (modemhud.ts): a tap
// dials the valley with a `dial` instead of a hello (net.ts), and CONNECT
// prints only once its welcome comes; a phone no one is signed in on gets
// LOGIN and the sign-in card (signin.ts). Then the shell (dialshell.ts),
// fed by the valley's frames through dialstate.ts, and the stand's dialog
// borrowed whole from the 3D valley (standdialog.ts).

import './styles.css'
import './dialup.css'
import { fetchMe, refreshSession, saveHotbar, saveLook } from './auth.ts'
import { pickOf } from './characters.ts'
import { citgoNames } from './citgomap.ts'
import { CONFIG } from './config.ts'
import { copy } from './copy.ts'
import { openDealDialog } from './dealdialog.ts'
import { ramble } from './dealer.ts'
import { switchUrl } from './dialpick.ts'
import { DialShell } from './dialshell.ts'
import { applyFrame, asked, DIALED, sayLine } from './dialstate.ts'
import { text } from './dom.ts'
import { fontsReady } from './fonts.ts'
import { toHotbar } from './hotbar.ts'
import { mountModem } from './modemhud.ts'
import { NetClient, socketUrl } from './net.ts'
import { GRAIN_URL, imagesReady } from './preload.ts'
import { levelOf } from './progression.ts'
import { CLOSE } from './protocol.ts'
import { dealerStep, roseLine, roseProgress } from './quests.ts'
import { toSettings } from './settings.ts'
import { mountAccountStep } from './signin.ts'
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
  const account = known?.account ?? null
  const settings = toSettings(account?.settings)
  const net = new NetClient({
    url: socketUrl(window.location, import.meta.env.DEV),
    config: CONFIG.net,
    beforeOpen: () => refreshSession(),
  })

  let state: DialState = DIALED
  let shell: DialShell | null = null
  const modem = mountModem(root, {
    // Under e2e the valley is never heard.
    volume: import.meta.env.MODE === 'test' ? null : settings.sfx / 100,
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
      // The friends list, for the Social tab.
      net.send({ type: 'friends' })
    }
    const next = applyFrame(state, msg, performance.now())
    // A frame that changes nothing the phone shows (a pong, a peer's
    // state) leaves the screen be, so a tap never lands on a redraw.
    if (next === state) return
    state = next
    shell?.render(state)
  })
  net.onRefused((code) => {
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

  const send = (msg: ClientMessage, what: Partial<Pending>) => {
    state = asked(state, what)
    net.send(msg)
    shell?.render(state)
  }
  const now = () => net.clock.serverNow(performance.now())
  // The valley's word on the screen, for what the phone itself says.
  const say = (text: string) => {
    state = { ...state, said: { text, at: performance.now() } }
    shell?.render(state)
  }
  // Who the raider is, as Gron leaves them.
  let username = account.username
  let look = pickOf(account.look)
  // Erwin's rambles, in turn.
  let rambled = 0
  shell = new DialShell(root, {
    name: username,
    outfit: look.outfit,
    finish: look.finish,
    models: () => import('./dial3d.ts'),
    hotbar: toHotbar(account.hotbar),
    now,
    switchHref: switchUrl(window.location, 'valley'),
    pack: {
      move: (type, kind, count) => {
        if (count > 0) send({ type, kind, count }, { locker: true })
      },
      saveHotbar: (bar, said) => {
        void saveHotbar(bar).then((saved) => say(saved.ok ? said : saved.error))
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
            shell?.setName(name)
            net.send({ type: 'rename' })
          },
          onBecome: (outfit, finish) => {
            look = { outfit, finish }
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
    citgoNames: async () => {
      const res = await fetch('/data/bull-valley/geo.json')
      const geo = (await res.json()) as Geo
      return citgoNames(geo)
    },
    trade: (offer) => send({ type: 'trade', offer }, { trade: true }),
    social: {
      say: (line) => {
        const said = sayLine(
          state,
          line,
          { name: username, level: levelOf(state.xp) },
          Date.now()
        )
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
