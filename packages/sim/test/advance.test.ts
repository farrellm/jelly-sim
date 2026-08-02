import { describe, expect, it } from 'vitest';
import { advance } from '../src/advance.js';
import { DECAYING_NEEDS, STAGES, WEATHERS, type Stage } from '../src/content.js';
import { createInitialState } from '../src/initialState.js';
import { nextInt, seedRng } from '../src/rng.js';
import type { PlayerState } from '../src/state.js';
import { MS_PER_DAY, MS_PER_HOUR, MS_PER_MINUTE } from '../src/time.js';
import { at } from './harness.js';

describe('advance — the decay tables', () => {
  it('applies the larva rates exactly, one hour in', () => {
    const clock = at('2026-01-01T00:00Z').advanceHours(1);
    clock.expectNeed('hunger', 100 - 33.3);
    clock.expectNeed('warmth', 100 - 25.0);
    clock.expectNeed('rest', 100 - 16.7);
  });

  it('decays every stage at its own rate', () => {
    const hungerAfterAnHour = (stage: Stage) =>
      at('2026-01-01T00:00Z', { stage }).advanceHours(1).need('hunger');

    // Escaping the larva stage has to feel like a milestone, so larva decays fastest.
    const rates = STAGES.map(hungerAfterAnHour);
    expect(rates[0]).toBeLessThan(rates[1] as number);
    expect(hungerAfterAnHour('larva')).toBeCloseTo(66.7, 5);
    expect(hungerAfterAnHour('elder')).toBeCloseTo(90.0, 5);
  });

  it('runs four times as fast in baby mode', () => {
    const regular = at('2026-01-01T00:00Z').advanceMinutes(30).need('hunger');
    const baby = at('2026-01-01T00:00Z', { mode: 'baby' }).advanceMinutes(30).need('hunger');
    expect(100 - baby).toBeCloseTo((100 - regular) * 4, 5);
  });

  it('makes cold worse in the rain', () => {
    const clear = at('2026-01-01T00:00Z');
    const wet = at('2026-01-01T00:00Z');
    wet.state.island.weather = 'rain';

    clear.advanceHours(1);
    wet.advanceHours(1);
    expect(100 - wet.need('warmth')).toBeCloseTo((100 - clear.need('warmth')) * 1.4, 5);
    // Rain is cold, not hungry.
    expect(wet.need('hunger')).toBeCloseTo(clear.need('hunger'), 5);
  });

  it('never lets a meter leave [0, 100]', () => {
    const clock = at('2026-01-01T00:00Z').advanceDays(7);
    for (const need of [...DECAYING_NEEDS, 'mood'] as const) {
      expect(clock.need(need)).toBeGreaterThanOrEqual(0);
      expect(clock.need(need)).toBeLessThanOrEqual(100);
    }
  });
});

describe('advance — mood', () => {
  it('sours while a need is bottomed out and holds while it is merely low', () => {
    // Larva hunger crosses below 20 at tick 145 of 840, and nothing recovers after that,
    // so mood loses 8/h for the remaining 696 minutes: 100 − 92.8.
    at('2026-01-01T00:00Z').advanceHours(14).expectNeed('mood', 7.2);
  });

  it('recovers once every need is comfortable again, but never past the ceiling', () => {
    const clock = at('2026-01-01T00:00Z').advanceHours(6);
    expect(clock.need('mood')).toBeLessThan(100);

    // Full meters, mood still low: recovery should climb back toward the ceiling.
    clock.state.bean.needs.hunger = 100;
    clock.state.bean.needs.warmth = 100;
    clock.state.bean.needs.rest = 100;
    const before = clock.need('mood');
    clock.advanceMinutes(30);
    expect(clock.need('mood')).toBeGreaterThan(before);
    expect(clock.need('mood')).toBeLessThanOrEqual(clock.ceiling());
  });

  it('stalls a neglected Jelly Bean rather than killing it', () => {
    // Nothing kills a Jelly Bean (§6.5). A month of nothing bottoms it out and stops there.
    const clock = at('2026-01-01T00:00Z').advanceDays(30);
    expect(clock.need('mood')).toBe(0);
    expect(clock.state.bean.hp).toBeGreaterThan(0);
  });
});

