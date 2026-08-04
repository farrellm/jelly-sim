import { z } from 'zod';

/**
 * The wire schema for player intents (DESIGN.md §4.4, §8).
 *
 * Why this lives here and not in `@jelly/sim`: the sim may import nothing outside
 * `@jelly/shared` (§4.2), so the dependency only runs one way. Item and recipe ids are
 * plain strings on the wire rather than enums for the same reason — the vocabulary belongs
 * to the sim, and the sim is the thing that refuses an id it does not recognise, with a
 * NOT_READY the UI can say something specific about. Validation here is about shape.
 */
const item = z.string().min(1).max(40);

export const ActionSchema = z.discriminatedUnion('t', [
  z.object({ t: z.literal('feed'), item }),
  z.object({ t: z.literal('warm'), item }),
  z.object({ t: z.literal('sleep') }),
  z.object({ t: z.literal('giveSpace') }),
  z.object({ t: z.literal('digHole') }),
  z.object({ t: z.literal('fillHole') }),
]);
export type ActionSchema = z.infer<typeof ActionSchema>;

/**
 * §4.4's rejection codes, echoed per action so the UI can branch on one.
 *
 * `@jelly/sim` owns the `RejectCode` type; this is the wire copy, and a test over there
 * asserts the two lists stay identical. Duplicating six strings beats making the shared
 * package depend on the sim just to name them once.
 */
export const RejectCodeSchema = z.enum([
  'INSUFFICIENT_FUNDS',
  'NOT_UNLOCKED',
  'WRONG_STAGE',
  'TILE_OCCUPIED',
  'RATE_LIMITED',
  'NOT_READY',
]);

/**
 * A batch of taps. The client debounces a session's worth of them into one request (§10.3),
 * which is why the cap is generous and why a single rejection must not discard the rest.
 */
export const MAX_ACTIONS_PER_REQUEST = 50;

export const ActionsRequest = z.object({
  /** What the client thinks it is holding. A mismatch is a 409, not a merge (§7). */
  stateVersion: z.number().int().nonnegative(),
  slot: z.number().int().min(0).max(9).default(0),
  actions: z.array(ActionSchema).min(1).max(MAX_ACTIONS_PER_REQUEST),
});
export type ActionsRequest = z.infer<typeof ActionsRequest>;

/**
 * One result per submitted action, in the order they were submitted. Actions apply
 * best-effort: a rejection does not abort the batch (§8).
 */
export const ActionResult = z.discriminatedUnion('ok', [
  z.object({ ok: z.literal(true), events: z.array(z.record(z.string(), z.unknown())) }),
  z.object({ ok: z.literal(false), code: RejectCodeSchema, message: z.string() }),
]);
export type ActionResult = z.infer<typeof ActionResult>;

export const ActionsResponse = z.object({
  serverTime: z.number().int(),
  stateVersion: z.number().int(),
  simVersion: z.number().int(),
  state: z.unknown(),
  view: z.record(z.string(), z.unknown()),
  results: z.array(ActionResult),
  /** Everything the tick and the batch had to say, in order.  */
  events: z.array(z.record(z.string(), z.unknown())),
});
export type ActionsResponse = z.infer<typeof ActionsResponse>;
