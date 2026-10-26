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
import { FANFARE } from './catchfanfare.ts'
import { pickOf } from './characters.ts'
import { citgoNames } from './citgomap.ts'
import { CONFIG } from './config.ts'
import { openCookDialog } from './cookdialog.ts'
import { copy } from './copy.ts'
import { openDealDialog } from './dealdialog.ts'
import { ramble } from './dealer.ts'
import { switchUrl } from './dialpick.ts'
import { DialShell } from './dialshell.ts'
import {
  applyFrame,
  asking,
  DIALED,
  heardOf,
  lineLost,
  sayLine,
  withCitgoNames,
} from './dialstate.ts'
import { text } from './dom.ts'
import { fontsReady } from './fonts.ts'
import { gronSays, openGronDialog } from './grondialog.ts'
import { befriended, partied } from './inspect.ts'
import { itemLine } from './itemcopy.ts'
import { openMoabDialog } from './moabdialog.ts'
import { mountModem } from './modemhud.ts'
import { openNameDialog } from './namedialog.ts'
import { NetClient, socketUrl } from './net.ts'
import { npcLine } from './npcs.ts'
import { GRAIN_URL, imagesReady } from './preload.ts'
import { levelOf } from './progression.ts'
import { CLOSE } from './protocol.ts'
import { erwinQuest, gronQuest, questNow, questShown } from './quests.ts'
import { openRecycleDialog } from './recycledialog.ts'
import { createSettingsStore } from './settingsui.ts'
import { createSfx } from './sfxrig.ts'
import { openShopDialog } from './shopdialog.ts'
import { mountAccountStep } from './signin.ts'
import { SILENT } from './silent.ts'
import { openStandDialog } from './standdialog.ts'
import { mountTapBurst } from './tapfeedback.ts'
import type { Fanfare } from './catchfanfare.ts'
import type { DialState, Pending } from './dialstate.ts'
import type { Geo } from './interfaces.ts'
import type { ClientMessage } from './protocol.ts'
import type { SfxId } from './sfx.ts'

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
  // Every tap on a button bursts and ticks (tapfeedback.ts).
  mountTapBurst(() => settings.current.sfx)
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
  // The valley's sounds the phone hears (sfx.ts): fishing's, and what a
  // frame calls for (dialstate.ts heardOf), in the head as the 3D valley
  // hears them, at the account's sound volume; none on a silent page. The
  // rig wakes on the first, which a tap has always just armed.
  const sfx = SILENT ? null : createSfx()
  const sound = (id: SfxId) => {
    if (!sfx) return
    sfx.update({ started: true, setting: settings.current.sfx })
    sfx.play(id)
  }
  // Every trader's window turns the item in its table on the shell's
  // renderer (itemthumbs.ts).
  const turntable = {
    spin: (canvas: HTMLCanvasElement, kind: string) =>
      shell?.spin(canvas, kind),
    stop: () => shell?.stopSpin(),
  }
  // Every trader's window cheers the last trade made a big deal of
  // (tradefanfare.ts) as a fish landed: the fanfare, and the phone buzzing.
  const tradeCheer = {
    now: () => state.tradeCheer,
    cheer: (fanfare: Fanfare) => {
      sound('fish-fanfare')
      if ('vibrate' in navigator) navigator.vibrate(FANFARE.buzz[fanfare.tier])
    },
  }
  net.on((msg) => {
    // Rule 36: a fish too big for the skill breaks the line coming in.
    if (msg.type === 'catch' && msg.outcome === 'snap') sound('line-snap')
    if (msg.type === 'welcome') {
      modem.connected()
      // Without the survey a Citgo found goes unnamed in the log.
      void names()
        .then((list) => {
          state = withCitgoNames(state, list)
          shell?.render(state)
        })
        .catch(() => undefined)
      // The friends list, for the Social tab, and the research, for the
      // lobby's Recycling Center card and the raider's record (rule 33).
      net.send({ type: 'friends' })
      net.send({ type: 'research' })
      net.send({ type: 'angler' })
    }
    const next = applyFrame(state, msg, performance.now(), Date.now())
    // A frame that changes nothing the phone shows (a pong, a peer's
    // state) leaves the screen be.
    if (next === state) return
    for (const id of heardOf(state, next, msg, performance.now())) sound(id)
    state = next
    takeOnShown()
    shell?.render(state)
    if (msg.type === 'inspected') showInspected()
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
  // A raider's card (inspect.ts), opened when the valley's answer lands
  // and brought up to date while it is open (dialstate.ts keeps it).
  let inspecting = false
  const showInspected = () => {
    const card = state.inspected
    if (inspecting || !card) return
    inspecting = true
    void import('./dial3d.ts')
      .then(({ openInspectDialog }) =>
        openInspectDialog({
          card: () => state.inspected ?? card,
          onFriend: (name) => {
            send({ type: 'friend', name }, { ask: { op: 'friend', name } })
            if (net.online && state.inspected) {
              state = { ...state, inspected: befriended(state.inspected) }
            }
          },
          onCrew: (name) => send({ type: 'crew-invite', name }, { crew: name }),
          onParty: (name) => {
            send({ type: 'invite', name }, { invite: name })
            if (net.online && state.inspected) {
              state = { ...state, inspected: partied(state.inspected) }
            }
          },
        })
      )
      .finally(() => {
        inspecting = false
        state = { ...state, inspected: null }
        shell?.render(state)
      })
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
  // Who the raider is, as Your Name and Moab leave them, here or in the
  // 3D valley.
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
  // Carlsten's lines as his shelves open, in turn.
  let carlstenSaid = 0
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
      take: (kind, count) => {
        if (count > 0) send({ type: 'unstow', kind, count }, { locker: true })
      },
    },
    openErwin: () => {
      void openDealDialog({
        says: ramble(rambled++),
        stock: () => state.world?.dealer ?? null,
        pack: () => state.pack,
        pending: () => state.pending.deal,
        said: () => state.said?.text ?? null,
        quest: () =>
          questShown(
            erwinQuest(state.quests),
            state.quests,
            state.pack,
            'erwin'
          ),
        icon: (kind) => shell?.icon(kind) ?? Promise.reject(new Error()),
        fanfare: tradeCheer,
        turntable,
        onDeal: (kind, offer) =>
          send({ type: 'deal', kind, offer }, { deal: true }),
        onQuest: () => {
          const quest = erwinQuest(state.quests)
          const step = questNow(quest, state.quests, state.pack, 'erwin').next
          if (step) send({ type: 'quest', quest, step }, { deal: true })
        },
      }).then(() => shell?.render(state))
    },
    // Gron and the quest he gives, as at the bush (rule 26: dialed in, he
    // is a call away).
    openGron: () => {
      void openGronDialog({
        says: gronSays(),
        open: () => state.world !== null,
        quest: () => {
          const quest = gronQuest(state.quests)
          return questShown(quest, state.quests, state.pack, 'gron')
        },
        pending: () => state.pending.deal,
        said: () => state.said?.text ?? null,
        onStep: () => {
          const quest = gronQuest(state.quests)
          const step = questNow(quest, state.quests, state.pack, 'gron').next
          if (step) send({ type: 'quest', quest, step }, { deal: true })
        },
      }).then(() => shell?.render(state))
    },
    openName: () => {
      void openNameDialog({
        username,
        onRenamed: (name) => {
          username = name
          state = { ...state, name }
          shell?.setName(name)
          net.send({ type: 'rename' })
        },
      })
    },
    citgo: {
      open: (station, name) => {
        void openShopDialog({
          name,
          says: npcLine('carlsten', carlstenSaid++),
          shelf: () => state.world?.shelves[station] ?? null,
          cash: () => state.cash,
          pending: () => state.pending.buy !== null,
          said: () => state.said?.text ?? null,
          icon: (kind) => shell?.icon(kind) ?? Promise.reject(new Error()),
          fanfare: tradeCheer,
          turntable,
          onBuy: (kind, unit) =>
            send(
              { type: 'buy', station, kind, unit },
              { buy: { station, kind } }
            ),
        }).then(() => shell?.render(state))
      },
    },
    citgoNames: names,
    openMoab: () => {
      void openMoabDialog({
        open: () => state.world !== null,
        pack: () => state.pack,
        owned: () => state.cosmetics,
        pending: () => state.pending.trade,
        said: () => state.said?.text ?? null,
        icon: (kind) => shell?.icon(kind) ?? Promise.reject(new Error()),
        onTrade: (offer) =>
          send({ type: 'trade', offer }, { trade: true, tradeOffer: offer }),
        fanfare: tradeCheer,
        turntable,
        // Your Character, with its turntable, loads with the rest of the
        // phone's 3D.
        mountLook: (box) =>
          import('./dial3d.ts').then(({ mountLookPanel }) =>
            mountLookPanel(box, {
              outfit: look.outfit,
              finish: look.finish,
              cosmetics: () => state.cosmetics,
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
          ),
      }).then(() => shell?.render(state))
    },
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
      inspect: (name) => send({ type: 'inspect', name }, { inspect: name }),
      invite: (name) => send({ type: 'invite', name }, { invite: name }),
      leave: () => send({ type: 'party-leave' }, {}),
      crewJoin: (tag) => send({ type: 'crew-join', tag }, { crew: tag }),
      crewLeave: () => send({ type: 'crew-leave' }, {}),
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
    // Rule 29: dialed in, the firefly pond is wherever the phone is, as the
    // stand is (rule 36), drawn in the lobby's sheet (dialfish.ts).
    fish: {
      tackle: () => send({ type: 'tackle' }, { fish: true }),
      dig: () => send({ type: 'dig' }, { fish: true }),
      cast: (bait) => send({ type: 'cast', bait }, { fish: true }),
      reel: (landed) => send({ type: 'reel', landed }, { fish: true }),
      sound,
      empty: (said) => {
        state = { ...state, line: null }
        say(said)
      },
    },
    // Rule 29: dialed in, the recycling machine is wherever the phone is.
    openRecycle: () => {
      send({ type: 'research' }, {})
      void openRecycleDialog({
        research: () => state.research,
        pack: () => state.pack,
        pending: () => state.pending.recycle,
        said: () => state.said?.text ?? null,
        onRecycle: (line) => send({ type: 'recycle', line }, { recycle: true }),
      }).then(() => shell?.render(state))
    },
    // Rule 29: dialed in, the campfire is wherever the phone is.
    openCook: () => {
      void openCookDialog({
        pack: () => state.pack,
        pending: () => state.pending.cook,
        said: () => state.said?.text ?? null,
        onCook: (kind, count) =>
          send({ type: 'cook', kind, count }, { cook: true }),
      }).then(() => shell?.render(state))
    },
  })
  shell.render(state)
  setInterval(() => shell?.tick(), 1000)
}

boot().catch((err: unknown) => {
  console.error('Bull Valley Dial-Up failed to boot:', err)
})
