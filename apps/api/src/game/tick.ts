import {
  advance,
  migrate,
  project,
  SIM_VERSION,
  type PlayerState,
  type SimEvent,
} from '@jelly/sim';
import { and, eq } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { players, type PlayerRow } from '../db/schema.js';
import { notFound } from '../errors.js';

export interface LoadedPlayer {
  row: PlayerRow;
  /** Migrated and ticked to `now`. Not yet written. */
  state: PlayerState;
  events: SimEvent[];
  /** True when the tick or the migration actually changed something worth writing. */
  dirty: boolean;
}

/**
 * Load a save, bring it up to date, and hand it back — the first half of both calls that
 * matter (§8).
 *
 * Migration runs before the tick, always (§7): a blob written by an older rules version is
 * not a valid input to today's `advance`. The result is persisted at the new version by
 * whoever calls `persist`, so a save that nobody opens is never touched.
 */
export async function loadAndTick(
  app: FastifyInstance,
  userId: string,
  slot: number,
  nowMs: number,
): Promise<LoadedPlayer> {
  const [row] = await app.db
    .select()
    .from(players)
    .where(and(eq(players.userId, userId), eq(players.slot, slot)))
    .limit(1);

  if (!row) throw notFound('No Jelly Bean in that slot.');

  const migrated = row.simVersion < SIM_VERSION ? migrate(row.state, row.simVersion) : row.state;
  const { state, events } = advance(migrated, nowMs);

  // A read a few seconds after the last one moves nothing, and writing on every poll would
  // turn a glance at the island into a row version bump the other device has to reconcile.
  const dirty = row.simVersion !== SIM_VERSION || state.worldMs !== row.state.worldMs;

  return { row, state, events, dirty };
}

/**
 * Write a save back under the §7 optimistic-concurrency check.
 *
 * Returns the new state version, or null if another device got there first — the caller
 * decides whether that is a 409 (a write, where the player's intent must not be lost) or
 * simply a re-read (a read, where it never mattered).
 *
 * The denormalised columns are refreshed here rather than anywhere else. They exist so the
 * profile and friend-list queries never have to parse jsonb, and a projection that is only
 * updated sometimes is worse than one that does not exist.
 */
export async function persist(
  app: FastifyInstance,
  row: PlayerRow,
  state: PlayerState,
  nowMs: number,
): Promise<number | null> {
  const nextVersion = row.stateVersion + 1;

  const updated = await app.db
    .update(players)
    .set({
      state,
      stateVersion: nextVersion,
      simVersion: SIM_VERSION,
      lastTickAt: new Date(nowMs),
      updatedAt: new Date(),
      level: state.progress.level,
      stage: state.bean.stage,
      beanName: state.bean.name,
      jellyCoins: state.wallet.jellyCoins,
      beanBucks: state.wallet.beanBucks,
      bonusBeans: state.wallet.bonusBeans,
    })
    .where(and(eq(players.id, row.id), eq(players.stateVersion, row.stateVersion)))
    .returning({ stateVersion: players.stateVersion });

  return updated.length > 0 ? nextVersion : null;
}

/** The current version of a row we just lost a race to, for the 409 body. */
export async function currentStateVersion(app: FastifyInstance, id: string): Promise<number> {
  const [row] = await app.db
    .select({ stateVersion: players.stateVersion })
    .from(players)
    .where(eq(players.id, id))
    .limit(1);

  return row?.stateVersion ?? 0;
}

/** `project()` returns a typed view; the wire schema takes a plain record (§4.2). */
export function toWireView(state: PlayerState, nowMs: number): Record<string, unknown> {
  return project(state, nowMs) as unknown as Record<string, unknown>;
}

export function toWireEvents(events: SimEvent[]): Record<string, unknown>[] {
  return events as unknown as Record<string, unknown>[];
}
