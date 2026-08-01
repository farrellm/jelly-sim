import { randomBytes } from 'node:crypto';
import { ChangePasswordBody, LoginBody, RegisterBody, type MeResponse } from '@jelly/shared';
import { SIM_VERSION, createInitialState } from '@jelly/sim';
import { eq } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { isCommonPassword } from '../auth/commonPasswords.js';
import { hashPassword, needsRehash, verifyPassword } from '../auth/password.js';
import { authedUser } from '../auth/requireAuth.js';
import {
  SESSION_COOKIE,
  clearSessionCookie,
  createSession,
  revokeAllSessions,
  revokeSession,
  setSessionCookie,
} from '../auth/session.js';
import { assertLoginAllowed, recordLoginAttempt } from '../auth/throttle.js';
import { players, users, type PlayerRow, type UserRow } from '../db/schema.js';
import { ApiError, unauthenticated, validation } from '../errors.js';
import { parseBody } from '../validate.js';

/**
 * A hash of a random string, verified against when the username does not exist so that a
 * miss costs the same wall-clock time as a hit. Without it, response latency is a user
 * enumeration oracle (§9.4).
 */
let decoyHash: string | null = null;
async function decoyVerify(password: string): Promise<void> {
  decoyHash ??= await hashPassword(randomBytes(24).toString('hex'));
  await verifyPassword(decoyHash, password);
}

function toMeResponse(user: UserRow, playerRows: PlayerRow[]): MeResponse {
  return {
    user: {
      id: user.id,
      username: user.username,
      createdAt: user.createdAt.toISOString(),
    },
    players: playerRows.map((p) => ({
      id: p.id,
      slot: p.slot,
      mode: p.mode,
      beanName: p.beanName,
      level: p.level,
      stage: p.stage,
    })),
  };
}

export function registerAuthRoutes(app: FastifyInstance, prefix: string): void {
  /**
   * Create an account and the Jelly Bean that comes with it.
   *
   * There is no email field, by design (§9.1): canon never asks for one, and an email we
   * do not hold cannot leak. The cost is that there is no password reset, which the
   * registration screen says outright rather than discovering later.
   */
  app.post(
    `${prefix}/auth/register`,
    { config: { rateLimit: { max: 5, timeWindow: '1 hour' } } },
    async (request, reply) => {
      const body = parseBody(RegisterBody, request.body);

      if (isCommonPassword(body.password)) {
        throw validation('That password is too common. Please pick another.');
      }

      const existing = await app.db
        .select({ id: users.id })
        .from(users)
        .where(eq(users.username, body.username))
        .limit(1);
      if (existing.length > 0) throw validation('That username is taken.');

      const now = new Date();
      const passwordHash = await hashPassword(body.password);
      const state = createInitialState({
        beanName: body.beanName,
        nowMs: now.getTime(),
        seed: randomBytes(4).readUInt32BE(0),
        mode: body.mode,
      });

      let user: UserRow;
      let player: PlayerRow;
      try {
        const created = await app.db.transaction(async (tx) => {
          const [u] = await tx
            .insert(users)
            .values({ username: body.username, passwordHash, createdAt: now })
            .returning();
          if (!u) throw new Error('user insert returned nothing');

          const [p] = await tx
            .insert(players)
            .values({
              userId: u.id,
              slot: 0,
              mode: body.mode,
              beanName: body.beanName,
              state,
              simVersion: SIM_VERSION,
              lastTickAt: now,
              createdAt: now,
              updatedAt: now,
            })
            .returning();
          if (!p) throw new Error('player insert returned nothing');

          return { u, p };
        });
        user = created.u;
        player = created.p;
      } catch (err) {
        // Someone claimed the username between the check above and the insert.
        if ((err as { code?: string }).code === '23505')
          throw validation('That username is taken.');
        throw err;
      }

      const session = await createSession(app.db, user.id, request.headers['user-agent'], now);
      setSessionCookie(reply, session.token, app.config);

      request.log.info({ userId: user.id }, 'registered');
      return reply.status(201).send(toMeResponse(user, [player]));
    },
  );

  app.post(
    `${prefix}/auth/login`,
    { config: { rateLimit: { max: 30, timeWindow: '15 minutes' } } },
    async (request, reply) => {
      const body = parseBody(LoginBody, request.body);
      const now = new Date();

      await assertLoginAllowed(app.db, body.username, request.ip, now);

      const [user] = await app.db
        .select()
        .from(users)
        .where(eq(users.username, body.username))
        .limit(1);

      // One message for every failure mode. "No such user" and "wrong password" must be
      // indistinguishable, in both text and timing (§9.4).
      const fail = async () => {
        await recordLoginAttempt(app.db, body.username, request.ip, false);
        throw unauthenticated('That username and password do not match.');
      };

      if (!user || user.disabledAt) {
        await decoyVerify(body.password);
        return fail();
      }

      const ok = await verifyPassword(user.passwordHash, body.password);
      if (!ok) return fail();

      await recordLoginAttempt(app.db, body.username, request.ip, true);

      // We hold the plaintext exactly here, so this is the only chance to upgrade a hash
      // made under weaker parameters.
      if (needsRehash(user.passwordHash)) {
        const upgraded = await hashPassword(body.password);
        await app.db.update(users).set({ passwordHash: upgraded }).where(eq(users.id, user.id));
      }

      await app.db.update(users).set({ lastLoginAt: now }).where(eq(users.id, user.id));

      const session = await createSession(app.db, user.id, request.headers['user-agent'], now);
      setSessionCookie(reply, session.token, app.config);

      const playerRows = await app.db.select().from(players).where(eq(players.userId, user.id));
      return toMeResponse(user, playerRows);
    },
  );

  app.post(`${prefix}/auth/logout`, { preHandler: app.requireAuth }, async (request, reply) => {
    if (request.sessionId) await revokeSession(app.db, request.sessionId);
    clearSessionCookie(reply, app.config);
    return { ok: true };
  });

  app.post(`${prefix}/auth/logout-all`, { preHandler: app.requireAuth }, async (request, reply) => {
    const user = authedUser(request);
    await revokeAllSessions(app.db, user.id);
    clearSessionCookie(reply, app.config);
    return { ok: true };
  });

  app.get(`${prefix}/auth/me`, { preHandler: app.requireAuth }, async (request) => {
    const user = authedUser(request);
    const playerRows = await app.db.select().from(players).where(eq(players.userId, user.id));
    return toMeResponse(user, playerRows);
  });

  app.post(`${prefix}/auth/password`, { preHandler: app.requireAuth }, async (request, reply) => {
    const user = authedUser(request);
    const body = parseBody(ChangePasswordBody, request.body);

    if (!(await verifyPassword(user.passwordHash, body.currentPassword))) {
      throw new ApiError('UNAUTHENTICATED', 'That is not your current password.');
    }
    if (isCommonPassword(body.newPassword)) {
      throw validation('That password is too common. Please pick another.');
    }

    const passwordHash = await hashPassword(body.newPassword);
    await app.db.update(users).set({ passwordHash }).where(eq(users.id, user.id));

    // A password change signs out every other device — that is most of the point of
    // changing it (§9.2). The device doing the changing stays signed in.
    await revokeAllSessions(app.db, user.id, { except: request.sessionId });

    // Make sure the surviving cookie is fresh on the way back.
    const token = request.cookies[SESSION_COOKIE];
    if (token) setSessionCookie(reply, token, app.config);

    return { ok: true };
  });
}
