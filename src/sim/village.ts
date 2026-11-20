import { NEED_MAX, NEED_MIN, stageForLevel, xpForLevel } from './constants';
import { clamp, getNeedFloor } from './needs';
import type {
  BuildingType,
  DispatchResult,
  GameState,
  JellyBeanEntity,
  LifeStage,
  SimEvent,
  TileState,
} from './types';

export interface BuildingDefinition {
  type: BuildingType;
  name: string;
  shortDesc: string;
  costJellyCoins: number;
  costBeanBucks: number;
  requiredRing: 0 | 1 | 2 | 3;
  maxCount: number;
  /** True when the building can be placed in the current milestone. */
  buildable: boolean;
  /** Short unlock hint displayed in the Build catalog when not yet buildable. */
  unlockHint?: string;
  modelPath?: string;
  iconPath?: string;
}

export interface HouseUpgradeTier {
  tier: number;
  name: string;
  costJellyCoins: number;
  costBeanBucks: number;
  hearthWarmthBonus: number;
}

/**
 * Balancing parameters for PR-09 village buildings, Toilet Hygiene, and Hamburger Stand income
 * (DESIGN.md §3.1, §3.4, §3.5).
 */
export const VILLAGE_CONFIG = {
  toiletHygieneRestore: 100,
  toiletGoodHabitCoins: 5,
  toiletXp: 12,
  toiletMoodBonus: 6,
  toiletAngerRelief: 8,

  hamburgerStandBaseCoinsPerMin: 15,
  /** +25% tips when Parsley is stocked; +75% when Tomatoes are stocked (2.0x = 30 JC/min with both). */
  hamburgerStandParsleyBoost: 0.25,
  hamburgerStandTomatoBoost: 0.75,
  hamburgerStandMaxPendingCoins: 600,
  hamburgerStandBurgerHungerRestore: 80,
  hamburgerStandBurgerMoodBonus: 8,
  hamburgerStandBurgerAngerRelief: 10,
  hamburgerStandBurgerXp: 20,
  hamburgerStandBurgerCooldownSec: 60,

  buildXpReward: 25,
  houseUpgradeXpReward: 35,
  maxHouseTier: 4,
} as const;

export const STARTER_HOUSE_UPGRADES: readonly HouseUpgradeTier[] = [
  { tier: 2, name: 'Cozy Cottage', costJellyCoins: 120, costBeanBucks: 0, hearthWarmthBonus: 15 },
  { tier: 3, name: 'Candy Villa', costJellyCoins: 260, costBeanBucks: 0, hearthWarmthBonus: 30 },
  {
    tier: 4,
    name: 'Gingerbread Manor',
    costJellyCoins: 480,
    costBeanBucks: 0,
    hearthWarmthBonus: 50,
  },
] as const;

/**
 * Canonical building cost table reflecting both Jelly Coin (JC) and Bean Buck (BB)
 * progression from DESIGN.md §3.5.
 */
export const BUILDING_CATALOG: readonly BuildingDefinition[] = [
  {
    type: 'toilet',
    name: 'Toilet',
    shortDesc: 'Restores 100% Hygiene & grants +5 JC good-habit bonus.',
    costJellyCoins: 60,
    costBeanBucks: 0,
    requiredRing: 0,
    maxCount: 1,
    buildable: true,
    modelPath: 'assets/models/toilet.glb',
    iconPath: 'assets/icons/toilet.png',
  },
  {
    type: 'hamburger_stand',
    name: 'Hamburger Stand',
    shortDesc: 'Earns +15 JC/min passively (2x with Tomatoes & Parsley) + free burgers!',
    costJellyCoins: 140,
    costBeanBucks: 0,
    requiredRing: 0,
    maxCount: 1,
    buildable: true,
    modelPath: 'assets/models/hamburger_stand.glb',
    iconPath: 'assets/icons/hamburger_stand.png',
  },
  {
    type: 'garden_plot',
    name: 'Garden Plot',
    shortDesc: 'Grow Parsley, Tomatoes, Candy Canes & 100 Jelly Beans.',
    costJellyCoins: 30,
    costBeanBucks: 0,
    requiredRing: 0,
    maxCount: 6,
    buildable: false,
    unlockHint: 'Farming unlocks soon',
  },
  {
    type: 'quiet_space_corner',
    name: 'Quiet Space Corner',
    shortDesc: 'Give It Space! Calms anger to 0 & unlocks Ring 1.',
    costJellyCoins: 0,
    costBeanBucks: 14,
    requiredRing: 0,
    maxCount: 1,
    buildable: false,
    unlockHint: 'Ring 1 expansion unlocks soon',
  },
  {
    type: 'kitchen_annex',
    name: 'Kitchen Annex',
    shortDesc: 'Unlocks Kitchen Skills for self-sufficient Jelly Beans.',
    costJellyCoins: 250,
    costBeanBucks: 0,
    requiredRing: 2,
    maxCount: 1,
    buildable: false,
    unlockHint: 'Requires Ring 2',
  },
  {
    type: 'jelly_college',
    name: 'Jelly College',
    shortDesc: 'Enroll Sprout+ beans for degrees, trades & hobbies.',
    costJellyCoins: 350,
    costBeanBucks: 20,
    requiredRing: 2,
    maxCount: 1,
    buildable: false,
    unlockHint: 'Requires Ring 2',
  },
] as const;

