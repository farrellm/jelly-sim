-- Phase 0 of DESIGN.md §7: identity, sessions, saves, and login rate limiting.
--
-- friendships, gifts, ledger, and push_subscriptions are specified in §7 but belong to
-- the phases that use them (§15: social is Phase 6, the ledger is Phase 2, push is Phase 7).
-- Creating them now would mean four tables nothing reads and no test exercises.

CREATE EXTENSION IF NOT EXISTS citext;
CREATE EXTENSION IF NOT EXISTS pgcrypto;   -- gen_random_uuid()

CREATE TABLE users (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  username       citext UNIQUE NOT NULL CHECK (username ~ '^[a-zA-Z0-9_]{3,20}$'),
  password_hash  text NOT NULL,              -- argon2id encoded string, params included
  created_at     timestamptz NOT NULL DEFAULT now(),
  last_login_at  timestamptz,
  disabled_at    timestamptz
);

CREATE TABLE sessions (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash   bytea UNIQUE NOT NULL,        -- sha256(token); the raw token is never stored
  created_at   timestamptz NOT NULL DEFAULT now(),
  expires_at   timestamptz NOT NULL,
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  user_agent   text,
  revoked_at   timestamptz
);
CREATE INDEX sessions_user_id_active_idx ON sessions (user_id) WHERE revoked_at IS NULL;

CREATE TABLE players (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  slot          smallint NOT NULL DEFAULT 0,
  mode          text NOT NULL DEFAULT 'regular' CHECK (mode IN ('regular','baby')),
  bean_name     text NOT NULL,
  -- Denormalized for cheap profile and friend-list queries. The jsonb blob remains the
  -- source of truth; these columns are projections of it, refreshed on write.
  level         integer NOT NULL DEFAULT 1,
  stage         text    NOT NULL DEFAULT 'larva',
  jelly_coins   bigint  NOT NULL DEFAULT 0 CHECK (jelly_coins >= 0),
  bean_bucks    bigint  NOT NULL DEFAULT 0 CHECK (bean_bucks  >= 0),
  bonus_beans   integer NOT NULL DEFAULT 0 CHECK (bonus_beans >= 0),
  state         jsonb   NOT NULL,            -- PlayerState (§4.5)
  state_version integer NOT NULL DEFAULT 1,  -- optimistic concurrency (§7)
  sim_version   integer NOT NULL DEFAULT 1,  -- lazy save-migration target
  last_tick_at  timestamptz NOT NULL DEFAULT now(),
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, slot)
);
CREATE INDEX players_user_id_idx ON players (user_id);

-- Login rate limiting and lockout (§9.3). Attempts are recorded for both successes and
-- failures so a lockout window can be computed per IP and per username.
CREATE TABLE login_attempts (
  id         bigserial PRIMARY KEY,
  username   citext,
  ip         inet NOT NULL,
  success    boolean NOT NULL,
  at         timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX login_attempts_ip_at_idx ON login_attempts (ip, at DESC);
CREATE INDEX login_attempts_username_at_idx ON login_attempts (username, at DESC);
