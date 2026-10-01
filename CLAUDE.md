# Bull Valley Shadow Wars

An extraction adventure RPG set in a hauntological Bull Valley, Illinois. 3D first-person in the browser, WASD + mouse, PS1 aesthetic. The engine was ported from forgotten-industries' ground-survey spike (provenance sha in the first commit); the spike's branding is gone — this is Bull Valley Shadow Wars, and a session of play is a **raid**, never a "run".

## Commands

- `npm run dev` — Vite dev server on port 5174
- `localhost:5174/akashic` — dev-only asset viewer (`akashic.html`, not in the build): one asset at a time through the game's PS1 pipeline, ←/→ to cycle, `#<id>` deep links, hook `window.__akashic` (ids, select, setView). Check asset edits here before a raid.
- `npm run build` / `npm run preview` — production bundle
- `npm test` / `npm run test:watch` — vitest unit tests (`tests/unit/`)
- `npm run pretty` — prettier; run before every commit
- `npm run fetch:data` — regenerate `public/data/bull-valley/` (network: Nominatim, Overpass, AWS terrain tiles; `--reuse-traffic` skips IDOT)

## The MVP loop

Spawn at a gas station → 5-minute loadout before Matthew Marx's white Chevy leaves → ride the bed, hop out anywhere → find cabbages in the wilderness → drop them at the Bull Valley Cabbage Stand → extract at another station, Mt. Coleman's Keep, or call the truck (`T`).

## Module map

- `src/main.js` — boot, scene, input wiring, render loop, raid orchestration
- `src/raid.js` — pure raid state machine (LOADOUT → RIDING → ON_FOOT → EXTRACTED)
- `src/roadgraph.js` — pure road-network graph, Dijkstra, arc-length walker
- `src/truck.js` — the white Chevy: mesh, drive/board/ride/call
- `src/cabbages.js` — pure seeded cabbage placement
- `src/brands.js` — pure: the five cigarette brands (each its own inventory kind); tuning and shop caps live in `CONFIG`
- `src/packart.js` — canvas trade-dress art for the cigarette packs
- `src/carousel.js` — pure: which items ride the inventory ring (carried, tailgate stock, cargo) and how the selection steps and wraps
- `src/inventoryview.js` — the inventory carousel in 3D: its own scene and camera, drawn by the game renderer in place of the world while the inventory is open (the player freezes; the raid clock does not)
- `src/landmarks.js` — consented landmark coordinates + projection
- `src/splash.js` — Northern Information colophon splash: pure triangle-wave machine + DOM overlay
- `src/assets.js` — every placed 3D asset in asset-local space (instanced parts + one-off builders) and the Akashic registry; new assets go here
- `src/world.js` — places terrain features, Citgo stations, pickups, beacons from geo.json using `assets.js`
- `src/akashic.js` — the Akashic asset viewer
- `src/terrain.js` `src/player.js` `src/coords.js` `src/ps1.js` `src/rng.js` `src/config.js` `src/inventory.js` `src/hud.js` `src/audio.js` `src/scope.js` — ported engine
- `src/shadowmen.js` `src/nerves.js` — parked, unwired; they return post-MVP

Pure logic stays Three-free (like `coords.js`); Three/DOM glue lives in `truck.js`/`world.js`/`hud.js`. Dev introspection hook: `window.__bv` (raid, truck, graph, teleport, hurryTruck).

## Standing rules

1. Geo data never includes driveways, private service roads, or buildings. Regenerate only via `scripts/fetch_bull_valley.cjs`, which enforces this.
2. No GPS EXIF in any media added to the repo.
3. Landmarks are consented or public places only. Keep the consent comments in `src/landmarks.js`.
4. The `three`/`vite` pins are deliberate: `ps1.js` patches Three shader chunks via `onBeforeCompile`, and Three minors rename chunks. Upgrading is its own task.
5. `public/data` is intentionally minified; it is in `.prettierignore`.
6. It's a raid, not a run — in code, copy, commits, and docs.
