import { describe, expect, it } from 'vitest';
import { createInitialState, dispatch, getActiveBean, tick } from '../../src/sim/engine';
import type { GameState } from '../../src/sim/types';
import {
  MAIN_QUESTS,
  claimQuestReward,
  getActiveMainQuestView,
  getActiveRadiantTaskView,
  getReadyToClaimQuest,
} from '../../src/sim/quests';
import { loadState, saveState, type StorageLike } from '../../src/storage/persistence';

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

describe('PR-10 Dr. Bubblegum Door-Knock Event & Quest System', () => {
  it('registers all 15 canonical Main Quests in order with JC, BB, and XP rewards', () => {
    expect(MAIN_QUESTS).toHaveLength(15);
    expect(MAIN_QUESTS.map((q) => q.number)).toEqual([
      1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15,
    ]);
    expect(MAIN_QUESTS[0]?.id).toBe('q1_welcome');
    expect(MAIN_QUESTS[2]?.id).toBe('q3_toilet');
    expect(MAIN_QUESTS[6]?.id).toBe('q7_burger_tycoon');
    expect(MAIN_QUESTS[14]?.id).toBe('q15_road_to_1497');

    for (const quest of MAIN_QUESTS) {
      expect(quest.reward.jellyCoins).toBeGreaterThan(0);
      expect(quest.reward.beanBucks).toBeGreaterThan(0);
      expect(quest.reward.xp).toBeGreaterThan(0);
    }
  });

  it('starts a new save with Dr. Bubblegum at the door and triggers welcome & starter-plot gift upon onboarding', () => {
    const fresh = createInitialState({ nowMs: 1_000 });
    expect(fresh.quests.activeQuestId).toBe('q1_welcome');
    expect(fresh.quests.drBubblegumAtDoor).toBe(true);
    expect(getActiveMainQuestView(fresh)?.progress.completed).toBe(false);

    // Completing onboarding satisfies q1_welcome and triggers Dr. Bubblegum's welcome knock
    const onboarded = dispatch(
      fresh,
      { type: 'COMPLETE_ONBOARDING', beanName: 'Mochi', parentTitle: 'Papa' },
      2_000,
    );
    expect(onboarded.state.quests.drBubblegumAtDoor).toBe(true);
    expect(onboarded.events).toContainEqual({
      type: 'DR_BUBBLEGUM_KNOCKED',
      questId: 'q1_welcome',
      questTitle: 'Welcome to Your Plot',
      reason: 'welcome',
    });

    const welcomeView = getActiveMainQuestView(onboarded.state);
    expect(welcomeView?.progress.completed).toBe(true);
    expect(welcomeView?.sternDialogue).toContain('Mochi');
    expect(welcomeView?.warmDialogue).toContain('Papa');

    // Claiming q1_welcome awards JC, BB, XP, advances to q2_survive, and steps Dr. Bubblegum away
    const claimed = dispatch(
      onboarded.state,
      { type: 'CLAIM_QUEST_REWARD', questId: 'q1_welcome' },
      3_000,
    );
    expect(claimed.state.quests.completedIds).toEqual(['q1_welcome']);
    expect(claimed.state.quests.activeQuestId).toBe('q2_survive');
    expect(claimed.state.quests.drBubblegumAtDoor).toBe(false);
    expect(claimed.state.currencies.jellyCoins).toBe(fresh.currencies.jellyCoins + 35);
    expect(claimed.state.currencies.beanBucks).toBe(2);
    expect(claimed.events).toContainEqual({
      type: 'QUEST_COMPLETED',
      questId: 'q1_welcome',
      questTitle: 'Welcome to Your Plot',
      coinsGained: 35,
      bucksGained: 2,
      xpGained: 15,
      nextQuestId: 'q2_survive',
    });
  });

  it('tracks q2_survive (feed + sleep) and q3_toilet (build Toilet), knocking on the door on completion', () => {
    let state = createInitialState({ nowMs: 1_000 });
    state = dispatch(
      state,
      { type: 'COMPLETE_ONBOARDING', beanName: 'Pip', parentTitle: 'Mama' },
      2_000,
    ).state;
    state = dispatch(state, { type: 'CLAIM_QUEST_REWARD', questId: 'q1_welcome' }, 3_000).state;

    // Cannot claim q2_survive early
    const earlyClaim = claimQuestReward(state, 'q2_survive', 3_500);
    expect(earlyClaim.events[0]).toMatchObject({ type: 'ACTION_REJECTED' });

    // Feed an apple -> 1/2 progress, not yet knocking
    const afterFeed = dispatch(state, { type: 'FEED_APPLE' }, 4_000);
    expect(afterFeed.state.quests.counters.applesFed).toBe(1);
    expect(getActiveMainQuestView(afterFeed.state)?.progress).toEqual({
      current: 1,
      target: 2,
      completed: false,
    });
    expect(afterFeed.state.quests.drBubblegumAtDoor).toBe(false);

    // Tuck into bed -> 2/2 progress! Dr. Bubblegum knocks at the door!
    const afterSleep = dispatch(
      afterFeed.state,
      { type: 'TOGGLE_SLEEP', sleeping: true },
      5_000,
    );
    expect(afterSleep.state.quests.counters.timesSlept).toBe(1);
    expect(afterSleep.state.quests.drBubblegumAtDoor).toBe(true);
    expect(afterSleep.events).toContainEqual({
      type: 'DR_BUBBLEGUM_KNOCKED',
      questId: 'q2_survive',
      questTitle: 'Survive First!',
      reason: 'quest_ready',
    });

    // Claim q2_survive -> awards +45 JC, +3 BB, advances to q3_toilet
    const claimedQ2 = dispatch(afterSleep.state, { type: 'CLAIM_QUEST_REWARD' }, 6_000);
    expect(claimedQ2.state.quests.activeQuestId).toBe('q3_toilet');
    expect(claimedQ2.state.currencies.beanBucks).toBe(5);
    expect(claimedQ2.state.currencies.jellyCoins).toBeGreaterThanOrEqual(60);

    // Build Toilet -> completes q3_toilet and summons Dr. Bubblegum with a knock!
    const builtToilet = dispatch(
      claimedQ2.state,
      { type: 'PLACE_BUILDING', buildingType: 'toilet', tileId: 'plot_pad_2' },
      7_000,
    );
    expect(builtToilet.state.quests.drBubblegumAtDoor).toBe(true);
    expect(builtToilet.events).toContainEqual({
      type: 'DR_BUBBLEGUM_KNOCKED',
      questId: 'q3_toilet',
      questTitle: 'A Proper Bathroom',
      reason: 'quest_ready',
    });

    const claimedQ3 = dispatch(builtToilet.state, { type: 'CLAIM_QUEST_REWARD' }, 8_000);
    expect(claimedQ3.state.quests.completedIds).toContain('q3_toilet');
    expect(claimedQ3.state.quests.activeQuestId).toBe('q4_green_thumb');
    expect(claimedQ3.state.currencies.beanBucks).toBe(9);
  });

  it('evaluates all mid-to-late main quests (Q4–Q15) and transitions into infinite radiant tasks after Q15', () => {
    const base = createInitialState({ nowMs: 1_000, onboarded: true });
    // Construct a maxed-out legend state satisfying Q1..Q15
    const legendState = {
      ...base,
      currencies: { jellyCoins: 5000, beanBucks: 100, bonusBeans: 1 },
      island: {
        ...base.island,
        unlockedRing: 3 as const,
        tiles: {
          ...base.island.tiles,
          plot_pad_1: { ...base.island.tiles.plot_pad_1!, building: 'toilet' as const, buildingTier: 1 },
          plot_pad_2: { ...base.island.tiles.plot_pad_2!, building: 'hamburger_stand' as const, buildingTier: 1 },
          plot_pad_3: { ...base.island.tiles.plot_pad_3!, building: 'jelly_college' as const, buildingTier: 1 },
        },
      },
      inventory: {
        ...base.inventory,
        parsley: 2,
        tomatoes: 2,
        candyCanes: 1,
        feathers: 5,
        blankets: 1,
        swords: [{ id: 'sw-1', tier: 'candy_steel', attackBonus: 25, craftedAtMs: 1_000 }],
      },
      unlocks: {
        kitchenSkills: true,
        timeZoneDial: true,
        vikingPack: true,
        flavors: ['classic_cherry', 'very_berry', 'sour_lime', 'buttered_popcorn', 'watermelon_swirl'],
        trophies: ['candy_castle'],
      },
      beans: [
        {
          ...getActiveBean(base),
          level: 1497,
          stage: 'legend' as const,
          trade: 'blacksmith',
          hobby: 'swordsmith',
        },
        {
          ...getActiveBean(base),
          id: 'bean-2',
          name: 'Sproutling',
          level: 12,
          stage: 'sprout' as const,
        },
      ],
      quests: {
        ...base.quests,
        counters: {
          ...base.quests.counters,
          applesFed: 5,
          timesSlept: 2,
          hundredBeansHarvested: 1,
          bonusBeansRedeemed: 1,
          witchDefeatedCount: 1,
        },
      },
    };

    // Every single one of the 15 Main Quests evaluates as completed!
    for (const quest of MAIN_QUESTS) {
      expect(quest.evaluate(legendState).completed, `expected ${quest.id} completed`).toBe(true);
    }

    // Claiming all 15 main quests sequentially rolls the first infinite radiant task automatically!
    let current: GameState = legendState;
    for (const quest of MAIN_QUESTS) {
      const res = dispatch(current, { type: 'CLAIM_QUEST_REWARD', questId: quest.id }, 5_000);
      expect(res.events.some((e) => e.type === 'QUEST_COMPLETED' && e.questId === quest.id)).toBe(
        true,
      );
      current = res.state;
    }

    expect(current.quests.completedIds).toHaveLength(15);
    expect(current.quests.activeQuestId).toBeNull();
    expect(current.quests.activeRadiantTask).not.toBeNull();
    expect(current.quests.drBubblegumAtDoor).toBe(false);
    expect(getActiveRadiantTaskView(current)?.kind).toBe('radiant');
  });

  it('supports infinite radiant bonus tasks with deterministic PRNG, completion knocks, and persistence', () => {
    const storage = createMemoryStorage();
    let state = createInitialState({ nowMs: 1_000, seed: 42 });
    state = dispatch(
      state,
      { type: 'COMPLETE_ONBOARDING', beanName: 'Nori', parentTitle: 'Captain' },
      2_000,
    ).state;
    state = dispatch(state, { type: 'CLAIM_QUEST_REWARD', questId: 'q1_welcome' }, 3_000).state;

    // Request a Professor's Bonus Radiant Task
    const assigned = dispatch(state, { type: 'REQUEST_RADIANT_TASK' }, 4_000);
    expect(assigned.state.quests.activeRadiantTask).not.toBeNull();
    expect(assigned.events).toContainEqual(
      expect.objectContaining({ type: 'RADIANT_TASK_ASSIGNED' }),
    );

    // Reject duplicate request while one is already active
    const dup = dispatch(assigned.state, { type: 'REQUEST_RADIANT_TASK' }, 4_500);
    expect(dup.events[0]).toMatchObject({ type: 'ACTION_REJECTED' });

    const task = assigned.state.quests.activeRadiantTask!;
    let progressed = assigned.state;

    // Perform the action required by whichever radiant template rolled
    if (task.templateId === 'radiant_feed_apples') {
      for (let i = 0; i < task.targetDelta; i += 1) {
        progressed = dispatch(progressed, { type: 'FEED_APPLE' }, 5_000 + i * 100).state;
      }
    } else if (task.templateId === 'radiant_pet_bean') {
      for (let i = 0; i < task.targetDelta; i += 1) {
        progressed = dispatch(progressed, { type: 'PET_BEAN' }, 5_000 + i * 100).state;
      }
    } else if (task.templateId === 'radiant_nap_time') {
      progressed = dispatch(progressed, { type: 'TOGGLE_SLEEP', sleeping: true }, 5_000).state;
    }

    expect(progressed.quests.drBubblegumAtDoor).toBe(true);
    expect(getReadyToClaimQuest(progressed)?.id).toBe(task.id);

    // Persist mid-progress & verify lossless reload
    saveState(progressed, { storage, idb: null });
    const reloaded = loadState('regular', { storage, idb: null });
    expect(reloaded.state).toEqual(progressed);

    // Claim the radiant task reward
    const bucksBefore = reloaded.state.currencies.beanBucks;
    const coinsBefore = reloaded.state.currencies.jellyCoins;
    const claimed = dispatch(
      reloaded.state,
      { type: 'CLAIM_QUEST_REWARD', questId: task.id },
      6_000,
    );
    expect(claimed.state.quests.radiantCompletedCount).toBe(1);
    expect(claimed.state.currencies.jellyCoins).toBe(coinsBefore + task.rewardJellyCoins);
    expect(claimed.state.currencies.beanBucks).toBe(bucksBefore + task.rewardBeanBucks);

    // Passive tick keeps door state coherent
    const afterTick = tick(claimed.state, 1, 7_000);
    expect(afterTick.quests.radiantCompletedCount).toBe(1);
  });
});
