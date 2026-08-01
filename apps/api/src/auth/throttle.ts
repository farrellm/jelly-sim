import { and, desc, eq, gte, sql } from 'drizzle-orm';
import type { Db } from '../db/client.js';
import { loginAttempts } from '../db/schema.js';
import { rateLimited } from '../errors.js';

/**
 * Login throttling, DESIGN.md §9.3: ten attempts per fifteen minutes per IP *and* per
 * username, with exponential backoff after five consecutive failures.
 *
 * Both keys matter and for different attacks. The per-IP limit stops one host working
 * through a password list; the per-username limit stops a botnet spreading that same list
 * across a thousand hosts against one account.
 *
 * State lives in `login_attempts` rather than in process memory so it survives a restart
 * and holds across every instance behind the load balancer.
 */
const WINDOW_MS = 15 * 60 * 1000;
const MAX_PER_WINDOW = 10;
const BACKOFF_AFTER = 5;
const BACKOFF_BASE_MS = 30_000;
const BACKOFF_CAP_MS = WINDOW_MS;

export async function recordLoginAttempt(
  db: Db,
  username: string | null,
  ip: string,
  success: boolean,
): Promise<void> {
  await db.insert(loginAttempts).values({ username, ip, success });
}

export async function assertLoginAllowed(
  db: Db,
  username: string,
  ip: string,
  now: Date = new Date(),
): Promise<void> {
  const since = new Date(now.getTime() - WINDOW_MS);

  const [counts] = await db
    .select({
      byIp: sql<number>`count(*) filter (where ${loginAttempts.ip} = ${ip})::int`,
      byUsername: sql<number>`count(*) filter (where ${loginAttempts.username} = ${username})::int`,
    })
    .from(loginAttempts)
    .where(gte(loginAttempts.at, since));

  if (counts && (counts.byIp >= MAX_PER_WINDOW || counts.byUsername >= MAX_PER_WINDOW)) {
    throw rateLimited(
      'Too many sign-in attempts. Try again in a little while.',
      (WINDOW_MS - (now.getTime() - since.getTime())) / 1000 || WINDOW_MS / 1000,
    );
  }

  // Consecutive failures since this account last signed in successfully.
  const recent = await db
    .select({ success: loginAttempts.success, at: loginAttempts.at })
    .from(loginAttempts)
    .where(and(eq(loginAttempts.username, username), gte(loginAttempts.at, since)))
    .orderBy(desc(loginAttempts.at))
    .limit(MAX_PER_WINDOW);

  let failures = 0;
  for (const row of recent) {
    if (row.success) break;
    failures++;
  }

  if (failures >= BACKOFF_AFTER) {
    const wait = Math.min(BACKOFF_BASE_MS * 2 ** (failures - BACKOFF_AFTER), BACKOFF_CAP_MS);
    const lastAt = recent[0]?.at.getTime() ?? 0;
    const readyAt = lastAt + wait;
    if (now.getTime() < readyAt) {
      throw rateLimited(
        'Too many failed sign-in attempts. Try again shortly.',
        (readyAt - now.getTime()) / 1000,
      );
    }
  }
}
