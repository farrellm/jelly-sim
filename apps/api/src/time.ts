import type { FastifyRequest } from 'fastify';

export const TEST_CLOCK_HEADER = 'x-test-now';

/**
 * The instant this request is happening at.
 *
 * The server clock is the only clock the simulation trusts (§9.4) — a client that says it
 * is fourteen hours later does not get to decay its own Jelly Bean fourteen hours' worth
 * of hunger, or, more to the point, does not get to say it is fourteen hours *earlier*.
 *
 * ⚙ The one exception is `x-test-now`, and it is gated twice: the config flag is only
 * honoured outside production (config.ts), and this function checks again. The end-to-end
 * suite has to be able to leave for fourteen hours and come back (§13.3, scenario 5), and
 * the alternative is mocking the clock inside the server it is meant to test from outside.
 */
export function serverNow(request: FastifyRequest): number {
  const { config } = request.server;
  if (!config.allowTestClock || config.nodeEnv === 'production') return Date.now();

  const header = request.headers[TEST_CLOCK_HEADER];
  const raw = Array.isArray(header) ? header[0] : header;
  if (!raw) return Date.now();

  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : Date.now();
}
