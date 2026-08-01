/**
 * Save migrations (DESIGN.md §6).
 *
 * `saveVersion` gates ordered migrations: when the `GameState` shape changes, bump
 * `SAVE_VERSION` in `gameState.ts` and add a function here keyed by the version it upgrades
 * *from*. Nothing else in the codebase should reshape a save.
 */

import { SAVE_VERSION, type GameState } from "./gameState.js";
import { gameStateSchema } from "./schema.js";

type RawSave = Record<string, unknown>;

/** `MIGRATIONS[n]` upgrades a save at version `n` to version `n + 1`. */
const MIGRATIONS: Record<number, (save: RawSave) => RawSave> = {
  // v1 is the initial shape; the first entry will be `1: (save) => ({ ... })`.
};

export class SaveMigrationError extends Error {}

/**
 * Bring a stored save up to `SAVE_VERSION` and validate it. Throws `SaveMigrationError` if the
 * save is from the future, has no migration path, or fails validation.
 */
export function migrateSave(raw: unknown): GameState {
  if (typeof raw !== "object" || raw === null) {
    throw new SaveMigrationError("Save is not an object");
  }

  let save = { ...(raw as RawSave) };
  let version = typeof save.saveVersion === "number" ? save.saveVersion : 0;

  if (version > SAVE_VERSION) {
    throw new SaveMigrationError(
      `Save version ${version} is newer than this build supports (${SAVE_VERSION})`,
    );
  }

  while (version < SAVE_VERSION) {
    const migrate = MIGRATIONS[version];
    if (!migrate) {
      throw new SaveMigrationError(`No migration from save version ${version}`);
    }
    save = migrate(save);
    version += 1;
    save.saveVersion = version;
  }

  const parsed = gameStateSchema.safeParse(save);
  if (!parsed.success) {
    throw new SaveMigrationError(`Save failed validation: ${parsed.error.issues[0]?.message}`);
  }
  return parsed.data;
}
