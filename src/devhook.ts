// window.__bv: the dev-only introspection hook the e2e specs read the game
// through. boot() installs it last, after the input listeners, and only in
// dev builds, so production bundles never carry it.

import { phoneOfCitgo } from './citgos.ts'
import { unitToWorld } from './coords.ts'
import { isSfxId, SFX_IDS } from './sfx.ts'
import { levelsAt } from './wardlevels.ts'
import { crawlingSlurms } from './world.ts'
import type { Actions } from './actions.ts'
import type { CaretakerShade } from './caretakerrig.ts'
import type { ChatLine } from './chat.ts'
import type { CitgoLog } from './citgos.ts'
import type { CorpseWire } from './corpses.ts'
import type { CosmeticId } from './cosmetics.ts'
import type { TaskProgress } from './dailytask.ts'
import type { Drop } from './drops.ts'
import type { AnglerWire, ArrowDir, LineOut, PondPlace } from './fishing.ts'
import type { FishPhase } from './fishplay.ts'
import type { CrewState, Game } from './game.ts'
import type { Grave } from './graves.ts'
import type { Hallucination, HallucinationShape } from './hallucinations.ts'
import type { Hand } from './hands.ts'
import type { Tool } from './held.ts'
import type { Hotbar } from './hotbar.ts'
import type { SlurmSpot } from './interactions.ts'
import type { Inventory, WardAxis, XZ } from './interfaces.ts'
import type { TruckState } from './marx.ts'
import type { MistCards } from './mistcards.ts'
import type { NetStatus } from './net.ts'
import type { Player } from './player.ts'
import type { Portal } from './portals.ts'
import type { Peer } from './presence.ts'
import type {
  DailyWire,
  FriendWire,
  PartyWire,
  PeerStateWire,
  TunnelShadeWire,
  WorldWire,
} from './protocol.ts'
import type { Research } from './recycling.ts'
import type { RoadGraph } from './roadgraph.ts'
import type { SeasonProgress } from './season.ts'
import type { ShadowBodies } from './shadowbodies.ts'
import type { ShadeKind } from './shadowmen.ts'
import type { StandLedger } from './stand.ts'
import type { PlacedCar } from './trafficrig.ts'
import type { Truck } from './truck.ts'
import type { Waypoints } from './waypoints.ts'
import type { World } from './world.ts'
import type * as THREE from 'three'

