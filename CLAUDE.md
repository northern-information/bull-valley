# Bull Valley Shadow Wars

An extraction adventure RPG set in a hauntological Bull Valley, Illinois. 3D first-person in the browser, WASD + mouse, PS1 aesthetic. The engine was ported from forgotten-industries' ground-survey spike (provenance sha in the first commit); the spike's branding is gone — this is Bull Valley Shadow Wars, and a session of play is a **raid**, never a "run".

## Commands

- `npm run dev` — Vite dev server on port 5174. The Cloudflare Worker and its Durable Object run beside it in workerd (`@cloudflare/vite-plugin`), so this is the whole stack: open two windows and they meet in the valley. Dev state lives in `.wrangler/state`
- `localhost:5174/akashic` — dev-only asset viewer (`akashic.html`, not in the build): one asset at a time through the game's PS1 pipeline, ←/→ to cycle, `#<id>` deep links, hook `window.__akashic` (ids, select, setView). Check asset edits here before a raid.
- `npm run build` / `npm run preview` — type check, then production bundle: `dist/client/` and the Worker bundle with its generated `wrangler.json`, which `wrangler deploy` is pointed at through `.wrangler/deploy/config.json`
- `npm run typecheck` — `wrangler types` (writes the gitignored `worker-configuration.d.ts`), then strict `tsc -b` over `src`, `tests`, the TS configs, and `worker/`
- `npm run deploy` — build, then `wrangler deploy` to https://bull-valley-shadow-wars.tyler-cbe.workers.dev. CI does this from `.github/workflows/deploy.yml` after a green CI run on `main`, with the organization's `CLOUDFLARE_API_TOKEN` secret and the Northern Information account pinned in `wrangler.jsonc`; a `workflow_dispatch` from `main` also deploys
- `npm run lint` / `npm run lint:css` — ESLint (typescript-eslint, type-aware: mark a fire-and-forget promise with `void`; it generates the Workers types first, since the Worker files need them) and Stylelint
- `npm test` / `npm run test:watch` / `npm run test:unit:coverage` — vitest unit tests (`tests/unit/`) and the Worker tests (`tests/worker/`, mock sockets and a stub `cloudflare:workers`); coverage lists every file in `src` and `worker`
- `npm run test:e2e` — Playwright (`tests/e2e/`) against its own Vite dev server on port 5175 in `--mode test` (valley state in memory); never against `preview`, since the dev hooks exist only in dev builds. First run: `npx playwright install chromium`
- `npm run pretty` — prettier (sorts imports too); run before every commit. `npm run format:check` checks without writing
- CI (`.github/workflows/ci.yml`) runs on every PR to `main` and every push to `main`: format, lint, types, unit tests with coverage (the pure modules have a per-file floor in `vitest.config.ts`), build, and e2e. The e2e job runs in the Playwright Docker image as two parallel jobs: the `@raid` group, and every other spec
- `npm run fetch:data` — regenerate `public/data/bull-valley/` (network: Nominatim, Overpass, AWS terrain tiles; `--reuse-traffic` skips IDOT)

## The MVP loop

Spawn at a gas station → 5-minute loadout before Matthew Marx's white Chevy leaves → ride the bed, hop out anywhere → find cabbages in the wilderness → drop them at the Bull Valley Cabbage Stand → extract at another station, Mt. Coleman's Keep, or call the truck (`T`). Shadowmen cross the valley around you and show on the scope (`Q`); one that passes close rushes, and its touch puts you back at the spawn Citgo with everything you had.

## Multiplayer

One Cloudflare Worker serves the bundle and routes `/ws` to one Durable Object, `ValleyDO`, named `bull-valley`: everyone online is in the same valley and shares one raid. Each socket's player lives in its attachment (WebSocket Hibernation API); the raid lives in the object's storage, and the lobby clock is a storage alarm. The client sends a state frame (`x y z yaw pose riding`) at most `CONFIG.net.sendHz` a second and only when it changed; peers are drawn `CONFIG.net.interpolateMs` behind the present, between their last two frames. Same origin, no CORS. If the socket never answers, the game plays alone and the raid is the player's own.

The shared raid's rules are `src/sharedraid.ts`, a pure reducer the Worker runs and `tests/unit/sharedraid.test.ts` pins: the gas station is a lobby, and the truck leaves when everyone in it is aboard or when the clock runs out, with whoever is aboard (no invisible walls: walking off just means not boarding); one truck, one clock; pickups are shared by index into `world.pickups`, first to ask wins; `T` is one whistle at a time, and the called truck is the caller's until they extract or leave; the valley resets once no one is left in the raid. Every change comes to every client as a whole `RaidWire` snapshot with a reason; `main.ts` moves its own `Raid` machine from those (the arms, the deliveries and the sack stay local). Shared moments are server timestamps read through `clock.ts`: `raidClock` is derived from `startedAt`, and the truck drives against `departedAt` or the call's `at` (`Truck.driveRouteAt`), so every client agrees where it is. A client whose `world.pickups` count differs from the raid's is turned away (4005): bump `PROTOCOL_VERSION` when placement changes.

