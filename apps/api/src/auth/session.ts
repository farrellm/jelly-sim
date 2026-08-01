import { createHash, randomBytes } from 'node:crypto';
import { and, eq, isNull } from 'drizzle-orm';
import type { FastifyReply } from 'fastify';
import type { Config } from '../config.js';
import type { Db } from '../db/client.js';
import { sessions, users, type UserRow } from '../db/schema.js';

export const SESSION_COOKIE = 'jelly_session';

/** Thirty days, sliding (DESIGN.md §9.2). */
export const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;

/** Renew `last_seen_at` and the cookie at most once a day, not on every request. */
const RENEW_AFTER_MS = 24 * 60 * 60 * 1000;

/**
 * Sessions are server-side rather than JWTs specifically so that logout, "log out
 * everywhere", and a password change can revoke *immediately* (§9.2). A player checking in
 * dozens of times a day across several devices needs session management that works.
 *
 * The raw token is never stored. The database holds sha256(token), so a database leak
 * yields nothing a thief can present.
 */
function digest(token: string): Buffer {
  return createHash('sha256').update(token).digest();
}

export interface CreatedSession {
  token: string;
  expiresAt: Date;
}

export async function createSession(
  db: Db,
  userId: string,
  userAgent: string | undefined,
  now: Date = new Date(),
): Promise<CreatedSession> {
  const token = randomBytes(32).toString('base64url');
  const expiresAt = new Date(now.getTime() + SESSION_TTL_MS);

  await db.insert(sessions).values({
    userId,
    tokenHash: digest(token),
    expiresAt,
    createdAt: now,
    lastSeenAt: now,
    userAgent: userAgent?.slice(0, 500) ?? null,
  });

  return { token, expiresAt };
}

export interface ResolvedSession {
  user: UserRow;
  sessionId: string;
  /** Set when the session was slid forward and the cookie should be re-sent. */
  renewedUntil?: Date;
}

export async function resolveSession(
  db: Db,
  token: string,
  now: Date = new Date(),
): Promise<ResolvedSession | null> {
  const rows = await db
    .select({ session: sessions, user: users })
    .from(sessions)
    .innerJoin(users, eq(users.id, sessions.userId))
    .where(and(eq(sessions.tokenHash, digest(token)), isNull(sessions.revokedAt)))
    .limit(1);

  const row = rows[0];
  if (!row) return null;
  if (row.session.expiresAt <= now) return null;
  if (row.user.disabledAt) return null;

  if (now.getTime() - row.session.lastSeenAt.getTime() > RENEW_AFTER_MS) {
    const expiresAt = new Date(now.getTime() + SESSION_TTL_MS);
    await db
      .update(sessions)
      .set({ lastSeenAt: now, expiresAt })
      .where(eq(sessions.id, row.session.id));
    return { user: row.user, sessionId: row.session.id, renewedUntil: expiresAt };
  }

  return { user: row.user, sessionId: row.session.id };
}

export async function revokeSession(db: Db, sessionId: string, now = new Date()): Promise<void> {
  await db.update(sessions).set({ revokedAt: now }).where(eq(sessions.id, sessionId));
}

/** Used by logout-all and by a password change (§9.2). */
export async function revokeAllSessions(
  db: Db,
  userId: string,
  opts: { except?: string } = {},
  now = new Date(),
): Promise<void> {
  await db
    .update(sessions)
    .set({ revokedAt: now })
    .where(and(eq(sessions.userId, userId), isNull(sessions.revokedAt)));

  if (opts.except) {
    await db.update(sessions).set({ revokedAt: null }).where(eq(sessions.id, opts.except));
  }
}

export function setSessionCookie(reply: FastifyReply, token: string, config: Config): void {
  void reply.setCookie(SESSION_COOKIE, token, {
    path: '/',
    httpOnly: true,
    secure: config.cookieSecure,
    sameSite: 'lax',
    maxAge: SESSION_TTL_MS / 1000,
  });
}

export function clearSessionCookie(reply: FastifyReply, config: Config): void {
  void reply.clearCookie(SESSION_COOKIE, {
    path: '/',
    httpOnly: true,
    secure: config.cookieSecure,
    sameSite: 'lax',
  });
}