interface BvHook {
  scene: THREE.Scene
  camera: THREE.PerspectiveCamera
  renderer: THREE.WebGLRenderer
  player: Player
  world: World
  truck: Truck
  graph: RoadGraph
  // The traffic's cars near the player as last drawn (none under e2e).
  readonly traffic: PlacedCar[]
  shadowmen: ShadowBodies
  caretaker: CaretakerShade
  // The Undercroft's tunnel shades as last drawn.
  readonly tunnel: TunnelShadeWire[]
  mist: MistCards
  // Times a touch shattered this raider's geometrie and put them back at
  // the Citgo.
  readonly strikes: number
  // Geometrie (health.ts), left and whole: the account's as the valley
  // last said, or our own.
  readonly health: number
  readonly healthMax: number
  net: {
    readonly status: NetStatus
    readonly id: string | null
    peers(): Peer[]
  }
  // The shared world as the valley last sent it; null before it has.
  readonly valley: WorldWire | null
  // Matthew Marx's truck, the valley's; null before it has said.
  readonly marx: TruckState | null
  // The berry bushes as the valley last described them; null before.
  readonly daily: DailyWire | null
  readonly aboard: boolean
  // What the glow rings right now (glow.ts); null for nothing.
  readonly glow: THREE.Object3D | null
  // In cents.
  readonly cash: number
  // The account's progress through the season, as the valley last said.
  readonly season: SeasonProgress
  // The Book of Shadows entries found (book.ts ids), as the valley last
  // said; and whether the book is open.
  readonly book: string[]
  readonly bookOpen: boolean
  // The account's progress on the daily task, as the valley last said.
  readonly task: TaskProgress
  // The account's XP in all (progression.ts), as the valley last said.
  readonly xp: number
  // Where the account stands on each quest (quests.ts), as the valley
  // last said; null before the welcome.
  readonly quests: Readonly<Record<string, string>> | null
  // The account's friends list, as the valley last sent it.
  readonly friends: readonly FriendWire[]
  // Rule 34: the party, as the valley last sent it.
  readonly party: PartyWire
  // Rule 35: the crew and the invites waiting, as the valley last sent
  // them.
  readonly crew: CrewState
  // The pack as this client holds it: the valley's last word, plus guesses.
  readonly inventory: Inventory
  // What lies dropped, the valley's.
  readonly drops: readonly Drop[]
  // The shadowmen's tombstones, the valley's.
  readonly graves: readonly Grave[]
  // The bodies lying in the valley, and which of them are this account's.
  readonly corpses: readonly CorpseWire[]
  readonly myCorpses: readonly number[]
  // What the account's locker holds, and whether the pack is open at it.
  readonly stash: Inventory
  readonly lockerOpen: boolean
  // Sitting at the laptop in the Citgo bathroom (rule 31).
  readonly laptopOpen: boolean
  // The account's Cabbage Stand as the valley last said (null before), and
  // where the stand stands.
  readonly stand: StandLedger | null
  readonly standAt: XZ | null
  // Rule 33: the account's research as the valley last said (null before
  // the Recycling Center first opens), and where each station's recycling
  // machine stands, indexed like the stations.
  readonly research: Research | null
  readonly recyclers: XZ[]
  // Rule 36: the account's angler as the valley last said (null before the
  // tackle box first opens), the line in the water, and the firefly ponds:
  // each one's middle, its haven's reach and its tackle box's landing.
  readonly angler: AnglerWire | null
  readonly line: LineOut | null
  readonly ponds: PondPlace[]
  // Rule 40: each pond's campfire, in pond order.
  readonly campfires: XZ[]
  // The slurms crawling on the parked Citgo's lot, in the world (what a
  // jar can catch).
  readonly slurms: SlurmSpot[]
  // Rule 28: every Citgo the account has stood at and the last, the Citgo
  // portals open, the id of ours while it stands, the milliseconds before
  // a portal takes us again after one has (CONFIG.portal.graceSeconds),
  // and whether the phone is up and the map open.
  readonly citgos: CitgoLog
  readonly portals: readonly Portal[]
  readonly myPortal: number | null
  readonly portalGrace: number
  readonly phoneRaised: boolean
  readonly mapOpen: boolean
  // Rule 37: the account's waypoints, as the valley last said.
  readonly waypoints: Waypoints
  // The item on each number key, slot 0 for 1.
  readonly hotbar: Hotbar
  // The wards right now: how high, stimulated, drunk and tripping, each
  // 0 to 1.
  readonly wards: Record<WardAxis, number>
  // The chat log, oldest first.
  readonly chat: readonly ChatLine[]
  // The flashlight in the left hand (or the jar or the rod in its place,
  // `held`), and the item the right last raised.
  readonly flashlight: Hand
  readonly held: Tool | null
  // The hotbar slot the hand holds, and what is in it while the pack is.
  readonly selected: number
  readonly inHand: string | null
  // The fight over the view: where the line stands.
  readonly fishPhase: FishPhase
  // The last state frame sent to the valley: where it last heard we are.
  readonly sent: PeerStateWire | null
  readonly using: { kind: string; at: number } | null
  teleport(u: number, v: number): void
  // The left button, for a page without pointer lock: the flashlight
  // alone, or whatever the hand holds; a number key; and A or D in a
  // fight.
  toggleFlashlight(): void
  useHand(): void
  select(slot: number): void
  pressFish(dir: ArrowDir): void
  // A Citgo portal opened ahead of the raider at once, as if the phone had
  // dialed it through; and fast travel to the portal phone by Citgo
  // `station`'s door, as if clicked on the map.
  openPortal(): void
  fastTravel(station: number): void
  // Fast travel to portal phone `phone` (world.payphones).
  phoneTravel(phone: number): void
  // A shadowman standing still at world (x, z), through a dev frame.
  // A spider instead when `spider` (CONFIG.shadowmen.spider).
  // true for a spider, as it always was, or the kind.
  placeShadowman(x: number, z: number, kind?: boolean | ShadeKind): void
  // The Caretaker moved to world (x, z), formed, its hunt forgotten,
  // floating still until it has someone to hunt, through a dev frame.
  placeCaretaker(x: number, z: number): void
  hurryTruck(seconds?: number): void
  // Bring the next drop of slurms at the nearest Citgo to now (this
  // client's view alone; slurms.ts).
  hurrySlurms(): void
  // Hold the slurms off (or let them fall again), so Carlsten stays
  // behind his counter (this client's view alone).
  holdSlurms(on: boolean): void
  // Every sound's id (sfx.ts), and one played: at world (x, z), or in the
  // head without a place. Nothing under e2e, which never plays sound.
  readonly sfxIds: readonly string[]
  sfx(id: string, x?: number, z?: number): void
  // A quiet valley: no crossing shadowman rushes anyone, only one a spec
  // places. The valley's, through a dev frame, or this client's own.
  calm(): void
  // What the account wears (cosmetics.ts).
  readonly cosmetics: readonly CosmeticId[]
  // `count` of `kind` into the pack: the valley's, through a dev frame, or
  // this client's own. Gold bullion has no other way in yet.
  grant(kind: string, count?: number): void
  // `cents` into the wallet, through a dev frame.
  earn(cents: number): void
  // One `kind` used out of the pack, as E in the pack uses it.
  use(kind: string): void
  // This raider at `points` hit points (1 to whole), for the specs.
  setHealth(points: number): void
  // What a trip shows this raider that is not there (hallucinations.ts):
  // those standing, the bursts set off so far, and one made out ahead
  // now, whatever the trip (it flickers out again unless they trip).
  hallucinations: {
    readonly list: readonly Hallucination[]
    readonly bursts: number
    conjure(shape?: HallucinationShape): Hallucination | null
  }
}

