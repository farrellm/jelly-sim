import { HTTP_STATUS_FOR_ERROR, type ErrorCode } from '@jelly/shared';

/**
 * The one way this API says no. Everything a route throws lands in the error handler in
 * plugins/errors.ts and comes out as the §8 envelope, so the client never has to parse
 * prose or guess at a shape.
 */
export class ApiError extends Error {
  readonly code: ErrorCode;
  readonly status: number;
  readonly details?: { path: string; message: string }[];
  readonly headers?: Record<string, string>;

  constructor(
    code: ErrorCode,
    message: string,
    opts: { details?: { path: string; message: string }[]; headers?: Record<string, string> } = {},
  ) {
    super(message);
    this.name = 'ApiError';
    this.code = code;
    this.status = HTTP_STATUS_FOR_ERROR[code];
    this.details = opts.details;
    this.headers = opts.headers;
  }
}

export const unauthenticated = (msg = 'You are not signed in.') =>
  new ApiError('UNAUTHENTICATED', msg);

export const forbidden = (msg = 'That is not yours.') => new ApiError('FORBIDDEN', msg);

export const notFound = (msg = 'Not found.') => new ApiError('NOT_FOUND', msg);

export const validation = (msg: string, details?: { path: string; message: string }[]) =>
  new ApiError('VALIDATION', msg, { details });

export const rateLimited = (msg: string, retryAfterSeconds: number) =>
  new ApiError('RATE_LIMITED', msg, {
    headers: { 'retry-after': String(Math.max(1, Math.ceil(retryAfterSeconds))) },
  });
