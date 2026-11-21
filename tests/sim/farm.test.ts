import { describe, expect, it } from 'vitest';
import {
  applyOfflineCatchUp,
  createInitialState,
  dispatch,
  getActiveBean,
  tick,
} from '../../src/sim/engine';
import {
  CROP_CATALOG,
  FARM_CONFIG,
  getCropDefinition,
  getCropGrowthProgress,
  getCropGrowthStage,
  getCropRemainingSeconds,
  getHamburgerStandSynergy,
  getVillageHousingCapacity,
  isAppleTreeReady,
  isCropReadyToHarvest,
} from '../../src/sim/farm';
import { getActiveMainQuestView } from '../../src/sim/quests';
import type { GameState } from '../../src/sim/types';
import { getHamburgerStandRatePerMin } from '../../src/sim/village';
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

function createSunnyFarmState(nowMs = 1_700_000_000_000, jellyCoins = 1_000): GameState {
  const base = createInitialState({ nowMs, onboarded: true, seed: 101 });
  return {
    ...base,
    currencies: { ...base.currencies, jellyCoins },
    weather: {
      ...base.weather,
      current: 'sunny',
      // Keep weather locked to sunny for long deterministic crop-timing checks unless overridden
      nextChangeMs: nowMs + 60 * 60 * 1000,
    },
  };
}

function placeGardenPlot(state: GameState, tileId: string, nowMs: number): GameState {
  const res = dispatch(
    state,
    { type: 'PLACE_BUILDING', buildingType: 'garden_plot', tileId },
    nowMs,
  );
  expect(res.events.some((e) => e.type === 'BUILDING_PLACED')).toBe(true);
  return res.state;
}

