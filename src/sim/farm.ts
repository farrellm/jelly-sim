import { INITIAL_STARTER_CONFIG, stageForLevel, xpForLevel } from './constants';
import { nextRandom } from './rng';
import type {
  CropGrowthStage,
  CropId,
  CropState,
  DispatchResult,
  GameState,
  JellyBeanEntity,
  LifeStage,
  SimEvent,
  TileState,
  WeatherType,
} from './types';
import {
  countBuildings,
  findBuildingTiles,
  getHamburgerStandRatePerMin,
  hasBuilding,
  VILLAGE_CONFIG,
} from './village';
import { WEATHER_CONFIG } from './weather';

export type HarvestInventoryKey = 'parsley' | 'tomatoes' | 'candyCanes';

export interface CropDefinition {
  id: CropId;
  name: string;
  shortDesc: string;
  seedCost: number;
  growTimeSec: number;
  harvestCoins: number;
  harvestXp: number;
  inventoryKey: HarvestInventoryKey | null;
  itemYield: number;
  /** Number of bouncing 3D mini-beans erupted on harvest (100 for `hundred_beans`). */
  miniBeanBurstCount: number;
  modelPath: string;
  iconPath: string;
}

export interface HamburgerStandSynergyInfo {
  baseRatePerMin: number;
  effectiveRatePerMin: number;
  multiplier: number;
  hasParsley: boolean;
  hasTomatoes: boolean;
}

export interface FarmTickResult {
  tiles: Record<string, TileState>;
  cropsRipened: number;
  changed: boolean;
}

/**
 * Farming, Apple Tree regrow, 100 Jelly Beans burst, and Feather Blanket knitting
 * balancing parameters (DESIGN.md §3.5–§3.6).
 */
export const FARM_CONFIG = {
  /** Manual watering speeds up crop growth by 1.25x in non-rain weather. */
  wateredGrowthMultiplier: 1.25,
  /** Cozy Rain auto-waters crops and applies an exact 2x growth speed multiplier. */
  cozyRainGrowthMultiplier: WEATHER_CONFIG.cozyRainCropSpeedMultiplier,
  waterCropXp: 2,

  /** Perennial Apple Tree regrows 3 Apples every 90 seconds (DESIGN.md §3.6). */
  appleTreeRegrowSec: 90,
  appleTreeHarvestYield: 3,
  appleTreeHarvestXp: 8,

  /** Harvesting 100 Jelly Beans erupts 100 mini-beans and can sprout a new villager. */
  hundredBeansMiniBurstCount: 100,
  hundredBeansVillagerChance: 0.15,

  /** Blanket knitting requires 5 Feathers; owning a Feather Loom grants artisan bonuses. */
  feathersPerBlanket: 5,
  knitBlanketBaseXp: 20,
  knitBlanketLoomBonusXp: 15,
  knitBlanketLoomBonusCoins: 10,
} as const;

/**
 * All 4 canonical garden crops from DESIGN.md §3.6.
 */