describe('advance — sleep', () => {
  it('restores rest at a flat 10/h and halves hunger decay while asleep', () => {
    const awake = at('2026-01-01T00:00Z');
    const asleep = at('2026-01-01T00:00Z');
    asleep.state.bean.needs.rest = 50;
    awake.state.bean.needs.rest = 50;
    asleep.state.bean.asleepSinceMs = asleep.nowMs;

    awake.advanceHours(1);
    asleep.advanceHours(1);

    asleep.expectNeed('rest', 60);
    expect(awake.need('rest')).toBeLessThan(50);
    expect(100 - asleep.need('hunger')).toBeCloseTo((100 - awake.need('hunger')) / 2, 5);
  });

  it('wakes itself once rest is full, at every stage', () => {
    for (const stage of STAGES) {
      const clock = at('2026-01-01T00:00Z', { stage });
      clock.state.bean.needs.rest = 0;
      clock.state.bean.asleepSinceMs = clock.nowMs;

      // Ten hours from empty, whatever the stage: sleep is slow, free, and it works while
      // the app is closed, which is the only reason a free resolution can be this slow.
      clock.advanceHours(10);
      expect(clock.need('rest')).toBe(100);
      expect(clock.state.bean.asleepSinceMs).toBeNull();
    }
  });
});

describe('advance — barks', () => {
  it('barks on the way down through the threshold, once, not every minute after', () => {
    // A larva crosses 30 hunger somewhere in hour three and stays below it for good.
    const clock = at('2026-01-01T00:00Z').advanceHours(3);
    expect(clock.barks()).toContain('Jelly Bean hungry!');

    clock.advanceHours(3);
    expect(
      clock.barks().filter((line) => line.includes('hungry') || line.includes('Feed')),
    ).toEqual([]);
  });

  it('uses the canon lines and nothing else', () => {
    const canon = [
      'Jelly Bean hungry!',
      'Mama! Feed me!',
      'Jelly Bean cold. Papa help.',
      'Jelly Bean, sleep, sleep.',
      'Jelly Bean need space.',
    ];
    const clock = at('2026-01-01T00:00Z').advanceHours(14);
    expect(clock.barks().length).toBeGreaterThan(0);
    for (const line of clock.barks()) expect(canon).toContain(line);
  });

  it('produces the handful of barks that happened, not one per minute of absence', () => {
    // Fourteen hours is 840 ticks. A save that emitted a bark per tick would drown the
    // client and the push worker both.
    const clock = at('2026-01-01T00:00Z').advanceHours(14);
    expect(clock.barks().length).toBeLessThanOrEqual(4);
  });
});

describe('advance — time itself', () => {
  it('consumes whole ticks and carries the remainder', () => {
    const clock = at('2026-01-01T00:00Z');
    const start = clock.nowMs;
    clock.nowMs = start + 90_000; // a minute and a half
    const result = advance(clock.state, clock.nowMs);
    expect(result.state.worldMs).toBe(start + MS_PER_MINUTE);
  });

  it('is a no-op when no whole tick has passed', () => {
    const state = createInitialState({ beanName: 'B', nowMs: 0, seed: 1 });
    expect(advance(state, 59_999).state).toEqual(state);
  });

  it('is a no-op when the clock runs backwards', () => {
    // A client whose clock is behind the server's must not rewind its own Jelly Bean.
    const state = createInitialState({ beanName: 'B', nowMs: 1_000_000, seed: 1 });
    expect(advance(state, 0).state).toEqual(state);
  });

  it('never mutates the state it is given', () => {
    const state = createInitialState({ beanName: 'B', nowMs: 0, seed: 1 });
    const before = JSON.stringify(state);
    advance(state, MS_PER_DAY);
    expect(JSON.stringify(state)).toBe(before);
  });

  it('clamps an absence longer than thirty days', () => {
    const start = Date.UTC(2026, 0, 1);
    const state = createInitialState({ beanName: 'B', nowMs: start, seed: 1 });

    const year = advance(state, start + 365 * MS_PER_DAY).state;
    const month = advance(
      { ...state, worldMs: start + 365 * MS_PER_DAY - 30 * MS_PER_DAY },
      start + 365 * MS_PER_DAY,
    ).state;

    // The absence is simulated as thirty days, and the clock still lands where it should.
    expect(year.worldMs).toBe(start + 365 * MS_PER_DAY);
    expect(year.bean.needs).toEqual(month.bean.needs);
  });

  it('rolls the daily counters over a UTC day boundary', () => {
    const clock = at('2026-01-01T23:00Z');
    clock.state.daily.giftsSent = 3;
    clock.advanceHours(2);
    expect(clock.state.daily.dayKey).toBe('2026-01-02');
    expect(clock.state.daily.giftsSent).toBe(0);
  });
});

