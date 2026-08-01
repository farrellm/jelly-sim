import { z } from 'zod';

/**
 * The `GET /state` envelope from DESIGN.md §8.
 *
 * Phase 0 ships the envelope but not its contents: `state` is whatever blob the player
 * row holds, and `view` / `events` are empty. Phase 1 fills them from
 * `project()` and the `SimEvent` stream once @jelly/sim can actually think.
 */
export const StateResponse = z.object({
  /** Server clock, milliseconds. The client's own clock is never trusted (§9.4). */
  serverTime: z.number().int(),
  /** Optimistic-concurrency token; echoed back on POST /actions (§7). */
  stateVersion: z.number().int(),
  simVersion: z.number().int(),
  state: z.unknown(),
  /** Derived, never persisted. Empty until Phase 1. */
  view: z.record(z.string(), z.unknown()),
  events: z.array(z.record(z.string(), z.unknown())),
});
export type StateResponse = z.infer<typeof StateResponse>;

export const ContentResponse = z.object({
  simVersion: z.number().int(),
  /** Balance tables (§5) land here in Phase 2. */
  content: z.record(z.string(), z.unknown()),
});
export type ContentResponse = z.infer<typeof ContentResponse>;