export const CROP_CATALOG: readonly CropDefinition[] = [
  {
    id: 'parsley',
    name: 'Parsley',
    shortDesc: 'Fast 45s herb! Garnishes Hamburger Stand for +25% tips.',
    seedCost: 10,
    growTimeSec: 45,
    harvestCoins: 25,
    harvestXp: 8,
    inventoryKey: 'parsley',
    itemYield: 2,
    miniBeanBurstCount: 0,
    modelPath: 'assets/models/crop_parsley.glb',
    iconPath: 'assets/icons/crop_parsley.png',
  },
  {
    id: 'tomato',
    name: 'Tomatoes',
    shortDesc: 'Plump 2m crop! Core Hamburger Stand boost & Kitchen ingredient.',
    seedCost: 25,
    growTimeSec: 120,
    harvestCoins: 65,
    harvestXp: 14,
    inventoryKey: 'tomatoes',
    itemYield: 2,
    miniBeanBurstCount: 0,
    modelPath: 'assets/models/crop_tomato.glb',
    iconPath: 'assets/icons/crop_tomato.png',
  },
  {
    id: 'candy_cane',
    name: 'Candy Cane',
    shortDesc: 'Sweet 4m peppermint crop for Cocoa & Candy Castle potions.',
    seedCost: 50,
    growTimeSec: 240,
    harvestCoins: 145,
    harvestXp: 22,
    inventoryKey: 'candyCanes',
    itemYield: 1,
    miniBeanBurstCount: 0,
    modelPath: 'assets/models/crop_candycane.glb',
    iconPath: 'assets/icons/crop_candycane.png',
  },
  {
    id: 'hundred_beans',
    name: '100 Jelly Beans',
    shortDesc: '6m legendary crop! Bursts 100 mini-beans & can sprout a new villager!',
    seedCost: 90,
    growTimeSec: 360,
    harvestCoins: 280,
    harvestXp: 35,
    inventoryKey: null,
    itemYield: 100,
    miniBeanBurstCount: FARM_CONFIG.hundredBeansMiniBurstCount,
    modelPath: 'assets/models/crop_100beans.glb',
    iconPath: 'assets/icons/crop_100beans.png',
  },
] as const;

const CROP_BY_ID: Readonly<Record<CropId, CropDefinition>> = Object.fromEntries(
  CROP_CATALOG.map((crop) => [crop.id, crop]),
) as Record<CropId, CropDefinition>;

const VILLAGER_BEAN_NAMES = [
  'Sprout',
  'Mochi',
  'Pip',
  'Gumdrop',
  'Taffy',
  'Marmalade',
  'Pebble',
  'Clover',
  'Nori',
  'Bramble',
  'Peppermint',
  'Popcorn',
] as const;

function awardFarmXp(
  bean: JellyBeanEntity,
  xpGain: number,
): { bean: JellyBeanEntity; leveledUp: boolean; newLevel: number; newStage: LifeStage } {
  const safeGain = Math.max(0, Math.floor(xpGain));
  if (safeGain === 0) {
    return { bean, leveledUp: false, newLevel: bean.level, newStage: bean.stage };
  }

  let level = bean.level;
  let xp = bean.xp + safeGain;
  let leveledUp = false;

  while (xp >= xpForLevel(level)) {
    xp -= xpForLevel(level);
    level += 1;
    leveledUp = true;
  }

  const stage = stageForLevel(level);
  return {
    bean: { ...bean, level, xp, stage },
    leveledUp,
    newLevel: level,
    newStage: stage,
  };
}

function resolveActiveBean(state: GameState): JellyBeanEntity | null {
  return state.beans.find((b) => b.id === state.activeBeanId) ?? state.beans[0] ?? null;
}

export function isCropId(value: unknown): value is CropId {
  return (
    value === 'parsley' ||
    value === 'tomato' ||
    value === 'candy_cane' ||
    value === 'hundred_beans'
  );
}

export function getCropCatalog(): readonly CropDefinition[] {
  return CROP_CATALOG;
}

export function getCropDefinition(cropId: string): CropDefinition | null {
  return isCropId(cropId) ? CROP_BY_ID[cropId] : null;
}

/**
 * Returns the active crop growth speed multiplier:
 * - Cozy Rain: exact 2x multiplier (and auto-waters crops)
 * - Manually watered (Sunny / Chilly Wind): 1.25x
 * - Unwatered (Sunny / Chilly Wind): 1.0x (exact canonical base timings)
 */
export function getEffectiveCropGrowthMultiplier(
  watered: boolean,
  weather: WeatherType,
): number {
  if (weather === 'cozy_rain') {
    return FARM_CONFIG.cozyRainGrowthMultiplier;
  }
  return watered ? FARM_CONFIG.wateredGrowthMultiplier : 1;
}

export function getCropGrowthProgress(crop: CropState): number {
  const def = getCropDefinition(crop.cropId);
  if (!def || def.growTimeSec <= 0) return 0;
  return Math.max(0, Math.min(1, crop.growthSeconds / def.growTimeSec));
}

