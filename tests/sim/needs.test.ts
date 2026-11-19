import { describe, expect, it } from 'vitest';
import {
  CARE_ACTIONS,
  MODE_NEED_RATES,
  stageForLevel,
  xpForLevel,
} from '../../src/sim/constants';
import { awardBeanXp, createInitialState, dispatch, getActiveBean, tick } from '../../src/sim/engine';
import { getBeanSpeechCue, isBeanAngry, isMegaTantrum } from '../../src/sim/needs';
import { SeededRng, nextInt, nextRandom } from '../../src/sim/rng';

describe('PR-05 pure-TS needs & care simulation', () => {
  it('completes onboarding with sanitized bean name and parent title without mutating prior state', () => {
    const initial = createInitialState({ nowMs: 1_000 });
    expect(initial.onboarded).toBe(false);

    const { state, events } = dispatch(
      initial,
      {
        type: 'COMPLETE_ONBOARDING',
        beanName: '  Sir   Squishy  ',
        parentTitle: '  Papa ',
      },
      2_000,
    );

    expect(initial.onboarded).toBe(false);
    expect(getActiveBean(initial).name).toBe('Jelly Bean');

    expect(state.onboarded).toBe(true);
    expect(state.parentTitle).toBe('Papa');
    expect(getActiveBean(state).name).toBe('Sir Squishy');
    expect(state.lastTickMs).toBe(2_000);
    expect(events).toContainEqual({
      type: 'ONBOARDING_COMPLETED',
      beanName: 'Sir Squishy',
      parentTitle: 'Papa',
    });
  });

  it('feeds an Apple to restore Hunger, consume inventory, and grant XP + Jelly Coins', () => {
    const base = createInitialState({ nowMs: 10_000 });
    const hungryState = {
      ...base,
      beans: base.beans.map((b) => ({
        ...b,
        needs: { ...b.needs, hunger: 40, mood: 60 },
        anger: 20,
      })),
    };

    const { state, events } = dispatch(hungryState, { type: 'FEED_APPLE' }, 11_000);
    const bean = getActiveBean(state);

    expect(state.inventory.apples).toBe(base.inventory.apples - 1);
    expect(bean.needs.hunger).toBe(40 + CARE_ACTIONS.appleHungerRestore);
    expect(bean.needs.mood).toBe(60 + CARE_ACTIONS.appleMoodBonus);
    expect(bean.anger).toBe(20 - CARE_ACTIONS.appleAngerRelief);
    expect(bean.xp).toBe(CARE_ACTIONS.appleFeedXp);
    expect(state.currencies.jellyCoins).toBe(
      base.currencies.jellyCoins + CARE_ACTIONS.appleFeedCoins,
    );
    expect(events).toContainEqual({
      type: 'FED_APPLE',
      beanId: bean.id,
      xpGained: CARE_ACTIONS.appleFeedXp,
      coinsGained: CARE_ACTIONS.appleFeedCoins,
    });
  });

  it('rejects feeding when out of apples and allows buying apples with Jelly Coins', () => {
    const base = createInitialState({ nowMs: 10_000 });
    const emptyPantry = {
      ...base,
      inventory: { ...base.inventory, apples: 0 },
    };

    const rejected = dispatch(emptyPantry, { type: 'FEED_APPLE' });
    expect(rejected.state.inventory.apples).toBe(0);
    expect(rejected.events).toContainEqual({
      type: 'ACTION_REJECTED',
      actionType: 'FEED_APPLE',
      reason: 'No apples in inventory',
    });

    const bought = dispatch(emptyPantry, { type: 'BUY_APPLE', quantity: 3 });
    expect(bought.state.inventory.apples).toBe(3);
    expect(bought.state.currencies.jellyCoins).toBe(
      base.currencies.jellyCoins - 3 * CARE_ACTIONS.appleShopCost,
    );
  });

  it('restores Sleep at +25 per 10 seconds during active nap and wakes automatically at 100', () => {
    const base = createInitialState({ nowMs: 1_000 });
    const sleepy = {
      ...base,
      beans: base.beans.map((b) => ({
        ...b,
        needs: { ...b.needs, sleep: 60 },
      })),
    };

    const tucked = dispatch(sleepy, { type: 'TOGGLE_SLEEP', sleeping: true }, 1_000).state;
    expect(getActiveBean(tucked).isSleeping).toBe(true);

    // 10 seconds of active sleep restores +25 (60 -> 85) and keeps sleeping.
    const after10s = tick(tucked, 10);
    expect(getActiveBean(after10s).needs.sleep).toBeCloseTo(85, 5);
    expect(getActiveBean(after10s).isSleeping).toBe(true);

    // Next 10 seconds caps at 100 and wakes up automatically.
    const after20s = tick(after10s, 10);
    expect(getActiveBean(after20s).needs.sleep).toBe(100);
    expect(getActiveBean(after20s).isSleeping).toBe(false);
  });

  it('decays Regular Mode needs at exact DESIGN.md rates and never drops below cozy floor 10', () => {
    const start = createInitialState({ nowMs: 0 });
    const full = {
      ...start,
      beans: start.beans.map((b) => ({
        ...b,
        needs: { hunger: 100, warmth: 100, sleep: 100, hygiene: 100, mood: 100 },
      })),
    };

    const after1Min = tick(full, 60);
    const b1 = getActiveBean(after1Min);
    expect(b1.needs.hunger).toBeCloseTo(100 - MODE_NEED_RATES.regular.hungerPerMin, 5);
    expect(b1.needs.warmth).toBeCloseTo(100 - MODE_NEED_RATES.regular.warmthPerMin, 5);
    expect(b1.needs.sleep).toBeCloseTo(100 - MODE_NEED_RATES.regular.sleepPerMin, 5);
    expect(b1.needs.hygiene).toBeCloseTo(100 - MODE_NEED_RATES.regular.hygienePerMin, 5);

    // Even after 10 hours of active ticking, Regular Mode floors every need at 10.
    let current = full;
    for (let i = 0; i < 600; i += 1) {
      current = tick(current, 60);
    }
    const longBean = getActiveBean(current);
    expect(longBean.needs.hunger).toBe(10);
    expect(longBean.needs.warmth).toBe(10);
    expect(longBean.needs.sleep).toBe(10);
    expect(longBean.needs.hygiene).toBe(10);
    expect(longBean.needs.mood).toBe(10);
    expect(isBeanAngry(longBean)).toBe(true);
  });

  it('applies Chilly Wind cold drain and 90% blanket resistance when Knitted Blanket is equipped', () => {
    const base = createInitialState({ nowMs: 0 });
    const chillyState = {
      ...base,
      weather: { ...base.weather, current: 'chilly_wind' as const },
      inventory: { ...base.inventory, blankets: 1 },
      beans: base.beans.map((b) => ({
        ...b,
        needs: { ...b.needs, warmth: 50 },
      })),
    };

    // Without blanket: loses 3.5 warmth/min in Chilly Wind.
    const unblanketed = tick(chillyState, 60);
    expect(getActiveBean(unblanketed).needs.warmth).toBeCloseTo(
      50 - MODE_NEED_RATES.regular.warmthColdPerMin,
      5,
    );

    // With blanket: restores warmth to 100 and reduces cold decay by 90%.
    const blanketed = dispatch(chillyState, { type: 'USE_BLANKET' }).state;
    expect(blanketed.inventory.blankets).toBe(0);
    expect(getActiveBean(blanketed).needs.warmth).toBe(100);

    const after1MinBlanket = tick(blanketed, 60);
    expect(getActiveBean(after1MinBlanket).needs.warmth).toBeCloseTo(
      100 - MODE_NEED_RATES.regular.warmthColdPerMin * 0.1,
      5,
    );
  });

  it('enforces Baby Mode 2x decay, floor 0, and Mega Tantrum when neglected', () => {
    const baby = createInitialState({ mode: 'baby', slotId: 'baby', nowMs: 0 });
    const fullBaby = {
      ...baby,
      beans: baby.beans.map((b) => ({
        ...b,
        needs: { hunger: 100, warmth: 100, sleep: 100, hygiene: 100, mood: 100 },
      })),
    };

    const after1Min = tick(fullBaby, 60);
    const b1 = getActiveBean(after1Min);
    expect(b1.needs.hunger).toBeCloseTo(100 - MODE_NEED_RATES.baby.hungerPerMin, 5);
    expect(b1.needs.mood).toBeLessThan(100 - 1.5); // decays even when well-fed

    let neglected = fullBaby;
    for (let i = 0; i < 120; i += 1) {
      neglected = tick(neglected, 60);
    }
    const tantrumBean = getActiveBean(neglected);
    expect(tantrumBean.needs.hunger).toBe(0);
    expect(tantrumBean.anger).toBe(100);
    expect(isMegaTantrum(tantrumBean, 'baby')).toBe(true);
  });

  it('produces canonical transcript speech cues for low hunger, cold, and sleep', () => {
    const base = createInitialState({ parentTitle: 'Papa' });
    const bean = getActiveBean(base);

    expect(getBeanSpeechCue(bean, 'Papa')).toBeNull();

    expect(
      getBeanSpeechCue({ ...bean, needs: { ...bean.needs, hunger: 25 } }, 'Papa'),
    ).toEqual({
      cue: 'hungry',
      message: 'Jelly Bean hungry!',
    });

    expect(
      getBeanSpeechCue({ ...bean, needs: { ...bean.needs, hunger: 12 } }, 'Papa'),
    ).toEqual({
      cue: 'hungry',
      message: 'Papa! Feed me!',
    });

    expect(
      getBeanSpeechCue({ ...bean, needs: { ...bean.needs, warmth: 20 } }, 'Papa'),
    ).toEqual({
      cue: 'cold',
      message: 'Jelly Bean cold. Papa help.',
    });

    expect(
      getBeanSpeechCue({ ...bean, needs: { ...bean.needs, sleep: 18 } }, 'Papa'),
    ).toEqual({
      cue: 'sleepy',
      message: "I'm so sleepy. Jellybean, sleep, sleep.",
    });
  });

  it('supports leveling and 5-stage evolution smoothly up through Level 1497+', () => {
    const base = createInitialState();
    const bean = getActiveBean(base);

    expect(xpForLevel(1)).toBe(52);
    expect(stageForLevel(1)).toBe('larva');
    expect(stageForLevel(10)).toBe('sprout');
    expect(stageForLevel(30)).toBe('scholar');
    expect(stageForLevel(60)).toBe('career');
    expect(stageForLevel(150)).toBe('legend');
    expect(stageForLevel(1497)).toBe('legend');

    // Feed enough XP to evolve from Larva (Lv 1) to Sprout (Lv 10).
    let totalNeeded = 0;
    for (let lv = 1; lv < 10; lv += 1) {
      totalNeeded += xpForLevel(lv);
    }
    const evolved = awardBeanXp(bean, totalNeeded);
    expect(evolved.leveledUp).toBe(true);
    expect(evolved.newLevel).toBe(10);
    expect(evolved.newStage).toBe('sprout');
    expect(evolved.bean.xp).toBe(0);
  });

  it('produces reproducible deterministic sequences from the Mulberry32 PRNG', () => {
    const rngA = new SeededRng(123456);
    const rngB = new SeededRng(123456);

    const seqA = Array.from({ length: 10 }, () => rngA.next());
    const seqB = Array.from({ length: 10 }, () => rngB.next());
    expect(seqA).toEqual(seqB);

    for (const v of seqA) {
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }

    const step1 = nextRandom(42);
    const step2 = nextRandom(42);
    expect(step1).toEqual(step2);

    const roll = nextInt(step1.nextState, 3, 12);
    expect(roll.value).toBeGreaterThanOrEqual(3);
    expect(roll.value).toBeLessThanOrEqual(12);
  });

  it('supports sponge bath, hearth warming, petting, and settings updates cleanly', () => {
    const base = createInitialState({ nowMs: 1_000 });
    const needy = {
      ...base,
      beans: base.beans.map((b) => ({
        ...b,
        anger: 25,
        needs: { hunger: 70, warmth: 35, sleep: 70, hygiene: 30, mood: 45 },
      })),
    };

    const bathed = dispatch(needy, { type: 'SPONGE_BATH' }, 2_000);
    expect(getActiveBean(bathed.state).needs.hygiene).toBe(
      30 + CARE_ACTIONS.spongeBathHygieneRestore,
    );
    expect(bathed.state.currencies.jellyCoins).toBe(
      needy.currencies.jellyCoins + CARE_ACTIONS.spongeBathCoins,
    );

    const warmed = dispatch(bathed.state, { type: 'WARM_BY_HEARTH' }, 3_000);
    expect(getActiveBean(warmed.state).needs.warmth).toBe(
      35 + CARE_ACTIONS.hearthWarmthRestore,
    );

    const petted = dispatch(warmed.state, { type: 'PET_BEAN' }, 4_000);
    expect(getActiveBean(petted.state).needs.mood).toBe(45 + CARE_ACTIONS.petMoodRestore);
    expect(getActiveBean(petted.state).anger).toBe(25 - CARE_ACTIONS.petAngerRelief);

    const updated = dispatch(
      petted.state,
      { type: 'UPDATE_SETTINGS', settings: { lowPowerMode: true, soundEnabled: false } },
      5_000,
    );
    expect(updated.state.settings.lowPowerMode).toBe(true);
    expect(updated.state.settings.soundEnabled).toBe(false);
    expect(updated.state.settings.screenTimeReminder).toBe(true);
  });
});
