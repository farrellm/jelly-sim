import { ActionSchema, MAX_ACTIONS_PER_REQUEST, RejectCodeSchema } from '@jelly/shared';
import { describe, expect, expectTypeOf, it } from 'vitest';
import { PHASE_1_ACTIONS, REJECT_CODES, type Action, type RejectCode } from '../src/action.js';
import type { ItemId } from '../src/content.js';
import { apply } from '../src/apply.js';
import { at } from './harness.js';

/**
 * The seam between the wire and the rules.
 *
 * `@jelly/shared` describes what a request may contain and `@jelly/sim` decides what it
 * means, and the two are written separately because the sim may not import anything but
 * shared (§4.2) and shared must not import the sim. That independence is worth having and
 * it is exactly the kind that drifts, so it is asserted rather than assumed.
 */
describe('the wire schema and the rules agree', () => {
  it('can express every intent the rules model', () => {
    // The compiler does the work: if the rules ever grow a Phase 1 action the wire cannot
    // carry, this stops being valid and `pnpm typecheck` fails.
    type Phase1Action = Extract<Action, { t: (typeof PHASE_1_ACTIONS)[number] }>;
    expectTypeOf<Phase1Action>().toExtend<ActionSchema>();
  });

  it('is deliberately wider than the rules, and only in the ids', () => {
    // The wire takes `item: string` where the sim takes `ItemId`. That asymmetry is the
    // design: shape validation belongs to the schema, vocabulary belongs to the rules.
    expectTypeOf<ActionSchema>().not.toExtend<Action>();
    expectTypeOf<Extract<ActionSchema, { t: 'feed' }>['item']>().toEqualTypeOf<string>();
  });

  it('accepts every action Phase 1 implements, and nothing else', () => {
    const accepted = ActionSchema.options.map((option) => option.shape.t.value);
    expect(accepted.sort()).toEqual([...PHASE_1_ACTIONS].sort());
  });

  it('lists the same rejection codes on both sides', () => {
    expectTypeOf<(typeof RejectCodeSchema.options)[number]>().toEqualTypeOf<RejectCode>();
    expect([...RejectCodeSchema.options].sort()).toEqual([...REJECT_CODES].sort());
  });

  it('refuses a shape the sim would have to guess at', () => {
    expect(ActionSchema.safeParse({ t: 'feed' }).success).toBe(false);
    expect(ActionSchema.safeParse({ t: 'plant', plot: 0, crop: 'parsley' }).success).toBe(false);
    expect(ActionSchema.safeParse({ t: 'feed', item: 'hamburger' }).success).toBe(true);
  });

  it('leaves unknown item ids for the sim to refuse, with a message', () => {
    // The wire takes any string; the vocabulary belongs to the rules. A client sending
    // nonsense gets a specific NOT_READY rather than a 400 it cannot interpret.
    expect(ActionSchema.safeParse({ t: 'feed', item: 'gravel' }).success).toBe(true);

    const clock = at('2026-01-01T00:00Z');
    const result = apply(clock.state, { t: 'feed', item: 'gravel' as ItemId }, clock.nowMs);
    expect(result).toMatchObject({ ok: false, code: 'NOT_READY' });
  });

  it('caps a batch at something a tick can absorb', () => {
    expect(MAX_ACTIONS_PER_REQUEST).toBeGreaterThan(0);
    expect(MAX_ACTIONS_PER_REQUEST).toBeLessThanOrEqual(100);
  });
});