export function getCropGrowthStage(crop: CropState): CropGrowthStage {
  const progress = getCropGrowthProgress(crop);
  if (progress >= 1) return 'ripe';
  if (progress >= 0.45) return 'mid';
  return 'sprout';
}

export function isCropReadyToHarvest(crop: CropState | null): boolean {
  if (!crop) return false;
  const def = getCropDefinition(crop.cropId);
  if (!def) return false;
  return crop.growthSeconds >= def.growTimeSec;
}

export function getCropRemainingSeconds(crop: CropState, weather: WeatherType): number {
  const def = getCropDefinition(crop.cropId);
  if (!def) return 0;
  const remainingGrowth = Math.max(0, def.growTimeSec - crop.growthSeconds);
  if (remainingGrowth <= 0) return 0;
  const rate = getEffectiveCropGrowthMultiplier(crop.watered, weather);
  return remainingGrowth / rate;
}

export function isAppleTreeReady(tile: TileState): boolean {
  return tile.building === 'apple_tree' && (tile.appleRegrowSec ?? 0) <= 0;
}

/**
 * Total housing capacity for Jelly Beans: 1 for the Starter House + 1 per Villager Cottage.
 */
export function getVillageHousingCapacity(state: GameState): number {
  const houses = Math.max(1, countBuildings(state, 'starter_house'));
  const cottages = countBuildings(state, 'villager_cottage');
  return houses + cottages;
}

/**
 * Summarizes the active Hamburger Stand Tomato (+75%) & Parsley (+25%) income synergy.
 */
export function getHamburgerStandSynergy(state: GameState): HamburgerStandSynergyInfo {
  const baseRatePerMin = VILLAGE_CONFIG.hamburgerStandBaseCoinsPerMin;
  const effectiveRatePerMin = getHamburgerStandRatePerMin(state);
  return {
    baseRatePerMin,
    effectiveRatePerMin,
    multiplier: effectiveRatePerMin / baseRatePerMin,
    hasParsley: state.inventory.parsley > 0,
    hasTomatoes: state.inventory.tomatoes > 0,
  };
}

function createSproutedVillagerBean(state: GameState, tileId: string): JellyBeanEntity {
  const nextIndex = state.beans.length + 1;
  const usedNames = new Set(state.beans.map((b) => b.name.toLowerCase()));
  let chosenName = VILLAGER_BEAN_NAMES[(nextIndex - 2) % VILLAGER_BEAN_NAMES.length] ?? 'Sprout';
  for (const candidate of VILLAGER_BEAN_NAMES) {
    if (!usedNames.has(candidate.toLowerCase())) {
      chosenName = candidate;
      break;
    }
  }

  const cottageTiles = findBuildingTiles(state, 'villager_cottage');
  const occupiedTiles = new Set(state.beans.map((b) => b.tileId));
  const homeTile =
    cottageTiles.find((t) => !occupiedTiles.has(t.id))?.id ??
    cottageTiles[0]?.id ??
    tileId;

  return {
    id: `bean-${nextIndex}`,
    name: chosenName,
    stage: 'larva',
    level: 1,
    xp: 0,
    flavorId: INITIAL_STARTER_CONFIG.defaultFlavorId,
    needs: { ...INITIAL_STARTER_CONFIG.starterNeeds },
    anger: 0,
    isSleeping: false,
    blanketRemainingSec: 0,
    trade: null,
    hobby: null,
    hatId: null,
    tileId: homeTile,
  };
}

/**
 * Plants one of the 4 canonical crops into an empty Garden Plot tile, charging the seed cost.
 * Automatically waters the newly planted crop when Cozy Rain is active.
 */
