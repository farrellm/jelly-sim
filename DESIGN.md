# Jelly Bean Simulator — Technical Design Document

> **Companion to [`CONCEPT.md`](./CONCEPT.md).** CONCEPT describes *what the game is*; this
> document describes *how to build it*. It is the implementation reference for developers.
>
> **Status:** v1 design. Full CONCEPT feature set is specced here; delivery is phased (see §18).

---

## 1. Overview & Goals

Build **Jelly Bean Simulator** as an installable **web app that runs on an iPhone** (PWA in
Safari, add-to-home-screen), backed by a server that **saves progress** and supports **multiple
players** who sign in with a **username and password**.

**Goals**

- Faithful implementation of the CONCEPT.md game: raise a Jelly Bean through its life cycle, tend
  its moods, earn currency, build a village, complete Dr. Bubblegum's tasks, battle candy
  monsters, unlock skills/flavors, and progress through college and jobs.
- Feels native on iPhone: touch-first, portrait, safe-area aware, offline-capable, installable.
- Per-account cloud save so a player can close the app and return with progress intact.

**Non-goals (v1)**

- Real-time multiplayer / shared worlds (referrals are async only).
- Server-authoritative anti-cheat (the sim runs client-side; see §13).
- Native App Store distribution (PWA only).

---

## 2. Target Platform & Constraints

Primary target: **iPhone Safari, installed as a PWA** (`display: standalone`).

- **Layout:** portrait-first; support `env(safe-area-inset-*)` for the notch / home indicator;
  design to the smallest common width (~375 CSS px, iPhone SE) and scale up.
- **Input:** touch only; tap targets ≥ 44×44 px (Apple HIG). No hover-dependent UI.
- **Viewport:** `<meta name="viewport" content="width=device-width, initial-scale=1,
  viewport-fit=cover">`; disable user zoom on game surfaces where it interferes.
- **Offline:** app shell must load and the game must be playable with no network; saves sync when
  connectivity returns (§14).
- **iOS PWA limits:** no push notifications guarantee, ~50 MB practical cache budget, service
  worker storage may be evicted — treat the server as the durable store, on-device cache as a
  convenience.
- **Performance budget:** interactive < 3 s on 4G; 60 fps for the main bean/mood animations;
  bundle target < 300 KB gzipped for the initial route.

---

## 3. High-Level Architecture

```
┌─────────────────────────────── iPhone (Safari PWA) ───────────────────────────────┐
│  React + Vite client                                                               │
│  ┌────────────┐   ┌──────────────────┐   ┌───────────────┐   ┌──────────────────┐  │
│  │ UI (React) │◄─►│ Game store (state)│◄─►│ Sim engine    │   │ Service worker   │  │
│  │ screens    │   │ (Zustand)         │   │ (shared/, pure)│   │ (app-shell cache)│  │
│  └────────────┘   └────────┬─────────┘   └───────────────┘   └──────────────────┘  │
│                            │  autosave / load (fetch + JWT)                         │
│                     ┌──────▼────────┐   IndexedDB (offline save cache)              │
└─────────────────────┤  API client   ├──────────────────────────────────────────────┘
                      └──────┬────────┘
                             │ HTTPS REST (JSON, Bearer JWT)
                   ┌─────────▼──────────┐
                   │ Node + Express API │  auth · save load/store · referrals
                   └─────────┬──────────┘
                             │
                       ┌─────▼─────┐
                       │  SQLite    │  users · saves · referrals
                       └───────────┘
```

**Data flow (play session)**

1. **Login** → server verifies credentials, returns a **JWT**.
2. **Load** → client `GET /api/save`; hydrates the game store. Sim computes offline catch-up from
   `lastTickAt`.
3. **Play** → the **sim engine runs on the client** (needs decay, timers, actions, combat).
4. **Autosave** → client `PUT /api/save` on a timer and on backgrounding; server upserts the blob.

