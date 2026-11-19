import { describe, expect, it, vi } from 'vitest';
import { CURRENT_SCHEMA_VERSION } from '../../src/sim/constants';
import { createInitialState, dispatch, getActiveBean } from '../../src/sim/engine';
import {
  attachAutosaveLifecycle,
  clearState,
  getStorageKey,
  loadState,
  loadStateWithBackup,
  migrateState,
  saveState,
  type IndexedDbBackupAdapter,
  type LifecycleDocumentLike,
  type LifecycleWindowLike,
  type StorageLike,
} from '../../src/storage/persistence';

class MemoryStorage implements StorageLike {
  private readonly map = new Map<string, string>();
  failOnSet = false;

  getItem(key: string): string | null {
    return this.map.get(key) ?? null;
  }

  setItem(key: string, value: string): void {
    if (this.failOnSet) {
      throw new Error('QuotaExceededError');
    }
    this.map.set(key, value);
  }

  removeItem(key: string): void {
    this.map.delete(key);
  }
}

class MemoryIdbAdapter implements IndexedDbBackupAdapter {
  readonly store = new Map<string, string>();
  failOnWrite = false;

  async get(slotId: 'regular' | 'baby'): Promise<string | null> {
    return this.store.get(slotId) ?? null;
  }

  async put(slotId: 'regular' | 'baby', serialized: string): Promise<void> {
    if (this.failOnWrite) {
      throw new Error('IDB write failed');
    }
    this.store.set(slotId, serialized);
  }

  async delete(slotId: 'regular' | 'baby'): Promise<void> {
    this.store.delete(slotId);
  }
}