export function plantCrop(
  state: GameState,
  tileId: string,
  cropId: CropId,
  nowMs?: number,
): DispatchResult {
  const nextLastTickMs = nowMs !== undefined ? Math.max(state.lastTickMs, nowMs) : state.lastTickMs;
  const events: SimEvent[] = [];

  const def = getCropDefinition(cropId);
  if (!def) {
    events.push({
      type: 'ACTION_REJECTED',
      actionType: 'PLANT_CROP',
      reason: `Unknown crop: ${cropId}`,
    });
    return { state, events };
  }

  const tile = state.island.tiles[tileId];
  if (!tile || tile.building !== 'garden_plot') {
    events.push({
      type: 'ACTION_REJECTED',
      actionType: 'PLANT_CROP',
      reason: 'Select a built Garden Plot to plant seeds',
    });
    return { state, events };
  }

  if (tile.crop !== null) {
    events.push({
      type: 'ACTION_REJECTED',
      actionType: 'PLANT_CROP',
      reason: 'This Garden Plot already has a crop growing',
    });
    return { state, events };
  }

  if (state.currencies.jellyCoins < def.seedCost) {
    events.push({
      type: 'ACTION_REJECTED',
      actionType: 'PLANT_CROP',
      reason: `Need ${def.seedCost} Jelly Coins for ${def.name} seeds`,
    });
    return { state, events };
  }

  const autoWatered = state.weather.current === 'cozy_rain';
  const nextTile: TileState = {
    ...tile,
    crop: {
      cropId: def.id,
      plantedAtMs: nextLastTickMs,
      growthSeconds: 0,
      watered: autoWatered,
    },
  };

  events.push({
    type: 'CROP_PLANTED',
    tileId,
    cropId: def.id,
    coinsSpent: def.seedCost,
    autoWatered,
  });

  return {
    state: {
      ...state,
      lastTickMs: nextLastTickMs,
      currencies: {
        ...state.currencies,
        jellyCoins: state.currencies.jellyCoins - def.seedCost,
      },
      island: {
        ...state.island,
        tiles: {
          ...state.island.tiles,
          [tileId]: nextTile,
        },
      },
    },
    events,
  };
}

/**
 * Manually waters a growing crop in a Garden Plot for a 1.25x growth boost and small XP reward.
 */
export function waterCrop(
  state: GameState,
  tileId: string,
  nowMs?: number,
): DispatchResult {
  const nextLastTickMs = nowMs !== undefined ? Math.max(state.lastTickMs, nowMs) : state.lastTickMs;
  const events: SimEvent[] = [];

  const tile = state.island.tiles[tileId];
  if (!tile || tile.building !== 'garden_plot' || !tile.crop) {
    events.push({
      type: 'ACTION_REJECTED',
      actionType: 'WATER_CROP',
      reason: 'No planted crop on this tile to water',
    });
    return { state, events };
  }

  if (isCropReadyToHarvest(tile.crop)) {
    events.push({
      type: 'ACTION_REJECTED',
      actionType: 'WATER_CROP',
      reason: 'Crop is already ripe and ready to harvest',
    });
    return { state, events };
  }

  if (tile.crop.watered) {
    events.push({
      type: 'ACTION_REJECTED',
      actionType: 'WATER_CROP',
      reason: 'Crop is already watered',
    });
    return { state, events };
  }

  const nextTile: TileState = {
    ...tile,
    crop: {
      ...tile.crop,
      watered: true,
    },
  };

  const activeBean = resolveActiveBean(state);
  let nextBeans = state.beans;
  const xpGained = activeBean ? FARM_CONFIG.waterCropXp : 0;

  events.push({
    type: 'CROP_WATERED',
    tileId,
    cropId: tile.crop.cropId,
    xpGained,
  });

  if (activeBean) {
    const xpResult = awardFarmXp(activeBean, xpGained);
    nextBeans = state.beans.map((b) => (b.id === activeBean.id ? xpResult.bean : b));
    if (xpResult.leveledUp) {
      events.push({
        type: 'LEVEL_UP',
        beanId: activeBean.id,
        newLevel: xpResult.newLevel,
        newStage: xpResult.newStage,
      });
    }
  }

  return {
    state: {
      ...state,
      lastTickMs: nextLastTickMs,
      island: {
        ...state.island,
        tiles: {
          ...state.island.tiles,
          [tileId]: nextTile,
        },
      },
      beans: nextBeans,
    },
    events,
  };
}

