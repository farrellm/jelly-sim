import { StateQuery, type StateResponse } from '@jelly/shared';
import { SIM_VERSION } from '@jelly/sim';
import type { FastifyInstance } from 'fastify';
import { authedUser } from '../auth/requireAuth.js';
import {
  currentStateVersion,
  loadAndTick,
  persist,
  toWireEvents,
  toWireView,
} from '../game/tick.js';
import { serverNow } from '../time.js';
import { parseQuery } from '../validate.js';

export function registerStateRoutes(app: FastifyInstance, prefix: string): void {
  /**
   * The player's save, brought up to now.
   *
   * This is where canon's "needs run while the app is closed" `[C§5, C§17]` actually
   * happens: nothing runs in the background, and the fourteen hours a player was away are
   * simulated on the way out of the database the moment they come back.
   *
   * Losing the write race is not an error here. A GET has no intent to preserve — another
   * device already did this work — so the loser re-reads and returns what the winner
   * stored. Only POST /actions turns a lost race into a 409.
   *
   * The query filters on user_id as well as slot. A player id in the URL is a Phase 6
   * concern, but the habit of scoping every read to the signed-in user starts here.
   */
  app.get(`${prefix}/state`, { preHandler: app.requireAuth }, async (request) => {
    const user = authedUser(request);
    const { slot } = parseQuery(StateQuery, request.query);
    const nowMs = serverNow(request);

    const loaded = await loadAndTick(app, user.id, slot, nowMs);
    let stateVersion = loaded.row.stateVersion;

    if (loaded.dirty) {
      const written = await persist(app, loaded.row, loaded.state, nowMs);
      if (written === null) {
        // Another device ticked the same save between our read and our write. It reached
        // the same conclusion — both ran the same @jelly/sim over the same interval — so
        // the only thing stale here is the version number.
        stateVersion = await currentStateVersion(app, loaded.row.id);
      } else {
        stateVersion = written;
      }
    }

    const body: StateResponse = {
      serverTime: nowMs,
      stateVersion,
      simVersion: SIM_VERSION,
      state: loaded.state,
      view: toWireView(loaded.state, nowMs),
      events: toWireEvents(loaded.events),
    };
    return body;
  });
}