The **client is the simulation authority**; the **server is the save store**. See §13 for the
security implications and §14 for conflict handling.

---

## 4. Tech Stack & Rationale

| Layer        | Choice | Why |
| ------------ | ------ | --- |
| Front end    | **React 18 + Vite + TypeScript** | Fast DX, first-class PWA support via `vite-plugin-pwa`. |
| PWA          | **`vite-plugin-pwa` (Workbox)** | Generates manifest + service worker, app-shell precache. |
| Client state | **Zustand** | Minimal boilerplate for a single evolving `GameState`; easy selectors. |
| Routing      | **React Router** | Screen navigation (§10). |
| Backend      | **Node + Express + TypeScript** | Small, well-understood REST surface. |
| DB           | **SQLite via `better-sqlite3`** | Zero-ops single-file DB; synchronous, fast for this scale. |
| ORM/schema   | **Drizzle ORM** (or Prisma) | Typed schema + migrations; Drizzle pairs cleanly with `better-sqlite3`. |
| Auth         | **`bcrypt`** (hashing) + **`jsonwebtoken`** (JWT) | Standard username/password + stateless sessions. |
| Validation   | **`zod`** | Validate request bodies and the save schema on both ends (shared). |
| Tests        | **Vitest** (unit), **supertest** (API), **Playwright** (E2E, mobile viewport) | Covers pure logic, API, and one full happy-path. |

Shared code (game types, sim functions, zod schemas) lives in a **`shared/`** package imported by
both client and server, so the save schema and rules have a single source of truth.

---

## 5. Repository Layout

Monorepo with npm workspaces:

```
jelly-sim/
├── CONCEPT.md
├── DESIGN.md
├── package.json                 # workspaces: client, server, shared
├── shared/                      # framework-agnostic TS shared by client & server
│   ├── src/
│   │   ├── gameState.ts         # GameState types + defaults + saveVersion
│   │   ├── sim.ts               # pure sim functions (tick, applyAction, offlineCatchup)
│   │   ├── economy.ts           # currencies, costs, earning rules
│   │   ├── content.ts           # buildings, quests, monsters, flavors, expansions (data)
│   │   └── schema.ts            # zod schemas (GameState, DTOs)
│   └── package.json
├── client/
│   ├── src/
│   │   ├── main.tsx  app.tsx  routes.tsx
│   │   ├── store/gameStore.ts   # Zustand store wrapping shared/sim
│   │   ├── net/api.ts           # fetch wrapper (JWT), save/load, offline queue
│   │   ├── net/offlineCache.ts  # IndexedDB save cache
│   │   ├── screens/             # Login, Home, Village, Tasks, MiniGame, Combat, Shop, Profile
│   │   └── components/          # BeanView, MoodBar, ActionButton, CurrencyBadge, ...
│   ├── public/ (icons, manifest assets)
│   ├── index.html
│   └── vite.config.ts           # + vite-plugin-pwa config
├── server/
│   ├── src/
│   │   ├── index.ts             # Express bootstrap; serves built client in prod
│   │   ├── db.ts                # better-sqlite3 + drizzle
│   │   ├── schema/              # drizzle tables + migrations
│   │   ├── middleware/auth.ts   # JWT verify
│   │   └── routes/              # auth.ts, save.ts, referrals.ts
│   └── package.json
└── data/                        # sqlite file (gitignored)
```

---

## 6. Game State Model

One canonical, versioned `GameState` object is the entire save. Shape (in `shared/src/gameState.ts`):

