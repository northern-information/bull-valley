# Bull Valley Shadow Wars

An extraction adventure RPG set in a hauntological Bull Valley, Illinois. 3D first-person in the browser, WASD + mouse, PS1 aesthetic. The engine was ported from forgotten-industries' ground-survey spike (provenance sha in the first commit); the spike's branding is gone — this is Bull Valley Shadow Wars, and a session of play is a **raid**, never a "run".

## Commands

- `npm run dev` — Vite dev server on port 5174
- `localhost:5174/akashic` — dev-only asset viewer (`akashic.html`, not in the build): one asset at a time through the game's PS1 pipeline, ←/→ to cycle, `#<id>` deep links, hook `window.__akashic` (ids, select, setView). Check asset edits here before a raid.
- `npm run build` / `npm run preview` — type check, then production bundle
- `npm run typecheck` — strict `tsc -b` over `src`, `tests`, and the TS configs
- `npm run lint` / `npm run lint:css` — ESLint (typescript-eslint) and Stylelint
- `npm test` / `npm run test:watch` / `npm run test:unit:coverage` — vitest unit tests (`tests/unit/`)
- `npm run test:e2e` — Playwright (`tests/e2e/`) against its own Vite dev server on port 5175; never against `preview`, since the dev hooks exist only in dev builds. First run: `npx playwright install chromium`
- `npm run pretty` — prettier (sorts imports too); run before every commit. `npm run format:check` checks without writing
- CI (`.github/workflows/ci.yml`) runs on every PR to `main` and every push to `main`: format, lint, types, unit tests with coverage, build, and e2e
- `npm run fetch:data` — regenerate `public/data/bull-valley/` (network: Nominatim, Overpass, AWS terrain tiles; `--reuse-traffic` skips IDOT)

## The MVP loop

Spawn at a gas station → 5-minute loadout before Matthew Marx's white Chevy leaves → ride the bed, hop out anywhere → find cabbages in the wilderness → drop them at the Bull Valley Cabbage Stand → extract at another station, Mt. Coleman's Keep, or call the truck (`T`).

## Module map

Strict TypeScript throughout, except `scripts/fetch_bull_valley.cjs`, which stays plain JS on purpose (testing a rewrite means refetching the survey). Shapes that cross modules (world points and heights, geo.json, items, the raid, ring entries) live in `src/interfaces.ts`; types one module owns stay in that module.

- `src/interfaces.ts` — shared types only, no runtime code

- `src/main.ts` — boot, scene, input wiring, render loop, raid orchestration; game rules go in the pure modules
- `src/raid.ts` — pure raid state machine (LOADOUT → RIDING → ON_FOOT → EXTRACTED) and the loadout clock
- `src/interactions.ts` — pure: what E would do right now (board, hop out, unload, extract, take a pickup) and its prompt; `main.ts` resolves it each frame
- `src/shop.ts` — pure: one purchase at the tailgate, returning new raid, stock, and inventory
- `src/roadgraph.ts` — pure road-network graph, Dijkstra, arc-length walker
- `src/truck.ts` — the white Chevy: seats the driver in the `assets.ts` body; drive/board/ride/call
- `src/figure.ts` — the shared character body: rigid low-poly parts on joint pivots, built per outfit; `applyPose` drives it
- `src/outfits.ts` — pure: every character outfit in one table (colors by slot, add-on parts, limb proportions); edit characters here
- `src/poses.ts` — pure: the body's joints, the poses (stand, sit, lean, crouch, walk cycle) and `samplePose`
- `src/playerbody.ts` — the player's own legs in first person: the player outfit, torso hidden, posed from the move speed
- `src/cabbages.ts` — pure seeded cabbage placement
- `src/items.ts` — pure: every item in one table (label, blurb, toasts, tuning, starting count, shop cap); edit items here. Meshes stay in `assets.ts`, keyed by id
- `src/canvas.ts` — shared 2D canvas helpers (`context2d`, `canvas`, `text`, fonts) for the painted art
- `src/packart.ts` — canvas trade-dress art for the cigarette packs
- `src/drinks.ts` — pure: drink container sizes and the per-family fit height; the drinks themselves (circa 2008, for sale at the tailgate, no effect yet) are entries in `items.ts`
- `src/canart.ts` — canvas trade-dress art for the drink labels, as they looked circa 2008
- `src/carousel.ts` — pure: which items ride the inventory ring (carried, tailgate stock, cargo) and how the selection steps and wraps
- `src/inventoryview.ts` — the inventory carousel in 3D: its own scene and camera, drawn by the game renderer in place of the world while the inventory is open (the player freezes; the raid clock does not)
- `src/landmarks.ts` — consented landmark coordinates + projection
- `src/splash.ts` — Northern Information colophon splash: pure triangle-wave machine + DOM overlay
- `src/assets.ts` — every 3D asset in asset-local space (instanced parts, one-off builders, the truck body, the sky, the road/water/fence/boundary materials) and the Akashic registry; new assets go here
- `src/world.ts` — places terrain features, Citgo stations, pickups, beacons from geo.json using `assets.ts`; builds no materials of its own
- `src/akashic.ts` — the Akashic asset viewer
- `src/terrain.ts` `src/player.ts` `src/coords.ts` `src/ps1.ts` `src/rng.ts` `src/config.ts` `src/inventory.ts` `src/hud.ts` `src/audio.ts` `src/scope.ts` — ported engine
- `src/shadowmen.ts` `src/nerves.ts` — parked, unwired; they return post-MVP
- The sound effects are parked too: the `BvAudio` methods other than the splash cue (`init`, `step`, `use`, `pickup`, `strike`, `setPresence`, `setHeartbeat`, `update`) have no caller, and the item `crackle` field is for them. `CONFIG.shadowmen` and `CONFIG.items.emberDetectScale` are read only by `shadowmen.ts`.

Pure logic stays Three-free (like `coords.ts`); Three/DOM glue lives in `truck.ts`/`world.ts`/`hud.ts`. Dev introspection hook: `window.__bv` (raid, truck, graph, teleport, hurryTruck).

## Testing in a browser

- Use `channel: 'chromium'` (full Chromium in headless mode) for Playwright. The default headless shell draws WebGL in software on macOS at about 2 fps, which is too slow to drive a raid. On CI there is no GPU at all, so specs take about 3 times longer; `playwright.config.ts` gives them longer timeouts when `CI` is set.
- Wait for `window.__bv` before you click Begin. `boot()` sets the hook last, after the input listeners. The button reads "Click to Play" before boot starts, so its text is not a ready signal.
- To prove that a refactor changes no asset, render every Akashic asset on `main` and on the branch from the same fixed view (`__akashic.select(id)` then `setView(35, 20)`). Compare the `.ak-stats` text and a hash of the canvas screenshot. Serve `main` from a `git archive` copy with a symlink to this repo's `node_modules`.

## Standing rules

1. Geo data never includes driveways, private service roads, or buildings. Regenerate only via `scripts/fetch_bull_valley.cjs`, which enforces this.
2. No GPS EXIF in any media added to the repo.
3. Landmarks are consented or public places only. Keep the consent comments in `src/landmarks.ts`.
4. The `three`/`vite` pins are deliberate: `ps1.ts` patches Three shader chunks via `onBeforeCompile`, and Three minors rename chunks. Upgrading is its own task.
5. `public/data` is intentionally minified; it is in `.prettierignore`.
6. It's a raid, not a run — in code, copy, commits, and docs.
