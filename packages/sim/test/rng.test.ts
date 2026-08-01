import { describe, expect, it } from 'vitest';
import { next, nextFloat, nextInt, nextRange, seedRng } from '../src/rng.js';
import type { RngState } from '../src/state.js';

describe('seeded rng', () => {
  it('produces the same stream from the same seed', () => {
    const draw = (seed: number, n: number) => {
      let state = seedRng(seed);
      const out: number[] = [];
      for (let i = 0; i < n; i++) {
        const d = next(state);
        out.push(d.value);
        state = d.state;
      }
      return out;
    };

    expect(draw(12345, 16)).toEqual(draw(12345, 16));
    expect(draw(12345, 16)).not.toEqual(draw(12346, 16));
  });

  it('never mutates the state it is given', () => {
    const state = seedRng(7);
    const before: RngState = [...state];
    next(state);
    nextFloat(state);
    nextInt(state, 10);
    expect(state).toEqual(before);
  });

  it('stays inside the uint32 range', () => {
    let state = seedRng(99);
    for (let i = 0; i < 2000; i++) {
      const d = next(state);
      expect(Number.isInteger(d.value)).toBe(true);
      expect(d.value).toBeGreaterThanOrEqual(0);
      expect(d.value).toBeLessThanOrEqual(0xffffffff);
      state = d.state;
    }
  });

  it('bounds nextFloat, nextInt, and nextRange', () => {
    let state = seedRng(4242);
    for (let i = 0; i < 1000; i++) {
      const f = nextFloat(state);
      expect(f.value).toBeGreaterThanOrEqual(0);
      expect(f.value).toBeLessThan(1);

      const n = nextInt(state, 6);
      expect(n.value).toBeGreaterThanOrEqual(0);
      expect(n.value).toBeLessThan(6);

      // The combat damage roll (§5.7).
      const r = nextRange(state, 0.85, 1.15);
      expect(r.value).toBeGreaterThanOrEqual(0.85);
      expect(r.value).toBeLessThan(1.15);

      state = f.state;
    }
  });

  it('escapes the all-zero fixed point', () => {
    // splitmix32 of 0 must not hand xoshiro a state it can never leave.
    let state = seedRng(0);
    expect(state.some((w) => w !== 0)).toBe(true);
    for (let i = 0; i < 10; i++) state = next(state).state;
    expect(state.some((w) => w !== 0)).toBe(true);
  });

  it('does not immediately repeat itself', () => {
    let state = seedRng(2026);
    const seen = new Set<number>();
    for (let i = 0; i < 5000; i++) {
      const d = next(state);
      seen.add(d.value);
      state = d.state;
    }
    expect(seen.size).toBeGreaterThan(4990);
  });
});
