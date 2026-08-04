import type { z } from 'zod';
import { validation } from './errors.js';

/**
 * Parse a request body with a schema from @jelly/shared, so the client and the server
 * agree on shapes by construction (§8). Failures come back as the VALIDATION envelope
 * with per-field detail the UI can put next to the right input.
 */
export function parseBody<T extends z.ZodType>(schema: T, body: unknown): z.infer<T> {
  return parse(schema, body, 'That request was not valid.');
}

/**
 * The same, for a query string. Worth having its own name: query values arrive as strings
 * and the schemas that read them coerce, which is a different enough contract that sharing
 * one function name would hide it.
 */
export function parseQuery<T extends z.ZodType>(schema: T, query: unknown): z.infer<T> {
  return parse(schema, query, 'That query was not valid.');
}

function parse<T extends z.ZodType>(schema: T, input: unknown, fallback: string): z.infer<T> {
  const result = schema.safeParse(input);
  if (!result.success) {
    const details = result.error.issues.map((issue) => ({
      path: issue.path.join('.'),
      message: issue.message,
    }));
    throw validation(details[0]?.message ?? fallback, details);
  }
  return result.data;
}
