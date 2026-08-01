import type { z } from 'zod';
import { validation } from './errors.js';

/**
 * Parse a request body with a schema from @jelly/shared, so the client and the server
 * agree on shapes by construction (§8). Failures come back as the VALIDATION envelope
 * with per-field detail the UI can put next to the right input.
 */
export function parseBody<T extends z.ZodType>(schema: T, body: unknown): z.infer<T> {
  const result = schema.safeParse(body);
  if (!result.success) {
    const details = result.error.issues.map((issue) => ({
      path: issue.path.join('.'),
      message: issue.message,
    }));
    throw validation(details[0]?.message ?? 'That request was not valid.', details);
  }
  return result.data;
}
