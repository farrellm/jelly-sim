import type { FastifyInstance } from 'fastify';
import { ApiError } from '../errors.js';

/**
 * Every error response carries `{ error, message, requestId }` (DESIGN.md §8). Unknown
 * failures are logged in full and reported as INTERNAL with nothing but the request id —
 * a stack trace is useful to us and to an attacker, and only one of them should have it.
 */
export function registerErrorHandler(app: FastifyInstance): void {
  app.setErrorHandler((err, request, reply) => {
    if (err instanceof ApiError) {
      if (err.headers) void reply.headers(err.headers);
      request.log.info({ code: err.code, msg: err.message }, 'request rejected');
      return reply.status(err.status).send({
        error: err.code,
        message: err.message,
        requestId: request.id,
        ...(err.details ? { details: err.details } : {}),
        ...(err.extra ?? {}),
      });
    }

    // @fastify/rate-limit and the body parser throw with their own status codes.
    const fastifyErr = err as { statusCode?: number; message?: string };
    const status = fastifyErr.statusCode ?? 500;
    if (status === 429) {
      return reply.status(429).send({
        error: 'RATE_LIMITED',
        message: 'Slow down a moment.',
        requestId: request.id,
      });
    }
    if (status >= 400 && status < 500) {
      return reply.status(status).send({
        error: 'VALIDATION',
        message: fastifyErr.message ?? 'Bad request.',
        requestId: request.id,
      });
    }

    request.log.error({ err }, 'unhandled error');
    return reply.status(500).send({
      error: 'INTERNAL',
      message: 'Something went wrong on our end.',
      requestId: request.id,
    });
  });

  app.setNotFoundHandler((request, reply) =>
    reply.status(404).send({
      error: 'NOT_FOUND',
      message: `No route for ${request.method} ${request.url}.`,
      requestId: request.id,
    }),
  );
}