declare global {
  interface Window {
    __bv?: BvHook
  }
}

export function installDevHook(game: Game, actions: Actions): void {
  const { state: s, net, peers, hud, glow, player } = game
  window.__bv = {
    scene: game.scene,
    camera: game.camera,
    renderer: game.renderer,
    player,
    world: game.world,
    truck: game.truck,
    graph: game.graph,
    get traffic() {
      return game.traffic?.cars ?? []
    },
    shadowmen: game.shadowmen,
    caretaker: game.caretaker,
    get tunnel() {
      return game.tunnel.shown
    },
    mist: game.mist,
    get strikes() {
      return s.strikes
    },
    get health() {
      return s.health
    },
    get healthMax() {
      return s.healthMax
    },
    net: {
      get status() {
        return net.status
      },
      get id() {
        return net.id
      },
      peers: () => peers.list(),
    },
    get valley() {
      return s.world
    },
    get marx() {
      return s.world?.truck ?? null
    },
    get daily() {
      return s.daily
    },
    get aboard() {
      return s.aboard
    },
    get glow() {
      return glow.target
    },
    get cash() {
      return s.cash
    },
    get season() {
      return s.season
    },
    get book() {
      return [...s.book]
    },
    get bookOpen() {
      return s.bookOpen
    },
    get task() {
      return s.task
    },
    get xp() {
      return s.xp
    },
    get quests() {
      return s.quests
    },
    get friends() {
      return s.friends
    },
    get party() {
      return s.party
    },
    get crew() {
      return s.crew
    },
    get inventory() {
      return s.inventory
    },
    get drops() {
      return s.drops
    },
    get graves() {
      return s.graves
    },
    get corpses() {
      return s.corpses
    },
    get myCorpses() {
      return s.myCorpses
    },
    get stash() {
      return s.stash
    },
    get lockerOpen() {
      return s.lockerOpen
    },
    get laptopOpen() {
      return s.laptop !== null
    },
    get stand() {
      return s.stand
    },
    get standAt() {
      return game.world.stand?.at ?? null
    },
    get research() {
      return s.research
    },
    get recyclers() {
      return game.world.recyclers.map(({ at }) => at)
    },
    get angler() {
      return s.angler
    },
    get line() {
      return s.line
    },
    get slurms() {
      return crawlingSlurms(game.world).map(
        ({ station, slot, index, x, z }) => ({
          station,
          slot,
          index,
          x,
          z,
        })
      )
    },
    get campfires() {
      return game.world.ponds.map(({ campfire }) => campfire.at)
    },
    get ponds() {
      return game.world.ponds.map(({ place }) => ({
        x: place.x,
        z: place.z,
        radius: place.radius,
        landing: place.landing,
      }))
    },
    get citgos() {
      return s.citgos
    },
    get portals() {
      return s.portals
    },
    get myPortal() {
      return s.myPortal
    },
    get portalGrace() {
      return Math.max(0, s.portalGraceUntil - performance.now())
    },
    get phoneRaised() {
      return game.phone.raised
    },
    get mapOpen() {
      return s.mapOpen
    },
    get waypoints() {
      return s.waypoints
    },
    get hotbar() {
      return s.hotbar
    },
    get wards() {
      return levelsAt(s.wards, s.time)
    },
    get chat() {
      return hud.chatLines
    },
    get flashlight() {
      return s.flashlight
    },
    get held() {
      return s.held
    },
    get selected() {
      return s.selected
    },
    get inHand() {
      return actions.inHand()
    },
    get fishPhase() {
      return game.fishHud.phase
    },
    get sent() {
      return s.lastSent
    },
    get using() {
      return s.using
    },
    teleport(u: number, v: number) {
      const { x, z } = unitToWorld(u, v, game.geo.metres)
      player.relocate(x, z)
    },
    toggleFlashlight: () => actions.toggleFlashlight(),
    useHand: () => actions.useHand(),
    select: (slot: number) => actions.select(slot),
    pressFish: (dir: ArrowDir) => game.fishHud.press(dir),
    openPortal: () => actions.openPortal(),
    fastTravel: (station: number) => {
      const phone = phoneOfCitgo(game.world.payphones, station)
      if (phone !== null) actions.fastTravel(phone)
    },
    phoneTravel: (phone: number) => actions.fastTravel(phone),
    placeShadowman(x: number, z: number, kind: boolean | ShadeKind = 'man') {
      // true is a spider, as it always was.
      const shade: ShadeKind =
        kind === true ? 'spider' : kind === false ? 'man' : kind
      net.send(
        shade === 'man'
          ? { type: 'dev', op: 'shadowman', x, z }
          : { type: 'dev', op: 'shadowman', x, z, kind: shade }
      )
    },
    placeCaretaker(x: number, z: number) {
      net.send({ type: 'dev', op: 'caretaker', x, z })
    },
    calm() {
      net.send({ type: 'dev', op: 'calm' })
    },
    get cosmetics() {
      return s.cosmetics
    },
    use(kind) {
      actions.useKind(kind)
    },
    grant(kind, count = 1) {
      net.send({ type: 'dev', op: 'grant', kind, count })
    },
    earn(cents) {
      net.send({ type: 'dev', op: 'earn', cents })
    },
    setHealth(points) {
      net.send({ type: 'dev', op: 'health', points })
    },
    hallucinations: {
      get list() {
        return game.hallucinations.list
      },
      get bursts() {
        return game.hallucinations.bursts
      },
      conjure: (shape) =>
        game.hallucinations.conjure(
          {
            time: s.time,
            tripping: levelsAt(s.wards, s.time).tripping,
            player: player.pos,
            feet: player.groundY,
            yaw: player.yaw,
            blocked: game.world.walls.between,
          },
          shape
        ),
    },
    sfxIds: SFX_IDS,
    sfx(id, x, z) {
      if (!isSfxId(id)) return
      const at =
        x === undefined || z === undefined
          ? null
          : { x, y: game.world.ground.at(x, z) + 1.2, z }
      game.sfx?.play(id, at)
    },
    hurrySlurms() {
      game.world.shelves.hurrySlurms()
    },
    holdSlurms(on) {
      game.world.shelves.holdSlurms(on)
    },
    hurryTruck(seconds = 5) {
      // The server keeps Marx's day; a dev server lets a spec bring his
      // next change closer.
      net.send({ type: 'dev', op: 'hurry', seconds })
    },
  }
}
