# Bull Valley Shadow Wars

An adventure RPG set in a hauntological Bull Valley, Illinois. 3D first-person in the browser, WASD + mouse, PS1 aesthetic. The valley is one persistent world that everyone online shares; its players are **raiders**. The raid (a session that ends at an extract) is set aside for now and will come back; until then nothing in the game starts or ends a raid.

Two apps share one codebase: the 3D valley (`src/main.ts`) and Bull Valley Dial-Up, the phone app (`src/dialmain.ts`). One Cloudflare Worker serves both and routes `/ws` to one Durable Object (`worker/ValleyDO.ts`), which runs the shared world's pure reducer (`src/sharedworld.ts`) and keeps accounts in D1.

## Read before you work

| Doc                                        | Read it when                                                    |
| ------------------------------------------ | --------------------------------------------------------------- |
| [docs/tooling.md](docs/tooling.md)         | You run, build, deploy, migrate, or change CI                   |
| [docs/gameplay.md](docs/gameplay.md)       | You touch gameplay: what a raider sees and does                 |
| [docs/multiplayer.md](docs/multiplayer.md) | You touch the wire, the Worker, D1, auth, or a sharedworld rule |
| [docs/modules.md](docs/modules.md)         | You add, rename, move, or look for a module                     |
| [docs/testing.md](docs/testing.md)         | You write or run e2e specs, or drive the game in a browser      |

`AGENTS.md` is a symlink to this file.

## Commands

- `npm run dev` — the whole stack on port 5174 (Vite plus the Worker in workerd). Run `npm run db:migrate` once on a fresh checkout.
- `npm run typecheck`, `npm run lint`, `npm run lint:css`, `npm test`, `npm run test:e2e` (port 5175, `--mode test`).
- `npm run pretty` before every commit. CI checks format, lint, migrations, types, unit tests with per-file coverage floors, build, and three e2e shards.
- Deploys go through GitHub only (`.github/workflows/deploy.yml` after green CI on `main`). Never run `npm run deploy` from a machine.
- `localhost:5174/akashic` is the asset viewer; `#map` is the map editor. Check asset edits there.

## Gotchas

- Every module under `src/` and `worker/` needs its line in `docs/modules.md`. `tests/unit/modulemap.test.ts` fails on a module the map does not name, and on a name with no module.
- Modules the e2e specs import (`bindings.ts`, `account.ts`) must not import `copy.ts`: Playwright cannot load `?raw`. `items.ts` and the pure modules that read it take their words from `itemcopy.ts`.
- Pure modules stay free of three.js and the DOM. Three/DOM glue lives in the rigs, `world.ts`, and the HUD modules.
- `migrations/0007_stashes.sql` and `0007_tasks.sql` share a number. Never rename either: production's `d1_migrations` table records them by name (`tests/unit/migrations.test.ts` pins the pair).
- A file no unit test imports reports 0 of 0 statements, which reads as 100% coverage. Give any module under a floor in `vitest.config.ts` a test, or list it in `THREE_AND_DOM`.
- In the desktop app's browser pane, open the dev server with `?mute`; it sets no `navigator.webdriver`.
- Wait for `window.__bv` before you click Begin. The button's text is not a ready signal.

## Typography

IBM Plex Mono everywhere, self-hosted (`public/fonts/`), tokens `--bv-font` and `--bv-text-size` in `index.html`. Both boots await `fontsReady()` and `imagesReady()` before they build any DOM, and the face is `font-display: block`, so no text paints in a fallback. Canvas UI text uses `MONO` from `canvas.ts`. Trade dress (packs, cans, medicine, Citgo signs) keeps its own period faces. A label that changes in place must not resize its box (`bv-btn--stack`). Nothing draws a focus ring: a focused button lifts as a hovered one does.

## Standing rules

1. The map never includes driveways, private service roads, or buildings. Edit `public/data/bull-valley/` by hand, and bump `PROTOCOL_VERSION` whenever a change moves where things are placed.
2. No GPS EXIF in any media added to the repo.
3. Landmarks are consented or public places only. Keep the consent comments in `src/landmarks.ts`.
4. The `three`/`vite` pins are deliberate: `ps1.ts` patches Three shader chunks via `onBeforeCompile`, and Three minors rename chunks. Upgrading is its own task.
5. `public/data` is intentionally minified; it is in `.prettierignore`.
6. A session of play, when the raid comes back, is a raid, not a run — in code, copy, commits, and docs. Its players are raiders.
7. Nothing stands on the raw terrain. Place and move things with `world.ground.at`, and register any new walkable surface (a floor, a deck, a lot) on the `Ground` in `world.ts` before placing on it.
8. One persistent world, one truck, one clock, shared pickups, shared shelves, shared shadowmen and their tombstones, one Caretaker, shared drops, the Citgo portals, one berry a day per account at each bush, the Citgos each account has stood at, each account's progress through the season and on the daily task, its Book of Shadows, its XP, its Cabbage Stand, its research at the Recycling Center, its fishing at the firefly pond and its quests, its waypoints, every body a strike left, each account's health and geometrie, and every item in the account's pack and its locker, every cent in its wallet and every cosmetic it wears, the files on the bathroom laptop, and where each account last stood, kept by the valley. No game state is kept in the browser. A rule of the shared world belongs in `src/sharedworld.ts` (or `src/marx.ts`, for the truck, or `src/shadowstep.ts`, for the shadowmen's step) with a test, never in the Worker or in the client glue (`main.ts`, `actions.ts`, `valleysync.ts`, `loop.ts`); the client's reading of a snapshot belongs in `src/worldsync.ts`, also with a test.
9. Player-facing text lives in `COPY.toml`, never inline in code: add the entry, then call `copy('section.key')`. Anything an AI writes or rewrites there is `by = "ai"`. Never set `by = "tyler"`, and never change the text of a `"tyler"` entry unless Tyler asks. Tests and specs assert copy through `copy()`, never as literals, so editing a line never breaks a test. Out of the file: the laptop's readme (`LAPTOP.TXT`, kept as typed), `public/auth-done.html`, the `index.html` meta tags, provider names, the Akashic page, the Dev provider's sign-in form, and painted trade dress.
10. Never honor `prefers-reduced-motion`: everything that moves always moves, the same for every raider. Do not read the media query or add a still mode.
11. The game is two apps, the 3D valley (`main.ts`) and Bull Valley Dial-Up (`dialmain.ts`), and a change asked of one belongs in both unless the ask names one alone or the other has nothing it could apply to. The look they share (the house style, the film grain, the fog, the logo and the colophon, the fonts, every menu, title card, overlay and dialog), the copy, the account and its sign-in, and anything an account keeps (rule 8) change in both in the same commit: a film grain change to every menu reaches the 3D valley's titles, menu, pause overlay and dialogs and Dial-Up's modem, shell and sheets. Where the other app has no counterpart (a frame only a body sends, a sight only the 3D valley draws), say so in the commit rather than leaving it silent.
12. Keep `docs/` current in the same commit as the change it describes. A new mechanic gets its paragraph in `docs/gameplay.md`; a new frame, table, or sharedworld rule gets its sentence in `docs/multiplayer.md`.
