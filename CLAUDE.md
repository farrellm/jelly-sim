# CLAUDE.md

Jelly Bean Simulator — a mobile web idle sim. A player registers, is granted a plot of
land, and raises a Jelly Bean through its life cycle, with everything persisted server-side
so it survives closing the tab and the two weeks they don't open it.

**Current state: Phase 1 complete. Phase 2 is next.** Keep this line current as phases land.

## The documents, and which one wins

| File            | What it is                                                                    |
| --------------- | ----------------------------------------------------------------------------- |
| `TRANSCRIPT.md` | The source: a conversation describing a game that does not exist. Not in git. |
| `CONCEPT.md`    | **Game truth.** What the game _is_.                                           |
| `DESIGN.md`     | **Build truth.** How it gets made. Every number is pinned down here.          |

`DESIGN.md` marks three kinds of statement and the distinction is load-bearing:

- **Canon** (unmarked) — established by the transcript. Not negotiable.
- **Extrapolated** (✳) — invented by `CONCEPT.md` to fill a gap.
- **Implementation decision** (⚙) — invented in `DESIGN.md` because code cannot be
  ambiguous. These are the ones to argue with.

Do not silently promote an ⚙ decision to canon, and do not quietly change canon because it
would be easier. If a canon rule is genuinely unbuildable, say so.

## Commands

```bash
make setup          # .env, install, Postgres, test database, migrations. Re-runnable
make dev            # API on :3000, web on :5273
make start          # build everything and serve it
make check          # typecheck + lint + format + tests, in CI's order
make test-sim       # pure rules only — milliseconds, no database
make test-e2e       # Playwright, iPhone 13, starts its own servers
make db-reset       # wipe the database and rebuild from migrations
```

`make` with no target lists everything. Each target just sequences the pnpm scripts —
`pnpm dev`, `pnpm test`, `pnpm db:migrate`, `pnpm -r typecheck` — so either interface
works, and package scripts remain the place to change _what_ a build does.

The one step worth knowing about: the API suite needs `TEST_DATABASE_URL` pointing at a
database it may truncate. `make setup` creates `jelly_test`; without it the suite fails
with an unhelpful error.

The end-to-end suite runs against **WebKit**, because an iPhone does. If Playwright cannot
install its WebKit build on your machine — the Linux dependencies are Ubuntu packages —
`E2E_BROWSER=chromium pnpm --filter @jelly/web test:e2e` swaps the engine and keeps the
phone viewport. CI always runs the real one.

**Ports are deliberately non-default.** Postgres 5435 and Vite 5273, because 5432–5434 and
5173–5174 are usually already taken by something else on a dev machine. Vite uses
`strictPort`, so a collision fails loudly instead of moving to a port the API's origin
allowlist does not know.

## Layout

```
packages/sim/      @jelly/sim     the rules. pure, no I/O, no clock.
packages/shared/   @jelly/shared  zod schemas shared by client and server
apps/api/          @jelly/api     Fastify + Drizzle + Postgres
apps/web/          @jelly/web     Vite + React PWA
```

## The rules that hold this together

**Every game rule lives in `@jelly/sim` and nowhere else.** No decay in a route handler, no
price in a component, no timer in the UI. The client and the server run the same code,
which is the only reason optimistic prediction can be trusted.

**`packages/sim` is pure** (`DESIGN.md` §4.2), enforced by lint rules in
`eslint.config.js`:

- No ambient time. `Date.now()`, `new Date()`, `performance` are banned; time arrives as a
  parameter.
- No ambient randomness. `Math.random()` is banned; draws come from the seeded PRNG in
  `rng.ts`, whose state rides in `PlayerState.rng`.
- No I/O. Nothing imported from outside `@jelly/shared`.
- Integer money. No float touches a balance.
- Meters clamp to `[0, 100]` after every mutation.

**The server is authoritative.** The client sends intents, never state. Every response
carries the canonical state and the client replaces its copy wholesale. There is no merge
path and no "client wins" path.

**Save migrations are lazy.** `players.sim_version` records which rules version wrote the
blob; it upgrades when the player next returns. Bump `SIM_VERSION` in the same commit that
changes the meaning of `PlayerState`, add a step to `migrations` in `packages/sim/src/migrate.ts`,
and capture a real blob at the old version into `packages/sim/test/fixtures/` — a save you
can regenerate is not the kind a migration has to survive.

