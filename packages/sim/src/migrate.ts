import type { PlayerState } from './state.js';
import { SIM_VERSION } from './version.js';

/**
 * Lazy save migration (DESIGN.md §7).
 *
 * A save records which rules version wrote it. When the player next returns, the server
 * runs `migrate` before `advance` and persists the result at the new version. There is no
 * online migration of the jsonb column: a save that nobody opens costs nothing.
 *
 * The rules, which are not negotiable:
 *
 *   - migrations are pure, and take a save one version forward, never two;
 *   - `migrations[i]` upgrades a v(i+1) blob to v(i+2), so the array index *is* the
 *     from-version minus one;
 *   - a migration that loses information does so as an explicit, commented decision;
 *   - every migration ships with a fixture test that loads a real blob captured at the
 *     old version, because the whole point is surviving saves you cannot re-create.
 *
 * The parameter is `unknown` on purpose: an old blob is by definition not a `PlayerState`,
 * and pretending otherwise is how migrations quietly stop being checked.
 */
type Migration = (state: Record<string, unknown>) => Record<string, unknown>;

export const migrations: Migration[] = [
  /**
   * v1 → v2 — Phase 1 gave the Jelly Bean somewhere to sleep.
   *
   * `bean.asleepSinceMs` did not exist before there was a simulation to be asleep during.
   * Every v1 save was, definitionally, awake.
   */
  (state) => {
    const bean = (state['bean'] ?? {}) as Record<string, unknown>;
    return { ...state, bean: { ...bean, asleepSinceMs: null } };
  },
];

/**
 * Bring a save forward to `SIM_VERSION`. A save at or beyond the current version is
 * returned untouched — including one from the future, which happens on a rollback and is
 * better handled by leaving it alone than by mangling it.
 */
export function migrate(state: unknown, from: number): PlayerState {
  let current = state as Record<string, unknown>;

  for (let version = from; version < SIM_VERSION; version += 1) {
    const step = migrations[version - 1];
    if (!step) {
      throw new Error(`No migration from sim version ${version}; cannot reach ${SIM_VERSION}.`);
    }
    current = step(current);
  }

  return { ...current, simVersion: Math.max(from, SIM_VERSION) } as unknown as PlayerState;
}
