import type { FastifyInstance, FastifyReply, FastifyRequest, preHandlerHookHandler } from 'fastify';
import { unauthenticated } from '../errors.js';
import type { UserRow } from '../db/schema.js';
import { SESSION_COOKIE, resolveSession, setSessionCookie } from './session.js';

declare module 'fastify' {
  interface FastifyRequest {
    user?: UserRow;
    sessionId?: string;
  }
  interface FastifyInstance {
    requireAuth: preHandlerHookHandler;
  }
}

/**
 * `preHandler: app.requireAuth` on any route that needs a signed-in player. Resolves the
 * session cookie, slides its expiry when it is a day stale, and rejects with the §8
 * UNAUTHENTICATED envelope otherwise.
 */
export function registerRequireAuth(app: FastifyInstance): void {
  app.decorate('requireAuth', async function (request: FastifyRequest, reply: FastifyReply) {
    const token = request.cookies[SESSION_COOKIE];
    if (!token) throw unauthenticated();

    const resolved = await resolveSession(app.db, token);
    if (!resolved) {
      // Expired, revoked, or forged. Clear it so the client stops sending it.
      void reply.clearCookie(SESSION_COOKIE, { path: '/' });
      throw unauthenticated('Your session has expired. Please sign in again.');
    }

    request.user = resolved.user;
    request.sessionId = resolved.sessionId;

    if (resolved.renewedUntil) setSessionCookie(reply, token, app.config);
  });
}

/** Narrowing helper for handlers that run behind requireAuth. */
export function authedUser(request: FastifyRequest): UserRow {
  if (!request.user) throw unauthenticated();
  return request.user;
}
