# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Current state

**Milestone M1 (`DESIGN.md` §18) is scaffolded and working:** npm-workspaces monorepo
(`shared/`, `server/`, `client/`), username/password auth with JWT, SQLite save store with
GET/PUT and optimistic concurrency, and a Home screen with the bean, its four moods + anger,
`feed`/`knitBlanket`/`sleep`, autosave and an IndexedDB offline mirror.

**Not built yet (M2–M5):** `giveSpace` / `digHoles`, the village builder, Dr. Bubblegum's
quests, mini-games, combat, life-stage/leveling progression, referrals, baby mode, the Viking
expansion, and Playwright E2E tests. `shared/content.ts` is a stub — it only carries mood
presentation data.

## Commands

Run from the repo root:

| Command | What it does |
| ------- | ------------ |
| `npm install` | Installs all workspaces. Approve install scripts if npm prompts (see below). |
| `npm run dev` | `server` on :3000 (tsx watch) + `client` on :5173 (Vite, proxies `/api` → :3000). |
| `npm test` | Vitest unit tests in `shared/` and supertest API tests in `server/`. |
| `npm run typecheck` | `tsc --noEmit` across all three workspaces. |
| `npm run build` | Builds `client/dist` (Vite + PWA) then bundles the server with tsup. |
| `npm start` | Production: Express serves the built PWA **and** `/api` from one origin on :3000. |
| `npm run db:generate` | drizzle-kit generates SQL into `server/drizzle/` after a schema change. |
| `npm run db:migrate` | Applies migrations manually (the server also migrates on boot). |

Per-workspace scripts take a `--workspace` flag, e.g. `npm run test --workspace server`. Use the
package name (`@jelly/client`) if the directory name isn't matched.

Dependency notes worth preserving:

- **`better-sqlite3` is pinned to `^12.11.1`** — that line publishes prebuilt binaries for the
  Node 26 ABI (147); `13.x` currently does not and would force a source build.
- **TypeScript is pinned to `~5.9`**, not the 7.x native line, to stay on ground that Vite,
  Vitest and drizzle-kit are tested against.
- npm ≥ 11 gates install scripts. `package.json` carries an `allowScripts` block for
  `bcrypt`, `better-sqlite3` and `esbuild`; they need it to build/fetch their binaries.
- `npm audit` reports dev-only advisories from drizzle-kit's bundled esbuild and concurrently's
  `shell-quote`. Fixing them means downgrading those tools; leave them.

## Documents and their relationship

- **`CONCEPT.md`** — the game design of *Jelly Bean Simulator* (a fictional game reconstructed
  from a Story Pirates podcast episode). It is the source of truth for *what the game is*: moods,
  currencies (jelly coins / bean bucks / bonus beans), characters (Dr. Bubblegum, the watermelon
  witch), village, combat, life stages, skills, flavors, and expansions.
- **`DESIGN.md`** — the engineering companion: *how to build it*. It specifies the full technical
  design (stack, architecture, game-state model, API, DB schema, PWA/offline, milestones).
- **`TRANSCRIPT.md`** — the original podcast transcript CONCEPT was derived from. It is
  **gitignored** (see `.gitignore`) and must not be re-committed.

When implementing or extending the game, treat CONCEPT.md as the design authority and DESIGN.md as
the implementation blueprint; keep both consistent with any changes you make.

## Architecture

An **iPhone-first PWA** with a save backend:

- **`shared/`** (`@jelly/shared`) — framework-agnostic TypeScript: the canonical versioned
  `GameState` (`gameState.ts`), **pure simulation functions** (`sim.ts`: `tick`, `applyAction`,
  `offlineCatchup`, `moodCallouts`), tunable constants (`economy.ts`), content data
  (`content.ts`), zod schemas (`schema.ts`) and `migrateSave` (`migrations.ts`). Single source of
  truth for game rules, imported by *both* client and server. Put game logic here, not in the
  client. It is consumed as **TypeScript source** (`exports` → `./src/index.ts`), so it has no
  build step — Vite transpiles it and tsup bundles it via `noExternal`.
- **`client/`** — React 19 + Vite 8 + Tailwind 4 PWA (`vite-plugin-pwa`).
  **Client-authoritative simulation**: `useTickLoop` advances the sim from the wall clock,
  `store/gameStore.ts` (Zustand) holds `GameState`, `useAutosave` pushes to the server every 30 s
  / on backgrounding, and `net/offlineCache.ts` mirrors to IndexedDB.
- **`server/`** — Node + Express 5 + TypeScript REST API over **SQLite** (`better-sqlite3` +
  Drizzle). `createApp(db)` in `app.ts` is the testable factory; `index.ts` boots it, runs
  migrations and serves `client/dist` in production. The **server is a save store, not the sim
  authority** — it stores/returns the `GameState` blob and does not re-simulate. Auth is
  username/password with bcrypt (cost 12) + JWT.

Key architectural consequences to respect:

- **Rules live in `shared/`** so client and any future server-side validation share one
  implementation. Prefer adding to `shared/sim.ts` / `shared/economy.ts` over embedding logic in UI.
- **Server trusts the client** (single-player, non-competitive). Currency/levels are not
  cheat-proof; this is intentional. Don't add anti-cheat unless a competitive feature requires it.
- **Save concurrency** uses an optimistic `saveVersion` counter (`PUT /api/save` returns `409` on
  mismatch). Preserve this when touching save/load.
- **`saveVersion`** on `GameState` gates ordered migrations — bump it and add a migration when the
  shape changes.

## Conventions

- **Commit/push only when explicitly asked.** Prior docs were each committed and pushed on direct
  request, not proactively.
- Commit to `master` (the working branch); `main` is the nominal default for PRs.
- **Digging holes is a gag:** it makes the Jelly Bean *angrier*, not calmer (a corrected detail).
  Keep this behavior anywhere the mechanic appears.
- Use the exact CONCEPT.md terminology in code and content (e.g. `jellyCoins`, `beanBucks`,
  `bonusBeans`, "Dr. Bubblegum", "watermelon witch", "gumdrop challenge", "larva stage").

## Working on the next milestone

M2 is the village and economy (`DESIGN.md` §18). The seams are already in place:

- Add actions to the `CareAction` union and `ACTION_EFFECTS` in `shared/`, then handle them in
  `applyAction` — `giveSpace` spends `COSTS.giveSpaceBeanBucks` (14) and lowers anger; `digHoles`
  **raises** anger and increments `stats.holesDug`.
- `applyAction` already returns `{ ok: false, error }` with `insufficientJellyCoins` /
  `insufficientBeanBucks` cases wired to UI messages in `client/src/store/gameStore.ts`.
- New screens go under `client/src/screens/` and into the router in `client/src/App.tsx`; DESIGN
  §10 calls for bottom tab navigation once there is more than one screen.
- Playwright E2E (`DESIGN.md` §17) is still unwritten; add it when the flows stabilise.