/**
 * Harvests a ripe crop from a Garden Plot, granting Jelly Coins, inventory items, XP,
 * and handling the special 100 Jelly Beans mini-bean fountain & villager sprouting hook.
 */
export function harvestCrop(
  state: GameState,
  tileId: string,
  nowMs?: number,
): DispatchResult {
  const nextLastTickMs = nowMs !== undefined ? Math.max(state.lastTickMs, nowMs) : state.lastTickMs;
  const events: SimEvent[] = [];

  const tile = state.island.tiles[tileId];
  if (!tile || tile.building !== 'garden_plot' || !tile.crop) {
    events.push({
      type: 'ACTION_REJECTED',
      actionType: 'HARVEST_CROP',
      reason: 'No crop growing on this Garden Plot',
    });
    return { state, events };
  }

  const def = getCropDefinition(tile.crop.cropId);
  if (!def) {
    events.push({
      type: 'ACTION_REJECTED',
      actionType: 'HARVEST_CROP',
      reason: `Unknown crop: ${tile.crop.cropId}`,
    });
    return { state, events };
  }

  if (!isCropReadyToHarvest(tile.crop)) {
    const remaining = Math.ceil(getCropRemainingSeconds(tile.crop, state.weather.current));
    events.push({
      type: 'ACTION_REJECTED',
      actionType: 'HARVEST_CROP',
      reason: `${def.name} is still growing (${remaining}s left)`,
    });
    return { state, events };
  }

  const nextInventory = { ...state.inventory };
  if (def.inventoryKey) {
    nextInventory[def.inventoryKey] = nextInventory[def.inventoryKey] + def.itemYield;
  }

  const activeBean = resolveActiveBean(state);
  let nextBeans = state.beans;
  const xpGained = activeBean ? def.harvestXp : 0;
  const levelUpEvents: SimEvent[] = [];

  if (activeBean) {
    const xpResult = awardFarmXp(activeBean, xpGained);
    nextBeans = state.beans.map((b) => (b.id === activeBean.id ? xpResult.bean : b));
    if (xpResult.leveledUp) {
      levelUpEvents.push({
        type: 'LEVEL_UP',
        beanId: activeBean.id,
        newLevel: xpResult.newLevel,
        newStage: xpResult.newStage,
      });
    }
  }

  // Special 100 Jelly Beans harvest hook: first harvest + 15% chance thereafter sprouts
  // a new Villager Jelly Bean when housing capacity allows!
  let nextRngState = state.rngState;
  let sproutedBean: JellyBeanEntity | null = null;
  if (def.id === 'hundred_beans') {
    const capacity = getVillageHousingCapacity(state);
    if (nextBeans.length < capacity) {
      const isFirstHarvest = state.quests.counters.hundredBeansHarvested === 0;
      let shouldSprout = isFirstHarvest;
      if (!shouldSprout) {
        const roll = nextRandom(nextRngState);
        nextRngState = roll.nextState;
        shouldSprout = roll.value < FARM_CONFIG.hundredBeansVillagerChance;
      }
      if (shouldSprout) {
        sproutedBean = createSproutedVillagerBean({ ...state, beans: nextBeans }, tileId);
        nextBeans = [...nextBeans, sproutedBean];
      }
    }
  }

  events.push({
    type: 'CROP_HARVESTED',
    tileId,
    cropId: def.id,
    coinsGained: def.harvestCoins,
    xpGained,
    itemYield: def.itemYield,
    miniBeanBurstCount: def.miniBeanBurstCount,
    sproutedBeanId: sproutedBean ? sproutedBean.id : null,
  });

  if (sproutedBean) {
    events.push({
      type: 'VILLAGER_SPROUTED',
      beanId: sproutedBean.id,
      beanName: sproutedBean.name,
      tileId: sproutedBean.tileId,
    });
  }

  events.push(...levelUpEvents);

  return {
    state: {
      ...state,
      lastTickMs: nextLastTickMs,
      rngState: nextRngState,
      currencies: {
        ...state.currencies,
        jellyCoins: state.currencies.jellyCoins + def.harvestCoins,
      },
      inventory: nextInventory,
      island: {
        ...state.island,
        tiles: {
          ...state.island.tiles,
          [tileId]: {
            ...tile,
            crop: null,
          },
        },
      },
      beans: nextBeans,
    },
    events,
  };
}

