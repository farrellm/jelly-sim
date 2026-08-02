import { CLIENT_HEADER, CLIENT_HEADER_VALUE } from '@jelly/shared';
import type { FastifyInstance, InjectOptions } from 'fastify';
import type { Sql } from 'postgres';
import { loadConfig } from '../../src/config.js';
import { createDb } from '../../src/db/client.js';
import { runMigrations } from '../../src/db/migrate.js';
import { loadEnvFile } from '../../src/env.js';
import { buildServer } from '../../src/server.js';

loadEnvFile();

/**
 * Integration tests run against a real Postgres — the Compose one locally, a service
 * container in CI — because the schema does real work here: citext, CHECK constraints,
 * and a unique index are all load-bearing, and none of them exist in a fake.
 *
 * DESIGN.md §13.2 specifies Testcontainers. This uses a database supplied by
 * TEST_DATABASE_URL instead, which avoids an image pull per suite and works identically in
 * CI. The trade is that the database must exist; `pnpm db:up` provides it.
 */
export interface TestApp {
  app: FastifyInstance;
  sql: Sql;
  close: () => Promise<void>;
}

export async function createTestApp(envOverrides: NodeJS.ProcessEnv = {}): Promise<TestApp> {
  const databaseUrl = process.env.TEST_DATABASE_URL;
  if (!databaseUrl) {
    throw new Error(
      'TEST_DATABASE_URL is not set. Run `pnpm db:up` and copy .env.example to .env.',
    );
  }

  const { db, sql } = createDb(databaseUrl);
  await runMigrations(sql);

  const config = loadConfig({
    ...process.env,
    NODE_ENV: 'test',
    DATABASE_URL: databaseUrl,
    COOKIE_SECURE: 'false',
    // The registration limit is per-IP and every inject() shares one, so the default of
    // five would stop the suite in its third test. The limit itself is exercised
    // deliberately in auth.test.ts with an app configured for it.
    REGISTER_LIMIT_PER_HOUR: '10000',
    ...envOverrides,
  });

  const app = await buildServer({ config, db, sql });
  await app.ready();

  return {
    app,
    sql,
    close: async () => {
      await app.close();
      await sql.end({ timeout: 5 });
    },
  };
}

/** Every test starts from an empty database. Cascades take players and sessions with it. */
export async function truncateAll(sql: Sql): Promise<void> {
  await sql`TRUNCATE users, login_attempts RESTART IDENTITY CASCADE`;
}

/** An inject() with the headers a real client always sends (§9.3). */
export function asClient(options: InjectOptions): InjectOptions {
  return {
    ...options,
    headers: {
      [CLIENT_HEADER]: CLIENT_HEADER_VALUE,
      ...options.headers,
    },
  };
}

export const VALID_PASSWORD = 'correct horse battery';

export async function register(
  app: FastifyInstance,
  overrides: Partial<{ username: string; password: string; beanName: string; mode: string }> = {},
) {
  const res = await app.inject(
    asClient({
      method: 'POST',
      url: '/api/v1/auth/register',
      payload: {
        username: 'alice',
        password: VALID_PASSWORD,
        beanName: 'Beanie',
        ...overrides,
      },
    }),
  );
  return { res, cookie: sessionCookie(res.headers['set-cookie']) };
}

export function sessionCookie(setCookie: string | string[] | undefined): string {
  const all = Array.isArray(setCookie) ? setCookie : setCookie ? [setCookie] : [];
  const jar = all.find((c) => c.startsWith('jelly_session='));
  return jar ? (jar.split(';')[0] ?? '') : '';
}
