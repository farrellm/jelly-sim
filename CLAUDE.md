# CLAUDE.md

Jelly Bean Simulator — a mobile web idle sim. A player registers, is granted a plot of
land, and raises a Jelly Bean through its life cycle, with everything persisted server-side
so it survives closing the tab and the two weeks they don't open it.

**Current state: Phase 0 complete. Phase 1 is next.** Keep this line current as phases land.

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
make db-reset       # wipe the database and rebuild from migrations
```

`make` with no target lists everything. Each target just sequences the pnpm scripts —
`pnpm dev`, `pnpm test`, `pnpm db:migrate`, `pnpm -r typecheck` — so either interface
works, and package scripts remain the place to change _what_ a build does.

The one step worth knowing about: the API suite needs `TEST_DATABASE_URL` pointing at a
database it may truncate. `make setup` creates `jelly_test`; without it the suite fails
with an unhelpful error.

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
changes the meaning of `PlayerState`.

## The hole mechanic — read this before "fixing" it

Digging holes is free, instant, unlimited, and satisfying. Each hole permanently lowers the
Jelly Bean's mood ceiling by 1.5. **Nothing in the UI ever links the two** — no tooltip, no
stat page, no tutorial line, no achievement, no changelog entry. The hole counter is a
neutral number. Dr. Bubblegum never mentions it.

This is canon (`CONCEPT.md` §5, §9) and a deliberate, load-bearing design decision
(`DESIGN.md` §5.1, §16), not an oversight and not an unfinished feature. Phase 1 lands a
test asserting the _absence_ of that link, specifically so a well-meaning contributor
cannot add the missing tooltip.

If you find yourself about to explain holes to the player: don't.

## Conventions

- TypeScript everywhere, `strict`, ESM, `.js` extensions on relative imports.
- Errors leave the API through one handler in the `DESIGN.md` §8 taxonomy. Clients branch
  on `code`, never on message text.
- Comments explain _why_, especially where a line exists because of a specific iOS
  behaviour or a security property. Do not narrate what the code already says.
- Balance numbers are data in `packages/sim/src/content.ts`, not branches in logic.

## Phase 0 scope boundary

Phase 0 built the foundations only: auth, sessions, the schema, the client shell, CI, and
deploy config. There is **no simulation yet** — `advance`, `apply`, and `project` do not
exist, `GET /state` returns the stored blob without ticking it, and the island is
deliberately empty. `DESIGN.md` §15 has the phase order.