**`advance` consumes whole ticks and carries the remainder.** The step is a fixed sim
minute and the start instant is the save's own `worldMs`, never a parameter. That is what
makes `advance(advance(s, m), b)` equal `advance(s, b)` for a split point `m` that is not
on a minute boundary — the property multi-device play depends on, fuzzed in
`packages/sim/test/advance.test.ts`.

**Nothing kills a Jelly Bean.** Neglect stalls progression; it never ends a save
(`DESIGN.md` §6.5). Meters bottom out at zero and stay there.

## The hole mechanic — read this before "fixing" it

Digging holes is free, instant, unlimited, and satisfying. Each hole permanently lowers the
Jelly Bean's mood ceiling by 1.5. **Nothing in the UI ever links the two** — no tooltip, no
stat page, no tutorial line, no achievement, no changelog entry. The hole counter is a
neutral number. Dr. Bubblegum never mentions it.

This is canon (`CONCEPT.md` §5, §9) and a deliberate, load-bearing design decision
(`DESIGN.md` §5.1, §16), not an oversight and not an unfinished feature.

Four tests assert the _absence_ of the link, so a well-meaning contributor cannot add the
missing tooltip without CI telling them not to:

- `packages/sim/test/apply.test.ts` — no `SimEvent` names a hole; no field of the save is
  called `moodCeiling` or anything like it; the `INSUFFICIENT_FUNDS` message for space says
  nothing about digging, which is the moment a player is most likely to be told.
- `packages/sim/test/project.test.ts` — nothing in the view lets a client read the rule off.
  A view reporting both mood _and_ its upper bound would let anyone shade the missing points
  into the meter, which is the tooltip by other means.
- `apps/api/test/actions.test.ts` — the same, at the wire.
- `apps/web/e2e/care-loop.spec.ts` — every word on every screen the counter appears on.

`moodCeiling` lives in `packages/sim/src/needs.ts` and is deliberately **not exported from
the package barrel**. Keep it that way.

If you find yourself about to explain holes to the player: don't.

## Conventions

- TypeScript everywhere, `strict`, ESM, `.js` extensions on relative imports.
- Errors leave the API through one handler in the `DESIGN.md` §8 taxonomy. Clients branch
  on `code`, never on message text.
- Comments explain _why_, especially where a line exists because of a specific iOS
  behaviour or a security property. Do not narrate what the code already says.
- Balance numbers are data in `packages/sim/src/content.ts`, not branches in logic.

## The client, in three files

`DESIGN.md` §10.3 in code:

- `apps/web/src/game/store.ts` — zustand. `dispatch` runs `apply()` locally so the meter
  moves under the thumb, then queues the intent. The outbox debounces 400 ms, flushes
  immediately for anything costing bean bucks, and on a 409 refetches and **replays** rather
  than dropping the player's taps. `adopt` replaces local state wholesale; it is the only
  way state enters the store.
- `apps/web/src/game/ticker.ts` — one local step a second, **stopped entirely when the tab
  is hidden**. Skipping costs nothing because `advance` is a pure function of elapsed time.
- `apps/web/src/audio/barks.ts` — one `AudioContext`, unlocked on the first pointerdown
  because iOS demands a gesture. Bark voices are synthesised from oscillators, so there are
  no binary assets; real recordings replace `VOICES` and `note()` and nothing else.

## Phase 1 scope boundary

Phase 1 built the care loop: the four needs and their decay tables, `advance`/`apply`/
`project`, lazy server catch-up, `GET /state` and `POST /actions`, feed / warm / sleep /
space / dig, barks with audio, and optimistic client prediction.

What is deliberately still absent, so it is not mistaken for a bug:

- **No economy.** Nothing earns jelly coins or bean bucks, so `giveSpace` always refuses.
  That refusal is the Phase 2 exit criterion, not a defect `[C§11]`.
- **No farming, crafting, or buildings.** `feed` and `warm` spend an ⚙ _arrival basket_
  granted in `createInitialState` — three hamburgers and a blanket — which is scaffolding
  the Arrival quest chain (§5.8) replaces in Phase 5. Delete it then.
- **No life stages.** `careDays` and `stageEnteredMs` are written but nothing advances a
  stage, so every save is a larva.
- **No weather or day/night.** `advance` reads `island.weather` for the cold modifier but
  never changes it.
- **No bed required to sleep.** The bed is a Phase 3 building and the gate lands with it.

`DESIGN.md` §15 has the phase order.
