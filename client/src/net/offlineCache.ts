/**
 * IndexedDB mirror of the latest save (DESIGN.md §14, §15).
 *
 * On-device storage is treated as ephemeral — the server is the durable truth — but this lets a
 * cold start with no network still load the last known save, and it queues writes made offline.
 */

import type { GameState } from "@jelly/shared";
import { del, get, set } from "idb-keyval";

const KEY = "jelly-sim:save";

export interface CachedSave {
  state: GameState;
  /** The server `saveVersion` this state was based on. */
  saveVersion: number;
  /** True when the state has local changes the server has not accepted yet. */
  pendingSync: boolean;
  cachedAt: number;
}

export async function readCachedSave(): Promise<CachedSave | null> {
  try {
    return (await get<CachedSave>(KEY)) ?? null;
  } catch {
    // Storage can be evicted or blocked (private browsing); the game plays on regardless.
    return null;
  }
}

export async function writeCachedSave(
  state: GameState,
  saveVersion: number,
  pendingSync: boolean,
): Promise<void> {
  try {
    await set(KEY, { state, saveVersion, pendingSync, cachedAt: Date.now() } satisfies CachedSave);
  } catch {
    /* ignore: the cache is a convenience, not the source of truth */
  }
}

export async function clearCachedSave(): Promise<void> {
  try {
    await del(KEY);
  } catch {
    /* ignore */
  }
}
