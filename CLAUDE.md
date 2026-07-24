# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Current state

This repo is **design-stage: there is no application code yet.** It contains three Markdown
documents and no build tooling. The intended architecture below is specified in `DESIGN.md`; it
has not been scaffolded. Do not assume `package.json`, `client/`, `server/`, or any commands
exist until you create them — the "commands" they describe are the *plan*, not reality.

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

## Intended architecture (from DESIGN.md)

The planned build is an **iPhone-first PWA** with a save backend:

- **`shared/`** — framework-agnostic TypeScript: the canonical versioned `GameState` type, **pure
  simulation functions** (`tick`, `applyAction`, `offlineCatchup`), economy rules, content data,
  and zod schemas. This is the single source of truth for game rules, imported by *both* client and
  server. Put game logic here, not in the client.
- **`client/`** — React + Vite + TypeScript PWA. **Client-authoritative simulation**: the sim runs
  locally (needs decay, timers, combat) via the `shared/` functions; a Zustand store holds
  `GameState`; autosave pushes the state blob to the server and mirrors it to IndexedDB for offline.
- **`server/`** — Node + Express + TypeScript REST API over **SQLite** (`better-sqlite3` +
  Drizzle). The **server is a save store, not the sim authority** — it stores/returns the
  `GameState` blob and does not re-simulate. Auth is username/password with bcrypt + JWT.

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

## When you scaffold the app

Follow `DESIGN.md` §5 (repo layout), §11 (API), §12 (schema), and §18 (milestones — start with
M1: monorepo + auth + save/load + Home screen). Once tooling exists, update this file with the real
build/dev/test commands (DESIGN.md §16–17 describe the intended `npm run dev`, single-host prod
build, and Vitest/supertest/Playwright test setup).