Dev only: `?valley=<id>` picks another Durable Object, so parallel e2e specs never meet; `beginRaid` in `tests/e2e/fixtures.ts` gives every page a fresh one unless a spec passes its own. The Worker stamps dev-server sockets, which unlocks the `dev` frames (`hurryTruck` moves the shared clock; `reset` empties the valley). Production ignores the parameter and the frames.

## Module map

Strict TypeScript throughout, except `scripts/fetch_bull_valley.cjs`, which stays plain JS on purpose (testing a rewrite means refetching the survey). Shapes that cross modules (world points and heights, geo.json, items, the raid, ring entries) live in `src/interfaces.ts`; types one module owns stay in that module.

- `src/interfaces.ts` — shared types only, no runtime code
- `src/protocol.ts` — pure: the wire protocol, imported by the client and the Worker (frames, close codes, name rules, `parseClientMessage`)
- `src/sharedraid.ts` — pure: the shared raid's rules as a reducer over the valley (lobby, departure, pickups, the whistle, reset)
- `src/clock.ts` — pure: the server-clock offset from ping round trips
- `src/presence.ts` — pure: the peer table, two-frame interpolation, Scaduscope contacts
- `src/net.ts` — the WebSocket client: hello, reconnect with backoff, pings; `ready` resolves online or offline
- `src/peers.ts` — the other players in Three: one `figure.ts` body per peer and a pixelated name sprite
- `worker/index.ts` — the Worker router (`/ws` to the valley, everything else to the assets binding, the dev stamp); `worker/ValleyDO.ts` — the Durable Object: sockets, storage, the alarm, and the reducer. Checked by `worker/tsconfig.json` with Workers types, so the Worker tests live in `tests/worker/`, not `tests/unit/`

- `src/main.ts` — boot, scene, input wiring, render loop, raid orchestration; game rules go in the pure modules
- `src/raid.ts` — pure raid state machine (LOADOUT → RIDING → ON_FOOT → EXTRACTED) and the loadout clock
- `src/interactions.ts` — pure: what E would do right now (board, hop out, unload, extract, take a pickup) and its prompt; `main.ts` resolves it each frame
- `src/shop.ts` — pure: one purchase at the tailgate, returning new raid, stock, and inventory
- `src/roadgraph.ts` — pure road-network graph, Dijkstra, arc-length walker
- `src/ground.ts` — pure: what to stand on at any point. The terrain is a heightfield and the roads and station lots float a little over it; `world.ts` registers those surfaces on a `Ground`, and `world.ground.at(x, z)` returns the terrain or the surface deck, whichever is higher. The player, the truck, and every placed thing stand on `ground.at`; only the terrain mesh and the surfaces themselves sample the raw `heightAt`
- `src/truck.ts` — the white Chevy: seats the driver in the `assets.ts` body; drive/board/ride/call; `driveRouteAt` drives against a shared clock, and the bed has numbered seats
- `src/figure.ts` — the shared character body: rigid low-poly parts on joint pivots, built per outfit; `applyPose` drives it
- `src/outfits.ts` — pure: every character outfit in one table (colors by slot, add-on parts, limb proportions); edit characters here
- `src/poses.ts` — pure: the body's joints, the poses (stand, sit, lean, crouch, walk cycle) and `samplePose`
- `src/playerbody.ts` — the player's own legs in first person: the outfit picked at the character select, torso hidden, posed from the move speed
- `src/characters.ts` — pure: the selectable roster (in select-screen order) and the saved pick and name in localStorage
- `src/characterselect.ts` — the character select: one figure on a PS1 turntable with its own small renderer (the game's does not exist yet) and the name field, mounted at boot beneath the title cards. A name is required (the rules are `protocol.ts`'s, 1 to 16 characters); Choose stays disabled without one
- `src/cabbages.ts` — pure seeded cabbage placement
- `src/items.ts` — pure: every item in one table (label, blurb, toasts, tuning, starting count, shop cap); edit items here. Meshes stay in `assets.ts`, keyed by id
- `src/canvas.ts` — shared 2D canvas helpers (`context2d`, `canvas`, `text`, fonts) for the painted art
- `src/packart.ts` — canvas trade-dress art for the cigarette packs
- `src/drinks.ts` — pure: drink container sizes and the per-family fit height; the drinks themselves (circa 2008, for sale at the tailgate, no effect yet) are entries in `items.ts`
- `src/canart.ts` — canvas trade-dress art for the drink labels, as they looked circa 2008
- `src/decalart.ts` — canvas art for the decals on character parts (prints over the torso, thighs and arms; the buckle face); outfits name them by `DecalId`
- `src/carousel.ts` — pure: which items ride the inventory ring (carried, tailgate stock, cargo) and how the selection steps and wraps
- `src/inventoryview.ts` — the inventory carousel in 3D: its own scene and camera, drawn by the game renderer in place of the world while the inventory is open (the player freezes; the raid clock does not)
- `src/landmarks.ts` — consented landmark coordinates + projection
- `src/splashmachine.ts` — pure: the title-card state machine (triangle-wave fade, gesture and skip latches)
- `src/splash.ts` — the title-card DOM overlays (the Northern Information colophon, then the logo), driven by `splashmachine.ts`
- `src/fog.ts` — the logo card's black fog: one plain-WebGL fragment shader (fbm noise in rolling waves) at the game's downscale
- `src/assets.ts` — every 3D asset in asset-local space (instanced parts, one-off builders, the truck body, the sky, the road/water/fence/boundary materials) and the Akashic registry; new assets go here
- `src/world.ts` — places terrain features, Citgo stations, pickups, beacons from geo.json using `assets.ts`; builds no materials of its own
- `src/akashic.ts` — the Akashic asset viewer
- `src/terrain.ts` `src/player.ts` `src/coords.ts` `src/ps1.ts` `src/rng.ts` `src/config.ts` `src/inventory.ts` `src/hud.ts` `src/audio.ts` `src/scope.ts` — ported engine
- `src/shadowmen.ts` — pure: the shadowmen as crossings in a bubble that follows the player (spawned on a ring past scope range, dropped past `despawnRadius`), the rush when one passes close to a player on foot, the touch that is a strike, and the Citgo havens; feeds the scope. Tune them in `CONFIG.shadowmen`
- `src/shadowcards.ts` — the silhouette cards that show `shadowmen.ts` (textures, aura, flicker), one card per field slot
- `src/nerves.ts` — parked, unwired; it returns with the nerves meter
- The sound effects are parked too: the `BvAudio` methods other than the title-card cues (`init`, `step`, `use`, `pickup`, `strike`, `setPresence`, `setHeartbeat`, `update`) have no caller, and the item `crackle` field is for them.