/**
 * Harvests 3 crisp Apples from a ripe perennial Apple Tree and starts its 90s regrow timer.
 */
export function harvestAppleTree(
  state: GameState,
  tileId?: string,
  nowMs?: number,
): DispatchResult {
  const nextLastTickMs = nowMs !== undefined ? Math.max(state.lastTickMs, nowMs) : state.lastTickMs;
  const events: SimEvent[] = [];

  const trees = tileId
    ? (() => {
        const tile = state.island.tiles[tileId];
        return tile && tile.building === 'apple_tree' ? [tile] : [];
      })()
    : findBuildingTiles(state, 'apple_tree');

  if (trees.length === 0) {
    events.push({
      type: 'ACTION_REJECTED',
      actionType: 'HARVEST_APPLE_TREE',
      reason: 'Plant an Apple Tree first (80 JC)',
    });
    return { state, events };
  }

  const readyTree = trees.find((tree) => isAppleTreeReady(tree));
  if (!readyTree) {
    const remaining = Math.ceil(trees[0]!.appleRegrowSec ?? 0);
    events.push({
      type: 'ACTION_REJECTED',
      actionType: 'HARVEST_APPLE_TREE',
      reason: `Apples are regrowing (${remaining}s left)`,
    });
    return { state, events };
  }

  const activeBean = resolveActiveBean(state);
  let nextBeans = state.beans;
  const xpGained = activeBean ? FARM_CONFIG.appleTreeHarvestXp : 0;

  events.push({
    type: 'APPLE_TREE_HARVESTED',
    tileId: readyTree.id,
    applesGained: FARM_CONFIG.appleTreeHarvestYield,
    xpGained,
  });

  if (activeBean) {
    const xpResult = awardFarmXp(activeBean, xpGained);
    nextBeans = state.beans.map((b) => (b.id === activeBean.id ? xpResult.bean : b));
    if (xpResult.leveledUp) {
      events.push({
        type: 'LEVEL_UP',
        beanId: activeBean.id,
        newLevel: xpResult.newLevel,
        newStage: xpResult.newStage,
      });
    }
  }

  return {
    state: {
      ...state,
      lastTickMs: nextLastTickMs,
      inventory: {
        ...state.inventory,
        apples: state.inventory.apples + FARM_CONFIG.appleTreeHarvestYield,
      },
      island: {
        ...state.island,
        tiles: {
          ...state.island.tiles,
          [readyTree.id]: {
            ...readyTree,
            appleRegrowSec: FARM_CONFIG.appleTreeRegrowSec,
          },
        },
      },
      beans: nextBeans,
    },
    events,
  };
}

/**
 * Knits 5 gathered Feathers into a Cozy Feather Blanket (with artisan XP & JC bonuses if
 * a Feather Loom is built on the island).
 */
