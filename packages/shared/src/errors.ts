import { z } from 'zod';

/**
 * The error taxonomy from DESIGN.md §8. Every non-2xx response the API produces uses
 * one of these codes, so the client can branch on `error` rather than on prose.
 */
export const ERROR_CODES = [
  'VALIDATION', // 400 — body failed the zod schema
  'UNAUTHENTICATED', // 401 — missing, expired, or revoked session
  'FORBIDDEN', // 403 — not your player / not your friend
  'NOT_FOUND', // 404 — unknown username or resource
  'STATE_CONFLICT', // 409 — optimistic concurrency lost; refetch
  'REJECTED', // 422 — well-formed but illegal action (per-action codes, §4.4)
  'RATE_LIMITED', // 429 — includes Retry-After
  'INTERNAL', // 500 — logged with a request id echoed to the client
] as const;

export type ErrorCode = (typeof ERROR_CODES)[number];

export const HTTP_STATUS_FOR_ERROR: Record<ErrorCode, number> = {
  VALIDATION: 400,
  UNAUTHENTICATED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  STATE_CONFLICT: 409,
  REJECTED: 422,
  RATE_LIMITED: 429,
  INTERNAL: 500,
};

export const ApiErrorBody = z.object({
  error: z.enum(ERROR_CODES),
  message: z.string(),
  requestId: z.string().optional(),
  /** Field-level detail, present on VALIDATION. */
  details: z.array(z.object({ path: z.string(), message: z.string() })).optional(),
  /** Present on STATE_CONFLICT so the client knows what it is behind. */
  stateVersion: z.number().int().optional(),
});

export type ApiErrorBody = z.infer<typeof ApiErrorBody>;

/**
 * Every mutating request must carry this header (DESIGN.md §9.3). A cross-origin form
 * post cannot set it without triggering a preflight, which the CORS allowlist refuses —
 * so this plus SameSite=Lax is the whole CSRF defense. No token round-trip.
 */
export const CLIENT_HEADER = 'x-jelly-client';
export const CLIENT_HEADER_VALUE = '1';
