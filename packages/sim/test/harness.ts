import { expect } from 'vitest';
import type { Action, RejectCode } from '../src/action.js';
import { advance } from '../src/advance.js';
import { apply } from '../src/apply.js';
import type { NeedId, Stage } from '../src/content.js';
import type { SimEvent } from '../src/events.js';
import { createInitialState } from '../src/initialState.js';
import { moodCeiling } from '../src/needs.js';
import type { PlayerState } from '../src/state.js';
import { MS_PER_DAY, MS_PER_HOUR, MS_PER_MINUTE } from '../src/time.js';

/**
 * The time-travel harness DESIGN.md §13.1 asks for:
 *
 *     at('2026-01-01T00:00Z').advanceHours(14).expectNeed('hunger', 25);
 *
 * The sim itself may not read a clock (§4.2), which makes testing it a matter of choosing
 * instants rather than of mocking anything. This wrapper exists so that choosing them
 * reads like a description of a play session instead of arithmetic on milliseconds.
 *
 * `Date` is fine in here — eslint.config.js lifts the §4.2 ban for test files precisely so
 * a test can say what day it means.
 */
export class Clock {
  state: PlayerState;
  events: SimEvent[] = [];
  nowMs: number;

  constructor(state: PlayerState, nowMs: number) {
    this.state = state;
    this.nowMs = nowMs;
  }

  private step(deltaMs: number): this {
    this.nowMs += deltaMs;
    const result = advance(this.state, this.nowMs);
    this.state = result.state;
    this.events = result.events;
    return this;
  }

  advanceMinutes(minutes: number): this {
    return this.step(minutes * MS_PER_MINUTE);
  }

  advanceHours(hours: number): this {
    return this.step(hours * MS_PER_HOUR);
  }

  advanceDays(days: number): this {
    return this.step(days * MS_PER_DAY);
  }

  /** Apply an intent at the current instant, failing the test if it is refused. */
  do(action: Action, times = 1): this {
    for (let i = 0; i < times; i += 1) {
      const result = apply(this.state, action, this.nowMs);
      if (!result.ok) throw new Error(`${action.t} rejected: ${result.code} — ${result.message}`);
      this.state = result.state;
      this.events = result.events;
    }
    return this;
  }

  /** Apply an intent that is expected to be refused, and hand back the refusal. */
  expectReject(action: Action): { code: RejectCode; message: string } {
    const result = apply(this.state, action, this.nowMs);
    if (result.ok) throw new Error(`${action.t} was expected to be rejected, but succeeded`);
    return { code: result.code, message: result.message };
  }

  need(need: NeedId): number {
    return this.state.bean.needs[need];
  }

  /** Meters are floats in the save; a test asserting one wants a tolerance, not luck. */
  expectNeed(need: NeedId, value: number, tolerance = 0.05): this {
    expect(this.need(need)).toBeCloseTo(value, -Math.log10(tolerance));
    return this;
  }

  expectStage(stage: Stage): this {
    expect(this.state.bean.stage).toBe(stage);
    return this;
  }

  /** Internal — tests about the hole trap need to see the thing the player never does. */
  ceiling(): number {
    return moodCeiling(this.state);
  }

  barks(): string[] {
    return this.events.filter((e) => e.t === 'bark').map((e) => e.text);
  }
}

export interface AtOptions {
  beanName?: string;
  seed?: number;
  stage?: Stage;
  mode?: 'regular' | 'baby';
}

/** Start a session at a named instant. `at('2026-01-01T00:00Z')`. */
export function at(iso: string, options: AtOptions = {}): Clock {
  const nowMs = Date.parse(iso);
  if (Number.isNaN(nowMs)) throw new Error(`Not an instant: ${iso}`);

  const state = createInitialState({
    beanName: options.beanName ?? 'Beanie',
    nowMs,
    seed: options.seed ?? 0xc0ffee,
    mode: options.mode ?? 'regular',
  });
  if (options.stage) state.bean.stage = options.stage;

  return new Clock(state, nowMs);
}