```ts
export const SAVE_VERSION = 1;

export type LifeStage = "larva" | "pupa" | "sprout" | "adult" | "elder";
export type Mood = "hunger" | "warmth" | "energy" | "happiness"; // 0..100 (higher = better)

export interface JellyBean {
  name: string;
  stage: LifeStage;
  level: number;               // long-tail progression (CONCEPT: level 1497 exists)
  xp: number;
  flavor: string;              // active unlocked flavor
  unlockedFlavors: string[];
  moods: Record<Mood, number>; // anger is modeled as low happiness
  anger: number;               // 0..100 (higher = angrier); distinct from happiness
  skills: {
    kitchen: boolean;          // self-sufficiency: reduces hunger decay
    trade?: "blacksmith" | null;
    hobby?: "swordsmith" | null;
  };
  education: { inCollege: boolean; graduated: boolean };
  job: { title: string | null; incomePerTick: number };
}

export interface Building { id: string; type: BuildingType; plot: number; builtAt: number; }
export type BuildingType = "house" | "toilet" | "hamburgerStand" | "farm" | "workshop";

export interface Village {
  plots: number;               // unlocked plot count
  buildings: Building[];
  weather: "clear" | "rain";   // rain is "cozy" per CONCEPT
  neighbors: number;           // other jelly beans in the village
}

export interface Wallet { jellyCoins: number; beanBucks: number; bonusBeans: number; }

export interface QuestState {
  activeQuestIds: string[];    // from Dr. Bubblegum
  completedQuestIds: string[];
}

export interface CombatProgress {
  candyCastleCleared: boolean;
  watermelonWitchDefeated: boolean;
  highestFloor: number;
}

export interface GameState {
  saveVersion: number;         // === SAVE_VERSION; drives migrations
  lastTickAt: number;          // epoch ms; used for offline catch-up
  playMode: "regular" | "baby";
  expansions: { viking: boolean };
  bean: JellyBean;
  village: Village;
  wallet: Wallet;
  quests: QuestState;
  combat: CombatProgress;
  stats: { totalPlayMs: number; holesDug: number };
}
```

- **`saveVersion`** gates migrations: on load, if `state.saveVersion < SAVE_VERSION`, run ordered
  migration functions in `shared/` before hydrating.
- **`lastTickAt`** is written on every tick and every save; it drives offline decay (§7).
- Anger is tracked separately from happiness so the digging-holes gag (§7) can raise anger
  explicitly.

---

## 7. Simulation & Game Logic

All rules are **pure functions in `shared/src/sim.ts`** so the client sim (and any future
server-side validation) share one implementation.

**Tick loop.** The client runs `tick(state, dtMs)` on a `requestAnimationFrame`/interval (~1 s
cadence for logic; animations are separate). Each tick:

- **Mood decay** — `hunger`, `warmth`, `energy` decay at per-stage rates; a Jelly Bean with
  `skills.kitchen` decays hunger more slowly (self-sufficiency). When a mood crosses a low
  threshold the bean "calls out" (UI: *"Feed me!"*, *"Papa, help!"*).
- **Anger accrual** — rises while any mood is critically low or a need is ignored.
- **Income** — a working bean earns `job.incomePerTick` jelly coins; farms/stands yield on timers.