/**
 * The two properties DESIGN.md §13.1 singles out. Composition is what makes multi-device
 * play correct; determinism is what makes optimistic client prediction trustworthy. Both
 * are fuzzed, because the interesting failures are at split points nobody would pick.
 */
describe('advance — the properties that make multi-device play work', () => {
  const randomState = (seed: number): PlayerState => {
    let rng = seedRng(seed);
    const pick = <T>(xs: readonly T[]): T => {
      const draw = nextInt(rng, xs.length);
      rng = draw.state;
      return xs[draw.value] as T;
    };
    const pct = () => {
      const draw = nextInt(rng, 10_001);
      rng = draw.state;
      return draw.value / 100;
    };

    const state = createInitialState({
      beanName: 'Fuzz',
      nowMs: Date.UTC(2026, 0, 1),
      seed,
      mode: pick(['regular', 'baby'] as const),
    });
    state.bean.stage = pick(STAGES);
    state.island.weather = pick(WEATHERS);
    state.bean.holes = pick([0, 1, 7, 40, 200]);
    state.bean.asleepSinceMs = pick([null, state.worldMs]);
    state.bean.needs = { hunger: pct(), warmth: pct(), rest: pct(), mood: pct() };
    return state;
  };

  it('composes: splitting an interval anywhere changes nothing', () => {
    for (let seed = 1; seed <= 200; seed += 1) {
      const state = randomState(seed);
      const span = 26 * MS_PER_HOUR;
      const end = state.worldMs + span;

      // A split point deliberately off a minute boundary — the case that would break if
      // advance rounded the remainder away instead of carrying it.
      const draw = nextInt(seedRng(seed ^ 0x5eed), span);
      const split = state.worldMs + draw.value;

      const once = advance(state, end).state;
      const twice = advance(advance(state, split).state, end).state;

      expect(twice).toEqual(once);
    }
  });

  it('is deterministic across a serialize/deserialize round trip', () => {
    for (let seed = 1; seed <= 50; seed += 1) {
      const state = randomState(seed);
      const end = state.worldMs + 9 * MS_PER_HOUR;

      const direct = advance(state, end);
      const roundTripped = advance(JSON.parse(JSON.stringify(state)) as PlayerState, end);

      // Byte-identical, not merely equivalent: this is the client and the server agreeing.
      expect(JSON.stringify(roundTripped.state)).toBe(JSON.stringify(direct.state));
      expect(roundTripped.events).toEqual(direct.events);
    }
  });

  it('keeps every meter inside [0, 100] for every random state', () => {
    for (let seed = 1; seed <= 200; seed += 1) {
      const state = randomState(seed);
      const { needs } = advance(state, state.worldMs + 40 * MS_PER_HOUR).state.bean;
      for (const value of Object.values(needs)) {
        expect(value).toBeGreaterThanOrEqual(0);
        expect(value).toBeLessThanOrEqual(100);
      }
    }
  });
});
