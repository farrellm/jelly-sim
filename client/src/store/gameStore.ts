/**
 * The game store (DESIGN.md §3): holds one `GameState` and delegates every rule to `shared/sim`.
 *
 * The client is the simulation authority; the server only stores the blob. Saving uses the
 * optimistic `saveVersion` counter, and a `409` is reconciled last-write-wins on `lastTickAt`
 * (DESIGN.md §14).
 */

import {
  applyAction,
  createNewGame,
  migrateSave,
  offlineCatchup,
  offlineCatchupSummary,
  tick as simTick,
  type CareAction,
  type GameState,
} from "@jelly/shared";
import { create } from "zustand";

import { NetworkError, SaveConflictError, api } from "../net/api.js";
import { readCachedSave, writeCachedSave } from "../net/offlineCache.js";

const ACTION_MESSAGES: Record<string, string> = {
  moodAlreadyFull: "Your Jelly Bean doesn't need that right now.",
  insufficientJellyCoins: "Not enough jelly coins.",
  insufficientBeanBucks: "Not enough bean bucks.",
};

interface GameStoreState {
  state: GameState | null;
  /** Server-side version this state is based on; 0 means "no save on the server yet". */
  saveVersion: number;
  status: "idle" | "loading" | "ready" | "error";
  /** Local changes not yet accepted by the server. */
  dirty: boolean;
  saving: boolean;
  offline: boolean;
  lastSavedAt: number | null;
  error: string | null;
  notice: string | null;

  load: (token: string, beanName: string) => Promise<void>;
  tick: (dtMs: number) => void;
  act: (action: CareAction) => void;
  save: (token: string, options?: { keepalive?: boolean }) => Promise<void>;
  dismissNotice: () => void;
  reset: () => void;
}

export const useGameStore = create<GameStoreState>((set, get) => ({
  state: null,
  saveVersion: 0,
  status: "idle",
  dirty: false,
  saving: false,
  offline: false,
  lastSavedAt: null,
  error: null,
  notice: null,

  async load(token, beanName) {
    set({ status: "loading", error: null });

    try {
      const remote = await api.getSave(token);
      if (remote) {
        hydrate(set, migrateSave(remote.state), remote.saveVersion, false);
      } else {
        // No save on the server yet — Dr. Bubblegum hands over a fresh plot (CONCEPT §8).
        hydrate(set, createNewGame(beanName), 0, true);
      }
      set({ offline: false });
      return;
    } catch (error) {
      if (!(error instanceof NetworkError)) {
        set({ status: "error", error: describe(error) });
        return;
      }
    }

    // Offline: fall back to the IndexedDB mirror so the game still plays (DESIGN.md §14).
    const cached = await readCachedSave();
    if (cached) {
      hydrate(set, cached.state, cached.saveVersion, cached.pendingSync);
      // `offline` already drives its own banner; don't say it twice.
      set({ offline: true });
      return;
    }
    set({
      status: "error",
      offline: true,
      error: "Can't reach the island and there's no local save yet.",
    });
  },

  tick(dtMs) {
    const { state, status } = get();
    if (!state || status !== "ready") return;

    const next = simTick(state, dtMs);
    if (next === state) return;
    set({ state: next, dirty: true });
  },

  act(action) {
    const { state, status } = get();
    if (!state || status !== "ready") return;

    const result = applyAction(state, action);
    if (!result.ok) {
      set({ notice: ACTION_MESSAGES[result.error] ?? "That didn't work." });
      return;
    }
    set({ state: result.state, dirty: true, notice: null });
  },

  async save(token, options = {}) {
    const { state, saveVersion, dirty, saving } = get();
    if (!state || !dirty || saving) return;

    set({ saving: true });
    try {
      const nextVersion = await api.putSave(token, state, saveVersion, options.keepalive);
      set({ saveVersion: nextVersion, dirty: false, saving: false, offline: false, lastSavedAt: Date.now() });
      void writeCachedSave(state, nextVersion, false);
    } catch (error) {
      if (error instanceof SaveConflictError) {
        await reconcile(set, get, token, error);
        return;
      }
      if (error instanceof NetworkError) {
        // Keep playing from local state; the queued save retries when we're back online.
        set({ saving: false, offline: true });
        void writeCachedSave(state, saveVersion, true);
        return;
      }
      set({ saving: false, error: describe(error) });
    }
  },

  dismissNotice() {
    set({ notice: null });
  },

  reset() {
    set({
      state: null,
      saveVersion: 0,
      status: "idle",
      dirty: false,
      saving: false,
      offline: false,
      lastSavedAt: null,
      error: null,
      notice: null,
    });
  },
}));

type SetState = (partial: Partial<GameStoreState>) => void;

/** Catch the save up to now, then make it live. */
function hydrate(set: SetState, loaded: GameState, saveVersion: number, dirty: boolean): void {
  const summary = offlineCatchupSummary(loaded);
  const state = offlineCatchup(loaded);

  set({
    state,
    saveVersion,
    status: "ready",
    // Catch-up always changes the state, so it is worth persisting.
    dirty: dirty || summary.appliedMs > 0,
    error: null,
    notice: welcomeBack(summary.elapsedMs),
  });
  void writeCachedSave(state, saveVersion, true);
}

/**
 * v1 conflict policy (DESIGN.md §14): last-write-wins on the most recent `lastTickAt`. If the
 * server's copy is newer we adopt it, otherwise we re-send ours on top of the server's version.
 */
async function reconcile(
  set: SetState,
  get: () => GameStoreState,
  token: string,
  conflict: SaveConflictError,
): Promise<void> {
  const local = get().state;

  if (!local || conflict.serverState.lastTickAt > local.lastTickAt) {
    const adopted = offlineCatchup(migrateSave(conflict.serverState));
    set({
      state: adopted,
      saveVersion: conflict.saveVersion,
      dirty: false,
      saving: false,
      lastSavedAt: Date.now(),
      notice: "Synced newer progress from another device.",
    });
    void writeCachedSave(adopted, conflict.saveVersion, false);
    return;
  }

  try {
    const nextVersion = await api.putSave(token, local, conflict.saveVersion);
    set({ saveVersion: nextVersion, dirty: false, saving: false, lastSavedAt: Date.now() });
    void writeCachedSave(local, nextVersion, false);
  } catch (error) {
    set({ saving: false, offline: error instanceof NetworkError });
    void writeCachedSave(local, conflict.saveVersion, true);
  }
}

function welcomeBack(elapsedMs: number): string | null {
  const minutes = Math.floor(elapsedMs / 60_000);
  if (minutes < 5) return null;
  if (minutes < 60) return `You were away ${minutes} minutes. Your Jelly Bean missed you.`;
  const hours = Math.floor(minutes / 60);
  return `You were away ${hours} hour${hours === 1 ? "" : "s"}. Your Jelly Bean missed you.`;
}

function describe(error: unknown): string {
  return error instanceof Error ? error.message : "Something went wrong";
}
