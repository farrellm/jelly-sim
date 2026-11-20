import { describe, expect, it } from 'vitest';
import {
  applyOfflineCatchUp,
  createInitialState,
  dispatch,
  getActiveBean,
  tick,
} from '../../src/sim/engine';
import {
  BUILDING_CATALOG,
  collectStandIncome,
  getBuildingDefinition,
  getEmptyBuildTileIds,
  getHamburgerStandRatePerMin,
  getHouseUpgradeTier,
  grabFreeBurger,
  hasBuilding,
  placeBuilding,
  upgradeHouse,
  useToilet,
  VILLAGE_CONFIG,
} from '../../src/sim/village';
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

describe('PR-09 Dual Economy, Tile Building System, Toilet & Hamburger Stand', () => {
  it('exposes dual-currency building catalog with canonical Jelly Coin & Bean Buck costs', () => {
    const toilet = getBuildingDefinition('toilet');
    const stand = getBuildingDefinition('hamburger_stand');
    const space = getBuildingDefinition('quiet_space_corner');
    const college = getBuildingDefinition('jelly_college');

    expect(toilet).toMatchObject({ costJellyCoins: 60, costBeanBucks: 0, buildable: true });
    expect(stand).toMatchObject({ costJellyCoins: 140, costBeanBucks: 0, buildable: true });
    expect(space).toMatchObject({ costJellyCoins: 0, costBeanBucks: 14 });
    expect(college).toMatchObject({ costJellyCoins: 350, costBeanBucks: 20 });
    expect(BUILDING_CATALOG.length).toBeGreaterThanOrEqual(4);
  });

  it('requires 60 JC to place a Toilet on an empty Ring 0 pad and rejects invalid placements', () => {
    const base = createInitialState({ nowMs: 1_000, onboarded: true });
    // Starter coins (25 JC) is insufficient for 60 JC Toilet
    const tooPoor = placeBuilding(base, 'toilet', 'plot_pad_1', 2_000);
    expect(tooPoor.state).toBe(base);
    expect(tooPoor.events[0]).toMatchObject({
      type: 'ACTION_REJECTED',
      actionType: 'PLACE_BUILDING',
    });

    const funded = {
      ...base,
      currencies: { ...base.currencies, jellyCoins: 120 },
    };

    // Cannot build on occupied Starter House tile (plot_pad_0)
    const occupied = placeBuilding(funded, 'toilet', 'plot_pad_0', 2_000);
    expect(occupied.state).toBe(funded);
    expect(occupied.events[0]).toMatchObject({ type: 'ACTION_REJECTED' });

    // Valid placement on plot_pad_1
    const built = dispatch(
      funded,
      { type: 'PLACE_BUILDING', buildingType: 'toilet', tileId: 'plot_pad_1' },
      3_000,
    );
    expect(built.state.currencies.jellyCoins).toBe(60);
    expect(built.state.island.tiles.plot_pad_1?.building).toBe('toilet');
    expect(built.state.island.tiles.plot_pad_1?.buildingTier).toBe(1);
    expect(hasBuilding(built.state, 'toilet')).toBe(true);
    expect(getEmptyBuildTileIds(built.state)).not.toContain('plot_pad_1');
    expect(built.events).toContainEqual({
      type: 'BUILDING_PLACED',
      buildingType: 'toilet',
      tileId: 'plot_pad_1',
      coinsSpent: 60,
      bucksSpent: 0,
      xpGained: VILLAGE_CONFIG.buildXpReward,
    });

    // Duplicate Toilet exceeds maxCount (1)
    const duplicate = placeBuilding(built.state, 'toilet', 'plot_pad_2', 4_000);
    expect(duplicate.state).toBe(built.state);
    expect(duplicate.events[0]).toMatchObject({ type: 'ACTION_REJECTED' });
  });

  it('uses built Toilet to restore Hygiene to 100% and award +5 JC good-habit bonus', () => {
    const initial = createInitialState({ nowMs: 1_000, onboarded: true });

    // Rejects before Toilet is built
    const beforeBuild = useToilet(initial, undefined, 2_000);
    expect(beforeBuild.state).toBe(initial);
    expect(beforeBuild.events[0]).toMatchObject({ type: 'ACTION_REJECTED' });

    // Place Toilet and make bean dirty + slightly angry + sleeping
    const withCoins = {
      ...initial,
      currencies: { ...initial.currencies, jellyCoins: 60 },
      beans: initial.beans.map((b) => ({
        ...b,
        isSleeping: true,
        anger: 25,
        needs: { ...b.needs, hygiene: 18, mood: 60 },
      })),
    };
    const built = dispatch(
      withCoins,
      { type: 'PLACE_BUILDING', buildingType: 'toilet', tileId: 'plot_pad_2' },
      3_000,
    ).state;

    const afterToilet = dispatch(built, { type: 'USE_TOILET' }, 4_000);
    const bean = getActiveBean(afterToilet.state);

    expect(bean.needs.hygiene).toBe(100);
    expect(bean.isSleeping).toBe(false);
    expect(bean.anger).toBe(25 - VILLAGE_CONFIG.toiletAngerRelief);
    expect(afterToilet.state.currencies.jellyCoins).toBe(VILLAGE_CONFIG.toiletGoodHabitCoins);
    expect(afterToilet.events).toContainEqual({
      type: 'TOILET_USED',
      beanId: bean.id,
      tileId: 'plot_pad_2',
      xpGained: VILLAGE_CONFIG.toiletXp,
      coinsGained: VILLAGE_CONFIG.toiletGoodHabitCoins,
    });
  });

  it('opens Hamburger Stand for 140 JC, accrues passive Jelly Coins (boosted by Tomatoes & Parsley), and lets player collect', () => {
    const t0 = 1_700_000_000_000;
    const base = createInitialState({ nowMs: t0, onboarded: true });
    const funded = {
      ...base,
      currencies: { ...base.currencies, jellyCoins: 140 },
    };

    const opened = dispatch(
      funded,
      { type: 'PLACE_BUILDING', buildingType: 'hamburger_stand', tileId: 'plot_pad_3' },
      t0 + 1_000,
    );
    expect(opened.state.currencies.jellyCoins).toBe(0);
    expect(opened.state.island.tiles.plot_pad_3?.building).toBe('hamburger_stand');
    expect(getHamburgerStandRatePerMin(opened.state)).toBe(15);

    // Collecting immediately with 0 pending coins is rejected cleanly
    const earlyCollect = collectStandIncome(opened.state, 'plot_pad_3', t0 + 2_000);
    expect(earlyCollect.events[0]).toMatchObject({ type: 'ACTION_REJECTED' });

    // Simulate 2 minutes (120s) active play at base rate 15 JC/min -> +30 JC pending
    const afterTwoMin = tick(opened.state, 120, t0 + 121_000);
    expect(afterTwoMin.island.tiles.plot_pad_3?.pendingCoins).toBeCloseTo(30, 5);

    // Add Tomatoes & Parsley -> doubles passive rate to 30 JC/min!
    const boostedState = {
      ...afterTwoMin,
      inventory: { ...afterTwoMin.inventory, tomatoes: 2, parsley: 1 },
    };
    expect(getHamburgerStandRatePerMin(boostedState)).toBe(30);

    // Simulate 30 more seconds at 30 JC/min -> +15 JC (45 JC total)
    const afterBoost = tick(boostedState, 30, t0 + 151_000);
    expect(afterBoost.island.tiles.plot_pad_3?.pendingCoins).toBeCloseTo(45, 5);

    // Collect passive coins from stand
    const collected = dispatch(
      afterBoost,
      { type: 'COLLECT_STAND_INCOME', tileId: 'plot_pad_3' },
      t0 + 152_000,
    );
    expect(collected.state.currencies.jellyCoins).toBe(45);
    expect(collected.state.island.tiles.plot_pad_3?.pendingCoins).toBeCloseTo(0, 5);
    expect(collected.events).toContainEqual({
      type: 'STAND_INCOME_COLLECTED',
      tileId: 'plot_pad_3',
      coinsCollected: 45,
    });
  });

  it('accrues capped Hamburger Stand passive income during offline catch-up', () => {
    const t0 = 1_700_000_000_000;
    const funded = {
      ...createInitialState({ nowMs: t0, onboarded: true }),
      currencies: { jellyCoins: 140, beanBucks: 0, bonusBeans: 0 },
    };

    const opened = dispatch(
      funded,
      { type: 'PLACE_BUILDING', buildingType: 'hamburger_stand', tileId: 'plot_pad_4' },
      t0,
    ).state;

    // 10 minutes offline at 15 JC/min -> 150 JC pending & reported in OfflineCatchUpSummary
    const afterTenMin = applyOfflineCatchUp(opened, t0 + 10 * 60 * 1000);
    expect(afterTenMin.summary.coinsEarned).toBe(150);
    expect(afterTenMin.state.island.tiles.plot_pad_4?.pendingCoins).toBeCloseTo(150, 4);

    // 5 hours offline caps cleanly at VILLAGE_CONFIG.hamburgerStandMaxPendingCoins (600 JC)
    const afterFiveHours = applyOfflineCatchUp(opened, t0 + 5 * 3600 * 1000);
    expect(afterFiveHours.state.island.tiles.plot_pad_4?.pendingCoins).toBe(
      VILLAGE_CONFIG.hamburgerStandMaxPendingCoins,
    );
    expect(afterFiveHours.summary.coinsEarned).toBe(VILLAGE_CONFIG.hamburgerStandMaxPendingCoins);
  });

  it('lets the player grab a free burger (+80 Hunger) with a 60s cooldown that ticks down', () => {
    const t0 = 1_700_000_000_000;
    const hungry = {
      ...createInitialState({ nowMs: t0, onboarded: true }),
      currencies: { jellyCoins: 140, beanBucks: 0, bonusBeans: 0 },
    };
    const opened = dispatch(
      {
        ...hungry,
        beans: hungry.beans.map((b) => ({
          ...b,
          needs: { ...b.needs, hunger: 15 },
        })),
      },
      { type: 'PLACE_BUILDING', buildingType: 'hamburger_stand', tileId: 'plot_pad_5' },
      t0,
    ).state;

    const firstBurger = dispatch(
      opened,
      { type: 'GRAB_FREE_BURGER', tileId: 'plot_pad_5' },
      t0 + 1_000,
    );
    expect(getActiveBean(firstBurger.state).needs.hunger).toBe(95);
    expect(firstBurger.state.island.tiles.plot_pad_5?.burgerCooldownSec).toBe(
      VILLAGE_CONFIG.hamburgerStandBurgerCooldownSec,
    );
    expect(firstBurger.events).toContainEqual({
      type: 'BURGER_EATEN',
      beanId: 'bean-1',
      tileId: 'plot_pad_5',
      xpGained: VILLAGE_CONFIG.hamburgerStandBurgerXp,
    });

    // Immediate second burger rejected while grilling
    const duringCooldown = grabFreeBurger(firstBurger.state, 'plot_pad_5', undefined, t0 + 2_000);
    expect(duringCooldown.events[0]).toMatchObject({ type: 'ACTION_REJECTED' });

    // After 60 seconds, cooldown completes and another free burger can be grabbed
    const cooledDown = tick(firstBurger.state, 60, t0 + 61_000);
    expect(cooledDown.island.tiles.plot_pad_5?.burgerCooldownSec).toBe(0);
    const secondBurger = dispatch(
      cooledDown,
      { type: 'GRAB_FREE_BURGER', tileId: 'plot_pad_5' },
      t0 + 62_000,
    );
    expect(secondBurger.events.some((e) => e.type === 'BURGER_EATEN')).toBe(true);
  });

  it('upgrades Starter House from Tier 1 through Tier 4 and boosts Hearth Warmth', () => {
    let state = {
      ...createInitialState({ nowMs: 1_000, onboarded: true }),
      currencies: { jellyCoins: 1_000, beanBucks: 0, bonusBeans: 0 },
    };

    expect(getHouseUpgradeTier(1)?.costJellyCoins).toBe(120);

    const t2 = dispatch(state, { type: 'UPGRADE_HOUSE' }, 2_000);
    expect(t2.state.island.tiles.plot_pad_0?.buildingTier).toBe(2);
    expect(t2.state.currencies.jellyCoins).toBe(880);
    expect(t2.events).toContainEqual({
      type: 'HOUSE_UPGRADED',
      tileId: 'plot_pad_0',
      newTier: 2,
      coinsSpent: 120,
      xpGained: VILLAGE_CONFIG.houseUpgradeXpReward,
    });

    // Tier 2 hearth restores 40 + 15 = 55 warmth!
    const chilly = {
      ...t2.state,
      beans: t2.state.beans.map((b) => ({
        ...b,
        needs: { ...b.needs, warmth: 30 },
      })),
    };
    const warmed = dispatch(chilly, { type: 'WARM_BY_HEARTH' }, 3_000).state;
    expect(getActiveBean(warmed).needs.warmth).toBe(85);

    // Upgrade through Tier 3 and Tier 4, then reject Tier 5
    state = upgradeHouse(t2.state, undefined, 4_000).state;
    expect(state.island.tiles.plot_pad_0?.buildingTier).toBe(3);
    state = upgradeHouse(state, undefined, 5_000).state;
    expect(state.island.tiles.plot_pad_0?.buildingTier).toBe(4);
    const maxed = upgradeHouse(state, undefined, 6_000);
    expect(maxed.state).toBe(state);
    expect(maxed.events[0]).toMatchObject({ type: 'ACTION_REJECTED' });
  });

  it('persists placed buildings, tiers, pending stand coins, and burger cooldowns losslessly', () => {
    const storage = createMemoryStorage();
    let state = {
      ...createInitialState({ nowMs: 1_000, onboarded: true }),
      currencies: { jellyCoins: 250, beanBucks: 14, bonusBeans: 0 },
    };
    state = dispatch(
      state,
      { type: 'PLACE_BUILDING', buildingType: 'toilet', tileId: 'plot_pad_1' },
      2_000,
    ).state;
    state = dispatch(
      state,
      { type: 'PLACE_BUILDING', buildingType: 'hamburger_stand', tileId: 'plot_pad_3' },
      3_000,
    ).state;
    state = tick(state, 40, 43_000); // +10 JC pending

    saveState(state, { storage, idb: null });
    const reloaded = loadState('regular', { storage, idb: null });

    expect(reloaded.source).toBe('localStorage');
    expect(reloaded.state).toEqual(state);
    expect(reloaded.state.island.tiles.plot_pad_1?.building).toBe('toilet');
    expect(reloaded.state.island.tiles.plot_pad_3?.building).toBe('hamburger_stand');
    expect(reloaded.state.island.tiles.plot_pad_3?.pendingCoins).toBeCloseTo(10, 5);
    expect(reloaded.state.currencies.beanBucks).toBe(14);
  });
});