Pure logic stays Three-free (like `coords.ts`); Three/DOM glue lives in `truck.ts`/`world.ts`/`hud.ts`. Dev introspection hook: `window.__bv` (raid, truck, graph, shadowmen, net, teleport, hurryTruck).

## Testing in a browser

- Use `channel: 'chromium'` (full Chromium in headless mode) for Playwright. The default headless shell draws WebGL in software on macOS at about 2 fps, which is too slow to drive a raid. On CI there is no GPU at all, so specs take about 3 times longer; `playwright.config.ts` gives them longer timeouts when `CI` is set.
- Boot runs colophon → logo → character select → intro. Each title layer is black and stacked over the next, and a layer's keys arm only once it is showing: Space starts the colophon, Space skips it and then the logo, ←/→ and Enter choose. In the name field the keys type (Enter chooses, Escape leaves the field); a fresh visitor starts in it. `passTitles` in `tests/e2e/fixtures.ts` drives it; `?skipSplash` skips all three in dev and uses the saved pick and name (or "Raider").
- Wait for `window.__bv` before you click Begin. `boot()` sets the hook last, after the input listeners. The button reads "Click to Play" before boot starts, so its text is not a ready signal.
- To prove that a refactor changes no asset, render every Akashic asset on `main` and on the branch from the same fixed view (`__akashic.select(id)` then `setView(35, 20)`). Compare the `.ak-stats` text and a hash of the canvas screenshot. Serve `main` from a `git archive` copy with a symlink to this repo's `node_modules`.

## Standing rules

1. Geo data never includes driveways, private service roads, or buildings. Regenerate only via `scripts/fetch_bull_valley.cjs`, which enforces this.
2. No GPS EXIF in any media added to the repo.
3. Landmarks are consented or public places only. Keep the consent comments in `src/landmarks.ts`.
4. The `three`/`vite` pins are deliberate: `ps1.ts` patches Three shader chunks via `onBeforeCompile`, and Three minors rename chunks. Upgrading is its own task.
5. `public/data` is intentionally minified; it is in `.prettierignore`.
6. It's a raid, not a run — in code, copy, commits, and docs.
7. Nothing stands on the raw terrain. Place and move things with `world.ground.at`, and register any new walkable surface (a floor, a deck, a lot) on the `Ground` in `world.ts` before placing on it.
8. One truck, one clock, shared pickups. A rule of the shared raid belongs in `src/sharedraid.ts` with a test, never in the Worker or in `main.ts`.
