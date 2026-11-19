/**
 * Deterministic Mulberry32 PRNG for reproducible simulation ticks and unit tests.
 * Operates functionally on a 32-bit unsigned integer state stored inside GameState.
 */

export interface RandomStep {
  /** Uniform float in [0, 1). */
  value: number;
  /** Next 32-bit unsigned PRNG state. */
  nextState: number;
}

export interface RandomIntStep {
  /** Uniform integer in [minInclusive, maxInclusive]. */
  value: number;
  /** Next 32-bit unsigned PRNG state. */
  nextState: number;
}

export function normalizeSeed(seed: number): number {
  return seed >>> 0;
}

export function nextRandom(state: number): RandomStep {
  const nextState = (state + 0x6d2b79f5) >>> 0;
  let t = Math.imul(nextState ^ (nextState >>> 15), 1 | nextState);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  const value = ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  return { value, nextState };
}

export function nextInt(state: number, minInclusive: number, maxInclusive: number): RandomIntStep {
  const min = Math.ceil(Math.min(minInclusive, maxInclusive));
  const max = Math.floor(Math.max(minInclusive, maxInclusive));
  const step = nextRandom(state);
  const span = max - min + 1;
  return {
    value: min + Math.floor(step.value * span),
    nextState: step.nextState,
  };
}

export class SeededRng {
  private state: number;

  constructor(seed: number) {
    this.state = normalizeSeed(seed);
  }

  getState(): number {
    return this.state;
  }

  next(): number {
    const step = nextRandom(this.state);
    this.state = step.nextState;
    return step.value;
  }

  nextInt(minInclusive: number, maxInclusive: number): number {
    const step = nextInt(this.state, minInclusive, maxInclusive);
    this.state = step.nextState;
    return step.value;
  }
}
