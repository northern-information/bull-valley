// Bull Valley Dial-Up's boot (sharedworld.ts rule 29), picked by entry.ts
// for a phone: no three.js, no world. The modem first (modemhud.ts): a tap
// dials the valley with a `dial` instead of a hello (net.ts), and CONNECT
// prints only once its welcome comes; a phone no one is signed in on gets
// LOGIN and the sign-in card (signin.ts). Then the shell (dialshell.ts),
// fed by the valley's frames through dialstate.ts, and the stand's dialog
// borrowed whole from the 3D valley (standdialog.ts).

import './styles.css'
import './dialup.css'
import { fetchMe, refreshSession, saveHotbar } from './auth.ts'
import { pickOf } from './characters.ts'
import { CONFIG } from './config.ts'
import { copy } from './copy.ts'
import { switchUrl } from './dialpick.ts'
import { DialShell } from './dialshell.ts'
import { applyFrame, asked, DIALED } from './dialstate.ts'
import { text } from './dom.ts'
import { fontsReady } from './fonts.ts'
import { toHotbar } from './hotbar.ts'
import { mountModem } from './modemhud.ts'
import { NetClient, socketUrl } from './net.ts'
import { CLOSE } from './protocol.ts'
import { toSettings } from './settings.ts'
import { mountAccountStep } from './signin.ts'
import { openStandDialog } from './standdialog.ts'
import type { DialState } from './dialstate.ts'
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
  const [known] = await Promise.all([fetchMe(), fontsReady()])
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
    if (msg.type === 'welcome') modem.connected()
    state = applyFrame(state, msg, performance.now())
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

  const send = (msg: ClientMessage, what: 'stand' | 'locker') => {
    state = asked(state, what)
    net.send(msg)
    shell?.render(state)
  }
  const now = () => net.clock.serverNow(performance.now())
  shell = new DialShell(root, {
    name: account.username,
    hotbar: toHotbar(account.hotbar),
    now,
    switchHref: switchUrl(window.location, 'valley'),
    pack: {
      move: (type, kind, count) => {
        if (count > 0) send({ type, kind, count }, 'locker')
      },
      saveHotbar: (bar, said) => {
        void saveHotbar(bar).then((saved) => {
          const line = saved.ok ? said : saved.error
          state = { ...state, said: { text: line, at: performance.now() } }
          shell?.render(state)
        })
      },
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
          send({ type: 'stand-stock', kind, count }, 'stand'),
        onCollect: () => send({ type: 'stand-collect' }, 'stand'),
        onUpgrade: () => send({ type: 'stand-upgrade' }, 'stand'),
      }).then(() => shell?.render(state))
    },
  })
  shell.render(state)
  setInterval(() => shell?.tick(), 1000)
}

boot().catch((err: unknown) => {
  console.error('Bull Valley Dial-Up failed to boot:', err)
})