const BUILDING_BY_TYPE: Partial<Record<BuildingType, BuildingDefinition>> = Object.fromEntries(
  BUILDING_CATALOG.map((def) => [def.type, def]),
);

function awardXpLocal(
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

function resolveBean(state: GameState, requestedId?: string): JellyBeanEntity | null {
  if (!requestedId) {
    const active = state.beans.find((b) => b.id === state.activeBeanId);
    return active ?? state.beans[0] ?? null;
  }
  return state.beans.find((b) => b.id === requestedId) ?? null;
}

function replaceBean(beans: JellyBeanEntity[], updated: JellyBeanEntity): JellyBeanEntity[] {
  return beans.map((bean) => (bean.id === updated.id ? updated : bean));
}

export function getBuildingDefinition(type: BuildingType): BuildingDefinition | null {
  return BUILDING_BY_TYPE[type] ?? null;
}

export function getBuildingCatalog(): readonly BuildingDefinition[] {
  return BUILDING_CATALOG;
}

export function getHouseUpgradeTier(currentTier: number): HouseUpgradeTier | null {
  const nextTier = Math.max(1, Math.floor(currentTier)) + 1;
  return STARTER_HOUSE_UPGRADES.find((u) => u.tier === nextTier) ?? null;
}

export function getHouseHearthWarmthBonus(state: GameState): number {
  const houseTile = findBuildingTiles(state, 'starter_house')[0];
  const tier = houseTile?.buildingTier ?? 1;
  if (tier <= 1) return 0;
  const spec = STARTER_HOUSE_UPGRADES.find((u) => u.tier === tier);
  return spec?.hearthWarmthBonus ?? 0;
}

export function findBuildingTiles(state: GameState, buildingType: BuildingType): TileState[] {
  return Object.values(state.island.tiles).filter((tile) => tile.building === buildingType);
}

export function countBuildings(state: GameState, buildingType: BuildingType): number {
  return findBuildingTiles(state, buildingType).length;
}

export function hasBuilding(state: GameState, buildingType: BuildingType): boolean {
  return countBuildings(state, buildingType) > 0;
}

export function canAfford(
  state: GameState,
  costJellyCoins: number,
  costBeanBucks = 0,
): boolean {
  return (
    state.currencies.jellyCoins >= Math.max(0, costJellyCoins) &&
    state.currencies.beanBucks >= Math.max(0, costBeanBucks)
  );
}

export function getEmptyBuildTileIds(state: GameState): string[] {
  const holeSet = new Set(state.island.dugHoles);
  return Object.values(state.island.tiles)
    .filter(
      (tile) =>
        tile.ring <= state.island.unlockedRing &&
        tile.building === null &&
        !holeSet.has(tile.id),
    )
    .map((tile) => tile.id);
}

/**
 * Returns the active Jelly Coins/min rate for a Hamburger Stand, factoring in
 * home-grown Parsley (+25%) and Tomatoes (+75% -> 2.0x total with both!).
 */
export function getHamburgerStandRatePerMin(state: GameState): number {
  let multiplier = 1;
  if (state.inventory.parsley > 0) {
    multiplier += VILLAGE_CONFIG.hamburgerStandParsleyBoost;
  }
  if (state.inventory.tomatoes > 0) {
    multiplier += VILLAGE_CONFIG.hamburgerStandTomatoBoost;
  }
  return VILLAGE_CONFIG.hamburgerStandBaseCoinsPerMin * multiplier;
}

export function getTotalPendingStandCoins(state: GameState): number {
  let total = 0;
  for (const tile of findBuildingTiles(state, 'hamburger_stand')) {
    total += Math.floor(tile.pendingCoins ?? 0);
  }
  return total;
}

/**
 * Places a building from the catalog onto an empty, unlocked island tile.
 * Deducts both Jelly Coins and Bean Bucks as required by the building definition.
 */
export function placeBuilding(
  state: GameState,
  buildingType: BuildingType,
  tileId: string,
  nowMs?: number,
): DispatchResult {
  const nextLastTickMs = nowMs !== undefined ? Math.max(state.lastTickMs, nowMs) : state.lastTickMs;
  const events: SimEvent[] = [];

  const def = getBuildingDefinition(buildingType);
  if (!def) {
    events.push({
      type: 'ACTION_REJECTED',
      actionType: 'PLACE_BUILDING',
      reason: `Unknown building type: ${buildingType}`,
    });
    return { state, events };
  }

  if (!def.buildable) {
    events.push({
      type: 'ACTION_REJECTED',
      actionType: 'PLACE_BUILDING',
      reason: def.unlockHint ?? `${def.name} is not unlocked yet`,
    });
    return { state, events };
  }

  if (def.requiredRing > state.island.unlockedRing) {
    events.push({
      type: 'ACTION_REJECTED',
      actionType: 'PLACE_BUILDING',
      reason: `${def.name} requires Ring ${def.requiredRing}`,
    });
    return { state, events };
  }

  if (countBuildings(state, buildingType) >= def.maxCount) {
    events.push({
      type: 'ACTION_REJECTED',
      actionType: 'PLACE_BUILDING',
      reason: `Already built maximum ${def.name} (${def.maxCount})`,
    });
    return { state, events };
  }

  const tile = state.island.tiles[tileId];
  if (!tile) {
    events.push({
      type: 'ACTION_REJECTED',
      actionType: 'PLACE_BUILDING',
      reason: `Tile ${tileId} does not exist`,
    });
    return { state, events };
  }

  if (tile.ring > state.island.unlockedRing) {
    events.push({
      type: 'ACTION_REJECTED',
      actionType: 'PLACE_BUILDING',
      reason: `Tile ${tileId} is on a locked ring`,
    });
    return { state, events };
  }

  if (tile.building !== null) {
    events.push({
      type: 'ACTION_REJECTED',
      actionType: 'PLACE_BUILDING',
      reason: `Tile ${tileId} is already occupied`,
    });
    return { state, events };
  }

  if (state.island.dugHoles.includes(tileId)) {
    events.push({
      type: 'ACTION_REJECTED',
      actionType: 'PLACE_BUILDING',
      reason: `Tile ${tileId} has a dug hole`,
    });
    return { state, events };
  }

  if (!canAfford(state, def.costJellyCoins, def.costBeanBucks)) {
    const missingLabel =
      state.currencies.beanBucks < def.costBeanBucks ? 'Not enough Bean Bucks' : 'Not enough Jelly Coins';
    events.push({
      type: 'ACTION_REJECTED',
      actionType: 'PLACE_BUILDING',
      reason: missingLabel,
    });
    return { state, events };
  }

  const nextTile: TileState = {
    ...tile,
    building: buildingType,
    buildingTier: 1,
    ...(buildingType === 'hamburger_stand' ? { pendingCoins: 0, burgerCooldownSec: 0 } : {}),
  };

  const activeBean = resolveBean(state);
  let nextBeans = state.beans;
  let xpGained = 0;

  if (activeBean) {
    xpGained = VILLAGE_CONFIG.buildXpReward;
    const xpResult = awardXpLocal(activeBean, xpGained);
    nextBeans = replaceBean(state.beans, xpResult.bean);
    events.push({
      type: 'BUILDING_PLACED',
      buildingType,
      tileId,
      coinsSpent: def.costJellyCoins,
      bucksSpent: def.costBeanBucks,
      xpGained,
    });
    if (xpResult.leveledUp) {
      events.push({
        type: 'LEVEL_UP',
        beanId: activeBean.id,
        newLevel: xpResult.newLevel,
        newStage: xpResult.newStage,
      });
    }
  } else {
    events.push({
      type: 'BUILDING_PLACED',
      buildingType,
      tileId,
      coinsSpent: def.costJellyCoins,
      bucksSpent: def.costBeanBucks,
      xpGained: 0,
    });
  }

  return {
    state: {
      ...state,
      lastTickMs: nextLastTickMs,
      currencies: {
        ...state.currencies,
        jellyCoins: state.currencies.jellyCoins - def.costJellyCoins,
        beanBucks: state.currencies.beanBucks - def.costBeanBucks,
      },
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
 * Upgrades the Starter House from Tier 1 up to Tier 4 for Jelly Coins.
 */
export function upgradeHouse(
  state: GameState,
  tileId?: string,
  nowMs?: number,
): DispatchResult {
  const nextLastTickMs = nowMs !== undefined ? Math.max(state.lastTickMs, nowMs) : state.lastTickMs;
  const events: SimEvent[] = [];

  const targetTile = tileId
    ? state.island.tiles[tileId]
    : findBuildingTiles(state, 'starter_house')[0];

  if (!targetTile || targetTile.building !== 'starter_house') {
    events.push({
      type: 'ACTION_REJECTED',
      actionType: 'UPGRADE_HOUSE',
      reason: 'Starter House not found',
    });
    return { state, events };
  }

  const upgrade = getHouseUpgradeTier(targetTile.buildingTier);
  if (!upgrade) {
    events.push({
      type: 'ACTION_REJECTED',
      actionType: 'UPGRADE_HOUSE',
      reason: 'Starter House is already at max tier',
    });
    return { state, events };
  }

  if (!canAfford(state, upgrade.costJellyCoins, upgrade.costBeanBucks)) {
    events.push({
      type: 'ACTION_REJECTED',
      actionType: 'UPGRADE_HOUSE',
      reason: 'Not enough Jelly Coins',
    });
    return { state, events };
  }

  const nextTile: TileState = {
    ...targetTile,
    buildingTier: upgrade.tier,
  };

  const activeBean = resolveBean(state);
  let nextBeans = state.beans;
  const xpGained = activeBean ? VILLAGE_CONFIG.houseUpgradeXpReward : 0;

  events.push({
    type: 'HOUSE_UPGRADED',
    tileId: targetTile.id,
    newTier: upgrade.tier,
    coinsSpent: upgrade.costJellyCoins,
    xpGained,
  });

  if (activeBean) {
    const xpResult = awardXpLocal(activeBean, xpGained);
    nextBeans = replaceBean(state.beans, xpResult.bean);
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
        jellyCoins: state.currencies.jellyCoins - upgrade.costJellyCoins,
        beanBucks: state.currencies.beanBucks - upgrade.costBeanBucks,
      },
      island: {
        ...state.island,
        tiles: {
          ...state.island.tiles,
          [targetTile.id]: nextTile,
        },
      },
      beans: nextBeans,
    },
    events,
  };
}

/**
 * Sends a Jelly Bean to the built Toilet: restores Hygiene to 100%,
 * grants the +5 JC good-habit bonus and XP, and calms anger slightly.
 */
export function useToilet(
  state: GameState,
  beanId?: string,
  nowMs?: number,
): DispatchResult {
  const nextLastTickMs = nowMs !== undefined ? Math.max(state.lastTickMs, nowMs) : state.lastTickMs;
  const events: SimEvent[] = [];

  const target = resolveBean(state, beanId);
  if (!target) {
    events.push({
      type: 'ACTION_REJECTED',
      actionType: 'USE_TOILET',
      reason: 'Bean not found',
    });
    return { state, events };
  }

  const toiletTile = findBuildingTiles(state, 'toilet')[0];
  if (!toiletTile) {
    events.push({
      type: 'ACTION_REJECTED',
      actionType: 'USE_TOILET',
      reason: 'Build a Toilet first (60 JC)',
    });
    return { state, events };
  }

  const floor = getNeedFloor(state.mode);
  const refreshedBean: JellyBeanEntity = {
    ...target,
    isSleeping: false,
    anger: clamp(target.anger - VILLAGE_CONFIG.toiletAngerRelief, NEED_MIN, NEED_MAX),
    needs: {
      ...target.needs,
      hygiene: VILLAGE_CONFIG.toiletHygieneRestore,
      mood: clamp(target.needs.mood + VILLAGE_CONFIG.toiletMoodBonus, floor, NEED_MAX),
    },
  };

  const xpResult = awardXpLocal(refreshedBean, VILLAGE_CONFIG.toiletXp);
  events.push({
    type: 'TOILET_USED',
    beanId: target.id,
    tileId: toiletTile.id,
    xpGained: VILLAGE_CONFIG.toiletXp,
    coinsGained: VILLAGE_CONFIG.toiletGoodHabitCoins,
  });
  if (xpResult.leveledUp) {
    events.push({
      type: 'LEVEL_UP',
      beanId: target.id,
      newLevel: xpResult.newLevel,
      newStage: xpResult.newStage,
    });
  }

  return {
    state: {
      ...state,
      lastTickMs: nextLastTickMs,
      currencies: {
        ...state.currencies,
        jellyCoins: state.currencies.jellyCoins + VILLAGE_CONFIG.toiletGoodHabitCoins,
      },
      beans: replaceBean(state.beans, xpResult.bean),
    },
    events,
  };
}

/**
 * Collects accrued passive Jelly Coins from a Hamburger Stand tile (or all stands if omitted).
 */
export function collectStandIncome(
  state: GameState,
  tileId?: string,
  nowMs?: number,
): DispatchResult {
  const nextLastTickMs = nowMs !== undefined ? Math.max(state.lastTickMs, nowMs) : state.lastTickMs;
  const events: SimEvent[] = [];

  const targetTiles = tileId
    ? (() => {
        const tile = state.island.tiles[tileId];
        return tile && tile.building === 'hamburger_stand' ? [tile] : [];
      })()
    : findBuildingTiles(state, 'hamburger_stand');

  if (targetTiles.length === 0) {
    events.push({
      type: 'ACTION_REJECTED',
      actionType: 'COLLECT_STAND_INCOME',
      reason: 'Hamburger Stand not found',
    });
    return { state, events };
  }

  let totalCollected = 0;
  let primaryTileId = targetTiles[0]!.id;
  const updatedTiles: Record<string, TileState> = { ...state.island.tiles };

  for (const tile of targetTiles) {
    const rawPending = Math.max(0, tile.pendingCoins ?? 0);
    const wholeCoins = Math.floor(rawPending);
    if (wholeCoins > 0) {
      totalCollected += wholeCoins;
      primaryTileId = tile.id;
      updatedTiles[tile.id] = {
        ...tile,
        pendingCoins: rawPending - wholeCoins,
      };
    }
  }

  if (totalCollected <= 0) {
    events.push({
      type: 'ACTION_REJECTED',
      actionType: 'COLLECT_STAND_INCOME',
      reason: 'No Jelly Coins ready to collect yet',
    });
    return { state, events };
  }

  events.push({
    type: 'STAND_INCOME_COLLECTED',
    tileId: primaryTileId,
    coinsCollected: totalCollected,
  });

  return {
    state: {
      ...state,
      lastTickMs: nextLastTickMs,
      currencies: {
        ...state.currencies,
        jellyCoins: state.currencies.jellyCoins + totalCollected,
      },
      island: {
        ...state.island,
        tiles: updatedTiles,
      },
    },
    events,
  };
}

/**
 * Lets the player grab a free Hamburger (+80 Hunger) from their Hamburger Stand.
 */
export function grabFreeBurger(
  state: GameState,
  tileId?: string,
  beanId?: string,
  nowMs?: number,
): DispatchResult {
  const nextLastTickMs = nowMs !== undefined ? Math.max(state.lastTickMs, nowMs) : state.lastTickMs;
  const events: SimEvent[] = [];

  const targetBean = resolveBean(state, beanId);
  if (!targetBean) {
    events.push({
      type: 'ACTION_REJECTED',
      actionType: 'GRAB_FREE_BURGER',
      reason: 'Bean not found',
    });
    return { state, events };
  }

  const stands = tileId
    ? (() => {
        const tile = state.island.tiles[tileId];
        return tile && tile.building === 'hamburger_stand' ? [tile] : [];
      })()
    : findBuildingTiles(state, 'hamburger_stand');

  if (stands.length === 0) {
    events.push({
      type: 'ACTION_REJECTED',
      actionType: 'GRAB_FREE_BURGER',
      reason: 'Open a Hamburger Stand first (140 JC)',
    });
    return { state, events };
  }

  const readyStand = stands.find((tile) => (tile.burgerCooldownSec ?? 0) <= 0);
  if (!readyStand) {
    const remaining = Math.ceil(stands[0]!.burgerCooldownSec ?? 0);
    events.push({
      type: 'ACTION_REJECTED',
      actionType: 'GRAB_FREE_BURGER',
      reason: `Grilling fresh burger (${remaining}s left)`,
    });
    return { state, events };
  }

  const floor = getNeedFloor(state.mode);
  const fedBean: JellyBeanEntity = {
    ...targetBean,
    isSleeping: false,
    anger: clamp(
      targetBean.anger - VILLAGE_CONFIG.hamburgerStandBurgerAngerRelief,
      NEED_MIN,
      NEED_MAX,
    ),
    needs: {
      ...targetBean.needs,
      hunger: clamp(
        targetBean.needs.hunger + VILLAGE_CONFIG.hamburgerStandBurgerHungerRestore,
        floor,
        NEED_MAX,
      ),
      mood: clamp(
        targetBean.needs.mood + VILLAGE_CONFIG.hamburgerStandBurgerMoodBonus,
        floor,
        NEED_MAX,
      ),
    },
  };

  const xpResult = awardXpLocal(fedBean, VILLAGE_CONFIG.hamburgerStandBurgerXp);
  events.push({
    type: 'BURGER_EATEN',
    beanId: targetBean.id,
    tileId: readyStand.id,
    xpGained: VILLAGE_CONFIG.hamburgerStandBurgerXp,
  });
  if (xpResult.leveledUp) {
    events.push({
      type: 'LEVEL_UP',
      beanId: targetBean.id,
      newLevel: xpResult.newLevel,
      newStage: xpResult.newStage,
    });
  }

  return {
    state: {
      ...state,
      lastTickMs: nextLastTickMs,
      island: {
        ...state.island,
        tiles: {
          ...state.island.tiles,
          [readyStand.id]: {
            ...readyStand,
            burgerCooldownSec: VILLAGE_CONFIG.hamburgerStandBurgerCooldownSec,
          },
        },
      },
      beans: replaceBean(state.beans, xpResult.bean),
    },
    events,
  };
}

/**
 * Advances passive village production (Hamburger Stand Jelly Coin accrual & burger cooldowns)
 * cleanly for both active play ticks and offline catch-up steps.
 */
export function tickVillageBuildings(
  state: GameState,
  dtSeconds: number,
): { tiles: Record<string, TileState>; coinsAccrued: number; changed: boolean } {
  if (!Number.isFinite(dtSeconds) || dtSeconds <= 0) {
    return { tiles: state.island.tiles, coinsAccrued: 0, changed: false };
  }

  const stands = findBuildingTiles(state, 'hamburger_stand');
  if (stands.length === 0) {
    return { tiles: state.island.tiles, coinsAccrued: 0, changed: false };
  }

  const coinsPerSec = getHamburgerStandRatePerMin(state) / 60;
  let updatedTiles: Record<string, TileState> | null = null;
  let coinsAccrued = 0;

  for (const tile of stands) {
    const prevPending = Math.max(0, tile.pendingCoins ?? 0);
    const nextPending = Math.min(
      VILLAGE_CONFIG.hamburgerStandMaxPendingCoins,
      prevPending + coinsPerSec * dtSeconds,
    );
    const gained = Math.max(0, nextPending - prevPending);
    coinsAccrued += gained;

    const prevCooldown = Math.max(0, tile.burgerCooldownSec ?? 0);
    const nextCooldown = Math.max(0, prevCooldown - dtSeconds);

    if (nextPending !== prevPending || nextCooldown !== prevCooldown) {
      if (!updatedTiles) {
        updatedTiles = { ...state.island.tiles };
      }
      updatedTiles[tile.id] = {
        ...tile,
        pendingCoins: nextPending,
        burgerCooldownSec: nextCooldown,
      };
    }
  }

  return {
    tiles: updatedTiles ?? state.island.tiles,
    coinsAccrued,
    changed: updatedTiles !== null,
  };
}