describe('PR-12 Pure-TS Garden Farming Engine', () => {
  it('defines all 4 canonical crops with exact DESIGN.md seed costs, grow times, and yields', () => {
    expect(CROP_CATALOG).toHaveLength(4);
    expect(getCropDefinition('parsley')).toMatchObject({
      seedCost: 10,
      growTimeSec: 45,
      harvestCoins: 25,
      itemYield: 2,
      inventoryKey: 'parsley',
    });
    expect(getCropDefinition('tomato')).toMatchObject({
      seedCost: 25,
      growTimeSec: 120,
      harvestCoins: 65,
      itemYield: 2,
      inventoryKey: 'tomatoes',
    });
    expect(getCropDefinition('candy_cane')).toMatchObject({
      seedCost: 50,
      growTimeSec: 240,
      harvestCoins: 145,
      itemYield: 1,
      inventoryKey: 'candyCanes',
    });
    expect(getCropDefinition('hundred_beans')).toMatchObject({
      seedCost: 90,
      growTimeSec: 360,
      harvestCoins: 280,
      harvestXp: 35,
      miniBeanBurstCount: 100,
    });
  });

  it('enforces exact canonical crop growth timings in Sunny weather across all 4 crops', () => {
    const t0 = 1_700_000_000_000;
    let state = createSunnyFarmState(t0, 1_000);
    state = placeGardenPlot(state, 'plot_pad_1', t0);
    state = placeGardenPlot(state, 'plot_pad_2', t0);
    state = placeGardenPlot(state, 'plot_pad_3', t0);
    state = placeGardenPlot(state, 'plot_pad_4', t0);

    state = dispatch(state, { type: 'PLANT_CROP', tileId: 'plot_pad_1', cropId: 'parsley' }, t0).state;
    state = dispatch(state, { type: 'PLANT_CROP', tileId: 'plot_pad_2', cropId: 'tomato' }, t0).state;
    state = dispatch(state, { type: 'PLANT_CROP', tileId: 'plot_pad_3', cropId: 'candy_cane' }, t0).state;
    state = dispatch(state, { type: 'PLANT_CROP', tileId: 'plot_pad_4', cropId: 'hundred_beans' }, t0).state;

    // Freshly planted in Sunny weather: sprout stage, unwatered
    expect(getCropGrowthStage(state.island.tiles.plot_pad_1!.crop!)).toBe('sprout');
    expect(state.island.tiles.plot_pad_1!.crop!.watered).toBe(false);

    // At 44s: Parsley is mid-stage (just shy of ripe), harvesting rejected cleanly
    const at44 = tick(state, 44, t0 + 44_000);
    expect(getCropGrowthStage(at44.island.tiles.plot_pad_1!.crop!)).toBe('mid');
    expect(isCropReadyToHarvest(at44.island.tiles.plot_pad_1!.crop)).toBe(false);
    const earlyHarvest = dispatch(at44, { type: 'HARVEST_CROP', tileId: 'plot_pad_1' }, t0 + 44_000);
    expect(earlyHarvest.events[0]).toMatchObject({ type: 'ACTION_REJECTED', actionType: 'HARVEST_CROP' });

    // At exact 45s: Parsley is ripe; Tomatoes (120s), Candy Cane (240s), 100 Beans (360s) still growing
    const at45 = tick(at44, 1, t0 + 45_000);
    expect(isCropReadyToHarvest(at45.island.tiles.plot_pad_1!.crop)).toBe(true);
    expect(getCropGrowthStage(at45.island.tiles.plot_pad_1!.crop!)).toBe('ripe');
    expect(isCropReadyToHarvest(at45.island.tiles.plot_pad_2!.crop)).toBe(false);
    expect(getCropRemainingSeconds(at45.island.tiles.plot_pad_2!.crop!, 'sunny')).toBeCloseTo(75, 5);

    // At exact 120s: Tomatoes ripe; Candy Cane at 50% (mid)
    const at120 = tick(at45, 75, t0 + 120_000);
    expect(isCropReadyToHarvest(at120.island.tiles.plot_pad_2!.crop)).toBe(true);
    expect(getCropGrowthProgress(at120.island.tiles.plot_pad_3!.crop!)).toBeCloseTo(0.5, 5);
    expect(getCropGrowthStage(at120.island.tiles.plot_pad_3!.crop!)).toBe('mid');
    expect(isCropReadyToHarvest(at120.island.tiles.plot_pad_3!.crop)).toBe(false);

    // At exact 240s: Candy Cane ripe; 100 Jelly Beans still 120s away
    const at240 = tick(at120, 120, t0 + 240_000);
    expect(isCropReadyToHarvest(at240.island.tiles.plot_pad_3!.crop)).toBe(true);
    expect(isCropReadyToHarvest(at240.island.tiles.plot_pad_4!.crop)).toBe(false);
    expect(getCropRemainingSeconds(at240.island.tiles.plot_pad_4!.crop!, 'sunny')).toBeCloseTo(120, 5);

    // At exact 360s: 100 Jelly Beans ripe!
    const at360 = tick(at240, 120, t0 + 360_000);
    expect(isCropReadyToHarvest(at360.island.tiles.plot_pad_4!.crop)).toBe(true);
  });

  it('applies manual watering (1.25x) in Sunny weather and exact 2x growth + auto-water in Cozy Rain', () => {
    const t0 = 1_700_000_000_000;
    let state = createSunnyFarmState(t0, 500);
    state = placeGardenPlot(state, 'plot_pad_1', t0);
    state = placeGardenPlot(state, 'plot_pad_2', t0);

    // Plant Tomatoes (120s base) on pad 1 & water manually -> ripens in 120 / 1.25 = 96s
    state = dispatch(state, { type: 'PLANT_CROP', tileId: 'plot_pad_1', cropId: 'tomato' }, t0).state;
    const watered = dispatch(state, { type: 'WATER_CROP', tileId: 'plot_pad_1' }, t0);
    expect(watered.state.island.tiles.plot_pad_1?.crop?.watered).toBe(true);
    expect(watered.events).toContainEqual({
      type: 'CROP_WATERED',
      tileId: 'plot_pad_1',
      cropId: 'tomato',
      xpGained: FARM_CONFIG.waterCropXp,
    });

    // Double watering rejected cleanly
    const dupWater = dispatch(watered.state, { type: 'WATER_CROP', tileId: 'plot_pad_1' }, t0);
    expect(dupWater.events[0]).toMatchObject({ type: 'ACTION_REJECTED', actionType: 'WATER_CROP' });

    // After 96s of Sunny play, watered Tomatoes are exactly ripe!
    const after96 = tick(watered.state, 96, t0 + 96_000);
    expect(isCropReadyToHarvest(after96.island.tiles.plot_pad_1!.crop)).toBe(true);

    // Now test Cozy Rain exact 2x multiplier + auto-water on all 4 timings:
    let rainyState: GameState = {
      ...createSunnyFarmState(t0, 500),
      weather: {
        ...state.weather,
        current: 'cozy_rain',
        nextChangeMs: t0 + 60 * 60 * 1000,
      },
    };
    rainyState = placeGardenPlot(rainyState, 'plot_pad_1', t0);
    rainyState = placeGardenPlot(rainyState, 'plot_pad_2', t0);
    rainyState = placeGardenPlot(rainyState, 'plot_pad_3', t0);
    rainyState = placeGardenPlot(rainyState, 'plot_pad_4', t0);

    const plantedParsley = dispatch(
      rainyState,
      { type: 'PLANT_CROP', tileId: 'plot_pad_1', cropId: 'parsley' },
      t0,
    );
    expect(plantedParsley.events).toContainEqual({
      type: 'CROP_PLANTED',
      tileId: 'plot_pad_1',
      cropId: 'parsley',
      coinsSpent: 10,
      autoWatered: true,
    });
    rainyState = plantedParsley.state;
    rainyState = dispatch(rainyState, { type: 'PLANT_CROP', tileId: 'plot_pad_2', cropId: 'tomato' }, t0).state;
    rainyState = dispatch(rainyState, { type: 'PLANT_CROP', tileId: 'plot_pad_3', cropId: 'candy_cane' }, t0).state;
    rainyState = dispatch(rainyState, { type: 'PLANT_CROP', tileId: 'plot_pad_4', cropId: 'hundred_beans' }, t0).state;

    // Parsley: 45s / 2 = 22.5s
    const at22 = tick(rainyState, 22, t0 + 22_000);
    expect(isCropReadyToHarvest(at22.island.tiles.plot_pad_1!.crop)).toBe(false);
    const at22_5 = tick(at22, 0.5, t0 + 22_500);
    expect(isCropReadyToHarvest(at22_5.island.tiles.plot_pad_1!.crop)).toBe(true);

    // Tomatoes: 120s / 2 = 60s
    const at60 = tick(at22_5, 37.5, t0 + 60_000);
    expect(isCropReadyToHarvest(at60.island.tiles.plot_pad_2!.crop)).toBe(true);

    // Candy Cane: 240s / 2 = 120s
    const at120 = tick(at60, 60, t0 + 120_000);
    expect(isCropReadyToHarvest(at120.island.tiles.plot_pad_3!.crop)).toBe(true);

    // 100 Jelly Beans: 360s / 2 = 180s
    const at180 = tick(at120, 60, t0 + 180_000);
    expect(isCropReadyToHarvest(at180.island.tiles.plot_pad_4!.crop)).toBe(true);
  });

  it('harvests Parsley & Tomatoes to activate Hamburger Stand +25% / 2.0x synergy and complete Quest 4', () => {
    const t0 = 1_700_000_000_000;
    let state = createSunnyFarmState(t0, 600);
    // Advance quest pointer to Q4 (Green Thumb) to verify quest completion knock!
    state = {
      ...state,
      quests: {
        ...state.quests,
        completedIds: ['q1_welcome', 'q2_survive', 'q3_toilet'],
        activeQuestId: 'q4_green_thumb',
        drBubblegumAtDoor: false,
      },
    };

    state = dispatch(
      state,
      { type: 'PLACE_BUILDING', buildingType: 'hamburger_stand', tileId: 'plot_pad_1' },
      t0,
    ).state;
    state = placeGardenPlot(state, 'plot_pad_2', t0);
    state = placeGardenPlot(state, 'plot_pad_3', t0);

    // Baseline Hamburger Stand rate: 15 JC/min
    expect(getHamburgerStandRatePerMin(state)).toBe(15);
    expect(getHamburgerStandSynergy(state)).toEqual({
      baseRatePerMin: 15,
      effectiveRatePerMin: 15,
      multiplier: 1,
      hasParsley: false,
      hasTomatoes: false,
    });

    // Plant Parsley & Tomatoes
    state = dispatch(state, { type: 'PLANT_CROP', tileId: 'plot_pad_2', cropId: 'parsley' }, t0).state;
    state = dispatch(state, { type: 'PLANT_CROP', tileId: 'plot_pad_3', cropId: 'tomato' }, t0).state;

    // Grow 45s -> harvest Parsley -> +25 JC, +2 Parsley, Hamburger Stand climbs to 18.75 JC/min!
    state = tick(state, 45, t0 + 45_000);
    const coinsBeforeParsley = state.currencies.jellyCoins;
    const parsleyHarvest = dispatch(state, { type: 'HARVEST_CROP', tileId: 'plot_pad_2' }, t0 + 45_000);
    state = parsleyHarvest.state;
    expect(state.inventory.parsley).toBe(2);
    expect(state.currencies.jellyCoins).toBe(coinsBeforeParsley + 25);
    expect(state.quests.counters.parsleyHarvested).toBe(1);
    expect(getHamburgerStandRatePerMin(state)).toBe(18.75);
    expect(getHamburgerStandSynergy(state).multiplier).toBe(1.25);

    // Grow 75s more (120s total) -> harvest Tomatoes -> +65 JC, +2 Tomatoes, Hamburger Stand hits full 30 JC/min (2x)!
    state = tick(state, 75, t0 + 120_000);
    const tomatoHarvest = dispatch(state, { type: 'HARVEST_CROP', tileId: 'plot_pad_3' }, t0 + 120_000);
    state = tomatoHarvest.state;
    expect(state.inventory.tomatoes).toBe(2);
    expect(state.quests.counters.tomatoesHarvested).toBe(1);
    expect(getHamburgerStandRatePerMin(state)).toBe(30);
    expect(getHamburgerStandSynergy(state)).toEqual({
      baseRatePerMin: 15,
      effectiveRatePerMin: 30,
      multiplier: 2,
      hasParsley: true,
      hasTomatoes: true,
    });

    // Harvesting both Parsley & Tomatoes completes Dr. Bubblegum's Quest 4 ("Green Thumb")!
    expect(getActiveMainQuestView(state)?.progress.completed).toBe(true);
    expect(state.quests.drBubblegumAtDoor).toBe(true);
    expect(tomatoHarvest.events).toContainEqual({
      type: 'DR_BUBBLEGUM_KNOCKED',
      questId: 'q4_green_thumb',
      questTitle: 'Green Thumb',
      reason: 'quest_ready',
    });

    // Verify real passive accrual over 60s at boosted 30 JC/min rate
    const pendingBefore = state.island.tiles.plot_pad_1?.pendingCoins ?? 0;
    const afterOneMin = tick(state, 60, t0 + 180_000);
    expect((afterOneMin.island.tiles.plot_pad_1?.pendingCoins ?? 0) - pendingBefore).toBeCloseTo(30, 5);
  });

  it('delivers 100 Jelly Beans burst payout (280 JC, 35 XP, 100 mini-beans) and sprouts a villager when housing exists', () => {
    const t0 = 1_700_000_000_000;
    let state = createSunnyFarmState(t0, 500);
    state = placeGardenPlot(state, 'plot_pad_1', t0);
    state = dispatch(state, { type: 'PLANT_CROP', tileId: 'plot_pad_1', cropId: 'hundred_beans' }, t0).state;
    state = tick(state, 360, t0 + 360_000);

    // Without a Villager Cottage, capacity is 1 -> still pays full 100-bean burst, no villager sprouted
    expect(getVillageHousingCapacity(state)).toBe(1);
    const coinsBefore = state.currencies.jellyCoins;
    const noRoomHarvest = dispatch(state, { type: 'HARVEST_CROP', tileId: 'plot_pad_1' }, t0 + 360_000);
    expect(noRoomHarvest.state.currencies.jellyCoins).toBe(coinsBefore + 280);
    expect(noRoomHarvest.state.beans).toHaveLength(1);
    expect(noRoomHarvest.state.quests.counters.hundredBeansHarvested).toBe(1);
    expect(noRoomHarvest.events).toContainEqual({
      type: 'CROP_HARVESTED',
      tileId: 'plot_pad_1',
      cropId: 'hundred_beans',
      coinsGained: 280,
      xpGained: 35,
      itemYield: 100,
      miniBeanBurstCount: 100,
      sproutedBeanId: null,
    });

    // Now test first 100-Jelly-Beans harvest WITH an empty Villager Cottage -> guaranteed villager sprout!
    let withCottage: GameState = {
      ...createSunnyFarmState(t0, 500),
      island: {
        ...state.island,
        tiles: {
          ...state.island.tiles,
          plot_pad_2: {
            id: 'plot_pad_2',
            ring: 0,
            building: 'villager_cottage',
            buildingTier: 1,
            crop: null,
          },
        },
      },
    };
    withCottage = dispatch(
      withCottage,
      { type: 'PLANT_CROP', tileId: 'plot_pad_1', cropId: 'hundred_beans' },
      t0,
    ).state;
    withCottage = tick(withCottage, 360, t0 + 360_000);

    expect(getVillageHousingCapacity(withCottage)).toBe(2);
    const firstSprout = dispatch(withCottage, { type: 'HARVEST_CROP', tileId: 'plot_pad_1' }, t0 + 360_000);
    expect(firstSprout.state.beans).toHaveLength(2);
    const newVillager = firstSprout.state.beans[1]!;
    expect(newVillager.id).toBe('bean-2');
    expect(newVillager.stage).toBe('larva');
    expect(newVillager.tileId).toBe('plot_pad_2');
    expect(firstSprout.events).toContainEqual({
      type: 'CROP_HARVESTED',
      tileId: 'plot_pad_1',
      cropId: 'hundred_beans',
      coinsGained: 280,
      xpGained: 35,
      itemYield: 100,
      miniBeanBurstCount: 100,
      sproutedBeanId: 'bean-2',
    });
    expect(firstSprout.events).toContainEqual({
      type: 'VILLAGER_SPROUTED',
      beanId: 'bean-2',
      beanName: newVillager.name,
      tileId: 'plot_pad_2',
    });
  });

  it('supports perennial Apple Tree (80 JC) yielding 3 Apples with exact 90s regrow (45s in Cozy Rain)', () => {
    const t0 = 1_700_000_000_000;
    let state = createSunnyFarmState(t0, 200);

    const planted = dispatch(
      state,
      { type: 'PLACE_BUILDING', buildingType: 'apple_tree', tileId: 'plot_pad_1' },
      t0,
    );
    state = planted.state;
    expect(state.currencies.jellyCoins).toBe(120);
    expect(isAppleTreeReady(state.island.tiles.plot_pad_1!)).toBe(true);

    // Harvest 3 Apples immediately
    const applesBefore = state.inventory.apples;
    const harvest1 = dispatch(state, { type: 'HARVEST_APPLE_TREE', tileId: 'plot_pad_1' }, t0);
    state = harvest1.state;
    expect(state.inventory.apples).toBe(applesBefore + 3);
    expect(state.island.tiles.plot_pad_1?.appleRegrowSec).toBe(90);
    expect(isAppleTreeReady(state.island.tiles.plot_pad_1!)).toBe(false);
    expect(harvest1.events).toContainEqual({
      type: 'APPLE_TREE_HARVESTED',
      tileId: 'plot_pad_1',
      applesGained: 3,
      xpGained: FARM_CONFIG.appleTreeHarvestXp,
    });

    // Rejects early harvest while regrowing
    const early = dispatch(state, { type: 'HARVEST_APPLE_TREE', tileId: 'plot_pad_1' }, t0 + 10_000);
    expect(early.events[0]).toMatchObject({ type: 'ACTION_REJECTED', actionType: 'HARVEST_APPLE_TREE' });

    // Exact 90s regrow in Sunny weather
    state = tick(state, 89, t0 + 89_000);
    expect(isAppleTreeReady(state.island.tiles.plot_pad_1!)).toBe(false);
    state = tick(state, 1, t0 + 90_000);
    expect(isAppleTreeReady(state.island.tiles.plot_pad_1!)).toBe(true);

    // Harvest again, then switch to Cozy Rain -> regrows in exact 45s (2x speed)!
    state = dispatch(state, { type: 'HARVEST_APPLE_TREE', tileId: 'plot_pad_1' }, t0 + 90_000).state;
    state = {
      ...state,
      weather: { ...state.weather, current: 'cozy_rain', nextChangeMs: t0 + 3_600_000 },
    };
    state = tick(state, 44, t0 + 134_000);
    expect(isAppleTreeReady(state.island.tiles.plot_pad_1!)).toBe(false);
    state = tick(state, 1, t0 + 135_000);
    expect(isAppleTreeReady(state.island.tiles.plot_pad_1!)).toBe(true);
  });

  it('knits Cozy Feather Blankets from 5 Feathers, applies Feather Loom bonus, and tracks garden check-ins', () => {
    const t0 = 1_700_000_000_000;
    let state = createSunnyFarmState(t0, 400);

    // Rejects with fewer than 5 feathers
    const tooFew = dispatch(state, { type: 'KNIT_BLANKET' }, t0);
    expect(tooFew.events[0]).toMatchObject({ type: 'ACTION_REJECTED', actionType: 'KNIT_BLANKET' });

    // Hand-knit without Feather Loom
    state = { ...state, inventory: { ...state.inventory, feathers: 10 } };
    const handKnitted = dispatch(state, { type: 'KNIT_BLANKET' }, t0 + 1_000);
    expect(handKnitted.state.inventory.feathers).toBe(5);
    expect(handKnitted.state.inventory.blankets).toBe(1);
    expect(handKnitted.state.quests.counters.blanketsKnitted).toBe(1);
    expect(handKnitted.events).toContainEqual({
      type: 'BLANKET_KNITTED',
      feathersSpent: 5,
      totalBlankets: 1,
      usedLoom: false,
      xpGained: FARM_CONFIG.knitBlanketBaseXp,
      coinsGained: 0,
    });

    // Build Feather Loom (180 JC) -> grants artisan XP & JC bonus!
    const withLoom = dispatch(
      handKnitted.state,
      { type: 'PLACE_BUILDING', buildingType: 'feather_loom', tileId: 'plot_pad_2' },
      t0 + 2_000,
    ).state;
    const coinsBeforeLoomKnit = withLoom.currencies.jellyCoins;
    const loomKnitted = dispatch(withLoom, { type: 'KNIT_BLANKET' }, t0 + 3_000);
    expect(loomKnitted.state.inventory.feathers).toBe(0);
    expect(loomKnitted.state.inventory.blankets).toBe(2);
    expect(loomKnitted.state.currencies.jellyCoins).toBe(
      coinsBeforeLoomKnit + FARM_CONFIG.knitBlanketLoomBonusCoins,
    );
    expect(loomKnitted.events).toContainEqual({
      type: 'BLANKET_KNITTED',
      feathersSpent: 5,
      totalBlankets: 2,
      usedLoom: true,
      xpGained: FARM_CONFIG.knitBlanketBaseXp + FARM_CONFIG.knitBlanketLoomBonusXp,
      coinsGained: FARM_CONFIG.knitBlanketLoomBonusCoins,
    });

    // Garden check-in counter ("checked in on the garden 12 times this morning!")
    let checked = loomKnitted.state;
    for (let i = 0; i < 12; i += 1) {
      checked = dispatch(checked, { type: 'CHECK_IN_GARDEN' }, t0 + 4_000 + i * 100).state;
    }
    expect(checked.quests.counters.gardenCheckIns).toBe(12);
    expect(getActiveBean(checked).level).toBeGreaterThanOrEqual(1);
  });

  it('finishes growing crops & Apple Trees during offline catch-up and persists farm state losslessly', () => {
    const t0 = 1_700_000_000_000;
    const storage = createMemoryStorage();
    let state = createSunnyFarmState(t0, 500);
    state = placeGardenPlot(state, 'plot_pad_1', t0);
    state = dispatch(
      state,
      { type: 'PLACE_BUILDING', buildingType: 'apple_tree', tileId: 'plot_pad_2' },
      t0,
    ).state;
    state = dispatch(state, { type: 'HARVEST_APPLE_TREE', tileId: 'plot_pad_2' }, t0).state;
    state = dispatch(state, { type: 'PLANT_CROP', tileId: 'plot_pad_1', cropId: 'candy_cane' }, t0).state;
    state = tick(state, 30, t0 + 30_000);

    // Save mid-growth and verify lossless reload
    saveState(state, { storage, idb: null });
    const reloaded = loadState('regular', { storage, idb: null });
    expect(reloaded.state).toEqual(state);
    expect(reloaded.state.island.tiles.plot_pad_1?.crop?.growthSeconds).toBe(30);
    expect(reloaded.state.island.tiles.plot_pad_2?.appleRegrowSec).toBe(60);

    // Leave offline for 5 minutes -> Candy Cane (210s left) and Apple Tree (60s left) both ripen!
    const caughtUp = applyOfflineCatchUp(reloaded.state, t0 + 30_000 + 5 * 60 * 1000);
    expect(caughtUp.summary.cropsRipened).toBe(1);
    expect(isCropReadyToHarvest(caughtUp.state.island.tiles.plot_pad_1!.crop)).toBe(true);
    expect(isAppleTreeReady(caughtUp.state.island.tiles.plot_pad_2!)).toBe(true);
  });
});