**Offline catch-up.** On load, `offlineCatchup(state, now)` computes `elapsed = now -
lastTickAt`, clamps it (cap the penalty so a long absence doesn't nuke the bean), and applies
decay/income in one step before rendering.

**Care actions** — `applyAction(state, action)`:

| Action | Effect |
| ------ | ------ |
| `feed` (apple / stand / lunch) | raises `hunger`; costs a small amount or is free from a built stand |
| `knitBlanket` (gather feathers → blanket) | raises `warmth` |
| `sleep` | raises `energy` |
| `giveSpace` | reduces `anger` — **costs 14 bean bucks** (CONCEPT) |
| `digHoles` | **raises `anger`** and increments `stats.holesDug` — the running gag: players do it to calm the bean but it backfires |

**Currency earning** — completing tasks, mini-games, farming, and jobs yields jelly coins;
bean bucks are scarce/premium; bonus beans come from referrals (§8).

**Mini-games** — self-contained React components that return a score → `awardCurrency(state,
score)`. Includes the **gumdrop challenge**.

**Combat** — turn/timing-based encounters (candy castle floors → **watermelon witch** boss).
`resolveCombat` updates `CombatProgress` and grants rewards/flavors on victory.

**Progression** — XP → level ups; level/among quests gate **life-stage** transitions
(`larva → pupa → sprout → adult → elder`). **College** then a **job** unlock adult income.
**Skill unlocks** (kitchen, and trade/hobby in the Viking expansion) change decay/earning.

---

## 8. Economy Design

Three currencies (CONCEPT keeps the "what's the difference?" confusion as flavor):

| Currency | Earned by | Spent on |
| -------- | --------- | -------- |
| **Jelly coins** | tasks, mini-games, farming, job income | buildings (toilet, stand), consumables, minor upgrades |
| **Bean bucks** | rare quest rewards, milestones | premium unlocks, **giveSpace (14)**, speed-ups |
| **Bonus beans** | referral loop | convert to jelly coins |

**Referral loop (CONCEPT):** send jelly coins to 3 friends → receive a **bonus bean** → spend it
for more jelly coins. Implemented async via the referrals endpoint (§11); no real-time presence.

**Representative cost table** (tunable constants in `shared/src/economy.ts`):

| Item | Cost |
| ---- | ---- |
| Toilet | jelly coins |
| Hamburger stand | jelly coins |
| Give the bean space | 14 bean bucks |
| Extra village plot | jelly coins (scaling) |
| Viking expansion | bean bucks (one-time flag) |

---

## 9. Feature Systems (CONCEPT → implementation)

Each CONCEPT system maps to **data (`shared/content.ts`) + rules (`shared/sim.ts`) + a screen (§10)**:

- **Needs & moods** → `JellyBean.moods` + `anger`; Home screen mood bars + quick actions.
- **Village builder** → `Village.buildings`/`plots`; Village screen grid of plots.
- **Tasks / quests** → `content.ts` quest definitions; **Dr. Bubblegum** is the quest-giver NPC
  who periodically surfaces a new task (modal "knock on the door"). Tasks screen lists active/done.
- **Mini-games** → pluggable components (gumdrop challenge, etc.); MiniGame screen.
- **Combat** → candy castle floors + watermelon witch boss; Combat screen.
- **Life cycle & levels** → stage/level fields; progression rules; shown on Home/Profile.
- **College & jobs** → `education`/`job`; unlock flow after a stage/level gate.
- **Kitchen & trade skills** → `skills`; unlock modifies decay/earning.
- **Flavors** → `unlockedFlavors`; cosmetic selector; some gated behind combat/levels.
- **Baby mode** → `playMode: "baby"` raises decay rates / difficulty multipliers ("harder than
  regular mode").
- **Viking expansion** → `expansions.viking` flag unlocks blacksmith/swordsmith trade+hobby,
  themed content and cosmetics; purely additive content pack keyed off the flag.

---

## 10. UI / UX & Screens

Bottom tab navigation (thumb-reachable) across the core screens; modals for quests/actions.

| Screen | Purpose | Key components |
| ------ | ------- | -------------- |
| **Login / Register** | username + password auth | form, validation, error states |
| **Home** | the bean, its moods, quick care actions | `BeanView`, `MoodBar`×4, `AngerMeter`, `ActionButton`s (feed/knit/sleep/give-space/dig) |
| **Village** | build & view the island | plot grid, `BuildingCard`, weather indicator, neighbor count |
| **Tasks** | Dr. Bubblegum's quests | quest list, claim rewards, "knock" modal |
| **Mini-game** | play for currency | per-game canvas/component, score → reward |
| **Combat** | candy castle / boss fights | encounter view, action buttons, rewards |
| **Shop / Currency** | spend & convert currencies, referrals | currency badges, buy buttons, referral action |
| **Profile / Settings** | bean stats, flavor select, mode, expansions, logout | stats, flavor picker, toggles |

**Cross-cutting UX:** safe-area padding; `44px` min tap targets; skeleton/loading and offline
banners; optimistic action feedback; portrait lock; light haptic-style visual feedback.

---

## 11. Backend API

REST, JSON, **Bearer JWT** on protected routes. Base path `/api`.

**Auth**

- `POST /api/auth/register` — body `{ username, password }` → `201 { token, user }`.
  Rejects duplicate username; password min length enforced (zod).
- `POST /api/auth/login` — body `{ username, password }` → `200 { token, user }` or `401`.
- `GET /api/auth/me` — (auth) → `{ user }`.

**Save (auth)**

- `GET /api/save` — → `{ state: GameState, saveVersion } | 204` (no save yet → client seeds a new
  game).
- `PUT /api/save` — body `{ state, baseVersion }`. Optimistic concurrency: if the stored
  `save_version` ≠ `baseVersion`, respond `409 { serverState }` so the client can reconcile;
  otherwise persist, bump `save_version`, return `{ saveVersion }`. Server does a **timestamp
  sanity check** on `state.lastTickAt` (reject implausible future times) but does **not** re-simulate.

**Referrals (auth)**

- `POST /api/referrals` — body `{ toUsernames: string[] }` → records a referral gift; when the
  3-friend condition is met, credits a **bonus bean** to the sender's next-load reward queue.

**Cross-cutting:** auth middleware (`middleware/auth.ts`) verifies JWT and attaches `req.userId`;
uniform error shape `{ error: { code, message } }`; rate limiting on auth routes; zod validation on
every body; CORS locked to the app origin.

---

## 12. Database Schema (SQLite)

Drizzle schema (`server/src/schema/`):

```ts
users
  id           integer pk autoincrement
  username     text unique not null
  password_hash text not null
  created_at   integer not null            // epoch ms

saves
  user_id      integer pk references users(id) on delete cascade  // one save per user
  state_json   text not null               // serialized GameState
  save_version integer not null default 0  // optimistic-concurrency counter
  updated_at   integer not null

referrals
  id           integer pk autoincrement
  from_user    integer references users(id)
  to_user      integer references users(id)
  created_at   integer not null
```

- **Indexes:** `users.username` (unique), `referrals(from_user)`.
- **One save row per user** (PK on `user_id`); history is out of scope for v1 (a `save_history`
  table is a future option).
- SQLite file lives in `data/` (gitignored); enable WAL mode for concurrent reads.

---

## 13. Authentication & Security

- **Passwords:** hashed with **bcrypt** (cost factor 12); never stored or logged in plaintext.
- **Sessions:** **JWT** signed with a server secret (env `JWT_SECRET`), ~7-day expiry; sent as
  `Authorization: Bearer`. Stored on-device in memory + a persisted token (localStorage acceptable
  for a hobby PWA; document XSS risk). No refresh tokens in v1 — re-login on expiry.
- **Transport:** HTTPS required in production (needed for service workers / PWA install anyway).
- **Validation:** all request bodies validated with **zod**; reject malformed `GameState`.
- **CORS:** restricted to the deployed origin.
- **Rate limiting** on `/api/auth/*` to slow credential stuffing.
- **Trust model (important):** the sim is **client-authoritative**, so currency, levels, and combat
  outcomes are **not trustworthy** — a determined user can edit their save. This is acceptable
  because the game is single-player and non-competitive. If a trustworthy leaderboard is ever
  needed, the shared pure sim functions can be re-run server-side to validate action logs
  (documented as future work; the `shared/` design already enables it).

---

## 14. Save / Sync Strategy

- **Autosave triggers:** every ~30 s while active, and immediately on `visibilitychange`
  (backgrounding) and `beforeunload` (best-effort via `navigator.sendBeacon` where available).
- **Conflict resolution:** each save carries `baseVersion`; a `409` from `PUT /api/save` returns
  the server state. v1 policy = **last-write-wins on the most recent `lastTickAt`**, surfaced to the
  user only if the divergence is large (rare single-device usage).
- **Offline queue:** if a save fails (offline), persist to **IndexedDB** and retry with backoff when
  `online` fires; the game keeps running from local state meanwhile.
- **Local cache:** the latest `GameState` is mirrored to IndexedDB so a cold start with no network
  still loads the last known save; it reconciles with the server on reconnect.

---

## 15. PWA & Offline

- **Manifest** (`vite-plugin-pwa`): name "Jelly Bean Simulator", `display: standalone`,
  `orientation: portrait`, theme/background colors, maskable icons (192/512), apple-touch-icon.
- **iOS meta:** `apple-mobile-web-app-capable`, `apple-mobile-web-app-status-bar-style`,
  `apple-touch-icon`, splash tags.
- **Service worker (Workbox):** precache the app shell (HTML/JS/CSS/icons) for offline load;
  runtime-cache static assets; **never cache `/api/*`** (always network, fall back to IndexedDB).
- **Install:** offer an "Add to Home Screen" hint on iOS (no `beforeinstallprompt` on Safari).
- **Eviction resilience:** treat all on-device storage as ephemeral; server save is durable truth.

---

## 16. Build, Run & Deploy

- **Dev:** `npm run dev` runs `client` (Vite, port 5173) and `server` (Express, port 3000)
  concurrently; Vite proxies `/api` → server. `shared/` built in watch mode or consumed via TS paths.
- **Env vars:** `JWT_SECRET`, `PORT`, `DATABASE_PATH`, `CLIENT_ORIGIN`.
- **Prod build:** `npm run build` → `client/dist`; the Express server serves the built client
  (static) **and** the API from one origin (simplest PWA/HTTPS/CORS story).
- **Deploy:** single Node host (e.g. a small VM / Fly.io / Render) with a **persistent volume** for
  the SQLite file (`data/`). Run migrations on boot. HTTPS terminated at the platform/reverse proxy.

---

## 17. Testing Strategy

- **Unit (Vitest):** the pure sim/economy functions in `shared/` — decay, `offlineCatchup`,
  `applyAction` (incl. `digHoles` raising anger and `giveSpace` costing 14 bean bucks), leveling,
  combat resolution, migrations.
- **API (supertest):** register/login/me, save GET/PUT incl. the `409` optimistic-concurrency path,
  auth rejection, referral crediting.
- **E2E (Playwright, iPhone viewport):** one happy path — register → play a few actions → autosave →
  reload → state restored; plus an offline-then-reconnect sync check.
- **CI:** run all three on push.

---

## 18. Build Phasing / Milestones

The full feature set is designed above; ship it in order:

- **M1 — Foundation:** monorepo + `shared/` skeleton; auth (register/login/JWT); SQLite + save
  GET/PUT; Home screen with one bean, core moods, feed/knit/sleep, autosave, offline cache.
- **M2 — Economy & village:** three currencies + cost table; Village builder (house, toilet, stand,
  farm); Tasks screen + Dr. Bubblegum quests; `giveSpace` / `digHoles`.
- **M3 — Activities:** mini-games (gumdrop challenge) and Combat (candy castle → watermelon witch),
  with currency/flavor rewards.
- **M4 — Progression:** life-stage transitions, leveling, kitchen skill, flavors, college & jobs.
- **M5 — Breadth & polish:** referrals + bonus beans, baby mode, Viking expansion, PWA install
  polish, migrations, E2E hardening.

---

## 19. Open Questions / Future Work

- **Real multiplayer / social** (visiting neighbors' islands) — currently async referrals only.
- **Server-authoritative migration** — re-run `shared/` sim server-side to validate saves if a
  trustworthy leaderboard is introduced.
- **Analytics & balancing** — telemetry to tune decay/economy constants.
- **Screen-time-moderation feature** — CONCEPT's own theme (the cast learns moderation) could ship
  as an optional in-app daily play-limit / mindful-break nudge.

---

*Design grounded in [`CONCEPT.md`](./CONCEPT.md), which is itself based on the Story Pirates
episode "Chicken Hat / Rock and Roll Dining Room."*
