/**
 * @jelly/sim — the entire game.
 *
 * Every rule in DESIGN.md §5 lives in this package and nowhere else: decay curves, crop
 * timers, combat, the economy, and the hole penalty. It has no database, no HTTP, no
 * `Date.now()`, and no DOM, which is what lets the client and the server run the same code
 * and reach the same answer.
 *
 * The three functions that make it a simulation:
 *
 *   advance(state, toMs)        fast-forward, in fixed 60-second ticks
 *   apply(state, action, atMs)  one player intent, never throws
 *   project(state, atMs)        the derived view the UI reads
 *
 * `moodCeiling` is deliberately not among the exports. It is internal to needs.ts, it is
 * never projected, and it never appears in an event — see CLAUDE.md.
 *
 * Phase 1 implements the care loop. The economy, the island, life stages, quests, combat,
 * and the social systems arrive in Phases 2–6; their identifiers already exist in
 * content.ts so the shapes are reviewable, but the rules that read them do not.
 */

export * from './content.js';
export * from './rng.js';
export * from './state.js';
export * from './time.js';
export { createInitialState, type NewGameOptions } from './initialState.js';
export { migrate, migrations } from './migrate.js';
export { advance, type AdvanceResult } from './advance.js';
export { apply } from './apply.js';
export {
  PHASE_1_ACTIONS,
  REJECT_CODES,
  type Action,
  type ActionType,
  type ApplyResult,
  type RejectCode,
} from './action.js';
export { project, type ProjectedBark, type ProjectedView } from './project.js';
export type { SimEvent } from './events.js';
export { SIM_VERSION } from './version.js';
