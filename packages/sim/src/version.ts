/**
 * The rules version that wrote a save. Persisted in `players.sim_version` so a returning
 * player's blob can be migrated lazily on load (DESIGN.md §7, "Save migration policy").
 * Bump it in the same commit that changes the shape or the meaning of PlayerState.
 */
export const SIM_VERSION = 1;
