/**
 * @jelly/sim — the entire game.
 *
 * Every rule in DESIGN.md §5 lives in this package and nowhere else: decay curves, crop
 * timers, combat, the economy, and the hole penalty. It has no database, no HTTP, no
 * `Date.now()`, and no DOM, which is what lets the client and the server run the same code
 * and reach the same answer.
 *
 * Phase 0 ships the vocabulary only — the state shape, the seeded PRNG, and the state a
 * new save starts in. The three functions that make it a simulation arrive in Phase 1:
 *
 *   advance(state, fromMs, toMs)  fast-forward, in fixed 60-second steps
 *   apply(state, action, atMs)    one player intent, never throws
 *   project(state, atMs)          the derived view the UI reads
 */

export * from './content.js';
export * from './rng.js';
export * from './state.js';
export * from './time.js';
export { createInitialState, type NewGameOptions } from './initialState.js';
export { migrate, migrations } from './migrate.js';
export { SIM_VERSION } from './version.js';
