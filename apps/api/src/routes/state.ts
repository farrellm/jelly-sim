import type { StateResponse } from '@jelly/shared';
import { and, eq } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { authedUser } from '../auth/requireAuth.js';
import { players } from '../db/schema.js';
import { notFound } from '../errors.js';

export function registerStateRoutes(app: FastifyInstance, prefix: string): void {
  /**
   * The player's save.
   *
   * Phase 1 turns this into the call that matters: tick the save forward from
   * `last_tick_at` to now with advance(), persist the result, and return project()'s
   * derived view alongside it. Until the simulation exists there is nothing to advance,
   * so this reads the blob and hands it back untouched.
   *
   * The query filters on user_id as well as slot. A player id in the URL is a Phase 6
   * concern, but the habit of scoping every read to the signed-in user starts here.
   */
  app.get(`${prefix}/state`, { preHandler: app.requireAuth }, async (request) => {
    const user = authedUser(request);
    const slot = Number((request.query as { slot?: string }).slot ?? 0);

    const [player] = await app.db
      .select()
      .from(players)
      .where(and(eq(players.userId, user.id), eq(players.slot, slot)))
      .limit(1);

    if (!player) throw notFound('No Jelly Bean in that slot.');

    // Phase 1: advance(player.state, player.lastTickAt, now) goes here, with the result
    // written back under the state_version check from §7.

    const body: StateResponse = {
      serverTime: Date.now(),
      stateVersion: player.stateVersion,
      simVersion: player.simVersion,
      state: player.state,
      view: {},
      events: [],
    };
    return body;
  });
}
