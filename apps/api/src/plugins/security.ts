import { CLIENT_HEADER, CLIENT_HEADER_VALUE } from '@jelly/shared';
import type { FastifyInstance } from 'fastify';
import type { Config } from '../config.js';
import { ApiError } from '../errors.js';

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

/**
 * CSRF defense, DESIGN.md §9.3.
 *
 * Session cookies are SameSite=Lax, which already blocks cross-site sub-requests. This
 * closes the top-level-navigation gap: a mutating request must carry `X-Jelly-Client: 1`,
 * which a cross-origin page cannot set without a preflight that our CORS allowlist
 * refuses, and its Origin must be one we know. No token round-trip, nothing to leak.
 */
export function registerCsrfGuard(app: FastifyInstance, config: Config): void {
  const allowed = new Set(config.corsOrigins);

  app.addHook('onRequest', async (request) => {
    if (SAFE_METHODS.has(request.method)) return;

    if (request.headers[CLIENT_HEADER] !== CLIENT_HEADER_VALUE) {
      throw new ApiError('FORBIDDEN', `Missing ${CLIENT_HEADER} header.`);
    }

    const origin = request.headers.origin;
    // Same-origin requests from a native client or curl send no Origin at all, which is
    // not forgeable by a browser page and so is not the threat this guards against.
    if (origin !== undefined && !allowed.has(origin)) {
      throw new ApiError('FORBIDDEN', 'Origin not allowed.');
    }
  });
}
