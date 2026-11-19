import { describe, expect, it } from 'vitest';
import { getActiveBean } from '../../src/sim/engine';
import { GameStore } from '../../src/sim/store';
import type { StorageLike } from '../../src/storage/persistence';

function createMemoryStorage(): StorageLike {
  const map = new Map<string, string>();
  return {
    getItem: (key) => map.get(key) ?? null,
    setItem: (key, value) => {
      map.set(key, value);
    },
    removeItem: (key) => {
      map.delete(key);
    },
  };
}

describe('GameStore', () => {
  it('pauses need decay before onboarding and persists bean name, stats, and level across reload', () => {
    const storage = createMemoryStorage();
    let now = 1_700_000_000_000;

    const storeA = new GameStore({
      persistence: { storage, idb: null },
      now: () => now,
    });

    expect(storeA.getState().onboarded).toBe(false);
    const initialHunger = getActiveBean(storeA.getState()).needs.hunger;

    // Ticking before onboarding should not decay needs
    storeA.step(1.0);
    expect(getActiveBean(storeA.getState()).needs.hunger).toBe(initialHunger);

    // Complete onboarding with custom name & parent title
    storeA.dispatch({
      type: 'COMPLETE_ONBOARDING',
      beanName: 'Sir Squish',
      parentTitle: 'Papa',
    });

    expect(storeA.getState().onboarded).toBe(true);
    expect(storeA.getState().parentTitle).toBe('Papa');
    expect(getActiveBean(storeA.getState()).name).toBe('Sir Squish');

    // Decay a bit, then feed 4 apples to level up (4 * 15 = 60 XP >= 52 XP for Lv 1 -> Lv 2)
    storeA.step(1.0);
    const hungerAfterDecay = getActiveBean(storeA.getState()).needs.hunger;
    expect(hungerAfterDecay).toBeLessThan(initialHunger);

    storeA.dispatch({ type: 'FEED_APPLE' });
    const hungerAfterFeed = getActiveBean(storeA.getState()).needs.hunger;
    expect(hungerAfterFeed).toBeGreaterThan(hungerAfterDecay);

    storeA.dispatch({ type: 'FEED_APPLE' });
    storeA.dispatch({ type: 'FEED_APPLE' });
    storeA.dispatch({ type: 'FEED_APPLE' });

    const beforeReloadBean = getActiveBean(storeA.getState());
    expect(beforeReloadBean.level).toBe(2);
    expect(storeA.getState().inventory.apples).toBe(1);

    // Simulate browser reload with a brand-new GameStore pointed at the same storage
    now += 2_000;
    const storeB = new GameStore({
      persistence: { storage, idb: null },
      now: () => now,
    });

    const restoredBean = getActiveBean(storeB.getState());
    expect(storeB.getState().onboarded).toBe(true);
    expect(storeB.getState().parentTitle).toBe('Papa');
    expect(restoredBean.name).toBe('Sir Squish');
    expect(restoredBean.level).toBe(beforeReloadBean.level);
    expect(restoredBean.xp).toBe(beforeReloadBean.xp);
    expect(storeB.getState().inventory.apples).toBe(1);
    expect(storeB.getState().currencies.jellyCoins).toBe(storeA.getState().currencies.jellyCoins);
  });

  it('restores sleep and produces an offline welcome-back summary after background return', () => {
    const storage = createMemoryStorage();
    let now = 1_700_000_000_000;

    const store = new GameStore({
      persistence: { storage, idb: null },
      now: () => now,
    });

    store.dispatch({
      type: 'COMPLETE_ONBOARDING',
      beanName: 'Pip',
      parentTitle: 'Captain',
    });
    store.dispatch({ type: 'TOGGLE_SLEEP', sleeping: true });
    expect(getActiveBean(store.getState()).isSleeping).toBe(true);

    // Simulate returning after 10 minutes
    now += 10 * 60 * 1000;
    const summary = store.resumeFromBackground(now);

    expect(summary).not.toBeNull();
    expect(summary?.sleptRestored).toBe(true);
    expect(store.getLastOfflineSummary()?.cappedSeconds).toBe(600);
    expect(getActiveBean(store.getState()).needs.sleep).toBe(100);

    store.dismissOfflineSummary();
    expect(store.getLastOfflineSummary()).toBeNull();
  });
});
