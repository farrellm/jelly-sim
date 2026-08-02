# Jelly Bean Simulator

A mobile web idle sim. You register, Dr. Bubblegum grants you a plot of land, and you raise
a Jelly Bean through its life cycle — feeding it, keeping it warm, giving it space when it
needs space, and watching it thrive. Progress lives on the server, so it survives closing
the tab, changing devices, and the fortnight you forget about it.

- [`CONCEPT.md`](CONCEPT.md) — what the game is
- [`DESIGN.md`](DESIGN.md) — how it gets built
- [`CLAUDE.md`](CLAUDE.md) — the rules a contributor needs before touching anything

**Status: Phase 0 (Foundations).** Accounts, sessions, persistent saves, and the client
shell. The simulation itself starts in Phase 1 — see [`DESIGN.md` §15](DESIGN.md#15-build-phases).

## Running it

Needs Node 22+, pnpm, and Docker.

```bash
make setup     # .env, dependencies, Postgres, test database, migrations
make dev       # API on :3000, web on http://localhost:5273
```

`make setup` is safe to run again — it will not reinstall unchanged dependencies, recreate
a database that exists, or overwrite an `.env` you have edited. `make` on its own lists
every target.

| Target              | What it does                                                      |
| ------------------- | ----------------------------------------------------------------- |
| `make dev`          | Both dev servers, hot reload                                      |
| `make start`        | Build everything and serve it: bundled API plus the built web app |
| `make check`        | Typecheck, lint, formatting, and every test — what CI runs        |
| `make test-sim`     | The pure rules only. Milliseconds, no database                    |
| `make test-api`     | Integration tests against a real Postgres                         |
| `make db-reset`     | Throw the database away and rebuild it from migrations            |
| `make psql`         | A shell on the dev database                                       |
| `make docker-build` | The production API image                                          |

The Makefile only sequences the pnpm scripts underneath (`pnpm dev`, `pnpm test`,
`pnpm db:migrate`, …), so either entry point works. What it adds is the ordering and the
one-time setup steps that are easy to miss — notably creating `jelly_test`, without which
the API suite fails confusingly.

Ports avoid the usual defaults on purpose: 5432–5434 and 5173–5174 are typically already
taken by other projects. Vite runs with `strictPort`, so a collision is a loud failure
rather than a silent move to an origin the API does not trust.

The API suite runs against a real Postgres — the schema does real work (citext, CHECK
constraints, a unique index), and a fake would only assert that the fake agrees with itself.

## Layout

```
packages/sim/      @jelly/sim     the game rules. pure: no I/O, no clock, no DOM
packages/shared/   @jelly/shared  zod schemas shared by client and server
apps/api/          @jelly/api     Fastify + Drizzle + Postgres
apps/web/          @jelly/web     Vite + React PWA
```

## Deploying

The configuration is committed and inert. Nothing deploys until the credentials exist, and
a repository without them fails nothing.

| Secret                  | Where to get it                                |
| ----------------------- | ---------------------------------------------- |
| `FLY_API_TOKEN`         | `fly tokens create deploy`                     |
| `CLOUDFLARE_API_TOKEN`  | Cloudflare dashboard → API tokens → Pages:Edit |
| `CLOUDFLARE_ACCOUNT_ID` | Cloudflare dashboard → Workers & Pages         |

Then, once:

1. `fly launch --config apps/api/fly.toml --no-deploy` to claim the app name.
2. `fly secrets set DATABASE_URL=...` with the Neon connection string. It belongs on Fly,
   not in GitHub.
3. Create the Cloudflare Pages project `jelly-sim` and set `API_ORIGIN` in its environment
   to the Fly hostname.
4. Set `CORS_ORIGINS` in `apps/api/fly.toml` to the Pages hostname the browser will use.

`apps/web/functions/api/[[path]].ts` proxies `/api` from the Pages origin to Fly. That is
not cosmetic: the session cookie is `SameSite=Lax`, and Pages and Fly are different sites,
so without the proxy the browser would never send it.

## Note on accounts

There is no email field anywhere, which means **there is no password reset**. That is a
deliberate trade — an email address we do not hold cannot leak — and the registration
screen says so plainly. Recovery codes are the first candidate for post-1.0
([`DESIGN.md` §16](DESIGN.md#16-risks--future-work)).