describe('PR-05 client-side persistence & schema migration', () => {
  it('saves and reloads GameState losslessly from localStorage and mirrors to IndexedDB', async () => {
    const storage = new MemoryStorage();
    const idb = new MemoryIdbAdapter();

    let state = createInitialState({ nowMs: 5_000 });
    state = dispatch(
      state,
      { type: 'COMPLETE_ONBOARDING', beanName: 'Berry', parentTitle: 'Captain' },
      6_000,
    ).state;
    state = dispatch(state, { type: 'FEED_APPLE' }, 7_000).state;

    const saveResult = saveState(state, { storage, idb });
    expect(saveResult.localStorageSaved).toBe(true);
    expect(await saveResult.backupPromise).toBe(true);

    const loaded = loadState('regular', { storage, idb });
    expect(loaded.source).toBe('localStorage');
    expect(loaded.migrated).toBe(false);
    expect(loaded.recoveredFromCorruption).toBe(false);
    expect(loaded.state).toEqual(state);
    expect(getActiveBean(loaded.state).name).toBe('Berry');
    expect(loaded.state.parentTitle).toBe('Captain');
  });

  it('isolates regular and baby save slots cleanly', async () => {
    const storage = new MemoryStorage();
    const idb = new MemoryIdbAdapter();

    const regularState = createInitialState({
      slotId: 'regular',
      mode: 'regular',
      beanName: 'Sunny',
      nowMs: 1_000,
    });
    const babyState = createInitialState({
      slotId: 'baby',
      mode: 'baby',
      beanName: 'Mustache',
      nowMs: 2_000,
    });

    saveState(regularState, { storage, idb });
    saveState(babyState, { storage, idb });

    expect(getActiveBean(loadState('regular', { storage, idb }).state).name).toBe('Sunny');
    expect(getActiveBean(loadState('baby', { storage, idb }).state).name).toBe('Mustache');

    await clearState('baby', { storage, idb });
    expect(loadState('baby', { storage, idb }).source).toBe('initial');
    expect(loadState('regular', { storage, idb }).source).toBe('localStorage');
  });

  it('gracefully falls back when localStorage contains corrupted JSON or broken shapes', () => {
    const storage = new MemoryStorage();
    const key = getStorageKey('regular');

    // Case 1: invalid JSON syntax
    storage.setItem(key, '{not valid json!!!');
    const r1 = loadState('regular', { storage, idb: null, nowMs: 10_000 });
    expect(r1.source).toBe('initial');
    expect(r1.recoveredFromCorruption).toBe(true);
    expect(r1.state.schemaVersion).toBe(CURRENT_SCHEMA_VERSION);
    expect(r1.state.beans.length).toBe(1);

    // Case 2: valid JSON but empty beans array
    storage.setItem(key, JSON.stringify({ schemaVersion: 1, beans: [], currencies: {} }));
    const r2 = loadState('regular', { storage, idb: null, nowMs: 10_000 });
    expect(r2.source).toBe('initial');
    expect(r2.recoveredFromCorruption).toBe(true);

    // Case 3: unsupported future schema version
    storage.setItem(
      key,
      JSON.stringify({ ...createInitialState({ nowMs: 1_000 }), schemaVersion: 99 }),
    );
    const r3 = loadState('regular', { storage, idb: null, nowMs: 10_000 });
    expect(r3.source).toBe('initial');
    expect(r3.recoveredFromCorruption).toBe(true);
  });

  it('recovers from IndexedDB backup when localStorage is corrupted and heals localStorage', async () => {
    const storage = new MemoryStorage();
    const idb = new MemoryIdbAdapter();

    const saved = dispatch(
      createInitialState({ nowMs: 5_000 }),
      { type: 'COMPLETE_ONBOARDING', beanName: 'BackupBean', parentTitle: 'Mama' },
      6_000,
    ).state;

    const saveRes = saveState(saved, { storage, idb });
    await saveRes.backupPromise;

    // Corrupt localStorage after backup succeeded.
    storage.setItem(getStorageKey('regular'), '<<<CORRUPTED>>>');

    const recovered = await loadStateWithBackup('regular', { storage, idb, nowMs: 9_000 });
    expect(recovered.source).toBe('indexedDB');
    expect(recovered.recoveredFromCorruption).toBe(true);
    expect(getActiveBean(recovered.state).name).toBe('BackupBean');

    // Subsequent synchronous loadState now succeeds from healed localStorage.
    const healed = loadState('regular', { storage, idb });
    expect(healed.source).toBe('localStorage');
    expect(getActiveBean(healed.state).name).toBe('BackupBean');
  });

  it('migrates schemaVersion 0 legacy saves cleanly to CURRENT_SCHEMA_VERSION', () => {
    const legacyRaw = {
      schemaVersion: 0,
      parentTitle: 'Papa',
      onboarded: true,
      beans: [
        {
          id: 'bean-legacy',
          name: 'OldBean',
          level: 12,
          xp: 30,
          needs: { hunger: 55, warmth: 70, sleep: 65, hygiene: 50, mood: 60 },
        },
      ],
      currencies: { jellyCoins: 120 },
    };

    const migrated = migrateState(legacyRaw, 'regular', 50_000);
    expect(migrated).not.toBeNull();
    expect(migrated?.migrated).toBe(true);
    expect(migrated?.state.schemaVersion).toBe(CURRENT_SCHEMA_VERSION);
    expect(migrated?.state.currencies.jellyCoins).toBe(120);
    expect(migrated?.state.currencies.beanBucks).toBe(0);
    expect(getActiveBean(migrated!.state).name).toBe('OldBean');
    expect(getActiveBean(migrated!.state).stage).toBe('sprout'); // Level 12 -> sprout
    expect(migrated?.state.island.tiles.plot_pad_0?.building).toBe('starter_house');
  });

  it('handles localStorage write failures without throwing', async () => {
    const storage = new MemoryStorage();
    storage.failOnSet = true;
    const idb = new MemoryIdbAdapter();

    const state = createInitialState({ nowMs: 1_000 });
    const res = saveState(state, { storage, idb });

    expect(res.localStorageSaved).toBe(false);
    expect(res.error).toContain('QuotaExceededError');
    expect(await res.backupPromise).toBe(true);
  });

  it('triggers autosave on pagehide and visibilitychange(hidden) and cleans up on detach', () => {
    const storage = new MemoryStorage();
    const idb = new MemoryIdbAdapter();

    const windowListeners = new Map<string, Set<EventListener>>();
    const docListeners = new Map<string, Set<EventListener>>();

    const fakeWindow: LifecycleWindowLike = {
      addEventListener(type, listener) {
        const set = windowListeners.get(type) ?? new Set();
        set.add(listener as EventListener);
        windowListeners.set(type, set);
      },
      removeEventListener(type, listener) {
        windowListeners.get(type)?.delete(listener as EventListener);
      },
    };

    const fakeDocument: LifecycleDocumentLike & { visibilityState: string; hidden: boolean } = {
      visibilityState: 'visible',
      hidden: false,
      addEventListener(type, listener) {
        const set = docListeners.get(type) ?? new Set();
        set.add(listener as EventListener);
        docListeners.set(type, set);
      },
      removeEventListener(type, listener) {
        docListeners.get(type)?.delete(listener as EventListener);
      },
    };

    const currentState = createInitialState({ beanName: 'AutoBean', nowMs: 1_000 });
    const onSave = vi.fn();

    const detach = attachAutosaveLifecycle(() => currentState, {
      storage,
      idb,
      windowTarget: fakeWindow,
      documentTarget: fakeDocument,
      onSave,
    });

    // Visible visibilitychange should NOT trigger save.
    for (const fn of docListeners.get('visibilitychange') ?? []) {
      fn(new Event('visibilitychange'));
    }
    expect(onSave).toHaveBeenCalledTimes(0);

    // Hidden visibilitychange SHOULD trigger save.
    fakeDocument.visibilityState = 'hidden';
    fakeDocument.hidden = true;
    for (const fn of docListeners.get('visibilitychange') ?? []) {
      fn(new Event('visibilitychange'));
    }
    expect(onSave).toHaveBeenCalledTimes(1);
    expect(getActiveBean(loadState('regular', { storage, idb }).state).name).toBe('AutoBean');

    // pagehide SHOULD trigger save.
    for (const fn of windowListeners.get('pagehide') ?? []) {
      fn(new Event('pagehide'));
    }
    expect(onSave).toHaveBeenCalledTimes(2);

    // Detach removes all listeners.
    detach();
    expect(windowListeners.get('pagehide')?.size ?? 0).toBe(0);
    expect(docListeners.get('visibilitychange')?.size ?? 0).toBe(0);
  });
});