export function knitBlanket(state: GameState, nowMs?: number): DispatchResult {
  const nextLastTickMs = nowMs !== undefined ? Math.max(state.lastTickMs, nowMs) : state.lastTickMs;
  const events: SimEvent[] = [];

  if (state.inventory.feathers < FARM_CONFIG.feathersPerBlanket) {
    const needed = FARM_CONFIG.feathersPerBlanket - state.inventory.feathers;
    events.push({
      type: 'ACTION_REJECTED',
      actionType: 'KNIT_BLANKET',
      reason: `Gather ${needed} more Feather${needed === 1 ? '' : 's'} to knit a Blanket`,
    });
    return { state, events };
  }

  const usedLoom = hasBuilding(state, 'feather_loom');
  const totalBlankets = state.inventory.blankets + 1;
  const coinsGained = usedLoom ? FARM_CONFIG.knitBlanketLoomBonusCoins : 0;

  const activeBean = resolveActiveBean(state);
  let nextBeans = state.beans;
  const xpGained = activeBean
    ? FARM_CONFIG.knitBlanketBaseXp + (usedLoom ? FARM_CONFIG.knitBlanketLoomBonusXp : 0)
    : 0;

  events.push({
    type: 'BLANKET_KNITTED',
    feathersSpent: FARM_CONFIG.feathersPerBlanket,
    totalBlankets,
    usedLoom,
    xpGained,
    coinsGained,
  });

  if (activeBean) {
    const xpResult = awardFarmXp(activeBean, xpGained);
    nextBeans = state.beans.map((b) => (b.id === activeBean.id ? xpResult.bean : b));
    if (xpResult.leveledUp) {
      events.push({
        type: 'LEVEL_UP',
        beanId: activeBean.id,
        newLevel: xpResult.newLevel,
        newStage: xpResult.newStage,
      });
    }
  }

  return {
    state: {
      ...state,
      lastTickMs: nextLastTickMs,
      currencies: {
        ...state.currencies,
        jellyCoins: state.currencies.jellyCoins + coinsGained,
      },
      inventory: {
        ...state.inventory,
        feathers: state.inventory.feathers - FARM_CONFIG.feathersPerBlanket,
        blankets: totalBlankets,
      },
      beans: nextBeans,
    },
    events,
  };
}

/**
 * Advances all planted garden crops and perennial Apple Tree regrow timers by `dtSeconds`.
 * Cozy Rain auto-waters planted crops and grants an exact 2x growth speed multiplier.
 */
export function tickFarmTiles(
  tiles: Record<string, TileState>,
  weather: WeatherType,
  dtSeconds: number,
): FarmTickResult {
  if (!Number.isFinite(dtSeconds) || dtSeconds <= 0) {
    return { tiles, cropsRipened: 0, changed: false };
  }

  let updatedTiles: Record<string, TileState> | null = null;
  let cropsRipened = 0;

  for (const tile of Object.values(tiles)) {
    if (tile.building === 'garden_plot' && tile.crop) {
      const def = getCropDefinition(tile.crop.cropId);
      if (!def) continue;

      const wasRipe = tile.crop.growthSeconds >= def.growTimeSec;
      const nextWatered = weather === 'cozy_rain' ? true : tile.crop.watered;
      const rate = getEffectiveCropGrowthMultiplier(nextWatered, weather);
      const nextGrowthSeconds = wasRipe
        ? tile.crop.growthSeconds
        : Math.min(def.growTimeSec, tile.crop.growthSeconds + dtSeconds * rate);

      if (!wasRipe && nextGrowthSeconds >= def.growTimeSec) {
        cropsRipened += 1;
      }

      if (
        nextWatered !== tile.crop.watered ||
        nextGrowthSeconds !== tile.crop.growthSeconds
      ) {
        if (!updatedTiles) {
          updatedTiles = { ...tiles };
        }
        updatedTiles[tile.id] = {
          ...tile,
          crop: {
            ...tile.crop,
            watered: nextWatered,
            growthSeconds: nextGrowthSeconds,
          },
        };
      }
    } else if (tile.building === 'apple_tree') {
      const prevRegrow = Math.max(0, tile.appleRegrowSec ?? 0);
      if (prevRegrow > 0) {
        const regrowRate =
          weather === 'cozy_rain' ? FARM_CONFIG.cozyRainGrowthMultiplier : 1;
        const nextRegrow = Math.max(0, prevRegrow - dtSeconds * regrowRate);
        if (nextRegrow !== prevRegrow) {
          if (!updatedTiles) {
            updatedTiles = { ...tiles };
          }
          updatedTiles[tile.id] = {
            ...tile,
            appleRegrowSec: nextRegrow,
          };
        }
      }
    }
  }

  return {
    tiles: updatedTiles ?? tiles,
    cropsRipened,
    changed: updatedTiles !== null,
  };
}
