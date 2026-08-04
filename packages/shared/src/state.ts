import { z } from 'zod';

/**
 * The `GET /state` envelope from DESIGN.md §8.
 *
 * `state`, `view`, and `events` are deliberately loose here. They are `PlayerState`,
 * `ProjectedView`, and `SimEvent[]` from `@jelly/sim`, but this package cannot import that
 * one — the sim imports nothing outside `@jelly/shared` (§4.2) and the dependency has to
 * run one way. Clients get the real types by casting once, at the edge, in api/client.ts.
 */
export const StateResponse = z.object({
  /** Server clock, milliseconds. The client's own clock is never trusted (§9.4). */
  serverTime: z.number().int(),
  /** Optimistic-concurrency token; echoed back on POST /actions (§7). */
  stateVersion: z.number().int(),
  simVersion: z.number().int(),
  state: z.unknown(),
  /** Derived, never persisted. */
  view: z.record(z.string(), z.unknown()),
  events: z.array(z.record(z.string(), z.unknown())),
});
export type StateResponse = z.infer<typeof StateResponse>;

/** `GET /state?slot=0`. A player has one save today and room for more (§5.11). */
export const StateQuery = z.object({
  slot: z.coerce.number().int().min(0).max(9).default(0),
});
export type StateQuery = z.infer<typeof StateQuery>;

export const ContentResponse = z.object({
  simVersion: z.number().int(),
  /** Balance tables (§5) land here in Phase 2. */
  content: z.record(z.string(), z.unknown()),
});
export type ContentResponse = z.infer<typeof ContentResponse>;
