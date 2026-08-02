import { ActionsRequest, type ActionResult, type ActionsResponse } from '@jelly/shared';
import { apply, SIM_VERSION, type Action, type PlayerState, type SimEvent } from '@jelly/sim';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import { authedUser } from '../auth/requireAuth.js';
import { SESSION_COOKIE } from '../auth/session.js';
import {
  currentStateVersion,
  loadAndTick,
  persist,
  toWireEvents,
  toWireView,
} from '../game/tick.js';
import { stateConflict } from '../errors.js';
import { serverNow } from '../time.js';
import { parseBody } from '../validate.js';

export function registerActionRoutes(app: FastifyInstance, prefix: string): void {
  /**
   * A batch of player intents (§4.4, §8).
   *
   * The client sends what the player did, never what they think the result was, which is
   * the whole of the anti-cheat posture (§9.4) and the reason optimistic prediction is
   * safe: a client that guessed wrong gets corrected by the response it already replaces
   * its state with.
   *
   * Intents apply **in order, best-effort**. A rejection does not abort the batch, because
   * the client debounces a session's worth of taps into one request and one unaffordable
   * `giveSpace` must not throw away the four holes dug before it.
   */
  app.post(
    `${prefix}/actions`,
    {
      preHandler: app.requireAuth,
      // §9.3 caps this at 120/min. Keyed by the session rather than by IP: a household
      // behind one address is not one player, and the limit is meant to bound how fast a
      // single save can be written. The key is read from the cookie because the limiter
      // runs on onRequest, before requireAuth has resolved the session.
      config: {
        rateLimit: {
          max: 120,
          timeWindow: '1 minute',
          keyGenerator: (request: FastifyRequest) => request.cookies[SESSION_COOKIE] ?? request.ip,
        },
      },
    },
    async (request) => {
      const user = authedUser(request);
      const body = parseBody(ActionsRequest, request.body);
      const nowMs = serverNow(request);

      const loaded = await loadAndTick(app, user.id, body.slot, nowMs);

      // The client is holding a different save than the one on disk — usually because the
      // player has the game open somewhere else `[C§17]`. Refuse before applying anything;
      // an intent formed against a stale state may not mean what the player thought.
      if (body.stateVersion !== loaded.row.stateVersion) {
        throw stateConflict(loaded.row.stateVersion);
      }

      let state: PlayerState = loaded.state;
      const events: SimEvent[] = [...loaded.events];
      const results: ActionResult[] = [];

      for (const action of body.actions) {
        const result = apply(state, action as Action, nowMs);
        if (result.ok) {
          state = result.state;
          events.push(...result.events);
          results.push({ ok: true, events: toWireEvents(result.events) });
        } else {
          results.push({ ok: false, code: result.code, message: result.message });
        }
      }

      const written = await persist(app, loaded.row, state, nowMs);
      if (written === null) {
        // We read a version, applied to it, and lost the write. Unlike a GET there is
        // intent to preserve here, so the client refetches and replays rather than having
        // its taps silently dropped.
        throw stateConflict(await currentStateVersion(app, loaded.row.id));
      }

      const response: ActionsResponse = {
        serverTime: nowMs,
        stateVersion: written,
        simVersion: SIM_VERSION,
        state,
        view: toWireView(state, nowMs),
        results,
        events: toWireEvents(events),
      };
      return response;
    },
  );
}
