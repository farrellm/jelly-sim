import cookie from '@fastify/cookie';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import { API_BASE } from '@jelly/shared';
import { SIM_VERSION } from '@jelly/sim';
import Fastify, { type FastifyInstance } from 'fastify';
import type { Sql } from 'postgres';
import type { Config } from './config.js';
import type { Db } from './db/client.js';
import { registerRequireAuth } from './auth/requireAuth.js';
import { registerErrorHandler } from './plugins/errors.js';
import { registerCsrfGuard } from './plugins/security.js';
import { registerActionRoutes } from './routes/actions.js';
import { registerAuthRoutes } from './routes/auth.js';
import { registerStateRoutes } from './routes/state.js';

declare module 'fastify' {
  interface FastifyInstance {
    config: Config;
    db: Db;
    sql: Sql;
  }
}

export interface ServerDeps {
  config: Config;
  db: Db;
  sql: Sql;
}

/**
 * Build a configured server without listening, so tests can drive it with
 * `fastify.inject()` and never bind a port (DESIGN.md §13.2).
 */
export async function buildServer({ config, db, sql }: ServerDeps): Promise<FastifyInstance> {
  const app = Fastify({
    logger: {
      level: config.logLevel,
      // Never log a password or a session token, however deeply nested (§9.3).
      redact: {
        paths: [
          'req.headers.cookie',
          'req.headers.authorization',
          'res.headers["set-cookie"]',
          '*.password',
          '*.newPassword',
          '*.currentPassword',
        ],
        censor: '[redacted]',
      },
    },
    trustProxy: config.nodeEnv === 'production',
    disableRequestLogging: config.nodeEnv === 'test',
  });

  // Several POSTs take no body at all (logout, logout-all, and later the claim routes).
  // Fastify's default JSON parser rejects an empty body outright, and the client sends a
  // Content-Type on every request, so treat empty as {}.
  app.addContentTypeParser(
    'application/json',
    { parseAs: 'string' },
    (_request, payload: string, done) => {
      if (payload === '') return done(null, {});
      try {
        done(null, JSON.parse(payload));
      } catch (err) {
        done(err as Error, undefined);
      }
    },
  );

  app.decorate('config', config);
  app.decorate('db', db);
  app.decorate('sql', sql);

  await app.register(helmet, {
    // The API serves JSON only; the CSP that matters is the one on the static host.
    contentSecurityPolicy: false,
    hsts: config.nodeEnv === 'production' ? { maxAge: 31_536_000, includeSubDomains: true } : false,
    referrerPolicy: { policy: 'same-origin' },
  });

  await app.register(cors, {
    origin: config.corsOrigins,
    credentials: true,
    allowedHeaders: ['content-type', 'x-jelly-client'],
  });

  await app.register(cookie);

  await app.register(rateLimit, {
    global: false,
    // Every limit is declared on the route it protects; this only sets the default key.
    keyGenerator: (request) => request.ip,
  });

  registerCsrfGuard(app, config);
  registerErrorHandler(app);
  registerRequireAuth(app);

  app.get('/healthz', async () => ({ ok: true }));

  app.get(`${API_BASE}/content`, async (_request, reply) => {
    // The balance tables land here in Phase 2; until then the only thing worth telling a
    // client is which rules version the server is running. §8 wants this ETag'd, which
    // becomes worth doing once the payload is bigger than two fields.
    const body = { simVersion: SIM_VERSION, content: {} };
    void reply.header('cache-control', 'public, max-age=60');
    return body;
  });

  registerAuthRoutes(app, API_BASE);
  registerStateRoutes(app, API_BASE);
  registerActionRoutes(app, API_BASE);

  return app;
}
