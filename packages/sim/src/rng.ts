import type { RngState } from './state.js';

/**
 * xoshiro128** — the seeded PRNG required by DESIGN.md §4.2.
 *
 * `Math.random()` is banned inside this package, because the client and the server both
 * run these rules and must reach the same outcome for the same save. Every draw therefore
 * threads the four-word generator state through explicitly: nothing here mutates in place,
 * and the caller is responsible for storing the returned state back into `PlayerState.rng`.
 */

function rotl(x: number, k: number): number {
  return (x << k) | (x >>> (32 - k));
}

export interface Draw {
  /** A uniform uint32. */
  value: number;
  state: RngState;
}

export function next(state: RngState): Draw {
  const [s0, s1, s2, s3] = state;

  const value = Math.imul(rotl(Math.imul(s1, 5), 7), 9) >>> 0;

  const t = (s1 << 9) >>> 0;
  const n2 = (s2 ^ s0) >>> 0;
  const n3 = (s3 ^ s1) >>> 0;
  const n1 = (s1 ^ n2) >>> 0;
  const n0 = (s0 ^ n3) >>> 0;

  return { value, state: [n0, n1, (n2 ^ t) >>> 0, rotl(n3, 11) >>> 0] };
}

/** A float in [0, 1). */
export function nextFloat(state: RngState): { value: number; state: RngState } {
  const draw = next(state);
  return { value: draw.value / 0x1_0000_0000, state: draw.state };
}

/** An integer in [0, bound). Rejection-free; the modulo bias is immaterial at game scale. */
export function nextInt(state: RngState, bound: number): { value: number; state: RngState } {
  const draw = next(state);
  return { value: draw.value % bound, state: draw.state };
}

/** A float in [min, max). Used for the ±15 % combat damage roll (§5.7). */
export function nextRange(
  state: RngState,
  min: number,
  max: number,
): { value: number; state: RngState } {
  const draw = nextFloat(state);
  return { value: min + draw.value * (max - min), state: draw.state };
}

/**
 * splitmix32, used only to expand a single 32-bit seed into a well-distributed generator
 * state. Seeding xoshiro directly from a small integer gives a poor first few draws.
 */
export function seedRng(seed: number): RngState {
  let z = seed >>> 0;
  const words: number[] = [];
  for (let i = 0; i < 4; i++) {
    z = (z + 0x9e3779b9) >>> 0;
    let x = z;
    x = Math.imul(x ^ (x >>> 16), 0x21f0aaad) >>> 0;
    x = Math.imul(x ^ (x >>> 15), 0x735a2d97) >>> 0;
    words.push((x ^ (x >>> 15)) >>> 0);
  }
  // A xoshiro state of all zeroes is a fixed point that only ever produces zero.
  const allZero = words.every((w) => w === 0);
  return (allZero ? [1, 0, 0, 0] : words) as RngState;
}
