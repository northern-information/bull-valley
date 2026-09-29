# Bull Valley Shadow Wars

An extraction adventure RPG set in a hauntological Bull Valley, Illinois. 3D first-person in the browser, WASD + mouse, PS1 aesthetic. Engine ported from forgotten-industries' Ground Survey spike (provenance sha in the first commit).

## Commands

- `npm run dev` — Vite dev server on port 5174
- `npm run build` / `npm run preview` — production bundle
- `npm test` / `npm run test:watch` — vitest unit tests (`tests/unit/`)
- `npm run pretty` — prettier; run before every commit
- `npm run fetch:data` — regenerate `public/data/bull-valley/` (network: Nominatim, Overpass, AWS terrain tiles; `--reuse-traffic` skips IDOT)

## The MVP loop

Spawn at a gas station → 5-minute loadout before Matthew Marx's white Chevy leaves → ride the bed, hop out anywhere → find cabbages in the wilderness → drop them at the Bull Valley Cabbage Stand → extract at another station, Mt. Coleman's Keep, or call the truck (`T`).

## Module map

- `src/main.js` — boot, scene, input wiring, render loop, run orchestration
- `src/run.js` — pure run state machine (LOADOUT → RIDING → ON_FOOT → EXTRACTED)
- `src/roadgraph.js` — pure road-network graph, Dijkstra, arc-length walker
- `src/truck.js` — the white Chevy: mesh, drive/board/ride/call
- `src/cabbages.js` — pure seeded cabbage placement
- `src/landmarks.js` — consented landmark coordinates + projection
- `src/world.js` — builds terrain features, stations, pickups, markers from geo.json
- `src/terrain.js` `src/player.js` `src/coords.js` `src/ps1.js` `src/rng.js` `src/config.js` `src/inventory.js` `src/hud.js` `src/audio.js` `src/scope.js` — ported engine
- `src/shadowmen.js` `src/nerves.js` — parked, unwired; they return post-MVP

Pure logic stays Three-free (like `coords.js`); Three/DOM glue lives in `truck.js`/`world.js`/`hud.js`.

## Standing rules

1. Geo data never includes driveways, private service roads, or buildings. Regenerate only via `scripts/fetch_bull_valley.cjs`, which enforces this.
2. No GPS EXIF in any media added to the repo.
3. Landmarks are consented or public places only. Keep the consent comments in `src/landmarks.js`.
4. The `three`/`vite` pins are deliberate: `ps1.js` patches Three shader chunks via `onBeforeCompile`, and Three minors rename chunks. Upgrading is its own task.
5. `public/data` is intentionally minified; it is in `.prettierignore`.
