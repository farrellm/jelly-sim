import { describe, expect, it } from 'vitest';
import { MAX_OFFLINE_SECONDS, REGULAR_OFFLINE_ANGER_CAP } from '../../src/sim/constants';
import { applyOfflineCatchUp, createInitialState, dispatch, getActiveBean } from '../../src/sim/engine';
import { isMegaTantrum } from '../../src/sim/needs';

describe('PR-05 offline elapsed-time catch-up', () => {
  it('decays needs cleanly over a short offline gap without adding to sessionPlaySeconds', () => {
    const t0 = 1_700_000_000_000;
    const state = createInitialState({ nowMs: t0 });
    const thirtyMinMs = 30 * 60 * 1000;

    const { state: resumed, summary } = applyOfflineCatchUp(state, t0 + thirtyMinMs);
    const beforeBean = getActiveBean(state);
    const afterBean = getActiveBean(resumed);

    expect(summary.elapsedSeconds).toBe(1800);
    expect(summary.cappedSeconds).toBe(1800);
    expect(summary.wasCapped).toBe(false);
    expect(resumed.lastTickMs).toBe(t0 + thirtyMinMs);
    expect(resumed.sessionPlaySeconds).toBe(0);

    // 30 min of hunger decay at 2.2/min = 66; 75 - 66 = 9 -> floored at 10 in Regular Mode!
    expect(afterBean.needs.hunger).toBe(10);
    expect(afterBean.needs.sleep).toBeCloseTo(beforeBean.needs.sleep - 30 * 1.5, 4);
  });

  it('caps offline catch-up at 12 hours and keeps Regular Mode Jelly Bean alive at floor 10', () => {
    const t0 = 1_700_000_000_000;
    const initial = createInitialState({ nowMs: t0 });

    const twelveHoursMs = MAX_OFFLINE_SECONDS * 1000;
    const sevenDaysMs = 7 * 24 * 3600 * 1000;

    const at12h = applyOfflineCatchUp(initial, t0 + twelveHoursMs);
    const at7d = applyOfflineCatchUp(initial, t0 + sevenDaysMs);

    expect(at12h.summary.wasCapped).toBe(false);
    expect(at12h.summary.cappedSeconds).toBe(MAX_OFFLINE_SECONDS);

    expect(at7d.summary.wasCapped).toBe(true);
    expect(at7d.summary.cappedSeconds).toBe(MAX_OFFLINE_SECONDS);
    expect(at7d.summary.elapsedSeconds).toBe(7 * 24 * 3600);

    const bean12h = getActiveBean(at12h.state);
    const bean7d = getActiveBean(at7d.state);

    // Both produce identical surviving bean stats, floored safely at 10 (never dies!).
    expect(bean7d.needs).toEqual(bean12h.needs);
    expect(bean7d.needs.hunger).toBe(10);
    expect(bean7d.needs.warmth).toBe(10);
    expect(bean7d.needs.sleep).toBe(10);
    expect(bean7d.needs.hygiene).toBe(10);
    expect(bean7d.needs.mood).toBe(10);
    expect(bean7d.anger).toBe(REGULAR_OFFLINE_ANGER_CAP);
    expect(at7d.state.lastTickMs).toBe(t0 + sevenDaysMs);
  });

  it('floors Baby Mode needs at 0 and triggers Mega Tantrum after prolonged offline neglect', () => {
    const t0 = 1_700_000_000_000;
    const baby = createInitialState({ mode: 'baby', slotId: 'baby', nowMs: t0 });

    const { state } = applyOfflineCatchUp(baby, t0 + 6 * 3600 * 1000);
    const bean = getActiveBean(state);

    expect(bean.needs.hunger).toBe(0);
    expect(bean.needs.sleep).toBe(0);
    expect(bean.needs.hygiene).toBe(0);
    expect(bean.anger).toBe(100);
    expect(isMegaTantrum(bean, 'baby')).toBe(true);
  });

  it('fully restores Sleep during offline rest when the Jelly Bean was tucked into bed', () => {
    const t0 = 1_700_000_000_000;
    const initial = createInitialState({ nowMs: t0 });
    const tired = {
      ...initial,
      beans: initial.beans.map((b) => ({
        ...b,
        needs: { ...b.needs, sleep: 15 },
      })),
    };
    const sleeping = dispatch(tired, { type: 'TOGGLE_SLEEP', sleeping: true }, t0).state;

    const { state: morning, summary } = applyOfflineCatchUp(sleeping, t0 + 8 * 3600 * 1000);
    const bean = getActiveBean(morning);

    expect(summary.sleptRestored).toBe(true);
    expect(bean.needs.sleep).toBe(100);
    expect(bean.isSleeping).toBe(false);
  });

  it('auto-cooks meals during offline catch-up when Kitchen Skills are unlocked', () => {
    const t0 = 1_700_000_000_000;
    const initial = createInitialState({ nowMs: t0 });
    const selfSufficient = {
      ...initial,
      unlocks: { ...initial.unlocks, kitchenSkills: true },
      inventory: { ...initial.inventory, apples: 5, tomatoes: 3 },
    };

    const { state: resumed, summary } = applyOfflineCatchUp(selfSufficient, t0 + 2 * 3600 * 1000);
    const bean = getActiveBean(resumed);

    expect(summary.autoCookedMeals).toBeGreaterThan(0);
    expect(bean.needs.hunger).toBeGreaterThanOrEqual(45);
    expect(resumed.inventory.tomatoes).toBeLessThan(3);
  });

  it('handles backward clock skew safely as a no-op', () => {
    const t0 = 1_700_000_000_000;
    const initial = createInitialState({ nowMs: t0 });

    const { state, summary } = applyOfflineCatchUp(initial, t0 - 60_000);
    expect(summary.elapsedSeconds).toBe(0);
    expect(summary.cappedSeconds).toBe(0);
    expect(state.lastTickMs).toBe(t0);
    expect(getActiveBean(state).needs).toEqual(getActiveBean(initial).needs);
  });
});
