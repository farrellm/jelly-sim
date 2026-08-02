import type { PlayerState } from '@jelly/sim';
import { sql } from 'drizzle-orm';
import {
  bigint,
  bigserial,
  boolean,
  customType,
  index,
  integer,
  jsonb,
  pgTable,
  smallint,
  text,
  timestamp,
  unique,
  uuid,
} from 'drizzle-orm/pg-core';

/**
 * Case-insensitive text. Usernames are compared case-insensitively but displayed as typed,
 * which citext gives us at the database level rather than by remembering to lower() at
 * every call site.
 */
const citext = customType<{ data: string }>({
  dataType: () => 'citext',
});

/** Raw bytes. Session tokens are stored as sha256 digests, never as the token itself. */
const bytea = customType<{ data: Buffer }>({
  dataType: () => 'bytea',
});

const inet = customType<{ data: string }>({
  dataType: () => 'inet',
});

export const users = pgTable('users', {
  id: uuid('id')
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  username: citext('username').notNull().unique(),
  passwordHash: text('password_hash').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  lastLoginAt: timestamp('last_login_at', { withTimezone: true }),
  disabledAt: timestamp('disabled_at', { withTimezone: true }),
});

export const sessions = pgTable(
  'sessions',
  {
    id: uuid('id')
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    tokenHash: bytea('token_hash').notNull().unique(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    lastSeenAt: timestamp('last_seen_at', { withTimezone: true }).notNull().defaultNow(),
    userAgent: text('user_agent'),
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
  },
  (t) => [
    index('sessions_user_id_active_idx')
      .on(t.userId)
      .where(sql`revoked_at IS NULL`),
  ],
);

export const players = pgTable(
  'players',
  {
    id: uuid('id')
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    slot: smallint('slot').notNull().default(0),
    mode: text('mode', { enum: ['regular', 'baby'] })
      .notNull()
      .default('regular'),
    beanName: text('bean_name').notNull(),

    // Projections of the blob, kept in step on every write so profile and friend-list
    // queries never have to parse jsonb.
    level: integer('level').notNull().default(1),
    stage: text('stage').notNull().default('larva'),
    jellyCoins: bigint('jelly_coins', { mode: 'number' }).notNull().default(0),
    beanBucks: bigint('bean_bucks', { mode: 'number' }).notNull().default(0),
    bonusBeans: integer('bonus_beans').notNull().default(0),

    state: jsonb('state').$type<PlayerState>().notNull(),
    stateVersion: integer('state_version').notNull().default(1),
    simVersion: integer('sim_version').notNull().default(1),

    lastTickAt: timestamp('last_tick_at', { withTimezone: true }).notNull().defaultNow(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    unique('players_user_id_slot_key').on(t.userId, t.slot),
    index('players_user_id_idx').on(t.userId),
  ],
);

export const loginAttempts = pgTable(
  'login_attempts',
  {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    username: citext('username'),
    ip: inet('ip').notNull(),
    success: boolean('success').notNull(),
    at: timestamp('at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('login_attempts_ip_at_idx').on(t.ip, t.at),
    index('login_attempts_username_at_idx').on(t.username, t.at),
  ],
);

export type UserRow = typeof users.$inferSelect;
export type SessionRow = typeof sessions.$inferSelect;
export type PlayerRow = typeof players.$inferSelect;
